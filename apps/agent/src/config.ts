import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface AgentConfig {
  deviceId: string;
  deviceToken: string;
  serverUrl: string;
  metricsIntervalMs: number;
}

const CONFIG_DIR = join(homedir(), '.axeos-agent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function loadConfig(): AgentConfig | null {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return null;
    }

    const data = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data) as AgentConfig;
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
}

export function saveConfig(config: AgentConfig): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save config:', error);
    throw error;
  }
}

export function getDefaultConfig(): Partial<AgentConfig> {
  return {
    serverUrl: process.env.AXEOS_SERVER_URL || 'ws://localhost:3001/ws',
    metricsIntervalMs: parseInt(process.env.AXEOS_METRICS_INTERVAL || '5000', 10),
  };
}
