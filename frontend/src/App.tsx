import { useState, useEffect, useCallback, useMemo } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Terminal,
  Bell,
  Radio,
  Users,
  Network,
  LogOut,
  Activity,
  FileText,
  Clock,
  Shield,
  BookOpen,
  Globe,
  Database,
  BarChart3,
  Brain,
  Library,
  ChevronDown,
  Gauge,
  Wrench,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MonitorProvider } from '@/context/MonitorContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { I18nProvider, useI18n } from '@/i18nContext';
import StatusBar from '@/components/StatusBar';
import Overview from './pages/Overview';
import NetworkElements from './pages/NetworkElements';
import MmlTerminal from './pages/MmlTerminal';
import Subscribers from './pages/Subscribers';
import Alarms from './pages/Alarms';
import Topology from './pages/Topology';
import MetricsHistory from './pages/MetricsHistory';
import AuditLogs from './pages/AuditLogs';
import ScheduledTasks from './pages/ScheduledTasks';
import UserManagement from './pages/UserManagement';
import ApiDocs from './pages/ApiDocs';
import Login from './pages/Login';
import Sites from './pages/Sites';
import ConfigBackups from './pages/ConfigBackups';
import Reports from './pages/Reports';
import AIOps from './pages/AIOps';
import KnowledgeBase from './pages/KnowledgeBase';
import KnowledgeBaseDetail from './pages/KnowledgeBaseDetail';
import KnowledgeBaseEdit from './pages/KnowledgeBaseEdit';

// Auth helpers
function getAuthToken(): string | null {
  return localStorage.getItem('xcloud_token');
}

function setAuthToken(token: string) {
  localStorage.setItem('xcloud_token', token);
}

function clearAuthToken() {
  localStorage.removeItem('xcloud_token');
}

// Wrapper to add auth headers to fetch
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

// ---------------------------------------------------------------------------
// Sidebar Navigation - Grouped Structure with Collapse and Badges
// ---------------------------------------------------------------------------

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  badge?: number; // optional alarm badge count
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

// Build navigation groups using translation function
function useNavGroups(): NavGroup[] {
  const { t } = useI18n();
  return useMemo(() => [
    {
      id: 'dashboards',
      label: t('nav.dashboards'),
      icon: Gauge,
      items: [
        { path: '/', label: t('nav.overview'), icon: LayoutDashboard },
        { path: '/topology', label: t('nav.topology'), icon: Network },
      ],
    },
    {
      id: 'fault-perf',
      label: t('nav.faultPerf'),
      icon: Activity,
      items: [
        { path: '/alarms', label: t('nav.alarms'), icon: Bell, badge: 12 },
        { path: '/metrics', label: t('nav.metricsHistory'), icon: Activity },
        { path: '/aiops', label: t('nav.aiops'), icon: Brain },
        { path: '/reports', label: t('nav.reports'), icon: BarChart3 },
      ],
    },
    {
      id: 'ops-maint',
      label: t('nav.opsMaint'),
      icon: Wrench,
      items: [
        { path: '/elements', label: t('nav.networkElements'), icon: Server },
        { path: '/subscribers', label: t('nav.subscribers'), icon: Users },
        { path: '/mml', label: t('nav.mmlTerminal'), icon: Terminal },
        { path: '/backups', label: t('nav.configBackups'), icon: Database },
        { path: '/tasks', label: t('nav.cronTasks'), icon: Clock },
        { path: '/kb', label: t('nav.knowledgeBase'), icon: Library },
      ],
    },
    {
      id: 'sys-admin',
      label: t('nav.sysAdmin'),
      icon: Settings,
      items: [
        { path: '/audit', label: t('nav.auditLogs'), icon: FileText },
        { path: '/users', label: t('nav.userManagement'), icon: Shield },
        { path: '/sites', label: t('nav.siteSettings'), icon: Globe },
        { path: '/docs', label: t('nav.apiDocs'), icon: BookOpen },
      ],
    },
  ], [t]);
}

// Determine which groups should be expanded by default
function getDefaultExpanded(locationPathname: string, groups: NavGroup[]): Set<string> {
  const expanded = new Set<string>(['dashboards']);
  for (const group of groups) {
    for (const item of group.items) {
      const isMatch = item.path === '/'
        ? locationPathname === '/'
        : locationPathname.startsWith(item.path);
      if (isMatch) {
        expanded.add(group.id);
        break;
      }
    }
  }
  return expanded;
}

// Single nav item link - adapts to collapsed/expanded state
// Cyber-tech active styling: gradient glow + light-saber border + inset shadow
function NavLink({ item, isActive, collapsed }: { item: NavItem; isActive: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  const hasBadge = typeof item.badge === 'number' && item.badge > 0;

  if (collapsed) {
    // Collapsed mode: icon only with title tooltip and optional red dot
    return (
      <Link
        to={item.path}
        title={item.label}
        aria-current={isActive ? 'page' : undefined}
        className={`relative flex items-center justify-center w-10 h-10 mx-auto rounded-md transition-all duration-200 ${
          isActive
            ? 'bg-gradient-to-r from-sky-500/15 to-transparent text-sky-400 shadow-[inset_2px_0_4px_rgba(14,165,233,0.12)]'
            : 'text-noc-muted hover:text-noc-text hover:bg-noc-bg-50'
        }`}
      >
        <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
        {/* Active left indicator bar in collapsed mode */}
        {isActive && (
          <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-sky-500" />
        )}
        {/* Red dot indicator for badge in collapsed mode */}
        {hasBadge && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
        )}
      </Link>
    );
  }

  // Expanded mode: full row with icon, label, and optional numeric badge
  return (
    <Link
      to={item.path}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-3 px-4 py-2 mx-2 rounded-md text-sm transition-all duration-200 border-l-2 ${
        isActive
          ? 'bg-gradient-to-r from-sky-500/10 to-transparent text-sky-400 border-sky-500 shadow-[inset_2px_0_4px_rgba(14,165,233,0.1)]'
          : 'text-noc-muted hover:text-noc-text hover:bg-noc-bg-50 border-transparent'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="truncate flex-1">{item.label}</span>
      {/* Numeric badge capsule */}
      {hasBadge && (
        <span className="px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none min-w-[18px] text-center">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// Collapsible nav group - adapts to collapsed/expanded sidebar
// filteredItems: items that match the current search (subset of group.items)
function NavGroupSection({
  group,
  filteredItems,
  isExpanded,
  onToggle,
  activePath,
  collapsed,
}: {
  group: NavGroup;
  filteredItems: NavItem[];
  isExpanded: boolean;
  onToggle: () => void;
  activePath: string;
  collapsed: boolean;
}) {
  const GroupIcon = group.icon;
  const hasActive = filteredItems.some((item) =>
    item.path === '/' ? activePath === '/' : activePath.startsWith(item.path)
  );

  if (collapsed) {
    // Collapsed mode: show group icon centered (non-clickable separator)
    // Each item is rendered directly as an icon button
    return (
      <div className="mb-2">
        <div className="flex justify-center py-1.5">
          <GroupIcon
            className={`w-4 h-4 ${hasActive ? 'text-sky-400' : 'text-noc-muted'}`}
            aria-hidden="true"
          />
        </div>
        <div className="space-y-1">
          {filteredItems.map((item) => {
            const isActive = item.path === '/'
              ? activePath === '/'
              : activePath.startsWith(item.path);
            return <NavLink key={item.path} item={item} isActive={isActive} collapsed />;
          })}
        </div>
      </div>
    );
  }

  // Expanded mode: full group with header and collapsible content
  return (
    <div className="mb-1">
      {/* Group header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-2 mx-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
          hasActive
            ? 'text-sky-400'
            : 'text-noc-muted hover:text-noc-text'
        }`}
        aria-expanded={isExpanded}
      >
        <span className="flex items-center gap-2">
          <GroupIcon className="w-3.5 h-3.5" aria-hidden="true" />
          {group.label}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-300 ease-in-out ${
            isExpanded ? 'rotate-0' : '-rotate-90'
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Smooth collapsible content using grid trick */}
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="py-1 space-y-0.5">
            {filteredItems.map((item) => {
              const isActive = item.path === '/'
                ? activePath === '/'
                : activePath.startsWith(item.path);
              return <NavLink key={item.path} item={item} isActive={isActive} collapsed={false} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Sidebar component with collapse, search filter, and alarm badges
function Sidebar({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const { t } = useI18n();
  const navGroups = useNavGroups();

  // Sidebar collapse state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Global search filter state
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Initialize expanded groups: dashboards + active route group
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() =>
    getDefaultExpanded(location.pathname, navGroups)
  );

  // Auto-expand group when route changes
  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      for (const group of navGroups) {
        for (const item of group.items) {
          const isMatch = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);
          if (isMatch) {
            next.add(group.id);
            break;
          }
        }
      }
      return next;
    });
  }, [location.pathname]);

  // Filtered groups: each group gets its matching items; empty groups are excluded
  // Groups with matches are forced expanded regardless of user toggle state
  const { filteredGroups, forcedExpanded } = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return { filteredGroups: navGroups.map((g) => ({ group: g, items: g.items })), forcedExpanded: new Set<string>() };
    }

    const forced = new Set<string>();
    const result: { group: NavGroup; items: NavItem[] }[] = [];

    for (const group of navGroups) {
      const matched = group.items.filter((item) =>
        item.label.toLowerCase().includes(term)
      );
      if (matched.length > 0) {
        result.push({ group, items: matched });
        forced.add(group.id);
      }
    }

    return { filteredGroups: result, forcedExpanded: forced };
  }, [searchTerm, navGroups]);

  // Effective expanded state: merge user toggled + forced by search
  const effectiveExpanded = useMemo(() => {
    const merged = new Set(expandedGroups);
    for (const id of forcedExpanded) {
      merged.add(id);
    }
    return merged;
  }, [expandedGroups, forcedExpanded]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  return (
    <aside
      className={`flex-shrink-0 bg-noc-surface border-r border-noc-border flex flex-col transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-noc-border">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <Radio className="w-5 h-5 text-noc-accent shrink-0" />
          {!isCollapsed && (
            <span className="text-sm font-semibold text-noc-accent tracking-wide whitespace-nowrap">
              xCloud-CNMS
            </span>
          )}
        </div>
        <button
          onClick={toggleCollapsed}
          className="p-1.5 rounded-md text-noc-muted hover:text-noc-text hover:bg-noc-bg-50 transition-colors"
          aria-label={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          title={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Global quick filter - hidden when sidebar is collapsed */}
      {!isCollapsed && (
        <div className="px-3 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-noc-muted pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder={t('sidebar.quickFilter')}
              className="w-full pl-8 pr-3 py-1.5 bg-noc-bg border border-noc-border rounded-md text-xs text-noc-text placeholder:text-noc-muted focus:outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Navigation groups */}
      <nav className="flex-1 py-2 overflow-y-auto" role="navigation" aria-label="Main navigation">
        {filteredGroups.map(({ group, items }) => (
          <NavGroupSection
            key={group.id}
            group={group}
            filteredItems={items}
            isExpanded={effectiveExpanded.has(group.id)}
            onToggle={() => toggleGroup(group.id)}
            activePath={location.pathname}
            collapsed={isCollapsed}
          />
        ))}
        {/* Empty state when search yields no results */}
        {filteredGroups.length === 0 && !isCollapsed && (
          <div className="px-4 py-8 text-center text-xs text-noc-muted">
            {t('sidebar.noMatch')}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className={`py-3 border-t border-noc-border flex items-center ${
        isCollapsed ? 'justify-center px-2' : 'justify-between px-5'
      }`}>
        {!isCollapsed && <span className="text-xs text-noc-muted">v1.4.0</span>}
        <button
          onClick={onLogout}
          className="p-1 text-noc-muted hover:text-noc-error transition-colors"
          aria-label={t('sidebar.signOut')}
          title={t('sidebar.signOut')}
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// 应用主布局
// ---------------------------------------------------------------------------

function AppLayout({ onLogout }: { onLogout: () => void }) {
  return (
    <ThemeProvider>
    <MonitorProvider>
      <div className="flex h-screen bg-noc-bg">
        <Sidebar onLogout={onLogout} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <StatusBar />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </MonitorProvider>
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// App 根组件
// ---------------------------------------------------------------------------

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getAuthToken());
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);

  // Check if auth is enabled on the server
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(() => {
        // If we can reach health without auth, auth might be disabled
        // Try a protected endpoint to check
        authFetch('/api/v1/alarms?active=true')
          .then((r) => {
            if (r.status === 401) {
              setAuthEnabled(true);
            } else {
              setAuthEnabled(false);
              setIsAuthenticated(true);
            }
          })
          .catch(() => setAuthEnabled(false));
      })
      .catch(() => setAuthEnabled(false));
  }, []);

  const handleLogin = useCallback((token: string) => {
    setAuthToken(token);
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    clearAuthToken();
    setIsAuthenticated(false);
  }, []);

  // Loading state
  if (authEnabled === null) {
    return (
      <div className="min-h-screen bg-noc-bg flex items-center justify-center">
        <div className="text-noc-muted text-sm">Loading...</div>
      </div>
    );
  }

  // Show login page if auth is enabled and not authenticated
  if (authEnabled && !isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <I18nProvider>
    <HashRouter>
      <Routes>
        <Route element={<AppLayout onLogout={handleLogout} />}>
          <Route path="/" element={<Overview />} />
          <Route path="/elements" element={<NetworkElements />} />
          <Route path="/topology" element={<Topology />} />
          <Route path="/subscribers" element={<Subscribers />} />
          <Route path="/mml" element={<MmlTerminal />} />
          <Route path="/alarms" element={<Alarms />} />
          <Route path="/metrics" element={<MetricsHistory />} />
          <Route path="/audit" element={<AuditLogs />} />
          <Route path="/tasks" element={<ScheduledTasks />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/backups" element={<ConfigBackups />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/aiops" element={<AIOps />} />
          <Route path="/kb" element={<KnowledgeBase />} />
          <Route path="/kb/:id" element={<KnowledgeBaseDetail />} />
          <Route path="/kb/edit" element={<KnowledgeBaseEdit />} />
          <Route path="/kb/edit/:id" element={<KnowledgeBaseEdit />} />
          <Route path="/docs" element={<ApiDocs />} />
        </Route>
      </Routes>
    </HashRouter>
    </I18nProvider>
  );
}
