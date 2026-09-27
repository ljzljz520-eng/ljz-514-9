/**
 * 音乐节动线服务
 * 观众接口：查图、算路线
 * 管理接口：节点开放状态、路段封控 / 人流、一键复位
 * 事件推送：状态变更后通过 SSE 通知前端，路线实时重算
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { buildGraph, NODE_TYPES, edgeKey } = require('./graph');
const { getState, touch, resetState } = require('./state');
const { computeRoutes } = require('./routing');

const PORT = process.env.PORT || 4001;
const app = express();
app.use(cors());
app.use(express.json());

const { nodes, edges } = buildGraph();
const nodeIds = new Set(nodes.map((n) => n.id));
const edgeKeys = new Set(edges.map((e) => e.key));

// ---- SSE 订阅 ----
const clients = new Set();
function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(data);
}

// 把底图与实时状态合并成给前端的快照
function snapshot() {
  const state = getState();
  return {
    updatedAt: state.updatedAt,
    nodeTypes: NODE_TYPES,
    nodes: nodes.map((n) => ({
      ...n,
      open: state.nodeState[n.id]?.open !== false
    })),
    edges: edges.map((e) => ({
      ...e,
      blocked: state.edgeState[e.key]?.blocked === true,
      crowd: state.edgeState[e.key]?.crowd ?? e.crowd
    }))
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'festival-route-planner', time: new Date().toISOString() });
});

app.get('/api/graph', (_req, res) => {
  res.json(snapshot());
});

app.get('/api/state', (_req, res) => {
  res.json(snapshot());
});

app.post('/api/routes', (req, res, next) => {
  try {
    const { start, goal } = req.body || {};
    if (!start || !goal) {
      return res.status(400).json({ error: '请选择起点和终点' });
    }
    const routes = computeRoutes(start, goal, getState());
    return res.json({
      start,
      goal,
      updatedAt: getState().updatedAt,
      routes
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// ---- 管理接口 ----
app.patch('/api/admin/nodes/:id', (req, res) => {
  const { id } = req.params;
  if (!nodeIds.has(id)) return res.status(404).json({ error: '节点不存在' });
  if (typeof req.body.open !== 'boolean') {
    return res.status(400).json({ error: '字段 open 必须为布尔值' });
  }
  const state = getState();
  state.nodeState[id].open = req.body.open;
  touch();
  broadcast('state-change', { updatedAt: state.updatedAt, type: 'node', id, open: req.body.open });
  res.json({ ok: true, updatedAt: state.updatedAt });
});

app.patch('/api/admin/edges/:key', (req, res) => {
  const rawKey = decodeURIComponent(req.params.key);
  // 兼容 a-b / a|b / 顺序颠倒
  const key = rawKey.includes('|')
    ? edgeKey(rawKey.split('|')[0], rawKey.split('|')[1])
    : rawKey.includes('-')
      ? edgeKey(rawKey.split('-')[0], rawKey.split('-')[1])
      : rawKey;
  if (!edgeKeys.has(key)) return res.status(404).json({ error: '路段不存在' });

  const { blocked, crowd } = req.body || {};
  const state = getState();
  const cur = state.edgeState[key];
  if (blocked !== undefined) {
    if (typeof blocked !== 'boolean') return res.status(400).json({ error: '字段 blocked 必须为布尔值' });
    cur.blocked = blocked;
  }
  if (crowd !== undefined) {
    if (![0, 1, 2, 3, 4].includes(crowd)) return res.status(400).json({ error: 'crowd 必须为 0-4' });
    cur.crowd = crowd;
  }
  touch();
  broadcast('state-change', { updatedAt: state.updatedAt, type: 'edge', key, blocked: cur.blocked, crowd: cur.crowd });
  res.json({ ok: true, updatedAt: state.updatedAt });
});

app.post('/api/admin/reset', (_req, res) => {
  const state = resetState();
  broadcast('state-change', { updatedAt: state.updatedAt, type: 'reset' });
  res.json({ ok: true, snapshot: snapshot() });
});

// 状态变更推送（观众端 / 后台端都可订阅）
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('retry: 3000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

// ---- 生产环境托管前端构建产物 ----
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`🎪 音乐节动线服务已启动: http://localhost:${PORT}`);
});
