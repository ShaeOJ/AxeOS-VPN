#!/usr/bin/env node

import { hostname } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import WebSocket from 'ws';
import si from 'systeminformation';
import type { MetricsSnapshot, WebSocketMessage } from '@axeos-vpn/shared-types';

// Configuration
interface Config {
  serverAddress: string;
  deviceId: string;
  deviceToken: string;
}

const CONFIG_DIR = join(homedir(), '.axeos-agent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const METRICS_INTERVAL = 5000; // 5 seconds

// Simulated mining data
let simulatedHashrate = 100_000_000_000; // 100 GH/s
let acceptedShares = 0;
let rejectedShares = 0;
const startTime = Date.now();

// Load or prompt for configuration
async function getConfig(): Promise<Config> {
  if (existsSync(CONFIG_FILE)) {
    const saved = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    console.log(`Loaded config for device: ${saved.deviceId}`);
    return saved;
  }

  console.log('\n=================================');
  console.log('   AxeOS Agent Setup');
  console.log('=================================\n');

  const serverAddress = await prompt('Enter server address (e.g., 192.168.1.100:45678): ');
  const connectionCode = await prompt('Enter connection code from desktop app: ');
  const deviceName = (await prompt(`Device name [${hostname()}]: `)) || hostname();

  // Verify and register with server
  console.log('\nConnecting to server...');

  const response = await fetch(`http://${serverAddress}/api/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: connectionCode.toUpperCase(),
      deviceName,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json() as { error?: string };
    throw new Error(errorData.error || 'Failed to connect');
  }

  const responseData = await response.json() as { deviceId: string; deviceToken: string };
  const { deviceId, deviceToken } = responseData;

  const config: Config = {
    serverAddress,
    deviceId,
    deviceToken,
  };

  // Save config
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

  console.log('\n✓ Device registered successfully!');
  return config;
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function collectMetrics(): Promise<MetricsSnapshot> {
  const [graphics, mem, cpuLoad, netStats] = await Promise.all([
    si.graphics(),
    si.mem(),
    si.currentLoad(),
    si.networkStats(),
  ]);

  // Simulate share updates
  acceptedShares += Math.floor(Math.random() * 3);
  if (Math.random() < 0.02) rejectedShares++;

  // Get GPU data or simulate
  const gpus = graphics.controllers.length > 0
    ? graphics.controllers.map((gpu, i) => ({
        id: i,
        name: gpu.model || `GPU ${i}`,
        hashrate: simulatedHashrate / Math.max(graphics.controllers.length, 1),
        temperature: gpu.temperatureGpu || 65 + Math.random() * 15,
        fanSpeed: gpu.fanSpeed || 60 + Math.random() * 20,
        power: gpu.powerDraw || 150 + Math.random() * 50,
        memoryUsed: gpu.memoryUsed || 4000,
        memoryTotal: gpu.memoryTotal || 8192,
        coreClockMhz: gpu.clockCore || 1500,
        memoryClockMhz: gpu.clockMemory || 5000,
      }))
    : [
        {
          id: 0,
          name: 'Simulated GPU',
          hashrate: simulatedHashrate,
          temperature: 65 + Math.random() * 15,
          fanSpeed: 60 + Math.random() * 20,
          power: 200,
          memoryUsed: 4000,
          memoryTotal: 8192,
          coreClockMhz: 1500,
          memoryClockMhz: 5000,
        },
      ];

  const totalHashrate = gpus.reduce((sum, g) => sum + g.hashrate, 0);
  const totalPower = gpus.reduce((sum, g) => sum + g.power, 0);
  const avgTemp = gpus.reduce((sum, g) => sum + g.temperature, 0) / gpus.length;
  const maxTemp = Math.max(...gpus.map((g) => g.temperature));

  return {
    timestamp: Date.now(),
    hashrate: {
      current: totalHashrate,
      average: totalHashrate * 0.98,
      accepted: acceptedShares,
      rejected: rejectedShares,
      stale: 0,
    },
    temperature: {
      average: avgTemp,
      max: maxTemp,
      hotspots: gpus.map((g, i) => ({ location: `GPU ${i}`, temp: g.temperature })),
    },
    power: {
      total: totalPower,
      efficiency: totalPower > 0 ? totalHashrate / totalPower : 0,
      perGpu: gpus.map((g) => g.power),
    },
    fans: gpus.map((g, i) => ({
      id: i,
      speed: Math.floor(g.fanSpeed * 30),
      percentage: g.fanSpeed,
    })),
    gpus,
    system: {
      uptime: Math.floor((Date.now() - startTime) / 1000),
      cpuUsage: cpuLoad.currentLoad,
      memoryUsed: Math.floor(mem.used / 1024 / 1024),
      memoryTotal: Math.floor(mem.total / 1024 / 1024),
      networkRx: netStats[0]?.rx_sec || 0,
      networkTx: netStats[0]?.tx_sec || 0,
    },
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

async function main() {
  console.log('AxeOS Mining Agent\n');

  const config = await getConfig();

  console.log(`\nConnecting to ${config.serverAddress}...`);

  let ws: WebSocket | null = null;
  let metricsInterval: ReturnType<typeof setInterval> | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let authenticated = false;

  function connect() {
    ws = new WebSocket(`ws://${config.serverAddress}/`);

    ws.on('open', () => {
      console.log('Connected to server');
      authenticate();
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        handleMessage(message);
      } catch (e) {
        console.error('Failed to parse message');
      }
    });

    ws.on('close', () => {
      console.log('Disconnected from server');
      authenticated = false;
      stopMetrics();
      scheduleReconnect();
    });

    ws.on('error', (error) => {
      console.error('Connection error:', error.message);
    });
  }

  function authenticate() {
    send({
      type: 'authenticate',
      timestamp: Date.now(),
      messageId: generateId(),
      payload: {
        token: config.deviceToken,
        clientType: 'agent',
        deviceId: config.deviceId,
      },
    });
  }

  function handleMessage(message: WebSocketMessage) {
    switch (message.type) {
      case 'authenticated':
        const authPayload = (message as any).payload;
        if (authPayload.success) {
          console.log('Authenticated successfully');
          authenticated = true;
          startMetrics();
        } else {
          console.error('Authentication failed:', authPayload.error);
          console.log('\nTry deleting the config file and running setup again:');
          console.log(`  rm ${CONFIG_FILE}`);
          process.exit(1);
        }
        break;

      case 'heartbeat_ack':
        // Server is alive
        break;
    }
  }

  function send(message: WebSocketMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function startMetrics() {
    if (metricsInterval) return;

    console.log('Starting metrics streaming...');

    const sendMetrics = async () => {
      if (!authenticated) return;

      try {
        const metrics = await collectMetrics();
        send({
          type: 'metrics_update',
          timestamp: Date.now(),
          messageId: generateId(),
          payload: {
            deviceId: config.deviceId,
            metrics,
          },
        });
      } catch (error) {
        console.error('Failed to collect metrics:', error);
      }
    };

    sendMetrics();
    metricsInterval = setInterval(sendMetrics, METRICS_INTERVAL);
  }

  function stopMetrics() {
    if (metricsInterval) {
      clearInterval(metricsInterval);
      metricsInterval = null;
    }
  }

  function scheduleReconnect() {
    if (reconnectTimeout) return;

    console.log('Reconnecting in 5 seconds...');
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, 5000);
  }

  // Start connection
  connect();

  // Heartbeat
  setInterval(() => {
    if (authenticated) {
      send({
        type: 'heartbeat',
        timestamp: Date.now(),
        messageId: generateId(),
        payload: { clientType: 'agent' },
      });
    }
  }, 30000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    stopMetrics();
    ws?.close();
    process.exit(0);
  });

  console.log('\nAgent running. Press Ctrl+C to stop.\n');
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
