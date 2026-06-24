import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  History,
  RefreshCw,
  X,
  Zap,
  Shield,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMonitor } from '@/context/MonitorContext';
import type { MonitorSnapshot, Alarm } from '@/types/monitor';
import { formatPercent } from '@/utils/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AlarmSeverityType = 'critical' | 'major' | 'minor' | 'warning';

interface AlarmEvent {
  id: string;
  severity: AlarmSeverityType;
  source: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

// ---------------------------------------------------------------------------
// Severity visual config (semantic colors, not theme-dependent)
// ---------------------------------------------------------------------------

const severityConfig: Record<
  AlarmSeverityType,
  { color: string; bg: string; border: string; dot: string; label: string; icon: LucideIcon }
> = {
  critical: {
    color: 'text-noc-error',
    bg: 'bg-noc-error-10',
    border: 'border-noc-error-30',
    dot: 'bg-noc-error',
    label: 'Critical',
    icon: XCircle,
  },
  major: {
    color: 'text-noc-warning',
    bg: 'bg-noc-warning-10',
    border: 'border-noc-warning-20',
    dot: 'bg-noc-warning',
    label: 'Major',
    icon: AlertTriangle,
  },
  minor: {
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    dot: 'bg-yellow-500',
    label: 'Minor',
    icon: AlertTriangle,
  },
  warning: {
    color: 'text-noc-accent',
    bg: 'bg-noc-accent-10',
    border: 'border-noc-accent-30',
    dot: 'bg-noc-accent',
    label: 'Warning',
    icon: Clock,
  },
};

// ---------------------------------------------------------------------------
// Alarm derivation from live snapshot
// ---------------------------------------------------------------------------

function deriveAlarms(snapshot: MonitorSnapshot | null): AlarmEvent[] {
  if (!snapshot?.processes) return [];
  const alarms: AlarmEvent[] = [];
  for (const p of snapshot.processes) {
    if (!p.running) {
      alarms.push({
        id: `down-${p.name}`,
        severity: 'critical',
        source: p.name,
        message: `Process ${p.name} is not running`,
        timestamp: snapshot.timestamp,
        acknowledged: false,
      });
    } else if (p.cpu_percent > 80) {
      alarms.push({
        id: `cpu-${p.name}`,
        severity: 'major',
        source: p.name,
        message: `High CPU usage: ${formatPercent(p.cpu_percent, 1)}`,
        timestamp: snapshot.timestamp,
        acknowledged: false,
      });
    } else if (p.memory_percent > 80) {
      alarms.push({
        id: `mem-${p.name}`,
        severity: 'minor',
        source: p.name,
        message: `High memory usage: ${formatPercent(p.memory_percent, 1)}`,
        timestamp: snapshot.timestamp,
        acknowledged: false,
      });
    }
  }
  return alarms;
}

// ---------------------------------------------------------------------------
// Severity badge component
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: AlarmSeverityType }) {
  const cfg = severityConfig[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.color} border ${cfg.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Slide-out detail drawer
// ---------------------------------------------------------------------------

function AlarmDrawer({
  alarm,
  alarmType,
  onClose,
  onAck,
  onClr,
}: {
  alarm: AlarmEvent | Alarm | null;
  alarmType: 'active' | 'history';
  onClose: () => void;
  onAck: (id: string) => void;
  onClr: (id: string) => void;
}) {
  const isOpen = alarm !== null;

  const severity = alarm ? (alarmType === 'active' ? (alarm as AlarmEvent).severity : (alarm as Alarm).severity) : 'warning';
  const source = alarm ? (alarmType === 'active' ? (alarm as AlarmEvent).source : (alarm as Alarm).source) : '';
  const message = alarm ? (alarmType === 'active' ? (alarm as AlarmEvent).message : (alarm as Alarm).message) : '';
  const timestamp = alarm ? (alarmType === 'active' ? (alarm as AlarmEvent).timestamp : new Date((alarm as Alarm).timestamp).getTime()) : 0;
  const alarmId = alarm ? (alarmType === 'active' ? (alarm as AlarmEvent).id : (alarm as Alarm)._id) : '';
  const acknowledged = alarm ? (alarmType === 'active' ? (alarm as AlarmEvent).acknowledged : (alarm as Alarm).acknowledged) : false;
  const cleared = alarm && alarmType === 'history' ? (alarm as Alarm).cleared : false;

  const cfg = severityConfig[severity as AlarmSeverityType] || severityConfig.warning;
  const Icon = cfg.icon;

  // Simulated diagnostic fields for troubleshooting
  const probableCauses: Record<AlarmSeverityType, string> = {
    critical: 'Process crash, OOM kill, or system resource exhaustion',
    major: 'Sustained high CPU utilization above threshold for extended period',
    minor: 'Memory leak or excessive cache accumulation',
    warning: 'Transient resource spike or configuration drift',
  };

  const specificProblems: Record<AlarmSeverityType, string> = {
    critical: 'NF service interruption detected. Immediate action required.',
    major: 'Performance degradation observed. Capacity planning recommended.',
    minor: 'Resource utilization trending upward. Monitor for escalation.',
    warning: 'Anomaly detected in metric baseline. Review recommended.',
  };

  const repairActions: Record<AlarmSeverityType, string> = {
    critical: '1. Verify process status\n2. Check system logs for root cause\n3. Restart service if needed\n4. Escalate to L2 if unresolved',
    major: '1. Identify top CPU consumers\n2. Check for runaway processes\n3. Review recent config changes\n4. Consider scaling resources',
    minor: '1. Monitor memory trend\n2. Check for memory leaks\n3. Review garbage collection logs\n4. Plan maintenance window',
    warning: '1. Review metric trend\n2. Check for correlated events\n3. Update monitoring thresholds\n4. Document for baseline',
  };

  return (
    <>
      {/* Backdrop overlay with blur */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer panel - slides from right edge */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] bg-noc-bg border-l border-noc-border shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header: source NF, timestamp, severity badge, close button */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-noc-border bg-noc-surface">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-lg ${cfg.bg}`}>
              <Icon className={`w-5 h-5 ${cfg.color}`} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-noc-text truncate">{source}</div>
              <div className="text-[11px] text-noc-muted mt-0.5">
                {new Date(timestamp).toLocaleString()}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-noc-muted hover:text-noc-text hover:bg-noc-bg-50 transition-colors"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: diagnostic details */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Severity and status row */}
          <div className="flex items-center justify-between">
            <SeverityBadge severity={severity as AlarmSeverityType} />
            {acknowledged && (
              <span className="text-[11px] text-noc-warning bg-noc-warning-10 px-2 py-0.5 rounded border border-noc-warning-20">
                ACKNOWLEDGED
              </span>
            )}
            {cleared && (
              <span className="text-[11px] text-noc-success bg-noc-success-10 px-2 py-0.5 rounded border border-noc-success-20">
                CLEARED
              </span>
            )}
          </div>

          {/* Alarm message block */}
          <div className="bg-noc-surface rounded-lg p-3 border border-noc-border">
            <div className="text-[11px] text-noc-muted uppercase tracking-wider mb-1">Alarm Message</div>
            <div className="text-sm text-noc-text leading-relaxed">{message}</div>
          </div>

          {/* Diagnostic attributes section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-noc-muted">
              <Zap className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Diagnostic Details</span>
            </div>

            <div className="space-y-2">
              <div className="bg-noc-surface rounded-md p-3 border border-noc-border">
                <div className="text-[10px] text-noc-muted uppercase tracking-wider mb-1">Probable Cause</div>
                <div className="text-xs text-noc-text leading-relaxed">
                  {probableCauses[severity as AlarmSeverityType]}
                </div>
              </div>

              <div className="bg-noc-surface rounded-md p-3 border border-noc-border">
                <div className="text-[10px] text-noc-muted uppercase tracking-wider mb-1">Specific Problem</div>
                <div className="text-xs text-noc-text leading-relaxed">
                  {specificProblems[severity as AlarmSeverityType]}
                </div>
              </div>

              <div className="bg-noc-surface rounded-md p-3 border border-noc-border">
                <div className="text-[10px] text-noc-muted uppercase tracking-wider mb-1">Proposed Repair Action</div>
                <div className="text-xs text-noc-text leading-relaxed whitespace-pre-line">
                  {repairActions[severity as AlarmSeverityType]}
                </div>
              </div>
            </div>
          </div>

          {/* Context section: alarm ID, source NF */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-noc-muted">
              <Shield className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Context</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-noc-surface rounded-md p-2.5 border border-noc-border">
                <div className="text-[10px] text-noc-muted uppercase">Alarm ID</div>
                <div className="text-xs text-noc-text font-mono mt-0.5 truncate">{alarmId}</div>
              </div>
              <div className="bg-noc-surface rounded-md p-2.5 border border-noc-border">
                <div className="text-[10px] text-noc-muted uppercase">Source NF</div>
                <div className="text-xs text-noc-text font-mono mt-0.5 truncate">{source}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer: Acknowledge and Clear action buttons */}
        {!cleared && (
          <div className="px-5 py-4 border-t border-noc-border flex items-center gap-3 bg-noc-surface">
            {!acknowledged && (
              <button
                onClick={() => onAck(alarmId)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-noc-warning-10 text-noc-warning border border-noc-warning-20 rounded-lg text-sm font-medium hover:bg-noc-warning-20 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Acknowledge Alarm
              </button>
            )}
            <button
              onClick={() => onClr(alarmId)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-noc-success-10 text-noc-success border border-noc-success-20 rounded-lg text-sm font-medium hover:bg-noc-success-20 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Clear Alarm
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Alarms page
// ---------------------------------------------------------------------------

export default function Alarms() {
  const { snapshot } = useMonitor();
  const [tab, setTab] = useState<'active' | 'history'>('active');

  // Multi-select severity filter (toggle set)
  const [activeFilters, setActiveFilters] = useState<Set<AlarmSeverityType>>(new Set());

  const [dbAlarms, setDbAlarms] = useState<Alarm[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Selected alarm for detail drawer
  const [selectedAlarmId, setSelectedAlarmId] = useState<string | null>(null);

  // Real-time derived alarms
  const realtimeAlarms = useMemo(() => deriveAlarms(snapshot), [snapshot]);

  // Fetch alarm history from DB
  const fetchAlarms = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab === 'history') {
        // fetch all for history
      }
      const resp = await fetch(`/api/v1/alarms?${params}`);
      const data = await resp.json();
      if (data.status === 'ok') {
        setDbAlarms(data.alarms || []);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'history') fetchAlarms();
  }, [tab, fetchAlarms]);

  // ACK/CLR alarm via MML
  const handleAlarmAction = useCallback(
    async (id: string, action: 'ACK-ALARM' | 'CLR-ALARM') => {
      try {
        const resp = await fetch('/api/v1/mml/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `${action}: ID=${id};` }),
        });
        const data = await resp.json();
        if (data.status !== 'ok') {
          console.error('Alarm action failed:', data.message);
        }
        // Refresh history if on history tab
        if (tab === 'history') fetchAlarms();
        // If cleared, close drawer
        if (action === 'CLR-ALARM') setSelectedAlarmId(null);
      } catch (err) {
        console.error('Alarm action error:', err);
      }
    },
    [tab, fetchAlarms],
  );

  // Counts for filter cards
  const counts = useMemo(() => {
    const c = { critical: 0, major: 0, minor: 0, warning: 0 };
    const source = tab === 'active' ? realtimeAlarms : dbAlarms;
    for (const a of source) {
      const sev = tab === 'active' ? (a as AlarmEvent).severity : (a as Alarm).severity;
      if (sev in c) c[sev as AlarmSeverityType]++;
    }
    return c;
  }, [tab, realtimeAlarms, dbAlarms]);

  const totalAlarms = counts.critical + counts.major + counts.minor + counts.warning;

  // Toggle severity filter
  const toggleFilter = useCallback((sev: AlarmSeverityType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) {
        next.delete(sev);
      } else {
        next.add(sev);
      }
      return next;
    });
  }, []);

  // Filtered lists
  const filteredActive = useMemo(() => {
    if (activeFilters.size === 0) return realtimeAlarms;
    return realtimeAlarms.filter((a) => activeFilters.has(a.severity));
  }, [realtimeAlarms, activeFilters]);

  const filteredHistory = useMemo(() => {
    if (activeFilters.size === 0) return dbAlarms;
    return dbAlarms.filter((a) => activeFilters.has(a.severity as AlarmSeverityType));
  }, [dbAlarms, activeFilters]);

  // Resolve selected alarm object for drawer
  const selectedAlarm = useMemo(() => {
    if (!selectedAlarmId) return null;
    const source = tab === 'active' ? realtimeAlarms : dbAlarms;
    return source.find((a) => {
      const id = tab === 'active' ? (a as AlarmEvent).id : (a as Alarm)._id;
      return id === selectedAlarmId;
    }) || null;
  }, [selectedAlarmId, tab, realtimeAlarms, dbAlarms]);

  const handleRowClick = useCallback(
    (id: string) => {
      setSelectedAlarmId((prev) => (prev === id ? null : id));
    },
    [],
  );

  const handleAck = useCallback((id: string) => handleAlarmAction(id, 'ACK-ALARM'), [handleAlarmAction]);
  const handleClr = useCallback((id: string) => handleAlarmAction(id, 'CLR-ALARM'), [handleAlarmAction]);

  // Severity filter card component
  const FilterCard = ({ severity }: { severity: AlarmSeverityType }) => {
    const cfg = severityConfig[severity];
    const Icon = cfg.icon;
    const isActive = activeFilters.has(severity);
    const count = counts[severity];

    return (
      <button
        onClick={() => toggleFilter(severity)}
        className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 ${
          isActive
            ? `${cfg.bg} ${cfg.border} shadow-lg`
            : 'bg-noc-surface border-noc-border hover:border-noc-border-50'
        }`}
      >
        <div className={`p-2 rounded-lg ${isActive ? cfg.bg : 'bg-noc-bg-50'}`}>
          <Icon className={`w-4 h-4 ${isActive ? cfg.color : 'text-noc-muted'}`} />
        </div>
        <div className="text-left">
          <div className={`text-[11px] uppercase tracking-wider font-semibold ${isActive ? cfg.color : 'text-noc-muted'}`}>
            {cfg.label}
          </div>
          <div className={`text-xl font-bold tabular-nums ${isActive ? 'text-noc-text' : 'text-noc-muted'}`}>
            {count}
          </div>
        </div>
        {/* Active indicator dot */}
        {isActive && (
          <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${cfg.dot} animate-pulse`} />
        )}
      </button>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Page header with title and tab switcher */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Alarm Management</h2>
          <p className="text-sm text-noc-muted mt-0.5">
            {totalAlarms} total alarm{totalAlarms !== 1 ? 's' : ''} detected
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Active / History tab switcher */}
          <div className="flex gap-1 bg-noc-surface rounded-lg p-1 border border-noc-border" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'active'}
              onClick={() => {
                setTab('active');
                setSelectedAlarmId(null);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'active'
                  ? 'bg-noc-accent-10 text-noc-accent border border-noc-accent-30'
                  : 'text-noc-muted hover:text-noc-text border border-transparent'
              }`}
            >
              <Bell className="w-3.5 h-3.5 inline mr-1.5" />
              Active
            </button>
            <button
              role="tab"
              aria-selected={tab === 'history'}
              onClick={() => {
                setTab('history');
                setSelectedAlarmId(null);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'history'
                  ? 'bg-noc-accent-10 text-noc-accent border border-noc-accent-30'
                  : 'text-noc-muted hover:text-noc-text border border-transparent'
              }`}
            >
              <History className="w-3.5 h-3.5 inline mr-1.5" />
              History
            </button>
          </div>
          {tab === 'history' && (
            <button
              onClick={() => fetchAlarms()}
              disabled={historyLoading}
              className="p-2 bg-noc-surface text-noc-muted rounded-lg hover:text-noc-text border border-noc-border transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Top quick filter cards: Critical, Major, Minor, Warning */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {(['critical', 'major', 'minor', 'warning'] as const).map((sev) => (
          <FilterCard key={sev} severity={sev} />
        ))}
      </div>

      {/* Middle hierarchical alarm list */}
      <div className="flex-1 min-h-0">
        {/* Active alarms tab */}
        {tab === 'active' && (
          filteredActive.length > 0 ? (
            <div className="bg-noc-surface border border-noc-border rounded-xl overflow-hidden h-full overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-noc-bg z-10">
                  <tr className="border-b border-noc-border">
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-28">Severity</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-32">Source</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider">Message</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-40">Time</th>
                    <th className="text-right px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filteredActive.map((alarm, idx) => {
                    const isSelected = selectedAlarmId === alarm.id;
                    return (
                      <tr
                        key={alarm.id}
                        onClick={() => handleRowClick(alarm.id)}
                        className={`border-b border-noc-border cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? 'bg-noc-accent-10 border-l-2 border-l-noc-accent'
                            : `border-l-2 border-l-transparent hover:bg-noc-bg-50 ${idx % 2 === 0 ? 'bg-transparent' : 'bg-noc-bg-50'}`
                        }`}
                      >
                        <td className="px-4 py-3">
                          <SeverityBadge severity={alarm.severity} />
                        </td>
                        <td className="px-4 py-3 text-noc-text font-mono text-xs">{alarm.source}</td>
                        <td className="px-4 py-3 text-noc-muted text-xs">{alarm.message}</td>
                        <td className="px-4 py-3 text-noc-muted text-[11px]">
                          {new Date(alarm.timestamp * 1000).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight className={`w-3.5 h-3.5 transition-colors ${isSelected ? 'text-noc-accent' : 'text-noc-muted'}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-noc-surface border border-noc-border rounded-xl p-12 text-center">
              <CheckCircle className="w-10 h-10 text-noc-success mx-auto mb-3" />
              <div className="text-sm text-noc-muted">No active alarms</div>
              <div className="text-xs text-noc-muted mt-1">All systems operating normally</div>
            </div>
          )
        )}

        {/* History alarms tab */}
        {tab === 'history' && (
          historyLoading ? (
            <div className="bg-noc-surface border border-noc-border rounded-xl p-12 text-center">
              <RefreshCw className="w-10 h-10 text-noc-muted mx-auto mb-3 animate-spin" />
              <div className="text-sm text-noc-muted">Loading alarm history...</div>
            </div>
          ) : filteredHistory.length > 0 ? (
            <div className="bg-noc-surface border border-noc-border rounded-xl overflow-hidden h-full overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-noc-bg z-10">
                  <tr className="border-b border-noc-border">
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-28">Severity</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-32">Source</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider">Message</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-40">Time</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-24">Status</th>
                    <th className="text-right px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((alarm, idx) => {
                    const isSelected = selectedAlarmId === alarm._id;
                    return (
                      <tr
                        key={alarm._id}
                        onClick={() => handleRowClick(alarm._id)}
                        className={`border-b border-noc-border cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? 'bg-noc-accent-10 border-l-2 border-l-noc-accent'
                            : `border-l-2 border-l-transparent hover:bg-noc-bg-50 ${idx % 2 === 0 ? 'bg-transparent' : 'bg-noc-bg-50'}`
                        }`}
                      >
                        <td className="px-4 py-3">
                          <SeverityBadge severity={alarm.severity as AlarmSeverityType} />
                        </td>
                        <td className="px-4 py-3 text-noc-text font-mono text-xs">{alarm.source}</td>
                        <td className="px-4 py-3 text-noc-muted text-xs">{alarm.message}</td>
                        <td className="px-4 py-3 text-noc-muted text-[11px]">
                          {new Date(alarm.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {alarm.cleared ? (
                            <span className="text-[11px] text-noc-success bg-noc-success-10 px-1.5 py-0.5 rounded">Cleared</span>
                          ) : alarm.acknowledged ? (
                            <span className="text-[11px] text-noc-warning bg-noc-warning-10 px-1.5 py-0.5 rounded">ACK</span>
                          ) : (
                            <span className="text-[11px] text-noc-error bg-noc-error-10 px-1.5 py-0.5 rounded">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight className={`w-3.5 h-3.5 transition-colors ${isSelected ? 'text-noc-accent' : 'text-noc-muted'}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-noc-surface border border-noc-border rounded-xl p-12 text-center">
              <CheckCircle className="w-10 h-10 text-noc-success mx-auto mb-3" />
              <div className="text-sm text-noc-muted">No alarm history</div>
              <div className="text-xs text-noc-muted mt-1">No historical records found</div>
            </div>
          )
        )}
      </div>

      {/* Right slide-out detail drawer panel */}
      <AlarmDrawer
        alarm={selectedAlarm}
        alarmType={tab}
        onClose={() => setSelectedAlarmId(null)}
        onAck={handleAck}
        onClr={handleClr}
      />
    </div>
  );
}
