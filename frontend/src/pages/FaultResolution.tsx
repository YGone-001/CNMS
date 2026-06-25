import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Clock,
  CheckCircle,
  Play,
  Pause,
  RefreshCw,
  User,
  MapPin,
  Server,
  Activity,
  Copy,
  Download,
  Wrench,
  Lightbulb,
  Target,
  BarChart3,
} from 'lucide-react';

// Incident interfaces
interface RootCause {
  id: string;
  description: string;
  confidence: number;
  evidence: string[];
}

interface RecommendedAction {
  id: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
  category: 'check' | 'config' | 'capture' | 'restart';
}

interface Incident {
  id: string;
  title: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  severity: 'critical' | 'major' | 'minor';
  impactService: string;
  impactElements: string[];
  createdAt: string;
  updatedAt: string;
  assignee: string;
  site: string;
  description: string;
  rootCauses: RootCause[];
  recommendations: RecommendedAction[];
  timeline: TimelineEvent[];
}

interface TimelineEvent {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  detail?: string;
}

export default function FaultResolution() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      // Mock data - replace with actual API call
      const mockIncidents: Incident[] = [
        {
          id: 'INC-20260624-001',
          title: 'VoLTE 呼叫无声音问题',
          status: 'investigating',
          severity: 'critical',
          impactService: 'VoLTE',
          impactElements: ['P-CSCF', 'RTPENGINE'],
          createdAt: '2026-06-24 10:30:00',
          updatedAt: '2026-06-24 11:45:00',
          assignee: '张工',
          site: '上海数据中心',
          description: '用户反馈 VoLTE 通话接通后无声音，影响范围：上海地区部分用户',
          rootCauses: [
            {
              id: '1',
              description: 'RTPENGINE offer/answer 参数异常',
              confidence: 86,
              evidence: [
                'RTPENGINE 日志显示 offer 处理时 SDP c= 行 IP 地址错误',
                '抓包显示 RTP 包发送到 10.0.0.1 而非实际 UE IP',
                'rtpengine_sock 配置中 interface 参数不匹配',
              ],
            },
            {
              id: '2',
              description: 'P-CSCF 未正确转发 ACK/BYE',
              confidence: 71,
              evidence: [
                'SIP 信令分析显示 ACK 包丢失',
                'P-CSCF 路由配置中 route[NATMANAGE] 规则异常',
                'Contact / Route Header 处理逻辑问题',
              ],
            },
            {
              id: '3',
              description: '被叫侧 IPsec 路由异常',
              confidence: 63,
              evidence: [
                'IPsec SA 建立成功但路由未正确配置',
                '被叫侧 P-CSCF 返回的 Contact 地址错误',
                'IPsec 策略与 RTP 路由冲突',
              ],
            },
          ],
          recommendations: [
            {
              id: '1',
              action: '检查 rtpengine_sock 配置',
              priority: 'high',
              category: 'check',
            },
            {
              id: '2',
              action: '检查 route[NATMANAGE] 路由逻辑',
              priority: 'high',
              category: 'config',
            },
            {
              id: '3',
              action: '检查 Contact / Route Header',
              priority: 'medium',
              category: 'check',
            },
            {
              id: '4',
              action: '抓取 SIP + RTP + Diameter 包',
              priority: 'high',
              category: 'capture',
            },
            {
              id: '5',
              action: '重启 RTPENGINE 服务',
              priority: 'medium',
              category: 'restart',
            },
          ],
          timeline: [
            {
              id: '1',
              timestamp: '2026-06-24 10:30:00',
              user: '系统',
              action: '工单创建',
              detail: '自动告警触发，检测到 VoLTE 呼叫失败率超过阈值',
            },
            {
              id: '2',
              timestamp: '2026-06-24 10:35:00',
              user: '系统',
              action: '自动诊断完成',
              detail: '故障诊断完成，识别出 3 个可能的根因',
            },
            {
              id: '3',
              timestamp: '2026-06-24 10:40:00',
              user: '张工',
              action: '接受工单',
            },
            {
              id: '4',
              timestamp: '2026-06-24 11:00:00',
              user: '张工',
              action: '开始排查',
              detail: '检查 RTPENGINE 配置和日志',
            },
            {
              id: '5',
              timestamp: '2026-06-24 11:30:00',
              user: '张工',
              action: '发现异常',
              detail: '确认 rtpengine_sock 配置中 interface 参数错误',
            },
          ],
        },
        {
          id: 'INC-20260624-002',
          title: 'UE 注册失败 - 鉴权异常',
          status: 'open',
          severity: 'major',
          impactService: '5G 注册',
          impactElements: ['AMF', 'AUSF'],
          createdAt: '2026-06-24 09:15:00',
          updatedAt: '2026-06-24 09:15:00',
          assignee: '待分配',
          site: '北京数据中心',
          description: '部分 UE 注册失败，AUSF 返回鉴权错误',
          rootCauses: [
            {
              id: '1',
              description: 'AUSF 鉴权向量获取失败',
              confidence: 92,
              evidence: [
                'AUSF 日志: 5G-AV 获取失败',
                'N12 接口返回 401 Unauthorized',
                'UDM/ARPF 接口超时',
              ],
            },
          ],
          recommendations: [
            {
              id: '1',
              action: '检查 AUSF 与 UDM/ARPF 的 N35 接口连通性',
              priority: 'high',
              category: 'check',
            },
            {
              id: '2',
              action: '验证 HSS 鉴权向量生成配置',
              priority: 'high',
              category: 'config',
            },
          ],
          timeline: [
            {
              id: '1',
              timestamp: '2026-06-24 09:15:00',
              user: '系统',
              action: '工单创建',
              detail: '自动告警触发',
            },
          ],
        },
        {
          id: 'INC-20260623-003',
          title: '专用承载建立失败',
          status: 'resolved',
          severity: 'minor',
          impactService: 'QoS Flow',
          impactElements: ['SMF', 'UPF'],
          createdAt: '2026-06-23 14:20:00',
          updatedAt: '2026-06-23 16:45:00',
          assignee: '李工',
          site: '广州数据中心',
          description: '专用承载建立失败，UPF 资源不足',
          rootCauses: [
            {
              id: '1',
              description: 'UPF 资源配额耗尽',
              confidence: 95,
              evidence: [
                'UPF 日志: 资源不足',
                'PFCP Session Establishment Response 返回拒绝',
                'QER 配置超出限制',
              ],
            },
          ],
          recommendations: [
            {
              id: '1',
              action: '增加 UPF 资源配额',
              priority: 'high',
              category: 'config',
            },
            {
              id: '2',
              action: '优化 QoS Flow 配置',
              priority: 'medium',
              category: 'config',
            },
          ],
          timeline: [
            {
              id: '1',
              timestamp: '2026-06-23 14:20:00',
              user: '系统',
              action: '工单创建',
            },
            {
              id: '2',
              timestamp: '2026-06-23 16:45:00',
              user: '李工',
              action: '问题解决',
              detail: '已增加 UPF 资源配额，承载建立恢复正常',
            },
          ],
        },
      ];

      setIncidents(mockIncidents);
      if (mockIncidents.length > 0) {
        setSelectedIncident(mockIncidents[0]);
      }
    } catch (error) {
      console.error('Failed to fetch incidents:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const filteredIncidents = incidents.filter((inc) => {
    const matchesSearch =
      inc.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.impactService.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: Incident['status']) => {
    switch (status) {
      case 'open': return <Clock className="w-4 h-4 text-gray-400" />;
      case 'investigating': return <Play className="w-4 h-4 text-blue-400" />;
      case 'resolved': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'closed': return <Pause className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusLabel = (status: Incident['status']) => {
    switch (status) {
      case 'open': return '待处理';
      case 'investigating': return '处理中';
      case 'resolved': return '已解决';
      case 'closed': return '已关闭';
    }
  };

  const getStatusColor = (status: Incident['status']) => {
    switch (status) {
      case 'open': return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      case 'investigating': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'resolved': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'closed': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getSeverityColor = (severity: Incident['severity']) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'major': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'minor': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-red-400';
    if (confidence >= 60) return 'text-amber-400';
    return 'text-blue-400';
  };

  const getPriorityColor = (priority: RecommendedAction['priority']) => {
    switch (priority) {
      case 'high': return 'bg-red-500/10 text-red-400';
      case 'medium': return 'bg-amber-500/10 text-amber-400';
      case 'low': return 'bg-blue-500/10 text-blue-400';
    }
  };

  const getCategoryIcon = (category: RecommendedAction['category']) => {
    switch (category) {
      case 'check': return <Search className="w-4 h-4" />;
      case 'config': return <Wrench className="w-4 h-4" />;
      case 'capture': return <Activity className="w-4 h-4" />;
      case 'restart': return <RefreshCw className="w-4 h-4" />;
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
      <div>
        <h1 className="text-2xl font-bold text-noc-text">故障处置</h1>
        <p className="text-sm text-noc-muted mt-1">故障工单管理和根因分析</p>
      </div>

      <div className="flex gap-6">
        {/* Incident List */}
        <div className="w-80 flex-shrink-0">
          <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-noc-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
                <input
                  type="text"
                  placeholder="搜索工单..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
                />
              </div>
              <div className="flex gap-2 mt-3">
                {(['all', 'open', 'investigating', 'resolved'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      statusFilter === status
                        ? 'bg-noc-accent text-white'
                        : 'bg-noc-bg text-noc-muted hover:text-noc-text'
                    }`}
                  >
                    {status === 'all' ? '全部' : getStatusLabel(status)}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {filteredIncidents.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => setSelectedIncident(incident)}
                  className={`p-4 border-b border-noc-border cursor-pointer transition-colors ${
                    selectedIncident?.id === incident.id
                      ? 'bg-noc-accent/5 border-l-2 border-l-noc-accent'
                      : 'hover:bg-noc-bg/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-noc-muted">{incident.id}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(incident.status)}`}>
                      {getStatusIcon(incident.status)}
                      <span className="ml-1">{getStatusLabel(incident.status)}</span>
                    </span>
                  </div>
                  <h4 className="text-sm font-medium text-noc-text mb-1">{incident.title}</h4>
                  <div className="flex items-center gap-2 text-xs text-noc-muted">
                    <span className={`px-1.5 py-0.5 rounded border ${getSeverityColor(incident.severity)}`}>
                      {incident.severity === 'critical' ? '严重' : incident.severity === 'major' ? '主要' : '次要'}
                    </span>
                    <span>{incident.impactService}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Incident Detail */}
        {selectedIncident && (
          <div className="flex-1 space-y-6">
            {/* Incident Header */}
            <div className="bg-noc-surface border border-noc-border rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-mono font-bold text-noc-accent">{selectedIncident.id}</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(selectedIncident.status)}`}>
                      {getStatusLabel(selectedIncident.status)}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(selectedIncident.severity)}`}>
                      {selectedIncident.severity === 'critical' ? '严重' : selectedIncident.severity === 'major' ? '主要' : '次要'}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-noc-text">{selectedIncident.title}</h2>
                  <p className="text-sm text-noc-muted mt-2">{selectedIncident.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 text-noc-muted hover:text-noc-text transition-colors" title="复制">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-noc-muted hover:text-noc-text transition-colors" title="下载">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-noc-border">
                <div>
                  <div className="text-xs text-noc-muted mb-1">影响业务</div>
                  <div className="flex items-center gap-2 text-sm text-noc-text">
                    <Activity className="w-4 h-4 text-noc-accent" />
                    {selectedIncident.impactService}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-noc-muted mb-1">影响网元</div>
                  <div className="flex items-center gap-2 text-sm text-noc-text">
                    <Server className="w-4 h-4 text-noc-accent" />
                    {selectedIncident.impactElements.join(' / ')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-noc-muted mb-1">负责人</div>
                  <div className="flex items-center gap-2 text-sm text-noc-text">
                    <User className="w-4 h-4 text-noc-accent" />
                    {selectedIncident.assignee}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-noc-muted mb-1">站点</div>
                  <div className="flex items-center gap-2 text-sm text-noc-text">
                    <MapPin className="w-4 h-4 text-noc-accent" />
                    {selectedIncident.site}
                  </div>
                </div>
              </div>
            </div>

            {/* Root Cause Candidates */}
            <div className="bg-noc-surface border border-noc-border rounded-lg p-6">
              <h3 className="text-base font-semibold text-noc-text mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-noc-accent" />
                根因候选
              </h3>
              <div className="space-y-4">
                {selectedIncident.rootCauses.map((cause, index) => (
                  <div key={cause.id} className="border border-noc-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-4 p-4 bg-noc-bg">
                      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-noc-surface border border-noc-border rounded-full text-sm font-bold text-noc-text">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-noc-text">{cause.description}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-noc-muted" />
                        <span className={`text-sm font-bold ${getConfidenceColor(cause.confidence)}`}>
                          {cause.confidence}%
                        </span>
                        <span className="text-xs text-noc-muted">置信度</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="text-xs text-noc-muted font-medium">证据：</div>
                      {cause.evidence.map((evidence, evidenceIndex) => (
                        <div key={evidenceIndex} className="flex items-start gap-2 text-sm text-noc-text">
                          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-noc-bg rounded-full text-xs text-noc-muted">
                            {evidenceIndex + 1}
                          </span>
                          <span className="font-mono text-xs">{evidence}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommended Actions */}
            <div className="bg-noc-surface border border-noc-border rounded-lg p-6">
              <h3 className="text-base font-semibold text-noc-text mb-4 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-noc-accent" />
                建议操作
              </h3>
              <div className="space-y-3">
                {selectedIncident.recommendations.map((action) => (
                  <div key={action.id} className="flex items-center gap-4 p-3 bg-noc-bg rounded-lg">
                    <div className="flex-shrink-0">
                      {getCategoryIcon(action.category)}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-noc-text">{action.action}</div>
                    </div>
                    <div className="flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(action.priority)}`}>
                        {action.priority === 'high' ? '高' : action.priority === 'medium' ? '中' : '低'}
                      </span>
                    </div>
                    <button className="flex-shrink-0 px-3 py-1 text-xs text-noc-accent hover:bg-noc-accent/10 rounded transition-colors">
                      执行
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-noc-surface border border-noc-border rounded-lg p-6">
              <h3 className="text-base font-semibold text-noc-text mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-noc-accent" />
                处置时间线
              </h3>
              <div className="space-y-4">
                {selectedIncident.timeline.map((event, index) => (
                  <div key={event.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-noc-accent" />
                      {index < selectedIncident.timeline.length - 1 && (
                        <div className="w-0.5 flex-1 bg-noc-border" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-noc-muted">{event.timestamp}</span>
                        <span className="text-xs font-medium text-noc-text">{event.user}</span>
                      </div>
                      <div className="text-sm text-noc-text">{event.action}</div>
                      {event.detail && (
                        <div className="mt-1 text-xs text-noc-muted bg-noc-bg p-2 rounded">
                          {event.detail}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
