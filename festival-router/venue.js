/**
 * 音乐节场地数据模型 + 路径规划引擎
 * - 节点: 舞台 / 餐饮 / 洗手间 / 出口 / 入口 / 路口
 * - 边(路段): 距离(米)、拥挤度 0-3、是否封控
 * - 规划: Dijkstra, 权重 = 距离 × 拥挤惩罚系数, 封控路段与关闭节点剔除
 */

// ---------- 节点定义 (坐标为简化场地图画布坐标, 800x620) ----------
const NODES = [
  { id: 'entrance',    name: '主入口',   type: 'entrance', x: 400, y: 565 },
  { id: 'main_stage',  name: '主舞台',   type: 'stage',    x: 400, y: 70  },
  { id: 'edm_stage',   name: '电子舞台', type: 'stage',    x: 110, y: 140 },
  { id: 'folk_stage',  name: '民谣舞台', type: 'stage',    x: 690, y: 140 },
  { id: 'bbq',         name: '烧烤营地', type: 'food',     x: 95,  y: 300 },
  { id: 'food_street', name: '小吃街',   type: 'food',     x: 400, y: 425 },
  { id: 'drinks',      name: '饮品站',   type: 'food',     x: 705, y: 300 },
  { id: 'wc_a',        name: '洗手间A',  type: 'restroom', x: 140, y: 440 },
  { id: 'wc_b',        name: '洗手间B',  type: 'restroom', x: 660, y: 440 },
  { id: 'exit_west',   name: '西出口',   type: 'exit',     x: 55,  y: 530 },
  { id: 'exit_east',   name: '东出口',   type: 'exit',     x: 745, y: 530 },
  // 路口(纯通行节点)
  { id: 'j_nw', name: '西北路口', type: 'junction', x: 250, y: 195 },
  { id: 'j_ne', name: '东北路口', type: 'junction', x: 550, y: 195 },
  { id: 'j_w',  name: '西侧路口', type: 'junction', x: 250, y: 350 },
  { id: 'j_e',  name: '东侧路口', type: 'junction', x: 550, y: 350 },
  { id: 'j_sw', name: '西南路口', type: 'junction', x: 250, y: 490 },
  { id: 'j_se', name: '东南路口', type: 'junction', x: 550, y: 490 },
  { id: 'plaza', name: '中心广场', type: 'junction', x: 400, y: 275 },
];

// ---------- 路段定义 (无向) ----------
const EDGE_PAIRS = [
  ['entrance', 'j_sw'], ['entrance', 'j_se'], ['entrance', 'food_street'],
  ['j_sw', 'wc_a'], ['j_sw', 'exit_west'], ['j_sw', 'j_w'],
  ['j_se', 'wc_b'], ['j_se', 'exit_east'], ['j_se', 'j_e'],
  ['wc_a', 'j_w'], ['wc_b', 'j_e'],
  ['food_street', 'j_w'], ['food_street', 'j_e'], ['food_street', 'plaza'],
  ['j_w', 'bbq'], ['j_w', 'j_nw'],
  ['j_e', 'drinks'], ['j_e', 'j_ne'],
  ['bbq', 'j_nw'], ['drinks', 'j_ne'],
  ['plaza', 'j_nw'], ['plaza', 'j_ne'],
  ['j_nw', 'edm_stage'], ['j_nw', 'main_stage'],
  ['j_ne', 'folk_stage'], ['j_ne', 'main_stage'],
];

const nodeById = Object.fromEntries(NODES.map(n => [n.id, n]));
const dist = (a, b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 1.5); // 画布坐标→米

const EDGES = EDGE_PAIRS.map(([a, b], i) => ({
  id: 'e' + i, a, b, distance: dist(nodeById[a], nodeById[b]),
}));

// ---------- 初始状态 (后台可改, 持久化到 data/venue-state.json) ----------
const DEFAULT_STATE = {
  nodes: Object.fromEntries(NODES.map(n => [n.id, { open: true }])),
  edges: (() => {
    const s = {};
    EDGES.forEach(e => { s[e.id] = { closed: false, congestion: 0 }; });
    // 演示初始数据: 部分路段拥挤 / 一条封控
    const set = (a, b, patch) => {
      const e = EDGES.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
      Object.assign(s[e.id], patch);
    };
    set('entrance', 'food_street', { congestion: 2 }); // 中央大道拥挤
    set('food_street', 'plaza', { closed: true });     // 封控路段
    set('plaza', 'j_ne', { congestion: 3 });           // 严重拥堵
    set('j_e', 'drinks', { congestion: 2 });
    set('j_se', 'wc_b', { congestion: 1 });
    set('j_nw', 'main_stage', { congestion: 1 });
    return s;
  })(),
  updatedAt: Date.now(),
};

// ---------- 拥挤度元数据 ----------
const CONGESTION = [
  { label: '畅通', color: '#34d399', weightMul: 1.0, speedMul: 1.0  },
  { label: '一般', color: '#fbbf24', weightMul: 1.4, speedMul: 0.8  },
  { label: '拥挤', color: '#fb923c', weightMul: 2.2, speedMul: 0.55 },
  { label: '严重', color: '#ef4444', weightMul: 3.5, speedMul: 0.35 },
];
const BASE_SPEED = 1.25; // m/s 步行速度

// ---------- Dijkstra ----------
function dijkstra(adj, start, goal) {
  const distMap = { [start]: 0 }, prev = {}, visited = new Set();
  while (true) {
    let cur = null, best = Infinity;
    for (const id in distMap) {
      if (!visited.has(id) && distMap[id] < best) { best = distMap[id]; cur = id; }
    }
    if (cur === null) return null;
    if (cur === goal) break;
    visited.add(cur);
    for (const { to, weight, edge } of adj[cur] || []) {
      const nd = best + weight;
      if (nd < (distMap[to] ?? Infinity)) { distMap[to] = nd; prev[to] = { from: cur, edge }; }
    }
  }
  if (!(goal in distMap)) return null;
  const path = [], segments = [];
  let cur = goal;
  while (cur !== start) {
    path.unshift(cur);
    segments.unshift({ edge: prev[cur].edge, from: prev[cur].from, to: cur });
    cur = prev[cur].from;
  }
  path.unshift(start);
  return { path, segments };
}

function buildAdj(state, weightFn) {
  const adj = {};
  for (const e of EDGES) {
    const es = state.edges[e.id];
    if (es.closed) continue;                                  // 封控路段剔除
    if (!state.nodes[e.a].open || !state.nodes[e.b].open) continue; // 关闭节点剔除
    const w = weightFn(e, es);
    (adj[e.a] ||= []).push({ to: e.b, weight: w, edge: e });
    (adj[e.b] ||= []).push({ to: e.a, weight: w, edge: e });
  }
  return adj;
}

/**
 * 规划单段路线
 * mode 'smart': 距离×拥挤惩罚 (推荐) | 'distance': 纯最短距离 (用于对比判断是否绕行)
 */
function routeLeg(state, from, to, mode = 'smart') {
  const weightFn = mode === 'smart'
    ? (e, es) => e.distance * CONGESTION[es.congestion].weightMul
    : (e) => e.distance;
  const adj = buildAdj(state, weightFn);
  const res = dijkstra(adj, from, to);
  if (!res) return null;
  let distance = 0, etaSec = 0, maxCongestion = 0;
  const segments = res.segments.map(({ edge, from, to }) => {
    const c = state.edges[edge.id].congestion;
    distance += edge.distance;
    etaSec += edge.distance / (BASE_SPEED * CONGESTION[c].speedMul);
    maxCongestion = Math.max(maxCongestion, c);
    return { edgeId: edge.id, from, to, distance: edge.distance, congestion: c };
  });
  return { path: res.path, segments, distance, etaMin: etaSec / 60, maxCongestion };
}

/** 完整行程规划: 起点 → 舞台 → 餐饮 → 洗手间 → 出口 */
function planJourney(state, start, stops) {
  const legs = [];
  const seq = [
    { key: 'stage',    label: '舞台',   to: stops.stage },
    { key: 'food',     label: '餐饮',   to: stops.food },
    { key: 'restroom', label: '洗手间', to: stops.restroom },
    { key: 'exit',     label: '出口',   to: stops.exit },
  ];
  let cur = start, blocked = false;
  for (const leg of seq) {
    const fromNode = nodeById[cur], toNode = nodeById[leg.to];
    const base = { key: leg.key, label: leg.label, from: cur, to: leg.to,
                   fromName: fromNode?.name, toName: toNode?.name };
    if (blocked) { legs.push({ ...base, ok: false, reason: '前序路段不可达' }); continue; }
    if (!state.nodes[leg.to]?.open) {
      legs.push({ ...base, ok: false, reason: `「${toNode?.name}」已关闭` });
      blocked = true; continue;
    }
    const smart = routeLeg(state, cur, leg.to, 'smart');
    if (!smart) {
      legs.push({ ...base, ok: false, reason: '路段封控, 暂无可达路径' });
      blocked = true; continue;
    }
    const shortest = routeLeg(state, cur, leg.to, 'distance');
    const detour = shortest && shortest.path.join() !== smart.path.join();
    legs.push({ ...base, ok: true, ...smart, detour });
    cur = leg.to;
  }
  const okLegs = legs.filter(l => l.ok);
  return {
    legs,
    totalDistance: okLegs.reduce((s, l) => s + l.distance, 0),
    totalEtaMin: okLegs.reduce((s, l) => s + l.etaMin, 0),
    complete: legs.every(l => l.ok),
  };
}

module.exports = { NODES, EDGES, CONGESTION, DEFAULT_STATE, planJourney, routeLeg, nodeById };
