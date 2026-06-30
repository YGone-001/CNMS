import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FileText,
  Search,
  Download,
  RefreshCw,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Terminal,
  Server,
  Wifi,
  Radio,
  Link2,
  Zap,
  Play,
  Square,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ---- Log source definitions ----
interface LogSource {
  id: string;
  name: string;
  icon: React.ReactNode;
  group: string;
}

const LOG_SOURCES: LogSource[] = [
  // EPC+5GC
  { id: 'amfd', name: 'AMF', icon: <Wifi className="w-3.5 h-3.5" />, group: '5GC' },
  { id: 'ausfd', name: 'AUSF', icon: <Server className="w-3.5 h-3.5" />, group: '5GC' },
  { id: 'nssfd', name: 'NSSF', icon: <Server className="w-3.5 h-3.5" />, group: '5GC' },
  { id: 'nrfd', name: 'NRF', icon: <Server className="w-3.5 h-3.5" />, group: '5GC' },
  { id: 'smfd', name: 'SMF', icon: <Server className="w-3.5 h-3.5" />, group: '5GC' },
  { id: 'upfd', name: 'UPF', icon: <Server className="w-3.5 h-3.5" />, group: '5GC' },
  { id: 'pcfd', name: 'PCF', icon: <Server className="w-3.5 h-3.5" />, group: '5GC' },
  { id: 'udmd', name: 'UDM', icon: <Server className="w-3.5 h-3.5" />, group: '5GC' },
  { id: 'udrd', name: 'UDR', icon: <Server className="w-3.5 h-3.5" />, group: '5GC' },
  { id: 'mmed', name: 'MME', icon: <Server className="w-3.5 h-3.5" />, group: 'EPC' },
  { id: 'hssd', name: 'HSS', icon: <Server className="w-3.5 h-3.5" />, group: 'EPC' },
  { id: 'sgwcd', name: 'SGWC', icon: <Server className="w-3.5 h-3.5" />, group: 'EPC' },
  { id: 'sgwud', name: 'SGWU', icon: <Server className="w-3.5 h-3.5" />, group: 'EPC' },
  { id: 'pgwcd', name: 'PGWC', icon: <Server className="w-3.5 h-3.5" />, group: 'EPC' },
  { id: 'pgwud', name: 'PGWU', icon: <Server className="w-3.5 h-3.5" />, group: 'EPC' },
  { id: 'pcrfd', name: 'PCRF', icon: <Server className="w-3.5 h-3.5" />, group: 'EPC' },
  // IMS
  { id: 'pcscf', name: 'P-CSCF', icon: <Radio className="w-3.5 h-3.5" />, group: 'IMS' },
  { id: 'icscf', name: 'I-CSCF', icon: <Radio className="w-3.5 h-3.5" />, group: 'IMS' },
  { id: 'scscf', name: 'S-CSCF', icon: <Radio className="w-3.5 h-3.5" />, group: 'IMS' },
  { id: 'imsHss', name: 'IMS HSS', icon: <Link2 className="w-3.5 h-3.5" />, group: 'IMS' },
];

// ---- Types ----
interface StreamLog {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  raw: string;
  source: string;
}

export default function LogCenter() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'history' | 'stream'>('history');
  const [selectedSource, setSelectedSource] = useState<string>('amfd');
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [alarmKeywords, setAlarmKeywords] = useState<string[]>([]);

  // Streaming state
  const [streamLogs, setStreamLogs] = useState<StreamLog[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamFilter, setStreamFilter] = useState({ level: '', keyword: '' });
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const streamIdRef = useRef(0);

  // Fetch alarm keywords for linking
  useEffect(() => {
    const fetchAlarms = async () => {
      try {
        const resp = await fetch('/api/v1/alarms?active=true&page_size=50');
        const data = await resp.json();
        if (data.status === 'ok' && data.alarms) {
          const keywords = data.alarms.flatMap((a: { source: string; message: string }) => [
            a.source.toLowerCase(),
            ...a.message.split(/\s+/).filter((w: string) => w.length > 3).map((w: string) => w.toLowerCase()),
          ]);
          setAlarmKeywords([...new Set(keywords)]);
        }
      } catch { /* ignore */ }
    };
    fetchAlarms();
  }, []);

  // Group sources
  const groupedSources = useMemo(() => {
    const groups: Record<string, LogSource[]> = {};
    LOG_SOURCES.forEach((s) => {
      if (!groups[s.group]) groups[s.group] = [];
      groups[s.group].push(s);
    });
    return groups;
  }, []);

  // ---- WebSocket streaming ----
  const startStream = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setStreamLogs([]);
    setStreaming(true);

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/api/v1/nf/logs/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ name: selectedSource, level: streamFilter.level, keyword: streamFilter.keyword, tail: 100 }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'meta' || msg.type === 'stats') return;
        const log: StreamLog = {
          id: String(++streamIdRef.current),
          timestamp: msg.timestamp || '',
          level: (msg.level || 'INFO').toUpperCase(),
          message: msg.message || msg.raw || '',
          raw: msg.raw || msg.message || '',
          source: selectedSource,
        };
        setStreamLogs((prev) => {
          const next = [...prev, log];
          return next.length > 2000 ? next.slice(-1500) : next;
        });
      } catch { /* ignore */ }
    };

    ws.onclose = () => setStreaming(false);
    ws.onerror = () => { ws.close(); setStreaming(false); };
  }, [selectedSource, streamFilter]);

  const stopStream = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStreaming(false);
  }, []);

  useEffect(() => {
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (tab === 'stream' && streaming) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamLogs, tab, streaming]);

  // Update stream filter in real-time
  useEffect(() => {
    if (streaming && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'filter', level: streamFilter.level, keyword: streamFilter.keyword }));
    }
  }, [streamFilter, streaming]);

  // ---- Filtering ----
  const filteredStreamLogs = useMemo(() => {
    return streamLogs.filter((log) => {
      if (levelFilter !== 'all' && !log.level.toLowerCase().includes(levelFilter)) return false;
      if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [streamLogs, levelFilter, searchTerm]);

  // ---- Helpers ----
  const getLevelIcon = (level: string) => {
    const l = level.toLowerCase();
    if (l.includes('error')) return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    if (l.includes('warn')) return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    if (l.includes('debug')) return <Terminal className="w-3.5 h-3.5 text-gray-400" />;
    return <Info className="w-3.5 h-3.5 text-blue-400" />;
  };

  const getLevelColor = (level: string) => {
    const l = level.toLowerCase();
    if (l.includes('error')) return 'bg-red-500/10 text-red-400 border-red-500/20';
    if (l.includes('warn')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (l.includes('debug')) return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  };

  // Highlight alarm-related keywords in log message
  const highlightMessage = (msg: string) => {
    if (alarmKeywords.length === 0) return msg;
    const parts: React.ReactNode[] = [];
    let remaining = msg;
    const regex = new RegExp(`(${alarmKeywords.filter(k => k.length > 3).join('|')})`, 'gi');
    let match;
    let lastIndex = 0;
    while ((match = regex.exec(msg)) !== null) {
      if (match.index > lastIndex) {
        parts.push(msg.slice(lastIndex, match.index));
      }
      parts.push(
        <span key={match.index} className="bg-red-500/20 text-red-300 px-0.5 rounded cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); navigate('/alarms'); }}>
          {match[0]}
        </span>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < msg.length) {
      parts.push(msg.slice(lastIndex));
    }
    return parts.length > 0 ? parts : msg;
  };

  const currentSource = LOG_SOURCES.find((s) => s.id === selectedSource);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-noc-text">日志中心</h1>
          <p className="text-sm text-noc-muted mt-1">实时日志流与历史日志查询</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-noc-surface rounded-lg p-1 border border-noc-border">
            <button onClick={() => setTab('history')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'history' ? 'bg-noc-accent/10 text-noc-accent border border-noc-accent/30' : 'text-noc-muted hover:text-noc-text border border-transparent'}`}>
              <FileText className="w-3.5 h-3.5 inline mr-1" />历史
            </button>
            <button onClick={() => setTab('stream')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'stream' ? 'bg-noc-accent/10 text-noc-accent border border-noc-accent/30' : 'text-noc-muted hover:text-noc-text border border-transparent'}`}>
              <Zap className="w-3.5 h-3.5 inline mr-1" />实时流
            </button>
          </div>
        </div>
      </div>

      {/* Source selector */}
      <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-4 h-4 text-noc-muted" />
          <span className="text-sm font-medium text-noc-text">日志源</span>
          {currentSource && <span className="text-xs text-noc-accent ml-2">当前: {currentSource.name}</span>}
        </div>
        {Object.entries(groupedSources).map(([group, sources]) => (
          <div key={group} className="mb-2">
            <div className="text-[10px] text-noc-muted uppercase tracking-wider mb-1">{group}</div>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSource(s.id); if (streaming) { stopStream(); } }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all ${
                    selectedSource === s.id
                      ? 'bg-noc-accent/10 text-noc-accent border border-noc-accent/30'
                      : 'bg-noc-bg text-noc-muted border border-noc-border hover:border-noc-accent/30'
                  }`}
                >
                  {s.icon}
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Filters + Stream controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
          <input
            type="text"
            placeholder="搜索日志..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
          />
        </div>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="px-3 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text">
          <option value="all">全部级别</option>
          <option value="error">ERROR</option>
          <option value="warn">WARN</option>
          <option value="info">INFO</option>
          <option value="debug">DEBUG</option>
        </select>
        {tab === 'stream' && (
          <>
            <input
              type="text"
              placeholder="关键字过滤..."
              value={streamFilter.keyword}
              onChange={(e) => setStreamFilter((prev) => ({ ...prev, keyword: e.target.value }))}
              className="px-3 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent w-40"
            />
            {streaming ? (
              <button onClick={stopStream} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm hover:bg-red-500/20 transition-colors">
                <Square className="w-4 h-4" />停止
              </button>
            ) : (
              <button onClick={startStream} className="flex items-center gap-2 px-4 py-2 bg-noc-accent text-white rounded-lg text-sm hover:opacity-90 transition-opacity">
                <Play className="w-4 h-4" />开始监听
              </button>
            )}
            {streaming && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                实时接收中 · {filteredStreamLogs.length} 行
              </span>
            )}
          </>
        )}
        <button onClick={() => {}} className="flex items-center gap-2 px-3 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-muted hover:text-noc-text transition-colors">
          <Download className="w-4 h-4" />导出
        </button>
      </div>

      {/* Log list */}
      {tab === 'stream' ? (
        <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto font-mono text-xs">
            {filteredStreamLogs.length === 0 ? (
              <div className="text-center py-12">
                <Terminal className="w-10 h-10 text-noc-muted mx-auto mb-3" />
                <p className="text-noc-muted">{streaming ? '等待日志数据...' : '点击「开始监听」启动实时日志流'}</p>
                <p className="text-xs text-noc-muted mt-1">源: {currentSource?.name || selectedSource}</p>
              </div>
            ) : (
              <div className="divide-y divide-noc-border/50">
                {filteredStreamLogs.map((log) => {
                  const isExpanded = expandedLog === log.id;
                  const hasContext = log.raw.length > 120 || log.raw.includes('\n');
                  return (
                    <div key={log.id}>
                      <div
                        className={`flex items-start gap-2 px-4 py-1.5 cursor-pointer transition-colors ${isExpanded ? 'bg-noc-bg' : 'hover:bg-noc-bg/50'}`}
                        onClick={() => hasContext && setExpandedLog(isExpanded ? null : log.id)}
                      >
                        <span className="flex-shrink-0 w-4 mt-0.5">
                          {hasContext && (isExpanded ? <ChevronDown className="w-3 h-3 text-noc-muted" /> : <ChevronRight className="w-3 h-3 text-noc-muted" />)}
                        </span>
                        <span className="flex-shrink-0 text-noc-muted w-36">{log.timestamp}</span>
                        <span className={`flex-shrink-0 w-14 text-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${getLevelColor(log.level)}`}>{log.level}</span>
                        <span className="flex-1 min-w-0 break-all text-noc-text whitespace-pre-wrap">{highlightMessage(log.message)}</span>
                      </div>
                      {isExpanded && hasContext && (
                        <div className="ml-6 mr-4 mb-2 p-3 bg-noc-bg rounded-lg border border-noc-border">
                          <div className="text-[10px] text-noc-muted mb-1">完整日志:</div>
                          <pre className="text-xs text-noc-text whitespace-pre-wrap break-all">{log.raw}</pre>
                          <div className="mt-2 flex items-center gap-2">
                            <button onClick={() => { navigate('/alarms'); }} className="flex items-center gap-1 text-[10px] text-noc-accent hover:underline">
                              <ExternalLink className="w-3 h-3" />查看关联告警
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-noc-surface border border-noc-border rounded-lg p-12 text-center">
          <FileText className="w-10 h-10 text-noc-muted mx-auto mb-3" />
          <p className="text-noc-muted">历史日志查询</p>
          <p className="text-xs text-noc-muted mt-1">切换到「实时流」标签查看 {currentSource?.name || selectedSource} 的实时日志</p>
        </div>
      )}
    </div>
  );
}
