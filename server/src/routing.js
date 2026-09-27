/**
 * 路线计算：基于当前运营状态的加权 Dijkstra
 * - 距离：路段几何长度
 * - 人流：crowd 0..4，等级越高权重惩罚越大
 * - 封控：blocked 路段直接不可通行
 * - 关闭节点：不可借道（起终点除外，由接口层校验）
 */
const { buildGraph } = require('./graph');

const { nodes, edges } = buildGraph();
const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));

// 人流等级 -> 通行速度（米/分钟），越拥挤越慢
const SPEED_BY_CROWD = [82, 70, 54, 38, 26];

const MODES = [
  {
    id: 'balanced',
    label: '综合推荐',
    badge: '智能推荐',
    desc: '兼顾距离与人流的均衡路线',
    weight: (distance, crowd) => distance * (1 + 0.35 * crowd)
  },
  {
    id: 'comfort',
    label: '舒适少挤',
    badge: '人流更少',
    desc: '优先绕开拥挤路段，步行体验更舒适',
    weight: (distance, crowd) => distance * (1 + 0.85 * crowd)
  },
  {
    id: 'fastest',
    label: '距离最短',
    badge: '最短路',
    desc: '纯按距离计算的最短路线（可能较拥挤）',
    weight: (distance) => distance
  }
];

function buildAdjacency(state) {
  const adj = {};
  for (const n of nodes) adj[n.id] = [];
  for (const e of edges) {
    if (state.edgeState[e.key]?.blocked) continue;
    adj[e.a].push(e);
    adj[e.b].push(e);
  }
  return adj;
}

function dijkstra(start, goal, mode, state) {
  const closed = (id) =>
    id !== start && id !== goal && state.nodeState[id]?.open === false;

  if (closed(start) || closed(goal)) return null;

  const adj = buildAdjacency(state);
  const dist = {};
  const prev = {};
  const visited = new Set();
  for (const n of nodes) {
    dist[n.id] = Infinity;
    prev[n.id] = null;
  }
  dist[start] = 0;

  // 简单优先队列（节点规模 < 50，数组排序足够）
  const queue = [[0, start]];

  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, u] = queue.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === goal) break;

    for (const edge of adj[u]) {
      const v = edge.a === u ? edge.b : edge.a;
      if (closed(v) || visited.has(v)) continue;
      const crowd = state.edgeState[edge.key]?.crowd ?? edge.crowd;
      const w = mode.weight(edge.distance, crowd);
      const nd = d + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = { from: u, edge };
        queue.push([nd, v]);
      }
    }
  }

  if (!prev[goal] && start !== goal) return null;

  const edgePath = [];
  const nodePath = [goal];
  let cur = goal;
  while (cur !== start) {
    const step = prev[cur];
    if (!step) return null;
    edgePath.unshift(step.edge.key);
    nodePath.unshift(step.from);
    cur = step.from;
  }
  return { nodePath, edgePath };
}

function summarize(path, state) {
  const segments = path.edgePath.map((key) => {
    const edge = edges.find((e) => e.key === key);
    const from = nodeById[edge.a];
    const to = nodeById[edge.b];
    const crowd = state.edgeState[key]?.crowd ?? edge.crowd;
    return {
      key,
      from: from.id,
      to: to.id,
      distance: edge.distance,
      crowd,
      minutes: edge.distance / SPEED_BY_CROWD[crowd]
    };
  });

  const totalDistance = segments.reduce((s, x) => s + x.distance, 0);
  const totalMinutes = segments.reduce((s, x) => s + x.minutes, 0);
  const maxCrowd = segments.reduce((m, x) => Math.max(m, x.crowd), 0);
  const crowdedMeters = segments
    .filter((x) => x.crowd >= 3)
    .reduce((s, x) => s + x.distance, 0);
  const avgCrowd = segments.length
    ? segments.reduce((s, x) => s + x.crowd * x.distance, 0) / totalDistance
    : 0;

  return {
    nodePath: path.nodePath,
    edgePath: path.edgePath,
    segments,
    stats: {
      totalDistance,
      totalMinutes: Math.round(totalMinutes),
      avgCrowd: Math.round(avgCrowd * 10) / 10,
      maxCrowd,
      crowdedMeters
    }
  };
}

function computeRoutes(start, goal, state) {
  if (!nodeById[start] || !nodeById[goal]) {
    const err = new Error('起点或终点不存在');
    err.statusCode = 400;
    throw err;
  }
  if (start === goal) {
    const err = new Error('起点和终点不能相同');
    err.statusCode = 400;
    throw err;
  }
  const startOpen = state.nodeState[start]?.open !== false;
  const goalOpen = state.nodeState[goal]?.open !== false;
  if (!startOpen || !goalOpen) {
    const err = new Error(
      !startOpen && !goalOpen
        ? '起点和终点当前均处于关闭状态'
        : !startOpen
          ? `「${nodeById[start].name}」当前关闭，暂不可作为起点`
          : `「${nodeById[goal].name}」当前关闭，暂不可前往`
    );
    err.statusCode = 422;
    throw err;
  }

  const seen = new Set();
  const routes = [];
  for (const mode of MODES) {
    const path = dijkstra(start, goal, mode, state);
    if (!path) continue;
    const sig = path.nodePath.join('>');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const summary = summarize(path, state);
    let badge = mode.badge;
    if (mode.id === 'comfort' && summary.stats.maxCrowd <= 2) badge = '全程不拥挤';
    routes.push({
      mode: mode.id,
      label: mode.label,
      badge,
      desc: mode.desc,
      ...summary
    });
  }

  if (!routes.length) {
    const err = new Error('当前没有可达路线：沿途封控路段过多或关键节点关闭，可前往后台调整状态');
    err.statusCode = 422;
    throw err;
  }
  return routes;
}

module.exports = { computeRoutes, MODES };
