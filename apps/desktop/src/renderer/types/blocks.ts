// Renderer-local mirror of the block record shape (structurally identical to
// the main/preload BlockRecord). Kept here so renderer .tsx files don't import
// across the preload tsconfig project boundary (which triggers TS6307).
export interface BlockRecord {
  id: string;
  device_id: string | null;
  device_name: string;
  coin: string;
  found_at: number;
  share_diff: number | null;
  network_diff: number | null;
  block_height: number | null;
  reward: number | null;
  fiat_value: number | null;
  fiat_currency: string | null;
  pool_url: string | null;
  source: 'bestdiff' | 'firmware';
  confirmed: number;
  created_at: number;
}
