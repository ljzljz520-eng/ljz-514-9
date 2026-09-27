/**
 * 场地底图：节点 + 无向路段（图模型）
 * 坐标系：1000 x 800（约等于米），前端 SVG 按同坐标渲染
 * 节点类型：exit 出口 / stage 舞台 / food 餐饮 / restroom 洗手间 / junction 路口
 */

const NODE_TYPES = {
  exit: { label: '出口' },
  stage: { label: '舞台' },
  food: { label: '餐饮摊' },
  restroom: { label: '洗手间' },
  junction: { label: '路口' }
};

const NODES = [
  // 出口
  { id: 'E1', name: '北门出口', type: 'exit', x: 500, y: 45 },
  { id: 'E2', name: '东门出口', type: 'exit', x: 955, y: 420 },
  { id: 'E3', name: '南门出口', type: 'exit', x: 500, y: 760 },
  { id: 'E4', name: '西门出口', type: 'exit', x: 45, y: 420 },
  // 舞台
  { id: 'ST1', name: '主舞台·电音主场', type: 'stage', x: 290, y: 195 },
  { id: 'ST2', name: '副舞台·民谣山丘', type: 'stage', x: 715, y: 195 },
  { id: 'ST3', name: '电子舞台·低音谷', type: 'stage', x: 290, y: 610 },
  { id: 'ST4', name: '即兴舞台·星光帐篷', type: 'stage', x: 715, y: 610 },
  // 餐饮
  { id: 'F1', name: '餐饮市集 A 区', type: 'food', x: 195, y: 420 },
  { id: 'F2', name: '餐饮市集 B 区', type: 'food', x: 805, y: 420 },
  // 洗手间
  { id: 'W1', name: '洗手间·北', type: 'restroom', x: 500, y: 140 },
  { id: 'W2', name: '洗手间·东', type: 'restroom', x: 875, y: 420 },
  { id: 'W3', name: '洗手间·南', type: 'restroom', x: 500, y: 690 },
  { id: 'W4', name: '洗手间·西', type: 'restroom', x: 125, y: 420 },
  // 路口（中央环岛 + 环形网格，提供绕行备选）
  { id: 'J_C', name: '中央环岛', type: 'junction', x: 500, y: 420 },
  { id: 'J_N', name: '北侧路口', type: 'junction', x: 500, y: 325 },
  { id: 'J_E', name: '东侧路口', type: 'junction', x: 675, y: 420 },
  { id: 'J_S', name: '南侧路口', type: 'junction', x: 500, y: 520 },
  { id: 'J_W', name: '西侧路口', type: 'junction', x: 325, y: 420 },
  { id: 'J_NW', name: '西北路口', type: 'junction', x: 325, y: 325 },
  { id: 'J_NE', name: '东北路口', type: 'junction', x: 675, y: 325 },
  { id: 'J_SW', name: '西南路口', type: 'junction', x: 325, y: 520 },
  { id: 'J_SE', name: '东南路口', type: 'junction', x: 675, y: 520 }
];

// 无向边 [端点A, 端点B]
const EDGE_PAIRS = [
  ['E1', 'W1'],
  ['W1', 'ST1'], ['W1', 'ST2'],
  ['ST1', 'J_NW'], ['ST2', 'J_NE'],
  ['J_NW', 'J_N'], ['J_N', 'J_NE'],
  ['J_NW', 'J_W'], ['J_NE', 'J_E'],
  ['J_NW', 'J_C'], ['J_NE', 'J_C'], ['J_N', 'J_C'],
  ['J_W', 'J_C'], ['J_C', 'J_E'],
  ['J_W', 'J_SW'], ['J_E', 'J_SE'],
  ['J_C', 'J_S'], ['J_SW', 'J_S'], ['J_S', 'J_SE'],
  ['J_SW', 'J_C'], ['J_SE', 'J_C'],
  ['J_W', 'F1'], ['F1', 'W4'], ['W4', 'E4'],
  ['J_E', 'F2'], ['F2', 'W2'], ['W2', 'E2'],
  ['J_SW', 'ST3'], ['J_SE', 'ST4'],
  ['ST3', 'W3'], ['ST4', 'W3'],
  ['W3', 'E3']
];

// 初始实时人流等级：0 畅通 / 1 顺畅 / 2 适中 / 3 拥挤 / 4 非常拥挤
const SEED_CROWD = {
  'E1|W1': 2,
  'W1|ST1': 3, 'W1|ST2': 3,
  'ST1|J_NW': 4, 'ST2|J_NE': 3,
  'J_NW|J_N': 2, 'J_N|J_NE': 2,
  'J_NW|J_W': 2, 'J_NE|J_E': 2,
  'J_NW|J_C': 3, 'J_NE|J_C': 3, 'J_N|J_C': 3,
  'J_W|J_C': 2, 'J_C|J_E': 2,
  'J_W|J_SW': 2, 'J_E|J_SE': 2,
  'J_C|J_S': 2, 'J_SW|J_S': 2, 'J_S|J_SE': 2,
  'J_SW|J_C': 2, 'J_SE|J_C': 2,
  'J_W|F1': 3, 'F1|W4': 2, 'W4|E4': 1,
  'J_E|F2': 3, 'F2|W2': 2, 'W2|E2': 1,
  'J_SW|ST3': 3, 'J_SE|ST4': 3,
  'ST3|W3': 2, 'ST4|W3': 2,
  'W3|E3': 1
};

// 初始封控路段（演示：中央大道东段临时管控）
const SEED_BLOCKED = ['J_C|J_E'];

const edgeKey = (a, b) => [a, b].sort().join('|');

function buildGraph() {
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  // 种子 key 统一做一次字母序归一，避免 W1|ST1 与 ST1|W1 匹配不上
  const seedCrowdNorm = Object.fromEntries(
    Object.entries(SEED_CROWD).map(([k, v]) => [edgeKey(...k.split('|')), v])
  );
  const seedBlockedNorm = SEED_BLOCKED.map((k) => edgeKey(...k.split('|')));
  const edges = EDGE_PAIRS.map(([a, b]) => {
    const na = byId[a];
    const nb = byId[b];
    const key = edgeKey(a, b);
    return {
      key,
      a,
      b,
      distance: Math.round(Math.hypot(na.x - nb.x, na.y - nb.y)),
      crowd: seedCrowdNorm[key] ?? 1
    };
  });
  return { nodes: NODES, edges, edgeKey, seedBlocked: seedBlockedNorm };
}

module.exports = { buildGraph, edgeKey, NODE_TYPES, SEED_BLOCKED };
