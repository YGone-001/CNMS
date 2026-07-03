import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/App';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  MapPin,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings,
  Download,
  Terminal,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Link2,
  Zap,
} from 'lucide-react';

interface AgentNF {
  name: string;
  status: 'running' | 'stopped';
  cpu: number;
  memory: string;
}

interface Agent {
  id: string;
  hostname: string;
  ip: string;
  status: 'online' | 'offline' | 'warning';
  region: string;
  site: string;
  cpu: number;
  memory: number;
  disk: number;
  uptime: string;
  lastSeen: string;
  version: string;
  nfCount: number;
  nfs: AgentNF[];
}

export default function AgentManagement() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      // 从 deployment status API 获取真实数据
      const resp = await authFetch('/api/v1/deployment/status');
      const data = await resp.json();
      if (data.status === 'ok' && data.data) {
        const procs = data.data.processes || [];
        const runningProcs = procs.filter((p: { state: string }) => p.state === 'running');
        const totalCpu = runningProcs.reduce((s: number, p: { cpu_percent: number }) => s + (p.cpu_percent || 0), 0);
        const totalMem = runningProcs.reduce((s: number, p: { memory_percent: number }) => s + (p.memory_percent || 0), 0);
        const maxCpu = Math.max(...runningProcs.map((p: { cpu_percent: number }) => p.cpu_percent || 0));

        const masterAgent: Agent = {
          id: 'master',
          hostname: 'morun',
          ip: '10.10.0.139',
          status: maxCpu > 80 ? 'warning' : 'online',
          region: '主节点',
          site: '本地部署',
          cpu: Math.round(totalCpu),
          memory: Math.round(totalMem),
          disk: 37,
          uptime: '2周 5天',
          lastSeen: new Date().toISOString().slice(0, 19).replace('T', ' '),
          version: 'v1.4.1',
          nfCount: runningProcs.length,
          nfs: procs.map((p: { name: string; state: string; cpu_percent: number; memory_percent: number }) => ({
            name: p.name,
            status: p.state === 'running' ? 'running' as const : 'stopped' as const,
            cpu: Math.round((p.cpu_percent || 0) * 100) / 100,
            memory: `${Math.round((p.memory_percent || 0) * 100) / 100}%`,
          })),
        };
        setAgents([masterAgent]);
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.ip.includes(searchTerm) ||
      agent.site.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: agents.length,
    online: agents.filter((a) => a.status === 'online').length,
    warning: agents.filter((a) => a.status === 'warning').length,
    offline: agents.filter((a) => a.status === 'offline').length,
  };

  const getStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'offline':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'online':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'warning':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'offline':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
    }
  };

  const getUsageColor = (value: number) => {
    if (value >= 90) return 'bg-red-500';
    if (value >= 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  // 高资源使用告警关联
  const getResourceAlarms = (agent: Agent): string[] => {
    const alarms: string[] = [];
    if (agent.cpu >= 80) alarms.push(`CPU ${agent.cpu}% 超过阈值`);
    if (agent.memory >= 80) alarms.push(`内存 ${agent.memory}% 超过阈值`);
    if (agent.disk >= 80) alarms.push(`磁盘 ${agent.disk}% 超过阈值`);
    return alarms;
  };

  // 重新连接 Agent
  const handleReconnect = async (agentId: string) => {
    setReconnecting(agentId);
    // 模拟重连
    await new Promise(r => setTimeout(r, 2000));
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status: 'online' as const, lastSeen: new Date().toISOString().slice(0, 19).replace('T', ' ') } : a));
    setReconnecting(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-noc-text">Agent 管理</h1>
          <p className="text-sm text-noc-muted mt-1">管理和监控分布式采集节点</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAgents}
            className="flex items-center gap-2 px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text hover:bg-noc-bg-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-noc-accent text-white rounded-lg text-sm hover:opacity-90 transition-opacity">
            <Download className="w-4 h-4" />
            安装 Agent
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">总节点数</p>
              <p className="text-2xl font-bold text-noc-text mt-1">{statusCounts.all}</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Wifi className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">在线</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{statusCounts.online}</p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-lg">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
        </div>
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">告警</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{statusCounts.warning}</p>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
          </div>
        </div>
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">离线</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{statusCounts.offline}</p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg">
              <WifiOff className="w-6 h-6 text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
          <input
            type="text"
            placeholder="搜索主机名、IP 或站点..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
          />
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'online', 'warning', 'offline'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                statusFilter === status
                  ? 'bg-noc-accent text-white'
                  : 'bg-noc-surface border border-noc-border text-noc-text hover:bg-noc-bg-50'
              }`}
            >
              {status === 'all' ? '全部' : status === 'online' ? '在线' : status === 'warning' ? '告警' : '离线'}
              <span className="ml-1 text-xs opacity-75">({statusCounts[status]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Agent List */}
      <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-noc-border">
                <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">节点</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">位置</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">状态</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">资源使用</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">NF 数量</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">运行时间</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-noc-muted uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-noc-border">
              {filteredAgents.map((agent) => (
                <React.Fragment key={agent.id}>
                <tr className="hover:bg-noc-bg-50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-noc-text">{agent.hostname}</div>
                      <div className="text-xs text-noc-muted mt-0.5">{agent.ip}</div>
                      <div className="text-xs text-noc-muted">{agent.version}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-noc-muted" />
                      <div>
                        <div className="text-sm text-noc-text">{agent.site}</div>
                        <div className="text-xs text-noc-muted">{agent.region}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(agent.status)}
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(agent.status)}`}>
                        {agent.status === 'online' ? '在线' : agent.status === 'warning' ? '告警' : '离线'}
                      </span>
                    </div>
                    <div className="text-xs text-noc-muted mt-1">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {agent.lastSeen}
                    </div>
                    {/* 告警关联 */}
                    {getResourceAlarms(agent).length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {getResourceAlarms(agent).map((alarm, i) => (
                          <div key={i} className="flex items-center gap-1 text-[10px] text-amber-400">
                            <Zap className="w-2.5 h-2.5" />
                            {alarm}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-2 min-w-[120px]">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-noc-muted flex items-center gap-1">
                            <Cpu className="w-3 h-3" /> CPU
                          </span>
                          <span className="text-noc-text">{agent.cpu}%</span>
                        </div>
                        <div className="w-full bg-noc-bg rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${getUsageColor(agent.cpu)}`} style={{ width: `${agent.cpu}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-noc-muted flex items-center gap-1">
                            <MemoryStick className="w-3 h-3" /> 内存
                          </span>
                          <span className="text-noc-text">{agent.memory}%</span>
                        </div>
                        <div className="w-full bg-noc-bg rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${getUsageColor(agent.memory)}`} style={{ width: `${agent.memory}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-noc-muted flex items-center gap-1">
                            <HardDrive className="w-3 h-3" /> 磁盘
                          </span>
                          <span className="text-noc-text">{agent.disk}%</span>
                        </div>
                        <div className="w-full bg-noc-bg rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${getUsageColor(agent.disk)}`} style={{ width: `${agent.disk}%` }} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                      className="flex items-center gap-1 text-sm text-noc-accent hover:underline"
                    >
                      {expandedAgent === agent.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {agent.nfCount} 个
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-noc-text">{agent.uptime}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {agent.status === 'offline' && (
                        <button
                          onClick={() => handleReconnect(agent.id)}
                          disabled={reconnecting === agent.id}
                          className="p-1.5 rounded-md text-noc-accent hover:bg-noc-accent/10 transition-colors disabled:opacity-50"
                          title="重新连接"
                        >
                          <RotateCcw className={`w-4 h-4 ${reconnecting === agent.id ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      <button className="p-1.5 rounded-md text-noc-muted hover:text-noc-text hover:bg-noc-bg-50 transition-colors" title="终端">
                        <Terminal className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-md text-noc-muted hover:text-noc-text hover:bg-noc-bg-50 transition-colors" title="配置">
                        <Settings className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {/* Expanded NF list */}
                {expandedAgent === agent.id && (
                  <tr>
                    <td colSpan={7} className="px-6 py-3 bg-noc-bg/50">
                      <div className="pl-4 space-y-1">
                        <div className="text-xs text-noc-muted mb-2 flex items-center gap-1">
                          <Link2 className="w-3 h-3" /> {agent.hostname} 上运行的 NF：
                        </div>
                        {agent.nfs.map((nf) => (
                          <div key={nf.name} className="flex items-center gap-4 text-xs py-1">
                            <span className={`w-2 h-2 rounded-full ${nf.status === 'running' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                            <span className="text-noc-text font-mono w-16">{nf.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${nf.status === 'running' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                              {nf.status === 'running' ? '运行中' : '已停止'}
                            </span>
                            <span className="text-noc-muted">CPU: {nf.cpu}%</span>
                            <span className="text-noc-muted">MEM: {nf.memory}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAgents.length === 0 && (
          <div className="text-center py-12">
            <Wifi className="w-12 h-12 text-noc-muted mx-auto mb-4" />
            <p className="text-noc-muted">未找到匹配的 Agent</p>
          </div>
        )}
      </div>
    </div>
  );
}
