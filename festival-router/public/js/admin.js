/* 后台: 更新节点开放状态、路段封控与拥挤度 */
const TYPE_NAME = { stage: '舞台', food: '餐饮', restroom: '洗手间', exit: '出口', entrance: '入口', junction: '路口' };
const CONG_COLORS = ['#34d399', '#fbbf24', '#fb923c', '#ef4444'];
const CONG_LABELS = ['畅通', '一般', '拥挤', '严重拥堵'];
let venue = null;
const $ = (id) => document.getElementById(id);

async function loadVenue() {
  venue = await (await fetch('/api/venue')).json();
  $('updated').textContent = '状态更新于 ' + new Date(venue.updatedAt).toLocaleTimeString('zh-CN');
  renderNodes();
  renderEdges();
}

function renderNodes() {
  $('node-tbody').innerHTML = venue.nodes
    .filter(n => n.type !== 'junction')
    .map(n => `
      <tr>
        <td><span class="dot type-${n.type}" style="background:currentColor"></span>${n.name}</td>
        <td class="type-${n.type}">${TYPE_NAME[n.type]}</td>
        <td>
          <label class="switch">
            <input type="checkbox" data-node="${n.id}" ${n.open ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </td>
      </tr>`).join('');
  document.querySelectorAll('input[data-node]').forEach(cb =>
    cb.addEventListener('change', async () => {
      await fetch(`/api/admin/node/${cb.dataset.node}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open: cb.checked }),
      });
      await loadVenue();
      toast(cb.checked ? '节点已开放, 观众端刷新后自动重算' : '节点已关闭, 观众端刷新后自动重算');
    }));
}

function renderEdges() {
  const nm = Object.fromEntries(venue.nodes.map(n => [n.id, n]));
  $('edge-tbody').innerHTML = venue.edges.map(e => `
    <tr>
      <td>${nm[e.a].name} <span style="color:#5b6490">—</span> ${nm[e.b].name}</td>
      <td>${e.distance} m</td>
      <td>
        <select data-edge="${e.id}" ${e.closed ? 'disabled' : ''}>
          ${CONG_LABELS.map((l, i) => `<option value="${i}" ${e.congestion === i ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </td>
      <td>
        <label class="switch">
          <input type="checkbox" data-edge-close="${e.id}" ${e.closed ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </td>
    </tr>`).join('');

  document.querySelectorAll('select[data-edge]').forEach(sel =>
    sel.addEventListener('change', async () => {
      await fetch(`/api/admin/edge/${sel.dataset.edge}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ congestion: Number(sel.value) }),
      });
      await loadVenue();
      toast('拥挤度已更新, 路线将重新计算');
    }));
  document.querySelectorAll('input[data-edge-close]').forEach(cb =>
    cb.addEventListener('change', async () => {
      await fetch(`/api/admin/edge/${cb.dataset.edgeClose}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closed: cb.checked }),
      });
      await loadVenue();
      toast(cb.checked ? '路段已封控, 系统将自动绕行' : '路段已解封');
    }));
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

$('btn-reset').addEventListener('click', async () => {
  if (!confirm('确定恢复初始场地状态？')) return;
  await fetch('/api/admin/reset', { method: 'POST' });
  await loadVenue();
  toast('已恢复初始状态');
});

loadVenue();
setInterval(loadVenue, 10000);
