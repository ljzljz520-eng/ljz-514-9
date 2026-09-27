import type { GraphSnapshot, RoutesResponse } from './types';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  fetchGraph: () => fetch('/api/graph').then((r) => jsonOrThrow<GraphSnapshot>(r)),
  fetchRoutes: (start: string, goal: string) =>
    fetch('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, goal })
    }).then((r) => jsonOrThrow<RoutesResponse>(r)),
  setNodeOpen: (id: string, open: boolean) =>
    fetch(`/api/admin/nodes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open })
    }).then((r) => jsonOrThrow<{ ok: boolean }>(r)),
  setEdge: (key: string, patch: { blocked?: boolean; crowd?: number }) =>
    fetch(`/api/admin/edges/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).then((r) => jsonOrThrow<{ ok: boolean }>(r)),
  reset: () =>
    fetch('/api/admin/reset', { method: 'POST' }).then((r) =>
      jsonOrThrow<{ ok: boolean; snapshot: GraphSnapshot }>(r)
    )
};
