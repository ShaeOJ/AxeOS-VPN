/**
 * Formatting utilities for metrics display
 */

// Hashrate formatting
export function formatHashrate(hashrate: number): string {
  if (hashrate >= 1e15) {
    return `${(hashrate / 1e15).toFixed(2)} PH/s`;
  }
  if (hashrate >= 1e12) {
    return `${(hashrate / 1e12).toFixed(2)} TH/s`;
  }
  if (hashrate >= 1e9) {
    return `${(hashrate / 1e9).toFixed(2)} GH/s`;
  }
  if (hashrate >= 1e6) {
    return `${(hashrate / 1e6).toFixed(2)} MH/s`;
  }
  if (hashrate >= 1e3) {
    return `${(hashrate / 1e3).toFixed(2)} KH/s`;
  }
  return `${hashrate.toFixed(2)} H/s`;
}

// Temperature formatting
export function formatTemperature(celsius: number, unit: 'C' | 'F' = 'C'): string {
  if (unit === 'F') {
    const fahrenheit = (celsius * 9) / 5 + 32;
    return `${fahrenheit.toFixed(1)}°F`;
  }
  return `${celsius.toFixed(1)}°C`;
}

// Power formatting
export function formatPower(watts: number): string {
  if (watts >= 1000) {
    return `${(watts / 1000).toFixed(2)} kW`;
  }
  return `${watts.toFixed(0)} W`;
}

// Efficiency formatting
export function formatEfficiency(hashrate: number, watts: number): string {
  if (watts === 0) return 'N/A';
  const efficiency = hashrate / watts;
  return formatHashrate(efficiency).replace('/s', '/W');
}

// Memory formatting
export function formatMemory(megabytes: number): string {
  if (megabytes >= 1024) {
    return `${(megabytes / 1024).toFixed(1)} GB`;
  }
  return `${megabytes.toFixed(0)} MB`;
}

// Network speed formatting
export function formatNetworkSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1e9) {
    return `${(bytesPerSecond / 1e9).toFixed(2)} GB/s`;
  }
  if (bytesPerSecond >= 1e6) {
    return `${(bytesPerSecond / 1e6).toFixed(2)} MB/s`;
  }
  if (bytesPerSecond >= 1e3) {
    return `${(bytesPerSecond / 1e3).toFixed(2)} KB/s`;
  }
  return `${bytesPerSecond.toFixed(0)} B/s`;
}

// Uptime formatting
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(' ');
}

// Percentage formatting
export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// Difficulty formatting - uses "G" (giga) for 1e9 to match miner firmware output
export function formatDifficulty(diff: number | null | undefined): string {
  if (!diff) return '--';
  if (diff >= 1e12) return `${(diff / 1e12).toFixed(2)}T`;
  if (diff >= 1e9) return `${(diff / 1e9).toFixed(2)}G`;
  if (diff >= 1e6) return `${(diff / 1e6).toFixed(2)}M`;
  if (diff >= 1e3) return `${(diff / 1e3).toFixed(2)}K`;
  return diff.toLocaleString();
}

// Parse difficulty from various formats - handles raw numbers and formatted strings like "56.4M", "18.6G"
export function parseDifficulty(value: unknown): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    // Try to parse formatted strings like "56.4M", "18.6G", "3.31G", "1.2T", "500K"
    const match = value.match(/^([\d.]+)\s*([KMGBT])?$/i);
    if (match) {
      const num = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      const multipliers: Record<string, number> = { K: 1e3, M: 1e6, G: 1e9, B: 1e9, T: 1e12 };
      return num * (multipliers[suffix] || 1);
    }
    // Try plain number string
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

// Relative time formatting
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}
