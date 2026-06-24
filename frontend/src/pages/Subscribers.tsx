import { useState, useCallback } from 'react';
import { Users, Search, RefreshCw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Upload } from 'lucide-react';
import type { Subscriber, LstSubResponse, MmlResponse } from '@/types/monitor';

// -- Dialog state types ---------------------------------------------------
interface SubFormData {
  imsi: string;
  apn: string;
  qos: number;
  ambrDl: number;
  ambrUl: number;
  ambrUnit: number;
}

const EMPTY_FORM: SubFormData = { imsi: '', apn: 'internet', qos: 9, ambrDl: 1, ambrUl: 1, ambrUnit: 3 };

export default function Subscribers() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchImsi, setSearchImsi] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [formData, setFormData] = useState<SubFormData>(EMPTY_FORM);
  const [editTarget, setEditTarget] = useState<string>('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const flash = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 4000);
  };

  // -- MML execution helper -----------------------------------------------
  const execMml = useCallback(async (command: string): Promise<MmlResponse> => {
    const resp = await fetch('/api/v1/mml/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    return resp.json();
  }, []);

  // -- Fetch subscribers ---------------------------------------------------
  const fetchSubscribers = useCallback(async (imsi?: string, p?: number, ps?: number) => {
    setLoading(true);
    setError('');
    const currentPage = p ?? page;
    const currentPageSize = ps ?? pageSize;
    try {
      const cmd = imsi
        ? `LST-SUB: IMSI=${imsi};`
        : `LST-SUB: PAGE=${currentPage}, PAGE_SIZE=${currentPageSize};`;
      const data: LstSubResponse = await execMml(cmd);
      if (data.status === 'ok') {
        setSubscribers(data.subscribers || []);
        if (data.total !== undefined) setTotal(data.total);
        if (data.page) setPage(data.page);
      } else {
        setError(data.message || 'Query failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, execMml]);

  // -- CRUD handlers -------------------------------------------------------
  const handleAdd = async () => {
    if (!formData.imsi.trim()) { flash('IMSI is required', 'error'); return; }
    setActionLoading(true);
    try {
      const cmd = `ADD-SUB: IMSI=${formData.imsi}, APN=${formData.apn}, QOS=${formData.qos}, AMBR_DL=${formData.ambrDl}, AMBR_UL=${formData.ambrUl}, AMBR_UNIT=${formData.ambrUnit};`;
      const data = await execMml(cmd);
      if (data.status === 'ok') {
        flash(`Subscriber ${formData.imsi} added`, 'success');
        setShowAddDialog(false);
        setFormData(EMPTY_FORM);
        fetchSubscribers();
      } else {
        flash(data.message, 'error');
      }
    } catch (err) {
      flash((err as Error).message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const openEdit = (sub: Subscriber) => {
    setEditTarget(sub.imsi);
    setFormData({
      imsi: sub.imsi,
      apn: sub.sessions?.[0]?.name || 'internet',
      qos: sub.sessions?.[0]?.qos ?? 9,
      ambrDl: sub.ambr?.downlink?.value ?? 1,
      ambrUl: sub.ambr?.uplink?.value ?? 1,
      ambrUnit: sub.ambr?.downlink?.unit ?? 3,
    });
    setShowEditDialog(true);
  };

  const handleEdit = async () => {
    setActionLoading(true);
    try {
      const cmd = `MOD-SUB: IMSI=${editTarget}, APN=${formData.apn}, QOS=${formData.qos}, AMBR_DL=${formData.ambrDl}, AMBR_UL=${formData.ambrUl}, AMBR_UNIT=${formData.ambrUnit};`;
      const data = await execMml(cmd);
      if (data.status === 'ok') {
        flash(`Subscriber ${editTarget} updated`, 'success');
        setShowEditDialog(false);
        fetchSubscribers();
      } else {
        flash(data.message, 'error');
      }
    } catch (err) {
      flash((err as Error).message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (imsi: string) => {
    setActionLoading(true);
    try {
      const data = await execMml(`DEL-SUB: IMSI=${imsi};`);
      if (data.status === 'ok') {
        flash(`Subscriber ${imsi} deleted`, 'success');
        setShowDeleteConfirm(null);
        fetchSubscribers();
      } else {
        flash(data.message, 'error');
      }
    } catch (err) {
      flash((err as Error).message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCsvImport = async () => {
    if (!importFile) return;
    setActionLoading(true);
    try {
      const text = await importFile.text();
      const lines = text.trim().split('\n');
      let added = 0;
      let failed = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || (i === 0 && line.toLowerCase().startsWith('imsi'))) continue;
        const parts = line.split(',').map(s => s.trim());
        const imsi = parts[0];
        const apn = parts[1] || 'internet';
        if (!imsi) { failed++; continue; }
        const data = await execMml(`ADD-SUB: IMSI=${imsi}, APN=${apn};`);
        if (data.status === 'ok') added++; else failed++;
      }
      flash(`CSV import done: ${added} added, ${failed} failed`, 'success');
      setShowImportDialog(false);
      setImportFile(null);
      fetchSubscribers();
    } catch (err) {
      flash((err as Error).message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // -- UI helpers ----------------------------------------------------------
  const handleSearch = () => {
    if (searchImsi.trim()) {
      fetchSubscribers(searchImsi.trim());
    } else {
      setPage(1);
      fetchSubscribers(undefined, 1, pageSize);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchSubscribers(undefined, newPage, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    fetchSubscribers(undefined, 1, newSize);
  };

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  // -- Sub-dialog component ------------------------------------------------
  const FormDialog = ({ title, onSubmit, onClose }: { title: string; onSubmit: () => void; onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-noc-surface border border-noc-border rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-noc-border">
          <h3 className="text-sm font-semibold text-noc-text">{title}</h3>
          <button onClick={onClose} className="text-noc-muted hover:text-noc-text"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs text-noc-muted mb-1">IMSI</label>
            <input value={formData.imsi} onChange={(e) => setFormData({ ...formData, imsi: e.target.value })}
              disabled={showEditDialog}
              className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text font-mono focus:outline-none focus:border-noc-accent disabled:opacity-50"
              placeholder="460110000000001" />
          </div>
          <div>
            <label className="block text-xs text-noc-muted mb-1">APN</label>
            <input value={formData.apn} onChange={(e) => setFormData({ ...formData, apn: e.target.value })}
              className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent"
              placeholder="internet" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-noc-muted mb-1">QoS (QCI)</label>
              <input type="number" value={formData.qos} onChange={(e) => setFormData({ ...formData, qos: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent" />
            </div>
            <div>
              <label className="block text-xs text-noc-muted mb-1">AMBR Unit</label>
              <input type="number" value={formData.ambrUnit} onChange={(e) => setFormData({ ...formData, ambrUnit: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-noc-muted mb-1">AMBR DL</label>
              <input type="number" value={formData.ambrDl} onChange={(e) => setFormData({ ...formData, ambrDl: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent" />
            </div>
            <div>
              <label className="block text-xs text-noc-muted mb-1">AMBR UL</label>
              <input type="number" value={formData.ambrUl} onChange={(e) => setFormData({ ...formData, ambrUl: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded text-sm text-noc-text focus:outline-none focus:border-noc-accent" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-noc-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-noc-muted hover:text-noc-text transition-colors">Cancel</button>
          <button onClick={onSubmit} disabled={actionLoading}
            className="px-4 py-2 bg-noc-accent text-white rounded text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {actionLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );

  // -- Render --------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Subscribers</h2>
          <p className="text-sm text-noc-muted mt-0.5">Manage 5G subscriber data</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
            <input type="text" value={searchImsi}
              onChange={(e) => setSearchImsi(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by IMSI..."
              className="pl-9 pr-4 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text placeholder:text-noc-muted focus:outline-none focus:border-noc-accent w-52" />
          </div>
          <button onClick={handleSearch} disabled={loading}
            className="px-4 py-2 bg-noc-accent-20 text-noc-accent rounded-lg text-sm font-medium hover:bg-noc-accent-30 transition-colors disabled:opacity-50">
            {loading ? 'Loading...' : 'Query'}
          </button>
          <button onClick={() => fetchSubscribers()} disabled={loading}
            className="p-2 bg-noc-surface text-noc-muted rounded-lg hover:text-noc-text transition-colors disabled:opacity-50" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <span className="w-px h-6 bg-noc-border mx-1" />
          <button onClick={() => { setFormData(EMPTY_FORM); setShowAddDialog(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-noc-success text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
          <button onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-noc-surface border border-noc-border text-noc-text rounded-lg text-sm font-medium hover:bg-noc-bg transition-colors">
            <Upload className="w-3.5 h-3.5" /> CSV Import
          </button>
        </div>
      </div>

      {/* Flash messages */}
      {error && (
        <div className="bg-noc-error-10 border border-noc-error-30 rounded-lg p-3 text-sm text-noc-error">{error}</div>
      )}
      {success && (
        <div className="bg-noc-success-10 border border-noc-success rounded-lg p-3 text-sm text-noc-success">{success}</div>
      )}

      {/* Table */}
      {subscribers.length > 0 ? (
        <>
          <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border">
                  <th className="text-left px-4 py-3 text-noc-muted font-medium w-8"></th>
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">IMSI</th>
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">APN</th>
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">QoS</th>
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">AMBR DL/UL</th>
                  <th className="text-left px-4 py-3 text-noc-muted font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-noc-muted font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((sub) => (
                  <tr key={sub._id + '-row'} className="border-b border-noc-border hover:bg-noc-bg-50 transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => setExpandedRow(expandedRow === sub._id ? null : sub._id)}
                        className="text-noc-muted hover:text-noc-text" aria-expanded={expandedRow === sub._id}>
                        {expandedRow === sub._id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-noc-accent">{sub.imsi}</td>
                    <td className="px-4 py-3 text-noc-text">{sub.sessions?.[0]?.name || '-'}</td>
                    <td className="px-4 py-3 text-noc-text">QCI {sub.sessions?.[0]?.qos ?? '-'}</td>
                    <td className="px-4 py-3 text-noc-text">
                      {sub.ambr?.downlink?.value}/{sub.ambr?.uplink?.value} (unit {sub.ambr?.downlink?.unit})
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        sub.subscriber_status === 0 ? 'bg-noc-success-10 text-noc-success' : 'bg-noc-error-10 text-noc-error'
                      }`}>
                        {sub.subscriber_status === 0 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(sub)}
                          className="p-1.5 rounded text-noc-muted hover:text-noc-accent hover:bg-noc-accent-10 transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setShowDeleteConfirm(sub.imsi)}
                          className="p-1.5 rounded text-noc-muted hover:text-noc-error hover:bg-noc-error-10 transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {subscribers.map((sub) =>
                  expandedRow === sub._id ? (
                    <tr key={sub._id + '-detail'}>
                      <td colSpan={7} className="px-4 py-4 bg-noc-bg-50">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <div className="text-noc-muted mb-1">Security</div>
                            <div className="font-mono text-noc-text space-y-0.5">
                              <div>K: {sub.security?.k || '-'}</div>
                              <div>AMF: {sub.security?.amf || '-'}</div>
                              {sub.security?.opc && <div>OPc: {sub.security.opc}</div>}
                            </div>
                          </div>
                          <div>
                            <div className="text-noc-muted mb-1">Session</div>
                            <div className="font-mono text-noc-text space-y-0.5">
                              <div>APN: {sub.sessions?.[0]?.name || '-'}</div>
                              <div>Type: {sub.sessions?.[0]?.type ?? '-'}</div>
                              <div>QoS: {sub.sessions?.[0]?.qos ?? '-'}</div>
                            </div>
                          </div>
                          <div>
                            <div className="text-noc-muted mb-1">Access</div>
                            <div className="font-mono text-noc-text space-y-0.5">
                              <div>RAU/TAU Timer: {sub.subscribed_rau_tau_timer}</div>
                              <div>Access Mode: {sub.network_access_mode}</div>
                              <div>Restriction: {sub.access_restriction_data}</div>
                            </div>
                          </div>
                          <div>
                            <div className="text-noc-muted mb-1">AMBR</div>
                            <div className="font-mono text-noc-text space-y-0.5">
                              <div>DL: {sub.ambr?.downlink?.value} (unit {sub.ambr?.downlink?.unit})</div>
                              <div>UL: {sub.ambr?.uplink?.value} (unit {sub.ambr?.uplink?.unit})</div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!searchImsi && totalPages > 0 && (
            <div className="flex items-center justify-between text-sm text-noc-muted">
              <div className="flex items-center gap-2">
                <span>Show</span>
                <select value={pageSize} onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="bg-noc-bg border border-noc-border rounded px-2 py-1 text-noc-text text-xs focus:outline-none focus:border-noc-accent">
                  <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                </select>
                <span>per page</span>
              </div>
              <div className="flex items-center gap-3">
                <span>Page {page} of {totalPages} ({total} total)</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1 || loading}
                    className="p-1 rounded hover:bg-noc-surface disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages || loading}
                    className="p-1 rounded hover:bg-noc-surface disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        !loading && !error && (
          <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center">
            <Users className="w-8 h-8 text-noc-muted mx-auto mb-2" />
            <div className="text-sm text-noc-muted">Click "Query" to load subscribers</div>
          </div>
        )
      )}

      {/* Add Dialog */}
      {showAddDialog && (
        <FormDialog title="Add Subscriber" onSubmit={handleAdd} onClose={() => setShowAddDialog(false)} />
      )}

      {/* Edit Dialog */}
      {showEditDialog && (
        <FormDialog title={`Edit Subscriber ${editTarget}`} onSubmit={handleEdit} onClose={() => setShowEditDialog(false)} />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(null)}>
          <div className="bg-noc-surface border border-noc-border rounded-lg shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-noc-text mb-2">Confirm Delete</h3>
              <p className="text-sm text-noc-muted">
                Are you sure you want to delete subscriber <span className="font-mono text-noc-error">{showDeleteConfirm}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-noc-border">
              <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 text-sm text-noc-muted hover:text-noc-text transition-colors">Cancel</button>
              <button onClick={() => handleDelete(showDeleteConfirm)} disabled={actionLoading}
                className="px-4 py-2 bg-noc-error text-white rounded text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowImportDialog(false)}>
          <div className="bg-noc-surface border border-noc-border rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-noc-border">
              <h3 className="text-sm font-semibold text-noc-text">Import Subscribers from CSV</h3>
              <button onClick={() => setShowImportDialog(false)} className="text-noc-muted hover:text-noc-text"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-noc-muted">CSV format: <code className="bg-noc-bg px-1 rounded">IMSI,APN</code> (one per line, header optional)</p>
              <input type="file" accept=".csv,.txt" onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-noc-text file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-noc-accent-20 file:text-noc-accent hover:file:bg-noc-accent-30" />
              {importFile && <p className="text-xs text-noc-success">Selected: {importFile.name} ({importFile.size} bytes)</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-noc-border">
              <button onClick={() => setShowImportDialog(false)} className="px-4 py-2 text-sm text-noc-muted hover:text-noc-text transition-colors">Cancel</button>
              <button onClick={handleCsvImport} disabled={!importFile || actionLoading}
                className="px-4 py-2 bg-noc-accent text-white rounded text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {actionLoading ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
