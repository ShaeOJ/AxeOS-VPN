import { useState, useEffect } from 'react';
import type { BlockRecord } from '../types/blocks';

function formatDifficulty(diff: number | null | undefined): string {
  if (!diff) return '--';
  if (diff >= 1e12) return `${(diff / 1e12).toFixed(2)}T`;
  if (diff >= 1e9) return `${(diff / 1e9).toFixed(2)}B`;
  if (diff >= 1e6) return `${(diff / 1e6).toFixed(2)}M`;
  if (diff >= 1e3) return `${(diff / 1e3).toFixed(2)}K`;
  return diff.toLocaleString();
}

export function BlocksPage() {
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [byCoin, setByCoin] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await window.electronAPI.getBlocks(500, 0);
      setBlocks(res.blocks || []);
      setByCoin(res.byCoin || {});
    } catch (err) {
      console.error('Failed to load blocks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="p-6 space-y-6 animate-page-glitch">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-success uppercase tracking-wider" style={{ textShadow: '0 0 8px var(--color-success)' }}>
            🎉 Blocks Found
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Solo-mined blocks. Detected locally when a share crosses network difficulty — provisional until confirmed on-chain.
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold text-success" style={{ textShadow: '0 0 12px var(--color-success)' }}>
            {blocks.length}
          </div>
          <div className="text-xs text-text-secondary uppercase tracking-wider">Total</div>
        </div>
      </div>

      {Object.keys(byCoin).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(byCoin).map(([coin, n]) => (
            <span key={coin} className="px-3 py-1 rounded-full text-xs bg-accent/15 border border-accent/30 text-accent uppercase">
              {coin}: {n}
            </span>
          ))}
        </div>
      )}

      <div className="vault-card p-4 overflow-x-auto">
        {loading ? (
          <div className="text-text-secondary text-sm">Loading…</div>
        ) : blocks.length === 0 ? (
          <div className="text-text-secondary text-sm py-8 text-center">
            No blocks found yet. When a solo miner's best share crosses the network difficulty, it will appear here.
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-text-secondary uppercase text-xs">
                {['Found', 'Miner', 'Coin', 'Height', 'Share Diff', 'Network Diff', 'Reward', 'Value', 'Source', 'Status'].map((h) => (
                  <th key={h} className="text-left p-2 border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.id} className="border-b border-border/50">
                  <td className="p-2 whitespace-nowrap">{new Date(b.found_at).toLocaleString()}</td>
                  <td className="p-2">{b.device_name}</td>
                  <td className="p-2 uppercase">{b.coin}</td>
                  <td className="p-2">{b.block_height ?? '--'}</td>
                  <td className="p-2">{formatDifficulty(b.share_diff)}</td>
                  <td className="p-2">{formatDifficulty(b.network_diff)}</td>
                  <td className="p-2 whitespace-nowrap">{b.reward != null ? `${b.reward} ${b.coin.toUpperCase()}` : '--'}</td>
                  <td className="p-2">{b.fiat_value != null ? `$${Number(b.fiat_value).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '--'}</td>
                  <td className="p-2">{b.source}</td>
                  <td className="p-2">
                    {b.confirmed
                      ? <span className="text-success">confirmed</span>
                      : <span className="text-warning">provisional</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
