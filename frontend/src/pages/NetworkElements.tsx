import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMonitor } from '@/context/MonitorContext';
import {
  Search,
  FileText,
  X,
  RefreshCw,
  Radio,
  Pause,
  Download,
  Play,
  ChevronRight,
  ChevronDown,
  Building2,
  Server,
  HardDrive,
  RotateCw,
} from 'lucide-react';
import type { LogLine, ProcessStatus, Site } from '@/types/monitor';

// ---------------------------------------------------------------------------
// Virtual Location Tree Types
// ---------------------------------------------------------------------------

interface TreeNode {
  id: string;
  label: string;
  icon: 'region' | 'dc' | 'node';
  nfIds: string[];          // NF process names mapped to this node
  children?: TreeNode[];
}

// Static location tree definition (fallback when Sites API returns empty)
const FALLBACK_LOCATION_TREE: TreeNode[] = [
  {
    id: 'south-china',
    label: 'South China Region',
    icon: 'region',
    nfIds: [],
    children: [
      {
        id: 'jiangmen-dc',
        label: 'Jiangmen Core DC',
        icon: 'dc',
        nfIds: ['amfd', 'smfd', 'mmed', 'hssd', 'udmd', 'udrd', 'ausfd', 'pcfd', 'pcrfd', 'nrfd', 'nssfd', 'scpd', 'bsfd', 'drad', 'ocsd'],
        children: [
          { id: 'jiangmen-cp', label: 'Control Plane', icon: 'node', nfIds: ['amfd', 'smfd', 'mmed', 'nrfd', 'nssfd', 'scpd'] },
          { id: 'jiangmen-dm', label: 'Data Management', icon: 'node', nfIds: ['hssd', 'udmd', 'udrd', 'ausfd'] },
          { id: 'jiangmen-sp', label: 'Session & Policy', icon: 'node', nfIds: ['pcfd', 'pcrfd', 'bsfd', 'drad', 'ocsd'] },
        ],
      },
      {
        id: 'maoming-edge',
        label: 'Maoming Edge Node',
        icon: 'dc',
        nfIds: ['upfd', 'sgwud', 'pgwud', 'sgwcd', 'pgwcd'],
        children: [
          { id: 'maoming-5g-up', label: '5G User Plane', icon: 'node', nfIds: ['upfd'] },
          { id: 'maoming-epc-up', label: 'EPC User Plane', icon: 'node', nfIds: ['sgwud', 'pgwud', 'sgwcd', 'pgwcd'] },
        ],
      },
    ],
  },
];

// Build tree from Sites API data
function buildTreeFromSites(sites: Site[]): TreeNode[] {
  if (!sites || sites.length === 0) return FALLBACK_LOCATION_TREE;

  const siteMap = new Map<string, Site>();
  sites.forEach(s => siteMap.set(s._id, s));

  // Find root nodes (no parent_id)
  const roots = sites.filter(s => !s.parent_id);

  // If no roots found, use fallback
  if (roots.length === 0) return FALLBACK_LOCATION_TREE;

  function buildNode(site: Site): TreeNode {
    const children = sites.filter(s => s.parent_id === site._id);
    const icon: TreeNode['icon'] = site.type === 'region' ? 'region' : site.type === 'dc' ? 'dc' : 'node';
    return {
      id: site._id,
      label: site.name,
      icon,
      nfIds: site.nf_ids || [],
      children: children.length > 0 ? children.map(buildNode) : undefined,
    };
  }

  return roots.map(buildNode);
}

// ---------------------------------------------------------------------------
// Tree traversal helpers
// ---------------------------------------------------------------------------

function collectAllNfIds(node: TreeNode): string[] {
  const ids = new Set<string>(node.nfIds);
  if (node.children) {
    for (const child of node.children) {
      for (const id of collectAllNfIds(child)) {
        ids.add(id);
      }
    }
  }
  return Array.from(ids);
}

function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recursive Tree Component
// ---------------------------------------------------------------------------

function TreeView({
  nodes,
  selectedId,
  onSelect,
  processMap,
  depth = 0,
}: {
  nodes: TreeNode[];
  selectedId: string;
  onSelect: (id: string) => void;
  processMap: Map<string, ProcessStatus>;
  depth?: number;
}) {
  return (
    <div>
      {nodes.map((node) => (
        <TreeNodeItem
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
          processMap={processMap}
          depth={depth}
        />
      ))}
    </div>
  );
}

function TreeNodeItem({
  node,
  selectedId,
  onSelect,
  processMap,
  depth,
}: {
  node: TreeNode;
  selectedId: string;
  onSelect: (id: string) => void;
  processMap: Map<string, ProcessStatus>;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  // Count running NFs under this node
  const allNfIds = useMemo(() => collectAllNfIds(node), [node]);
  const runningCount = useMemo(
    () => allNfIds.filter((id) => processMap.get(id)?.running).length,
    [allNfIds, processMap],
  );
  const totalCount = allNfIds.length;

  const handleClick = useCallback(() => {
    onSelect(node.id);
    if (hasChildren) {
      setExpanded((prev) => !prev);
    }
  }, [node.id, hasChildren, onSelect]);

  const IconComponent = node.icon === 'region' ? Building2 : node.icon === 'dc' ? HardDrive : Server;

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors rounded-md mx-1 ${
          isSelected
            ? 'bg-noc-accent-10 text-noc-accent border-l-2 border-l-noc-accent'
            : 'text-noc-muted hover:text-noc-text hover:bg-noc-bg-50 border-l-2 border-l-transparent'
        }`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-noc-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-noc-muted" />
          )
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}

        {/* Icon */}
        <IconComponent className="w-4 h-4 shrink-0" />

        {/* Label */}
        <span className="flex-1 truncate">{node.label}</span>

        {/* Running badge */}
        {totalCount > 0 && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
              runningCount === totalCount
                ? 'bg-noc-success-10 text-noc-success'
                : runningCount > 0
                ? 'bg-noc-warning-10 text-noc-warning'
                : 'bg-noc-error-10 text-noc-error'
            }`}
          >
            {runningCount}/{totalCount}
          </span>
        )}
      </button>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="border-l border-noc-border ml-4">
          <TreeView
            nodes={node.children!}
            selectedId={selectedId}
            onSelect={onSelect}
            processMap={processMap}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main NetworkElements Component
// ---------------------------------------------------------------------------

export default function NetworkElements() {
  const { snapshot } = useMonitor();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get('filter') || '');
  const [locationTree, setLocationTree] = useState<TreeNode[]>(FALLBACK_LOCATION_TREE);
  const [selectedTreeId, setSelectedTreeId] = useState<string>('south-china');
  const [selectedNf, setSelectedNf] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logKeyword, setLogKeyword] = useState('');
  const [logLevel, setLogLevel] = useState('');
  const [followMode, setFollowMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const selectedNfRef = useRef<string | null>(null);

  const processes = snapshot?.processes ?? [];

  // Fetch sites and build dynamic location tree
  useEffect(() => {
    fetch('/api/v1/sites')
      .then(r => r.json())
      .then(data => {
        if (data.sites && data.sites.length > 0) {
          const tree = buildTreeFromSites(data.sites);
          setLocationTree(tree);
        }
      })
      .catch(() => {/* keep fallback */});
  }, []);

  // Process map for quick lookup
  const processMap = useMemo(() => {
    const map = new Map<string, ProcessStatus>();
    for (const p of processes) {
      map.set(p.name, p);
    }
    return map;
  }, [processes]);

  // Get NF IDs for selected tree node
  const selectedNode = useMemo(() => findNodeById(locationTree, selectedTreeId), [locationTree, selectedTreeId]);
  const selectedNfIds = useMemo(() => {
    if (!selectedNode) return [];
    return collectAllNfIds(selectedNode);
  }, [selectedNode]);

  // Filtered processes for right table
  const tableProcesses = useMemo(() => {
    let result = processes.filter((p) => selectedNfIds.includes(p.name));
    if (filter.trim()) {
      const keyword = filter.trim().toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(keyword));
    }
    return result;
  }, [processes, selectedNfIds, filter]);

  // Stats for selected node
  const nodeStats = useMemo(() => {
    const total = tableProcesses.length;
    const running = tableProcesses.filter((p) => p.running).length;
    return { total, running, stopped: total - running };
  }, [tableProcesses]);

  // Get location label for an NF
  const getLocationLabel = useCallback((nfName: string): string => {
    for (const dc of locationTree[0]?.children || []) {
      if (dc.nfIds.includes(nfName)) return dc.label;
    }
    return 'Unknown';
  }, [locationTree]);

  // Keep selectedNfRef synced
  useEffect(() => {
    selectedNfRef.current = selectedNf;
  }, [selectedNf]);

  // --- Log viewer ---

  const fetchLogs = useCallback(async (name: string) => {
    setLogLoading(true);
    try {
      const params = new URLSearchParams({ name, tail: '200' });
      if (logKeyword) params.set('keyword', logKeyword);
      if (logLevel) params.set('level', logLevel);
      const resp = await fetch(`/api/v1/nf/logs?${params}`);
      const data = await resp.json();
      if (data.status === 'ok') {
        setLogs(data.logs || []);
      } else {
        setLogs([]);
      }
    } catch {
      setLogs([]);
    } finally {
      setLogLoading(false);
    }
  }, [logKeyword, logLevel]);

  const startFollow = useCallback(async (name: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const params = new URLSearchParams({ name, tail: '100' });
      if (logKeyword) params.set('keyword', logKeyword);
      if (logLevel) params.set('level', logLevel);
      const resp = await fetch(`/api/v1/nf/logs?${params}`);
      const data = await resp.json();
      if (data.status === 'ok' && data.logs?.length) {
        setLogs(data.logs);
      }
    } catch { /* ignore */ }

    const token = localStorage.getItem('xcloud_token') || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = token
      ? `${protocol}//${window.location.host}/api/v1/nf/logs/ws?token=${encodeURIComponent(token)}`
      : `${protocol}//${window.location.host}/api/v1/nf/logs/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ name, level: logLevel, keyword: logKeyword, tail: 0 }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'meta' || msg.type === 'stats') return;
        if (msg.error) return;
        setLogs((prev) => {
          const next = [...prev, {
            timestamp: msg.timestamp || '',
            level: msg.level || 'INFO',
            message: msg.message || msg.raw || '',
          }];
          if (next.length > 2000) next.splice(0, next.length - 2000);
          return next;
        });
      } catch { /* ignore */ }
    };

    ws.onerror = () => {};
    ws.onclose = () => { wsRef.current = null; };
    wsRef.current = ws;
  }, [logLevel, logKeyword]);

  const stopFollow = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendFilterUpdate = useCallback((level: string, keyword: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'filter', level, keyword }));
    }
  }, []);

  useEffect(() => {
    if (followMode && !paused && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, followMode, paused]);

  const handleScroll = useCallback(() => {
    if (!logContainerRef.current || !followMode) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    if (atBottom && paused) setPaused(false);
    else if (!atBottom && !paused) setPaused(true);
  }, [followMode, paused]);

  useEffect(() => {
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, []);

  const openLogs = (name: string) => {
    stopFollow();
    setSelectedNf(name);
    setFollowMode(false);
    setPaused(false);
    fetchLogs(name);
  };

  const toggleFollow = () => {
    if (!selectedNf) return;
    if (followMode) {
      stopFollow();
      setFollowMode(false);
      setPaused(false);
    } else {
      setLogs([]);
      startFollow(selectedNf);
      setFollowMode(true);
      setPaused(false);
    }
  };

  const togglePause = () => setPaused((prev) => !prev);

  const closeLogs = () => {
    stopFollow();
    setSelectedNf(null);
    setLogs([]);
    setLogKeyword('');
    setLogLevel('');
    setFollowMode(false);
    setPaused(false);
  };

  const handleRefresh = () => {
    if (!selectedNf) return;
    if (followMode) {
      stopFollow();
      setLogs([]);
      startFollow(selectedNf);
    } else {
      fetchLogs(selectedNf);
    }
  };

  const exportLogs = () => {
    if (logs.length === 0) return;
    const content = logs.map((l) => `${l.timestamp} [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedNf || 'logs'}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const levelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'text-noc-error';
      case 'WARN':
      case 'WARNING': return 'text-noc-warning';
      case 'DEBUG': return 'text-noc-muted';
      default: return 'text-noc-text';
    }
  };

  // Restart all NFs in selected node
  const handleRestartAll = useCallback(async () => {
    for (const nfId of selectedNfIds) {
      const p = processMap.get(nfId);
      if (p?.running) {
        try {
          await fetch('/api/v1/mml/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: `CTRL-NF: NF=${nfId}, ACTION=restart;` }),
          });
        } catch { /* ignore */ }
      }
    }
  }, [selectedNfIds, processMap]);

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Network Elements</h2>
          <p className="text-sm text-noc-muted mt-0.5">
            Location-based NF inventory and management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name..."
              className="pl-9 pr-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text placeholder:text-noc-muted focus:outline-none focus:border-noc-accent w-52"
            />
          </div>
        </div>
      </div>

      {/* Main content: Left tree + Right table */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left tree panel */}
        <div className="w-[280px] flex-shrink-0 bg-noc-surface border border-noc-border rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-noc-border flex items-center gap-2">
            <Building2 className="w-4 h-4 text-noc-accent" />
            <span className="text-xs text-noc-text uppercase tracking-wider font-semibold">Location Tree</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <TreeView
              nodes={locationTree}
              selectedId={selectedTreeId}
              onSelect={setSelectedTreeId}
              processMap={processMap}
            />
          </div>
        </div>

        {/* Right content area */}
        <div className="flex-1 flex flex-col min-w-0 gap-4">
          {/* Stats bar */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-noc-muted">
              Node: <span className="text-noc-text font-medium">{selectedNode?.label ?? 'All'}</span>
            </span>
            <span className="text-noc-border">|</span>
            <span className="text-noc-muted">
              Total: <span className="text-noc-text font-medium">{nodeStats.total}</span>
            </span>
            <span className="text-noc-muted">
              Running: <span className="text-noc-success font-medium">{nodeStats.running}</span>
            </span>
            <span className="text-noc-muted">
              Stopped: <span className="text-noc-error font-medium">{nodeStats.stopped}</span>
            </span>
            <div className="flex-1" />
            <button
              onClick={handleRestartAll}
              disabled={nodeStats.running === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-noc-warning-10 text-noc-warning border border-noc-warning-20 rounded-lg text-xs font-medium hover:bg-noc-warning-20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCw className="w-3 h-3" />
              Restart All in Node
            </button>
          </div>

          {/* Inventory table */}
          <div className="flex-1 bg-noc-surface border border-noc-border rounded-xl overflow-hidden flex flex-col">
            <div className="overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-noc-bg z-10">
                  <tr className="border-b border-noc-border">
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider">NF Name</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-24">Status</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-44">Host Location</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-20">PID</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-24">CPU</th>
                    <th className="text-left px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-28">Memory</th>
                    <th className="text-right px-4 py-3 text-noc-muted font-medium text-[11px] uppercase tracking-wider w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tableProcesses.map((p, idx) => {
                    const cpuColor = p.cpu_percent > 80 ? 'text-noc-error' : p.cpu_percent > 60 ? 'text-noc-warning' : 'text-noc-success';
                    const memMB = p.memory_rss / (1024 * 1024);
                    const memColor = memMB > 2048 ? 'text-noc-error' : memMB > 1024 ? 'text-noc-warning' : 'text-noc-success';
                    return (
                      <tr
                        key={p.name}
                        className={`border-b border-noc-border transition-colors ${
                          idx % 2 === 0 ? 'bg-transparent' : 'bg-noc-bg-50'
                        } hover:bg-noc-bg-50`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Server className="w-3.5 h-3.5 text-noc-muted" />
                            <span className="font-mono text-noc-text text-xs">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {p.running ? (
                            <span className="flex items-center gap-1 text-[10px] text-noc-success bg-noc-success-10 px-1.5 py-0.5 rounded w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-noc-success" />
                              Running
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-noc-error bg-noc-error-10 px-1.5 py-0.5 rounded w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-noc-error" />
                              Stopped
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-noc-muted">{getLocationLabel(p.name)}</td>
                        <td className="px-4 py-2.5 text-xs text-noc-muted font-mono">{p.running ? p.pid : '-'}</td>
                        <td className={`px-4 py-2.5 text-xs font-mono tabular-nums ${cpuColor}`}>
                          {p.running ? `${p.cpu_percent.toFixed(1)}%` : '-'}
                        </td>
                        <td className={`px-4 py-2.5 text-xs font-mono tabular-nums ${memColor}`}>
                          {p.running ? `${memMB.toFixed(0)} MB` : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => openLogs(p.name)}
                            className="p-1 text-noc-muted hover:text-noc-accent transition-colors"
                            title="View logs"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {tableProcesses.length === 0 && (
                <div className="p-8 text-center text-noc-muted text-sm">
                  No network elements in this location
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Log Viewer Panel */}
      {selectedNf && (
        <div className="mt-4 bg-noc-surface border border-noc-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-noc-border bg-noc-bg">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-noc-accent" />
              <span className="text-sm font-medium text-noc-text">Logs: {selectedNf}</span>
              {followMode && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-noc-success-10 text-noc-success text-xs">
                  <Radio className="w-3 h-3 animate-pulse" />
                  LIVE
                </span>
              )}
              {logLoading && !followMode && <span className="text-xs text-noc-muted animate-pulse">Loading...</span>}
              <span className="text-xs text-noc-muted">{logs.length} lines</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={logKeyword}
                onChange={(e) => {
                  const val = e.target.value;
                  setLogKeyword(val);
                  if (followMode) sendFilterUpdate(logLevel, val);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (followMode) { stopFollow(); setLogs([]); startFollow(selectedNf); }
                    else fetchLogs(selectedNf);
                  }
                }}
                placeholder="Search keyword..."
                className="px-2 py-1 bg-noc-terminal border border-noc-border rounded text-xs text-noc-text placeholder:text-noc-muted focus:outline-none focus:border-noc-accent w-36"
              />
              <select
                value={logLevel}
                onChange={(e) => {
                  const val = e.target.value;
                  setLogLevel(val);
                  if (followMode) sendFilterUpdate(val, logKeyword);
                }}
                className="px-2 py-1 bg-noc-terminal border border-noc-border rounded text-xs text-noc-text focus:outline-none focus:border-noc-accent"
              >
                <option value="">All Levels</option>
                <option value="ERROR">ERROR</option>
                <option value="WARN">WARN</option>
                <option value="INFO">INFO</option>
                <option value="DEBUG">DEBUG</option>
              </select>
              <button
                onClick={toggleFollow}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  followMode
                    ? 'bg-noc-success-10 text-noc-success border border-noc-success-20'
                    : 'bg-noc-bg-50 border border-noc-border text-noc-muted hover:text-noc-text'
                }`}
              >
                {followMode ? <><Pause className="w-3 h-3" />Stop</> : <><Radio className="w-3 h-3" />Follow</>}
              </button>
              {followMode && (
                <button
                  onClick={togglePause}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    paused
                      ? 'bg-noc-warning-10 text-noc-warning border border-noc-warning-20'
                      : 'bg-noc-bg-50 border border-noc-border text-noc-muted hover:text-noc-text'
                  }`}
                >
                  {paused ? <><Play className="w-3 h-3" />Resume</> : <><Pause className="w-3 h-3" />Pause</>}
                </button>
              )}
              <button onClick={exportLogs} disabled={logs.length === 0} className="p-1 text-noc-muted hover:text-noc-accent transition-colors disabled:opacity-50">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleRefresh} disabled={logLoading} className="p-1 text-noc-muted hover:text-noc-accent transition-colors disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${logLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={closeLogs} className="p-1 text-noc-muted hover:text-noc-error transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Log output */}
          <div
            ref={logContainerRef}
            onScroll={handleScroll}
            className="max-h-64 overflow-y-auto p-4 font-mono text-xs bg-noc-terminal"
          >
            {logs.length === 0 ? (
              <div className="text-noc-muted text-center py-4">
                {followMode ? 'Waiting for new log entries...' : logLoading ? 'Loading logs...' : 'No logs found'}
              </div>
            ) : (
              logs.map((line, i) => (
                <div key={i} className="flex gap-2 py-0.5">
                  <span className="text-noc-muted flex-shrink-0 w-36">{line.timestamp}</span>
                  <span className={`flex-shrink-0 w-14 ${levelColor(line.level)}`}>{line.level}</span>
                  <span className="text-noc-text break-all">{line.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
