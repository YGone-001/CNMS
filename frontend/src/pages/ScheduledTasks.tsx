import { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, Play, Pause, Plus, Pencil, Trash2, X } from 'lucide-react';
import type { ScheduledTask } from '@/types/monitor';

interface TaskFormData {
  name: string;
  type: string;
  cron: string;
  target: string;
  command: string;
  enabled: boolean;
}

const EMPTY_FORM: TaskFormData = { name: '', type: 'health_check', cron: '0 * * * *', target: '', command: '', enabled: true };

export default function ScheduledTasks() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM);
  const [actionLoading, setActionLoading] = useState(false);

  const flash = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 4000);
  };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/tasks');
      const data = await resp.json();
      if (data.status === 'ok') setTasks(data.tasks || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditId(null); setShowDialog(true); };
  const openEdit = (task: ScheduledTask) => {
    setEditId(task._id);
    setForm({ name: task.name, type: task.type, cron: task.cron, target: task.target, command: task.command, enabled: task.enabled });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.cron) { flash('Name and cron expression are required', 'error'); return; }
    setActionLoading(true);
    try {
      const url = editId ? `/api/v1/tasks?id=${editId}` : '/api/v1/tasks';
      const method = editId ? 'PUT' : 'POST';
      const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await resp.json();
      if (data.status === 'ok') {
        flash(editId ? 'Task updated' : 'Task created', 'success');
        setShowDialog(false);
        fetchTasks();
      } else {
        flash(data.message, 'error');
      }
    } catch (err) {
      flash((err as Error).message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(true);
    try {
      const resp = await fetch(`/api/v1/tasks?id=${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.status === 'ok') {
        flash('Task deleted', 'success');
        setDeleteId(null);
        fetchTasks();
      } else {
        flash(data.message, 'error');
      }
    } catch (err) {
      flash((err as Error).message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggle = async (task: ScheduledTask) => {
    try {
      const resp = await fetch(`/api/v1/tasks?id=${task._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !task.enabled }),
      });
      const data = await resp.json();
      if (data.status === 'ok') fetchTasks();
    } catch { /* ignore */ }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'health_check': return 'Health Check';
      case 'restart': return 'Auto Restart';
      case 'cleanup': return 'Cleanup';
      case 'custom': return 'Custom';
      default: return type;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'health_check': return 'text-noc-accent bg-noc-accent-10';
      case 'restart': return 'text-noc-warning bg-noc-warning-10';
      case 'cleanup': return 'text-noc-success bg-noc-success-10';
      default: return 'text-noc-text bg-noc-surface';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Scheduled Tasks</h2>
          <p className="text-sm text-noc-muted mt-0.5">Manage automated operations and periodic jobs</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchTasks} disabled={loading}
            className="p-2 bg-noc-surface text-noc-muted rounded-lg hover:text-noc-text transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 bg-noc-success text-white rounded-lg text-sm font-medium hover:opacity-90">
            <Plus className="w-3.5 h-3.5" /> Create Task
          </button>
        </div>
      </div>

      {error && <div className="bg-noc-error-10 border border-noc-error-30 rounded-lg p-3 text-sm text-noc-error">{error}</div>}
      {success && <div className="bg-noc-success-10 border border-noc-success rounded-lg p-3 text-sm text-noc-success">{success}</div>}

      {tasks.length > 0 ? (
        <div className="grid gap-3">
          {tasks.map(task => (
            <div key={task._id} className="bg-noc-surface border border-noc-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${typeColor(task.type)}`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-noc-text">{task.name}</div>
                    <div className="text-xs text-noc-muted mt-0.5">
                      {typeLabel(task.type)} {task.target && `. ${task.target}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-noc-muted font-mono">{task.cron}</div>
                    {task.last_run && (
                      <div className="text-xs text-noc-muted mt-0.5">
                        Last: {new Date(task.last_run).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleToggle(task)}
                    className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${task.enabled ? 'bg-noc-success-10 text-noc-success' : 'bg-noc-error-10 text-noc-error'}`}>
                    {task.enabled ? <><Play className="w-3 h-3 inline mr-1" />Enabled</> : <><Pause className="w-3 h-3 inline mr-1" />Disabled</>}
                  </button>
                  <button onClick={() => openEdit(task)}
                    className="p-1.5 rounded text-noc-muted hover:text-noc-accent hover:bg-noc-accent-10 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteId(task._id)}
                    className="p-1.5 rounded text-noc-muted hover:text-noc-error hover:bg-noc-error-10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {task.command && (
                <div className="mt-3 px-3 py-2 bg-noc-bg rounded text-xs font-mono text-noc-muted">{task.command}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center">
          <Clock className="w-8 h-8 text-noc-muted mx-auto mb-2" />
          <div className="text-sm text-noc-muted">No scheduled tasks configured</div>
          <div className="text-xs text-noc-muted mt-1">Click "Create Task" to add one</div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDialog(false)}>
          <div className="bg-noc-surface border border-noc-border rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-noc-border">
              <h3 className="text-sm font-semibold text-noc-text">{editId ? 'Edit Task' : 'Create Task'}</h3>
              <button onClick={() => setShowDialog(false)} className="text-noc-muted hover:text-noc-text"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs text-noc-muted mb-1">Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent" placeholder="Daily health check" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-noc-muted mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent">
                    <option value="health_check">Health Check</option>
                    <option value="restart">Auto Restart</option>
                    <option value="cleanup">Cleanup</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-noc-muted mb-1">Cron Expression</label>
                  <input value={form.cron} onChange={e => setForm({ ...form, cron: e.target.value })}
                    className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text font-mono focus:outline-none focus:border-noc-accent" placeholder="0 * * * *" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-noc-muted mb-1">Target (NF name)</label>
                <input value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}
                  className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent" placeholder="amfd" />
              </div>
              {form.type === 'custom' && (
                <div>
                  <label className="block text-xs text-noc-muted mb-1">Command</label>
                  <input value={form.command} onChange={e => setForm({ ...form, command: e.target.value })}
                    className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text font-mono focus:outline-none focus:border-noc-accent" placeholder="sh /opt/scripts/cleanup.sh" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="task-enabled" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })}
                  className="rounded border-noc-border" />
                <label htmlFor="task-enabled" className="text-sm text-noc-text">Enabled</label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-noc-border">
              <button onClick={() => setShowDialog(false)} className="px-4 py-2 text-sm text-noc-muted hover:text-noc-text">Cancel</button>
              <button onClick={handleSave} disabled={actionLoading}
                className="px-4 py-2 bg-noc-accent text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {actionLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteId(null)}>
          <div className="bg-noc-surface border border-noc-border rounded-lg shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-noc-text mb-2">Confirm Delete</h3>
              <p className="text-sm text-noc-muted">Are you sure you want to delete this scheduled task?</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-noc-border">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-noc-muted hover:text-noc-text">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} disabled={actionLoading}
                className="px-4 py-2 bg-noc-error text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
