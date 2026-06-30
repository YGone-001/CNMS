import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server,
  CheckCircle,
  XCircle,
  Pause,
  HelpCircle,
  AlertTriangle,
  Settings,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Users,
  RotateCcw,
  FileText,
} from 'lucide-react';
import SummaryCard from '@/components/SummaryCard';
import { formatBytes, formatPercent } from '@/utils/format';
import { authFetch } from '@/App';
import { useMonitor } from '@/context/MonitorContext';
import type { SystemStatusEnhanced, DeploymentTemplate } from '@/types/monitor';

// 业务指标类型
interface BusinessMetrics {
  epc_online_users: number;    // EPC/5GC 在线用户数
  ims_online_users: number;    // IMS 在线用户数
  total_subscribers: number;   // 总订户数（EPC/5GC）
  total_ims_users: number;     // 总 IMS 用户数
}

// 概览仪表盘页面
export default function Overview() {
  const navigate = useNavigate();
  // 使用统一 WebSocket 获取实时数据
  const {
    wsStatus,
    deploymentStatus: wsDeploymentStatus,
    businessMetrics: wsBusinessMetrics,
  } = useMonitor();

  const [deploymentStatus, setDeploymentStatus] = useState<SystemStatusEnhanced | null>(null);
  const [businessMetrics, setBusinessMetrics] = useState<BusinessMetrics | null>(null);
  const [templates, setTemplates] = useState<DeploymentTemplate[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<string>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null); // 状态过滤条件
  const [criticalAlarms, setCriticalAlarms] = useState<Array<{id: string; source: string; message: string; severity: string; timestamp: string}>>([]);
  const [restarting, setRestarting] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // 获取部署模板列表
  const fetchTemplates = useCallback(async () => {
    try {
      const response = await authFetch('/api/v1/deployment/templates');
      const data = await response.json();
      if (data.status === 'ok' && data.templates) {
        setTemplates(data.templates);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  }, []);

  // 从 Alarm Center API 拉取活跃告警
  const fetchAlarms = useCallback(async () => {
    try {
      const resp = await authFetch('/api/v1/alarms?active=true&acknowledged=false&page_size=20');
      const data = await resp.json();
      if (data.status === 'ok' && data.alarms) {
        setCriticalAlarms(data.alarms.map((a: { _id: string; source: string; message: string; severity: string; timestamp: string }) => ({
          id: a._id,
          source: a.source,
          message: a.message,
          severity: a.severity,
          timestamp: a.timestamp,
        })));
      }
    } catch { /* ignore */ }
  }, []);

  // HTTP 轮询作为备用（当 WebSocket 断开时）
  const fetchDeploymentStatus = useCallback(async () => {
    if (wsStatus === 'CONNECTED') return;

    setLoading(true);
    setError(null);
    try {
      const response = await authFetch('/api/v1/deployment/status');
      const data = await response.json();
      if (data.status === 'ok') {
        setDeploymentStatus(data.data);
        setCurrentTemplate(data.data.template || 'auto');
      } else {
        setError(data.message || 'Failed to fetch deployment status');
      }
    } catch (err) {
      setError('Failed to fetch deployment status');
      console.error('Error fetching deployment status:', err);
    } finally {
      setLoading(false);
    }
  }, [wsStatus]);

  // 重启网元
  const restartNF = useCallback(async (name: string) => {
    if (!confirm(`确认重启 ${name}？`)) return;
    setRestarting(name);
    try {
      const resp = await authFetch('/api/v1/mml/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `CTRL-NF: NAME=${name}, ACTION=restart;` }),
      });
      const data = await resp.json();
      if (data.status === 'ok') {
        setTimeout(() => { fetchDeploymentStatus(); setRestarting(null); }, 3000);
      } else {
        alert(`重启失败: ${data.message || '未知错误'}`);
        setRestarting(null);
      }
    } catch {
      alert('重启请求发送失败');
      setRestarting(null);
    }
  }, [fetchDeploymentStatus]);

  // WebSocket 数据同步
  useEffect(() => {
    if (wsDeploymentStatus) {
      setDeploymentStatus(wsDeploymentStatus);
      setCurrentTemplate(wsDeploymentStatus.template || 'auto');
    }
  }, [wsDeploymentStatus]);

  // 拉取告警 + 定时刷新
  useEffect(() => {
    fetchAlarms();
    const interval = setInterval(fetchAlarms, 30000);
    return () => clearInterval(interval);
  }, [fetchAlarms]);

  useEffect(() => {
    if (wsBusinessMetrics) {
      setBusinessMetrics(wsBusinessMetrics);
    }
  }, [wsBusinessMetrics]);

  // 切换部署模板
  const switchTemplate = useCallback(async (templateName: string) => {
    console.log('Switching template to:', templateName);
    try {
      const response = await authFetch('/api/v1/deployment/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: templateName }),
      });
      const data = await response.json();
      console.log('Switch template response:', data);
      if (data.status === 'ok') {
        setCurrentTemplate(templateName);
        setShowTemplateMenu(false);
        // 重新获取状态
        await fetchDeploymentStatus();
      } else {
        console.error('Failed to switch template:', data.message);
      }
    } catch (err) {
      console.error('Error switching template:', err);
    }
  }, [fetchDeploymentStatus]);

  // 获取业务指标
  const fetchBusinessMetrics = useCallback(async () => {
    try {
      const response = await authFetch('/api/v1/business-metrics');
      const data = await response.json();
      if (data.status === 'ok') {
        setBusinessMetrics(data.data);
      }
    } catch (err) {
      console.error('Error fetching business metrics:', err);
    }
  }, []);

  // 初始化：获取模板列表和初始数据
  useEffect(() => {
    fetchTemplates();
    // 仅在 WebSocket 未连接时使用 HTTP 轮询
    if (wsStatus !== 'CONNECTED') {
      fetchDeploymentStatus();
      fetchBusinessMetrics();
    }
  }, [fetchTemplates, fetchDeploymentStatus, fetchBusinessMetrics, wsStatus]);

  // 备用轮询：当 WebSocket 断开时，每 30 秒轮询一次
  useEffect(() => {
    if (wsStatus === 'CONNECTED') return; // WebSocket 已连接，跳过轮询

    const interval = setInterval(() => {
      fetchDeploymentStatus();
      fetchBusinessMetrics();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchDeploymentStatus, fetchBusinessMetrics, wsStatus]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.template-menu-container')) {
        setShowTemplateMenu(false);
      }
    };

    if (showTemplateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTemplateMenu]);

  const summary = deploymentStatus?.summary;
  const processes = deploymentStatus?.processes ?? [];

  // 按 category 分组
  const groupedProcesses = useMemo(() => {
    const filtered = processes.filter((proc) => {
      if (!statusFilter) return true;
      return proc.state === statusFilter;
    });
    const groups: Record<string, typeof filtered> = {};
    filtered.forEach((proc) => {
      const cat = proc.category || '其他';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(proc);
    });
    const order = ['5G Core', '4G/EPC', 'IMS', 'EPC', 'Support'];
    return Object.entries(groups).sort(([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)));
  }, [processes, statusFilter]);

  // 获取当前模板描述
  const currentTemplateDesc = templates.find((t) => t.name === currentTemplate)?.description || currentTemplate;

  // 获取状态图标
  const getStateIcon = (state: string) => {
    switch (state) {
      case 'running':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'stopped':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'disabled':
        return <Pause className="w-4 h-4 text-gray-400" />;
      case 'expected_missing':
        return <HelpCircle className="w-4 h-4 text-blue-400" />;
      case 'not_installed':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      default:
        return null;
    }
  };

  // 获取状态标签
  const getStateLabel = (state: string) => {
    switch (state) {
      case 'running':
        return '运行中';
      case 'stopped':
        return '已停止';
      case 'disabled':
        return '已禁用';
      case 'expected_missing':
        return '预期缺失';
      case 'not_installed':
        return '未安装';
      default:
        return state;
    }
  };

  // 获取状态颜色
  const getStateColor = (state: string) => {
    switch (state) {
      case 'running':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'stopped':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'disabled':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      case 'expected_missing':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'not_installed':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  if (loading && !deploymentStatus) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-noc-accent animate-spin mx-auto mb-4" />
          <p className="text-noc-muted">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchDeploymentStatus}
            className="mt-4 px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text hover:bg-noc-bg-50 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 活跃告警横幅 */}
      {criticalAlarms.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-red-400">活跃告警</span>
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full font-bold">
                  {criticalAlarms.length}
                </span>
                {(() => {
                  const critical = criticalAlarms.filter(a => a.severity === 'critical').length;
                  const major = criticalAlarms.filter(a => a.severity === 'major').length;
                  return (
                    <span className="flex items-center gap-1.5 ml-2">
                      {critical > 0 && <span className="text-[10px] text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded">严重 {critical}</span>}
                      {major > 0 && <span className="text-[10px] text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">主要 {major}</span>}
                    </span>
                  );
                })()}
              </div>
              <div className="mt-1 overflow-hidden">
                <div className="animate-marquee whitespace-nowrap">
                  {criticalAlarms.map((alarm, index) => (
                    <span key={alarm.id} className="text-sm text-red-300">
                      [{alarm.source}] {alarm.message}
                      {index < criticalAlarms.length - 1 && (
                        <span className="mx-4 text-red-500">•</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => window.location.hash = '#/alarms'}
              className="flex-shrink-0 px-3 py-1.5 bg-red-500/20 text-red-400 text-sm rounded-lg hover:bg-red-500/30 transition-colors"
            >
              查看详情
            </button>
          </div>
        </div>
      )}

      {/* 部署模板选择 */}
      <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-noc-accent" />
            <div>
              <span className="text-sm font-medium text-noc-text">部署模板: </span>
              <span className="text-sm text-noc-accent">{currentTemplateDesc}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative template-menu-container">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTemplateMenu(!showTemplateMenu);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text hover:bg-noc-bg-50 transition-colors"
              >
                切换模板
                <ChevronDown className="w-4 h-4" />
              </button>
              {showTemplateMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-noc-surface border border-noc-border rounded-lg shadow-lg z-50">
                  {templates.map((template) => (
                    <button
                      key={template.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        switchTemplate(template.name);
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-noc-bg-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        currentTemplate === template.name ? 'bg-noc-accent/10' : ''
                      }`}
                    >
                      <div className="text-sm font-medium text-noc-text">{template.name}</div>
                      <div className="text-xs text-noc-muted">{template.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={fetchDeploymentStatus}
              className="p-2 text-noc-muted hover:text-noc-text transition-colors"
              title="刷新"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 业务指标卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SummaryCard
          title="EPC/5GC 在线用户"
          value={businessMetrics?.epc_online_users ?? 0}
          icon={Users}
          accentColor="text-blue-400"
          subtitle={`总订户: ${businessMetrics?.total_subscribers ?? 0}`}
        />
        <SummaryCard
          title="IMS 在线用户"
          value={businessMetrics?.ims_online_users ?? 0}
          icon={Users}
          accentColor="text-emerald-400"
          subtitle={`总用户: ${businessMetrics?.total_ims_users ?? 0}`}
        />
      </div>

      {/* 状态分布 */}
      <div className="bg-noc-surface border border-noc-border rounded-lg p-6">
        <h3 className="text-base font-semibold text-noc-text mb-4">组件状态分布</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { state: 'running', label: '运行中', count: summary?.running ?? 0, color: 'emerald' },
            { state: 'stopped', label: '已停止', count: summary?.stopped ?? 0, color: 'red' },
            { state: 'disabled', label: '已禁用', count: summary?.disabled ?? 0, color: 'gray' },
            { state: 'expected_missing', label: '预期缺失', count: summary?.expected_missing ?? 0, color: 'blue' },
            { state: 'not_installed', label: '未安装', count: summary?.not_installed ?? 0, color: 'amber' },
          ].map((item) => (
            <div
              key={item.state}
              onClick={() => setStatusFilter(statusFilter === item.state ? null : item.state)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                statusFilter === item.state
                  ? `ring-2 ring-${item.color}-400`
                  : item.count > 0
                  ? `bg-${item.color}-500/5 border-${item.color}-500/20`
                  : 'bg-noc-bg border-noc-border'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {getStateIcon(item.state)}
                <span className="text-sm text-noc-muted">{item.label}</span>
              </div>
              <div className={`text-2xl font-bold text-${item.color}-400`}>{item.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 网元状态列表 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-noc-warning">
            网元状态详情
            {statusFilter && (
              <span className="ml-2 text-xs text-noc-muted">
                (已过滤: {statusFilter === 'running' ? '运行中' : statusFilter === 'stopped' ? '已停止' : '已禁用'})
              </span>
            )}
          </div>
          {statusFilter && (
            <button
              onClick={() => setStatusFilter(null)}
              className="text-xs text-noc-accent hover:underline"
            >
              清除过滤
            </button>
          )}
        </div>
        {processes.length > 0 ? (
          <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_80px_80px_100px_1fr_80px] gap-4 px-6 py-3 border-b border-noc-border text-xs font-medium text-noc-muted uppercase tracking-wider">
              <span>网元</span><span>状态</span><span>CPU</span><span>内存</span><span>类别</span><span>描述</span><span className="text-right">操作</span>
            </div>
            {/* Grouped rows */}
            {groupedProcesses.map(([cat, procs]) => {
              const isCollapsed = collapsedGroups.has(cat);
              const runningCount = procs.filter(p => p.state === 'running').length;
              return (
                <div key={cat}>
                  {/* Group header */}
                  <button
                    onClick={() => setCollapsedGroups(prev => {
                      const next = new Set(prev);
                      if (next.has(cat)) next.delete(cat); else next.add(cat);
                      return next;
                    })}
                    className="w-full flex items-center gap-2 px-6 py-2.5 bg-noc-bg/50 border-b border-noc-border hover:bg-noc-bg transition-colors text-left"
                  >
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-noc-muted" /> : <ChevronDown className="w-4 h-4 text-noc-muted" />}
                    <span className="text-sm font-semibold text-noc-text">{cat}</span>
                    <span className="text-xs text-noc-muted">({runningCount}/{procs.length} 运行中)</span>
                  </button>
                  {/* Process rows */}
                  {!isCollapsed && procs.map((proc) => (
                    <div key={proc.name} className="grid grid-cols-[1fr_120px_80px_80px_100px_1fr_80px] gap-4 items-center px-6 py-3 border-b border-noc-border hover:bg-noc-bg/50 transition-colors">
                      {/* 网元 */}
                      <div className="flex items-center gap-2 pl-4">
                        <Server className="w-4 h-4 text-noc-muted flex-shrink-0" />
                        <span className="text-sm font-medium text-noc-text">{proc.name}</span>
                        {proc.required && <span className="px-1.5 py-0.5 text-[10px] bg-red-500/10 text-red-400 rounded">必需</span>}
                      </div>
                      {/* 状态 */}
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border w-fit ${getStateColor(proc.state)}`}>
                        <span className={`relative flex h-2 w-2 ${proc.state === 'running' ? 'animate-pulse' : ''}`}>
                          {proc.state === 'running' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                          <span className={`relative inline-flex rounded-full h-2 w-2 ${proc.state === 'running' ? 'bg-emerald-400' : proc.state === 'stopped' ? 'bg-red-400' : proc.state === 'disabled' ? 'bg-gray-400' : proc.state === 'expected_missing' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                        </span>
                        {getStateLabel(proc.state)}
                      </span>
                      {/* CPU */}
                      <span className="text-sm text-noc-text">{proc.state === 'running' ? formatPercent(proc.cpu_percent, 1) : '-'}</span>
                      {/* 内存 */}
                      <span className="text-sm text-noc-text">{proc.state === 'running' ? formatBytes(proc.memory_rss) : '-'}</span>
                      {/* 类别 */}
                      <span className="text-sm text-noc-muted">{proc.category}</span>
                      {/* 描述 */}
                      <span className="text-sm text-noc-muted truncate">{proc.description}</span>
                      {/* 操作 */}
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => navigate(`/logs?source=${proc.name}`)} className="p-1.5 rounded-md text-noc-muted hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="查看日志"><FileText className="w-4 h-4" /></button>
                        <button onClick={() => restartNF(proc.name)} disabled={restarting === proc.name} className="p-1.5 rounded-md text-noc-muted hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50" title="重启"><RotateCcw className={`w-4 h-4 ${restarting === proc.name ? 'animate-spin' : ''}`} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center text-noc-muted">
            Waiting for data...
          </div>
        )}
      </div>
    </div>
  );
}
