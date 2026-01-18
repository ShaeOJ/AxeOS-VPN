import type { Request, Response, NextFunction } from 'express';
import { authService, type JwtPayload } from '../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'No token provided' },
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = authService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
    });
  }
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = authService.verifyAccessToken(token);
      req.user = payload;
    } catch {
      // Token invalid, but that's okay for optional auth
    }
  }

  next();
}
