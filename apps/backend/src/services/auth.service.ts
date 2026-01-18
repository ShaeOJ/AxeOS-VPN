import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { generateRandomString } from '@axeos-vpn/shared-utils';
import type { AuthResponse, RefreshTokenResponse } from '@axeos-vpn/shared-types';

export interface JwtPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}

const SALT_ROUNDS = 12;

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiry format: ${expiry}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

export class AuthService {
  async register(email: string, password: string): Promise<AuthResponse> {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('EMAIL_EXISTS');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    // Generate tokens
    return this.generateTokens(user.id, user.email);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Generate tokens
    return this.generateTokens(user.id, user.email);
  }

  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    // Verify the refresh token
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, config.jwtSecret) as JwtPayload;
    } catch {
      throw new Error('INVALID_TOKEN');
    }

    if (payload.type !== 'refresh') {
      throw new Error('INVALID_TOKEN');
    }

    // Check if token exists in database
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new Error('TOKEN_EXPIRED');
    }

    // Delete old refresh token
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    // Get user
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      throw new Error('INVALID_TOKEN');
    }

    // Generate new tokens
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
      if (payload.type !== 'access') {
        throw new Error('INVALID_TOKEN');
      }
      return payload;
    } catch {
      throw new Error('INVALID_TOKEN');
    }
  }

  private async generateTokens(userId: string, email: string): Promise<AuthResponse> {
    const accessExpiryMs = parseExpiry(config.jwtAccessExpiry);
    const refreshExpiryMs = parseExpiry(config.jwtRefreshExpiry);

    const accessToken = jwt.sign(
      { userId, email, type: 'access' } as JwtPayload,
      config.jwtSecret,
      { expiresIn: Math.floor(accessExpiryMs / 1000) }
    );

    const refreshToken = jwt.sign(
      { userId, email, type: 'refresh' } as JwtPayload,
      config.jwtSecret,
      { expiresIn: Math.floor(refreshExpiryMs / 1000) }
    );

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: new Date(Date.now() + refreshExpiryMs),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(accessExpiryMs / 1000),
      user: { id: userId, email },
    };
  }
}

export const authService = new AuthService();
