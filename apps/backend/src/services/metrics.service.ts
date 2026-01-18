import { prisma } from '../lib/prisma';
import type { MetricsSnapshot } from '@axeos-vpn/shared-types';
import type { MetricSnapshot } from '@prisma/client';

export interface MetricsQuery {
  deviceId: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

export class MetricsService {
  async saveMetrics(deviceId: string, metrics: MetricsSnapshot): Promise<MetricSnapshot> {
    return prisma.metricSnapshot.create({
      data: {
        deviceId,
        timestamp: new Date(metrics.timestamp),
        hashrate: metrics.hashrate.current,
        temperature: metrics.temperature.average,
        power: metrics.power.total,
        data: JSON.parse(JSON.stringify(metrics)),
      },
    });
  }

  async getMetrics(query: MetricsQuery): Promise<MetricSnapshot[]> {
    const where: Record<string, unknown> = {
      deviceId: query.deviceId,
    };

    if (query.startTime || query.endTime) {
      where.timestamp = {};
      if (query.startTime) {
        (where.timestamp as Record<string, Date>).gte = query.startTime;
      }
      if (query.endTime) {
        (where.timestamp as Record<string, Date>).lte = query.endTime;
      }
    }

    return prisma.metricSnapshot.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: query.limit ?? 100,
    });
  }

  async getLatestMetrics(deviceId: string): Promise<MetricSnapshot | null> {
    return prisma.metricSnapshot.findFirst({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async getAggregatedMetrics(
    deviceId: string,
    startTime: Date,
    endTime: Date
  ): Promise<{
    avgHashrate: number;
    maxTemperature: number;
    avgPower: number;
    dataPoints: number;
  }> {
    const result = await prisma.metricSnapshot.aggregate({
      where: {
        deviceId,
        timestamp: {
          gte: startTime,
          lte: endTime,
        },
      },
      _avg: {
        hashrate: true,
        power: true,
      },
      _max: {
        temperature: true,
      },
      _count: true,
    });

    return {
      avgHashrate: result._avg.hashrate ?? 0,
      maxTemperature: result._max.temperature ?? 0,
      avgPower: result._avg.power ?? 0,
      dataPoints: result._count,
    };
  }

  async cleanupOldMetrics(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.metricSnapshot.deleteMany({
      where: {
        timestamp: { lt: cutoffDate },
      },
    });

    return result.count;
  }
}

export const metricsService = new MetricsService();
