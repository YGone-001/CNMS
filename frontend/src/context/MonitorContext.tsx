import React, { createContext, useContext, useMemo } from 'react';
import { useUnifiedSocket } from '@/hooks/useUnifiedSocket';
import type { MonitorSnapshot, WsStatus, SystemStatusEnhanced } from '@/types/monitor';

// 业务指标类型
interface BusinessMetricsData {
  epc_online_users: number;
  ims_online_users: number;
  total_subscribers: number;
  total_ims_users: number;
}

// Context 值类型
interface MonitorContextValue {
  // WebSocket 状态
  wsStatus: WsStatus;

  // 进程状态（兼容旧接口）
  snapshot: MonitorSnapshot | null;
  onlineCount: number;
  offlineCount: number;
  totalCpu: number;
  totalMemoryRss: number;

  // 部署状态
  deploymentStatus: SystemStatusEnhanced | null;

  // 业务指标
  businessMetrics: BusinessMetricsData | null;
}

const MonitorContext = createContext<MonitorContextValue | null>(null);

// Provider 组件，挂载统一 WebSocket 并计算派生统计值
export function MonitorProvider({ children }: { children: React.ReactNode }) {
  const {
    status: wsStatus,
    deploymentStatus,
    businessMetrics,
    snapshot,
  } = useUnifiedSocket();

  const derived = useMemo(() => {
    if (!snapshot || !snapshot.processes) {
      return { onlineCount: 0, offlineCount: 0, totalCpu: 0, totalMemoryRss: 0 };
    }

    let onlineCount = 0;
    let offlineCount = 0;
    let totalCpu = 0;
    let totalMemoryRss = 0;

    for (const p of snapshot.processes) {
      if (p.running) {
        onlineCount++;
        totalCpu += p.cpu_percent;
        totalMemoryRss += p.memory_rss;
      } else {
        offlineCount++;
      }
    }

    return { onlineCount, offlineCount, totalCpu, totalMemoryRss };
  }, [snapshot]);

  const value: MonitorContextValue = useMemo(
    () => ({
      wsStatus,
      snapshot,
      deploymentStatus,
      businessMetrics,
      ...derived,
    }),
    [wsStatus, snapshot, deploymentStatus, businessMetrics, derived],
  );

  return <MonitorContext.Provider value={value}>{children}</MonitorContext.Provider>;
}

// 消费 Context 的 Hook
export function useMonitor(): MonitorContextValue {
  const ctx = useContext(MonitorContext);
  if (!ctx) {
    throw new Error('useMonitor must be used within a MonitorProvider');
  }
  return ctx;
}
