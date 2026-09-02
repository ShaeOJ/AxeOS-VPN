import { ReactNode } from 'react';
import { MetricGraph } from './MetricGraph';

interface GraphStatCardProps {
  title: string;
  icon: ReactNode;
  /** Formatted main value (e.g. "12.4 TH/s"). */
  value: string;
  /** Time series driving the gradient graph that fills the card body. */
  series?: (number | null)[];
  /** Tailwind text-color class for the accent (drives graph + glow via currentColor). */
  colorClass?: string;
  /** Format a raw series value for the graph's axis labels. */
  formatValue?: (v: number) => string;
  /** Small line rendered under the value (delta, rate, @rate, etc.). */
  subValue?: ReactNode;
  /** Optional control row (e.g. the 1h/6h/12h toggle) between header and graph. */
  toggle?: ReactNode;
  graphHeight?: number;
  showAxis?: boolean;
  onClick?: () => void;
  title_attr?: string;
  className?: string;
}

const chipStyle = { backgroundColor: 'color-mix(in srgb, currentColor 14%, transparent)', borderColor: 'color-mix(in srgb, currentColor 32%, transparent)' };

// Dashboard card: value on the left, icon + title in the top-right, and a
// gradient-fill time-series graph filling the rest of the card. The card's
// `colorClass` sets currentColor, which every accented piece (value glow, icon
// chip, graph line + fill) inherits.
export function GraphStatCard({
  title,
  icon,
  value,
  series,
  colorClass = 'text-accent',
  formatValue,
  subValue,
  toggle,
  graphHeight = 84,
  showAxis = true,
  onClick,
  title_attr,
  className = '',
}: GraphStatCardProps) {
  return (
    <div
      className={`vault-card p-3 sm:p-4 hover-glitch flex flex-col ${colorClass} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ minHeight: graphHeight + 96 }}
      onClick={onClick}
      title={title_attr}
    >
      {/* Header: icon (top-left) · title + value beside it */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg border flex-shrink-0" style={chipStyle}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] sm:text-[11px] text-text-secondary uppercase tracking-wider leading-tight">
            {title}
          </div>
          <div className="text-xl sm:text-2xl font-bold font-data leading-tight truncate" style={{ textShadow: '0 0 8px currentColor' }}>
            {value}
          </div>
          {subValue && <div className="text-xs text-text-secondary mt-0.5 truncate">{subValue}</div>}
        </div>
      </div>

      {toggle && <div className="mt-2">{toggle}</div>}

      {/* Graph fills the remaining space */}
      <div className="mt-3 flex-1 min-h-0">
        <MetricGraph data={series ?? []} minHeight={graphHeight} showAxis={showAxis} formatValue={formatValue} />
      </div>
    </div>
  );
}
