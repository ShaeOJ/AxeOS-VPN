import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { metricsService } from '../services/metrics.service';
import { deviceService } from '../services/device.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateParams, validateQuery } from '../middleware/validation.middleware';

const router = Router();

const deviceIdSchema = z.object({
  deviceId: z.string().min(1),
});

const metricsQuerySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(1000).optional(),
});

// GET /api/v1/metrics/:deviceId
router.get(
  '/:deviceId',
  authMiddleware,
  validateParams(deviceIdSchema),
  validateQuery(metricsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verify user owns this device
      const device = await deviceService.getDeviceById(req.params.deviceId, req.user!.userId);
      if (!device) {
        throw new Error('DEVICE_NOT_FOUND');
      }

      const { startTime, endTime, limit } = req.query as {
        startTime?: string;
        endTime?: string;
        limit?: number;
      };

      const metrics = await metricsService.getMetrics({
        deviceId: req.params.deviceId,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        limit,
      });

      res.json({
        success: true,
        data: {
          deviceId: req.params.deviceId,
          metrics: metrics.map((m) => ({
            timestamp: m.timestamp.toISOString(),
            hashrate: m.hashrate,
            temperature: m.temperature,
            power: m.power,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/metrics/:deviceId/latest
router.get(
  '/:deviceId/latest',
  authMiddleware,
  validateParams(deviceIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verify user owns this device
      const device = await deviceService.getDeviceById(req.params.deviceId, req.user!.userId);
      if (!device) {
        throw new Error('DEVICE_NOT_FOUND');
      }

      const latest = await metricsService.getLatestMetrics(req.params.deviceId);

      if (!latest) {
        res.json({
          success: true,
          data: null,
        });
        return;
      }

      res.json({
        success: true,
        data: {
          timestamp: latest.timestamp.toISOString(),
          hashrate: latest.hashrate,
          temperature: latest.temperature,
          power: latest.power,
          fullMetrics: latest.data,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/metrics/:deviceId/aggregated
router.get(
  '/:deviceId/aggregated',
  authMiddleware,
  validateParams(deviceIdSchema),
  validateQuery(
    z.object({
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
    })
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verify user owns this device
      const device = await deviceService.getDeviceById(req.params.deviceId, req.user!.userId);
      if (!device) {
        throw new Error('DEVICE_NOT_FOUND');
      }

      const { startTime, endTime } = req.query as {
        startTime: string;
        endTime: string;
      };

      const aggregated = await metricsService.getAggregatedMetrics(
        req.params.deviceId,
        new Date(startTime),
        new Date(endTime)
      );

      res.json({
        success: true,
        data: {
          deviceId: req.params.deviceId,
          startTime,
          endTime,
          aggregations: aggregated,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as metricsRoutes };
