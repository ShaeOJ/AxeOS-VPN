import { prisma } from '../lib/prisma';
import { generatePairingCode, generateDeviceToken } from '@axeos-vpn/shared-utils';
import type { Device, PairingCode } from '@prisma/client';

const PAIRING_CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export class DeviceService {
  async getDevicesByUserId(userId: string): Promise<Device[]> {
    return prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDeviceById(deviceId: string, userId: string): Promise<Device | null> {
    return prisma.device.findFirst({
      where: { id: deviceId, userId },
    });
  }

  async getDeviceByToken(deviceToken: string): Promise<Device | null> {
    return prisma.device.findUnique({
      where: { deviceToken },
    });
  }

  async createPairingCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
    // Clean up any existing pairing codes for this user
    await prisma.pairingCode.deleteMany({
      where: {
        userId,
        usedAt: null,
      },
    });

    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_EXPIRY_MS);

    await prisma.pairingCode.create({
      data: {
        code,
        userId,
        expiresAt,
      },
    });

    return { code, expiresAt };
  }

  async verifyPairingCode(
    code: string,
    deviceName: string
  ): Promise<{ deviceId: string; deviceToken: string; userId: string }> {
    const pairingCode = await prisma.pairingCode.findUnique({
      where: { code },
    });

    if (!pairingCode) {
      throw new Error('PAIRING_CODE_INVALID');
    }

    if (pairingCode.usedAt) {
      throw new Error('PAIRING_CODE_INVALID');
    }

    if (pairingCode.expiresAt < new Date()) {
      throw new Error('PAIRING_CODE_EXPIRED');
    }

    // Create the device
    const deviceToken = generateDeviceToken();
    const device = await prisma.device.create({
      data: {
        name: deviceName,
        deviceToken,
        userId: pairingCode.userId,
      },
    });

    // Mark pairing code as used
    await prisma.pairingCode.update({
      where: { id: pairingCode.id },
      data: {
        usedAt: new Date(),
        deviceId: device.id,
      },
    });

    return {
      deviceId: device.id,
      deviceToken,
      userId: pairingCode.userId,
    };
  }

  async updateDeviceName(deviceId: string, userId: string, name: string): Promise<Device> {
    const device = await this.getDeviceById(deviceId, userId);
    if (!device) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    return prisma.device.update({
      where: { id: deviceId },
      data: { name },
    });
  }

  async deleteDevice(deviceId: string, userId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId, userId);
    if (!device) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    await prisma.device.delete({
      where: { id: deviceId },
    });
  }

  async updateDeviceStatus(deviceId: string, isOnline: boolean): Promise<void> {
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        isOnline,
        lastSeen: isOnline ? new Date() : undefined,
      },
    });
  }

  async regenerateDeviceToken(deviceId: string, userId: string): Promise<string> {
    const device = await this.getDeviceById(deviceId, userId);
    if (!device) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    const newToken = generateDeviceToken();
    await prisma.device.update({
      where: { id: deviceId },
      data: { deviceToken: newToken },
    });

    return newToken;
  }
}

export const deviceService = new DeviceService();
