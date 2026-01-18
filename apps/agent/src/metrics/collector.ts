import si from 'systeminformation';
import type {
  MetricsSnapshot,
  HashrateMetrics,
  TemperatureMetrics,
  PowerMetrics,
  FanMetrics,
  GpuMetrics,
  SystemMetrics,
} from '@axeos-vpn/shared-types';
import { createLogger } from '@axeos-vpn/shared-utils';

const logger = createLogger('MetricsCollector');

// Simulated mining data (would be replaced with actual miner API integration)
let simulatedHashrate = 100_000_000_000; // 100 GH/s base
let acceptedShares = 0;
let rejectedShares = 0;
let staleShares = 0;

export class MetricsCollector {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  async collect(): Promise<MetricsSnapshot> {
    const [gpuData, _systemData, tempData, memData, cpuLoad, networkStats] = await Promise.all([
      this.collectGpuMetrics(),
      si.system(),
      si.cpuTemperature(),
      si.mem(),
      si.currentLoad(),
      si.networkStats(),
    ]);

    // Simulate share updates
    acceptedShares += Math.floor(Math.random() * 3);
    if (Math.random() < 0.02) rejectedShares++;
    if (Math.random() < 0.01) staleShares++;

    // Calculate totals from GPU data
    const totalHashrate = gpuData.reduce((sum, gpu) => sum + gpu.hashrate, 0);
    const totalPower = gpuData.reduce((sum, gpu) => sum + gpu.power, 0);
    const avgTemp = gpuData.length > 0
      ? gpuData.reduce((sum, gpu) => sum + gpu.temperature, 0) / gpuData.length
      : tempData.main || 0;
    const maxTemp = gpuData.length > 0
      ? Math.max(...gpuData.map((gpu) => gpu.temperature))
      : tempData.max || tempData.main || 0;

    const hashrate: HashrateMetrics = {
      current: totalHashrate,
      average: totalHashrate * (0.95 + Math.random() * 0.1), // Simulated average
      accepted: acceptedShares,
      rejected: rejectedShares,
      stale: staleShares,
    };

    const temperature: TemperatureMetrics = {
      average: avgTemp,
      max: maxTemp,
      hotspots: gpuData.map((gpu, i) => ({
        location: `GPU ${i}`,
        temp: gpu.temperature,
      })),
    };

    const power: PowerMetrics = {
      total: totalPower,
      efficiency: totalPower > 0 ? totalHashrate / totalPower : 0,
      perGpu: gpuData.map((gpu) => gpu.power),
    };

    const fans: FanMetrics[] = gpuData.map((gpu, i) => ({
      id: i,
      speed: Math.floor(gpu.fanSpeed * 30), // Approximate RPM
      percentage: gpu.fanSpeed,
    }));

    const system: SystemMetrics = {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      cpuUsage: cpuLoad.currentLoad,
      memoryUsed: Math.floor(memData.used / 1024 / 1024),
      memoryTotal: Math.floor(memData.total / 1024 / 1024),
      networkRx: networkStats[0]?.rx_sec || 0,
      networkTx: networkStats[0]?.tx_sec || 0,
    };

    return {
      timestamp: Date.now(),
      hashrate,
      temperature,
      power,
      fans,
      gpus: gpuData,
      system,
    };
  }

  private async collectGpuMetrics(): Promise<GpuMetrics[]> {
    try {
      const graphics = await si.graphics();

      if (graphics.controllers.length === 0) {
        // Return simulated GPU data if no GPU detected
        return this.getSimulatedGpuMetrics();
      }

      return graphics.controllers.map((controller, index) => {
        // Add some randomization for realistic simulation
        const baseHashrate = simulatedHashrate / graphics.controllers.length;
        const variance = baseHashrate * 0.05 * (Math.random() - 0.5);

        return {
          id: index,
          name: controller.model || `GPU ${index}`,
          hashrate: baseHashrate + variance,
          temperature: controller.temperatureGpu || 65 + Math.random() * 15,
          fanSpeed: controller.fanSpeed || 60 + Math.random() * 20,
          power: controller.powerDraw || 150 + Math.random() * 50,
          memoryUsed: controller.memoryUsed || 4000 + Math.random() * 2000,
          memoryTotal: controller.memoryTotal || 8192,
          coreClockMhz: controller.clockCore || 1500 + Math.random() * 300,
          memoryClockMhz: controller.clockMemory || 5000 + Math.random() * 500,
        };
      });
    } catch (error) {
      logger.warn('Failed to collect GPU metrics, using simulated data', error);
      return this.getSimulatedGpuMetrics();
    }
  }

  private getSimulatedGpuMetrics(): GpuMetrics[] {
    // Simulated data for testing without actual GPU
    const numGpus = 4;
    return Array.from({ length: numGpus }, (_, i) => ({
      id: i,
      name: `Simulated GPU ${i}`,
      hashrate: simulatedHashrate / numGpus + (Math.random() - 0.5) * 5_000_000_000,
      temperature: 65 + Math.random() * 15,
      fanSpeed: 60 + Math.random() * 20,
      power: 150 + Math.random() * 50,
      memoryUsed: 4000 + Math.random() * 2000,
      memoryTotal: 8192,
      coreClockMhz: 1500 + Math.random() * 300,
      memoryClockMhz: 5000 + Math.random() * 500,
    }));
  }
}

export const metricsCollector = new MetricsCollector();
