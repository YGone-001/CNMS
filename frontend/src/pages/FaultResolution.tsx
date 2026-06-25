import { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  Search,
  Plus,
  BookOpen,
  Lightbulb,
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  FileText,
  History,
  Play,
  Pause,
  RefreshCw,
} from 'lucide-react';

interface Resolution {
  id: string;
  title: string;
  category: string;
  severity: 'critical' | 'major' | 'minor';
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  alarmId: string;
  alarmName: string;
  assignee: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolution?: string;
  kbArticle?: string;
}

interface KbArticle {
  id: string;
  title: string;
  category: string;
  tags: string[];
  views: number;
}

export default function FaultResolution() {
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [kbArticles, setKbArticles] = useState<KbArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'resolutions' | 'kb'>('resolutions');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Mock data - replace with actual API calls
      const mockResolutions: Resolution[] = [
        {
          id: '1',
          title: 'AMF 进程频繁重启',
          category: '进程故障',
          severity: 'critical',
          status: 'resolved',
          alarmId: 'ALM-001',
          alarmName: 'AMF 进程停止',
          assignee: '张工',
          createdAt: '2024-01-15 08:30:00',
          updatedAt: '2024-01-15 10:45:00',
          resolvedAt: '2024-01-15 10:45:00',
          resolution: '内存溢出导致进程崩溃，已调整 JVM 参数并增加内存限制',
          kbArticle: 'KB-001',
        },
        {
          id: '2',
          title: 'SMF CPU 使用率过高',
          category: '性能问题',
          severity: 'major',
          status: 'in_progress',
          alarmId: 'ALM-002',
          alarmName: 'SMF CPU > 90%',
          assignee: '李工',
          createdAt: '2024-01-15 09:15:00',
          updatedAt: '2024-01-15 11:20:00',
        },
        {
          id: '3',
          title: 'UPF 丢包率异常',
          category: '网络问题',
          severity: 'major',
          status: 'pending',
          alarmId: 'ALM-003',
          alarmName: 'UPF 丢包率 > 5%',
          assignee: '待分配',
          createdAt: '2024-01-15 10:00:00',
          updatedAt: '2024-01-15 10:00:00',
        },
        {
          id: '4',
          title: 'NRF 注册失败',
          category: '服务发现',
          severity: 'minor',
          status: 'closed',
          alarmId: 'ALM-004',
          alarmName: 'NRF 注册超时',
          assignee: '王工',
          createdAt: '2024-01-14 14:20:00',
          updatedAt: '2024-01-14 16:30:00',
          resolvedAt: '2024-01-14 16:30:00',
          resolution: '网络策略变更导致注册超时，已恢复网络配置',
        },
      ];

      const mockKbArticles: KbArticle[] = [
        { id: 'KB-001', title: 'AMF 进程故障排查指南', category: '进程故障', tags: ['AMF', '进程', '重启'], views: 156 },
        { id: 'KB-002', title: 'CPU 使用率过高排查手册', category: '性能问题', tags: ['CPU', '性能', '优化'], views: 234 },
        { id: 'KB-003', title: '网络丢包问题定位方法', category: '网络问题', tags: ['丢包', '网络', 'UPF'], views: 189 },
        { id: 'KB-004', title: '5G 核心网常见告警处理', category: '告警处理', tags: ['告警', '处理', '5G'], views: 312 },
        { id: 'KB-005', title: '服务发现故障排除', category: '服务发现', tags: ['NRF', '服务发现', '注册'], views: 145 },
      ];

      setResolutions(mockResolutions);
      setKbArticles(mockKbArticles);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredResolutions = resolutions.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.alarmName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: resolutions.length,
    pending: resolutions.filter((r) => r.status === 'pending').length,
    in_progress: resolutions.filter((r) => r.status === 'in_progress').length,
    resolved: resolutions.filter((r) => r.status === 'resolved').length,
    closed: resolutions.filter((r) => r.status === 'closed').length,
  };

  const getSeverityColor = (severity: Resolution['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'major':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'minor':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  const getStatusColor = (status: Resolution['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      case 'in_progress':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'resolved':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'closed':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getStatusLabel = (status: Resolution['status']) => {
    switch (status) {
      case 'pending':
        return '待处理';
      case 'in_progress':
        return '处理中';
      case 'resolved':
        return '已解决';
      case 'closed':
        return '已关闭';
    }
  };

  const getStatusIcon = (status: Resolution['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'in_progress':
        return <Play className="w-4 h-4 text-blue-400" />;
      case 'resolved':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'closed':
        return <Pause className="w-4 h-4 text-slate-400" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-noc-accent animate-spin mx-auto mb-4" />
          <p className="text-noc-muted">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-noc-text">故障处置</h1>
          <p className="text-sm text-noc-muted mt-1">故障工单管理和知识库</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text hover:bg-noc-bg-50 transition-colors">
            <History className="w-4 h-4" />
            历史记录
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-noc-accent text-white rounded-lg text-sm hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" />
            新建工单
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-noc-surface border border-noc-border rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('resolutions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors ${
            activeTab === 'resolutions' ? 'bg-noc-accent text-white' : 'text-noc-text hover:bg-noc-bg-50'
          }`}
        >
          <Wrench className="w-4 h-4" />
          故障工单
        </button>
        <button
          onClick={() => setActiveTab('kb')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors ${
            activeTab === 'kb' ? 'bg-noc-accent text-white' : 'text-noc-text hover:bg-noc-bg-50'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          知识库
        </button>
      </div>

      {activeTab === 'resolutions' ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
              <div className="text-sm text-noc-muted">全部工单</div>
              <div className="text-2xl font-bold text-noc-text mt-1">{statusCounts.all}</div>
            </div>
            <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
              <div className="text-sm text-noc-muted">待处理</div>
              <div className="text-2xl font-bold text-gray-400 mt-1">{statusCounts.pending}</div>
            </div>
            <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
              <div className="text-sm text-noc-muted">处理中</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">{statusCounts.in_progress}</div>
            </div>
            <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
              <div className="text-sm text-noc-muted">已解决</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{statusCounts.resolved}</div>
            </div>
            <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
              <div className="text-sm text-noc-muted">已关闭</div>
              <div className="text-2xl font-bold text-slate-400 mt-1">{statusCounts.closed}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
              <input
                type="text"
                placeholder="搜索工单或告警..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text"
            >
              <option value="all">全部状态</option>
              <option value="pending">待处理</option>
              <option value="in_progress">处理中</option>
              <option value="resolved">已解决</option>
              <option value="closed">已关闭</option>
            </select>
          </div>

          {/* Resolution List */}
          <div className="space-y-4">
            {filteredResolutions.map((resolution) => (
              <div
                key={resolution.id}
                className="bg-noc-surface border border-noc-border rounded-lg p-4 hover:border-noc-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-medium text-noc-text">{resolution.title}</h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(resolution.severity)}`}>
                        {resolution.severity === 'critical' ? '严重' : resolution.severity === 'major' ? '主要' : '次要'}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(resolution.status)}`}>
                        {getStatusIcon(resolution.status)}
                        <span className="ml-1">{getStatusLabel(resolution.status)}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-noc-muted">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {resolution.alarmId} - {resolution.alarmName}
                      </span>
                      <span>分类: {resolution.category}</span>
                      <span>负责人: {resolution.assignee}</span>
                    </div>
                    {resolution.resolution && (
                      <div className="mt-3 p-3 bg-noc-bg rounded-lg">
                        <div className="flex items-center gap-2 text-sm text-noc-muted mb-1">
                          <Lightbulb className="w-4 h-4 text-amber-400" />
                          解决方案
                        </div>
                        <p className="text-sm text-noc-text">{resolution.resolution}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {resolution.kbArticle && (
                      <button className="flex items-center gap-1 px-3 py-1.5 text-xs text-noc-accent hover:bg-noc-accent/10 rounded-md transition-colors">
                        <BookOpen className="w-3 h-3" />
                        查看知识库
                      </button>
                    )}
                    <button className="flex items-center gap-1 px-3 py-1.5 text-xs text-noc-text hover:bg-noc-bg-50 rounded-md transition-colors">
                      <ArrowRight className="w-3 h-3" />
                      详情
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-noc-muted">
                  <span>创建: {resolution.createdAt}</span>
                  <span>更新: {resolution.updatedAt}</span>
                  {resolution.resolvedAt && <span>解决: {resolution.resolvedAt}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Knowledge Base */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kbArticles.map((article) => (
              <div
                key={article.id}
                className="bg-noc-surface border border-noc-border rounded-lg p-4 hover:border-noc-accent/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-medium text-noc-text">{article.title}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-noc-bg text-noc-muted">
                        {article.category}
                      </span>
                      <span className="text-xs text-noc-muted flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {article.views} 次查看
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-3">
                      {article.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 text-xs bg-noc-accent/10 text-noc-accent rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
