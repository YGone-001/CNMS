import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Download, RefreshCw, AlertTriangle, Server, Cpu, MemoryStick } from 'lucide-react';
import type { ReportSummary } from '@/types/monitor';

export default function Reports() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/v1/reports/summary?period=${period}`);
      const data = await resp.json();
      setSummary(data.summary || null);
    } catch { setSummary(null); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const downloadCSV = (type: 'metrics' | 'alarms') => {
    const url = `/api/v1/reports/${type}/csv?period=${period}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Reports & Export</h2>
          <p className="text-sm text-noc-muted mt-0.5">Performance summary and data export</p>
        </div>
        <div className="flex gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-2 py-1 bg-noc-bg border border-noc-border rounded text-sm text-noc-text">
            <option value="1h">Last 1 Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <button onClick={fetchSummary} disabled={loading} className="p-2 text-noc-muted hover:text-noc-accent">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 摘要卡片 */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-noc-muted text-xs mb-1"><Server className="w-3 h-3" /> Availability</div>
            <div className="text-2xl font-bold text-noc-success">{summary.availability_pct}%</div>
            <div className="text-xs text-noc-muted mt-1">{summary.online_nfs}/{summary.total_nfs} online</div>
          </div>
          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-noc-muted text-xs mb-1"><Cpu className="w-3 h-3" /> Avg CPU</div>
            <div className="text-2xl font-bold text-noc-text">{summary.avg_cpu}%</div>
            <div className="text-xs text-noc-muted mt-1">Peak: {summary.max_cpu}% ({summary.max_cpu_name})</div>
          </div>
          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-noc-muted text-xs mb-1"><MemoryStick className="w-3 h-3" /> Avg Memory</div>
            <div className="text-2xl font-bold text-noc-text">{summary.avg_memory}%</div>
            <div className="text-xs text-noc-muted mt-1">Peak: {summary.max_memory}% ({summary.max_memory_name})</div>
          </div>
          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-noc-muted text-xs mb-1"><AlertTriangle className="w-3 h-3" /> Alarms</div>
            <div className="text-2xl font-bold text-noc-warning">{summary.total_alarms}</div>
            <div className="text-xs text-noc-muted mt-1">
              <span className="text-noc-error">{summary.critical_alarms}C</span>{' '}
              <span className="text-noc-warning">{summary.major_alarms}M</span>{' '}
              <span className="text-noc-muted">{summary.minor_alarms}m</span>{' '}
              <span className="text-noc-muted">{summary.warning_alarms}w</span>
            </div>
          </div>
        </div>
      )}

      {/* 告警统计 */}
      {summary && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-noc-text mb-3">Alarm Breakdown</h3>
            <div className="space-y-2">
              {[
                { label: 'Critical', value: summary.critical_alarms, color: 'bg-noc-error' },
                { label: 'Major', value: summary.major_alarms, color: 'bg-noc-warning' },
                { label: 'Minor', value: summary.minor_alarms, color: 'bg-noc-accent' },
                { label: 'Warning', value: summary.warning_alarms, color: 'bg-noc-muted' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-xs text-noc-muted w-16">{item.label}</span>
                  <div className="flex-1 bg-noc-bg rounded-full h-4 overflow-hidden">
                    <div className={`${item.color} h-full rounded-full transition-all`}
                      style={{ width: summary.total_alarms > 0 ? `${(item.value / summary.total_alarms) * 100}%` : '0%' }} />
                  </div>
                  <span className="text-xs text-noc-text w-8 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-noc-text mb-3">Acknowledgement</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-noc-muted w-24">Acknowledged</span>
                <div className="flex-1 bg-noc-bg rounded-full h-4 overflow-hidden">
                  <div className="bg-noc-success h-full rounded-full transition-all"
                    style={{ width: summary.total_alarms > 0 ? `${(summary.acknowledged_alarms / summary.total_alarms) * 100}%` : '0%' }} />
                </div>
                <span className="text-xs text-noc-text w-8 text-right">{summary.acknowledged_alarms}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-noc-muted w-24">Unacknowledged</span>
                <div className="flex-1 bg-noc-bg rounded-full h-4 overflow-hidden">
                  <div className="bg-noc-error h-full rounded-full transition-all"
                    style={{ width: summary.total_alarms > 0 ? `${(summary.unacknowledged_alarms / summary.total_alarms) * 100}%` : '0%' }} />
                </div>
                <span className="text-xs text-noc-text w-8 text-right">{summary.unacknowledged_alarms}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 导出按钮 */}
      <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-noc-text mb-3 flex items-center gap-2"><Download className="w-4 h-4" /> Export Data</h3>
        <div className="flex gap-3">
          <button onClick={() => downloadCSV('metrics')} className="flex items-center gap-2 px-4 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text hover:border-noc-accent transition-colors">
            <BarChart3 className="w-4 h-4 text-noc-accent" /> Export Metrics CSV
          </button>
          <button onClick={() => downloadCSV('alarms')} className="flex items-center gap-2 px-4 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text hover:border-noc-accent transition-colors">
            <AlertTriangle className="w-4 h-4 text-noc-warning" /> Export Alarms CSV
          </button>
        </div>
      </div>
    </div>
  );
}
