import { useState, useEffect, useCallback } from 'react';
import { Globe, Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import type { Site } from '@/types/monitor';

export default function Sites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [form, setForm] = useState({ name: '', address: '', description: '', nrf_url: '', enabled: true, type: 'dc' as string, parent_id: '', nf_ids: '' });

  const fetchSites = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/sites');
      const data = await resp.json();
      setSites(data.sites || []);
    } catch { setSites([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  const openCreate = () => {
    setEditingSite(null);
    setForm({ name: '', address: '', description: '', nrf_url: '', enabled: true, type: 'dc', parent_id: '', nf_ids: '' });
    setShowDialog(true);
  };

  const openEdit = (site: Site) => {
    setEditingSite(site);
    setForm({
      name: site.name,
      address: site.address || '',
      description: site.description || '',
      nrf_url: site.nrf_url || '',
      enabled: site.enabled,
      type: site.type || 'dc',
      parent_id: site.parent_id || '',
      nf_ids: site.nf_ids?.join(', ') || '',
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    const method = editingSite ? 'PUT' : 'POST';
    const url = editingSite ? `/api/v1/sites?id=${editingSite._id}` : '/api/v1/sites';
    const body = {
      ...form,
      nf_ids: form.nf_ids ? form.nf_ids.split(',').map(s => s.trim()).filter(Boolean) : [],
    };
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setShowDialog(false);
    fetchSites();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此站点？')) return;
    await fetch(`/api/v1/sites?id=${id}`, { method: 'DELETE' });
    fetchSites();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Sites / Regions</h2>
          <p className="text-sm text-noc-muted mt-0.5">Multi-site NF management</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchSites} disabled={loading} className="p-2 text-noc-muted hover:text-noc-accent transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="flex items-center gap-1 px-3 py-1.5 bg-noc-accent text-white rounded-lg text-sm hover:opacity-90">
            <Plus className="w-4 h-4" /> Add Site
          </button>
        </div>
      </div>

      <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-noc-border bg-noc-bg-50">
              <th className="px-4 py-3 text-left text-noc-muted font-medium">Name</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">Type</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">Address</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">NRF URL</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">NF Count</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">Status</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">Description</th>
              <th className="px-4 py-3 text-right text-noc-muted font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sites.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-noc-muted">No sites configured</td></tr>
            ) : sites.map((s) => (
              <tr key={s._id} className="border-b border-noc-border hover:bg-noc-bg-50">
                <td className="px-4 py-3 text-noc-text font-medium flex items-center gap-2"><Globe className="w-4 h-4 text-noc-accent" />{s.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    s.type === 'region' ? 'bg-purple-500/15 text-purple-400' :
                    s.type === 'dc' ? 'bg-sky-500/15 text-sky-400' :
                    'bg-emerald-500/15 text-emerald-400'
                  }`}>{s.type || 'dc'}</span>
                </td>
                <td className="px-4 py-3 text-noc-muted">{s.address || '-'}</td>
                <td className="px-4 py-3 text-noc-muted font-mono text-xs">{s.nrf_url || '-'}</td>
                <td className="px-4 py-3 text-noc-muted text-xs">{s.nf_ids?.length || 0}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${s.enabled ? 'bg-noc-success-10 text-noc-success' : 'bg-noc-bg text-noc-muted'}`}>
                    {s.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3 text-noc-muted text-xs">{s.description || '-'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(s)} className="p-1 text-noc-muted hover:text-noc-accent"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(s._id)} className="p-1 text-noc-muted hover:text-noc-error ml-1"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-noc-surface border border-noc-border rounded-lg p-6 w-96 space-y-4">
            <h3 className="text-lg font-semibold text-noc-text">{editingSite ? 'Edit Site' : 'Add Site'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-noc-muted">Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text" placeholder="Beijing-DC1" />
              </div>
              <div>
                <label className="text-xs text-noc-muted">Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text">
                  <option value="region">Region</option>
                  <option value="dc">DC (Data Center)</option>
                  <option value="node">Node</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-noc-muted">Parent Site</label>
                <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text">
                  <option value="">None (top level)</option>
                  {sites.filter(s => s._id !== editingSite?._id).map(s => (
                    <option key={s._id} value={s._id}>{s.name} ({s.type || 'dc'})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-noc-muted">Address / IP</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text" placeholder="10.0.1.100" />
              </div>
              <div>
                <label className="text-xs text-noc-muted">NRF URL</label>
                <input value={form.nrf_url} onChange={(e) => setForm({ ...form, nrf_url: e.target.value })} className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text font-mono" placeholder="http://10.0.1.100:8080" />
              </div>
              <div>
                <label className="text-xs text-noc-muted">NF Process Names (comma-separated)</label>
                <input value={form.nf_ids} onChange={(e) => setForm({ ...form, nf_ids: e.target.value })} className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text font-mono" placeholder="amfd, smfd, upfd" />
              </div>
              <div>
                <label className="text-xs text-noc-muted">Description</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text" />
              </div>
              <label className="flex items-center gap-2 text-sm text-noc-text">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                Enabled
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDialog(false)} className="px-4 py-2 text-sm text-noc-muted hover:text-noc-text">Cancel</button>
              <button onClick={handleSubmit} className="px-4 py-2 bg-noc-accent text-white rounded text-sm hover:opacity-90">{editingSite ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
