import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  MapPin,
  Server,
  Activity,
  Zap,
  CheckSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// 告警类型定义
type AlarmSeverity = 'critical' | 'major' | 'minor' | 'warning';
type AlarmStatus = 'active' | 'acknowledged' | 'investigating' | 'resolved' | 'closed';

interface Alarm {
  id: string;
  severity: AlarmSeverity;
  source: string;
  message: string;
  firstOccurred: string;
  lastOccurred: string;
  count: number;
  status: AlarmStatus;
  impactObject: string;
  site: string;
  assignee?: string;
  rootCause?: string;
  resolution?: string;
  relatedLogs: RelatedLog[];
  createdAt: string;
  updatedAt: string;
}

interface RelatedLog {
  id: string;
  timestamp: string;
  level: string;
  source: string;
  message: string;
}

// 告警统计
interface AlarmSummary {
  total: number;
  critical: number;
  major: number;
  minor: number;
  warning: number;
  active: number;
  acknowledged: number;
  investigating: number;
  resolved: number;
}

export default function AlarmCenter() {
  const navigate = useNavigate();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [summary, setSummary] = useState<AlarmSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAlarm, setSelectedAlarm] = useState<Alarm | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<AlarmSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AlarmStatus | 'all'>('all');

  // 获取告警数据
  const fetchAlarms = useCallback(async () => {
    setLoading(true);
    try {
      // 模拟数据 - 实际应该从 API 获取
      const mockAlarms: Alarm[] = [
        {
          id: 'ALM-001',
          severity: 'critical',
          source: 'amfd',
          message: 'AMF 进程停止运行',
          firstOccurred: '2026-06-26 10:30:00',
          lastOccurred: '2026-06-26 10:45:00',
          count: 156,
          status: 'active',
          impactObject: '5G 注册服务',
          site: '上海数据中心',
          assignee: '张工',
          rootCause: '内存溢出导致进程崩溃',
          resolution: '',
          relatedLogs: [
            {
              id: 'LOG-001',
              timestamp: '2026-06-26 10:30:00',
              level: 'ERROR',
              source: 'amfd',
              message: 'OOM Killed: process amfd exited with code 137',
            },
            {
              id: 'LOG-002',
              timestamp: '2026-06-26 10:29:55',
              level: 'WARN',
              source: 'amfd',
              message: 'Memory usage exceeded 90% threshold',
            },
          ],
          createdAt: '2026-06-26 10:30:00',
          updatedAt: '2026-06-26 10:45:00',
        },
        {
          id: 'ALM-002',
          severity: 'major',
          source: 'smfd',
          message: 'SMF CPU 使用率超过 90%',
          firstOccurred: '2026-06-26 09:15:00',
          lastOccurred: '2026-06-26 10:40:00',
          count: 89,
          status: 'investigating',
          impactObject: '5G 会话管理',
          site: '上海数据中心',
          assignee: '李工',
          rootCause: '大量并发会话请求导致 CPU 过载',
          resolution: '',
          relatedLogs: [
            {
              id: 'LOG-003',
              timestamp: '2026-06-26 10:40:00',
              level: 'WARN',
              source: 'smfd',
              message: 'CPU usage: 92.5%',
            },
          ],
          createdAt: '2026-06-26 09:15:00',
          updatedAt: '2026-06-26 10:40:00',
        },
        {
          id: 'ALM-003',
          severity: 'major',
          source: 'pcscfd',
          message: 'P-CSCF SIP 信令异常',
          firstOccurred: '2026-06-26 08:00:00',
          lastOccurred: '2026-06-26 10:35:00',
          count: 234,
          status: 'acknowledged',
          impactObject: 'VoLTE 呼叫服务',
          site: '上海数据中心',
          assignee: '王工',
          rootCause: 'SIP 消息队列积压',
          resolution: '',
          relatedLogs: [
            {
              id: 'LOG-004',
              timestamp: '2026-06-26 10:35:00',
              level: 'ERROR',
              source: 'pcscfd',
              message: 'SIP queue overflow: 1000 messages pending',
            },
          ],
          createdAt: '2026-06-26 08:00:00',
          updatedAt: '2026-06-26 10:35:00',
        },
        {
          id: 'ALM-004',
          severity: 'minor',
          source: 'hssd',
          message: 'HSS 响应延迟增加',
          firstOccurred: '2026-06-26 07:30:00',
          lastOccurred: '2026-06-26 10:00:00',
          count: 45,
          status: 'resolved',
          impactObject: '用户数据查询',
          site: '北京数据中心',
          assignee: '赵工',
          rootCause: '数据库连接池耗尽',
          resolution: '已增加连接池大小，响应时间恢复正常',
          relatedLogs: [
            {
              id: 'LOG-005',
              timestamp: '2026-06-26 10:00:00',
              level: 'INFO',
              source: 'hssd',
              message: 'Response time restored to normal: 50ms',
            },
          ],
          createdAt: '2026-06-26 07:30:00',
          updatedAt: '2026-06-26 10:00:00',
        },
        {
          id: 'ALM-005',
          severity: 'warning',
          source: 'upfd',
          message: 'UPF 丢包率轻微上升',
          firstOccurred: '2026-06-26 09:00:00',
          lastOccurred: '2026-06-26 10:20:00',
          count: 12,
          status: 'active',
          impactObject: '用户面数据传输',
          site: '广州数据中心',
          assignee: '',
          rootCause: '',
          resolution: '',
          relatedLogs: [],
          createdAt: '2026-06-26 09:00:00',
          updatedAt: '2026-06-26 10:20:00',
        },
      ];

      setAlarms(mockAlarms);

      // 计算统计
      const summary: AlarmSummary = {
        total: mockAlarms.length,
        critical: mockAlarms.filter((a) => a.severity === 'critical').length,
        major: mockAlarms.filter((a) => a.severity === 'major').length,
        minor: mockAlarms.filter((a) => a.severity === 'minor').length,
        warning: mockAlarms.filter((a) => a.severity === 'warning').length,
        active: mockAlarms.filter((a) => a.status === 'active').length,
        acknowledged: mockAlarms.filter((a) => a.status === 'acknowledged').length,
        investigating: mockAlarms.filter((a) => a.status === 'investigating').length,
        resolved: mockAlarms.filter((a) => a.status === 'resolved').length,
      };
      setSummary(summary);
    } catch (err) {
      console.error('Error fetching alarms:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlarms();
    const interval = setInterval(fetchAlarms, 30000);
    return () => clearInterval(interval);
  }, [fetchAlarms]);

  // 过滤告警
  const filteredAlarms = alarms.filter((alarm) => {
    const matchesSearch =
      alarm.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alarm.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alarm.impactObject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = severityFilter === 'all' || alarm.severity === severityFilter;
    const matchesStatus = statusFilter === 'all' || alarm.status === statusFilter;
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  // 获取严重级别配置
  const getSeverityConfig = (severity: AlarmSeverity) => {
    switch (severity) {
      case 'critical':
        return {
          color: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/20',
          icon: XCircle,
          label: '严重',
        };
      case 'major':
        return {
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/20',
          icon: AlertTriangle,
          label: '主要',
        };
      case 'minor':
        return {
          color: 'text-yellow-400',
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/20',
          icon: AlertTriangle,
          label: '次要',
        };
      case 'warning':
        return {
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/20',
          icon: Clock,
          label: '警告',
        };
    }
  };

  // 获取状态配置
  const getStatusConfig = (status: AlarmStatus) => {
    switch (status) {
      case 'active':
        return {
          color: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/20',
          icon: Zap,
          label: '活跃',
        };
      case 'acknowledged':
        return {
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/20',
          icon: CheckCircle,
          label: '已确认',
        };
      case 'investigating':
        return {
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/20',
          icon: Search,
          label: '调查中',
        };
      case 'resolved':
        return {
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/20',
          icon: CheckCircle,
          label: '已解决',
        };
      case 'closed':
        return {
          color: 'text-gray-400',
          bg: 'bg-gray-500/10',
          border: 'border-gray-500/20',
          icon: CheckSquare,
          label: '已关闭',
        };
    }
  };

  // 跳转到故障诊断
  const goToFaultDiagnosis = (alarm: Alarm) => {
    navigate('/fault-diagnosis', {
      state: {
        alarmId: alarm.id,
        source: alarm.source,
        message: alarm.message,
      },
    });
  };

  // 确认告警
  const acknowledgeAlarm = async (alarmId: string) => {
    // TODO: 调用 API
    setAlarms((prev) =>
      prev.map((a) =>
        a.id === alarmId
          ? { ...a, status: 'acknowledged' as AlarmStatus, updatedAt: new Date().toISOString() }
          : a
      )
    );
  };

  // 开始调查
  const investigateAlarm = async (alarmId: string) => {
    // TODO: 调用 API
    setAlarms((prev) =>
      prev.map((a) =>
        a.id === alarmId
          ? { ...a, status: 'investigating' as AlarmStatus, updatedAt: new Date().toISOString() }
          : a
      )
    );
  };

  // 解决告警
  const resolveAlarm = async (alarmId: string, resolution: string) => {
    // TODO: 调用 API
    setAlarms((prev) =>
      prev.map((a) =>
        a.id === alarmId
          ? {
              ...a,
              status: 'resolved' as AlarmStatus,
              resolution,
              updatedAt: new Date().toISOString(),
            }
          : a
      )
    );
  };

  if (loading && alarms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-noc-accent animate-spin mx-auto mb-4" />
          <p className="text-noc-muted">加载告警数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-noc-text">告警中心</h1>
          <p className="text-sm text-noc-muted mt-1">告警生命周期管理</p>
        </div>
        <button
          onClick={fetchAlarms}
          className="flex items-center gap-2 px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text hover:bg-noc-bg-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="text-sm text-noc-muted mb-1">总告警</div>
            <div className="text-2xl font-bold text-noc-text">{summary.total}</div>
          </div>
          <div className="bg-noc-surface border border-red-500/20 rounded-lg p-4">
            <div className="text-sm text-red-400 mb-1">严重</div>
            <div className="text-2xl font-bold text-red-400">{summary.critical}</div>
          </div>
          <div className="bg-noc-surface border border-amber-500/20 rounded-lg p-4">
            <div className="text-sm text-amber-400 mb-1">主要</div>
            <div className="text-2xl font-bold text-amber-400">{summary.major}</div>
          </div>
          <div className="bg-noc-surface border border-blue-500/20 rounded-lg p-4">
            <div className="text-sm text-blue-400 mb-1">活跃</div>
            <div className="text-2xl font-bold text-blue-400">{summary.active}</div>
          </div>
          <div className="bg-noc-surface border border-emerald-500/20 rounded-lg p-4">
            <div className="text-sm text-emerald-400 mb-1">已解决</div>
            <div className="text-2xl font-bold text-emerald-400">{summary.resolved}</div>
          </div>
        </div>
      )}

      {/* 过滤器 */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-noc-muted" />
          <input
            type="text"
            placeholder="搜索告警..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as AlarmSeverity | 'all')}
          className="px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text"
        >
          <option value="all">所有级别</option>
          <option value="critical">严重</option>
          <option value="major">主要</option>
          <option value="minor">次要</option>
          <option value="warning">警告</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AlarmStatus | 'all')}
          className="px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text"
        >
          <option value="all">所有状态</option>
          <option value="active">活跃</option>
          <option value="acknowledged">已确认</option>
          <option value="investigating">调查中</option>
          <option value="resolved">已解决</option>
        </select>
      </div>

      {/* 告警列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 告警列表 */}
        <div className="lg:col-span-2 space-y-4">
          {filteredAlarms.map((alarm) => {
            const severityConf = getSeverityConfig(alarm.severity);
            const statusConf = getStatusConfig(alarm.status);
            const SeverityIcon = severityConf.icon;
            const StatusIcon = statusConf.icon;

            return (
              <div
                key={alarm.id}
                onClick={() => setSelectedAlarm(alarm)}
                className={`bg-noc-surface border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedAlarm?.id === alarm.id
                    ? 'border-noc-accent shadow-lg'
                    : 'border-noc-border hover:border-noc-accent/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${severityConf.bg}`}>
                      <SeverityIcon className={`w-5 h-5 ${severityConf.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-mono text-noc-muted">{alarm.id}</span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusConf.bg} ${statusConf.color} ${statusConf.border}`}
                        >
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConf.label}
                        </span>
                      </div>
                      <h3 className="text-base font-medium text-noc-text">{alarm.message}</h3>
                      <div className="flex items-center gap-4 mt-2 text-xs text-noc-muted">
                        <span className="flex items-center gap-1">
                          <Server className="w-3 h-3" />
                          {alarm.source}
                        </span>
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {alarm.impactObject}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {alarm.site}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-noc-muted">
                      首次: {alarm.firstOccurred}
                    </div>
                    <div className="text-xs text-noc-muted mt-1">
                      最近: {alarm.lastOccurred}
                    </div>
                    <div className="text-xs text-noc-muted mt-1">
                      次数: {alarm.count}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredAlarms.length === 0 && (
            <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center">
              <Bell className="w-12 h-12 text-noc-muted mx-auto mb-4" />
              <p className="text-noc-muted">没有匹配的告警</p>
            </div>
          )}
        </div>

        {/* 告警详情 */}
        <div className="lg:col-span-1">
          {selectedAlarm ? (
            <div className="bg-noc-surface border border-noc-border rounded-lg p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-noc-text">告警详情</h3>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                    getSeverityConfig(selectedAlarm.severity).bg
                  } ${getSeverityConfig(selectedAlarm.severity).color} ${
                    getSeverityConfig(selectedAlarm.severity).border
                  }`}
                >
                  {getSeverityConfig(selectedAlarm.severity).label}
                </span>
              </div>

              <div className="space-y-4">
                {/* 基本信息 */}
                <div>
                  <div className="text-sm font-medium text-noc-muted mb-2">基本信息</div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-noc-muted">告警 ID</span>
                      <span className="text-noc-text font-mono">{selectedAlarm.id}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-noc-muted">来源</span>
                      <span className="text-noc-text">{selectedAlarm.source}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-noc-muted">影响对象</span>
                      <span className="text-noc-text">{selectedAlarm.impactObject}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-noc-muted">站点</span>
                      <span className="text-noc-text">{selectedAlarm.site}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-noc-muted">负责人</span>
                      <span className="text-noc-text">{selectedAlarm.assignee || '未分配'}</span>
                    </div>
                  </div>
                </div>

                {/* 时间信息 */}
                <div>
                  <div className="text-sm font-medium text-noc-muted mb-2">时间信息</div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-noc-muted">首次发生</span>
                      <span className="text-noc-text">{selectedAlarm.firstOccurred}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-noc-muted">最近发生</span>
                      <span className="text-noc-text">{selectedAlarm.lastOccurred}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-noc-muted">发生次数</span>
                      <span className="text-noc-text">{selectedAlarm.count}</span>
                    </div>
                  </div>
                </div>

                {/* 根因分析 */}
                {selectedAlarm.rootCause && (
                  <div>
                    <div className="text-sm font-medium text-noc-muted mb-2">根因分析</div>
                    <div className="p-3 bg-noc-bg rounded-lg">
                      <p className="text-sm text-noc-text">{selectedAlarm.rootCause}</p>
                    </div>
                  </div>
                )}

                {/* 解决方案 */}
                {selectedAlarm.resolution && (
                  <div>
                    <div className="text-sm font-medium text-noc-muted mb-2">解决方案</div>
                    <div className="p-3 bg-emerald-500/5 rounded-lg">
                      <p className="text-sm text-noc-text">{selectedAlarm.resolution}</p>
                    </div>
                  </div>
                )}

                {/* 关联日志 */}
                {selectedAlarm.relatedLogs.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-noc-muted mb-2">关联日志</div>
                    <div className="space-y-2">
                      {selectedAlarm.relatedLogs.map((log) => (
                        <div key={log.id} className="p-2 bg-noc-bg rounded text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-noc-muted">{log.timestamp}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                log.level === 'ERROR'
                                  ? 'bg-red-500/10 text-red-400'
                                  : log.level === 'WARN'
                                  ? 'bg-amber-500/10 text-amber-400'
                                  : 'bg-blue-500/10 text-blue-400'
                              }`}
                            >
                              {log.level}
                            </span>
                            <span className="text-noc-muted">{log.source}</span>
                          </div>
                          <p className="text-noc-text font-mono">{log.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="pt-4 border-t border-noc-border space-y-2">
                  {selectedAlarm.status === 'active' && (
                    <button
                      onClick={() => acknowledgeAlarm(selectedAlarm.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-sm hover:bg-amber-500/20 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      确认告警
                    </button>
                  )}
                  {(selectedAlarm.status === 'active' ||
                    selectedAlarm.status === 'acknowledged') && (
                    <button
                      onClick={() => investigateAlarm(selectedAlarm.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-sm hover:bg-blue-500/20 transition-colors"
                    >
                      <Search className="w-4 h-4" />
                      开始调查
                    </button>
                  )}
                  {selectedAlarm.status !== 'resolved' && selectedAlarm.status !== 'closed' && (
                    <button
                      onClick={() => goToFaultDiagnosis(selectedAlarm)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-noc-accent text-white rounded-lg text-sm hover:opacity-90 transition-opacity"
                    >
                      <Zap className="w-4 h-4" />
                      一键诊断
                    </button>
                  )}
                  {selectedAlarm.status === 'investigating' && (
                    <button
                      onClick={() => resolveAlarm(selectedAlarm.id, '手动解决')}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm hover:bg-emerald-500/20 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      标记解决
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-noc-surface border border-noc-border rounded-lg p-6 text-center">
              <Bell className="w-12 h-12 text-noc-muted mx-auto mb-4" />
              <p className="text-noc-muted">选择告警查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
