import { useMemo, useState } from 'react';
import { api } from '../api';
import type { GraphSnapshot, MapEdge, MapNode } from '../types';
import { CROWD_META, TYPE_META, crowdColor, crowdLabel } from '../constants';
import MapView from './MapView';

interface AdminViewProps {
  graph: GraphSnapshot;
  updatedAt: string;
  reload: () => Promise<void>;
}

export default function AdminView({ graph, updatedAt, reload }: AdminViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeKey ? graph.edges.find((e) => e.key === selectedEdgeKey) ?? null : null;

  const closedCount = graph.nodes.filter((n) => !n.open).length;
  const blockedCount = graph.edges.filter((e) => e.blocked).length;

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const withBusy = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      flash(msg);
    } finally {
      setBusy(false);
    }
  };

  const toggleNode = (n: MapNode, open: boolean) =>
    withBusy(() => api.setNodeOpen(n.id, open), open ? `已开放「${n.name}」` : `已关闭「${n.name}」，路线将自动绕行`);

  const toggleEdge = (e: MapEdge, blocked: boolean) =>
    withBusy(() => api.setEdge(e.key, { blocked }), blocked ? '路段已封控，路线已重算' : '路段已解除封控');

  const setCrowd = (e: MapEdge, crowd: number) =>
    withBusy(() => api.setEdge(e.key, { crowd }), '人流等级已更新，路线已重算');

  const reset = () => {
    if (!window.confirm('确定恢复为初始运营状态吗？所有封控、关闭与人流调整都会被清除。')) return;
    void withBusy(() => api.reset().then(() => undefined), '已恢复初始状态');
  };

  const groupedNodes = (Object.keys(TYPE_META) as Array<keyof typeof TYPE_META>)
    .filter((t) => t !== 'junction')
    .map((t) => ({ type: t, meta: TYPE_META[t], items: graph.nodes.filter((n) => n.type === t) }));

  const edgeName = (e: MapEdge) => `${nodeById.get(e.a)?.name} ↔ ${nodeById.get(e.b)?.name}`;

  return (
    <div className="view-grid">
      <aside className="side-panel">
        <section className="panel-block">
          <div className="admin-head">
            <h2 className="panel-title" style={{ marginBottom: 0 }}>🛠 运营控制台</h2>
            <button type="button" className="reset-btn" onClick={reset} disabled={busy}>
              恢复初始
            </button>
          </div>
          <p className="panel-hint">
            点击地图上的节点或路段进行编辑；状态保存后，观众端路线立即重新计算。
          </p>
          <div className="admin-stats">
            <span className={`pill${closedCount ? ' pill--warn' : ''}`}>关闭节点 {closedCount}</span>
            <span className={`pill${blockedCount ? ' pill--danger' : ''}`}>封控路段 {blockedCount}</span>
            <span className="pill pill--ghost" title={updatedAt}>
              更新于 {new Date(updatedAt).toLocaleTimeString('zh-CN')}
            </span>
          </div>
        </section>

        {selectedNode && (
          <section className="panel-block editor editor--node">
            <div className="editor__title">
              {TYPE_META[selectedNode.type].emoji} {selectedNode.name}
              <span className="editor__type" style={{ color: TYPE_META[selectedNode.type].color }}>
                {TYPE_META[selectedNode.type].label}
              </span>
            </div>
            <div className="editor__row">
              <span>开放状态</span>
              <Switch
                on={selectedNode.open}
                disabled={busy}
                onChange={(v) => void toggleNode(selectedNode, v)}
                label={selectedNode.open ? '开放中' : '已关闭'}
              />
            </div>
            <p className="editor__tip">
              {selectedNode.open
                ? '观众可选择该节点，路线可以经过。'
                : '该节点不可选、不可借道，已有路线会自动改道；若导致无路可达会提示观众。'}
            </p>
          </section>
        )}

        {selectedEdge && (
          <section className="panel-block editor editor--edge">
            <div className="editor__title">
              🚧 路段
              <span className="editor__type">{edgeName(selectedEdge)}</span>
            </div>
            <div className="editor__meta">{selectedEdge.distance} 米</div>
            <div className="editor__row">
              <span>封控状态</span>
              <Switch
                on={!selectedEdge.blocked}
                disabled={busy}
                onChange={(v) => void toggleEdge(selectedEdge, !v)}
                label={selectedEdge.blocked ? '封控中' : '正常通行'}
                danger={selectedEdge.blocked}
              />
            </div>
            <div className="editor__crowd">
              <div className="editor__row">
                <span>实时人流</span>
                <b style={{ color: crowdColor(selectedEdge.crowd) }}>{crowdLabel(selectedEdge.crowd)}</b>
              </div>
              <div className="crowd-options">
                {CROWD_META.map((c, i) => (
                  <button
                    key={c.label}
                    type="button"
                    disabled={busy || selectedEdge.blocked}
                    className={`crowd-option${selectedEdge.crowd === i ? ' is-active' : ''}`}
                    style={{ ['--c' as string]: c.color }}
                    onClick={() => void setCrowd(selectedEdge, i)}
                  >
                    {i}
                    <small>{c.label}</small>
                  </button>
                ))}
              </div>
            </div>
            <p className="editor__tip">封控路段完全不可通行；人流越高，综合推荐与舒适路线的绕行权重越大。</p>
          </section>
        )}

        <section className="panel-block">
          <h2 className="panel-title">节点开放管理</h2>
          <div className="admin-lists">
            {groupedNodes.map(({ type, meta, items }) => (
              <div key={type} className="admin-group">
                <div className="picker-group__title" style={{ color: meta.color }}>
                  <span>{meta.emoji}</span> {meta.label}
                </div>
                {items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`admin-item${selectedNodeId === n.id ? ' is-selected' : ''}${!n.open ? ' is-closed' : ''}`}
                    onClick={() => {
                      setSelectedNodeId(n.id);
                      setSelectedEdgeKey(null);
                    }}
                  >
                    <span className="admin-item__name">{n.name}</span>
                    <span className={`status-dot ${n.open ? '' : 'status-dot--off'}`} />
                    <span className={`admin-item__state ${n.open ? '' : 'state-off'}`}>
                      {n.open ? '开放' : '关闭'}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      </aside>

      <main className="map-area">
        <MapView
          graph={graph}
          mode="admin"
          selectedNodeId={selectedNodeId}
          selectedEdgeKey={selectedEdgeKey}
          onNodeClick={(id) => {
            setSelectedNodeId(id);
            setSelectedEdgeKey(null);
          }}
          onEdgeClick={(key) => {
            setSelectedEdgeKey(key);
            setSelectedNodeId(null);
          }}
        />
        <div className="map-hint map-hint--static">
          管理模式：点击节点切换开放状态、点击路段设置封控与人流（也可在左侧面板操作）
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}

function Switch({
  on,
  onChange,
  label,
  disabled,
  danger
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`switch${on ? ' switch--on' : ''}${danger ? ' switch--danger' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    >
      <span className="switch__track">
        <span className="switch__thumb" />
      </span>
      <span className="switch__label">{label}</span>
    </button>
  );
}
