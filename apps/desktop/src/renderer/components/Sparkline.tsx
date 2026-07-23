interface SparklineProps {
  data: (number | null)[];
  /** SVG height in px; width fills the container. */
  height?: number;
  /** Draw a soft filled area under the line. */
  filled?: boolean;
  strokeWidth?: number;
  /** Color comes from the current text color (currentColor). */
  className?: string;
}

// Dependency-free inline SVG sparkline. Uses a fixed viewBox with
// preserveAspectRatio="none" so it stretches to whatever tile it sits in.
// Gaps (null) are skipped but keep their x-position, so a data hole reads as a
// longer connecting segment rather than a jump to zero.
export function Sparkline({
  data,
  height = 32,
  filled = false,
  strokeWidth = 1.5,
  className = '',
}: SparklineProps) {
  const VIEW_W = 100;
  const VIEW_H = 100;

  const points = data
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null);

  if (points.length < 2) {
    return <div style={{ height }} className={className} aria-hidden="true" />;
  }

  const n = data.length;
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  const range = max - min || 1;
  // Small vertical padding so the line never touches the edges.
  const pad = VIEW_H * 0.12;

  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * VIEW_W);
  const y = (v: number) => VIEW_H - pad - ((v - min) / range) * (VIEW_H - 2 * pad);

  const linePts = points.map((p) => `${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');

  const first = points[0];
  const last = points[points.length - 1];
  const areaPts = `${x(first.i).toFixed(2)},${VIEW_H} ${linePts} ${x(last.i).toFixed(2)},${VIEW_H}`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={className}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      {filled && <polygon points={areaPts} fill="currentColor" opacity={0.12} stroke="none" />}
      <polyline
        points={linePts}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
