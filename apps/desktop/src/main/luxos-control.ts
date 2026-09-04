/**
 * LuxOS Control Module
 *
 * Write/control support for Antminer S19/S21 running LuxOS (LUXminer), which
 * exposes the cgminer-style JSON API on TCP 4028 rather than the BitAxe HTTP
 * API. Privileged commands require a session obtained via `logon` and released
 * via `logoff`; LuxOS permits a single privileged session at a time, so every
 * write is wrapped so the session is always dropped afterwards.
 *
 * Command signatures verified live against LUXminer 2026.8.11 on an S19j Pro
 * (the firmware validates positionally and names the first missing arg):
 *   logon                                            -> { SESSION:[{ SessionID }] }
 *   logoff       session_id
 *   fanset       session_id, speed[, min_fans]        speed 0-100, -1 = automatic
 *   profileset   session_id, profile_name             e.g. "270MHz", "default"
 *   tempctrlset  session_id, target[, hot, dangerous] board target temperature C
 *   curtail      session_id, sleep | wakeup           pause / resume hashing
 *   reboot       session_id, board_id                 board 0 on single-board S19
 *   atmset       session_id, key=value ...            auto-tuning (ATM) config
 *   addpool      session_id, url, user, pass
 *   switchpool   session_id, pool_id
 */
import net from 'net';

export interface LuxResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

const API_PORT = 4028;
const TIMEOUT_MS = 10000;

/** Raw cgminer/LUXminer call. Sends {command,parameter?} and returns parsed JSON. */
function luxRaw(
  ipAddress: string,
  command: string,
  parameter?: string,
  timeoutMs: number = TIMEOUT_MS
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = '';
    let settled = false;
    let idleTimer: NodeJS.Timeout | undefined;

    const hardTimer = setTimeout(() => finish(), timeoutMs - 500);
    const cleanup = () => {
      clearTimeout(hardTimer);
      if (idleTimer) clearTimeout(idleTimer);
      socket.destroy();
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const cleaned = data.replace(/\0/g, '').trim();
      if (!cleaned) {
        reject(new Error('empty response from miner'));
        return;
      }
      try {
        resolve(JSON.parse(cleaned) as Record<string, unknown>);
      } catch {
        reject(new Error('could not parse miner response'));
      }
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    socket.setTimeout(timeoutMs);
    socket.connect(API_PORT, ipAddress, () => {
      const payload = parameter !== undefined ? { command, parameter } : { command };
      socket.write(JSON.stringify(payload) + '\n');
    });
    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, 400);
    });
    socket.on('end', finish);
    socket.on('timeout', () => fail(new Error('miner TCP timeout')));
    socket.on('error', fail);
  });
}

/** Pull the STATUS array's first entry (cgminer responses always carry one). */
function statusOf(resp: Record<string, unknown>): { code: number; msg: string; ok: boolean } {
  const arr = resp['STATUS'];
  const s = Array.isArray(arr) ? (arr[0] as Record<string, unknown>) : undefined;
  const letter = String(s?.['STATUS'] ?? '');
  return {
    code: Number(s?.['Code'] ?? -1),
    msg: String(s?.['Msg'] ?? 'unknown response'),
    // cgminer uses "S" (success) / "I" (info) for OK, "E"/"F"/"W" for problems.
    ok: letter === 'S' || letter === 'I'
  };
}

/** logon -> SessionID, or throw with the miner's reason. */
async function logon(ipAddress: string): Promise<string> {
  const resp = await luxRaw(ipAddress, 'logon');
  const sess = resp['SESSION'];
  const sid = Array.isArray(sess) ? (sess[0] as Record<string, unknown>)?.['SessionID'] : undefined;
  if (typeof sid === 'string' && sid) return sid;
  const st = statusOf(resp);
  // A held session (someone else logged on, or a stale one) surfaces here.
  throw new Error(st.msg || 'could not obtain a control session');
}

async function logoff(ipAddress: string, sessionId: string): Promise<void> {
  try {
    await luxRaw(ipAddress, 'logoff', sessionId, 4000);
  } catch {
    /* best-effort: session also expires on its own */
  }
}

/**
 * Run a privileged command inside a logon/logoff session. The session is always
 * released, even if the command fails. `param` is prefixed with the session id.
 */
async function withSession(
  ipAddress: string,
  command: string,
  args: (string | number)[]
): Promise<LuxResponse> {
  let sid: string;
  try {
    sid = await logon(ipAddress);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'logon failed' };
  }
  try {
    const parameter = [sid, ...args.map(String)].join(',');
    const resp = await luxRaw(ipAddress, command, parameter);
    const st = statusOf(resp);
    if (!st.ok) return { success: false, error: `${st.msg} (code ${st.code})` };
    return { success: true, data: resp };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'command failed' };
  } finally {
    await logoff(ipAddress, sid);
  }
}

// ---- Read helpers (no session required) --------------------------------------

/** Fetch temp-control setpoints, fan state and available profiles for the UI. */
export async function getLuxControlState(ipAddress: string): Promise<LuxResponse> {
  try {
    const resp = await luxRaw(ipAddress, 'tempctrl+fans+profiles+config+atm');
    return { success: true, data: resp };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'read failed' };
  }
}

// cgminer multi-command responses nest each payload under its lowercase command
// name as an array (parsed[cmd][0][KEY]); single-command responses put KEY at the
// top level. This resolves either shape.
function sectionArr(d: Record<string, unknown>, cmd: string, key: string): Record<string, unknown>[] {
  const keyed = d?.[cmd] as Record<string, unknown>[] | undefined;
  if (Array.isArray(keyed) && keyed[0] && Array.isArray(keyed[0][key])) {
    return keyed[0][key] as Record<string, unknown>[];
  }
  if (Array.isArray(d?.[key])) return d[key] as Record<string, unknown>[];
  return [];
}
const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export interface LuxProfileSummary {
  name: string;
  frequency: number;
  hashrate: number;
  voltage: number;
  watts: number;
  isDynamic: boolean;
}
export interface LuxControlSummary {
  target: number;
  hot: number;
  dangerous: number;
  mode: string;
  fanSpeed: number;
  fanRpm: number;
  fanCount: number;
  currentProfile: string;
  atmEnabled: boolean;
  profiles: LuxProfileSummary[];
}

/** Parse a tempctrl+fans+profiles+config+atm response into a clean UI summary. */
export function parseLuxControlState(data: unknown): LuxControlSummary | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const tc = sectionArr(d, 'tempctrl', 'TEMPCTRL')[0] ?? {};
  const fc = sectionArr(d, 'config', 'CONFIG')[0] ?? {};
  const atm = sectionArr(d, 'atm', 'ATM')[0] ?? {};
  const fans = sectionArr(d, 'fans', 'FANS');
  const profs = sectionArr(d, 'profiles', 'PROFILES');
  if (tc['Target'] === undefined && !profs.length) return null;
  const speeds = fans.map((f) => n(f['Speed'])).filter((s) => s > 0);
  const rpms = fans.map((f) => n(f['RPM']));
  return {
    target: n(tc['Target']),
    hot: n(tc['Hot']),
    dangerous: n(tc['Dangerous']),
    mode: String(tc['Mode'] || 'Automatic'),
    fanSpeed: speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0,
    fanRpm: rpms.length ? Math.max(...rpms) : 0,
    fanCount: fans.length,
    currentProfile: String(fc['Profile'] || ''),
    atmEnabled: Boolean(atm['Enabled'] ?? fc['IsAtmEnabled']),
    profiles: profs.map((p) => ({
      name: String(p['Profile Name'] || ''),
      frequency: n(p['Frequency']),
      hashrate: n(p['Hashrate']),
      voltage: n(p['Voltage']),
      watts: n(p['Watts']),
      isDynamic: Boolean(p['IsDynamic'])
    }))
  };
}

/** Read + parse LuxOS control state into a clean summary (for the web dashboard). */
export async function getLuxControlSummary(ipAddress: string): Promise<LuxResponse> {
  const raw = await getLuxControlState(ipAddress);
  if (!raw.success) return raw;
  const parsed = parseLuxControlState(raw.data);
  if (!parsed) return { success: false, error: 'Unexpected response from miner' };
  return { success: true, data: parsed };
}

// ---- Write commands ----------------------------------------------------------

/**
 * Set fan speed. `speed` 0-100 forces manual; pass a negative value (-1) to
 * hand control back to the automatic temperature-driven curve.
 */
export async function luxSetFanSpeed(ipAddress: string, speed: number): Promise<LuxResponse> {
  if (!Number.isFinite(speed)) return { success: false, error: 'Invalid fan speed' };
  const s = speed < 0 ? -1 : Math.round(Math.max(0, Math.min(100, speed)));
  return withSession(ipAddress, 'fanset', [s]);
}

/** Apply a named tuning profile (e.g. "270MHz", "default", or a custom name). */
export async function luxSetProfile(ipAddress: string, profileName: string): Promise<LuxResponse> {
  const name = String(profileName || '').trim();
  if (!name) return { success: false, error: 'Missing profile name' };
  return withSession(ipAddress, 'profileset', [name]);
}

/**
 * Set the board temperature-control setpoints (the /config/temperature page).
 * `hot` and `dangerous` are optional; when omitted only the target is changed.
 */
export async function luxSetTempControl(
  ipAddress: string,
  target: number,
  hot?: number,
  dangerous?: number
): Promise<LuxResponse> {
  if (!Number.isFinite(target)) return { success: false, error: 'Invalid target temperature' };
  const args: number[] = [Math.round(target)];
  if (Number.isFinite(hot as number)) args.push(Math.round(hot as number));
  if (Number.isFinite(dangerous as number)) args.push(Math.round(dangerous as number));
  return withSession(ipAddress, 'tempctrlset', args);
}

/** Pause hashing (sleep) or resume it (wakeup). */
export async function luxCurtail(ipAddress: string, mode: 'sleep' | 'wakeup'): Promise<LuxResponse> {
  return withSession(ipAddress, 'curtail', [mode]);
}

/** Reboot a hashboard (board 0 = the single board on an S19j Pro). */
export async function luxReboot(ipAddress: string, boardId: number = 0): Promise<LuxResponse> {
  return withSession(ipAddress, 'reboot', [Math.max(0, Math.round(boardId))]);
}

/** Enable or disable ATM (auto-tuning). Optionally cap the max profile. */
export async function luxSetAtm(
  ipAddress: string,
  enabled: boolean,
  maxProfile?: string
): Promise<LuxResponse> {
  const args: string[] = [`enabled=${enabled ? 'true' : 'false'}`];
  if (maxProfile && maxProfile.trim()) args.push(`maxprofile=${maxProfile.trim()}`);
  return withSession(ipAddress, 'atmset', args);
}

/**
 * Point the miner at a new pool: add it, then switch to it. LuxOS keeps existing
 * pools; the newly added pool becomes active. `poolIndex` after add is returned
 * by the miner, but switchpool by URL isn't supported, so we add then switch to
 * the highest pool id (the one we just added).
 */
export async function luxSetPool(
  ipAddress: string,
  url: string,
  user: string,
  pass: string
): Promise<LuxResponse> {
  const addRes = await withSession(ipAddress, 'addpool', [url, user, pass || 'x']);
  if (!addRes.success) return addRes;
  // Find the id of the pool we just added (the max POOL id) and switch to it.
  try {
    const poolsResp = await luxRaw(ipAddress, 'pools');
    const pools = poolsResp['POOLS'];
    let maxId = -1;
    if (Array.isArray(pools)) {
      for (const p of pools) {
        const id = Number((p as Record<string, unknown>)['POOL']);
        if (Number.isFinite(id) && id > maxId) maxId = id;
      }
    }
    if (maxId < 0) return { success: true, data: addRes.data }; // added, switch unknown
    return withSession(ipAddress, 'switchpool', [maxId]);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'pool switch failed' };
  }
}
