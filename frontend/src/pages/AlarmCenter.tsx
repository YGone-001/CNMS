import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Server,
  Zap,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '@/App';
import type { Alarm } from '@/types/monitor';

// ---- Status mapping from backend Alarm fields ----
type AlarmStatus = 'active' | 'acknowledged' | 'cleared';

function getAlarmStatus(a: Alarm): AlarmStatus {
  if (a.cleared) return 'cleared';
  if (a.acknowledged) return 'acknowledged';
  return 'active';
}

// ---- Severity / Status config ----
type AlarmSeverity = 'critical' | 'major' | 'minor' | 'warning';

const SEVERITY_CONFIG: Record<AlarmSeverity, { color: string; bg: string; border: string; icon: typeof XCircle; label: string }> = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: XCircle, label: '严重' },
  major:    { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: AlertTriangle, label: '主要' },
  minor:    { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: AlertTriangle, label: '次要' },
  warning:  { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Clock, label: '警告' },
};

const STATUS_CONFIG: Record<AlarmStatus, { color: string; bg: string; border: string; icon: typeof CheckCircle; label: string }> = {
  active:       { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: Zap, label: '活跃' },
  acknowledged: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: CheckCircle, label: '已确认' },
  cleared:      { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckSquare, label: '已清除' },
};

// ---- Component ----
export default function AlarmCenter() {
  const navigate = useNavigate();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedAlarm, setSelectedAlarm] = useState<Alarm | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<AlarmSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AlarmStatus | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // ---- Fetch alarms from real API ----
  const fetchAlarms = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await authFetch('/api/v1/alarms?page_size=200');
      const data = await resp.json();
      if (data.status === 'ok') {
        const list: Alarm[] = data.alarms ?? [];
        setAlarms(list);
        setTotal(data.total ?? list.length);
        // Auto-select first alarm if none selected
        setSelectedAlarm(prev => prev ?? (list.length > 0 ? list[0] : null));
      }
    } catch (err) {
      console.error('fetch alarms error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlarms();
    const interval = setInterval(fetchAlarms, 30000);
    return () => clearInterval(interval);
  }, [fetchAlarms]);

  // ---- Summary stats ----
  const summary = useMemo(() => {
    const s = { total: alarms.length, critical: 0, major: 0, minor: 0, warning: 0, active: 0, acknowledged: 0, cleared: 0 };
    for (const a of alarms) {
      const sev = a.severity as AlarmSeverity;
      if (sev in s) s[sev]++;
      const st = getAlarmStatus(a);
      s[st]++;
    }
    return s;
  }, [alarms]);

  // ---- Filter ----
  const filteredAlarms = useMemo(() => {
    return alarms.filter((alarm) => {
      const matchesSearch =
        alarm.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alarm.message.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSeverity = severityFilter === 'all' || alarm.severity === severityFilter;
      const alarmStatus = getAlarmStatus(alarm);
      const matchesStatus = statusFilter === 'all' || alarmStatus === statusFilter;
      return matchesSearch && matchesSeverity && matchesStatus;
    });
  }, [alarms, searchTerm, severityFilter, statusFilter]);

  // ---- Batch selection ----
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAlarms.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAlarms.map(a => a._id)));
    }
  };

  // ---- Batch ACK via MML ----
  const batchAcknowledge = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const promises = [...selectedIds].map(id =>
        authFetch('/api/v1/mml/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `ACK-ALARM: ID=${id};` }),
        })
      );
      await Promise.all(promises);
      setSelectedIds(new Set());
      await fetchAlarms();
    } catch (err) {
      console.error('batch ack error:', err);
    } finally {
      setBatchLoading(false);
    }
  };

  // ---- Batch CLR via MML ----
  const batchClear = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const promises = [...selectedIds].map(id =>
        authFetch('/api/v1/mml/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `CLR-ALARM: ID=${id};` }),
        })
      );
      await Promise.all(promises);
      setSelectedIds(new Set());
      await fetchAlarms();
    } catch (err) {
      console.error('batch clr error:', err);
    } finally {
      setBatchLoading(false);
    }
  };

  // ---- Single alarm actions ----
  const acknowledgeAlarm = async (id: string) => {
    await authFetch('/api/v1/mml/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `ACK-ALARM: ID=${id};` }),
    });
    await fetchAlarms();
  };

  const clearAlarm = async (id: string) => {
    await authFetch('/api/v1/mml/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `CLR-ALARM: ID=${id};` }),
    });
    await fetchAlarms();
  };

  // ---- Format time ----
  const fmtTime = (t?: string) => {
    if (!t) return '-';
    return new Date(t).toLocaleString('zh-CN', { hour12: false });
  };

  // ---- Loading state ----
  if (loading && alarms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-noc-accent animate-spin mx-auto mb-4" />
          <p className="text-noc-muted">加载告警数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-noc-text">告警中心</h1>
          <p className="text-sm text-noc-muted mt-1">
            共 {total} 条告警，{summary.active} 条活跃
          </p>
        </div>
        <button
          onClick={fetchAlarms}
          className="flex items-center gap-2 px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text hover:bg-noc-bg-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: '总告警', value: summary.total, color: 'text-noc-text', borderColor: 'border-noc-border' },
          { label: '严重', value: summary.critical, color: 'text-red-400', borderColor: 'border-red-500/20' },
          { label: '主要', value: summary.major, color: 'text-amber-400', borderColor: 'border-amber-500/20' },
          { label: '活跃', value: summary.active, color: 'text-blue-400', borderColor: 'border-blue-500/20' },
        ] as const).map(c => (
          <div key={c.label} className={`bg-noc-surface border ${c.borderColor} rounded-lg p-4`}>
            <div className={`text-sm ${c.color} mb-1`}>{c.label}</div>
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filters + Batch actions */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
          <input
            type="text"
            placeholder="搜索告警..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as AlarmSeverity | 'all')}
          className="px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text"
        >
          <option value="all">所有级别</option>
          <option value="critical">严重</option>
          <option value="major">主要</option>
          <option value="minor">次要</option>
          <option value="warning">警告</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AlarmStatus | 'all')}
          className="px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text"
        >
          <option value="all">所有状态</option>
          <option value="active">活跃</option>
          <option value="acknowledged">已确认</option>
          <option value="cleared">已清除</option>
        </select>

        {/* Batch actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-noc-muted">已选 {selectedIds.size} 条</span>
            <button
              onClick={batchAcknowledge}
              disabled={batchLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-xs hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {batchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
              批量确认
            </button>
            <button
              onClick={batchClear}
              disabled={batchLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              {batchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckSquare className="w-3 h-3" />}
              批量清除
            </button>
          </div>
        )}
      </div>

      {/* Alarm list + detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="lg:col-span-2 space-y-2">
          {/* Select all header */}
          {filteredAlarms.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-noc-muted">
              <button onClick={toggleSelectAll} className="flex items-center gap-1 hover:text-noc-text transition-colors">
                {selectedIds.size === filteredAlarms.length && filteredAlarms.length > 0
                  ? <CheckSquare className="w-4 h-4 text-noc-accent" />
                  : <Square className="w-4 h-4" />
                }
                全选
              </button>
              <span className="ml-auto">{filteredAlarms.length} 条告警</span>
            </div>
          )}

          {filteredAlarms.map((alarm) => {
            const sev = SEVERITY_CONFIG[alarm.severity as AlarmSeverity] ?? SEVERITY_CONFIG.warning;
            const status = getAlarmStatus(alarm);
            const sta = STATUS_CONFIG[status];
            const SevIcon = sev.icon;
            const StaIcon = sta.icon;
            const isSelected = selectedAlarm?._id === alarm._id;
            const isChecked = selectedIds.has(alarm._id);

            return (
              <div
                key={alarm._id}
                onClick={() => setSelectedAlarm(alarm)}
                className={`bg-noc-surface border rounded-lg p-4 cursor-pointer transition-all ${
                  isSelected ? 'border-noc-accent shadow-lg' : 'border-noc-border hover:border-noc-accent/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(alarm._id); }}
                    className="mt-1 flex-shrink-0"
                  >
                    {isChecked
                      ? <CheckSquare className="w-4 h-4 text-noc-accent" />
                      : <Square className="w-4 h-4 text-noc-muted" />
                    }
                  </button>

                  {/* Severity icon */}
                  <div className={`p-2 rounded-lg flex-shrink-0 ${sev.bg}`}>
                    <SevIcon className={`w-5 h-5 ${sev.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${sta.bg} ${sta.color} ${sta.border}`}>
                        <StaIcon className="w-3 h-3 mr-1" />
                        {sta.label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${sev.bg} ${sev.color} ${sev.border}`}>
                        {sev.label}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium text-noc-text truncate">{alarm.message}</h3>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-noc-muted">
                      <span className="flex items-center gap-1">
                        <Server className="w-3 h-3" />
                        {alarm.source}
                      </span>
                      <span>{fmtTime(alarm.timestamp)}</span>
                      {alarm.count > 1 && <span>次数: {alarm.count}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredAlarms.length === 0 && (
            <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center">
              <Bell className="w-12 h-12 text-noc-muted mx-auto mb-4" />
              <p className="text-noc-muted">没有匹配的告警</p>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-1">
          {selectedAlarm ? (
            <div className="bg-noc-surface border border-noc-border rounded-lg p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-noc-text">告警详情</h3>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                  SEVERITY_CONFIG[selectedAlarm.severity as AlarmSeverity]?.bg ?? ''
                } ${SEVERITY_CONFIG[selectedAlarm.severity as AlarmSeverity]?.color ?? ''} ${
                  SEVERITY_CONFIG[selectedAlarm.severity as AlarmSeverity]?.border ?? ''
                }`}>
                  {SEVERITY_CONFIG[selectedAlarm.severity as AlarmSeverity]?.label ?? selectedAlarm.severity}
                </span>
              </div>

              <div className="space-y-4">
                {/* Basic info */}
                <div>
                  <div className="text-sm font-medium text-noc-muted mb-2">基本信息</div>
                  <div className="space-y-2">
                    {([
                      ['告警 ID', selectedAlarm._id],
                      ['来源', selectedAlarm.source],
                      ['级别', selectedAlarm.severity],
                      ['状态', STATUS_CONFIG[getAlarmStatus(selectedAlarm)]?.label ?? '-'],
                      ['消息', selectedAlarm.message],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span className="text-noc-muted">{k}</span>
                        <span className="text-noc-text font-mono text-right max-w-[60%] truncate">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Time info */}
                <div>
                  <div className="text-sm font-medium text-noc-muted mb-2">时间信息</div>
                  <div className="space-y-2">
                    {([
                      ['首次发生', fmtTime(selectedAlarm.first_occurrence || selectedAlarm.timestamp)],
                      ['最近发生', fmtTime(selectedAlarm.timestamp)],
                      ['发生次数', String(selectedAlarm.count)],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span className="text-noc-muted">{k}</span>
                        <span className="text-noc-text">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ACK info */}
                {selectedAlarm.acknowledged && (
                  <div>
                    <div className="text-sm font-medium text-noc-muted mb-2">确认信息</div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-noc-muted">确认人</span>
                        <span className="text-noc-text">{selectedAlarm.ack_by || '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-noc-muted">确认时间</span>
                        <span className="text-noc-text">{fmtTime(selectedAlarm.ack_at)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Clear info */}
                {selectedAlarm.cleared && (
                  <div>
                    <div className="text-sm font-medium text-noc-muted mb-2">清除信息</div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-noc-muted">清除人</span>
                        <span className="text-noc-text">{selectedAlarm.cleared_by || '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-noc-muted">清除时间</span>
                        <span className="text-noc-text">{fmtTime(selectedAlarm.cleared_at)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-4 border-t border-noc-border space-y-2">
                  {!selectedAlarm.acknowledged && !selectedAlarm.cleared && (
                    <button
                      onClick={() => acknowledgeAlarm(selectedAlarm._id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-sm hover:bg-amber-500/20 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      确认告警
                    </button>
                  )}
                  {!selectedAlarm.cleared && (
                    <>
                      <button
                        onClick={() => navigate('/fault-diagnosis', { state: { alarmId: selectedAlarm._id, source: selectedAlarm.source, message: selectedAlarm.message } })}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-noc-accent text-white rounded-lg text-sm hover:opacity-90 transition-opacity"
                      >
                        <Zap className="w-4 h-4" />
                        一键诊断
                      </button>
                      <button
                        onClick={() => clearAlarm(selectedAlarm._id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm hover:bg-emerald-500/20 transition-colors"
                      >
                        <CheckSquare className="w-4 h-4" />
                        清除告警
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-noc-surface border border-noc-border rounded-lg p-6 text-center">
              <Bell className="w-12 h-12 text-noc-muted mx-auto mb-4" />
              <p className="text-noc-muted">暂无告警数据</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
