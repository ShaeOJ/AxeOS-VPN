import { createInterface } from 'readline';
import { hostname } from 'os';
import { loadConfig, saveConfig, getDefaultConfig, type AgentConfig } from './config';
import { createLogger } from '@axeos-vpn/shared-utils';

const logger = createLogger('Setup');

const API_BASE_URL = process.env.AXEOS_API_URL || 'http://localhost:3000/api/v1';

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

interface VerifyResponse {
  success: boolean;
  error?: { message: string };
  data?: { deviceId: string; deviceToken: string };
}

async function verifyPairingCode(
  code: string,
  deviceName: string
): Promise<{ deviceId: string; deviceToken: string }> {
  const response = await fetch(`${API_BASE_URL}/devices/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairingCode: code.toUpperCase(),
      deviceName,
    }),
  });

  const data = await response.json() as VerifyResponse;

  if (!data.success || !data.data) {
    throw new Error(data.error?.message || 'Failed to verify pairing code');
  }

  return {
    deviceId: data.data.deviceId,
    deviceToken: data.data.deviceToken,
  };
}

async function main() {
  console.log('\n=================================');
  console.log('   AxeOS Agent Setup Wizard');
  console.log('=================================\n');

  // Check for existing config
  const existingConfig = loadConfig();
  if (existingConfig) {
    console.log('Existing configuration found.');
    const reconfigure = await prompt('Do you want to reconfigure? (y/N): ');
    if (reconfigure.toLowerCase() !== 'y') {
      console.log('Setup cancelled. Using existing configuration.');
      process.exit(0);
    }
  }

  // Get device name
  const defaultName = hostname();
  const deviceName = (await prompt(`Device name [${defaultName}]: `)) || defaultName;

  // Get pairing code
  console.log('\nTo pair this device:');
  console.log('1. Open the AxeOS VPN desktop or mobile app');
  console.log('2. Click "Add Device" on the dashboard');
  console.log('3. Enter the pairing code shown below\n');

  const pairingCode = await prompt('Enter pairing code: ');

  if (!pairingCode) {
    console.error('Error: Pairing code is required');
    process.exit(1);
  }

  // Get server URL
  const defaults = getDefaultConfig();
  const serverUrlInput = await prompt(`Server URL [${defaults.serverUrl}]: `);
  const serverUrl = serverUrlInput || defaults.serverUrl!;

  console.log('\nVerifying pairing code...');

  try {
    const { deviceId, deviceToken } = await verifyPairingCode(pairingCode, deviceName);

    const config: AgentConfig = {
      deviceId,
      deviceToken,
      serverUrl,
      metricsIntervalMs: defaults.metricsIntervalMs!,
    };

    saveConfig(config);

    console.log('\n✓ Device paired successfully!');
    console.log(`  Device ID: ${deviceId}`);
    console.log(`  Device Name: ${deviceName}`);
    console.log('\nYou can now start the agent with: pnpm --filter @axeos-vpn/agent start');
    console.log('Or for development: pnpm --filter @axeos-vpn/agent dev\n');
  } catch (error) {
    console.error('\n✗ Pairing failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Setup failed', error);
  process.exit(1);
});
