import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Database, Hash, ChevronRight, X, Activity, BookOpen, Clock, Plus, RefreshCw, ChevronLeft, Tag } from 'lucide-react';
import { authFetch } from '@/App';
import type { KbSolution, KbStats, KbSearchResponse } from '@/types/monitor';

const FIXED_TAGS = [
  { name: 'SIP', bg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { name: 'Diameter', bg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { name: 'GTP', bg: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  { name: 'HTTP/2', bg: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  { name: 'VoLTE', bg: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
  { name: '5G SA', bg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { name: '注册失败', bg: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { name: '无声音', bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { name: '鉴权', bg: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  { name: 'QoS', bg: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
];

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KbSolution[]>([]);
  const [stats, setStats] = useState<KbStats>({ status: '', total_solutions: 0, top_tags: [], top_protocols: [] });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const loadStats = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/solutions/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // ignore
    }
  }, []);

  const performSearch = useCallback(async (q: string, p: number = 1) => {
    setLoading(true);
    try {
      const url = q
        ? `/api/v1/solutions/search?q=${encodeURIComponent(q)}&page=${p}&page_size=${pageSize}`
        : `/api/v1/solutions?page=${p}&page_size=${pageSize}`;
      const res = await authFetch(url);
      if (res.ok) {
        const data: KbSearchResponse = await res.json();
        setResults(data.solutions || []);
        setTotal(data.total || 0);
        setPage(data.page || 1);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    loadStats();
    performSearch('');
  }, [loadStats, performSearch]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    performSearch(val, 1);
  };

  const handlePageChange = (newPage: number) => {
    performSearch(query, newPage);
  };

  const formatDate = (d: string) => (d ? new Date(d).toISOString().split('T')[0] : '');

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Knowledge Base</h2>
          <p className="text-sm text-noc-muted mt-0.5">Core network troubleshooting solutions</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadStats(); performSearch(query); }}
            disabled={loading}
            className="p-2 bg-noc-surface text-noc-muted rounded-lg hover:text-noc-text transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => navigate('/kb/edit')}
            className="flex items-center gap-1.5 px-3 py-2 bg-noc-success text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" /> New Entry
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 dark:from-blue-900 dark:to-slate-900 rounded-xl p-5 text-white shadow-lg relative overflow-hidden border border-blue-500/20">
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-2 -translate-y-2">
            <Database size={80} />
          </div>
          <div className="relative z-10">
            <h3 className="text-blue-100 font-medium text-xs uppercase tracking-wider mb-1">Total Solutions</h3>
            <div className="text-3xl font-bold">
              {stats.total_solutions || 0} <span className="text-base font-normal opacity-80">entries</span>
            </div>
          </div>
        </div>

        <div className="bg-noc-surface rounded-xl p-5 border border-noc-border shadow-sm flex flex-col justify-center">
          <h3 className="text-noc-muted text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
            <Hash size={14} /> Popular Tags
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {(stats.top_tags || []).slice(0, 8).map((t, i) => (
              <button
                key={i}
                onClick={() => { setQuery(t.tag); performSearch(t.tag); }}
                className="text-xs px-2 py-0.5 rounded bg-noc-bg text-noc-text border border-noc-border hover:border-noc-accent transition-colors"
              >
                {t.tag}
              </button>
            ))}
            {(!stats.top_tags || stats.top_tags.length === 0) && (
              <span className="text-xs text-noc-muted">No tags yet</span>
            )}
          </div>
        </div>

        <div className="bg-noc-surface rounded-xl p-5 border border-noc-border shadow-sm flex flex-col justify-center">
          <h3 className="text-noc-muted text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
            <Activity size={14} /> System Status
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-noc-text">Database</span>
              <span className="text-noc-success font-bold">Online</span>
            </div>
            <div className="w-full bg-noc-bg h-1.5 rounded-full">
              <div className="bg-noc-success h-1.5 rounded-full w-full"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-noc-muted">
          <Search size={18} />
        </div>
        <input
          type="text"
          className="w-full pl-11 pr-10 py-3 bg-noc-surface border border-noc-border rounded-lg shadow-sm text-noc-text placeholder:text-noc-muted focus:outline-none focus:border-noc-accent transition-all"
          placeholder="Search title, phenomenon, root cause..."
          value={query}
          onChange={handleSearch}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); performSearch(''); }}
            className="absolute inset-y-0 right-3 text-noc-muted hover:text-noc-error"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Quick Filter Tags */}
      <div className="flex flex-wrap gap-2">
        {FIXED_TAGS.map((t, i) => (
          <button
            key={i}
            onClick={() => { setQuery(t.name); performSearch(t.name); }}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-transform hover:scale-105 ${t.bg}`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Results List */}
      <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden min-h-[300px]">
        <div className="px-5 py-3 border-b border-noc-border bg-noc-bg flex justify-between items-center">
          <h3 className="font-bold text-noc-text flex items-center gap-2 text-sm">
            <BookOpen size={16} className="text-noc-accent" /> Solutions
          </h3>
          <span className="text-xs text-noc-muted">{total} items found</span>
        </div>
        <div className="divide-y divide-noc-border">
          {results.map((item) => (
            <div
              key={item._id}
              onClick={() => navigate(`/kb/${item._id}`)}
              className="group p-5 hover:bg-noc-bg transition-colors cursor-pointer flex gap-4"
            >
              <div className="shrink-0 pt-1">
                <div className="w-9 h-9 rounded-lg bg-noc-bg text-noc-accent flex items-center justify-center font-bold text-xs border border-noc-border">
                  {item.protocol ? item.protocol.substring(0, 3).toUpperCase() : 'KB'}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold text-noc-text group-hover:text-noc-accent transition-colors truncate">
                    {item.title}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-noc-bg text-noc-muted border border-noc-border">
                    {item.protocol || 'General'}
                  </span>
                </div>
                <p className="text-xs text-noc-muted line-clamp-2 leading-relaxed">
                  {item.phenomenon || 'No description...'}
                </p>
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {item.tags.slice(0, 4).map((tag, i) => (
                      <span key={i} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-noc-bg text-noc-muted border border-noc-border">
                        <Tag size={8} /> {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right flex flex-col justify-between items-end">
                <div className="flex items-center gap-1 text-xs text-noc-muted">
                  <Clock size={10} /> {formatDate(item.created_at)}
                </div>
                <ChevronRight size={16} className="text-noc-border group-hover:text-noc-accent transform group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          ))}
          {results.length === 0 && !loading && (
            <div className="p-16 text-center text-noc-muted">
              <div className="inline-block p-3 rounded-full bg-noc-bg mb-2">
                <Search size={28} className="opacity-20" />
              </div>
              <p className="text-sm">No solutions found</p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-noc-muted">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="p-1 rounded hover:bg-noc-surface disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || loading}
              className="p-1 rounded hover:bg-noc-surface disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
