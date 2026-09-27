/**
 * 音乐节摊位动线工具 - 后端服务
 * GET  /api/venue              场地数据 + 最新开放/拥挤状态
 * POST /api/plan               路线规划 { start, stage, food, restroom, exit }
 * POST /api/admin/node/:id     后台更新节点开放状态 { open }
 * POST /api/admin/edge/:id     后台更新路段 { closed?, congestion? }
 * POST /api/admin/reset        恢复初始状态
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { NODES, EDGES, DEFAULT_STATE, planJourney } = require('./venue');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data', 'venue-state.json');

let state;
try {
  state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log('已加载已保存的场地状态');
} catch {
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  console.log('使用初始场地状态');
}
const persist = () => fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
const touch = () => { state.updatedAt = Date.now(); persist(); };

app.get('/api/venue', (req, res) => {
  res.json({
    nodes: NODES.map(n => ({ ...n, open: state.nodes[n.id].open })),
    edges: EDGES.map(e => ({ ...e, ...state.edges[e.id] })),
    updatedAt: state.updatedAt,
  });
});

app.post('/api/plan', (req, res) => {
  const { start, stage, food, restroom, exit: exitId } = req.body || {};
  const ids = [start, stage, food, restroom, exitId];
  if (ids.some(id => !state.nodes[id])) {
    return res.status(400).json({ error: '选择的节点不完整或不存在' });
  }
  if (new Set(ids).size !== 5) {
    return res.status(400).json({ error: '请选择 5 个不同的节点' });
  }
  if (!state.nodes[start].open) {
    return res.status(400).json({ error: '起点当前未开放' });
  }
  res.json(planJourney(state, start, { stage, food, restroom, exit: exitId }));
});

app.post('/api/admin/node/:id', (req, res) => {
  const id = req.params.id;
  if (!state.nodes[id]) return res.status(404).json({ error: '节点不存在' });
  if (typeof req.body.open !== 'boolean') return res.status(400).json({ error: '需要 { open: boolean }' });
  state.nodes[id].open = req.body.open;
  touch();
  res.json({ ok: true, updatedAt: state.updatedAt });
});

app.post('/api/admin/edge/:id', (req, res) => {
  const id = req.params.id;
  if (!state.edges[id]) return res.status(404).json({ error: '路段不存在' });
  const { closed, congestion } = req.body;
  if (typeof closed === 'boolean') state.edges[id].closed = closed;
  if (Number.isInteger(congestion) && congestion >= 0 && congestion <= 3) {
    state.edges[id].congestion = congestion;
  }
  touch();
  res.json({ ok: true, updatedAt: state.updatedAt });
});

app.post('/api/admin/reset', (req, res) => {
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  state.updatedAt = Date.now();
  persist();
  res.json({ ok: true, updatedAt: state.updatedAt });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`音乐节动线工具运行中: http://localhost:${PORT}  (后台: /admin.html)`));
