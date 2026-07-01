import { useLocation } from 'react-router-dom';
import { useMonitor } from '@/context/MonitorContext';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/i18nContext';
import { Sun, Moon } from 'lucide-react';

// 路径 → 页面名称映射
const PAGE_TITLES: Record<string, string> = {
  '/': '总览',
  '/topology': '拓扑',
  '/elements': '网元管理',
  '/agents': 'Agent 管理',
  '/ue-info': 'UE 信息',
  '/metrics': '指标历史',
  '/alarms': '告警中心',
  '/fault-diagnosis': '故障诊断',
  '/fault-resolution': '故障处置',
  '/logs': '日志中心',
  '/backups': '配置备份',
  '/tasks': '定时任务',
  '/kb': '知识库',
  '/reports': '报表',
  '/settings': '系统设置',
  '/docs': 'API 文档',
};

export default function StatusBar() {
  const location = useLocation();
  const { wsStatus } = useMonitor();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();

  // 获取当前页面名称（支持子路径如 /kb/xxx → 知识库）
  const pageTitle = (() => {
    const path = location.pathname;
    if (PAGE_TITLES[path]) return PAGE_TITLES[path];
    // 子路径匹配：/kb/xxx → 知识库，/logs?source=xxx → 日志中心
    const base = '/' + path.split('/')[1];
    return PAGE_TITLES[base] || path;
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
