/**
 * Security helpers for the embedded web server.
 *
 * This app is a LAN miner monitor, so device targets are legitimately private
 * IPs (10.x / 172.16-31.x / 192.168.x). We therefore CANNOT block private
 * ranges (that would break the whole app). Instead we enforce strict host
 * formatting to kill URL-injection/SSRF vectors and block link-local metadata
 * endpoints (e.g. 169.254.169.254) that no real miner uses.
 */

/**
 * Validate that a user-supplied device host is a bare IPv4 (optionally with a
 * port) or a simple hostname — with no scheme, path, credentials, or other
 * characters that could be smuggled into `http://${host}/...`.
 * Returns true only for safe values.
 */
export function isValidDeviceHost(host: unknown): host is string {
  if (typeof host !== 'string') return false;
  const trimmed = host.trim();
  if (!trimmed || trimmed.length > 255) return false;

  // Reject anything that could break out of the URL host position.
  // (scheme separators, path, query, fragment, userinfo, whitespace, brackets)
  if (/[/\\?#@\s[\]]/.test(trimmed)) return false;

  // Split optional :port
  const portMatch = trimmed.match(/^(.*?)(?::(\d{1,5}))?$/);
  if (!portMatch) return false;
  const hostPart = portMatch[1];
  const portPart = portMatch[2];
  if (portPart !== undefined) {
    const p = Number(portPart);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return false;
  }

  // IPv4?
  const octets = hostPart.split('.');
  if (octets.length === 4 && octets.every((o) => /^\d{1,3}$/.test(o))) {
    const nums = octets.map(Number);
    if (nums.some((n) => n > 255)) return false;
    // Block link-local (169.254/16) — includes cloud metadata (169.254.169.254).
    if (nums[0] === 169 && nums[1] === 254) return false;
    // Block multicast/reserved (224+.x.x.x) and 0.x.
    if (nums[0] === 0 || nums[0] >= 224) return false;
    return true;
  }

  // Otherwise require a plain DNS hostname (letters/digits/hyphen/dot).
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(hostPart)) {
    return true;
  }

  return false;
}

/**
 * Conservative server-side sanity bounds for miner control. These are NOT
 * fine-tuning limits (AxeOS enforces its own) — they exist to reject garbage or
 * dangerous values before they reach hardware.
 */
export const HARDWARE_LIMITS = {
  frequencyMHz: { min: 50, max: 1200 },
  coreVoltageMv: { min: 800, max: 1600 },
  fanSpeedPct: { min: 0, max: 100 },
};

/** Returns the value if finite and within [min, max], else null. */
export function validateInRange(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * Minimal in-memory per-key rate limiter (no external dependency). Used to
 * throttle password attempts on login/setup. Not distributed — fine for a
 * single-process Electron server.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the key is allowed (and records the attempt). */
  check(key: string, nowMs: number): boolean {
    const recent = (this.hits.get(key) || []).filter((t) => nowMs - t < this.windowMs);
    if (recent.length >= this.maxAttempts) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    return true;
  }
}
