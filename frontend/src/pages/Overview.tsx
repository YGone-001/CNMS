import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Cpu,
  MemoryStick,
  CheckCircle,
  XCircle,
  Pause,
  HelpCircle,
  AlertTriangle,
  Settings,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import SummaryCard from '@/components/SummaryCard';
import ResourceChart from '@/components/ResourceChart';
import { formatBytes, formatPercent } from '@/utils/format';
import { authFetch } from '@/App';
import type { SystemStatusEnhanced, DeploymentTemplate } from '@/types/monitor';

// 概览仪表盘页面
export default function Overview() {
  const [deploymentStatus, setDeploymentStatus] = useState<SystemStatusEnhanced | null>(null);
  const [templates, setTemplates] = useState<DeploymentTemplate[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<string>('auto');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [chartKey, setChartKey] = useState<number>(0); // 用于强制重新创建图表组件

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

  // 获取部署状态
  const fetchDeploymentStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch('/api/v1/deployment/status');
      const data = await response.json();
      console.log('Deployment status response:', data);
      if (data.status === 'ok') {
        setDeploymentStatus(data.data);
        setCurrentTemplate(data.data.template || 'auto');
        console.log('Current template set to:', data.data.template);
      } else {
        setError(data.message || 'Failed to fetch deployment status');
      }
    } catch (err) {
      setError('Failed to fetch deployment status');
      console.error('Error fetching deployment status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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
        // 清空图表历史数据
        setChartKey((prev) => prev + 1);
        // 重新获取状态
        await fetchDeploymentStatus();
      } else {
        console.error('Failed to switch template:', data.message);
      }
    } catch (err) {
      console.error('Error switching template:', err);
    }
  }, [fetchDeploymentStatus]);

  useEffect(() => {
    fetchTemplates();
    fetchDeploymentStatus();
    // 每 30 秒刷新一次
    const interval = setInterval(fetchDeploymentStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchTemplates, fetchDeploymentStatus]);

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

  // 计算运行中的进程资源使用
  const runningProcesses = processes.filter((p) => p.state === 'running');
  const totalCpu = runningProcesses.reduce((sum, p) => sum + p.cpu_percent, 0);
  const totalMemoryRss = runningProcesses.reduce((sum, p) => sum + p.memory_rss, 0);

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
      {/* 汇总卡片行 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard
          title="运行中"
          value={summary?.running ?? 0}
          icon={CheckCircle}
          accentColor="text-emerald-400"
        />
        <SummaryCard
          title="已停止"
          value={summary?.stopped ?? 0}
          icon={XCircle}
          accentColor="text-red-400"
        />
        <SummaryCard
          title="已禁用/预期缺失"
          value={(summary?.disabled ?? 0) + (summary?.expected_missing ?? 0)}
          icon={Pause}
          accentColor="text-gray-400"
        />
        <SummaryCard
          title="Total CPU"
          value={formatPercent(totalCpu, 1)}
          icon={Cpu}
          accentColor="text-noc-accent"
          subtitle="across running processes"
        />
        <SummaryCard
          title="Total Memory"
          value={formatBytes(totalMemoryRss)}
          icon={MemoryStick}
          accentColor="text-noc-warning"
          subtitle="RSS across running processes"
        />
      </div>

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
              className={`p-4 rounded-lg border ${
                item.count > 0
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

      {/* 资源趋势图 */}
      {runningProcesses.length > 0 && (
        <ResourceChart
          key={chartKey}
          processes={runningProcesses.map((p) => ({
            name: p.name,
            pid: p.pid,
            cpu_percent: p.cpu_percent,
            memory_rss: p.memory_rss,
            memory_vms: p.memory_vms,
            memory_percent: p.memory_percent,
            running: true,
          }))}
        />
      )}

      {/* 网元状态列表 */}
      <div>
        <div className="text-sm font-medium text-noc-warning mb-3">
          网元状态详情
        </div>
        {processes.length > 0 ? (
          <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-noc-border">
                    <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">
                      网元
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">
                      状态
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">
                      类别
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">
                      CPU
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">
                      内存
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">
                      描述
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-noc-border">
                  {processes.map((proc) => (
                    <tr key={proc.name} className="hover:bg-noc-bg-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Server className="w-4 h-4 text-noc-muted" />
                          <span className="text-sm font-medium text-noc-text">{proc.name}</span>
                          {proc.required && (
                            <span className="px-1.5 py-0.5 text-xs bg-red-500/10 text-red-400 rounded">
                              必需
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStateColor(
                            proc.state
                          )}`}
                        >
                          {getStateIcon(proc.state)}
                          {getStateLabel(proc.state)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-noc-muted">{proc.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        {proc.state === 'running' ? (
                          <span className="text-sm text-noc-text">{formatPercent(proc.cpu_percent, 1)}</span>
                        ) : (
                          <span className="text-sm text-noc-muted">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {proc.state === 'running' ? (
                          <span className="text-sm text-noc-text">{formatBytes(proc.memory_rss)}</span>
                        ) : (
                          <span className="text-sm text-noc-muted">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-noc-muted">{proc.description}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
