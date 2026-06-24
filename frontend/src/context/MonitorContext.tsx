import React, { createContext, useContext, useMemo } from 'react';
import { useMonitorSocket } from '@/hooks/useMonitorSocket';
import type { MonitorSnapshot, WsStatus } from '@/types/monitor';

// Context 值类型
interface MonitorContextValue {
  status: WsStatus;
  snapshot: MonitorSnapshot | null;
  onlineCount: number;
  offlineCount: number;
  totalCpu: number;
  totalMemoryRss: number;
}

const MonitorContext = createContext<MonitorContextValue | null>(null);

// Provider 组件，挂载 WebSocket 并计算派生统计值
export function MonitorProvider({ children }: { children: React.ReactNode }) {
  const { status, snapshot } = useMonitorSocket();

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
      status,
      snapshot,
      ...derived,
    }),
    [status, snapshot, derived],
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
