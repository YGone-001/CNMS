import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption, DefaultLabelFormatterCallbackParams } from 'echarts';
import { Activity, RefreshCw } from 'lucide-react';
import type { MetricPoint } from '@/types/monitor';
import { formatBytes, formatPercent } from '@/utils/format';
import { useEChartsTheme } from '@/context/ThemeContext';

// ---------------------------------------------------------------------------
// Aggregation: bucket data points by time window and compute avg/max
// ---------------------------------------------------------------------------
interface AggPoint {
  ts: number;        // bucket start timestamp (ms)
  label: string;     // formatted time label
  avg: number;
  max: number;
}

function aggregatePoints(
  points: MetricPoint[],
  getField: (p: MetricPoint) => number,
  bucketMs: number,
): AggPoint[] {
  if (points.length === 0) return [];

  // Ensure ascending order
  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const buckets = new Map<number, number[]>();
  for (const p of sorted) {
    const t = new Date(p.timestamp).getTime();
    const key = Math.floor(t / bucketMs) * bucketMs;
    const arr = buckets.get(key);
    if (arr) arr.push(getField(p));
    else buckets.set(key, [getField(p)]);
  }

  const result: AggPoint[] = [];
  for (const [ts, values] of buckets) {
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const max = Math.max(...values);
    const label = new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    result.push({ ts, label, avg, max });
  }

  result.sort((a, b) => a.ts - b.ts);
  return result;
}

// ---------------------------------------------------------------------------
// Pick aggregation bucket size based on time range
// ---------------------------------------------------------------------------
function bucketSizeMs(range: string): number {
  switch (range) {
    case '1h':  return 30_000;   // 30s
    case '6h':  return 120_000;  // 2min
    case '24h': return 600_000;  // 10min
    case '7d':  return 3600_000; // 1h
    default:    return 30_000;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function MetricsHistory() {
  const [data, setData] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNf, setSelectedNf] = useState<string>('');
  const [nfList, setNfList] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<string>('1h');
  const [highlightedProcess, setHighlightedProcess] = useState<string | null>(null);
  const theme = useEChartsTheme();
  const PALETTE = theme.palette;

  // Refs for chart instances to sync tooltips
  const cpuChartRef = useRef<ReactECharts>(null);
  const memChartRef = useRef<ReactECharts>(null);

  // ---- Fetch data --------------------------------------------------------
  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page_size: '2000' });
      if (selectedNf) params.set('name', selectedNf);

      const now = new Date();
      let from: Date;
      switch (timeRange) {
        case '1h':  from = new Date(now.getTime() - 3600000); break;
        case '6h':  from = new Date(now.getTime() - 21600000); break;
        case '24h': from = new Date(now.getTime() - 86400000); break;
        case '7d':  from = new Date(now.getTime() - 604800000); break;
        default:    from = new Date(now.getTime() - 3600000);
      }
      params.set('from', from.toISOString());

      const resp = await fetch(`/api/v1/metrics/history?${params}`);
      const result = await resp.json();
      if (result.status === 'ok') {
        const points: MetricPoint[] = result.data || [];
        // Sort ascending by timestamp (backend returns newest-first)
        points.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        setData(points);
        const names = [...new Set(points.map(p => p.name))].sort();
        setNfList(names);
      }
    } catch (err) {
      console.error('fetch metrics error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedNf, timeRange]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // ---- Group data by process name ----------------------------------------
  const processGroups = useMemo(() => {
    const groups = new Map<string, MetricPoint[]>();
    for (const p of data) {
      const arr = groups.get(p.name);
      if (arr) arr.push(p);
      else groups.set(p.name, [p]);
    }
    return groups;
  }, [data]);

  const processNames = useMemo(
    () => [...processGroups.keys()].sort(),
    [processGroups],
  );

  // ---- Aggregate per process ---------------------------------------------
  const bucket = bucketSizeMs(timeRange);

  const cpuAgg = useMemo(() => {
    const result = new Map<string, AggPoint[]>();
    for (const [name, pts] of processGroups) {
      result.set(name, aggregatePoints(pts, p => p.cpu_percent, bucket));
    }
    return result;
  }, [processGroups, bucket]);

  const memAgg = useMemo(() => {
    const result = new Map<string, AggPoint[]>();
    for (const [name, pts] of processGroups) {
      result.set(name, aggregatePoints(pts, p => p.memory_rss, bucket));
    }
    return result;
  }, [processGroups, bucket]);

  // ---- Unified time labels (use the longest process's labels) ------------
  const timeLabels = useMemo(() => {
    let longest: AggPoint[] = [];
    for (const pts of cpuAgg.values()) {
      if (pts.length > longest.length) longest = pts;
    }
    return longest.map(p => p.label);
  }, [cpuAgg]);

  // ---- Highlight handler -------------------------------------------------
  const handleLegendClick = useCallback(
    (processName: string) => {
      setHighlightedProcess(prev => (prev === processName ? null : processName));
    },
    [],
  );

  // ---- Build series with highlight logic ---------------------------------
  const buildSeries = useCallback(
    (
      aggMap: Map<string, AggPoint[]>,
      field: 'avg' | 'max',
      chartType: 'cpu' | 'mem',
    ) => {
      return processNames.map((name, idx) => {
        const pts = aggMap.get(name) || [];
        const isDimmed = highlightedProcess !== null && highlightedProcess !== name;
        const isHighlighted = highlightedProcess === name;
        return {
          name,
          type: 'line' as const,
          smooth: 0.3,
          showSymbol: false,
          sampling: 'lttb' as const,
          data: pts.map(p => p[field]),
          color: PALETTE[idx % PALETTE.length],
          lineStyle: {
            width: isHighlighted ? 3 : isDimmed ? 1 : 1.5,
            opacity: isDimmed ? 0.15 : 1,
          },
          itemStyle: {
            opacity: isDimmed ? 0.15 : 1,
          },
          emphasis: {
            focus: 'series' as const,
            lineStyle: { width: 3 },
          },
          // Show end label only for highlighted or when no highlight
          endLabel: isHighlighted
            ? {
                show: true,
                formatter: (p: DefaultLabelFormatterCallbackParams) => {
                  const v = (p.value as number) ?? 0;
                  return chartType === 'cpu' ? formatPercent(v) : formatBytes(v);
                },
                fontSize: 11,
                color: PALETTE[idx % PALETTE.length],
              }
            : undefined,
          animationDuration: 600,
          animationEasing: 'cubicOut' as const,
        };
      });
    },
    [processNames, highlightedProcess, PALETTE],
  );

  // ---- CPU Chart option --------------------------------------------------
  const cpuOption: EChartsOption = useMemo(
    () => ({
      color: PALETTE,
      backgroundColor: 'transparent',
      grid: { top: 40, right: 24, bottom: 30, left: 50 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.tooltipText, fontSize: 12 },
        axisPointer: {
          type: 'cross',
          lineStyle: { color: theme.axisPointer },
        },
        formatter: (params: DefaultLabelFormatterCallbackParams | DefaultLabelFormatterCallbackParams[]) => {
          const items = Array.isArray(params) ? params : [params];
          if (items.length === 0) return '';
          const first = items[0] as DefaultLabelFormatterCallbackParams & { axisValueLabel?: string; axisValue?: string };
          let html = `<div style="font-size:12px;margin-bottom:4px">${first.axisValueLabel ?? first.axisValue ?? ''}</div>`;
          const sorted = [...items].sort((a, b) => ((b.value as number) ?? 0) - ((a.value as number) ?? 0));
          for (const item of sorted) {
            const val = item.value as number | undefined;
            if (val == null) continue;
            html += `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.8">
              <span>${item.marker ?? ''} ${item.seriesName ?? ''}</span>
              <b>${formatPercent(val)}</b>
            </div>`;
          }
          return html;
        },
      },
      legend: {
        type: 'scroll',
        top: 4,
        textStyle: { color: theme.legendText, fontSize: 11 },
        // Click legend to highlight/dim
        selectedMode: false,
      },
      xAxis: {
        type: 'category',
        data: timeLabels,
        axisLine: { lineStyle: { color: theme.axisLine } },
        axisLabel: { color: theme.axisLabel, fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: 'CPU %',
        max: 100,
        nameTextStyle: { color: theme.axisLabel, fontSize: 11 },
        axisLabel: { color: theme.axisLabel, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.splitLine, type: 'dashed' } },
      },
      series: buildSeries(cpuAgg, 'avg', 'cpu'),
    }),
    [timeLabels, cpuAgg, theme, PALETTE, buildSeries],
  );

  // ---- Memory Chart option -----------------------------------------------
  const memOption: EChartsOption = useMemo(
    () => ({
      color: PALETTE,
      backgroundColor: 'transparent',
      grid: { top: 40, right: 24, bottom: 30, left: 60 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.tooltipText, fontSize: 12 },
        axisPointer: {
          type: 'cross',
          lineStyle: { color: theme.axisPointer },
        },
        formatter: (params: DefaultLabelFormatterCallbackParams | DefaultLabelFormatterCallbackParams[]) => {
          const items = Array.isArray(params) ? params : [params];
          if (items.length === 0) return '';
          const first = items[0] as DefaultLabelFormatterCallbackParams & { axisValueLabel?: string; axisValue?: string };
          let html = `<div style="font-size:12px;margin-bottom:4px">${first.axisValueLabel ?? first.axisValue ?? ''}</div>`;
          const sorted = [...items].sort((a, b) => ((b.value as number) ?? 0) - ((a.value as number) ?? 0));
          for (const item of sorted) {
            const val = item.value as number | undefined;
            if (val == null) continue;
            html += `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.8">
              <span>${item.marker ?? ''} ${item.seriesName ?? ''}</span>
              <b>${formatBytes(val)}</b>
            </div>`;
          }
          return html;
        },
      },
      legend: {
        type: 'scroll',
        top: 4,
        textStyle: { color: theme.legendText, fontSize: 11 },
        selectedMode: false,
      },
      xAxis: {
        type: 'category',
        data: timeLabels,
        axisLine: { lineStyle: { color: theme.axisLine } },
        axisLabel: { color: theme.axisLabel, fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: 'Memory RSS',
        nameTextStyle: { color: theme.axisLabel, fontSize: 11 },
        axisLabel: {
          color: theme.axisLabel,
          fontSize: 10,
          formatter: (v: number) => formatBytes(v),
        },
        splitLine: { lineStyle: { color: theme.splitLine, type: 'dashed' } },
      },
      series: buildSeries(memAgg, 'avg', 'mem'),
    }),
    [timeLabels, memAgg, theme, PALETTE, buildSeries],
  );

  // ---- Sync tooltip between two charts -----------------------------------
  const handleCpuChartEvents = useMemo(
    () => ({
      highlight: (params: { dataIndex?: number }) => {
        if (params.dataIndex != null && memChartRef.current) {
          const instance = memChartRef.current.getEchartsInstance();
          instance.dispatchAction({
            type: 'showTip',
            seriesIndex: 0,
            dataIndex: params.dataIndex,
          });
        }
      },
      downplay: () => {
        if (memChartRef.current) {
          memChartRef.current.getEchartsInstance().dispatchAction({ type: 'hideTip' });
        }
      },
    }),
    [],
  );

  const handleMemChartEvents = useMemo(
    () => ({
      highlight: (params: { dataIndex?: number }) => {
        if (params.dataIndex != null && cpuChartRef.current) {
          const instance = cpuChartRef.current.getEchartsInstance();
          instance.dispatchAction({
            type: 'showTip',
            seriesIndex: 0,
            dataIndex: params.dataIndex,
          });
        }
      },
      downplay: () => {
        if (cpuChartRef.current) {
          cpuChartRef.current.getEchartsInstance().dispatchAction({ type: 'hideTip' });
        }
      },
    }),
    [],
  );

  // ---- Process legend (custom, clickable) --------------------------------
  const renderProcessLegend = () => {
    if (processNames.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {processNames.map((name, idx) => {
          const isActive = highlightedProcess === null || highlightedProcess === name;
          const color = PALETTE[idx % PALETTE.length];
          return (
            <button
              key={name}
              onClick={() => handleLegendClick(name)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all border"
              style={{
                borderColor: isActive ? color : theme.splitLine,
                opacity: isActive ? 1 : 0.35,
                background: highlightedProcess === name ? `${color}18` : 'transparent',
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: color }}
              />
              <span style={{ color: theme.axisLabel }}>{name}</span>
            </button>
          );
        })}
        {highlightedProcess && (
          <button
            onClick={() => setHighlightedProcess(null)}
            className="px-2 py-1 rounded text-xs text-noc-muted hover:text-noc-text border border-noc-border"
          >
            Clear
          </button>
        )}
      </div>
    );
  };

  // ---- Render ------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Metrics History</h2>
          <p className="text-sm text-noc-muted mt-0.5">
            Historical system performance data
            {highlightedProcess && (
              <span className="ml-2 text-noc-accent">— focused: {highlightedProcess}</span>
            )}
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="p-2 bg-noc-surface text-noc-muted rounded-lg hover:text-noc-text transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={selectedNf}
          onChange={e => setSelectedNf(e.target.value)}
          className="px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
        >
          <option value="">All Processes</option>
          {nfList.map(n => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <div className="flex gap-1 bg-noc-surface rounded-lg p-1">
          {['1h', '6h', '24h', '7d'].map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                timeRange === r
                  ? 'bg-noc-bg text-noc-accent'
                  : 'text-noc-muted hover:text-noc-text'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Charts */}
      {data.length > 0 ? (
        <>
          {/* Custom process legend */}
          {renderProcessLegend()}

          {/* CPU% chart */}
          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="text-xs font-medium text-noc-muted mb-2 uppercase tracking-wide">
              CPU Usage (%)
            </div>
            <ReactECharts
              ref={cpuChartRef}
              option={cpuOption}
              style={{ height: 280 }}
              opts={{ renderer: 'canvas' }}
              onEvents={handleCpuChartEvents}
            />
          </div>

          {/* Memory RSS chart */}
          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="text-xs font-medium text-noc-muted mb-2 uppercase tracking-wide">
              Memory RSS
            </div>
            <ReactECharts
              ref={memChartRef}
              option={memOption}
              style={{ height: 280 }}
              opts={{ renderer: 'canvas' }}
              onEvents={handleMemChartEvents}
            />
          </div>
        </>
      ) : (
        !loading && (
          <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center">
            <Activity className="w-8 h-8 text-noc-muted mx-auto mb-2" />
            <div className="text-sm text-noc-muted">
              No metrics data available. Data is collected every 30 seconds.
            </div>
          </div>
        )
      )}
    </div>
  );
}
