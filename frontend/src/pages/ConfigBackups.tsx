import { useState, useEffect, useCallback } from 'react';
import { Database, Download, GitCompare, Trash2, RefreshCw, FileText } from 'lucide-react';
import type { ConfigBackup } from '@/types/monitor';

const NF_LIST = [
  'amfd', 'ausfd', 'bsfd', 'drad', 'hssd', 'mmed', 'nrfd', 'nssfd',
  'ocsd', 'pcfd', 'pcrfd', 'pgwcd', 'pgwud', 'scpd', 'sgwcd', 'sgwud',
  'smfd', 'udmd', 'udrd', 'upfd',
];

export default function ConfigBackups() {
  const [backups, setBackups] = useState<ConfigBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNf, setSelectedNf] = useState('');
  const [viewContent, setViewContent] = useState<ConfigBackup | null>(null);
  const [diffResult, setDiffResult] = useState<any>(null);
  const [diffV1, setDiffV1] = useState('');
  const [diffV2, setDiffV2] = useState('');

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedNf) params.set('nf_name', selectedNf);
      const resp = await fetch(`/api/v1/backups?${params}`);
      const data = await resp.json();
      setBackups(data.backups || []);
    } catch { setBackups([]); }
    finally { setLoading(false); }
  }, [selectedNf]);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  const handleBackup = async (nfName: string) => {
    await fetch('/api/v1/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nf_name: nfName }),
    });
    fetchBackups();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此备份？')) return;
    await fetch(`/api/v1/backups?id=${id}`, { method: 'DELETE' });
    fetchBackups();
  };

  const handleDiff = async () => {
    if (!diffV1 || !diffV2) return;
    const resp = await fetch(`/api/v1/backups/diff?v1=${diffV1}&v2=${diffV2}`);
    const data = await resp.json();
    setDiffResult(data);
  };

  const downloadBackup = (b: ConfigBackup) => {
    const blob = new Blob([b.content || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${b.nf_name}_v${b.version}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Configuration Backups</h2>
          <p className="text-sm text-noc-muted mt-0.5">NF configuration version management</p>
        </div>
        <div className="flex gap-2">
          <select value={selectedNf} onChange={(e) => setSelectedNf(e.target.value)}
            className="px-2 py-1 bg-noc-bg border border-noc-border rounded text-sm text-noc-text">
            <option value="">All NFs</option>
            {NF_LIST.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={fetchBackups} disabled={loading} className="p-2 text-noc-muted hover:text-noc-accent">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="relative group">
            <button className="flex items-center gap-1 px-3 py-1.5 bg-noc-accent text-white rounded-lg text-sm hover:opacity-90">
              <Database className="w-4 h-4" /> Backup Now
            </button>
            <div className="absolute right-0 mt-1 w-48 bg-noc-surface border border-noc-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 max-h-60 overflow-y-auto">
              {NF_LIST.map((n) => (
                <button key={n} onClick={() => handleBackup(n)} className="w-full text-left px-3 py-2 text-sm text-noc-text hover:bg-noc-bg-50">{n}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Diff 工具 */}
      <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-noc-text mb-3 flex items-center gap-2"><GitCompare className="w-4 h-4" /> Version Diff</h3>
        <div className="flex gap-2 items-end">
          <div>
            <label className="text-xs text-noc-muted">Version 1 ID</label>
            <input value={diffV1} onChange={(e) => setDiffV1(e.target.value)} className="block px-2 py-1 bg-noc-bg border border-noc-border rounded text-xs text-noc-text font-mono w-48" placeholder="backup id" />
          </div>
          <div>
            <label className="text-xs text-noc-muted">Version 2 ID</label>
            <input value={diffV2} onChange={(e) => setDiffV2(e.target.value)} className="block px-2 py-1 bg-noc-bg border border-noc-border rounded text-xs text-noc-text font-mono w-48" placeholder="backup id" />
          </div>
          <button onClick={handleDiff} className="px-3 py-1 bg-noc-accent text-white rounded text-xs">Compare</button>
        </div>
        {diffResult && (
          <div className="mt-3 max-h-48 overflow-y-auto font-mono text-xs bg-noc-terminal p-3 rounded">
            {diffResult.diff?.map((line: any, i: number) => (
              <div key={i} className={`${line.type === 'add' ? 'text-noc-success' : line.type === 'del' ? 'text-noc-error' : 'text-noc-muted'}`}>
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '} {line.content}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 备份列表 */}
      <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-noc-border bg-noc-bg-50">
              <th className="px-4 py-3 text-left text-noc-muted font-medium">NF</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">Version</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">Size</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">Checksum</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">Comment</th>
              <th className="px-4 py-3 text-left text-noc-muted font-medium">Time</th>
              <th className="px-4 py-3 text-right text-noc-muted font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-noc-muted">No backups found</td></tr>
            ) : backups.map((b) => (
              <tr key={b._id} className="border-b border-noc-border hover:bg-noc-bg-50">
                <td className="px-4 py-3 text-noc-text font-medium">{b.nf_name}</td>
                <td className="px-4 py-3 text-noc-accent">v{b.version}</td>
                <td className="px-4 py-3 text-noc-muted">{formatBytes(b.size)}</td>
                <td className="px-4 py-3 text-noc-muted font-mono text-xs">{b.checksum.slice(0, 12)}...</td>
                <td className="px-4 py-3 text-noc-muted text-xs">{b.comment || '-'}</td>
                <td className="px-4 py-3 text-noc-muted text-xs">{new Date(b.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setViewContent(b)} className="p-1 text-noc-muted hover:text-noc-accent" title="View"><FileText className="w-4 h-4" /></button>
                  <button onClick={() => downloadBackup(b)} className="p-1 text-noc-muted hover:text-noc-accent ml-1" title="Download"><Download className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(b._id)} className="p-1 text-noc-muted hover:text-noc-error ml-1" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 内容查看弹窗 */}
      {viewContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setViewContent(null)}>
          <div className="bg-noc-surface border border-noc-border rounded-lg p-6 w-[80vw] max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-noc-text">{viewContent.nf_name} v{viewContent.version}</h3>
              <button onClick={() => setViewContent(null)} className="text-noc-muted hover:text-noc-text">✕</button>
            </div>
            <pre className="max-h-[60vh] overflow-y-auto font-mono text-xs bg-noc-terminal p-4 rounded text-noc-text whitespace-pre-wrap">{viewContent.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
