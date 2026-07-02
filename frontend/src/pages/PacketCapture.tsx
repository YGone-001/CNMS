import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Radio,
  Play,
  Square,
  RefreshCw,
  Download,
  Copy,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { useI18n } from '@/i18nContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaptureSession {
  id: string;
  name: string;
  status: string; // idle | running | stopping | completed | error
  interface: string;
  filter: string;
  protocol: string;
  max_duration: number;
  max_size: number;
  file_path: string;
  file_size: number;
  packet_count: number;
  pid: number;
  started_by: string;
  started_at: string;
  stopped_at?: string;
  error?: string;
}

interface ProtocolPreset {
  key: string;
  label: string;
  filter: string;
}

interface CaptureProgress {
  session_id: string;
  status: string;
  file_size: number;
  packet_count: number;
  duration: number;
  max_duration: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// useCaptureSocket — listen for capture_progress on monitor WS
// ---------------------------------------------------------------------------

function useCaptureSocket(onProgress: (data: CaptureProgress) => void) {
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/api/v1/monitor/ws`;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = 1000;
    let mounted = true;

    function connect() {
      if (!mounted) return;
      ws = new WebSocket(url);

      ws.onopen = () => {
        delay = 1000;
      };

      ws.onmessage = (e) => {
        if (!mounted) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'capture_progress' && msg.data) {
            onProgressRef.current(msg.data as CaptureProgress);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!mounted) return;
        delay = Math.min(delay * 2, 10000);
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      if (ws) ws.close();
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PacketCapture() {
  const { t } = useI18n();

  // Data state
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [presets, setPresets] = useState<ProtocolPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalSessions, setTotalSessions] = useState(0);

  // Running session (from WebSocket progress)
  const [runningProgress, setRunningProgress] = useState<CaptureProgress | null>(null);
  const [runningSession, setRunningSession] = useState<CaptureSession | null>(null);

  // Filter / pagination
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Modal state
  const [showStartModal, setShowStartModal] = useState(false);
  const [startForm, setStartForm] = useState({
    name: '',
    interface: 'any',
    protocol: '',
    filter: '',
    max_duration: 300,
    max_size: 100,
  });
  const [isCustomBpf, setIsCustomBpf] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<CaptureSession | null>(null);

  // ---------------------------------------------------------------------------
  // Toast helper
  // ---------------------------------------------------------------------------
  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ message, type });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // WebSocket progress handler
  // ---------------------------------------------------------------------------
  const handleCaptureProgress = useCallback((data: CaptureProgress) => {
    setRunningProgress(data);
  }, []);

  useCaptureSocket(handleCaptureProgress);

  // ---------------------------------------------------------------------------
  // API: fetch sessions
  // ---------------------------------------------------------------------------
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      if (statusFilter) params.set('status', statusFilter);

      const resp = await fetch(`/api/v1/capture/sessions?${params}`);
      const data = await resp.json();
      const list: CaptureSession[] = data.sessions || [];
      setSessions(list);
      setTotalSessions(data.total || 0);

      const running = list.find((s) => s.status === 'running');
      if (running) {
        setRunningSession(running);
      } else {
        setRunningSession(null);
        setRunningProgress(null);
      }
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  // ---------------------------------------------------------------------------
  // API: fetch presets
  // ---------------------------------------------------------------------------
  const fetchPresets = useCallback(async () => {
    try {
      const resp = await fetch('/api/v1/capture/presets');
      const data = await resp.json();
      setPresets(data.data || []);
    } catch {
      // ignore
    }
  }, []);

  // ---------------------------------------------------------------------------
  // API: start capture
  // ---------------------------------------------------------------------------
  const handleStart = async () => {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        interface: startForm.interface,
        max_duration: startForm.max_duration,
        max_size: startForm.max_size,
      };
      if (startForm.name) body.name = startForm.name;
      if (isCustomBpf) {
        body.filter = startForm.filter;
      } else if (startForm.protocol) {
        body.protocol = startForm.protocol;
      }

      const resp = await fetch('/api/v1/capture/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (data.status === 'ok') {
        setShowStartModal(false);
        setStartForm({ name: '', interface: 'any', protocol: '', filter: '', max_duration: 300, max_size: 100 });
        setIsCustomBpf(false);
        fetchSessions();
      } else {
        showToast(data.message || t('capture.toast.startFailed'), 'error');
      }
    } catch {
      showToast(t('capture.toast.startFailed'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // API: stop capture
  // ---------------------------------------------------------------------------
  const handleStop = async (sessionId?: string) => {
    const id = sessionId || runningSession?.id || runningProgress?.session_id;
    if (!id) return;

    try {
      const resp = await fetch('/api/v1/capture/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await resp.json();
      if (data.status === 'ok') {
        fetchSessions();
      } else {
        showToast(data.message || t('capture.toast.stopFailed'), 'error');
      }
    } catch {
      showToast(t('capture.toast.stopFailed'), 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // API: delete session
  // ---------------------------------------------------------------------------
  const handleDelete = async (id: string) => {
    try {
      const resp = await fetch(`/api/v1/capture/sessions?id=${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.status === 'ok') {
        showToast(t('capture.toast.deleted'));
        fetchSessions();
      } else {
        showToast(data.message || t('capture.toast.deleteFailed'), 'error');
      }
    } catch {
      showToast(t('capture.toast.deleteFailed'), 'error');
    }
    setDeleteTarget(null);
  };

  // ---------------------------------------------------------------------------
  // Download / Copy helpers
  // ---------------------------------------------------------------------------
  const handleDownload = (session: CaptureSession) => {
    window.open(`/api/v1/capture/download?id=${session.id}`, '_blank');
  };

  const handleCopyFilter = (filter: string) => {
    navigator.clipboard.writeText(filter).then(() => {
      showToast(t('capture.toast.copied'));
    });
  };

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchSessions();
    fetchPresets();
  }, [fetchSessions, fetchPresets]);

  // Auto-refresh when running
  useEffect(() => {
    if (!runningSession) return;
    const timer = setInterval(fetchSessions, 5000);
    return () => clearInterval(timer);
  }, [runningSession, fetchSessions]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const isRunning = !!runningSession;
  const progress = runningProgress;

  const totalCaptures = totalSessions;
  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const totalBytes = sessions.reduce((sum, s) => sum + (s.file_size || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayCaptures = sessions.filter((s) => s.started_at?.startsWith(today)).length;

  // Client-side filtering
  const filteredSessions = sessions.filter((s) => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (
        !s.name.toLowerCase().includes(q) &&
        !s.protocol.toLowerCase().includes(q) &&
        !s.filter.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (protocolFilter && s.protocol !== protocolFilter) return false;
    return true;
  });

  // Protocol label lookup
  const protocolLabelMap: Record<string, string> = {};
  presets.forEach((p) => {
    protocolLabelMap[p.key] = p.label;
  });

  // ---------------------------------------------------------------------------
  // Status badge
  // ---------------------------------------------------------------------------
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-noc-error-10 text-noc-error border border-noc-error-30">
            <span className="w-1.5 h-1.5 rounded-full bg-noc-error animate-pulse" />
            {t('capture.statusLabel.running')}
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-noc-success-10 text-noc-success border border-noc-success-30">
            <CheckCircle className="w-3 h-3" />
            {t('capture.statusLabel.completed')}
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-noc-error-10 text-noc-error border border-noc-error-30">
            <XCircle className="w-3 h-3" />
            {t('capture.statusLabel.error')}
          </span>
        );
      case 'stopping':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-noc-warning-10 text-noc-warning border border-noc-warning-30">
            {t('capture.statusLabel.stopping')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-noc-bg-50 text-noc-muted border border-noc-border">
            {t('capture.statusLabel.idle')}
          </span>
        );
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success' ? 'bg-noc-success text-white' : 'bg-noc-error text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-noc-surface border border-noc-border rounded-xl p-6 w-[400px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-noc-error-10">
                <AlertTriangle className="w-5 h-5 text-noc-error" />
              </div>
              <h3 className="text-lg font-semibold text-noc-text">{t('capture.deleteConfirm')}</h3>
            </div>
            <p className="text-sm text-noc-muted mb-6">
              {deleteTarget.name} — {formatBytes(deleteTarget.file_size || 0)}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-noc-muted hover:text-noc-text border border-noc-border rounded-lg"
              >
                {t('capture.startModal.cancel')}
              </button>
              <button
                onClick={() => handleDelete(deleteTarget.id)}
                className="px-4 py-2 text-sm text-white bg-noc-error rounded-lg hover:opacity-90"
              >
                {t('capture.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Area 1: Title bar ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-noc-text flex items-center gap-2">
            <Radio className="w-6 h-6 text-noc-accent" />
            {t('capture.title')}
          </h1>
          <p className="text-sm text-noc-muted mt-1">{t('capture.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSessions}
            disabled={loading}
            className="p-2 text-noc-muted hover:text-noc-accent transition-colors"
            title={t('capture.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isRunning ? (
            <button
              onClick={() => handleStop()}
              className="flex items-center gap-2 px-4 py-2 bg-noc-error text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Square className="w-4 h-4" />
              {t('capture.stopCapture')}
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            </button>
          ) : (
            <button
              onClick={() => setShowStartModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-noc-success text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Play className="w-4 h-4" />
              {t('capture.startCapture')}
            </button>
          )}
        </div>
      </div>

      {/* ── Area 2: Running status banner ── */}
      {isRunning && runningSession && (
        <div className="bg-noc-accent/5 border border-noc-accent/20 rounded-xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-noc-error animate-pulse" />
                <span className="text-sm font-medium text-noc-accent">{t('capture.capturing')}</span>
              </div>
              <div className="text-sm text-noc-text">
                <span className="text-noc-muted">{t('capture.name')}:</span> {runningSession.name}
              </div>
              <div className="text-sm text-noc-text">
                <span className="text-noc-muted">{t('capture.captured')}:</span>{' '}
                {formatNumber(progress?.packet_count ?? runningSession.packet_count ?? 0)} {t('capture.packets')}
              </div>
              <div className="text-sm text-noc-text">
                <span className="text-noc-muted">{t('capture.size')}:</span>{' '}
                {formatBytes(progress?.file_size ?? runningSession.file_size ?? 0)}
              </div>
              <div className="text-sm text-noc-text">
                <span className="text-noc-muted">{t('capture.elapsed')}:</span>{' '}
                {formatDuration(progress?.duration ?? 0)} / {formatDuration(runningSession.max_duration)}
              </div>
            </div>
            <button
              onClick={() => handleStop()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-noc-error text-white rounded-lg text-xs font-medium hover:opacity-90 shrink-0"
            >
              <Square className="w-3.5 h-3.5" />
              {t('capture.stopCapture')}
            </button>
          </div>
          {/* Progress bar */}
          <div className="mt-3 w-full bg-noc-bg rounded-full h-1.5">
            <div
              className="bg-noc-accent h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, ((progress?.duration ?? 0) / (runningSession.max_duration || 300)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* ── Area 3: Stats cards ── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: t('capture.totalCaptures'), value: formatNumber(totalCaptures), icon: Radio },
          { label: t('capture.completed'), value: formatNumber(completedCount), icon: CheckCircle },
          { label: t('capture.totalData'), value: formatBytes(totalBytes), icon: Download },
          { label: t('capture.todayCaptures'), value: formatNumber(todayCaptures), icon: Radio },
        ].map((card) => (
          <div key={card.label} className="bg-noc-surface border border-noc-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-noc-muted">{card.label}</p>
                <p className="text-xl font-bold text-noc-text mt-1">{card.value}</p>
              </div>
              <div className="p-2 rounded-lg bg-noc-accent/10">
                <card.icon className="w-5 h-5 text-noc-accent" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Area 4: Session history table ── */}
      <div className="bg-noc-surface border border-noc-border rounded-xl overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-noc-border flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t('capture.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text"
          >
            <option value="">{t('capture.allStatus')}</option>
            <option value="running">{t('capture.statusLabel.running')}</option>
            <option value="completed">{t('capture.statusLabel.completed')}</option>
            <option value="error">{t('capture.statusLabel.error')}</option>
          </select>
          <select
            value={protocolFilter}
            onChange={(e) => {
              setProtocolFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text"
          >
            <option value="">{t('capture.allProtocol')}</option>
            {presets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-noc-border bg-noc-bg-50">
                <th className="px-4 py-3 text-left text-noc-muted font-medium">{t('capture.name')}</th>
                <th className="px-4 py-3 text-left text-noc-muted font-medium">{t('capture.protocol')}</th>
                <th className="px-4 py-3 text-left text-noc-muted font-medium">{t('capture.status')}</th>
                <th className="px-4 py-3 text-right text-noc-muted font-medium">{t('capture.packetCount')}</th>
                <th className="px-4 py-3 text-right text-noc-muted font-medium">{t('capture.fileSize')}</th>
                <th className="px-4 py-3 text-right text-noc-muted font-medium">{t('capture.duration')}</th>
                <th className="px-4 py-3 text-right text-noc-muted font-medium">{t('capture.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Radio className="w-8 h-8 text-noc-muted mx-auto mb-3 opacity-50" />
                    <p className="text-noc-muted font-medium">{t('capture.noSessions')}</p>
                    <p className="text-noc-muted text-xs mt-1">{t('capture.noSessionsDesc')}</p>
                  </td>
                </tr>
              ) : (
                filteredSessions.map((s) => {
                  const isActive = s.status === 'running' || s.status === 'stopping';
                  const durationSec = s.stopped_at
                    ? Math.floor((new Date(s.stopped_at).getTime() - new Date(s.started_at).getTime()) / 1000)
                    : isActive
                      ? progress?.duration ?? 0
                      : 0;

                  return (
                    <tr key={s.id} className="border-b border-noc-border hover:bg-noc-bg-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-noc-text truncate max-w-[200px]">{s.name}</div>
                        <div className="text-xs text-noc-muted mt-0.5">
                          {new Date(s.started_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-noc-muted">
                        {protocolLabelMap[s.protocol] || s.protocol || '-'}
                      </td>
                      <td className="px-4 py-3">{renderStatusBadge(s.status)}</td>
                      <td className="px-4 py-3 text-right text-noc-text font-mono">
                        {formatNumber(isActive ? (progress?.packet_count ?? s.packet_count) : s.packet_count)}
                      </td>
                      <td className="px-4 py-3 text-right text-noc-text font-mono">
                        {formatBytes(isActive ? (progress?.file_size ?? s.file_size) : s.file_size)}
                      </td>
                      <td className="px-4 py-3 text-right text-noc-muted">
                        {isActive ? formatDuration(progress?.duration ?? 0) : formatDuration(durationSec)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isActive ? (
                            <button
                              onClick={() => handleStop(s.id)}
                              className="p-1.5 text-noc-error hover:bg-noc-error-10 rounded transition-colors"
                              title={t('capture.stopCapture')}
                            >
                              <Square className="w-4 h-4" />
                            </button>
                          ) : (
                            <>
                              {s.status === 'completed' && (
                                <button
                                  onClick={() => handleDownload(s)}
                                  className="p-1.5 text-noc-muted hover:text-noc-accent hover:bg-noc-accent/10 rounded transition-colors"
                                  title={t('capture.download')}
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              )}
                              {s.filter && (
                                <button
                                  onClick={() => handleCopyFilter(s.filter)}
                                  className="p-1.5 text-noc-muted hover:text-noc-accent hover:bg-noc-accent/10 rounded transition-colors"
                                  title={t('capture.copyBpf')}
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => setDeleteTarget(s)}
                                className="p-1.5 text-noc-muted hover:text-noc-error hover:bg-noc-error-10 rounded transition-colors"
                                title={t('capture.delete')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalSessions > pageSize && (
          <div className="px-4 py-3 border-t border-noc-border flex items-center justify-between">
            <span className="text-xs text-noc-muted">
              共 {formatNumber(totalSessions)} 条，第 {page} / {Math.ceil(totalSessions / pageSize)} 页
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 text-noc-muted hover:text-noc-text disabled:opacity-30 rounded"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(totalSessions / pageSize)}
                className="p-1.5 text-noc-muted hover:text-noc-text disabled:opacity-30 rounded"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Area 5: Start capture modal ── */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowStartModal(false)}>
          <div
            className="bg-noc-surface border border-noc-border rounded-xl p-6 w-[520px] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-noc-text flex items-center gap-2">
                <Play className="w-5 h-5 text-noc-success" />
                {t('capture.startModal.title')}
              </h3>
              <button onClick={() => setShowStartModal(false)} className="p-1 text-noc-muted hover:text-noc-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Capture name */}
              <div>
                <label className="block text-xs text-noc-muted mb-1.5">{t('capture.startModal.captureName')}</label>
                <input
                  value={startForm.name}
                  onChange={(e) => setStartForm({ ...startForm, name: e.target.value })}
                  placeholder={t('capture.startModal.namePlaceholder')}
                  className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
                />
              </div>

              {/* Protocol preset */}
              <div>
                <label className="block text-xs text-noc-muted mb-1.5">{t('capture.startModal.protocol')}</label>
                <select
                  value={isCustomBpf ? '__custom__' : startForm.protocol}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setIsCustomBpf(true);
                      setStartForm({ ...startForm, protocol: '', filter: '' });
                    } else {
                      setIsCustomBpf(false);
                      const preset = presets.find((p) => p.key === val);
                      setStartForm({ ...startForm, protocol: val, filter: preset?.filter || '' });
                    }
                  }}
                  className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
                >
                  <option value="">{t('capture.startModal.selectPreset')}</option>
                  {presets.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                  <option value="__custom__">{t('capture.startModal.customBpf')}</option>
                </select>
              </div>

              {/* BPF filter */}
              <div>
                <label className="block text-xs text-noc-muted mb-1.5">{t('capture.startModal.bpfExpression')}</label>
                <input
                  value={startForm.filter}
                  onChange={(e) => setStartForm({ ...startForm, filter: e.target.value })}
                  readOnly={!isCustomBpf}
                  placeholder={isCustomBpf ? 'port 5060 or port 3868' : ''}
                  className={`w-full px-3 py-2 border border-noc-border rounded-lg text-sm font-mono focus:outline-none focus:border-noc-accent ${
                    isCustomBpf ? 'bg-noc-bg text-noc-text' : 'bg-noc-bg-50 text-noc-muted cursor-not-allowed'
                  }`}
                />
                <p className="text-xs text-noc-muted mt-1">{t('capture.startModal.bpfReadonly')}</p>
              </div>

              {/* Interface */}
              <div>
                <label className="block text-xs text-noc-muted mb-1.5">{t('capture.startModal.interface')}</label>
                <input
                  value={startForm.interface}
                  onChange={(e) => setStartForm({ ...startForm, interface: e.target.value })}
                  placeholder="any"
                  className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
                />
              </div>

              {/* Duration + Size */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-noc-muted mb-1.5">
                    {t('capture.startModal.maxDuration')}{' '}
                    <span className="text-noc-muted">({t('capture.startModal.seconds')}，最长 3600)</span>
                  </label>
                  <input
                    type="number"
                    value={startForm.max_duration}
                    onChange={(e) =>
                      setStartForm({ ...startForm, max_duration: Math.min(3600, Math.max(10, Number(e.target.value) || 300)) })
                    }
                    min={10}
                    max={3600}
                    className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-noc-muted mb-1.5">
                    {t('capture.startModal.maxSize')}{' '}
                    <span className="text-noc-muted">({t('capture.startModal.mb')}，最大 500)</span>
                  </label>
                  <input
                    type="number"
                    value={startForm.max_size}
                    onChange={(e) =>
                      setStartForm({ ...startForm, max_size: Math.min(500, Math.max(1, Number(e.target.value) || 100)) })
                    }
                    min={1}
                    max={500}
                    className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-noc-border">
              <button
                onClick={() => setShowStartModal(false)}
                className="px-4 py-2 text-sm text-noc-muted hover:text-noc-text border border-noc-border rounded-lg transition-colors"
              >
                {t('capture.startModal.cancel')}
              </button>
              <button
                onClick={handleStart}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-noc-success rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {t('capture.startModal.start')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
