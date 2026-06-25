import { useState, useEffect, useCallback, useMemo } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Bell,
  Radio,
  Network,
  LogOut,
  Activity,
  FileText,
  Brain,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Wifi,
  Lightbulb,
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
import AgentManagement from './pages/AgentManagement';
import FaultResolution from './pages/FaultResolution';
import LogCenter from './pages/LogCenter';

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
// Sidebar Navigation - Flat Structure (9 main items)
// ---------------------------------------------------------------------------

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  badge?: number; // optional alarm badge count
}

// Build flat navigation list using translation function
function useNavItems(): NavItem[] {
  const { t } = useI18n();
  return useMemo(() => [
    { path: '/', label: t('nav.overview'), icon: LayoutDashboard },
    { path: '/topology', label: t('nav.topology'), icon: Network },
    { path: '/elements', label: t('nav.networkElements'), icon: Server },
    { path: '/agents', label: t('nav.agentManagement'), icon: Wifi },
    { path: '/metrics', label: t('nav.metricsHistory'), icon: Activity },
    { path: '/alarms', label: t('nav.alarms'), icon: Bell, badge: 12 },
    { path: '/aiops', label: t('nav.aiops'), icon: Brain },
    { path: '/fault-resolution', label: t('nav.faultResolution'), icon: Lightbulb },
    { path: '/logs', label: t('nav.logCenter'), icon: FileText },
  ], [t]);
}

// Keep NavGroup interface for backward compatibility (unused but safe)
// Main Sidebar component - Flat 9-item navigation
function Sidebar({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const { t } = useI18n();
  const navItems = useNavItems();

  // Sidebar collapse state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Global search filter state
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Filtered items based on search
  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return navItems;
    return navItems.filter((item) => item.label.toLowerCase().includes(term));
  }, [searchTerm, navItems]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  // Check if a nav item is active
  const isActive = useCallback((itemPath: string) => {
    if (itemPath === '/') return location.pathname === '/';
    return location.pathname.startsWith(itemPath);
  }, [location.pathname]);

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

      {/* Flat navigation list - 9 main items */}
      <nav className="flex-1 py-2 overflow-y-auto" role="navigation" aria-label="Main navigation">
        <div className="space-y-0.5 px-2">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const hasBadge = typeof item.badge === 'number' && item.badge > 0;

            if (isCollapsed) {
              // Collapsed mode: icon only with tooltip
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center justify-center w-10 h-10 mx-auto rounded-md transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-r from-sky-500/15 to-transparent text-sky-400 shadow-[inset_2px_0_4px_rgba(14,165,233,0.12)]'
                      : 'text-noc-muted hover:text-noc-text hover:bg-noc-bg-50'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                  {/* Active left indicator bar */}
                  {active && (
                    <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-sky-500" />
                  )}
                  {/* Red dot for badge */}
                  {hasBadge && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                  )}
                </Link>
              );
            }

            // Expanded mode: full row with icon, label, and optional badge
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200 ${
                  active
                    ? 'bg-gradient-to-r from-sky-500/15 to-transparent text-sky-400 shadow-[inset_2px_0_4px_rgba(14,165,233,0.12)]'
                    : 'text-noc-muted hover:text-noc-text hover:bg-noc-bg-50'
                }`}
              >
                <span className="relative flex-shrink-0">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  {/* Active left indicator bar */}
                  {active && (
                    <span className="absolute -left-3 top-1 bottom-1 w-[2px] rounded-full bg-sky-500" />
                  )}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {/* Badge count */}
                {hasBadge && (
                  <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium bg-red-600 text-white rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Empty state when search yields no results */}
        {filteredItems.length === 0 && !isCollapsed && (
          <div className="px-4 py-8 text-center text-xs text-noc-muted">
            {t('sidebar.noMatch')}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className={`py-3 border-t border-noc-border flex items-center ${
        isCollapsed ? 'justify-center px-2' : 'justify-between px-5'
      }`}>
        {!isCollapsed && <span className="text-xs text-noc-muted">v1.4.1</span>}
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
          {/* Main 9 menu items */}
          <Route path="/" element={<Overview />} />
          <Route path="/topology" element={<Topology />} />
          <Route path="/elements" element={<NetworkElements />} />
          <Route path="/agents" element={<AgentManagement />} />
          <Route path="/metrics" element={<MetricsHistory />} />
          <Route path="/alarms" element={<Alarms />} />
          <Route path="/aiops" element={<AIOps />} />
          <Route path="/fault-resolution" element={<FaultResolution />} />
          <Route path="/logs" element={<LogCenter />} />

          {/* Legacy routes (keep for backward compatibility) */}
          <Route path="/subscribers" element={<Subscribers />} />
          <Route path="/mml" element={<MmlTerminal />} />
          <Route path="/audit" element={<AuditLogs />} />
          <Route path="/tasks" element={<ScheduledTasks />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/backups" element={<ConfigBackups />} />
          <Route path="/reports" element={<Reports />} />
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
