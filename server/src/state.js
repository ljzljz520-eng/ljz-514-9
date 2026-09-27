/**
 * 后台运营状态（节点开放、路段封控、实时人流）
 * 持久化到 data/state.json，服务重启后保留；损坏或缺失时回落到底图种子状态
 */
const fs = require('fs');
const path = require('path');
const { buildGraph, edgeKey } = require('./graph');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const { nodes: seedNodes, edges: seedEdges, seedBlocked } = buildGraph();

function seedState() {
  const nodeState = {};
  for (const n of seedNodes) nodeState[n.id] = { open: true };
  const edgeState = {};
  for (const e of seedEdges) {
    edgeState[e.key] = {
      blocked: seedBlocked.includes(e.key),
      crowd: e.crowd
    };
  }
  return {
    version: 1,
    nodeState,
    edgeState,
    updatedAt: new Date().toISOString()
  };
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    // 与底图做一次合并，避免新增节点/路段时缺失状态
    const state = seedState();
    for (const id of Object.keys(state.nodeState)) {
      if (parsed.nodeState && parsed.nodeState[id]) {
        state.nodeState[id] = {
          open: parsed.nodeState[id].open !== false
        };
      }
    }
    for (const key of Object.keys(state.edgeState)) {
      if (parsed.edgeState && parsed.edgeState[key]) {
        const s = parsed.edgeState[key];
        state.edgeState[key] = {
          blocked: s.blocked === true,
          crowd: [0, 1, 2, 3, 4].includes(s.crowd) ? s.crowd : state.edgeState[key].crowd
        };
      }
    }
    state.updatedAt = parsed.updatedAt || state.updatedAt;
    return state;
  } catch {
    return seedState();
  }
}

let state = loadState();

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getState() {
  return state;
}

function touch() {
  state.updatedAt = new Date().toISOString();
  persist();
}

function resetState() {
  state = seedState();
  persist();
  return state;
}

module.exports = { getState, touch, resetState, edgeKey };
