import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useMonitor } from '@/context/MonitorContext';
import { useTopologyTheme } from '@/context/ThemeContext';
import { formatBytes } from '@/utils/format';
import {
  X,
  Server,
  Database,
  Router,
  Cpu,
  HardDrive,
  AlertTriangle,
  Play,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import type { Alarm } from '@/types/monitor';

// NF health status from API
interface HealthResult {
  nf_name: string;
  status: string;
  latency: number;
  http_code: number;
}

// NF detail for drawer
interface NFDetail {
  id: string;
  name: string;
  domain: string;
  running: boolean;
  cpu: number;
  mem: number;
  pid: number;
}

/* =======================================================================
   3GPP 5GC SBA - Hierarchical Network Topology (v4)

   Features:
     - Architecture view filter: ALL / 4G EPC / 5G SA / 5G NSA
     - SVG Path vector icons: database / server / router
     - Solid node fill anti-piercing
     - 3GPP point-to-point interface labels
     - Theme-aware (dark/light via ThemeContext)
     - Right-side drawer panel on node click

   Virtual canvas: 1000 x 800
   Pure ASCII - no emoji - UTF-8 encoding - no Base64
   ======================================================================= */

// -- SVG Path Icon Dictionary (pure ASCII, no Base64) --------------------
const ICON_DATABASE =
  'path://M10,25 L10,80 Q10,95 50,95 Q90,95 90,80 L90,25'
  + ' Q90,10 50,10 Q10,10 10,25 Z'
  + ' M10,45 Q10,32 50,32 Q90,32 90,45 Q90,58 50,58 Q10,58 10,45 Z'
  + ' M10,65 Q10,52 50,52 Q90,52 90,65 Q90,78 50,78 Q10,78 10,65 Z';

const ICON_SERVER =
  'path://M15,10 L85,10 Q90,10 90,15 L90,90 Q90,95 85,95 L15,95'
  + ' Q10,95 10,90 L10,15 Q10,10 15,10 Z'
  + ' M18,38 L82,38 L82,42 L18,42 Z'
  + ' M18,60 L82,60 L82,64 L18,64 Z'
  + ' M70,20 A4,4 0 1,1 70,28 A4,4 0 1,1 70,20 Z'
  + ' M70,44 A4,4 0 1,1 70,52 A4,4 0 1,1 70,44 Z'
  + ' M70,68 A4,4 0 1,1 70,76 A4,4 0 1,1 70,68 Z';

const ICON_ROUTER =
  'path://M10,50 L55,50 L45,35 L60,50 L45,65 L55,50 Z'
  + ' M90,50 L45,50 L55,35 L40,50 L55,65 L45,50 Z';

type IconType = 'database' | 'server' | 'router';

const NF_ICON_TYPE: Record<string, IconType> = {
  hssd: 'database', udmd: 'database', udrd: 'database',
  ausfd: 'database', ocsd: 'database',
  upfd: 'router', sgwud: 'router', pgwud: 'router',
  amfd: 'server', mmed: 'server', smfd: 'server',
  nrfd: 'server', nssfd: 'server', bsfd: 'server', scpd: 'server',
  pcfd: 'server', sgwcd: 'server', pgwcd: 'server',
  pcrfd: 'server', drad: 'server',
};

function nfIconPath(id: string): string {
  switch (NF_ICON_TYPE[id] ?? 'server') {
    case 'database': return ICON_DATABASE;
    case 'router':   return ICON_ROUTER;
    case 'server':   return ICON_SERVER;
  }
}

function nfIconComponent(id: string) {
  switch (NF_ICON_TYPE[id] ?? 'server') {
    case 'database': return Database;
    case 'router':   return Router;
    case 'server':   return Server;
  }
}

// -- Architecture View Filter --------------------------------------------
type ViewMode = 'all' | '4g' | '5g-sa' | '5g-nsa';

const VIEW_4G_NODES = new Set([
  'mmed', 'sgwcd', 'sgwud', 'pgwcd', 'pgwud',
  'hssd', 'pcrfd', 'ocsd', 'drad',
]);

const VIEW_5G_SA_NODES = new Set([
  'amfd', 'smfd', 'upfd', 'udmd', 'udrd', 'ausfd',
  'pcfd', 'nssfd', 'nrfd', 'scpd', 'bsfd',
]);

const VIEW_5G_NSA_NODES = new Set([
  'amfd', 'mmed', 'smfd', 'pgwcd', 'upfd', 'pgwud',
  'hssd', 'udmd',
]);

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'all',    label: 'ALL'    },
  { key: '4g',     label: '4G EPC' },
  { key: '5g-sa',  label: '5G SA'  },
  { key: '5g-nsa', label: '5G NSA' },
];

function isNodeVisible(nfId: string, view: ViewMode): boolean {
  if (view === 'all') return true;
  if (view === '4g')     return VIEW_4G_NODES.has(nfId);
  if (view === '5g-sa')  return VIEW_5G_SA_NODES.has(nfId);
  if (view === '5g-nsa') return VIEW_5G_NSA_NODES.has(nfId);
  return true;
}

// -- Strict 3GPP Coordinate Matrix (1000 x 800 canvas) ------------------
interface NfDef {
  id:     string;
  name:   string;
  domain: string;
  x:      number;
  y:      number;
}

const NF_NODES: NfDef[] = [
  { id: 'amfd',  name: 'AMF',   domain: 'cp',     x: 100, y: 200 },
  { id: 'mmed',  name: 'MME',   domain: 'cp',     x: 100, y: 400 },
  { id: 'smfd',  name: 'SMF',   domain: 'sp',     x: 350, y: 200 },
  { id: 'sgwcd', name: 'SGW-C', domain: 'sp',     x: 350, y: 400 },
  { id: 'pgwcd', name: 'PGW-C', domain: 'sp',     x: 350, y: 560 },
  { id: 'nrfd',  name: 'NRF',   domain: 'sp',     x: 500, y: 100 },
  { id: 'nssfd', name: 'NSSF',  domain: 'sp',     x: 600, y: 100 },
  { id: 'bsfd',  name: 'BSF',   domain: 'sp',     x: 500, y: 560 },
  { id: 'scpd',  name: 'SCP',   domain: 'sp',     x: 600, y: 560 },
  { id: 'upfd',  name: 'UPF',   domain: 'up',     x: 200, y: 700 },
  { id: 'sgwud', name: 'SGW-U', domain: 'up',     x: 450, y: 700 },
  { id: 'pgwud', name: 'PGW-U', domain: 'up',     x: 700, y: 700 },
  { id: 'udmd',  name: 'UDM',   domain: 'dm',     x: 700, y: 200 },
  { id: 'udrd',  name: 'UDR',   domain: 'dm',     x: 850, y: 200 },
  { id: 'ausfd', name: 'AUSF',  domain: 'dm',     x: 700, y: 350 },
  { id: 'pcfd',  name: 'PCF',   domain: 'dm',     x: 850, y: 350 },
  { id: 'hssd',  name: 'HSS',   domain: 'dm',     x: 850, y: 500 },
  { id: 'pcrfd', name: 'PCRF',  domain: 'legacy', x: 850, y: 620 },
  { id: 'drad',  name: 'DRA',   domain: 'legacy', x: 950, y: 620 },
  { id: 'ocsd',  name: 'OCS',   domain: 'legacy', x: 950, y: 740 },
];

// -- 3GPP Interface Reference Map ----------------------------------------
const INTERFACE_MAP: Record<string, string> = {
  'amfd|smfd':   'N11',    'amfd|ausfd':  'N12',
  'amfd|pcfd':   'N8',     'amfd|udmd':   'N8',
  'smfd|upfd':   'N4',     'smfd|pcfd':   'N7',
  'smfd|udmd':   'N10',    'amfd|nrfd':   'Nnrf',
  'smfd|nrfd':   'Nnrf',   'ausfd|nrfd':  'Nnrf',
  'udmd|nrfd':   'Nnrf',   'pcfd|nrfd':   'Nnrf',
  'ausfd|udmd':  'Nausf',  'udmd|udrd':   'Nudr',
  'pcfd|udrd':   'N5',     'pcfd|udmd':   'N7',
  'amfd|mmed':   'N26',    'mmed|hssd':   'S6a',
  'mmed|sgwcd':  'S11',    'sgwcd|sgwud': 'Sxa',
  'sgwcd|pgwcd': 'S5',     'pgwcd|pgwud': 'Sxb',
  'pgwcd|pcrfd': 'Gx',     'pcrfd|ocsd':  'Sy',
  'pcrfd|drad':  'Gx',     'hssd|udrd':   'Ud',
};

function resolveInterface(source: string, target: string): string {
  const key = [source, target].sort().join('|');
  return INTERFACE_MAP[key] ?? '';
}

// -- Links ---------------------------------------------------------------
interface LinkDef {
  source: string;
  target: string;
  view?:  ViewMode[];
}

const NF_LINKS: LinkDef[] = [
  { source: 'amfd',  target: 'smfd'  },
  { source: 'amfd',  target: 'ausfd' },
  { source: 'amfd',  target: 'pcfd'  },
  { source: 'amfd',  target: 'udmd'  },
  { source: 'smfd',  target: 'upfd'  },
  { source: 'smfd',  target: 'pcfd'  },
  { source: 'smfd',  target: 'udmd'  },
  { source: 'amfd',  target: 'nrfd'  },
  { source: 'smfd',  target: 'nrfd'  },
  { source: 'ausfd', target: 'nrfd'  },
  { source: 'udmd',  target: 'nrfd'  },
  { source: 'pcfd',  target: 'nrfd'  },
  { source: 'ausfd', target: 'udmd'  },
  { source: 'udmd',  target: 'udrd'  },
  { source: 'pcfd',  target: 'udrd'  },
  { source: 'pcfd',  target: 'udmd'  },
  { source: 'amfd',  target: 'mmed', view: ['all', '5g-nsa'] },
  { source: 'mmed',  target: 'hssd'  },
  { source: 'mmed',  target: 'sgwcd' },
  { source: 'sgwcd', target: 'sgwud' },
  { source: 'sgwcd', target: 'pgwcd' },
  { source: 'pgwcd', target: 'pgwud' },
  { source: 'pgwcd', target: 'pcrfd' },
  { source: 'pcrfd', target: 'ocsd'  },
  { source: 'pcrfd', target: 'drad'  },
  { source: 'hssd',  target: 'udrd'  },
];

function isLinkVisible(link: LinkDef, view: ViewMode): boolean {
  if (!link.view) return true;
  return link.view.includes(view);
}

// ---------------------------------------------------------------------------
// Metric progress bar component
// ---------------------------------------------------------------------------

function MetricBar({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-noc-muted">{label}</span>
        <span className="text-xs text-noc-text font-mono tabular-nums">
          {unit === '%' ? value.toFixed(1) : formatBytes(value)}{unit}
        </span>
      </div>
      <div className="w-full h-1.5 bg-noc-border-30 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NF Detail Drawer
// ---------------------------------------------------------------------------

function NFDrawer({
  nf,
  alarms,
  onClose,
}: {
  nf: NFDetail | null;
  alarms: Alarm[];
  onClose: () => void;
}) {
  const isOpen = nf !== null;
  const [restarting, setRestarting] = useState(false);

  const handleRestart = useCallback(async () => {
    if (!nf || restarting) return;
    setRestarting(true);
    try {
      await fetch('/api/v1/mml/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `CTRL-NF: NF=${nf.id}, ACTION=restart;` }),
      });
    } catch {
      // ignore
    } finally {
      setTimeout(() => setRestarting(false), 2000);
    }
  }, [nf, restarting]);

  if (!nf) return null;

  const Icon = nfIconComponent(nf.id);
  const DOMAIN_LABELS: Record<string, string> = {
    cp: 'Control Plane',
    sp: 'Session & Policy',
    up: 'User Plane',
    dm: 'Data Management',
    legacy: 'Legacy EPC',
  };

  const cpuColor = nf.cpu > 80 ? '#EF4444' : nf.cpu > 60 ? '#F59E0B' : '#22C55E';
  const memMB = nf.mem / (1024 * 1024);
  const memColor = memMB > 2048 ? '#EF4444' : memMB > 1024 ? '#F59E0B' : '#22C55E';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-[400px] bg-noc-bg border-l border-noc-border shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-noc-border bg-noc-surface">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-noc-bg-50">
              <Icon className="w-5 h-5 text-noc-accent" />
            </div>
            <div>
              <div className="text-sm font-semibold text-noc-text">{nf.name}</div>
              <div className="text-[11px] text-noc-muted">{DOMAIN_LABELS[nf.domain] ?? nf.domain}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {nf.running ? (
              <span className="flex items-center gap-1 text-[10px] text-noc-success bg-noc-success-10 px-2 py-0.5 rounded border border-noc-success-20">
                <CheckCircle className="w-3 h-3" /> Running
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-noc-error bg-noc-error-10 px-2 py-0.5 rounded border border-noc-error-30">
                <AlertTriangle className="w-3 h-3" /> Stopped
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-noc-muted hover:text-noc-text hover:bg-noc-bg-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Performance metrics */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-3.5 h-3.5 text-noc-accent" />
              <span className="text-[11px] text-noc-muted uppercase tracking-wider font-semibold">Performance</span>
            </div>
            <div className="space-y-3">
              <MetricBar label="CPU Usage" value={nf.cpu} max={100} unit="%" color={cpuColor} />
              <MetricBar label="Memory RSS" value={nf.mem} max={4 * 1024 * 1024 * 1024} unit="" color={memColor} />
            </div>
            {nf.pid > 0 && (
              <div className="mt-2 text-[10px] text-noc-muted">PID: <span className="font-mono text-noc-text">{nf.pid}</span></div>
            )}
          </div>

          {/* Active alarms */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-noc-warning" />
              <span className="text-[11px] text-noc-muted uppercase tracking-wider font-semibold">
                Active Alarms ({alarms.length})
              </span>
            </div>
            {alarms.length > 0 ? (
              <div className="space-y-1.5">
                {alarms.map((alarm) => {
                  const sevColors: Record<string, string> = {
                    critical: 'text-noc-error bg-noc-error-10 border-noc-error-30',
                    major: 'text-noc-warning bg-noc-warning-10 border-noc-warning-20',
                    minor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
                    warning: 'text-noc-accent bg-noc-accent-10 border-noc-accent-30',
                  };
                  const cls = sevColors[alarm.severity] || sevColors.warning;
                  return (
                    <div
                      key={alarm._id}
                      className={`px-3 py-2 rounded-md border text-xs ${cls}`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-semibold uppercase">{alarm.severity}</span>
                        <span className="text-[10px] opacity-60">
                          {new Date(alarm.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-noc-text">{alarm.message}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-noc-muted bg-noc-surface rounded-md p-3 text-center border border-noc-border">
                No active alarms for this NF
              </div>
            )}
          </div>

          {/* NF Info */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="w-3.5 h-3.5 text-noc-accent" />
              <span className="text-[11px] text-noc-muted uppercase tracking-wider font-semibold">Details</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-noc-surface rounded-md p-2.5 border border-noc-border">
                <div className="text-[10px] text-noc-muted uppercase">NF ID</div>
                <div className="text-xs text-noc-text font-mono mt-0.5">{nf.id}</div>
              </div>
              <div className="bg-noc-surface rounded-md p-2.5 border border-noc-border">
                <div className="text-[10px] text-noc-muted uppercase">Domain</div>
                <div className="text-xs text-noc-text mt-0.5">{DOMAIN_LABELS[nf.domain] ?? nf.domain}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Quick actions */}
        <div className="px-5 py-4 border-t border-noc-border bg-noc-surface">
          <button
            onClick={handleRestart}
            disabled={restarting || !nf.running}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-noc-warning-10 text-noc-warning border border-noc-warning-20 rounded-lg text-sm font-medium hover:bg-noc-warning-20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {restarting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Restarting...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Restart NF
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

// =====================================================================
// Main Component
// =====================================================================
export default function Topology() {
  const { snapshot } = useMonitor();
  const [activeView, setActiveView] = useState<ViewMode>('all');
  const [healthMap, setHealthMap] = useState<Map<string, HealthResult>>(new Map());
  const topo = useTopologyTheme();
  const chartRef = useRef<ReactECharts>(null);

  // Drawer state
  const [selectedNF, setSelectedNF] = useState<NFDetail | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [dbAlarms, setDbAlarms] = useState<Alarm[]>([]);

  // Fetch NF interface health
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const resp = await fetch('/api/v1/interface-health');
        const data = await resp.json();
        if (data.status === 'ok' && data.health) {
          const map = new Map<string, HealthResult>();
          for (const h of data.health) {
            map.set(h.nf_name, h);
          }
          setHealthMap(map);
        }
      } catch { /* ignore */ }
    };
    fetchHealth();
    const timer = setInterval(fetchHealth, 30000);
    return () => clearInterval(timer);
  }, []);

  // Fetch active alarms for drawer
  useEffect(() => {
    const fetchAlarms = async () => {
      try {
        const resp = await fetch('/api/v1/alarms?active=true');
        const data = await resp.json();
        if (data.status === 'ok') {
          setDbAlarms(data.alarms || []);
        }
      } catch { /* ignore */ }
    };
    fetchAlarms();
    const timer = setInterval(fetchAlarms, 15000);
    return () => clearInterval(timer);
  }, []);

  const DOMAIN_COLOR: Record<string, string> = topo.domain;

  const LEGEND = [
    { label: 'Control Plane',    color: topo.domain.cp     },
    { label: 'Session & Policy', color: topo.domain.sp     },
    { label: 'User Plane',       color: topo.domain.up     },
    { label: 'Data Management',  color: topo.domain.dm     },
    { label: 'Legacy EPC',       color: topo.domain.legacy },
  ];

  const statusMap = useMemo(() => {
    const map = new Map<string, { running: boolean; cpu: number; mem: number; pid: number }>();
    if (snapshot?.processes) {
      for (const p of snapshot.processes) {
        map.set(p.name, {
          running: p.running,
          cpu: p.cpu_percent,
          mem: p.memory_rss,
          pid: p.pid,
        });
      }
    }
    return map;
  }, [snapshot]);

  // Filtered alarms for selected NF
  const nfAlarms = useMemo(() => {
    if (!selectedNF) return [];
    return dbAlarms.filter((a) => a.source === selectedNF.id && !a.cleared);
  }, [dbAlarms, selectedNF]);

  const option: EChartsOption = useMemo(() => {
    const visibleNodes = NF_NODES.filter((nf) => isNodeVisible(nf.id, activeView));

    const graphNodes = visibleNodes.map((nf) => {
      const st = statusMap.get(nf.id);
      const running = st?.running ?? false;
      const baseColor = DOMAIN_COLOR[nf.domain] ?? topo.domain.legacy;

      return {
        id: nf.id,
        name: nf.name,
        x: nf.x,
        y: nf.y,
        symbol: nfIconPath(nf.id),
        symbolSize: 48,
        fixed: true,
        itemStyle: {
          color: running ? topo.nodeBgRunning : topo.nodeBgStopped,
          borderColor: running ? baseColor : topo.stoppedBorder,
          borderWidth: running ? 2 : 2.5,
          shadowBlur: running ? 4 : 0,
          shadowColor: running ? baseColor + '40' : 'transparent',
        },
        label: {
          show: true,
          position: 'bottom' as const,
          distance: 6,
          color: topo.labelColor,
          fontSize: 11,
          fontWeight: 'bold' as const,
          textBorderColor: topo.labelBorder,
          textBorderWidth: 2,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: running ? baseColor + '60' : 'rgba(220,38,38,0.30)',
            borderWidth: 3,
          },
          label: { fontSize: 13 },
        },
        tooltip: {
          formatter: () => {
            if (!st) {
              return '<div style="font-size:12px;line-height:1.7">'
                + '<b>' + nf.name + '</b> <span style="color:' + topo.mutedText + '">(' + nf.id + ')</span><br/>'
                + '<span style="color:' + topo.mutedText + '">No process data</span></div>';
            }
            const c = st.running ? topo.statusRunning : topo.statusStopped;
            const t = st.running ? 'RUNNING' : 'STOPPED';
            return '<div style="font-size:12px;line-height:1.7">'
              + '<b>' + nf.name + '</b> <span style="color:' + topo.mutedText + '">(' + nf.id + ')</span><br/>'
              + '<span style="color:' + c + ';font-weight:bold">' + t + '</span>'
              + (st.pid ? ' . PID ' + st.pid : '') + '<br/>'
              + 'CPU: ' + st.cpu.toFixed(1) + '%<br/>'
              + 'Memory RSS: ' + formatBytes(st.mem) + '</div>';
          },
        },
      };
    });

    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleLinks = NF_LINKS.filter(
      (l) => isLinkVisible(l, activeView)
        && visibleNodeIds.has(l.source)
        && visibleNodeIds.has(l.target),
    );

    const healthColor = (status: string) => {
      switch (status) {
        case 'healthy':  return '#22C55E';
        case 'degraded': return '#F59E0B';
        case 'down':     return '#EF4444';
        default:         return '#64748B';
      }
    };

    const graphLinks = visibleLinks.map((l) => {
      const srcUp = statusMap.get(l.source)?.running ?? false;
      const tgtUp = statusMap.get(l.target)?.running ?? false;
      const active = srcUp && tgtUp;
      const ifaceLabel = resolveInterface(l.source, l.target);

      const srcHealth = healthMap.get(l.source);
      const tgtHealth = healthMap.get(l.target);
      const hasHealth = srcHealth && tgtHealth;

      let linkColor = active ? topo.linkActive : topo.linkIdle;
      let linkWidth = active ? 1.5 : 1;
      let linkOpacity = active ? 0.45 : 0.30;
      let linkType: 'dashed' | 'solid' = active ? 'dashed' : 'solid';

      if (hasHealth) {
        const worstStatus = [srcHealth!.status, tgtHealth!.status].reduce((worst, s) => {
          const order: Record<string, number> = { healthy: 0, degraded: 1, down: 2, unknown: 3 };
          return (order[s] ?? 3) > (order[worst] ?? 3) ? s : worst;
        }, 'healthy');
        linkColor = healthColor(worstStatus);
        linkWidth = worstStatus === 'down' ? 2.5 : worstStatus === 'degraded' ? 2 : 1.5;
        linkOpacity = worstStatus === 'down' ? 0.8 : 0.6;
        linkType = worstStatus === 'down' ? 'solid' : 'dashed';
      }

      return {
        source: l.source,
        target: l.target,
        label: {
          show: !!ifaceLabel,
          formatter: ifaceLabel,
          fontSize: 11,
          color: topo.linkLabelText,
          backgroundColor: topo.linkLabelBg,
          padding: [2, 4],
          borderRadius: 2,
          textBorderColor: 'transparent',
          textBorderWidth: 0,
        },
        lineStyle: {
          color: linkColor,
          width: linkWidth,
          type: linkType as 'dashed' | 'solid',
          curveness: 0.08,
          opacity: linkOpacity,
        },
        emphasis: {
          lineStyle: { width: 2.5, opacity: 1 },
          label: { show: true, fontSize: 12, color: topo.linkLabelText, fontWeight: 'bold' as const },
        },
      };
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: topo.tooltipBg,
        borderColor: topo.tooltipBorder,
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: topo.tooltipText, fontSize: 12 },
        extraCssText: 'border-radius:6px;box-shadow:0 4px 24px rgba(0,0,0,0.25);',
      },
      animationDuration: 1000,
      animationEasingUpdate: 'cubicInOut' as const,
      series: [
        {
          type: 'graph' as const,
          layout: 'none' as const,
          data: graphNodes,
          links: graphLinks,
          roam: true,
          draggable: false,
          lineStyle: { curveness: 0.08 },
          emphasis: {
            focus: 'adjacency' as const,
            blurScope: 'coordinateSystem' as const,
          },
          edgeLabel: { show: false },
          animationDuration: 1500,
          animationDelayUpdate: 0,
        },
      ],
    };
  }, [statusMap, activeView, topo, healthMap, DOMAIN_COLOR]);

  // Open drawer on node click
  const onEvents = useMemo(
    () => ({
      click: (params: Record<string, unknown>) => {
        if (params.dataType === 'node') {
          const data = params.data as { id: string; name: string };
          const nfDef = NF_NODES.find((n) => n.id === data.id);
          const st = statusMap.get(data.id);
          if (nfDef) {
            setSelectedNF({
              id: nfDef.id,
              name: nfDef.name,
              domain: nfDef.domain,
              running: st?.running ?? false,
              cpu: st?.cpu ?? 0,
              mem: st?.mem ?? 0,
              pid: st?.pid ?? 0,
            });
            setIsDrawerOpen(true);
          }
        }
      },
    }),
    [statusMap],
  );

  // Close drawer
  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedNF(null), 300);
  }, []);

  // Handle click on chart background to close drawer
  const handleChartClick = useCallback(
    (e: React.MouseEvent) => {
      // Only close if clicking on the chart background, not on a node
      if (isDrawerOpen && e.target === e.currentTarget) {
        closeDrawer();
      }
    },
    [isDrawerOpen, closeDrawer],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-noc-text">Network Topology</h2>
          <p className="text-sm text-noc-muted mt-0.5">
            5GC SBA architecture . scroll to zoom . drag to pan . click node for details
          </p>
        </div>

        <div className="flex items-center rounded-md border border-noc-border overflow-hidden shrink-0">
          {VIEW_MODES.map((mode) => {
            const isActive = activeView === mode.key;
            return (
              <button
                key={mode.key}
                onClick={() => setActiveView(mode.key)}
                className={
                  'px-3 py-1.5 text-xs font-medium transition-colors '
                  + (isActive
                    ? 'bg-noc-accent text-white'
                    : 'bg-noc-surface text-noc-muted hover:text-noc-text hover:bg-noc-accent-10')
                }
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        {LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-noc-muted">{item.label}</span>
          </div>
        ))}
        <span className="text-noc-border mx-1">|</span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 rounded opacity-50" style={{ borderTop: '1.5px dashed ' + topo.linkActive }} />
          <span className="text-noc-muted">Active link</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 rounded opacity-30" style={{ backgroundColor: topo.linkIdle }} />
          <span className="text-noc-muted">Idle link</span>
        </div>
        <span className="text-noc-border mx-1">|</span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#22C55E' }} />
          <span className="text-noc-muted">Healthy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
          <span className="text-noc-muted">Degraded</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#EF4444' }} />
          <span className="text-noc-muted">Down</span>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden" onClick={handleChartClick}>
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: 'calc(100vh - 14rem)' }}
          onEvents={onEvents}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      {/* NF Detail Drawer */}
      <NFDrawer
        nf={selectedNF}
        alarms={nfAlarms}
        onClose={closeDrawer}
      />
    </div>
  );
}
