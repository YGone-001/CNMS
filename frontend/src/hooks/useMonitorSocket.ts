import { useCallback, useEffect, useRef, useState } from 'react';
import type { MonitorSnapshot, WsStatus } from '@/types/monitor';

// 初始重连间隔 1 秒，最大间隔 10 秒
const RECONNECT_INITIAL = 1000;
const RECONNECT_MAX = 10000;

// WebSocket 连接 Hook，支持指数退避重连
export function useMonitorSocket(): {
  status: WsStatus;
  snapshot: MonitorSnapshot | null;
} {
  const [status, setStatus] = useState<WsStatus>('DISCONNECTED');
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);

  // 使用 ref 避免闭包过期问题
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(RECONNECT_INITIAL);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // 构建 WebSocket URL，开发模式下由 Vite 代理转发
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/api/v1/monitor/ws`;

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
        const data: MonitorSnapshot = JSON.parse(e.data);
        setSnapshot(data);
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

  return { status, snapshot };
}
