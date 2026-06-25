import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Search,
  Download,
  RefreshCw,
  Clock,
  User,
  Activity,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Terminal,
  Database,
  Server,
  Network,
} from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  category: 'system' | 'security' | 'operation' | 'audit';
  user?: string;
  action: string;
  detail: string;
  ip?: string;
  status?: 'success' | 'failure';
}

export default function LogCenter() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('today');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Mock data - replace with actual API call
      const mockLogs: LogEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15 10:30:45',
          level: 'info',
          source: 'AMF',
          category: 'system',
          action: '进程启动',
          detail: 'AMF 进程启动成功，PID: 12345',
          status: 'success',
        },
        {
          id: '2',
          timestamp: '2024-01-15 10:28:30',
          level: 'warn',
          source: 'SMF',
          category: 'operation',
          user: 'admin',
          action: '配置变更',
          detail: '修改 SMF 会话超时时间从 30s 到 60s',
          ip: '192.168.1.100',
          status: 'success',
        },
        {
          id: '3',
          timestamp: '2024-01-15 10:25:15',
          level: 'error',
          source: 'UPF',
          category: 'system',
          action: '进程异常',
          detail: 'UPF 进程异常退出，退出码: 137 (OOM Killed)',
          status: 'failure',
        },
        {
          id: '4',
          timestamp: '2024-01-15 10:20:00',
          level: 'info',
          source: 'WebUI',
          category: 'audit',
          user: 'operator1',
          action: '用户登录',
          detail: '用户 operator1 登录系统',
          ip: '192.168.1.101',
          status: 'success',
        },
        {
          id: '5',
          timestamp: '2024-01-15 10:15:30',
          level: 'info',
          source: 'NRF',
          category: 'security',
          action: '服务注册',
          detail: 'NF 实例注册成功，InstanceId: nf-001',
          status: 'success',
        },
        {
          id: '6',
          timestamp: '2024-01-15 10:10:45',
          level: 'debug',
          source: 'MML',
          category: 'operation',
          user: 'admin',
          action: 'MML 命令执行',
          detail: '执行命令: LST-SUB: IMSI=460110000000001;',
          ip: '192.168.1.100',
          status: 'success',
        },
        {
          id: '7',
          timestamp: '2024-01-15 10:05:20',
          level: 'warn',
          source: 'MongoDB',
          category: 'system',
          action: '连接警告',
          detail: '数据库连接池使用率达到 80%',
        },
        {
          id: '8',
          timestamp: '2024-01-15 10:00:00',
          level: 'info',
          source: 'Scheduler',
          category: 'system',
          action: '定时任务执行',
          detail: '执行定时任务: 数据清理任务',
          status: 'success',
        },
      ];

      setLogs(mockLogs);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.detail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.user && log.user.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;
    return matchesSearch && matchesLevel && matchesCategory;
  });

  const levelCounts = {
    all: logs.length,
    info: logs.filter((l) => l.level === 'info').length,
    warn: logs.filter((l) => l.level === 'warn').length,
    error: logs.filter((l) => l.level === 'error').length,
    debug: logs.filter((l) => l.level === 'debug').length,
  };

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'info':
        return <Info className="w-4 h-4 text-blue-400" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'debug':
        return <Terminal className="w-4 h-4 text-gray-400" />;
    }
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'info':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'warn':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'error':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'debug':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const getCategoryIcon = (category: LogEntry['category']) => {
    switch (category) {
      case 'system':
        return <Server className="w-4 h-4 text-noc-muted" />;
      case 'security':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'operation':
        return <Activity className="w-4 h-4 text-blue-400" />;
      case 'audit':
        return <FileText className="w-4 h-4 text-purple-400" />;
    }
  };

  const getCategoryLabel = (category: LogEntry['category']) => {
    switch (category) {
      case 'system':
        return '系统';
      case 'security':
        return '安全';
      case 'operation':
        return '操作';
      case 'audit':
        return '审计';
    }
  };

  const getStatusIcon = (status?: LogEntry['status']) => {
    if (!status) return null;
    switch (status) {
      case 'success':
        return <CheckCircle className="w-3 h-3 text-emerald-400" />;
      case 'failure':
        return <XCircle className="w-3 h-3 text-red-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-noc-text">日志中心</h1>
          <p className="text-sm text-noc-muted mt-1">系统日志、操作审计和安全事件</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text hover:bg-noc-bg-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text hover:bg-noc-bg-50 transition-colors">
            <Download className="w-4 h-4" />
            导出
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">总日志数</p>
              <p className="text-2xl font-bold text-noc-text mt-1">{levelCounts.all}</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <FileText className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">警告</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{levelCounts.warn}</p>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
          </div>
        </div>
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">错误</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{levelCounts.error}</p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg">
              <XCircle className="w-6 h-6 text-red-400" />
            </div>
          </div>
        </div>
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">调试</p>
              <p className="text-2xl font-bold text-gray-400 mt-1">{levelCounts.debug}</p>
            </div>
            <div className="p-3 bg-gray-500/10 rounded-lg">
              <Terminal className="w-6 h-6 text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
          <input
            type="text"
            placeholder="搜索日志..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
          />
        </div>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text"
        >
          <option value="all">全部级别</option>
          <option value="info">信息</option>
          <option value="warn">警告</option>
          <option value="error">错误</option>
          <option value="debug">调试</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text"
        >
          <option value="all">全部类别</option>
          <option value="system">系统</option>
          <option value="security">安全</option>
          <option value="operation">操作</option>
          <option value="audit">审计</option>
        </select>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text"
        >
          <option value="today">今天</option>
          <option value="yesterday">昨天</option>
          <option value="week">本周</option>
          <option value="month">本月</option>
        </select>
      </div>

      {/* Log List */}
      <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
        <div className="divide-y divide-noc-border">
          {filteredLogs.map((log) => (
            <div key={log.id} className="hover:bg-noc-bg-50 transition-colors">
              <div
                className="flex items-center gap-4 px-6 py-4 cursor-pointer"
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
              >
                <div className="flex-shrink-0">
                  {expandedLog === log.id ? (
                    <ChevronDown className="w-4 h-4 text-noc-muted" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-noc-muted" />
                  )}
                </div>
                <div className="flex-shrink-0">{getLevelIcon(log.level)}</div>
                <div className="flex-shrink-0 w-20">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getLevelColor(log.level)}`}>
                    {log.level.toUpperCase()}
                  </span>
                </div>
                <div className="flex-shrink-0 w-16 text-xs text-noc-muted">{log.source}</div>
                <div className="flex-shrink-0 w-12">
                  <span className="flex items-center gap-1 text-xs text-noc-muted">
                    {getCategoryIcon(log.category)}
                    {getCategoryLabel(log.category)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-noc-text">{log.action}</span>
                    {log.status && getStatusIcon(log.status)}
                  </div>
                  <div className="text-xs text-noc-muted mt-0.5 truncate">{log.detail}</div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-noc-muted flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {log.timestamp}
                  </div>
                  {log.user && (
                    <div className="text-xs text-noc-muted flex items-center gap-1 mt-0.5">
                      <User className="w-3 h-3" />
                      {log.user}
                    </div>
                  )}
                </div>
              </div>
              {expandedLog === log.id && (
                <div className="px-6 pb-4 pl-16">
                  <div className="bg-noc-bg rounded-lg p-4 space-y-2">
                    <div className="text-sm text-noc-text">{log.detail}</div>
                    <div className="flex items-center gap-4 text-xs text-noc-muted">
                      {log.ip && (
                        <span className="flex items-center gap-1">
                          <Network className="w-3 h-3" />
                          IP: {log.ip}
                        </span>
                      )}
                      {log.user && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          用户: {log.user}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        来源: {log.source}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-noc-muted mx-auto mb-4" />
            <p className="text-noc-muted">未找到匹配的日志</p>
          </div>
        )}
      </div>
    </div>
  );
}
