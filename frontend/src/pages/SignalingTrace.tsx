import { useState, useEffect, useCallback, useRef, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import {
  GitBranch,
  Play,
  RefreshCw,
  Trash2,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Filter,
  AlertTriangle,
  Database,
  Layers,
  Radio,
} from 'lucide-react';
import { useI18n } from '@/i18nContext';
import { authFetch } from '@/App';
import LadderDiagram from '@/components/LadderDiagram';
import HomerIntegration from '@/components/HomerIntegration';
import type {
  SignalingMessage,
  SignalingTrace as SignalingTraceType,
  TraceQuery,
  QueryType,
  TraceScenario,
  TraceStatus,
  SignalingProtocol,
  HepStatus,
} from '@/types/signaling';
import {
  PROTOCOL_COLORS,
  PROTOCOL_TEXT_COLORS,
  ENTITY_ICONS,
  QUERY_TYPE_OPTIONS,
  SCENARIO_OPTIONS,
  SUMMARY_STEPS,
  DATA_SOURCE_LABELS,
} from '@/types/signaling';

// ---------------------------------------------------------------------------
// Error Boundary — 防止渲染错误导致整个页面白屏
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SignalingErrorBoundary extends Component<
  { children: ReactNode; isZh: boolean },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SignalingTrace] Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const { isZh } = this.props;
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-lg font-semibold text-noc-text mb-2">
            {isZh ? '页面渲染出错' : 'Page Render Error'}
          </h2>
          <p className="text-sm text-noc-muted mb-4 max-w-md">
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.hash = '#/';
              setTimeout(() => window.location.hash = '#/signaling', 100);
            }}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-sm"
          >
            {isZh ? '重新加载' : 'Reload Page'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// HEP Status Badge — shows L1 ring buffer + L2 overflow stats
// ---------------------------------------------------------------------------

function HepStatusBadge({ status, isZh }: { status: HepStatus; isZh: boolean }) {
  if (!status.running) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-500/10 border border-red-500/30 text-red-400">
        <Radio className="w-3 h-3" />
        HEP {isZh ? '离线' : 'Offline'}
      </span>
    );
  }

  const bufCount = status.buffer_count || 0;
  const received = status.received || 0;
  const parsed = status.parsed || 0;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full bg-green-500/10 border border-green-500/30 text-green-400 cursor-help"
      title={[
        `L1 Ring: ${bufCount} msgs`,
        `Received: ${received}`,
        `Parsed: ${parsed}`,
        `Errors: ${status.errors || 0}`,
        status.listen_addr ? `Addr: ${status.listen_addr}` : '',
      ].filter(Boolean).join('\n')}
    >
      <Radio className="w-3 h-3 animate-pulse" />
      HEP {isZh ? '在线' : 'Live'}
      <span className="text-green-300/70">L1:{bufCount}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Data Source Badge — indicates where the message came from
// ---------------------------------------------------------------------------

function DataSourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const label = DATA_SOURCE_LABELS[source];
  if (!label) return null;

  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 text-[10px] rounded border ${label.color}`}>
      {source === 'hep' && <Layers className="w-2.5 h-2.5" />}
      {source === 'hep_mongo' && <Database className="w-2.5 h-2.5" />}
      {label.zh}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format Date as local datetime-local input value (YYYY-MM-DDTHH:mm) */
function formatLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(ts: string): string {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function formatShortTime(ts: string): string {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  } catch {
    return ts;
  }
}

function relativeTime(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return '';
  }
}

function scenarioLabel(scenario: string, lang: string): string {
  if (!scenario) return '-';
  const opt = SCENARIO_OPTIONS.find((s) => s.value === scenario);
  if (!opt) return scenario;
  return lang === 'zh' ? opt.label_zh : opt.label_en;
}

function statusIcon(status: TraceStatus) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-400" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-400" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SignalingTrace() {
  const { language } = useI18n();
  const isZh = language === 'zh';

  // --- Query panel state ---
  const [queryType, setQueryType] = useState<QueryType>('imsi');
  const [queryValue, setQueryValue] = useState('');
  const [scenario, setScenario] = useState<TraceScenario>('all');
  const [timeStart, setTimeStart] = useState(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return formatLocalDatetime(d);
  });
  const [timeEnd, setTimeEnd] = useState(() => {
    const d = new Date();
    d.setHours(19, 0, 0, 0);
    return formatLocalDatetime(d);
  });
  const [sources] = useState<string[]>(['logs', 'pcap']);

  // --- Traces list ---
  const [traces, setTraces] = useState<SignalingTraceType[]>([]);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [tracesPage] = useState(1);
  const [tracesTotal, setTracesTotal] = useState(0);

  // --- Active trace ---
  const [activeTrace, setActiveTrace] = useState<SignalingTraceType | null>(null);
  const [messages, setMessages] = useState<SignalingMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [protocolFilter, setProtocolFilter] = useState<string>('ALL');
  const [msgPage, setMsgPage] = useState(1);
  const [msgTotal, setMsgTotal] = useState(0);
  const msgPageSize = 100;

  // --- HEP status (two-tier ring buffer) ---
  const [hepStatus, setHepStatus] = useState<HepStatus | null>(null);

  // --- UI state ---
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Selected message ---
  const [selectedMsg, setSelectedMsg] = useState<SignalingMessage | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'ladder' | 'homer'>('table');

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ---------------------------------------------------------------------------
  // API: fetch traces list
  // ---------------------------------------------------------------------------
  const fetchTraces = useCallback(async () => {
    setTracesLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(tracesPage));
      params.set('page_size', '20');
      const resp = await authFetch(`/api/v1/signaling/traces?${params}`);
      if (!resp.ok) {
        console.warn('[SignalingTrace] fetchTraces non-OK:', resp.status);
        return;
      }
      const data = await resp.json();
      if (data.status === 'ok') {
        setTraces(Array.isArray(data.traces) ? data.traces : []);
        setTracesTotal(data.total || 0);
      }
    } catch (err) {
      console.error('[SignalingTrace] fetchTraces error:', err);
    } finally {
      setTracesLoading(false);
    }
  }, [tracesPage]);

  // ---------------------------------------------------------------------------
  // API: fetch HEP listener status (two-tier ring buffer)
  // ---------------------------------------------------------------------------
  const fetchHepStatus = useCallback(async () => {
    try {
      const resp = await authFetch('/api/v1/signaling/hep/status');
      if (!resp.ok) return;
      const data = await resp.json();
      setHepStatus(data as HepStatus);
    } catch {
      // non-critical, silently ignore
    }
  }, []);

  // ---------------------------------------------------------------------------
  // API: fetch single trace status (polling)
  // ---------------------------------------------------------------------------
  const fetchTraceStatus = useCallback(
    async (traceId: string) => {
      try {
        const resp = await authFetch(`/api/v1/signaling/trace/${traceId}`);
        if (!resp.ok) {
          console.warn('[SignalingTrace] fetchTraceStatus non-OK:', resp.status);
          return;
        }
        const data = await resp.json();
        if (data.status === 'ok' && data.data) {
          const trace = data.data as SignalingTraceType;
          // 确保关键字段有默认值，防止渲染时 undefined 崩溃
          trace.entities = trace.entities || [];
          trace.summary = trace.summary || {} as typeof trace.summary;
          trace.message_count = trace.message_count || 0;
          setActiveTrace(trace);
          if (trace.status === 'running') {
            // continue polling
            pollTimer.current = setTimeout(() => fetchTraceStatus(traceId), 2000);
          } else {
            // completed or error — load messages
            showToast(
              trace.status === 'completed'
                ? isZh
                  ? `追踪完成，共 ${trace.message_count} 条消息`
                  : `Trace completed, ${trace.message_count} messages`
                : isZh
                  ? '追踪失败'
                  : 'Trace failed',
              trace.status === 'completed' ? 'success' : 'error',
            );
            fetchTraces();
            fetchMessages(traceId);
          }
        }
      } catch (err) {
        console.error('[SignalingTrace] fetchTraceStatus error:', err);
      }
    },
    [fetchTraces, showToast, isZh],
  );

  // ---------------------------------------------------------------------------
  // API: fetch messages
  // ---------------------------------------------------------------------------
  const fetchMessages = useCallback(
    async (traceId: string, page: number = 1, protocol?: string) => {
      setMessagesLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('page_size', String(msgPageSize));
        if (protocol && protocol !== 'ALL') {
          params.set('protocol', protocol);
        }
        const resp = await authFetch(`/api/v1/signaling/trace/${traceId}/messages?${params}`);
        if (!resp.ok) {
          console.warn('[SignalingTrace] fetchMessages non-OK:', resp.status);
          setMessages([]);
          return;
        }
        const data = await resp.json();
        if (data.status === 'ok') {
          const msgs = (data.messages || []).map((m: SignalingMessage) => ({
            ...m,
            identifiers: m.identifiers || {},
            src_entity: m.src_entity || '',
            dst_entity: m.dst_entity || '',
            protocol: m.protocol || 'UNKNOWN',
            method: m.method || '',
            direction: m.direction || 'indication',
          }));
          setMessages(msgs);
          setMsgTotal(data.total || 0);
          setMsgPage(page);
        }
      } catch (err) {
        console.error('[SignalingTrace] fetchMessages error:', err);
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    },
    [msgPageSize],
  );

  // ---------------------------------------------------------------------------
  // API: create trace
  // ---------------------------------------------------------------------------
  const handleCreateTrace = async () => {
    if (!queryValue.trim()) {
      showToast(isZh ? '请输入查询值' : 'Please enter a query value', 'error');
      return;
    }

    setCreating(true);
    try {
      const body: TraceQuery = {
        query_type: queryType,
        query_value: queryValue.trim(),
        scenario,
        time_range: {
          start: new Date(timeStart).toISOString(),
          end: new Date(timeEnd).toISOString(),
        },
        sources,
      };

      const resp = await authFetch('/api/v1/signaling/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.error('[SignalingTrace] create trace failed:', resp.status, errText);
        showToast(`Create failed (${resp.status})`, 'error');
        return;
      }

      const data = await resp.json();

      if (data.status === 'ok' && data.data?.trace_id) {
        showToast(isZh ? '追踪任务已创建' : 'Trace task created', 'success');
        // 先刷新历史列表，再开始轮询状态
        fetchTraces().catch(() => {});
        fetchTraceStatus(data.data.trace_id);
      } else {
        showToast(data.message || 'Failed to create trace', 'error');
      }
    } catch (err) {
      console.error('[SignalingTrace] handleCreateTrace error:', err);
      showToast(isZh ? '请求失败' : 'Request failed', 'error');
    } finally {
      setCreating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // API: delete trace
  // ---------------------------------------------------------------------------
  const handleDeleteTrace = async (traceId: string) => {
    try {
      const resp = await authFetch(`/api/v1/signaling/trace/${traceId}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.status === 'ok') {
        showToast(isZh ? '已删除' : 'Deleted', 'success');
        if (activeTrace?.trace_id === traceId) {
          setActiveTrace(null);
          setMessages([]);
        }
        fetchTraces();
      } else {
        showToast(data.message || 'Delete failed', 'error');
      }
    } catch {
      showToast(isZh ? '删除失败' : 'Delete failed', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // Select a trace from history
  // ---------------------------------------------------------------------------
  const handleSelectTrace = (trace: SignalingTraceType) => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    // 确保关键字段有默认值
    trace.entities = trace.entities || [];
    trace.summary = trace.summary || {} as typeof trace.summary;
    trace.message_count = trace.message_count || 0;
    setActiveTrace(trace);
    setSelectedMsg(null);
    if (trace.status === 'completed') {
      fetchMessages(trace.trace_id, 1, protocolFilter !== 'ALL' ? protocolFilter : undefined);
    } else if (trace.status === 'running') {
      fetchTraceStatus(trace.trace_id);
    }
  };

  // ---------------------------------------------------------------------------
  // Scenario quick buttons
  // ---------------------------------------------------------------------------
  const handleScenarioQuick = (s: TraceScenario) => {
    setScenario(s);
  };

  // ---------------------------------------------------------------------------
  // Protocol filter change
  // ---------------------------------------------------------------------------
  const handleProtocolFilterChange = (proto: string) => {
    setProtocolFilter(proto);
    if (activeTrace) {
      fetchMessages(activeTrace.trace_id, 1, proto !== 'ALL' ? proto : undefined);
    }
  };

  // ---------------------------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchTraces();
    fetchHepStatus();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [fetchTraces, fetchHepStatus]);

  // ---------------------------------------------------------------------------
  // Derived: filtered messages by protocol (client-side for current page)
  // ---------------------------------------------------------------------------
  const displayMessages = protocolFilter === 'ALL'
    ? messages
    : messages.filter((m) => m.protocol === protocolFilter);

  // Unique protocols in current messages
  const protocolsInMessages = Array.from(new Set((messages || []).map((m) => m.protocol)));

  // Safe accessors for activeTrace — 确保字段不为 undefined/null，防止渲染崩溃
  const traceEntities: string[] = activeTrace?.entities || [];
  const traceSummary = activeTrace?.summary || null;
  const traceQueryType = activeTrace?.query_type || '';
  const traceQueryValue = activeTrace?.query_value || '';
  const traceScenario = activeTrace?.scenario || 'all';
  const traceStatus = activeTrace?.status || 'running';
  const traceCreatedAt = activeTrace?.created_at || '';

  // Current query type option
  const currentQueryOption = QUERY_TYPE_OPTIONS.find((o) => o.value === queryType);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header + Scenario quick buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-sky-400" />
          <h1 className="text-lg font-semibold text-noc-text">
            {isZh ? '信令追踪' : 'Signaling Trace'}
          </h1>
          {tracesTotal > 0 && (
            <span className="text-xs text-noc-muted bg-noc-bg-50 px-2 py-0.5 rounded-full">
              {tracesTotal} {isZh ? '条记录' : 'traces'}
            </span>
          )}
          {/* HEP two-tier ring buffer status */}
          {hepStatus?.enabled && (
            <HepStatusBadge status={hepStatus} isZh={isZh} />
          )}
        </div>
        {/* Scenario quick buttons */}
        <div className="flex flex-wrap gap-1.5">
          {SCENARIO_OPTIONS.filter((s) => s.value !== 'all').map((s) => (
            <button
              key={s.value}
              onClick={() => handleScenarioQuick(s.value)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                scenario === s.value
                  ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                  : 'bg-noc-surface border-noc-border text-noc-muted hover:text-noc-text hover:border-noc-border/80'
              }`}
            >
              <span className="mr-1">{s.icon}</span>
              {isZh ? s.label_zh : s.label_en}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout: query panel + history */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Query panel */}
        <div className="lg:col-span-1 bg-noc-surface rounded-xl border border-noc-border p-4 shadow-sm">
          <h2 className="text-sm font-medium text-noc-text mb-3 flex items-center gap-1.5">
            <Search className="w-4 h-4 text-noc-muted" />
            {isZh ? '查询条件' : 'Query'}
          </h2>

          {/* Query type */}
          <div className="mb-3">
            <label className="block text-xs text-noc-muted mb-1">
              {isZh ? '查询类型' : 'Query Type'}
            </label>
            <select
              value={queryType}
              onChange={(e) => setQueryType(e.target.value as QueryType)}
              className="w-full bg-noc-bg border border-noc-border rounded-md px-3 py-1.5 text-sm text-noc-text focus:outline-none focus:border-sky-500/50"
            >
              {QUERY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Query value */}
          <div className="mb-3">
            <label className="block text-xs text-noc-muted mb-1">
              {isZh ? '查询值' : 'Query Value'}
            </label>
            <input
              type="text"
              value={queryValue}
              onChange={(e) => setQueryValue(e.target.value)}
              placeholder={currentQueryOption?.placeholder || ''}
              className="w-full bg-noc-bg border border-noc-border rounded-md px-3 py-1.5 text-sm text-noc-text placeholder:text-noc-muted/50 focus:outline-none focus:border-sky-500/50"
            />
          </div>

          {/* Scenario */}
          <div className="mb-3">
            <label className="block text-xs text-noc-muted mb-1">
              {isZh ? '场景' : 'Scenario'}
            </label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as TraceScenario)}
              className="w-full bg-noc-bg border border-noc-border rounded-md px-3 py-1.5 text-sm text-noc-text focus:outline-none focus:border-sky-500/50"
            >
              {SCENARIO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.icon} {isZh ? opt.label_zh : opt.label_en}
                </option>
              ))}
            </select>
          </div>

          {/* Time range */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-noc-muted mb-1">
                {isZh ? '开始时间' : 'Start'}
              </label>
              <input
                type="datetime-local"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
                className="w-full bg-noc-bg border border-noc-border rounded-md px-2 py-1.5 text-xs text-noc-text focus:outline-none focus:border-sky-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-noc-muted mb-1">
                {isZh ? '结束时间' : 'End'}
              </label>
              <input
                type="datetime-local"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
                className="w-full bg-noc-bg border border-noc-border rounded-md px-2 py-1.5 text-xs text-noc-text focus:outline-none focus:border-sky-500/50"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleCreateTrace}
            disabled={creating || !queryValue.trim()}
            className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-600/40 disabled:cursor-not-allowed text-white rounded-md px-4 py-2 text-sm font-medium transition-colors"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isZh ? '开始追踪' : 'Start Trace'}
          </button>
        </div>

        {/* Trace history */}
        <div className="lg:col-span-2 bg-noc-surface rounded-xl border border-noc-border shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-noc-border">
            <h2 className="text-sm font-medium text-noc-text flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-noc-muted" />
              {isZh ? '追踪历史' : 'Trace History'}
            </h2>
            <button
              onClick={fetchTraces}
              className="p-1 text-noc-muted hover:text-noc-text transition-colors"
              title={isZh ? '刷新' : 'Refresh'}
            >
              <RefreshCw className={`w-4 h-4 ${tracesLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {tracesLoading && traces.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-noc-muted text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {isZh ? '加载中...' : 'Loading...'}
              </div>
            ) : traces.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-noc-muted text-sm">
                <GitBranch className="w-8 h-8 mb-2 opacity-30" />
                {isZh ? '暂无追踪记录' : 'No traces yet'}
              </div>
            ) : (
              <div className="divide-y divide-noc-border">
                {traces.map((trace) => {
                  const isActive = activeTrace?.trace_id === trace.trace_id;
                  return (
                    <div
                      key={trace.trace_id}
                      onClick={() => handleSelectTrace(trace)}
                      className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-sky-500/10 border-l-2 border-l-sky-500'
                          : 'hover:bg-noc-bg-50 border-l-2 border-l-transparent'
                      }`}
                    >
                      {statusIcon(trace.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-noc-text truncate">
                            {(trace.query_type || '').toUpperCase()}: {trace.query_value || ''}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-noc-bg-50 text-noc-muted">
                            {scenarioLabel(trace.scenario, language)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-noc-muted">
                          <span>{trace.message_count || 0} {isZh ? '条消息' : 'msgs'}</span>
                          <span>{relativeTime(trace.created_at)}</span>
                          {trace.entities && trace.entities.length > 0 && (
                            <span className="truncate">
                              {trace.entities.slice(0, 5).join(' → ')}
                              {trace.entities.length > 5 && ' ...'}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTrace(trace.trace_id);
                        }}
                        className="p-1 text-noc-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        title={isZh ? '删除' : 'Delete'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-noc-muted/50 shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trace results */}
      {activeTrace && (
        <div className="bg-noc-surface rounded-xl border border-noc-border shadow-sm">
          {/* Summary header */}
          <div className="px-4 py-3 border-b border-noc-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {statusIcon(traceStatus as TraceStatus)}
                <span className="text-sm font-medium text-noc-text">
                  {traceQueryType.toUpperCase()}: {traceQueryValue}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-noc-bg-50 text-noc-muted">
                  {scenarioLabel(traceScenario, language)}
                </span>
                {traceStatus === 'running' && (
                  <span className="text-xs text-blue-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {isZh ? '解析中...' : 'Parsing...'}
                  </span>
                )}
              </div>
              <span className="text-xs text-noc-muted">
                {formatTime(traceCreatedAt)}
              </span>
            </div>

            {/* Summary cards */}
            {traceStatus === 'completed' && traceSummary && (
              <div className="flex flex-wrap gap-2">
                {SUMMARY_STEPS.map((step) => {
                  const ok = traceSummary[step.key];
                  return (
                    <div
                      key={step.key}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                        ok
                          ? 'bg-green-500/10 border-green-500/30 text-green-400'
                          : 'bg-red-500/10 border-red-500/30 text-red-400'
                      }`}
                    >
                      {ok ? (
                        <CheckCircle className="w-3.5 h-3.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                      {isZh ? step.label_zh : step.label_en}
                    </div>
                  );
                })}
                {traceSummary?.error_step && (
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-red-500/10 border border-red-500/30 text-red-300">
                    <XCircle className="w-3.5 h-3.5" />
                    {traceSummary.error_step}: {traceSummary.error_detail}
                  </div>
                )}
              </div>
            )}

            {/* Entities ladder (compact) */}
            {traceEntities.length > 0 && (
              <div className="mt-2 flex items-center gap-1 text-xs text-noc-muted overflow-x-auto">
                {traceEntities.map((entity, i) => (
                  <span key={entity} className="flex items-center gap-1 shrink-0">
                    <span title={entity}>
                      {ENTITY_ICONS[entity] || '🔲'} {entity}
                    </span>
                    {i < traceEntities.length - 1 && (
                      <span className="text-noc-muted/40">—</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* View mode + Protocol filter tabs */}
          <div className="px-4 py-2 border-b border-noc-border flex items-center gap-3 overflow-x-auto">
            {/* View mode toggle */}
            <div className="flex rounded-md border border-noc-border overflow-hidden shrink-0">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  viewMode === 'table'
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'bg-noc-surface text-noc-muted hover:text-noc-text'
                }`}
              >
                {isZh ? '表格' : 'Table'}
              </button>
              <button
                onClick={() => setViewMode('ladder')}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  viewMode === 'ladder'
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'bg-noc-surface text-noc-muted hover:text-noc-text'
                }`}
              >
                {isZh ? '梯形图' : 'Ladder'}
              </button>
              <button
                onClick={() => setViewMode('homer')}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  viewMode === 'homer'
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'bg-noc-surface text-noc-muted hover:text-noc-text'
                }`}
              >
                Homer
              </button>
            </div>

            {/* Protocol filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-noc-muted shrink-0" />
              <button
                onClick={() => handleProtocolFilterChange('ALL')}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors shrink-0 ${
                  protocolFilter === 'ALL'
                    ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                    : 'bg-noc-bg border-noc-border text-noc-muted hover:text-noc-text'
                }`}
              >
                ALL ({msgTotal})
              </button>
              {protocolsInMessages.map((proto) => {
                const colors = PROTOCOL_TEXT_COLORS[proto as SignalingProtocol] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
                const count = messages.filter((m) => m.protocol === proto).length;
                return (
                  <button
                    key={proto}
                    onClick={() => handleProtocolFilterChange(proto)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors shrink-0 ${
                      protocolFilter === proto
                        ? `${colors} ring-1 ring-white/20`
                        : 'bg-noc-bg border-noc-border text-noc-muted hover:text-noc-text'
                    }`}
                  >
                    {proto} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content based on viewMode */}
          {viewMode === 'table' && (
          <>
          <div className="overflow-x-auto">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-12 text-noc-muted text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {isZh ? '加载消息...' : 'Loading messages...'}
              </div>
            ) : displayMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-noc-muted text-sm">
                {isZh ? '暂无消息' : 'No messages'}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-noc-bg-50 text-noc-muted border-b border-noc-border">
                    <th className="px-3 py-2 text-left font-medium w-24">
                      {isZh ? '时间' : 'Time'}
                    </th>
                    <th className="px-3 py-2 text-left font-medium w-16">
                      {isZh ? '协议' : 'Protocol'}
                    </th>
                    <th className="px-3 py-2 text-left font-medium w-16">
                      {isZh ? '接口' : 'Interface'}
                    </th>
                    <th className="px-3 py-2 text-left font-medium w-12">
                      {isZh ? '方向' : 'Dir'}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {isZh ? '方法' : 'Method'}
                    </th>
                    <th className="px-3 py-2 text-left font-medium w-24">
                      {isZh ? '源' : 'Source'}
                    </th>
                    <th className="px-3 py-2 text-center font-medium w-6" />
                    <th className="px-3 py-2 text-left font-medium w-24">
                      {isZh ? '目的' : 'Dest'}
                    </th>
                    <th className="px-3 py-2 text-left font-medium w-32">
                      {isZh ? '标识' : 'Identifiers'}
                    </th>
                    <th className="px-3 py-2 text-left font-medium w-16">
                      {isZh ? '状态' : 'Status'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-noc-border">
                  {displayMessages.map((msg) => {
                    const isSelected = selectedMsg?.id === msg.id;
                    const protoColor = PROTOCOL_COLORS[msg.protocol] || '#6b7280';
                    const badgeClass = PROTOCOL_TEXT_COLORS[msg.protocol as SignalingProtocol] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';

                    // Build identifier display
                    const idParts: string[] = [];
                    if (msg.identifiers.imsi) idParts.push(`IMSI:${msg.identifiers.imsi}`);
                    if (msg.identifiers.msisdn) idParts.push(`MSISDN:${msg.identifiers.msisdn}`);
                    if (msg.identifiers.sip_uri) idParts.push(msg.identifiers.sip_uri);
                    if (msg.identifiers.teid) idParts.push(`TEID:${msg.identifiers.teid}`);
                    if (msg.call_id) idParts.push(`CID:${msg.call_id.slice(0, 16)}`);

                    return (
                      <tr
                        key={msg.id}
                        onClick={() => setSelectedMsg(isSelected ? null : msg)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-sky-500/10'
                            : 'hover:bg-noc-bg-50'
                        }`}
                      >
                        <td className="px-3 py-2 text-noc-muted font-mono whitespace-nowrap">
                          {formatShortTime(msg.timestamp)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border ${badgeClass}`}
                            style={{ borderLeftColor: protoColor, borderLeftWidth: 3 }}
                          >
                            {msg.protocol}
                          </span>
                          <DataSourceBadge source={msg.data_source} />
                        </td>
                        <td className="px-3 py-2 text-noc-muted">
                          {msg.interface}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block px-1 py-0.5 text-[10px] rounded ${
                              msg.direction === 'request'
                                ? 'bg-blue-500/20 text-blue-400'
                                : msg.direction === 'response'
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-yellow-500/20 text-yellow-400'
                            }`}
                          >
                            {msg.direction === 'request' ? 'REQ' : msg.direction === 'response' ? 'RSP' : 'IND'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-noc-text font-medium truncate max-w-[200px]">
                          {msg.method}
                        </td>
                        <td className="px-3 py-2 text-noc-muted">
                          <span title={msg.src_entity}>
                            {ENTITY_ICONS[msg.src_entity] || '🔲'} {msg.src_entity}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-noc-muted/40">→</td>
                        <td className="px-3 py-2 text-noc-muted">
                          <span title={msg.dst_entity}>
                            {ENTITY_ICONS[msg.dst_entity] || '🔲'} {msg.dst_entity}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-noc-muted font-mono truncate max-w-[200px]">
                          {idParts.join(' ') || '-'}
                        </td>
                        <td className="px-3 py-2">
                          {msg.status_code ? (
                            <span
                              className={`font-mono ${
                                msg.status_code >= 200 && msg.status_code < 300
                                  ? 'text-green-400'
                                  : msg.status_code >= 400
                                    ? 'text-red-400'
                                    : 'text-yellow-400'
                              }`}
                            >
                              {msg.status_code}
                            </span>
                          ) : (
                            <span className="text-noc-muted">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {msgTotal > msgPageSize && (
            <div className="px-4 py-2 border-t border-noc-border flex items-center justify-between text-xs text-noc-muted">
              <span>
                {isZh ? '共' : 'Total'} {msgTotal} {isZh ? '条' : 'messages'}
                {isZh ? ` 第 ${msgPage} 页` : ` Page ${msgPage}`}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => activeTrace && fetchMessages(activeTrace.trace_id, msgPage - 1, protocolFilter !== 'ALL' ? protocolFilter : undefined)}
                  disabled={msgPage <= 1}
                  className="px-2 py-1 rounded border border-noc-border disabled:opacity-30 hover:bg-noc-bg-50"
                >
                  {isZh ? '上一页' : 'Prev'}
                </button>
                <button
                  onClick={() => activeTrace && fetchMessages(activeTrace.trace_id, msgPage + 1, protocolFilter !== 'ALL' ? protocolFilter : undefined)}
                  disabled={msgPage * msgPageSize >= msgTotal}
                  className="px-2 py-1 rounded border border-noc-border disabled:opacity-30 hover:bg-noc-bg-50"
                >
                  {isZh ? '下一页' : 'Next'}
                </button>
              </div>
            </div>
          )}
          </>
          )}

          {/* Ladder Diagram view */}
          {viewMode === 'ladder' && activeTrace && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder={isZh ? '搜索消息...' : 'Search messages...'}
                  className="flex-1 bg-noc-bg border border-noc-border rounded-md px-3 py-1.5 text-xs text-noc-text placeholder:text-noc-muted/50 focus:outline-none focus:border-sky-500/50"
                />
              </div>
              <LadderDiagram
                messages={displayMessages}
                entities={traceEntities}
                selectedMessageId={selectedMsg?.id}
                onMessageSelect={setSelectedMsg}
                protocolFilter={protocolFilter as SignalingProtocol | 'ALL'}
                searchKeyword={searchKeyword}
              />
            </div>
          )}

          {/* Homer view */}
          {viewMode === 'homer' && activeTrace && (
            <div className="p-4">
              <HomerIntegration
                queryValue={activeTrace.query_value}
                traceId={activeTrace.trace_id}
              />
            </div>
          )}

          {/* Selected message detail */}
          {selectedMsg && (
            <div className="px-4 py-3 border-t border-noc-border bg-noc-bg-50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-noc-text">
                  {isZh ? '消息详情' : 'Message Detail'}
                </h3>
                <button
                  onClick={() => setSelectedMsg(null)}
                  className="text-noc-muted hover:text-noc-text text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-noc-muted">{isZh ? '协议' : 'Protocol'}: </span>
                  <span className="text-noc-text">{selectedMsg.protocol}</span>
                </div>
                <div>
                  <span className="text-noc-muted">{isZh ? '接口' : 'Interface'}: </span>
                  <span className="text-noc-text">{selectedMsg.interface}</span>
                </div>
                <div>
                  <span className="text-noc-muted">{isZh ? '方向' : 'Direction'}: </span>
                  <span className="text-noc-text">{selectedMsg.direction}</span>
                </div>
                <div>
                  <span className="text-noc-muted">{isZh ? '方法' : 'Method'}: </span>
                  <span className="text-noc-text">{selectedMsg.method}</span>
                </div>
                <div>
                  <span className="text-noc-muted">{isZh ? '源地址' : 'Source'}: </span>
                  <span className="text-noc-text font-mono">
                    {selectedMsg.src_ip ? `${selectedMsg.src_ip}:${selectedMsg.src_port}` : selectedMsg.src_entity}
                  </span>
                </div>
                <div>
                  <span className="text-noc-muted">{isZh ? '目的地址' : 'Dest'}: </span>
                  <span className="text-noc-text font-mono">
                    {selectedMsg.dst_ip ? `${selectedMsg.dst_ip}:${selectedMsg.dst_port}` : selectedMsg.dst_entity}
                  </span>
                </div>
                {selectedMsg.session_id && (
                  <div>
                    <span className="text-noc-muted">{isZh ? '会话' : 'Session'}: </span>
                    <span className="text-noc-text font-mono">{selectedMsg.session_id}</span>
                  </div>
                )}
                {selectedMsg.call_id && (
                  <div>
                    <span className="text-noc-muted">Call-ID: </span>
                    <span className="text-noc-text font-mono truncate">{selectedMsg.call_id}</span>
                  </div>
                )}
              </div>
              {/* Identifiers */}
              {selectedMsg.identifiers && Object.entries(selectedMsg.identifiers).some(([, v]) => v) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(selectedMsg.identifiers)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 text-[10px] rounded bg-noc-bg border border-noc-border text-noc-muted font-mono"
                      >
                        {k}: {v}
                      </span>
                    ))}
                </div>
              )}
              {/* Raw preview */}
              {selectedMsg.raw_preview && (
                <details className="mt-2">
                  <summary className="text-xs text-noc-muted cursor-pointer hover:text-noc-text">
                    {isZh ? '原始数据预览' : 'Raw Preview'}
                  </summary>
                  <pre className="mt-1 p-2 bg-noc-bg rounded text-[10px] text-noc-muted overflow-x-auto max-h-40">
                    {selectedMsg.raw_preview}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 用 ErrorBoundary 包裹导出，防止渲染错误导致白屏
export default function SignalingTraceWithErrorBoundary() {
  const { language } = useI18n();
  return (
    <SignalingErrorBoundary isZh={language === 'zh'}>
      <SignalingTrace />
    </SignalingErrorBoundary>
  );
}
