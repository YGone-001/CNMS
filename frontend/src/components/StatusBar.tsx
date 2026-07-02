import { useLocation } from 'react-router-dom';
import { useMonitor } from '@/context/MonitorContext';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/i18nContext';
import { Sun, Moon } from 'lucide-react';

// 路径 → i18n key 映射
const PAGE_I18N: Record<string, string> = {
  '/': 'nav.overview',
  '/topology': 'nav.topology',
  '/elements': 'nav.networkElements',
  '/agents': 'nav.agentManagement',
  '/ue-info': 'nav.ueInfo',
  '/metrics': 'nav.metricsHistory',
  '/alarms': 'nav.alarms',
  '/fault-diagnosis': 'nav.faultDiagnosis',
  '/capture': 'nav.packetCapture',
  '/fault-resolution': 'nav.faultResolution',
  '/logs': 'nav.logCenter',
  '/backups': 'nav.configBackups',
  '/tasks': 'nav.scheduledTasks',
  '/kb': 'nav.knowledgeBase',
  '/reports': 'nav.reports',
  '/settings': 'nav.systemSettings',
  '/docs': 'nav.apiDocs',
};

export default function StatusBar() {
  const location = useLocation();
  const { wsStatus } = useMonitor();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();

  // 获取当前页面名称（支持子路径如 /kb/xxx → 知识库）
  const pageTitle = (() => {
    const path = location.pathname;
    if (PAGE_I18N[path]) return t(PAGE_I18N[path]);
    const base = '/' + path.split('/')[1];
    return PAGE_I18N[base] ? t(PAGE_I18N[base]) : path;
  })();

  // Status indicator style mapping
  const statusConfig = {
    CONNECTED: {
      dot: 'bg-noc-success',
      text: 'text-noc-success',
      bg: 'bg-noc-success-10',
      label: t('statusbar.connected'),
    },
    DISCONNECTED: {
      dot: 'bg-noc-error',
      text: 'text-noc-error',
      bg: 'bg-noc-error-10',
      label: t('statusbar.disconnected'),
    },
    CONNECTING: {
      dot: 'bg-noc-warning animate-pulse',
      text: 'text-noc-warning',
      bg: 'bg-noc-warning-10',
      label: t('statusbar.connecting'),
    },
  };

  const cfg = statusConfig[wsStatus];

  return (
    <header className="h-12 flex-shrink-0 bg-noc-surface border-b border-noc-border flex items-center justify-between px-6">
      {/* Left: title */}
      <div className="text-sm text-noc-muted font-medium">{pageTitle}</div>

      {/* Right: controls */}
      <div className="flex items-center gap-3">
        {/* WebSocket status */}
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${cfg.bg}`}>
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
        </div>

        {/* Language toggle: EN / Chinese */}
        <div className="flex items-center gap-1 text-xs select-none">
          <button
            onClick={() => setLanguage('en')}
            className={`px-1.5 py-0.5 rounded transition-colors duration-200 ${
              language === 'en'
                ? 'text-noc-accent font-semibold'
                : 'text-noc-muted hover:text-noc-text'
            }`}
          >
            EN
          </button>
          <span className="text-noc-border">/</span>
          <button
            onClick={() => setLanguage('zh')}
            className={`px-1.5 py-0.5 rounded transition-colors duration-200 ${
              language === 'zh'
                ? 'text-noc-accent font-semibold'
                : 'text-noc-muted hover:text-noc-text'
            }`}
          >
            ZH
          </button>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md text-noc-muted hover:text-noc-accent hover:bg-noc-accent-10 transition-colors"
          aria-label={theme === 'dark' ? t('statusbar.lightMode') : t('statusbar.darkMode')}
          title={theme === 'dark' ? t('statusbar.lightMode') : t('statusbar.darkMode')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
