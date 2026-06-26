import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Wifi,
  Signal,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Activity,
  Globe,
  Smartphone,
} from 'lucide-react';
import { authFetch } from '@/App';

// UE 信息类型
interface UEInfo {
  supi: string;
  domain: string;
  rat: string;
  cm_state: string;
  mm_state: string;
  enb?: {
    enb_id: number;
    cell_id: number;
    status: string;
  };
  location?: {
    tai: {
      plmn: string;
      tac: number;
    };
    timestamp: number;
  };
  ambr?: {
    downlink: number;
    uplink: number;
  };
  pdn?: PDNInfo[];
  pdn_count: number;
}

interface PDNInfo {
  apn: string;
  qos_flows?: { ebi: number; qci: number }[];
  ipv4?: string;
  ipv6?: string;
  pdu_state: string;
  ebi: number;
  qci: number;
}

interface UEInfoResponse {
  items: UEInfo[];
  pager: {
    page: number;
    page_size: number;
    count: number;
  };
}

export default function UEInfoPage() {
  const [ueInfo, setUEInfo] = useState<UEInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedUE, setExpandedUE] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 获取 UE 信息
  const fetchUEInfo = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authFetch('/api/v1/ue-info');
      const data = await response.json();
      if (data.status === 'ok') {
        setUEInfo(data.data);
      }
    } catch (err) {
      console.error('Error fetching UE info:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUEInfo();

    // 自动刷新
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchUEInfo, 5000); // 每 5 秒刷新
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [fetchUEInfo, autoRefresh]);

  // 格式化带宽
  const formatBandwidth = (bps: number) => {
    if (bps >= 1000000000) {
      return `${(bps / 1000000000).toFixed(1)} Gbps`;
    } else if (bps >= 1000000) {
      return `${(bps / 1000000).toFixed(1)} Mbps`;
    } else if (bps >= 1000) {
      return `${(bps / 1000).toFixed(1)} Kbps`;
    }
    return `${bps} bps`;
  };

  // 格式化时间戳
  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp / 1000).toLocaleString();
  };

  // 获取状态颜色
  const getStateColor = (state: string) => {
    switch (state) {
      case 'registered':
        return 'text-emerald-400';
      case 'idle':
        return 'text-amber-400';
      case 'connected':
        return 'text-blue-400';
      case 'active':
        return 'text-emerald-400';
      default:
        return 'text-gray-400';
    }
  };

  // 获取 RAT 图标
  const getRATIcon = (rat: string) => {
    switch (rat) {
      case 'E-UTRA':
        return <Signal className="w-4 h-4 text-blue-400" />;
      case 'NR':
        return <Wifi className="w-4 h-4 text-emerald-400" />;
      default:
        return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  // 统计信息
  const stats = {
    total: ueInfo?.pager.count ?? 0,
    registered: ueInfo?.items.filter((ue) => ue.mm_state === 'registered').length ?? 0,
    idle: ueInfo?.items.filter((ue) => ue.cm_state === 'idle').length ?? 0,
    connected: ueInfo?.items.filter((ue) => ue.cm_state === 'connected').length ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-noc-text">UE 信息</h1>
          <p className="text-sm text-noc-muted mt-1">实时查看用户设备注册状态</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-noc-text">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-noc-border"
            />
            自动刷新 (5s)
          </label>
          <button
            onClick={fetchUEInfo}
            className="flex items-center gap-2 px-4 py-2 bg-noc-surface border border-noc-border rounded-lg text-sm text-noc-text hover:bg-noc-bg-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">总 UE 数</p>
              <p className="text-2xl font-bold text-noc-text">{stats.total}</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Users className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">已注册</p>
              <p className="text-2xl font-bold text-emerald-400">{stats.registered}</p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-lg">
              <Smartphone className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
        </div>
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">空闲状态</p>
              <p className="text-2xl font-bold text-amber-400">{stats.idle}</p>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-lg">
              <Activity className="w-6 h-6 text-amber-400" />
            </div>
          </div>
        </div>
        <div className="bg-noc-surface border border-noc-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-noc-muted">已连接</p>
              <p className="text-2xl font-bold text-blue-400">{stats.connected}</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Wifi className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>
      </div>

      {/* UE 列表 */}
      <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-noc-border">
          <h2 className="text-lg font-semibold text-noc-text">UE 列表</h2>
        </div>
        <div className="divide-y divide-noc-border">
          {ueInfo?.items.map((ue) => (
            <div key={ue.supi} className="hover:bg-noc-bg-50 transition-colors">
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setExpandedUE(expandedUE === ue.supi ? null : ue.supi)}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-noc-bg rounded-lg">
                    {getRATIcon(ue.rat)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium text-noc-text">
                        {ue.supi}
                      </span>
                      <span className={`text-xs ${getStateColor(ue.mm_state)}`}>
                        {ue.mm_state}
                      </span>
                      <span className={`text-xs ${getStateColor(ue.cm_state)}`}>
                        {ue.cm_state}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-noc-muted">
                      <span>{ue.domain}</span>
                      <span>{ue.rat}</span>
                      {ue.enb && <span>eNB: {ue.enb.enb_id}</span>}
                      {ue.location && <span>TAC: {ue.location.tai.tac}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-noc-muted">
                    {ue.pdn_count} 会话
                  </span>
                  {expandedUE === ue.supi ? (
                    <ChevronDown className="w-4 h-4 text-noc-muted" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-noc-muted" />
                  )}
                </div>
              </div>

              {/* 展开的详情 */}
              {expandedUE === ue.supi && (
                <div className="px-4 pb-4 bg-noc-bg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* 基本信息 */}
                    <div className="p-4 bg-noc-surface rounded-lg">
                      <h3 className="text-sm font-medium text-noc-muted mb-3">基本信息</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-noc-muted">SUPI</span>
                          <span className="text-noc-text font-mono">{ue.supi}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-noc-muted">Domain</span>
                          <span className="text-noc-text">{ue.domain}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-noc-muted">RAT</span>
                          <span className="text-noc-text">{ue.rat}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-noc-muted">CM State</span>
                          <span className={getStateColor(ue.cm_state)}>{ue.cm_state}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-noc-muted">MM State</span>
                          <span className={getStateColor(ue.mm_state)}>{ue.mm_state}</span>
                        </div>
                      </div>
                    </div>

                    {/* 带宽信息 */}
                    {ue.ambr && (
                      <div className="p-4 bg-noc-surface rounded-lg">
                        <h3 className="text-sm font-medium text-noc-muted mb-3">带宽限制</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-noc-muted">下行</span>
                            <span className="text-noc-text">{formatBandwidth(ue.ambr.downlink)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-noc-muted">上行</span>
                            <span className="text-noc-text">{formatBandwidth(ue.ambr.uplink)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 基站信息 */}
                    {ue.enb && (
                      <div className="p-4 bg-noc-surface rounded-lg">
                        <h3 className="text-sm font-medium text-noc-muted mb-3">基站信息</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-noc-muted">eNB ID</span>
                            <span className="text-noc-text">{ue.enb.enb_id}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-noc-muted">Cell ID</span>
                            <span className="text-noc-text">{ue.enb.cell_id}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-noc-muted">Status</span>
                            <span className={getStateColor(ue.enb.status)}>{ue.enb.status}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 位置信息 */}
                    {ue.location && (
                      <div className="p-4 bg-noc-surface rounded-lg">
                        <h3 className="text-sm font-medium text-noc-muted mb-3">位置信息</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-noc-muted">PLMN</span>
                            <span className="text-noc-text">{ue.location.tai.plmn}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-noc-muted">TAC</span>
                            <span className="text-noc-text">{ue.location.tai.tac}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-noc-muted">Timestamp</span>
                            <span className="text-noc-text">{formatTimestamp(ue.location.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* PDN 会话信息 */}
                  {ue.pdn && ue.pdn.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium text-noc-muted mb-3">PDN 会话</h3>
                      <div className="space-y-2">
                        {ue.pdn.map((pdn, index) => (
                          <div key={index} className="p-3 bg-noc-surface rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4 text-noc-accent" />
                                <span className="text-sm font-medium text-noc-text">{pdn.apn}</span>
                              </div>
                              <span className={`text-xs ${getStateColor(pdn.pdu_state)}`}>
                                {pdn.pdu_state}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              {pdn.ipv4 && (
                                <div>
                                  <span className="text-noc-muted">IPv4: </span>
                                  <span className="text-noc-text font-mono">{pdn.ipv4}</span>
                                </div>
                              )}
                              {pdn.ipv6 && (
                                <div>
                                  <span className="text-noc-muted">IPv6: </span>
                                  <span className="text-noc-text font-mono">{pdn.ipv6}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-noc-muted">EBI: </span>
                                <span className="text-noc-text">{pdn.ebi}</span>
                              </div>
                              <div>
                                <span className="text-noc-muted">QCI: </span>
                                <span className="text-noc-text">{pdn.qci}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {(!ueInfo || ueInfo.items.length === 0) && (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 text-noc-muted mx-auto mb-4" />
              <p className="text-noc-muted">暂无 UE 信息</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
