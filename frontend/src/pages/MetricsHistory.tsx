import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Activity, RefreshCw } from 'lucide-react';
import type { MetricPoint } from '@/types/monitor';
import { formatBytes } from '@/utils/format';
import { useEChartsTheme } from '@/context/ThemeContext';

export default function MetricsHistory() {
  const [data, setData] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNf, setSelectedNf] = useState<string>('');
  const [nfList, setNfList] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<string>('1h');
  const theme = useEChartsTheme();
  const PALETTE = theme.palette;

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page_size: '2000' });
      if (selectedNf) params.set('name', selectedNf);

      const now = new Date();
      let from: Date;
      switch (timeRange) {
        case '1h': from = new Date(now.getTime() - 3600000); break;
        case '6h': from = new Date(now.getTime() - 21600000); break;
        case '24h': from = new Date(now.getTime() - 86400000); break;
        case '7d': from = new Date(now.getTime() - 604800000); break;
        default: from = new Date(now.getTime() - 3600000);
      }
      params.set('from', from.toISOString());

      const resp = await fetch(`/api/v1/metrics/history?${params}`);
      const result = await resp.json();
      if (result.status === 'ok') {
        const points: MetricPoint[] = result.data || [];
        setData(points);
        // Extract unique NF names
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

  const option: EChartsOption = useMemo(() => ({
    color: PALETTE,
    backgroundColor: 'transparent',
    grid: { top: 40, right: 60, bottom: 30, left: 50 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.tooltipText, fontSize: 12 },
    },
    legend: {
      type: 'scroll',
      top: 4,
      textStyle: { color: theme.legendText, fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: data.map(d => new Date(d.timestamp).toLocaleTimeString()),
      axisLine: { lineStyle: { color: theme.axisLine } },
      axisLabel: { color: theme.axisLabel, fontSize: 10 },
    },
    yAxis: [
      {
        type: 'value',
        name: 'CPU %',
        max: 100,
        nameTextStyle: { color: theme.axisLabel, fontSize: 11 },
        axisLabel: { color: theme.axisLabel, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.splitLine, type: 'dashed' } },
      },
      {
        type: 'value',
        name: 'Memory RSS',
        position: 'right',
        nameTextStyle: { color: theme.axisLabel, fontSize: 11 },
        axisLabel: { color: theme.axisLabel, fontSize: 10, formatter: (v: number) => formatBytes(v) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'CPU %',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: data.map(d => d.cpu_percent),
        color: PALETTE[0],
        yAxisIndex: 0,
      },
      {
        name: 'Memory RSS',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { type: 'dashed' },
        data: data.map(d => d.memory_rss),
        color: PALETTE[1],
        yAxisIndex: 1,
      },
    ],
  }), [data, theme]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Metrics History</h2>
          <p className="text-sm text-noc-muted mt-0.5">Historical system performance data</p>
        </div>
        <button onClick={fetchMetrics} disabled={loading}
          className="p-2 bg-noc-surface text-noc-muted rounded-lg hover:text-noc-text transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <select value={selectedNf} onChange={e => setSelectedNf(e.target.value)}
          className="px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent">
          <option value="">All Processes</option>
          {nfList.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="flex gap-1 bg-noc-surface rounded-lg p-1">
          {['1h', '6h', '24h', '7d'].map(r => (
            <button key={r} onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                timeRange === r ? 'bg-noc-bg text-noc-accent' : 'text-noc-muted hover:text-noc-text'
              }`}>{r}</button>
          ))}
        </div>
      </div>

      {data.length > 0 ? (
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <ReactECharts option={option} style={{ height: 400 }} opts={{ renderer: 'canvas' }} />
        </div>
      ) : (
        !loading && (
          <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center">
            <Activity className="w-8 h-8 text-noc-muted mx-auto mb-2" />
            <div className="text-sm text-noc-muted">No metrics data available. Data is collected every 30 seconds.</div>
          </div>
        )
      )}
    </div>
  );
}
