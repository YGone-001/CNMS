import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Clock, Tag, AlertTriangle, Activity, CheckCircle, FileText, Download, Copy } from 'lucide-react';
import { authFetch } from '@/App';
import MarkdownViewer from '@/components/MarkdownViewer';
import type { KbSolution } from '@/types/monitor';

export default function KnowledgeBaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<KbSolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('viewer');

  const loadData = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v1/solutions/${id}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setData(json);
    } catch {
      navigate('/kb');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadData();
    // 获取用户角色
    try {
      const token = localStorage.getItem('xcloud_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserRole(payload.role || 'viewer');
      }
    } catch {
      // ignore
    }
  }, [loadData]);

  const canEdit = userRole === 'admin' || userRole === 'operator';

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    try {
      const res = await authFetch(`/api/v1/solutions?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        navigate('/kb');
      }
    } catch {
      // ignore
    }
  };

  const handleDownload = async (e: React.MouseEvent, file: { url: string; original_name: string }) => {
    e.preventDefault();
    try {
      const res = await authFetch(file.url);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = file.original_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      window.open(file.url, '_blank');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(data?.solution || '');
  };

  const formatDate = (d: string) => (d ? new Date(d).toISOString().split('T')[0] : '');

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-noc-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-16">
      {/* Top Bar */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => navigate('/kb')}
          className="flex items-center gap-2 text-noc-muted hover:text-noc-accent transition-colors group"
        >
          <div className="w-7 h-7 rounded-full bg-noc-surface border border-noc-border flex items-center justify-center group-hover:border-noc-accent transition-colors">
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          </div>
          <span className="font-bold text-sm">Back to List</span>
        </button>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/kb/edit/${id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-noc-surface text-noc-text hover:text-noc-accent rounded-lg text-sm font-medium transition-colors border border-noc-border"
            >
              <Edit size={14} /> Edit
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-noc-surface text-noc-error hover:bg-noc-error-10 rounded-lg text-sm font-medium transition-colors border border-noc-border"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </div>

      {/* Title Section */}
      <div className="bg-noc-surface p-6 rounded-xl border border-noc-border shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="px-2.5 py-0.5 rounded bg-noc-accent-10 text-noc-accent text-xs font-bold uppercase tracking-wide">
            {data.protocol || 'General'}
          </span>
          <span className="flex items-center gap-1 text-xs text-noc-muted">
            <Clock size={12} /> {formatDate(data.created_at)}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-noc-text leading-tight mb-4">{data.title}</h1>

        {data.tags && data.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-noc-border">
            {data.tags.map((t, i) => (
              <span
                key={i}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-noc-bg text-noc-muted text-xs border border-noc-border"
              >
                <Tag size={10} /> {t}
              </span>
            ))}
          </div>
        )}

        {data.attachments && data.attachments.length > 0 && (
          <div className="mt-4 p-3 bg-noc-bg rounded-lg border border-noc-border">
            <h3 className="text-xs font-bold text-noc-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileText size={12} /> Attachments
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.attachments.map((file, idx) => (
                <a
                  key={idx}
                  href={file.url}
                  onClick={(e) => handleDownload(e, file)}
                  className="flex items-center justify-between p-2.5 bg-noc-surface border border-noc-border rounded-lg hover:border-noc-accent transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="w-7 h-7 rounded bg-noc-bg flex items-center justify-center text-noc-accent font-bold text-[10px] uppercase border border-noc-border">
                      {file.type || 'FILE'}
                    </div>
                    <span className="text-xs font-medium text-noc-text truncate group-hover:text-noc-accent transition-colors">
                      {file.original_name}
                    </span>
                  </div>
                  <Download size={14} className="text-noc-border group-hover:text-noc-accent transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Phenomenon & Root Cause */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-noc-surface p-5 rounded-xl border border-noc-border shadow-sm relative overflow-hidden hover:shadow-md transition-all">
          <div className="absolute top-0 left-0 w-1 h-full bg-noc-error"></div>
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-noc-error mb-2 uppercase tracking-wider">
            <AlertTriangle size={14} /> Phenomenon
          </h3>
          <p className="text-noc-text leading-relaxed whitespace-pre-wrap text-sm">{data.phenomenon || 'No description'}</p>
        </div>

        <div className="bg-noc-surface p-5 rounded-xl border border-noc-border shadow-sm relative overflow-hidden hover:shadow-md transition-all">
          <div className="absolute top-0 left-0 w-1 h-full bg-noc-warning"></div>
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-noc-warning mb-2 uppercase tracking-wider">
            <Activity size={14} /> Root Cause
          </h3>
          <p className="text-noc-text leading-relaxed whitespace-pre-wrap text-sm">{data.root_cause || 'No description'}</p>
        </div>
      </div>

      {/* Solution */}
      <div className="bg-noc-surface rounded-xl border border-noc-border shadow-sm overflow-hidden min-h-[200px]">
        <div className="px-5 py-3 border-b border-noc-border bg-noc-bg flex justify-between items-center">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-noc-success uppercase tracking-wider">
            <CheckCircle size={14} /> Solution
          </h3>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1 text-xs font-medium text-noc-muted hover:text-noc-accent transition-colors"
          >
            <Copy size={12} /> Copy
          </button>
        </div>
        <div className="p-6 prose dark:prose-invert max-w-none text-noc-text">
          <MarkdownViewer content={data.solution} />
        </div>
      </div>
    </div>
  );
}
