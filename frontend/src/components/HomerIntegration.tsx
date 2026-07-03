import { useState, useEffect, useCallback, memo } from 'react';
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Globe,
  Database,
} from 'lucide-react';
import { useI18n } from '@/i18nContext';
import { authFetch } from '@/App';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HomerStatus {
  enabled: boolean;
  healthy?: boolean;
  version?: string;
  api_url?: string;
  message?: string;
}

interface HomerIntegrationProps {
  queryValue: string;
  traceId?: string;
}

type HomerMode = 'iframe' | 'api';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function HomerIntegrationInner({ queryValue, traceId }: HomerIntegrationProps) {
  const { language } = useI18n();
  const isZh = language === 'zh';

  const [mode, setMode] = useState<HomerMode>('iframe');
  const [homerStatus, setHomerStatus] = useState<HomerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeUrl, setIframeUrl] = useState('');

  // Fetch Homer status
  const fetchHomerStatus = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await authFetch('/api/v1/signaling/homer/status');
      const data = await resp.json();
      setHomerStatus(data);
    } catch {
      setHomerStatus({ enabled: false, message: 'Failed to check Homer status' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHomerStatus();
  }, [fetchHomerStatus]);

  // Update iframe URL when queryValue changes
  useEffect(() => {
    if (homerStatus?.enabled && homerStatus?.api_url && queryValue) {
      // Homer webapp URL format: /#/search?search={query}
      const baseUrl = homerStatus.api_url.replace(/\/api\/v3.*$/, '');
      setIframeUrl(`${baseUrl}/#/search?search=${encodeURIComponent(queryValue)}`);
    }
  }, [homerStatus, queryValue]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-noc-muted text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {isZh ? '检查 Homer 连接...' : 'Checking Homer connection...'}
      </div>
    );
  }

  // Homer not enabled
  if (!homerStatus?.enabled) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-noc-muted text-sm">
        <Globe className="w-8 h-8 mb-2 opacity-30" />
        <p className="mb-2">{isZh ? 'Homer 集成未启用' : 'Homer integration is disabled'}</p>
        <p className="text-xs text-noc-muted/70">
          {isZh
            ? '请在 config.json 中设置 homer.enabled = true'
            : 'Set homer.enabled = true in config.json'}
        </p>
      </div>
    );
  }

  // Homer enabled but not healthy
  if (homerStatus.enabled && !homerStatus.healthy) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-noc-muted text-sm">
        <AlertTriangle className="w-8 h-8 mb-2 text-yellow-400" />
        <p className="mb-2 text-yellow-400">{isZh ? 'Homer 连接失败' : 'Homer connection failed'}</p>
        <p className="text-xs text-noc-muted/70">{homerStatus.message}</p>
        <button
          onClick={fetchHomerStatus}
          className="mt-3 px-3 py-1.5 text-xs bg-noc-surface border border-noc-border rounded-md hover:bg-noc-bg-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3 inline mr-1" />
          {isZh ? '重试' : 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-noc-bg p-4' : 'relative'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-noc-text">
            {isZh ? 'Homer SIP 信令追踪' : 'Homer SIP Trace'}
          </h3>
          {homerStatus.version && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
              v{homerStatus.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-md border border-noc-border overflow-hidden">
            <button
              onClick={() => setMode('iframe')}
              className={`px-2.5 py-1 text-xs transition-colors ${
                mode === 'iframe'
                  ? 'bg-sky-500/20 text-sky-400'
                  : 'bg-noc-surface text-noc-muted hover:text-noc-text'
              }`}
            >
              <Globe className="w-3 h-3 inline mr-1" />
              {isZh ? '嵌入' : 'Embed'}
            </button>
            <button
              onClick={() => setMode('api')}
              className={`px-2.5 py-1 text-xs transition-colors ${
                mode === 'api'
                  ? 'bg-sky-500/20 text-sky-400'
                  : 'bg-noc-surface text-noc-muted hover:text-noc-text'
              }`}
            >
              <Database className="w-3 h-3 inline mr-1" />
              API
            </button>
          </div>
          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 text-noc-muted hover:text-noc-text transition-colors"
            title={isFullscreen ? (isZh ? '退出全屏' : 'Exit fullscreen') : (isZh ? '全屏' : 'Fullscreen')}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          {/* Open in new tab */}
          {iframeUrl && (
            <a
              href={iframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-noc-muted hover:text-noc-text transition-colors"
              title={isZh ? '在新标签页打开' : 'Open in new tab'}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* Content */}
      {mode === 'iframe' ? (
        <IframeMode
          url={iframeUrl}
          isFullscreen={isFullscreen}
          isZh={isZh}
        />
      ) : (
        <ApiMode
          traceId={traceId}
          isZh={isZh}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iframe Mode
// ---------------------------------------------------------------------------

interface IframeModeProps {
  url: string;
  isFullscreen: boolean;
  isZh: boolean;
}

const IframeMode = memo(function IframeMode({ url, isFullscreen, isZh }: IframeModeProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  if (!url) {
    return (
      <div className="flex items-center justify-center h-40 text-noc-muted text-sm">
        {isZh ? '请输入查询值以搜索 Homer' : 'Enter a query value to search Homer'}
      </div>
    );
  }

  return (
    <div className={`relative border border-noc-border rounded-lg overflow-hidden ${isFullscreen ? 'h-full' : 'h-[600px]'}`}>
      {iframeLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-noc-bg/80 z-10">
          <Loader2 className="w-6 h-6 animate-spin text-noc-muted" />
        </div>
      )}
      {iframeError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-noc-bg z-10">
          <AlertTriangle className="w-8 h-8 mb-2 text-yellow-400" />
          <p className="text-sm text-noc-muted">{isZh ? '加载 Homer 失败' : 'Failed to load Homer'}</p>
          <p className="text-xs text-noc-muted/70 mt-1">
            {isZh ? '请检查 Homer 服务是否正常运行' : 'Please check if Homer service is running'}
          </p>
        </div>
      )}
      <iframe
        src={url}
        className="w-full h-full"
        onLoad={() => setIframeLoading(false)}
        onError={() => {
          setIframeLoading(false);
          setIframeError(true);
        }}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        title="Homer SIP Trace"
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// API Mode
// ---------------------------------------------------------------------------

interface ApiModeProps {
  traceId?: string;
  isZh: boolean;
}

const ApiMode = memo(function ApiMode({ traceId, isZh }: ApiModeProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Homer messages for this trace
  const fetchHomerMessages = useCallback(async () => {
    if (!traceId) return;

    setLoading(true);
    setError(null);
    try {
      const resp = await authFetch(`/api/v1/signaling/trace/${traceId}/messages?protocol=SIP&page_size=200`);
      const data = await resp.json();
      if (data.status === 'ok') {
        setMessages(data.messages || []);
      } else {
        setError(data.message || 'Failed to fetch messages');
      }
    } catch {
      setError(isZh ? '请求失败' : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [traceId, isZh]);

  useEffect(() => {
    if (traceId) fetchHomerMessages();
  }, [traceId, fetchHomerMessages]);

  if (!traceId) {
    return (
      <div className="flex items-center justify-center h-40 text-noc-muted text-sm">
        {isZh ? '请先创建追踪任务' : 'Create a trace first'}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-noc-muted text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {isZh ? '加载 SIP 消息...' : 'Loading SIP messages...'}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 text-red-400 text-sm">
        <AlertTriangle className="w-5 h-5 mr-2" />
        {error}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-noc-muted text-sm">
        <Database className="w-8 h-8 mb-2 opacity-30" />
        {isZh ? '暂无 SIP 消息' : 'No SIP messages'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-noc-muted">
          {isZh ? `共 ${messages.length} 条 SIP 消息` : `${messages.length} SIP messages`}
        </span>
        <button
          onClick={fetchHomerMessages}
          className="p-1 text-noc-muted hover:text-noc-text transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* SIP messages table */}
      <div className="border border-noc-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-noc-bg-50 text-noc-muted border-b border-noc-border">
              <th className="px-3 py-2 text-left font-medium">Time</th>
              <th className="px-3 py-2 text-left font-medium">Method</th>
              <th className="px-3 py-2 text-left font-medium">From</th>
              <th className="px-3 py-2 text-center font-medium">→</th>
              <th className="px-3 py-2 text-left font-medium">To</th>
              <th className="px-3 py-2 text-left font-medium">Call-ID</th>
              <th className="px-3 py-2 text-left font-medium">Source</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-noc-border">
            {messages.map((msg: any, i: number) => (
              <tr key={msg.id || i} className="hover:bg-noc-bg-50 transition-colors">
                <td className="px-3 py-2 font-mono text-noc-muted whitespace-nowrap">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </td>
                <td className="px-3 py-2 font-medium text-noc-text">
                  {msg.method}
                </td>
                <td className="px-3 py-2 text-noc-muted truncate max-w-[150px]">
                  {msg.details?.from || '-'}
                </td>
                <td className="px-3 py-2 text-center text-noc-muted">
                  {msg.direction === 'request' ? '→' : '←'}
                </td>
                <td className="px-3 py-2 text-noc-muted truncate max-w-[150px]">
                  {msg.details?.to || '-'}
                </td>
                <td className="px-3 py-2 font-mono text-noc-muted truncate max-w-[120px]">
                  {msg.call_id || '-'}
                </td>
                <td className="px-3 py-2 text-noc-muted">
                  {msg.src_ip}:{msg.src_port}
                </td>
                <td className="px-3 py-2">
                  {msg.status_code ? (
                    <span className={`font-mono ${
                      msg.status_code >= 200 && msg.status_code < 300
                        ? 'text-green-400'
                        : msg.status_code >= 400
                          ? 'text-red-400'
                          : 'text-yellow-400'
                    }`}>
                      {msg.status_code}
                    </span>
                  ) : (
                    <span className="text-noc-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default memo(HomerIntegrationInner);
