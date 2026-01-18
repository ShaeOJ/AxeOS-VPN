import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs';
import https from 'https';
import { platform, arch } from 'os';

let tunnelProcess: ChildProcess | null = null;
let currentTunnelUrl: string | null = null;
let isStarting = false;

// Get the appropriate cloudflared binary name for the platform
function getCloudflaredBinaryName(): string {
  const os = platform();
  const architecture = arch();

  if (os === 'win32') {
    return 'cloudflared-windows-amd64.exe';
  } else if (os === 'darwin') {
    return architecture === 'arm64' ? 'cloudflared-darwin-arm64' : 'cloudflared-darwin-amd64';
  } else {
    return architecture === 'arm64' ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64';
  }
}

function getCloudflaredDownloadUrl(): string {
  const binaryName = getCloudflaredBinaryName();
  return `https://github.com/cloudflare/cloudflared/releases/latest/download/${binaryName}`;
}

function getCloudflaredPath(): string {
  const userDataPath = app.getPath('userData');
  const binDir = join(userDataPath, 'bin');

  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true });
  }

  const binaryName = platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  return join(binDir, binaryName);
}

async function downloadCloudflared(): Promise<string> {
  const cloudflaredPath = getCloudflaredPath();

  if (existsSync(cloudflaredPath)) {
    return cloudflaredPath;
  }

  console.log('Cloudflare Tunnel: Downloading cloudflared binary...');
  const downloadUrl = getCloudflaredDownloadUrl();

  return new Promise((resolve, reject) => {
    const file = createWriteStream(cloudflaredPath);

    const request = (url: string) => {
      https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            request(redirectUrl);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          // Make executable on Unix
          if (platform() !== 'win32') {
            const { chmodSync } = require('fs');
            chmodSync(cloudflaredPath, 0o755);
          }
          console.log('Cloudflare Tunnel: Download complete');
          resolve(cloudflaredPath);
        });
      }).on('error', (err) => {
        unlinkSync(cloudflaredPath);
        reject(err);
      });
    };

    request(downloadUrl);
  });
}

export async function startTunnel(port: number): Promise<string> {
  if (tunnelProcess) {
    return currentTunnelUrl || '';
  }

  if (isStarting) {
    throw new Error('Tunnel is already starting');
  }

  isStarting = true;

  try {
    const cloudflaredPath = await downloadCloudflared();

    return new Promise((resolve, reject) => {
      // Use 127.0.0.1 instead of localhost to avoid IPv6 issues on Windows
      const args = ['tunnel', '--url', `http://127.0.0.1:${port}`];

      tunnelProcess = spawn(cloudflaredPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          isStarting = false;
          reject(new Error('Tunnel startup timed out'));
        }
      }, 60000);

      const handleOutput = (data: Buffer) => {
        const output = data.toString();
        console.log('Cloudflare Tunnel:', output.trim());

        // Look for the tunnel URL in the output
        const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          currentTunnelUrl = urlMatch[0];
          isStarting = false;
          console.log(`Cloudflare Tunnel: Connected at ${currentTunnelUrl}`);
          resolve(currentTunnelUrl);
        }
      };

      tunnelProcess.stdout?.on('data', handleOutput);
      tunnelProcess.stderr?.on('data', handleOutput);

      tunnelProcess.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          isStarting = false;
          reject(err);
        }
      });

      tunnelProcess.on('exit', (code) => {
        console.log(`Cloudflare Tunnel: Process exited with code ${code}`);
        tunnelProcess = null;
        currentTunnelUrl = null;
        isStarting = false;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`Tunnel process exited with code ${code}`));
        }
      });
    });
  } catch (error) {
    isStarting = false;
    throw error;
  }
}

export function stopTunnel(): void {
  if (tunnelProcess) {
    console.log('Cloudflare Tunnel: Stopping...');
    tunnelProcess.kill();
    tunnelProcess = null;
    currentTunnelUrl = null;
  }
}

export function getTunnelStatus(): { enabled: boolean; url: string | null; isStarting: boolean } {
  return {
    enabled: tunnelProcess !== null,
    url: currentTunnelUrl,
    isStarting,
  };
}

export function getTunnelUrl(): string | null {
  return currentTunnelUrl;
}
