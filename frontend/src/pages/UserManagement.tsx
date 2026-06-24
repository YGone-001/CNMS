import { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw, Shield, UserCheck, UserX, Plus, Pencil, Trash2, X, KeyRound } from 'lucide-react';
import type { SystemUser } from '@/types/monitor';

interface UserFormData {
  username: string;
  password: string;
  role: string;
  enabled: boolean;
}

const EMPTY_FORM: UserFormData = { username: '', password: '', role: 'viewer', enabled: true };

export default function UserManagement() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editUsername, setEditUsername] = useState<string | null>(null);
  const [deleteUsername, setDeleteUsername] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [actionLoading, setActionLoading] = useState(false);

  const flash = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 4000);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/users');
      const data = await resp.json();
      if (data.status === 'ok') setUsers(data.users || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditUsername(null); setShowDialog(true); };
  const openEdit = (user: SystemUser) => {
    setEditUsername(user.username);
    setForm({ username: user.username, password: '', role: user.role, enabled: user.enabled });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.username) { flash('Username is required', 'error'); return; }
    if (!editUsername && !form.password) { flash('Password is required for new users', 'error'); return; }
    setActionLoading(true);
    try {
      let resp: Response;
      if (editUsername) {
        const body: Record<string, unknown> = { role: form.role, enabled: form.enabled };
        if (form.password) body.password = form.password;
        resp = await fetch(`/api/v1/users?username=${editUsername}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      } else {
        resp = await fetch('/api/v1/users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        });
      }
      const data = await resp.json();
      if (data.status === 'ok') {
        flash(editUsername ? 'User updated' : 'User created', 'success');
        setShowDialog(false);
        fetchUsers();
      } else {
        flash(data.message, 'error');
      }
    } catch (err) {
      flash((err as Error).message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (username: string) => {
    setActionLoading(true);
    try {
      const resp = await fetch(`/api/v1/users?username=${username}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.status === 'ok') {
        flash('User deleted', 'success');
        setDeleteUsername(null);
        fetchUsers();
      } else {
        flash(data.message, 'error');
      }
    } catch (err) {
      flash((err as Error).message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const roleConfig: Record<string, { color: string; icon: typeof Shield; label: string }> = {
    admin: { color: 'text-noc-error bg-noc-error-10', icon: Shield, label: 'Admin' },
    operator: { color: 'text-noc-warning bg-noc-warning-10', icon: UserCheck, label: 'Operator' },
    viewer: { color: 'text-noc-accent bg-noc-accent-10', icon: Users, label: 'Viewer' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">User Management</h2>
          <p className="text-sm text-noc-muted mt-0.5">Manage system users and access permissions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchUsers} disabled={loading}
            className="p-2 bg-noc-surface text-noc-muted rounded-lg hover:text-noc-text transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 bg-noc-success text-white rounded-lg text-sm font-medium hover:opacity-90">
            <Plus className="w-3.5 h-3.5" /> Add User
          </button>
        </div>
      </div>

      {error && <div className="bg-noc-error-10 border border-noc-error-30 rounded-lg p-3 text-sm text-noc-error">{error}</div>}
      {success && <div className="bg-noc-success-10 border border-noc-success rounded-lg p-3 text-sm text-noc-success">{success}</div>}

      {/* Role legend */}
      <div className="flex items-center gap-4 text-xs">
        {Object.entries(roleConfig).map(([role, cfg]) => (
          <div key={role} className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
          </div>
        ))}
      </div>

      {users.length > 0 ? (
        <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-noc-border">
                <th className="text-left px-4 py-3 text-noc-muted font-medium">Username</th>
                <th className="text-left px-4 py-3 text-noc-muted font-medium">Role</th>
                <th className="text-left px-4 py-3 text-noc-muted font-medium">Status</th>
                <th className="text-left px-4 py-3 text-noc-muted font-medium">Created</th>
                <th className="text-left px-4 py-3 text-noc-muted font-medium">Last Login</th>
                <th className="text-right px-4 py-3 text-noc-muted font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const cfg = roleConfig[user.role] || roleConfig.viewer;
                const Icon = cfg.icon;
                return (
                  <tr key={user._id} className="border-b border-noc-border-50 hover:bg-noc-bg-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-noc-muted" />
                        <span className="text-noc-text font-medium">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      {user.enabled ? <span className="text-xs text-noc-success">Active</span> : <span className="text-xs text-noc-error">Disabled</span>}
                    </td>
                    <td className="px-4 py-3 text-noc-muted text-xs">{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-noc-muted text-xs">{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(user)}
                          className="p-1.5 rounded text-noc-muted hover:text-noc-accent hover:bg-noc-accent-10 transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteUsername(user.username)}
                          className="p-1.5 rounded text-noc-muted hover:text-noc-error hover:bg-noc-error-10 transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center">
          <UserX className="w-8 h-8 text-noc-muted mx-auto mb-2" />
          <div className="text-sm text-noc-muted">No users found</div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDialog(false)}>
          <div className="bg-noc-surface border border-noc-border rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-noc-border">
              <h3 className="text-sm font-semibold text-noc-text">{editUsername ? `Edit User: ${editUsername}` : 'Create User'}</h3>
              <button onClick={() => setShowDialog(false)} className="text-noc-muted hover:text-noc-text"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs text-noc-muted mb-1">Username</label>
                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                  disabled={!!editUsername}
                  className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs text-noc-muted mb-1">
                  <KeyRound className="w-3 h-3 inline mr-1" />
                  {editUsername ? 'New Password (leave blank to keep current)' : 'Password'}
                </label>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent"
                  placeholder={editUsername ? '(unchanged)' : ''} />
              </div>
              <div>
                <label className="block text-xs text-noc-muted mb-1">Role</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent">
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="user-enabled" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })}
                  className="rounded border-noc-border" />
                <label htmlFor="user-enabled" className="text-sm text-noc-text">Enabled</label>
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
      {deleteUsername && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteUsername(null)}>
          <div className="bg-noc-surface border border-noc-border rounded-lg shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-noc-text mb-2">Confirm Delete</h3>
              <p className="text-sm text-noc-muted">Are you sure you want to delete user <span className="font-mono text-noc-error">{deleteUsername}</span>?</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-noc-border">
              <button onClick={() => setDeleteUsername(null)} className="px-4 py-2 text-sm text-noc-muted hover:text-noc-text">Cancel</button>
              <button onClick={() => handleDelete(deleteUsername)} disabled={actionLoading}
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
