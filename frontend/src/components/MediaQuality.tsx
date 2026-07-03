import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import {
  Loader2,
  Radio,
  ArrowLeftRight,
  Activity,
  Wifi,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useI18n } from '@/i18nContext';
import { useTheme } from '@/context/ThemeContext';
import { authFetch } from '@/App';
import type { MediaQuality as MediaQualityType } from '@/types/signaling';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MediaQualityProps {
  traceId: string;
  callId?: string;
}

interface MediaStream {
  direction: string;
  codec: string;
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  ssrc: string;
  relay_ip?: string;
  relay_port?: number;
  pkts_sent: number;
  pkts_lost: number;
  loss_rate: number;
  jitter: number;
  mos: number;
  rtd: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mosColor(mos: number): string {
  if (mos >= 4.0) return '#22c55e';
  if (mos >= 3.0) return '#eab308';
  return '#ef4444';
}

function mosLabel(mos: number): string {
  if (mos >= 4.5) return 'Excellent';
  if (mos >= 4.0) return 'Good';
  if (mos >= 3.5) return 'Fair';
  if (mos >= 3.0) return 'Poor';
  return 'Bad';
}

function lossColor(rate: number): string {
  if (rate <= 0.01) return 'text-green-400';
  if (rate <= 0.05) return 'text-yellow-400';
  return 'text-red-400';
}

function jitterColor(jitter: number): string {
  if (jitter <= 20) return 'text-green-400';
  if (jitter <= 50) return 'text-yellow-400';
  return 'text-red-400';
}

function rtdColor(rtd: number): string {
  if (rtd <= 100) return 'text-green-400';
  if (rtd <= 300) return 'text-yellow-400';
  return 'text-red-400';
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function formatDirection(dir: string): string {
  switch (dir) {
    case 'caller_to_callee': return 'Caller → Callee';
    case 'callee_to_caller': return 'Callee → Caller';
    default: return dir;
  }
}

function directionIcon(dir: string): string {
  switch (dir) {
    case 'caller_to_callee': return '→';
    case 'callee_to_caller': return '←';
    default: return '↔';
  }
}

// ---------------------------------------------------------------------------
// MOS Gauge Option
// ---------------------------------------------------------------------------

function mosGaugeOption(mos: number, dark: boolean): EChartsOption {
  const color = mosColor(mos);
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 1,
        max: 5,
        splitNumber: 8,
        axisLine: {
          lineStyle: {
            width: 12,
            color: [
              [0.4, '#ef4444'],
              [0.6, '#eab308'],
              [1, '#22c55e'],
            ],
          },
        },
        pointer: {
          icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
          length: '60%',
          width: 8,
          offsetCenter: [0, '-50%'],
          itemStyle: { color },
        },
        axisTick: {
          distance: -12,
          length: 4,
          lineStyle: { color: dark ? '#555' : '#ccc', width: 1 },
        },
        splitLine: {
          distance: -14,
          length: 10,
          lineStyle: { color: dark ? '#666' : '#aaa', width: 2 },
        },
        axisLabel: {
          color: dark ? '#999' : '#666',
          distance: 20,
          fontSize: 10,
          formatter: (v: number) => v.toFixed(1),
        },
        detail: {
          valueAnimation: true,
          formatter: '{value}',
          color,
          fontSize: 22,
          fontWeight: 'bold',
          offsetCenter: [0, '30%'],
        },
        title: {
          offsetCenter: [0, '55%'],
          fontSize: 11,
          color: dark ? '#aaa' : '#666',
        },
        data: [{ value: mos, name: mosLabel(mos) }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Metric card */
const MetricCard = memo(function MetricCard({
  icon: Icon,
  label,
  value,
  colorClass,
  suffix,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  colorClass: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-noc-bg rounded-lg border border-noc-border">
      <div className="p-2 rounded-md bg-noc-surface">
        <Icon className="w-4 h-4 text-noc-muted" />
      </div>
      <div>
        <div className="text-[10px] text-noc-muted uppercase">{label}</div>
        <div className={`text-lg font-bold font-mono ${colorClass}`}>
          {value}
          {suffix && <span className="text-xs font-normal text-noc-muted ml-1">{suffix}</span>}
        </div>
      </div>
    </div>
  );
});

/** Stream card */
const StreamCard = memo(function StreamCard({ stream }: { stream: MediaStream }) {
  return (
    <div className="bg-noc-bg rounded-lg border border-noc-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-noc-bg-50 border-b border-noc-border">
        <span className="text-base">{directionIcon(stream.direction)}</span>
        <span className="text-xs font-semibold text-noc-text">{formatDirection(stream.direction)}</span>
        {stream.codec && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
            {stream.codec}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-noc-muted">Source</span>
          <span className="font-mono text-noc-text">{stream.src_ip}:{stream.src_port}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-noc-muted">Destination</span>
          <span className="font-mono text-noc-text">{stream.dst_ip}:{stream.dst_port}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-noc-muted">SSRC</span>
          <span className="font-mono text-noc-text">{stream.ssrc || '-'}</span>
        </div>
        {stream.relay_ip && (
          <div className="flex items-center justify-between pt-1 border-t border-noc-border/50">
            <span className="text-noc-muted">Relay</span>
            <span className="font-mono text-noc-text">{stream.relay_ip}:{stream.relay_port}</span>
          </div>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function MediaQualityInner({ traceId, callId }: MediaQualityProps) {
  const { language } = useI18n();
  const { theme } = useTheme();
  const isZh = language === 'zh';
  const isDark = theme === 'dark';

  const [media, setMedia] = useState<MediaQualityType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch media quality data
  const fetchMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page_size: '100' });
      const resp = await authFetch(`/api/v1/signaling/trace/${traceId}/media?${params}`);
      const data = await resp.json();
      if (data.status === 'ok') {
        setMedia(data.media || []);
      } else {
        setError(data.message || 'Failed to fetch media data');
      }
    } catch {
      setError(isZh ? '请求失败' : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [traceId, isZh]);

  useEffect(() => {
    if (traceId) fetchMedia();
  }, [traceId, fetchMedia]);

  // Filter by callId if provided
  const filteredMedia = useMemo(() => {
    if (!callId) return media;
    return media.filter((m) => m.call_id === callId);
  }, [media, callId]);

  // Convert to streams
  const streams: MediaStream[] = useMemo(
    () =>
      filteredMedia.map((m) => ({
        direction: m.direction,
        codec: m.codec,
        src_ip: m.src_ip,
        src_port: m.src_port,
        dst_ip: m.dst_ip,
        dst_port: m.dst_port,
        ssrc: m.ssrc,
        relay_ip: m.relay_ip,
        relay_port: m.relay_port,
        pkts_sent: m.pkts_sent,
        pkts_lost: m.pkts_lost,
        loss_rate: m.loss_rate,
        jitter: m.jitter,
        mos: m.mos,
        rtd: m.rtd,
      })),
    [filteredMedia],
  );

  // Aggregate metrics (worst case across all streams)
  const aggMetrics = useMemo(() => {
    if (streams.length === 0) {
      return { mos: 0, loss_rate: 0, jitter: 0, rtd: 0, pkts_sent: 0, pkts_lost: 0 };
    }
    return {
      mos: Math.min(...streams.map((s) => s.mos)),
      loss_rate: Math.max(...streams.map((s) => s.loss_rate)),
      jitter: Math.max(...streams.map((s) => s.jitter)),
      rtd: Math.max(...streams.map((s) => s.rtd)),
      pkts_sent: streams.reduce((a, s) => a + s.pkts_sent, 0),
      pkts_lost: streams.reduce((a, s) => a + s.pkts_lost, 0),
    };
  }, [streams]);

  // MOS gauge option
  const gaugeOption = useMemo(
    () => mosGaugeOption(aggMetrics.mos, isDark),
    [aggMetrics.mos, isDark],
  );

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-noc-muted text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {isZh ? '加载媒体数据...' : 'Loading media data...'}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-40 text-red-400 text-sm">
        <AlertTriangle className="w-5 h-5 mr-2" />
        {error}
      </div>
    );
  }

  // Empty state
  if (streams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-noc-muted text-sm">
        <Radio className="w-8 h-8 mb-2 opacity-30" />
        {isZh ? '暂无媒体质量数据' : 'No media quality data available'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={Activity}
          label={isZh ? '丢包率' : 'Packet Loss'}
          value={formatPercent(aggMetrics.loss_rate)}
          colorClass={lossColor(aggMetrics.loss_rate)}
          suffix={`${aggMetrics.pkts_lost}/${aggMetrics.pkts_sent} pkts`}
        />
        <MetricCard
          icon={Wifi}
          label={isZh ? '抖动' : 'Jitter'}
          value={aggMetrics.jitter.toFixed(1)}
          colorClass={jitterColor(aggMetrics.jitter)}
          suffix="ms"
        />
        <MetricCard
          icon={Clock}
          label={isZh ? '往返时延' : 'Round Trip Delay'}
          value={aggMetrics.rtd.toFixed(1)}
          colorClass={rtdColor(aggMetrics.rtd)}
          suffix="ms"
        />
        <MetricCard
          icon={ArrowLeftRight}
          label={isZh ? '总包数' : 'Total Packets'}
          value={aggMetrics.pkts_sent.toLocaleString()}
          colorClass="text-noc-text"
        />
      </div>

      {/* MOS Gauge + Stream cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* MOS Gauge */}
        <div className="bg-noc-bg rounded-lg border border-noc-border p-4 flex flex-col items-center">
          <h3 className="text-xs font-semibold text-noc-muted uppercase mb-2">MOS Score</h3>
          <div className="w-full max-w-[220px]">
            <ReactECharts
              option={gaugeOption}
              style={{ height: 180 }}
              opts={{ renderer: 'svg' }}
              notMerge
            />
          </div>
          <div className="text-center mt-1">
            <span className="text-[10px] text-noc-muted">
              {isZh ? '1.0 (差) — 5.0 (优)' : '1.0 (Bad) — 5.0 (Excellent)'}
            </span>
          </div>
        </div>

        {/* Stream cards */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-xs font-semibold text-noc-muted uppercase flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" />
            {isZh ? '媒体流详情' : 'Media Streams'} ({streams.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {streams.map((stream, i) => (
              <StreamCard key={i} stream={stream} />
            ))}
          </div>
        </div>
      </div>

      {/* GTP-U Tunnel Info */}
      {streams.some((s) => s.relay_ip) && (
        <div className="bg-noc-bg rounded-lg border border-noc-border overflow-hidden">
          <div className="px-3 py-2 bg-noc-bg-50 border-b border-noc-border flex items-center gap-1.5">
            <ArrowLeftRight className="w-3.5 h-3.5 text-noc-muted" />
            <span className="text-xs font-semibold text-noc-text">
              {isZh ? 'rtpengine 中继信息' : 'rtpengine Relay Mapping'}
            </span>
          </div>
          <div className="p-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-noc-muted border-b border-noc-border">
                  <th className="text-left py-1 font-medium">{isZh ? '方向' : 'Dir'}</th>
                  <th className="text-left py-1 font-medium">{isZh ? '源 RTP' : 'Src RTP'}</th>
                  <th className="text-center py-1 font-medium">→</th>
                  <th className="text-left py-1 font-medium">{isZh ? '中继 RTP' : 'Relay RTP'}</th>
                  <th className="text-center py-1 font-medium">→</th>
                  <th className="text-left py-1 font-medium">{isZh ? '目的 RTP' : 'Dst RTP'}</th>
                </tr>
              </thead>
              <tbody>
                {streams
                  .filter((s) => s.relay_ip)
                  .map((s, i) => (
                    <tr key={i} className="border-b border-noc-border/50 last:border-0">
                      <td className="py-1.5 text-noc-text">{directionIcon(s.direction)}</td>
                      <td className="py-1.5 font-mono text-noc-text">
                        {s.src_ip}:{s.src_port}
                      </td>
                      <td className="py-1.5 text-center text-noc-muted">→</td>
                      <td className="py-1.5 font-mono text-sky-400">
                        {s.relay_ip}:{s.relay_port}
                      </td>
                      <td className="py-1.5 text-center text-noc-muted">→</td>
                      <td className="py-1.5 font-mono text-noc-text">
                        {s.dst_ip}:{s.dst_port}
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

export default memo(MediaQualityInner);
