import { useCallback, useEffect, useRef, useState } from 'react';
import type { SystemStatusEnhanced, MonitorSnapshot } from '@/types/monitor';

// 初始重连间隔 1 秒，最大间隔 10 秒
const RECONNECT_INITIAL = 1000;
const RECONNECT_MAX = 10000;

// 业务指标类型
interface BusinessMetricsData {
  epc_online_users: number;
  ims_online_users: number;
  total_subscribers: number;
  total_ims_users: number;
  active_calls: number;
  sip_reg_success_rate: number;
}

// WebSocket 消息类型
interface UnifiedWSMessage {
  type: 'deployment_status' | 'business_metrics' | 'process_status';
  data: SystemStatusEnhanced | BusinessMetricsData | MonitorSnapshot;
}

// 统一 WebSocket Hook
export function useUnifiedSocket(): {
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';
  deploymentStatus: SystemStatusEnhanced | null;
  businessMetrics: BusinessMetricsData | null;
  snapshot: MonitorSnapshot | null;
} {
  const [status, setStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'CONNECTING'>('DISCONNECTED');
  const [deploymentStatus, setDeploymentStatus] = useState<SystemStatusEnhanced | null>(null);
  const [businessMetrics, setBusinessMetrics] = useState<BusinessMetricsData | null>(null);
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(RECONNECT_INITIAL);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // 构建 WebSocket URL
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/api/v1/deployment/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    setStatus('CONNECTING');

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus('CONNECTED');
      delayRef.current = RECONNECT_INITIAL;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const msg: UnifiedWSMessage = JSON.parse(e.data);
        switch (msg.type) {
          case 'deployment_status':
            setDeploymentStatus(msg.data as SystemStatusEnhanced);
            break;
          case 'business_metrics':
            setBusinessMetrics(msg.data as BusinessMetricsData);
            break;
          case 'process_status':
            setSnapshot(msg.data as MonitorSnapshot);
            break;
        }
      } catch {
        // 忽略解析错误
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('DISCONNECTED');
      // 指数退避重连
      const delay = delayRef.current;
      delayRef.current = Math.min(delayRef.current * 2, RECONNECT_MAX);
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { status, deploymentStatus, businessMetrics, snapshot };
}
