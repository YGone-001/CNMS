import { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, Search } from 'lucide-react';
import type { AuditLogEntry } from '@/types/monitor';

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '50' });
      if (filterUser) params.set('user', filterUser);
      if (filterAction) params.set('action', filterAction);
      const resp = await fetch(`/api/v1/audit/logs?${params}`);
      const data = await resp.json();
      if (data.status === 'ok') {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('fetch audit logs error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filterUser, filterAction]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const actionColor = (action: string) => {
    switch (action) {
      case 'ADD-SUB': return 'text-noc-success';
      case 'DEL-SUB': return 'text-noc-error';
      case 'MOD-SUB': return 'text-noc-warning';
      case 'CTRL-NF': return 'text-noc-accent';
      case 'ACK-ALARM': case 'CLR-ALARM': return 'text-noc-warning';
      default: return 'text-noc-text';
    }
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Audit Logs</h2>
          <p className="text-sm text-noc-muted mt-0.5">Track all system operations and changes</p>
        </div>
        <button onClick={fetchLogs} disabled={loading}
          className="p-2 bg-noc-surface text-noc-muted rounded-lg hover:text-noc-text transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
          <input type="text" value={filterUser} onChange={e => { setFilterUser(e.target.value); setPage(1); }}
            placeholder="Filter by user..."
            className="pl-9 pr-4 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text placeholder:text-noc-muted focus:outline-none focus:border-noc-accent w-40" />
        </div>
        <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent">
          <option value="">All Actions</option>
          <option value="ADD-SUB">ADD-SUB</option>
          <option value="DEL-SUB">DEL-SUB</option>
          <option value="MOD-SUB">MOD-SUB</option>
          <option value="CTRL-NF">CTRL-NF</option>
          <option value="LOGIN">LOGIN</option>
        </select>
      </div>

      {logs.length > 0 ? (
        <>
          <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border">
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">Time</th>
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">User</th>
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">Action</th>
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">Resource</th>
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">Detail</th>
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log._id} className="border-b border-noc-border-50 hover:bg-noc-bg-50">
                    <td className="px-4 py-3 text-noc-muted text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3 text-noc-text font-mono">{log.user}</td>
                    <td className="px-4 py-3"><span className={`font-semibold ${actionColor(log.action)}`}>{log.action}</span></td>
                    <td className="px-4 py-3 text-noc-text">{log.resource}</td>
                    <td className="px-4 py-3 text-noc-muted max-w-xs truncate">{log.detail}</td>
                    <td className="px-4 py-3 text-noc-muted text-xs font-mono">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-noc-muted">
              <span>Total {total} records</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1 bg-noc-surface rounded disabled:opacity-30">Prev</button>
                <span>Page {page}/{totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-3 py-1 bg-noc-surface rounded disabled:opacity-30">Next</button>
              </div>
            </div>
          )}
        </>
      ) : (
        loading ? (
          <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center">
            <RefreshCw className="w-8 h-8 text-noc-muted mx-auto mb-2 animate-spin" />
            <div className="text-sm text-noc-muted">Loading audit logs...</div>
          </div>
        ) : (
          <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center">
            <FileText className="w-8 h-8 text-noc-muted mx-auto mb-2" />
            <div className="text-sm text-noc-muted">No audit logs found</div>
          </div>
        )
      )}
    </div>
  );
}
