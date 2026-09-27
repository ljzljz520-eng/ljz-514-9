/* 观众端: 地图渲染 + 动线规划 + 卡片展示 + 状态刷新 */

const TYPE_META = {
  stage:    { icon: '🎤', color: '#a78bfa' },
  food:     { icon: '🍢', color: '#fb923c' },
  restroom: { icon: '🚻', color: '#38bdf8' },
  exit:     { icon: '🚪', color: '#34d399' },
  entrance: { icon: '📍', color: '#2dd4bf' },
  junction: { icon: '·',  color: '#6b7299' },
};
const C_LABEL = ['畅通', '一般', '拥挤', '严重拥堵'];
const C_BADGE = ['green', 'yellow', 'orange', 'red'];
const LEG_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#facc15'];

let venue = null;
let lastUpdatedAt = null;
let currentSelection = null;

const $ = (id) => document.getElementById(id);
const nodeMap = () => Object.fromEntries(venue.nodes.map(n => [n.id, n]));

/* ---------- 拉取场地状态 ---------- */
async function loadVenue(silent = false) {
  const res = await fetch('/api/venue');
  venue = await res.json();
  renderMap();
  populateSelects();
  $('updated').textContent = '状态更新于 ' + new Date(venue.updatedAt).toLocaleTimeString('zh-CN');
  if (!silent && lastUpdatedAt !== null && venue.updatedAt !== lastUpdatedAt) {
    toast('场地状态有更新, 路线已重新计算');
    if (currentSelection) doPlan(true);
  }
  lastUpdatedAt = venue.updatedAt;
}

/* ---------- SVG 地图 ---------- */
const svgEl = (tag, attrs = {}, text) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
};

function renderMap() {
  const svg = $('venue-map');
  svg.innerHTML = '';
  const nm = nodeMap();

  // 背景装饰
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: 800, height: 620, rx: 12, fill: '#141936' }));

  // 路线高亮层 (边之上, 节点之下)
  const routeLayer = svgEl('g', { id: 'route-layer' });

  // 路段
  const edgeLayer = svgEl('g');
  venue.edges.forEach(e => {
    const a = nm[e.a], b = nm[e.b];
    const color = e.closed ? '#4a5074' : ['#34d399', '#fbbf24', '#fb923c', '#ef4444'][e.congestion];
    const line = svgEl('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      class: 'edge' + (e.closed ? ' closed' : ''),
      stroke: color, 'data-edge': e.id,
    });
    edgeLayer.appendChild(line);
    // 封控标记
    if (e.closed) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      edgeLayer.appendChild(svgEl('text', {
        x: mx, y: my - 6, 'text-anchor': 'middle', 'font-size': 13,
        transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI} ${mx} ${my})`,
      }, '⛔ 封控'));
    }
  });
  svg.appendChild(edgeLayer);
  svg.appendChild(routeLayer);

  // 节点
  const nodeLayer = svgEl('g');
  venue.nodes.forEach(n => {
    const meta = TYPE_META[n.type];
    const r = n.type === 'junction' ? 7 : 15;
    const g = svgEl('g', { class: 'node' + (n.open ? '' : ' closed'), transform: `translate(${n.x},${n.y})` });
    g.appendChild(svgEl('circle', { class: 'ring', r, fill: meta.color }));
    if (n.type !== 'junction') g.appendChild(svgEl('text', { class: 'icon' }, meta.icon));
    if (n.type !== 'junction') {
      g.appendChild(svgEl('text', { class: 'name', y: r + 14 }, n.name + (n.open ? '' : '(已关闭)')));
    }
    nodeLayer.appendChild(g);
  });
  svg.appendChild(nodeLayer);
}

function highlightRoute(legs) {
  const layer = $('route-layer');
  layer.innerHTML = '';
  const nm = nodeMap();
  legs.filter(l => l.ok).forEach((leg, i) => {
    const pts = leg.path.map(id => `${nm[id].x},${nm[id].y}`).join(' ');
    const color = LEG_COLORS[i % LEG_COLORS.length];
    layer.appendChild(svgEl('polyline', { points: pts, class: 'route-line', stroke: color }));
  });
}

/* ---------- 选择器 ---------- */
function populateSelects() {
  const groups = {
    entrance: [], stage: [], food: [], restroom: [], exit: [], junction: [],
  };
  venue.nodes.forEach(n => groups[n.type]?.push(n));
  const junctionOpt = (n) => n.type === 'junction' ? `${n.name}（途经点）` : n.name;

  const fill = (selId, types, preferred) => {
    const sel = $(selId);
    const prev = sel.value;
    sel.innerHTML = '';
    venue.nodes.filter(n => types.includes(n.type)).forEach(n => {
      const o = document.createElement('option');
      o.value = n.id;
      o.textContent = `${TYPE_META[n.type].icon} ${junctionOpt(n)}` + (n.open ? '' : '（已关闭）');
      if (!n.open) o.disabled = true;
      sel.appendChild(o);
    });
    if (prev && [...sel.options].some(o => o.value === prev && !o.disabled)) sel.value = prev;
    else if (preferred && [...sel.options].some(o => o.value === preferred && !o.disabled)) sel.value = preferred;
    else sel.value = [...sel.options].find(o => !o.disabled)?.value || '';
  };
  // 起点: 入口 + 任意节点均可
  $('sel-start').innerHTML = '';
  venue.nodes.forEach(n => {
    if (n.type === 'junction') return;
    const o = document.createElement('option');
    o.value = n.id;
    o.textContent = `${TYPE_META[n.type].icon} ${n.name}` + (n.open ? '' : '（已关闭）');
    if (!n.open) o.disabled = true;
    $('sel-start').appendChild(o);
  });
  const startSel = $('sel-start');
  startSel.value = 'entrance';
  if (startSel.selectedOptions[0]?.disabled) {
    startSel.value = [...startSel.options].find(o => !o.disabled)?.value || '';
  }
  fill('sel-stage', ['stage'], 'main_stage');
  fill('sel-food', ['food'], 'bbq');
  fill('sel-restroom', ['restroom'], 'wc_a');
  fill('sel-exit', ['exit'], 'exit_east');
}

/* ---------- 请求规划 ---------- */
async function doPlan(silent = false) {
  const body = {
    start: $('sel-start').value,
    stage: $('sel-stage').value,
    food: $('sel-food').value,
    restroom: $('sel-restroom').value,
    exit: $('sel-exit').value,
  };
  currentSelection = body;
  const res = await fetch('/api/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    $('result').innerHTML = `<div class="panel" id="empty">⚠️ ${err.error || '规划失败'}</div>`;
    $('route-layer')?.replaceChildren();
    return;
  }
  const plan = await res.json();
  renderCards(plan);
  highlightRoute(plan.legs);
  if (!silent) toast('路线已更新');
}

/* ---------- 路线卡片 ---------- */
function renderCards(plan) {
  const nm = nodeMap();
  const chips = (leg) => leg.path.map((id, i) =>
    `<span class="chip ${i === leg.path.length - 1 ? 'dest' : ''}">${nm[id].name}</span>`
      + (i < leg.path.length - 1 ? '<span class="arrow">→</span>' : '')
  ).join('');

  const cards = plan.legs.map((leg, i) => {
    const color = LEG_COLORS[i % LEG_COLORS.length];
    if (!leg.ok) {
      return `<div class="card fail" style="border-left-color:#ef4444">
        <div class="card-head"><span class="order" style="background:#ef4444;color:#fff">${i + 1}</span>
          ${leg.fromName} → ${leg.toName}
          <span class="stat">${leg.label}</span></div>
        <div class="reason">⛔ ${leg.reason}</div></div>`;
    }
    const badges = [
      `<span class="badge ${C_BADGE[leg.maxCongestion]}">途经${C_LABEL[leg.maxCongestion]}</span>`,
      leg.detour ? '<span class="badge cyan">🛰 已智能避堵绕行</span>' : '',
    ].join('');
    return `<div class="card" style="border-left-color:${color}">
      <div class="card-head">
        <span class="order" style="background:${color}">${i + 1}</span>
        ${leg.fromName} → ${leg.toName}
        <span class="stat">${leg.label} · ${leg.distance} m · 约 ${Math.ceil(leg.etaMin)} 分钟</span>
      </div>
      <div class="path">${chips(leg)}</div>
      <div class="badges">${badges}</div>
    </div>`;
  }).join('');

  $('result').innerHTML = `
    <div class="panel">
      ${plan.complete
        ? `<div class="summary">
             <div class="col"><div class="num">${Math.round(plan.totalDistance)}</div><div class="unit">总距离 (米)</div></div>
             <div class="col"><div class="num">${Math.ceil(plan.totalEtaMin)}</div><div class="unit">预计用时 (分钟)</div></div>
             <div class="col"><div class="num">${plan.legs.length}</div><div class="unit">段行程</div></div>
           </div>`
        : `<div class="summary" style="border-color:#ef4444;background:rgba(239,68,68,.08)">
             <div style="font-size:13px;color:#fca5a5">⚠️ 部分行程不可达, 请等待解封或改选其他节点后刷新</div></div>`}
      <div class="cards">${cards}</div>
    </div>`;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- 事件 & 自动刷新 ---------- */
$('btn-plan').addEventListener('click', () => doPlan());
$('btn-refresh').addEventListener('click', async () => {
  await loadVenue(true);
  if (currentSelection) await doPlan(true);
  toast('已刷新最新场地状态');
});
['sel-start', 'sel-stage', 'sel-food', 'sel-restroom', 'sel-exit'].forEach(id =>
  $(id).addEventListener('change', () => doPlan()));

loadVenue().then(() => doPlan(true));
// 每 12 秒轮询后台状态, 变化即重新计算路线
setInterval(() => loadVenue(), 12000);
