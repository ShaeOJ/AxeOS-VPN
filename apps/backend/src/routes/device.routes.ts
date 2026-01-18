import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { deviceService } from '../services/device.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody, validateParams } from '../middleware/validation.middleware';
import { isValidDeviceName, isValidPairingCode } from '@axeos-vpn/shared-utils';

const router = Router();

const deviceIdSchema = z.object({
  deviceId: z.string().min(1),
});

const updateDeviceSchema = z.object({
  name: z.string().refine(isValidDeviceName, 'Device name must be 1-50 characters'),
});

const verifyPairingSchema = z.object({
  pairingCode: z.string().refine(isValidPairingCode, 'Invalid pairing code format'),
  deviceName: z.string().refine(isValidDeviceName, 'Device name must be 1-50 characters'),
});

// GET /api/v1/devices
router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = await deviceService.getDevicesByUserId(req.user!.userId);

    res.json({
      success: true,
      data: {
        devices: devices.map((d) => ({
          id: d.id,
          name: d.name,
          lastSeen: d.lastSeen?.toISOString() ?? null,
          isOnline: d.isOnline,
          createdAt: d.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/devices/:deviceId
router.get(
  '/:deviceId',
  authMiddleware,
  validateParams(deviceIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await deviceService.getDeviceById(req.params.deviceId, req.user!.userId);

      if (!device) {
        throw new Error('DEVICE_NOT_FOUND');
      }

      res.json({
        success: true,
        data: {
          id: device.id,
          name: device.name,
          lastSeen: device.lastSeen?.toISOString() ?? null,
          isOnline: device.isOnline,
          createdAt: device.createdAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/devices/pair
router.post('/pair', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, expiresAt } = await deviceService.createPairingCode(req.user!.userId);

    res.json({
      success: true,
      data: {
        pairingCode: code,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/devices/verify
router.post(
  '/verify',
  validateBody(verifyPairingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pairingCode, deviceName } = req.body;
      const result = await deviceService.verifyPairingCode(pairingCode, deviceName);

      res.status(201).json({
        success: true,
        data: {
          deviceId: result.deviceId,
          deviceToken: result.deviceToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/v1/devices/:deviceId
router.patch(
  '/:deviceId',
  authMiddleware,
  validateParams(deviceIdSchema),
  validateBody(updateDeviceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await deviceService.updateDeviceName(
        req.params.deviceId,
        req.user!.userId,
        req.body.name
      );

      res.json({
        success: true,
        data: {
          id: device.id,
          name: device.name,
          lastSeen: device.lastSeen?.toISOString() ?? null,
          isOnline: device.isOnline,
          createdAt: device.createdAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/v1/devices/:deviceId
router.delete(
  '/:deviceId',
  authMiddleware,
  validateParams(deviceIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deviceService.deleteDevice(req.params.deviceId, req.user!.userId);

      res.json({
        success: true,
        data: { message: 'Device deleted successfully' },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/devices/:deviceId/regenerate-token
router.post(
  '/:deviceId/regenerate-token',
  authMiddleware,
  validateParams(deviceIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const newToken = await deviceService.regenerateDeviceToken(
        req.params.deviceId,
        req.user!.userId
      );

      res.json({
        success: true,
        data: { deviceToken: newToken },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as deviceRoutes };
