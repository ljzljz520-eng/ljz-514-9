import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { GraphSnapshot } from './types';

interface GraphState {
  graph: GraphSnapshot | null;
  loading: boolean;
  error: string | null;
  /** 递增版本号，每次状态变化 +1，供调用方触发路线重算 */
  version: number;
  reload: () => Promise<void>;
}

export function useGraph(): GraphState {
  const [graph, setGraph] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const reload = useCallback(async () => {
    try {
      const snap = await api.fetchGraph();
      setGraph(snap);
      setError(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // SSE：后台更新节点 / 路段后，自动刷新快照并重算路线
    const es = new EventSource('/api/events');
    esRef.current = es;
    es.addEventListener('state-change', () => {
      void reload();
    });
    es.onerror = () => {
      // 浏览器会自动重连；此处不打断用户
    };
    return () => es.close();
  }, [reload]);

  return { graph, loading, error, version, reload };
}
