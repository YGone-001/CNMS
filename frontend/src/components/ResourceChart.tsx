import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { ProcessStatus } from '@/types/monitor';
import { formatPercent, formatBytes } from '@/utils/format';
import { useEChartsTheme } from '@/context/ThemeContext';

// max data points kept in the rolling buffer (2 min at 2s interval)
const MAX_POINTS = 60;

interface ResourceChartProps {
  processes: ProcessStatus[];
}

// compute dynamic Y-axis range from data, so tiny fluctuations fill the viewport
function computeYAxisBounds(allData: number[]): { min: number; max: number } {
  if (allData.length === 0) return { min: 0, max: 100 };

  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (const v of allData) {
    if (v < dataMin) dataMin = v;
    if (v > dataMax) dataMax = v;
  }

  // flat line or all zeros: give a visible range
  if (dataMax - dataMin < 0.001) {
    const base = dataMax || 1;
    return { min: 0, max: base * 2 || 1 };
  }

  const padding = (dataMax - dataMin) * 0.2; // 20% headroom top & bottom
  return {
    min: Math.max(0, dataMin - padding),
    max: dataMax + padding,
  };
}

export default function ResourceChart({ processes }: ResourceChartProps) {
  const cpuHistoryRef = useRef<Map<string, number[]>>(new Map());
  const memHistoryRef = useRef<Map<string, number[]>>(new Map());
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const theme = useEChartsTheme();
  const PALETTE = theme.palette;

  // append latest snapshot into rolling buffers
  useEffect(() => {
    const cpuHistory = cpuHistoryRef.current;
    const memHistory = memHistoryRef.current;
    for (const p of processes) {
      if (!cpuHistory.has(p.name)) cpuHistory.set(p.name, []);
      if (!memHistory.has(p.name)) memHistory.set(p.name, []);

      const cpuArr = cpuHistory.get(p.name)!;
      cpuArr.push(p.running ? p.cpu_percent : 0);
      if (cpuArr.length > MAX_POINTS) cpuArr.shift();

      const memArr = memHistory.get(p.name)!;
      memArr.push(p.running ? p.memory_rss : 0);
      if (memArr.length > MAX_POINTS) memArr.shift();
    }
  }, [processes]);

  // X-axis labels: "2s", "4s", ... "120s"
  const xLabels = useMemo(() => {
    const len = Math.max(
      ...Array.from(cpuHistoryRef.current.values()).map((a) => a.length),
      0,
    );
    return Array.from({ length: len }, (_, i) => `${(i + 1) * 2}s`);
  }, [processes]);

  const handleLegendClick = useCallback((name: string) => {
    setSelectedProcess((prev) => (prev === name ? null : name));
  }, []);

  // build ECharts option with dynamic Y-axis
  const buildOption = (
    history: Map<string, number[]>,
    yName: string,
    isMem: boolean,
  ): EChartsOption => {
    const series: object[] = [];
    const processNames: string[] = [];
    const allValues: number[] = [];

    for (const [name, data] of history.entries()) {
      if (data.length === 0) continue;
      const idx = processNames.length;
      processNames.push(name);
      const color = PALETTE[idx % PALETTE.length];

      // collect all visible values for dynamic Y range
      const isSelected = selectedProcess === null || selectedProcess === name;
      const isOther = selectedProcess !== null && selectedProcess !== name;
      if (isSelected) {
        for (const v of data) allValues.push(v);
      }

      series.push({
        name,
        type: 'line',
        smooth: 0.45,
        showSymbol: false,
        sampling: 'lttb',
        lineStyle: {
          width: isSelected ? 1.5 : 1,
          opacity: isOther ? 0.12 : 1,
          cap: 'round',
          join: 'round',
        },
        // gradient area fill -- top opaque, bottom transparent
        areaStyle: isSelected
          ? {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: color + '30' },
                  { offset: 0.6, color: color + '10' },
                  { offset: 1, color: color + '00' },
                ],
              },
              origin: 'auto',
            }
          : undefined,
        data,
        color,
        endLabel: isSelected
          ? {
              show: true,
              formatter: (p: { value: number }) =>
                isMem ? formatBytes(p.value) : formatPercent(p.value, 0),
              color,
              fontSize: 10,
              fontWeight: 'bold',
              distance: 8,
            }
          : { show: false },
        markPoint:
          isSelected && data.length > 0
            ? {
                symbol: 'circle',
                symbolSize: selectedProcess === name ? 10 : 6,
                itemStyle: {
                  color,
                  shadowColor: color,
                  shadowBlur: selectedProcess === name ? 16 : 8,
                },
                label: { show: false },
                data: [{ coord: [data.length - 1, data[data.length - 1]] }],
                animation: true,
                animationDuration: 1200,
                animationEasing: 'sinusoidalInOut',
              }
            : undefined,
        animationDuration: 800,
        animationDurationUpdate: 500,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicInOut',
        animationDelay: idx * 25,
        emphasis: {
          focus: 'series',
          lineStyle: { width: 3 },
          areaStyle: { opacity: 0.35 },
        },
        z: isSelected ? 10 : 1,
      });
    }

    // dynamic Y-axis: bounds computed from actual visible data
    const yBounds = computeYAxisBounds(allValues);

    return {
      backgroundColor: 'transparent',
      grid: { top: 15, right: 30, bottom: 30, left: isMem ? 65 : 50 },
      dataZoom: [{ type: 'inside', start: 0, end: 100, zoomLock: true }],
      tooltip: {
        trigger: 'axis',
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.tooltipText, fontSize: 12 },
        confine: true,
        axisPointer: {
          type: 'cross',
          lineStyle: { color: theme.axisPointer },
          crossStyle: { color: theme.axisPointer },
        },
        formatter: (params: unknown) => {
          const items = params as Array<{
            seriesName: string;
            value: number;
            color: string;
            axisValue: string;
          }>;
          if (!Array.isArray(items) || items.length === 0) return '';
          let tip = `<div style="font-size:12px;margin-bottom:4px;color:${theme.axisLabel}">${items[0].axisValue}</div>`;
          const filtered = selectedProcess
            ? items.filter((i) => i.seriesName === selectedProcess)
            : items;
          for (const item of filtered) {
            const val = isMem
              ? formatBytes(item.value)
              : formatPercent(item.value, 1);
            tip += `<div style="margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:6px;box-shadow:0 0 6px ${item.color}"></span>${item.seriesName}: <b>${val}</b></div>`;
          }
          return tip;
        },
      },
      legend: { show: false },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { lineStyle: { color: theme.axisLine } },
        axisLabel: { color: theme.axisLabel, fontSize: 10, interval: 'auto' },
        splitLine: { show: false },
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        name: yName,
        nameTextStyle: { color: theme.axisLabel, fontSize: 11 },
        min: yBounds.min,
        max: yBounds.max,
        axisLine: { show: false },
        axisLabel: {
          color: theme.axisLabel,
          fontSize: 10,
          margin: 8,
          ...(isMem
            ? { formatter: (val: number) => formatBytes(val) }
            : {}),
        },
        splitLine: { lineStyle: { color: theme.splitLine, type: 'dashed' } },
      },
      series,
    };
  };

  const cpuOption = useMemo(
    () => buildOption(cpuHistoryRef.current, 'CPU %', false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [xLabels, processes, selectedProcess],
  );

  const memOption = useMemo(
    () => buildOption(memHistoryRef.current, 'Memory RSS', true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [xLabels, processes, selectedProcess],
  );

  const processNames = useMemo(() => {
    return Array.from(cpuHistoryRef.current.keys()).filter(
      (n) => (cpuHistoryRef.current.get(n)?.length ?? 0) > 0,
    );
  }, [processes]);

  const selectedStatus = useMemo(() => {
    if (!selectedProcess) return null;
    return processes.find((p) => p.name === selectedProcess) || null;
  }, [selectedProcess, processes]);

  return (
    <div className="space-y-4">
      {/* chart pair */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CPU chart */}
        <div className="bg-noc-surface border border-noc-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-noc-accent">
              CPU Usage (%)
              {selectedProcess && (
                <span className="ml-2 text-noc-muted">- {selectedProcess}</span>
              )}
            </span>
            <span className="text-xs text-noc-muted">
              {processNames.length} processes
            </span>
          </div>
          <ReactECharts
            option={cpuOption}
            style={{ height: 220 }}
            opts={{ renderer: 'canvas' }}
            notMerge={true}
            lazyUpdate={false}
          />
        </div>

        {/* Memory chart */}
        <div className="bg-noc-surface border border-noc-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-noc-warning">
              Memory RSS
              {selectedProcess && (
                <span className="ml-2 text-noc-muted">- {selectedProcess}</span>
              )}
            </span>
            <span className="text-xs text-noc-muted">
              {processNames.length} processes
            </span>
          </div>
          <ReactECharts
            option={memOption}
            style={{ height: 220 }}
            opts={{ renderer: 'canvas' }}
            notMerge={true}
            lazyUpdate={false}
          />
        </div>
      </div>

      {/* selected process detail card */}
      {selectedProcess && selectedStatus && (
        <div className="bg-noc-surface border border-noc-accent-30 rounded-lg p-3 flex items-center gap-6">
          <div className="text-sm font-medium text-noc-accent">
            {selectedProcess}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-noc-muted">Status:</span>
            <span
              className={
                selectedStatus.running ? 'text-noc-success' : 'text-noc-error'
              }
            >
              {selectedStatus.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-noc-muted">CPU:</span>
            <span className="text-noc-accent font-mono">
              {formatPercent(selectedStatus.cpu_percent, 1)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-noc-muted">Memory:</span>
            <span className="text-noc-warning font-mono">
              {formatBytes(selectedStatus.memory_rss)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-noc-muted">PID:</span>
            <span className="text-noc-text font-mono">
              {selectedStatus.pid}
            </span>
          </div>
          <button
            onClick={() => setSelectedProcess(null)}
            className="ml-auto text-xs text-noc-muted hover:text-noc-text transition-colors"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* clickable process legend */}
      <div className="bg-noc-surface border border-noc-border rounded-lg p-3">
        <div className="text-xs text-noc-muted mb-2">
          Click to isolate a process · Click again to show all
          {selectedProcess && (
            <span className="ml-2 text-noc-accent">
              · Selected: {selectedProcess}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {processNames.map((name, idx) => {
            const isActive =
              selectedProcess === null || selectedProcess === name;
            const isSelected = selectedProcess === name;
            return (
              <button
                key={name}
                onClick={() => handleLegendClick(name)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                  isSelected
                    ? 'bg-noc-accent-20 text-noc-accent border border-noc-accent-40'
                    : isActive
                    ? 'bg-noc-surface text-noc-text hover:bg-noc-bg border border-transparent'
                    : 'bg-noc-surface text-noc-muted/40 hover:text-noc-muted border border-transparent'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-shadow"
                  style={{
                    backgroundColor: PALETTE[idx % PALETTE.length],
                    opacity: isActive ? 1 : 0.3,
                    boxShadow: isSelected
                      ? `0 0 4px ${PALETTE[idx % PALETTE.length]}60`
                      : 'none',
                  }}
                />
                <span>{name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
