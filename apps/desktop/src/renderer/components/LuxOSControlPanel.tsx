import { useState, useEffect, useCallback } from 'react';

/**
 * LuxOS Control Panel (Antminer S19/S21 on LuxOS)
 *
 * LuxOS is controlled through the cgminer API on TCP 4028 (not the BitAxe HTTP
 * API), so it gets its own panel: temperature setpoints, tuning profile, fan
 * speed, and power state (sleep/wake/reboot). All writes go through the
 * lux* IPC bridge, which handles the logon/logoff session under the hood.
 */

interface LuxProfile {
  name: string;
  frequency: number;
  hashrate: number;
  voltage: number;
  watts: number;
  isDynamic: boolean;
}

interface LuxState {
  target: number;
  hot: number;
  dangerous: number;
  mode: string;
  fanSpeed: number;
  fanRpm: number;
  fanCount: number;
  currentProfile: string;
  atmEnabled: boolean;
  profiles: LuxProfile[];
}

// cgminer multi-command responses nest each command's payload under its lowercase
// name as an array — parsed[cmd][0][KEY] — with a flat top-level fallback for
// single-command responses. Mirrors the poller's boserSection().
function section(d: Record<string, unknown>, cmd: string, key: string): Record<string, unknown>[] {
  const keyed = d?.[cmd] as Record<string, unknown>[] | undefined;
  if (Array.isArray(keyed) && keyed[0] && Array.isArray(keyed[0][key])) {
    return keyed[0][key] as Record<string, unknown>[];
  }
  if (Array.isArray(d?.[key])) return d[key] as Record<string, unknown>[];
  return [];
}
function first(d: Record<string, unknown>, cmd: string, key: string): Record<string, unknown> {
  return section(d, cmd, key)[0] ?? {};
}
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function parseLuxState(data: unknown): LuxState | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const tc = first(d, 'tempctrl', 'TEMPCTRL');
  const fc = first(d, 'config', 'CONFIG');
  const atm = first(d, 'atm', 'ATM');
  const fansArr = section(d, 'fans', 'FANS');
  const profArr = section(d, 'profiles', 'PROFILES');
  if (tc['Target'] === undefined && !profArr.length) return null;

  const speeds = fansArr.map((f) => num(f['Speed'])).filter((s) => s > 0);
  const rpms = fansArr.map((f) => num(f['RPM']));
  return {
    target: num(tc['Target']),
    hot: num(tc['Hot']),
    dangerous: num(tc['Dangerous']),
    mode: String(tc['Mode'] || 'Automatic'),
    fanSpeed: speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0,
    fanRpm: rpms.length ? Math.max(...rpms) : 0,
    fanCount: fansArr.length,
    currentProfile: String(fc['Profile'] || ''),
    atmEnabled: Boolean(atm['Enabled'] ?? fc['IsAtmEnabled']),
    profiles: profArr.map((p) => ({
      name: String(p['Profile Name'] || ''),
      frequency: num(p['Frequency']),
      hashrate: num(p['Hashrate']),
      voltage: num(p['Voltage']),
      watts: num(p['Watts']),
      isDynamic: Boolean(p['IsDynamic'])
    }))
  };
}

interface Props {
  ipAddress: string;
}

export default function LuxOSControlPanel({ ipAddress }: Props) {
  const [show, setShow] = useState(false);
  const [state, setState] = useState<LuxState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable fields
  const [target, setTarget] = useState<number>(60);
  const [profile, setProfile] = useState<string>('');
  const [fan, setFan] = useState<number>(50);

  const flash = (msg: string, ok: boolean) => {
    if (ok) { setSuccess(msg); setError(null); setTimeout(() => setSuccess(null), 4000); }
    else { setError(msg); setSuccess(null); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.luxGetControlState(ipAddress);
      if (!res.success) { setError(res.error || 'Failed to read miner'); return; }
      const parsed = parseLuxState(res.data);
      if (!parsed) { setError('Unexpected response from miner'); return; }
      setState(parsed);
      setTarget(parsed.target || 60);
      setProfile(parsed.currentProfile || '');
      setFan(parsed.fanSpeed || 50);
    } catch {
      setError('Failed to reach miner');
    } finally {
      setLoading(false);
    }
  }, [ipAddress]);

  useEffect(() => {
    if (show && !state) void load();
  }, [show, state, load]);

  const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) => {
    setBusy(key);
    setError(null);
    setSuccess(null);
    try {
      const res = await fn();
      if (res.success) { flash(okMsg, true); setTimeout(() => void load(), 1500); }
      else flash(res.error || 'Command failed', false);
    } catch {
      flash('Command failed', false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="vault-card p-4">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          <h3 className="text-sm font-bold text-warning uppercase tracking-wider">LuxOS Control</h3>
        </div>
        <button
          onClick={() => setShow(!show)}
          className="text-xs px-3 py-1 rounded bg-warning/20 text-warning border border-warning/30 hover:bg-warning/30 transition-colors"
        >
          {show ? 'Hide Controls' : 'Show Controls'}
        </button>
      </div>

      {show && (
        <div className="space-y-4">
          {error && <div className="p-3 bg-danger/10 border border-danger/30 text-danger text-sm rounded">{error}</div>}
          {success && <div className="p-3 bg-success/10 border border-success/30 text-success text-sm rounded">{success}</div>}

          <div className="p-3 bg-warning/10 border border-warning/30 text-warning text-xs rounded flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Changing the profile raises frequency &amp; voltage together. Watch chip temps — LuxOS trips at {state?.dangerous || 70}&deg;C.</span>
          </div>

          {loading && <div className="text-sm text-text-secondary">Reading miner…</div>}

          {state && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Temperature target */}
                <div className="p-4 bg-bg-primary border border-border rounded">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-text-primary">Target Temperature</span>
                    <span className="text-xs text-text-secondary">mode: {state.mode}</span>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="range" min="45" max="75" step="1" value={target}
                      onChange={(e) => setTarget(parseInt(e.target.value))}
                      className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-warning"
                    />
                    <div className="flex items-center justify-between">
                      <input
                        type="number" min="45" max="75" value={target}
                        onChange={(e) => setTarget(Math.max(45, Math.min(75, parseInt(e.target.value) || 0)))}
                        className="w-16 px-2 py-1 text-sm bg-bg-secondary border border-border rounded text-text-primary text-center"
                      />
                      <span className="text-text-secondary text-xs">&deg;C (hot {state.hot} / trip {state.dangerous})</span>
                      <button
                        onClick={() => run('temp', () => window.electronAPI.luxSetTempControl(ipAddress, target), 'Target temperature set')}
                        disabled={busy === 'temp'}
                        className="px-3 py-1 text-xs bg-warning/20 text-warning border border-warning/30 rounded hover:bg-warning/30 disabled:opacity-50 transition-colors"
                      >
                        {busy === 'temp' ? 'Saving…' : 'Apply'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Fan speed */}
                <div className="p-4 bg-bg-primary border border-border rounded">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-text-primary">Fan Speed</span>
                    <span className="text-xs text-text-secondary">{state.fanCount} fans · {state.fanRpm} RPM</span>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="range" min="0" max="100" step="1" value={fan}
                      onChange={(e) => setFan(parseInt(e.target.value))}
                      className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-border-highlight"
                    />
                    <div className="flex items-center justify-between gap-1">
                      <input
                        type="number" min="0" max="100" value={fan}
                        onChange={(e) => setFan(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                        className="w-14 px-2 py-1 text-sm bg-bg-secondary border border-border rounded text-text-primary text-center"
                      />
                      <span className="text-text-secondary text-xs">%</span>
                      <button
                        onClick={() => run('fanAuto', () => window.electronAPI.luxSetFanSpeed(ipAddress, -1), 'Fans set to automatic')}
                        disabled={busy === 'fanAuto'}
                        className="px-2 py-1 text-xs bg-bg-secondary text-text-secondary border border-border rounded hover:bg-bg-tertiary disabled:opacity-50 transition-colors"
                      >
                        Auto
                      </button>
                      <button
                        onClick={() => run('fan', () => window.electronAPI.luxSetFanSpeed(ipAddress, fan), 'Fan speed set (manual)')}
                        disabled={busy === 'fan'}
                        className="px-3 py-1 text-xs bg-border-highlight/20 text-border-highlight border border-border-highlight/30 rounded hover:bg-border-highlight/30 disabled:opacity-50 transition-colors"
                      >
                        {busy === 'fan' ? 'Saving…' : 'Apply'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tuning profile */}
              <div className="p-4 bg-bg-primary border border-border rounded">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-text-primary">Tuning Profile</span>
                  <span className="text-xs text-text-secondary">
                    current: <span className="text-warning font-medium">{state.currentProfile || '—'}</span>
                    {state.atmEnabled && ' · ATM auto-tuning on'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    className="flex-1 px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary"
                  >
                    {state.profiles.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} — {p.frequency}MHz · {p.hashrate}TH · {p.watts}W{p.isDynamic ? '' : ' (custom)'}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => run('profile', () => window.electronAPI.luxSetProfile(ipAddress, profile), `Profile set to ${profile}`)}
                    disabled={busy === 'profile' || !profile}
                    className="px-3 py-1.5 text-xs bg-warning/20 text-warning border border-warning/30 rounded hover:bg-warning/30 disabled:opacity-50 transition-colors"
                  >
                    {busy === 'profile' ? 'Applying…' : 'Apply'}
                  </button>
                </div>
                {state.atmEnabled && (
                  <p className="mt-2 text-xs text-text-secondary">
                    ATM is auto-tuning; a manual profile applies immediately but ATM may re-adjust within its cap.
                  </p>
                )}
              </div>

              {/* Power state */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => run('wake', () => window.electronAPI.luxCurtail(ipAddress, 'wakeup'), 'Wake sent')}
                  disabled={busy === 'wake'}
                  className="px-3 py-1.5 text-xs bg-success/15 text-success border border-success/30 rounded hover:bg-success/25 disabled:opacity-50 transition-colors"
                >
                  Wake
                </button>
                <button
                  onClick={() => run('sleep', () => window.electronAPI.luxCurtail(ipAddress, 'sleep'), 'Sleep (curtail) sent')}
                  disabled={busy === 'sleep'}
                  className="px-3 py-1.5 text-xs bg-bg-secondary text-text-secondary border border-border rounded hover:bg-bg-tertiary disabled:opacity-50 transition-colors"
                >
                  Sleep
                </button>
                <button
                  onClick={() => run('reboot', () => window.electronAPI.luxReboot(ipAddress, 0), 'Reboot sent')}
                  disabled={busy === 'reboot'}
                  className="px-3 py-1.5 text-xs bg-danger/15 text-danger border border-danger/30 rounded hover:bg-danger/25 disabled:opacity-50 transition-colors"
                >
                  {busy === 'reboot' ? 'Rebooting…' : 'Reboot Board'}
                </button>
                <button
                  onClick={() => void load()}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs bg-bg-secondary text-text-secondary border border-border rounded hover:bg-bg-tertiary disabled:opacity-50 transition-colors ml-auto"
                >
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
