import { useId } from 'react';

interface MetricGraphProps {
  data: (number | null)[];
  /** Minimum height in px; the graph otherwise fills its parent's height. */
  minHeight?: number;
  strokeWidth?: number;
  /** Show min/max value labels on the axis + a faint baseline grid. */
  showAxis?: boolean;
  /** Format a value for the axis labels. */
  formatValue?: (v: number) => string;
  /** Color comes from the current text color (currentColor). */
  className?: string;
}

// Dependency-free gradient-area graph for the dashboard cards. Fills its parent
// (height + width) so it stretches to fill whatever space the card gives it.
// The SVG uses preserveAspectRatio="none" to stretch — which would distort a
// drawn end-point circle into an ellipse — so the live end-point marker is a
// separate HTML dot positioned by percentage over the graph, kept perfectly
// round and given a fine blink. A unique gradient id per instance keeps
// multiple cards from clobbering each other's <defs>.
export function MetricGraph({
  data,
  minHeight = 80,
  strokeWidth = 2,
  showAxis = false,
  formatValue = (v) => v.toFixed(0),
  className = '',
}: MetricGraphProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `mg-fill-${uid}`;

  const VIEW_W = 100;
  const VIEW_H = 100;

  const points = data
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null && isFinite(p.v));

  if (points.length < 2) {
    return (
      <div
        style={{ minHeight }}
        className={`h-full w-full flex items-center justify-center text-[10px] text-text-secondary/60 ${className}`}
        aria-hidden="true"
      >
        collecting data…
      </div>
    );
  }

  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  const range = max - min || 1;
  const pad = VIEW_H * 0.14;

  // Stretch the present data across the full width so the graph fills edge to
  // edge even when the leading buckets of the window are empty. We normalise x
  // over the range of present indices (keeping relative time spacing) rather
  // than over the full array length.
  const iMin = points[0].i;
  const iMax = points[points.length - 1].i;
  const iSpan = iMax - iMin || 1;
  const x = (i: number) => ((i - iMin) / iSpan) * VIEW_W;
  const y = (v: number) => VIEW_H - pad - ((v - min) / range) * (VIEW_H - 2 * pad);

  const coords = points.map((p) => ({ x: x(p.i), y: y(p.v) }));

  // Smooth line via a Catmull-Rom spline converted to cubic beziers — soft
  // curves instead of sharp corners. The control-point Y is clamped to each
  // segment's own [min,max] so the curve can't bulge past its endpoints: without
  // this the spline overshoots on sharp transitions (a miner starting/stopping
  // sends hashrate 0→high→0) and loops into "squiggles". Clamping keeps the
  // horizontal smoothing while making the line monotone between samples.
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
  const smoothPath = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const loY = Math.min(p1.y, p2.y);
      const hiY = Math.max(p1.y, p2.y);
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = clamp(p1.y + (p2.y - p0.y) / 6, loY, hiY);
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = clamp(p2.y - (p3.y - p1.y) / 6, loY, hiY);
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  };

  const linePath = smoothPath(coords);
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${VIEW_H} L ${coords[0].x.toFixed(2)} ${VIEW_H} Z`;

  // End-point position as percentages of the drawing box (0-100 in both axes).
  const lastXpct = coords[coords.length - 1].x;
  const lastYpct = coords[coords.length - 1].y;

  return (
    <div className={`relative h-full w-full ${className}`} style={{ minHeight }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        style={{ display: 'block', overflow: 'visible' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.38} />
            <stop offset="55%" stopColor="currentColor" stopOpacity={0.12} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>

        {showAxis && (
          <>
            <line x1="0" y1={pad} x2={VIEW_W} y2={pad} stroke="currentColor" strokeWidth={0.4} opacity={0.12} vectorEffect="non-scaling-stroke" />
            <line x1="0" y1={VIEW_H - pad} x2={VIEW_W} y2={VIEW_H - pad} stroke="currentColor" strokeWidth={0.4} opacity={0.12} vectorEffect="non-scaling-stroke" />
          </>
        )}

        <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}
        />
      </svg>

      {/* Live end-point: a fine blinking dot, kept round (HTML, not stretched SVG). */}
      <span
        className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: `${lastXpct}%`, top: `${lastYpct}%` }}
      >
        <span className="block h-1.5 w-1.5 rounded-full bg-current animate-metric-blink" style={{ boxShadow: '0 0 4px currentColor' }} />
      </span>

      {showAxis && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between py-[6px] pr-1 text-right">
          <span className="text-[9px] leading-none font-mono text-text-secondary/70">{formatValue(max)}</span>
          <span className="text-[9px] leading-none font-mono text-text-secondary/70">{formatValue(min)}</span>
        </div>
      )}
    </div>
  );
}
