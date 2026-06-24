import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/App';
import { AlertTriangle, TrendingUp, TrendingDown, Brain, Activity, Clock, RefreshCw } from 'lucide-react';

interface AnomalyEvent {
  _id: string;
  nf_name: string;
  metric: string;
  value: number;
  baseline: number;
  z_score: number;
  severity: string;
  detected_at: string;
  resolved_at?: string;
}

interface RootCauseAnalysis {
  _id: string;
  root_alarm_id: string;
  root_source: string;
  related_alarms: string[];
  nf_chain: string[];
  confidence: number;
  analysis: string;
  analyzed_at: string;
}

interface CapacityPrediction {
  _id: string;
  nf_name: string;
  metric: string;
  current_value: number;
  predicted_value: number;
  threshold: number;
  exhaustion_eta?: string;
  slope: number;
  r_squared: number;
  predicted_at: string;
}

interface TrendAlert {
  _id: string;
  nf_name: string;
  metric: string;
  direction: string;
  change_rate: number;
  short_ma: number;
  long_ma: number;
  severity: string;
  detected_at: string;
}

interface AIOpsSummary {
  anomaly_count: number;
  critical_anomalies: number;
  major_anomalies: number;
  trend_alert_count: number;
  prediction_count: number;
  root_cause_count: number;
}

type TabType = 'anomalies' | 'root-causes' | 'predictions' | 'trends';

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  major: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  minor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  warning: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export default function AIOps() {
  const [activeTab, setActiveTab] = useState<TabType>('anomalies');
  const [summary, setSummary] = useState<AIOpsSummary | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);
  const [rootCauses, setRootCauses] = useState<RootCauseAnalysis[]>([]);
  const [predictions, setPredictions] = useState<CapacityPrediction[]>([]);
  const [trends, setTrends] = useState<TrendAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/aiops/summary');
      const data = await res.json();
      if (data.status === 'ok') {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to fetch AIOps summary:', err);
    }
  }, []);

  const fetchData = useCallback(async (tab: TabType) => {
    setLoading(true);
    try {
      let url = '';
      switch (tab) {
        case 'anomalies':
          url = '/api/v1/aiops/anomalies?active=true';
          break;
        case 'root-causes':
          url = '/api/v1/aiops/root-causes';
          break;
        case 'predictions':
          url = '/api/v1/aiops/predictions';
          break;
        case 'trends':
          url = '/api/v1/aiops/trends';
          break;
      }

      const res = await authFetch(url);
      const data = await res.json();
      if (data.status === 'ok') {
        switch (tab) {
          case 'anomalies':
            setAnomalies(data.data || []);
            break;
          case 'root-causes':
            setRootCauses(data.data || []);
            break;
          case 'predictions':
            setPredictions(data.data || []);
            break;
          case 'trends':
            setTrends(data.data || []);
            break;
        }
      }
    } catch (err) {
      console.error(`Failed to fetch ${tab}:`, err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab, fetchData]);

  const handleRefresh = () => {
    fetchSummary();
    fetchData(activeTab);
  };

  const tabs = [
    { id: 'anomalies' as TabType, label: '异常检测', icon: AlertTriangle },
    { id: 'root-causes' as TabType, label: '根因分析', icon: Brain },
    { id: 'predictions' as TabType, label: '容量预测', icon: Activity },
    { id: 'trends' as TabType, label: '趋势预警', icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-noc-text">AIOps 智能运维</h1>
          <p className="text-noc-muted text-sm mt-1">异常检测、根因分析、容量预测、趋势预警</p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-noc-surface border border-noc-border rounded-md text-noc-text hover:bg-noc-bg-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 概览卡片 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-noc-text">{summary.anomaly_count}</p>
                <p className="text-xs text-noc-muted">活跃异常</p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded">
                严重: {summary.critical_anomalies}
              </span>
              <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded">
                重要: {summary.major_anomalies}
              </span>
            </div>
          </div>

          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-noc-text">{summary.trend_alert_count}</p>
                <p className="text-xs text-noc-muted">趋势预警 (24h)</p>
              </div>
            </div>
          </div>

          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-noc-text">{summary.prediction_count}</p>
                <p className="text-xs text-noc-muted">容量预测</p>
              </div>
            </div>
          </div>

          <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-noc-text">{summary.root_cause_count}</p>
                <p className="text-xs text-noc-muted">根因分析 (7d)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 导航 */}
      <div className="border-b border-noc-border">
        <nav className="flex gap-4">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'border-noc-accent text-noc-accent'
                  : 'border-transparent text-noc-muted hover:text-noc-text'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab 内容 */}
      <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-noc-muted">加载中...</div>
        ) : (
          <>
            {/* 异常检测 */}
            {activeTab === 'anomalies' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-noc-border bg-noc-bg-50">
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">NF</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">指标</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">当前值</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">基线</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">Z-Score</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">严重程度</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">检测时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-noc-muted">
                          暂无活跃异常
                        </td>
                      </tr>
                    ) : (
                      anomalies.map((a) => (
                        <tr key={a._id} className="border-b border-noc-border hover:bg-noc-bg-50">
                          <td className="px-4 py-3 font-medium text-noc-text">{a.nf_name}</td>
                          <td className="px-4 py-3 text-noc-text">{a.metric}</td>
                          <td className="px-4 py-3 text-noc-text">{a.value.toFixed(2)}%</td>
                          <td className="px-4 py-3 text-noc-muted">{a.baseline.toFixed(2)}%</td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-noc-accent">{a.z_score.toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs border ${severityColors[a.severity] || 'bg-gray-500/20 text-gray-400'}`}>
                              {a.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-noc-muted text-xs">
                            {new Date(a.detected_at).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 根因分析 */}
            {activeTab === 'root-causes' && (
              <div className="divide-y divide-noc-border">
                {rootCauses.length === 0 ? (
                  <div className="p-8 text-center text-noc-muted">暂无根因分析数据</div>
                ) : (
                  rootCauses.map((rca) => (
                    <div key={rca._id} className="p-4 hover:bg-noc-bg-50">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-noc-text">根因: {rca.root_source}</span>
                            <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                              置信度: {(rca.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-sm text-noc-muted mt-1">{rca.analysis}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-noc-muted">影响链:</span>
                            {rca.nf_chain.map((nf, i) => (
                              <span key={nf}>
                                <span className="text-xs px-2 py-0.5 bg-noc-bg border border-noc-border rounded text-noc-text">
                                  {nf}
                                </span>
                                {i < rca.nf_chain.length - 1 && (
                                  <span className="text-noc-muted mx-1">→</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className="text-xs text-noc-muted">
                          {new Date(rca.analyzed_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 容量预测 */}
            {activeTab === 'predictions' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-noc-border bg-noc-bg-50">
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">NF</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">指标</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">当前值</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">24h 预测</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">趋势斜率</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">R²</th>
                      <th className="px-4 py-3 text-left text-noc-muted font-medium">预计耗尽</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-noc-muted">
                          暂无容量预测数据
                        </td>
                      </tr>
                    ) : (
                      predictions.map((p) => (
                        <tr key={p._id} className="border-b border-noc-border hover:bg-noc-bg-50">
                          <td className="px-4 py-3 font-medium text-noc-text">{p.nf_name}</td>
                          <td className="px-4 py-3 text-noc-text">{p.metric}</td>
                          <td className="px-4 py-3 text-noc-text">{p.current_value.toFixed(1)}%</td>
                          <td className="px-4 py-3">
                            <span className={p.predicted_value > p.threshold ? 'text-red-400' : 'text-green-400'}>
                              {p.predicted_value.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`flex items-center gap-1 ${p.slope > 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {p.slope > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {p.slope > 0 ? '+' : ''}{(p.slope * 24).toFixed(2)}%/天
                            </span>
                          </td>
                          <td className="px-4 py-3 text-noc-muted">{p.r_squared.toFixed(3)}</td>
                          <td className="px-4 py-3">
                            {p.exhaustion_eta ? (
                              <span className="flex items-center gap-1 text-orange-400">
                                <Clock className="w-3 h-3" />
                                {new Date(p.exhaustion_eta).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-noc-muted">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 趋势预警 */}
            {activeTab === 'trends' && (
              <div className="divide-y divide-noc-border">
                {trends.length === 0 ? (
                  <div className="p-8 text-center text-noc-muted">暂无趋势预警</div>
                ) : (
                  trends.map((t) => (
                    <div key={t._id} className="p-4 hover:bg-noc-bg-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${t.direction === 'rising' ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                            {t.direction === 'rising' ? (
                              <TrendingUp className="w-5 h-5 text-red-400" />
                            ) : (
                              <TrendingDown className="w-5 h-5 text-green-400" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-noc-text">{t.nf_name}</span>
                              <span className="text-noc-muted">-</span>
                              <span className="text-noc-text">{t.metric}</span>
                              <span className={`px-2 py-0.5 rounded text-xs border ${severityColors[t.severity] || ''}`}>
                                {t.severity}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-noc-muted">
                              <span>变化率: <span className={t.change_rate > 0 ? 'text-red-400' : 'text-green-400'}>{t.change_rate > 0 ? '+' : ''}{t.change_rate.toFixed(1)}%/时</span></span>
                              <span>短期 MA: {t.short_ma.toFixed(1)}%</span>
                              <span>长期 MA: {t.long_ma.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-noc-muted">
                          {new Date(t.detected_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
