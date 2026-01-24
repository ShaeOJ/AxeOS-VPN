import { useState, useEffect, useMemo } from 'react';
import { useDeviceStore } from '../stores/deviceStore';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';

interface MetricData {
  timestamp: number;
  hashrate: number | null;
  temperature: number | null;
  power: number | null;
  data: Record<string, unknown> | null;
}

interface DeviceMetrics {
  deviceId: string;
  deviceName: string;
  color: string;
  metrics: MetricData[];
}

type MetricType = 'hashrate' | 'temperature' | 'power' | 'efficiency';
type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

const DEVICE_COLORS = [
  '#FFB000', // Vault-Tec Yellow
  '#00FF41', // Pip-Boy Green
  '#FF3131', // Nuka-Cola Red
  '#4A90D9', // Brotherhood Blue
  '#00CED1', // Institute Teal
  '#C4A35A', // NCR Tan
  '#B22222', // Enclave Red
  '#87CEEB', // Sky Blue
  '#FF6B6B', // Coral
  '#9370DB', // Purple
];

const TIME_RANGES: { value: TimeRange; label: string; hours: number }[] = [
  { value: '1h', label: '1 Hour', hours: 1 },
  { value: '6h', label: '6 Hours', hours: 6 },
  { value: '24h', label: '24 Hours', hours: 24 },
  { value: '7d', label: '7 Days', hours: 168 },
  { value: '30d', label: '30 Days', hours: 720 },
];

const METRIC_TYPES: { value: MetricType; label: string; unit: string }[] = [
  { value: 'hashrate', label: 'Hashrate', unit: 'GH/s' },
  { value: 'temperature', label: 'Temperature', unit: '°C' },
  { value: 'power', label: 'Power', unit: 'W' },
  { value: 'efficiency', label: 'Efficiency', unit: 'J/TH' },
];

export function ChartsPage() {
  const { devices } = useDeviceStore();
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [deviceMetrics, setDeviceMetrics] = useState<DeviceMetrics[]>([]);
  const [metricType, setMetricType] = useState<MetricType>('hashrate');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [isLoading, setIsLoading] = useState(false);
  const [showAreaChart, setShowAreaChart] = useState(false);

  // Auto-select first 3 online devices on mount
  useEffect(() => {
    const onlineDevices = devices.filter(d => d.isOnline).slice(0, 3);
    if (onlineDevices.length > 0 && selectedDevices.length === 0) {
      setSelectedDevices(onlineDevices.map(d => d.id));
    }
  }, [devices]);

  // Fetch metrics when selection or time range changes
  useEffect(() => {
    if (selectedDevices.length === 0) {
      setDeviceMetrics([]);
      return;
    }

    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        const hours = TIME_RANGES.find(t => t.value === timeRange)?.hours || 24;
        const startTime = Date.now() - hours * 60 * 60 * 1000;

        const metricsPromises = selectedDevices.map(async (deviceId, index) => {
          const device = devices.find(d => d.id === deviceId);
          const metrics = await window.electronAPI.getMetrics(deviceId, {
            startTime,
            limit: timeRange === '30d' ? 2000 : timeRange === '7d' ? 1000 : 500
          });

          return {
            deviceId,
            deviceName: device?.name || 'Unknown',
            color: DEVICE_COLORS[index % DEVICE_COLORS.length],
            metrics
          };
        });

        const results = await Promise.all(metricsPromises);
        setDeviceMetrics(results);
      } catch (err) {
        console.error('Failed to fetch metrics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [selectedDevices, timeRange, devices]);

  // Transform data for chart
  const chartData = useMemo(() => {
    if (deviceMetrics.length === 0) return [];

    // Collect all unique timestamps
    const allTimestamps = new Set<number>();
    deviceMetrics.forEach(dm => {
      dm.metrics.forEach(m => allTimestamps.add(m.timestamp));
    });

    // Sort timestamps
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    // Sample data if too many points (for performance)
    const maxPoints = 200;
    const step = sortedTimestamps.length > maxPoints
      ? Math.ceil(sortedTimestamps.length / maxPoints)
      : 1;

    const sampledTimestamps = sortedTimestamps.filter((_, i) => i % step === 0);

    // Build chart data
    return sampledTimestamps.map(timestamp => {
      const dataPoint: Record<string, number | string | null> = {
        timestamp,
        time: formatTime(timestamp, timeRange)
      };

      deviceMetrics.forEach(dm => {
        // Find closest metric to this timestamp (within 5 minutes)
        const metric = dm.metrics.find(m => Math.abs(m.timestamp - timestamp) < 5 * 60 * 1000);

        if (metric) {
          let value: number | null = null;

          switch (metricType) {
            case 'hashrate':
              // Hashrate stored in H/s, convert to GH/s for display
              value = metric.hashrate ? metric.hashrate / 1e9 : null;
              break;
            case 'temperature':
              value = metric.temperature;
              break;
            case 'power':
              value = metric.power;
              break;
            case 'efficiency':
              if (metric.power && metric.hashrate && metric.hashrate > 0) {
                // Hashrate in H/s, convert to TH/s for efficiency calc
                const hashrateTH = metric.hashrate / 1e12;
                value = hashrateTH > 0 ? metric.power / hashrateTH : null; // J/TH
              }
              break;
          }

          dataPoint[dm.deviceId] = value;
        } else {
          dataPoint[dm.deviceId] = null;
        }
      });

      return dataPoint;
    });
  }, [deviceMetrics, metricType, timeRange]);

  // Calculate stats for each device
  const deviceStats = useMemo(() => {
    return deviceMetrics.map(dm => {
      const values = dm.metrics
        .map(m => {
          switch (metricType) {
            case 'hashrate': return m.hashrate ? m.hashrate / 1e9 : null; // Convert H/s to GH/s
            case 'temperature': return m.temperature;
            case 'power': return m.power;
            case 'efficiency':
              if (m.power && m.hashrate && m.hashrate > 0) {
                // Hashrate in H/s, convert to TH/s for efficiency calc
                const hashrateTH = m.hashrate / 1e12;
                return hashrateTH > 0 ? m.power / hashrateTH : null; // J/TH
              }
              return null;
          }
        })
        .filter((v): v is number => v !== null && v > 0);

      if (values.length === 0) {
        return { deviceId: dm.deviceId, deviceName: dm.deviceName, color: dm.color, min: 0, max: 0, avg: 0 };
      }

      return {
        deviceId: dm.deviceId,
        deviceName: dm.deviceName,
        color: dm.color,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      };
    });
  }, [deviceMetrics, metricType]);

  const toggleDevice = (deviceId: string) => {
    setSelectedDevices(prev =>
      prev.includes(deviceId)
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const selectAllDevices = () => {
    setSelectedDevices(devices.map(d => d.id));
  };

  const clearSelection = () => {
    setSelectedDevices([]);
  };

  const currentMetricInfo = METRIC_TYPES.find(m => m.value === metricType)!;

  // Determine the appropriate unit for hashrate based on data values
  const hashrateUnit = useMemo(() => {
    if (metricType !== 'hashrate') return currentMetricInfo.unit;
    const allValues = chartData
      .flatMap(d => deviceMetrics.map(dm => d[dm.deviceId] as number))
      .filter(v => v !== null && v !== undefined && !isNaN(v));
    return allValues.length > 0 && Math.max(...allValues) >= 1000 ? 'TH/s' : 'GH/s';
  }, [chartData, deviceMetrics, metricType, currentMetricInfo.unit]);

  const useTHUnit = hashrateUnit === 'TH/s';
  const displayUnit = metricType === 'hashrate' ? hashrateUnit : currentMetricInfo.unit;

  return (
    <div className="p-6 space-y-6 animate-page-glitch">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Performance Charts</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAreaChart(!showAreaChart)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showAreaChart
                ? 'bg-accent text-bg-primary'
                : 'border border-border text-text-secondary hover:border-accent'
            }`}
          >
            {showAreaChart ? 'Area' : 'Line'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Device Selector */}
        <div className="lg:col-span-2 rounded-xl bg-bg-secondary border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-text-primary">Select Devices to Compare</h3>
            <div className="flex gap-2">
              <button
                onClick={selectAllDevices}
                className="text-xs text-accent hover:underline"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="text-xs text-text-secondary hover:text-accent"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {devices.map((device, index) => {
              const isSelected = selectedDevices.includes(device.id);
              const color = DEVICE_COLORS[selectedDevices.indexOf(device.id) % DEVICE_COLORS.length];

              return (
                <button
                  key={device.id}
                  onClick={() => toggleDevice(device.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'border-2'
                      : 'border border-border text-text-secondary hover:border-accent/50'
                  }`}
                  style={isSelected ? {
                    borderColor: color,
                    backgroundColor: `${color}20`,
                    color: color
                  } : {}}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${device.isOnline ? 'bg-success' : 'bg-text-secondary'}`}
                  />
                  {device.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Metric & Time Range */}
        <div className="rounded-xl bg-bg-secondary border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-2">Metric</label>
            <div className="grid grid-cols-2 gap-2">
              {METRIC_TYPES.map(mt => (
                <button
                  key={mt.value}
                  onClick={() => setMetricType(mt.value)}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                    metricType === mt.value
                      ? 'bg-accent text-bg-primary'
                      : 'border border-border text-text-secondary hover:border-accent'
                  }`}
                >
                  {mt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-2">Time Range</label>
            <div className="flex flex-wrap gap-2">
              {TIME_RANGES.map(tr => (
                <button
                  key={tr.value}
                  onClick={() => setTimeRange(tr.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    timeRange === tr.value
                      ? 'bg-accent text-bg-primary'
                      : 'border border-border text-text-secondary hover:border-accent'
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl bg-bg-secondary border border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-text-primary">
            {currentMetricInfo.label} Over Time
          </h3>
          {isLoading && (
            <div className="flex items-center gap-2 text-text-secondary text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </div>
          )}
        </div>

        {selectedDevices.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-text-secondary">
            Select devices above to view charts
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-text-secondary">
            No data available for the selected time range
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {showAreaChart ? (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="time"
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                    tickFormatter={(value) => metricType === 'hashrate' ? formatHashrateForDisplay(value, useTHUnit) : formatValue(value, metricType)}
                    label={{
                      value: displayUnit,
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: 'var(--color-text-secondary)', fontSize: 12 }
                    }}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: 'var(--color-text-primary)' }}
                    formatter={(value: number) => [
                      `${metricType === 'hashrate' ? formatHashrateForDisplay(value, useTHUnit) : formatValue(value, metricType)} ${displayUnit}`,
                    ]}
                  />
                  <Legend />
                  {deviceMetrics.map(dm => (
                    <Area
                      key={dm.deviceId}
                      type="monotone"
                      dataKey={dm.deviceId}
                      name={dm.deviceName}
                      stroke={dm.color}
                      fill={dm.color}
                      fillOpacity={0.1}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </AreaChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="time"
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                    tickFormatter={(value) => metricType === 'hashrate' ? formatHashrateForDisplay(value, useTHUnit) : formatValue(value, metricType)}
                    label={{
                      value: displayUnit,
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: 'var(--color-text-secondary)', fontSize: 12 }
                    }}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: 'var(--color-text-primary)' }}
                    formatter={(value: number) => [
                      `${metricType === 'hashrate' ? formatHashrateForDisplay(value, useTHUnit) : formatValue(value, metricType)} ${displayUnit}`,
                    ]}
                  />
                  <Legend />
                  {deviceMetrics.map(dm => (
                    <Line
                      key={dm.deviceId}
                      type="monotone"
                      dataKey={dm.deviceId}
                      name={dm.deviceName}
                      stroke={dm.color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Stats Comparison Table */}
      {deviceStats.length > 0 && deviceStats.some(s => s.avg > 0) && (
        <div className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-lg font-medium text-text-primary">
              {currentMetricInfo.label} Statistics ({TIME_RANGES.find(t => t.value === timeRange)?.label})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-sm text-text-secondary font-medium">Device</th>
                  <th className="text-right p-3 text-sm text-text-secondary font-medium">Min</th>
                  <th className="text-right p-3 text-sm text-text-secondary font-medium">Max</th>
                  <th className="text-right p-3 text-sm text-text-secondary font-medium">Average</th>
                </tr>
              </thead>
              <tbody>
                {deviceStats.filter(s => s.avg > 0).map(stat => (
                  <tr key={stat.deviceId} className="border-b border-border/50 hover:bg-bg-tertiary/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stat.color }}
                        />
                        <span className="text-text-primary">{stat.deviceName}</span>
                      </div>
                    </td>
                    <td className="text-right p-3 font-mono text-text-secondary">
                      {metricType === 'hashrate' ? formatHashrateForDisplay(stat.min, useTHUnit) : formatValue(stat.min, metricType)} {displayUnit}
                    </td>
                    <td className="text-right p-3 font-mono text-text-secondary">
                      {metricType === 'hashrate' ? formatHashrateForDisplay(stat.max, useTHUnit) : formatValue(stat.max, metricType)} {displayUnit}
                    </td>
                    <td className="text-right p-3 font-mono text-accent">
                      {metricType === 'hashrate' ? formatHashrateForDisplay(stat.avg, useTHUnit) : formatValue(stat.avg, metricType)} {displayUnit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(timestamp: number, timeRange: TimeRange): string {
  const date = new Date(timestamp);

  if (timeRange === '1h' || timeRange === '6h') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (timeRange === '24h') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function formatValue(value: number | null, metricType: MetricType, forAxis = false): string {
  if (value === null || value === undefined) return '--';

  switch (metricType) {
    case 'hashrate':
      // Values are in GH/s, convert to TH/s if >= 1000 GH/s
      if (value >= 1000) {
        return (value / 1000).toFixed(2);
      }
      return value.toFixed(1);
    case 'temperature':
      return value.toFixed(1);
    case 'power':
      return value.toFixed(1);
    case 'efficiency':
      return value.toFixed(2);
    default:
      return value.toFixed(2);
  }
}

function getHashrateUnit(values: number[]): string {
  // Check if any value is >= 1000 GH/s (1 TH/s)
  const maxValue = Math.max(...values.filter(v => v !== null && !isNaN(v)));
  return maxValue >= 1000 ? 'TH/s' : 'GH/s';
}

function formatHashrateForDisplay(value: number | null, useTH: boolean): string {
  if (value === null || value === undefined) return '--';
  if (useTH) {
    return (value / 1000).toFixed(2);
  }
  return value.toFixed(1);
}
