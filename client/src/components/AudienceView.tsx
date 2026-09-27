import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { GraphSnapshot, RoutePlan } from '../types';
import { TYPE_META } from '../constants';
import MapView from './MapView';
import RouteCard from './RouteCard';

interface AudienceViewProps {
  graph: GraphSnapshot;
  version: number;
}

const PICK_TYPES = ['stage', 'food', 'restroom', 'exit'] as const;

export default function AudienceView({ graph, version }: AudienceViewProps) {
  const [startId, setStartId] = useState<string | null>('ST1');
  const [goalId, setGoalId] = useState<string | null>('F2');
  const [pickTarget, setPickTarget] = useState<'start' | 'goal' | null>(null);
  const [routes, setRoutes] = useState<RoutePlan[] | null>(null);
  const [activeMode, setActiveMode] = useState<string>('balanced');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [routeUpdatedAt, setRouteUpdatedAt] = useState<string | null>(null);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const start = startId ? nodeById.get(startId) : null;
  const goal = goalId ? nodeById.get(goalId) : null;

  const recommend = useCallback(async (s: string | null, g: string | null) => {
    if (!s || !g) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.fetchRoutes(s, g);
      setRoutes(res.routes);
      setRouteUpdatedAt(res.updatedAt);
      // 默认选中综合推荐；若当前方案仍存在则保留用户选择
      setActiveMode((prev) => (res.routes.some((r) => r.mode === prev) ? prev : res.routes[0].mode));
    } catch (e) {
      setRoutes(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次加载 + 后台状态刷新（SSE 推 version 变化）后自动重新计算路线
  useEffect(() => {
    void recommend(startId, goalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const assignStart = (id: string) => {
    setStartId(id);
    if (id === goalId) setGoalId(null);
  };
  const assignGoal = (id: string) => {
    setGoalId(id);
    if (id === startId) setStartId(null);
  };

  const handlePick = (id: string) => {
    if (pickTarget === 'goal') assignGoal(id);
    else assignStart(id);
    setPickTarget(null);
  };

  const onChipClick = (id: string) => {
    // 列表点击：处于“选终点”模式则设终点，否则默认设为起点
    if (pickTarget === 'goal') assignGoal(id);
    else assignStart(id);
  };

  const grouped = PICK_TYPES.map((t) => ({
    type: t,
    meta: TYPE_META[t],
    items: graph.nodes.filter((n) => n.type === t)
  }));

  return (
    <div className="view-grid">
      <aside className="side-panel">
        <section className="panel-block">
          <h2 className="panel-title">🧭 我要去</h2>
          <p className="panel-hint">
            点亮“起点 / 终点”后在地图上点选节点；也可直接点击下方列表（舞台、餐饮摊、洗手间、出口）
          </p>

          <div className="pick-toggle">
            <button
              type="button"
              className={`pick-btn pick-btn--start${pickTarget === 'start' ? ' is-active' : ''}`}
              onClick={() => setPickTarget(pickTarget === 'start' ? null : 'start')}
            >
              <span className="pick-dot" />
              <span className="pick-k">起点</span>
              <b className="pick-value">{start?.name ?? '未选择'}</b>
            </button>
            <button
              type="button"
              className={`pick-btn pick-btn--goal${pickTarget === 'goal' ? ' is-active' : ''}`}
              onClick={() => setPickTarget(pickTarget === 'goal' ? null : 'goal')}
            >
              <span className="pick-dot" />
              <span className="pick-k">终点</span>
              <b className="pick-value">{goal?.name ?? '未选择'}</b>
            </button>
          </div>

          <button
            type="button"
            className="recommend-btn"
            disabled={!startId || !goalId || loading}
            onClick={() => void recommend(startId, goalId)}
          >
            {loading ? '正在计算…' : '✨ 推荐路线'}
          </button>
        </section>

        <section className="panel-block picker-list">
          {grouped.map(({ type, meta, items }) => (
            <div key={type} className="picker-group">
              <div className="picker-group__title" style={{ color: meta.color }}>
                <span>{meta.emoji}</span> {meta.label}
              </div>
              <div className="picker-chips">
                {items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    disabled={!n.open}
                    className={`chip${n.id === startId ? ' chip--start' : ''}${n.id === goalId ? ' chip--goal' : ''}`}
                    onClick={() => onChipClick(n.id)}
                  >
                    {n.name}
                    {!n.open && <em>已关闭</em>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        {error && <div className="alert alert--error">{error}</div>}

        {routes && routes.length > 0 && (
          <section className="panel-block">
            <div className="routes-head">
              <h2 className="panel-title" style={{ marginBottom: 0 }}>推荐方案</h2>
              <span className="routes-updated" title={`最后计算：${routeUpdatedAt ?? ''}`}>
                ● 已按最新管控状态计算
              </span>
            </div>
            <div className="route-list">
              {routes.map((r, i) => (
                <RouteCard
                  key={r.mode}
                  route={r}
                  graph={graph}
                  index={i}
                  active={r.mode === activeMode}
                  onSelect={() => setActiveMode(r.mode)}
                />
              ))}
            </div>
          </section>
        )}
      </aside>

      <main className="map-area">
        <MapView
          graph={graph}
          mode="audience"
          startId={startId}
          goalId={goalId}
          pickTarget={pickTarget}
          onPickNode={handlePick}
          routes={routes ?? undefined}
          activeMode={activeMode}
        />
        {pickTarget && (
          <div className="map-hint">
            在地图上点击一个开放的{pickTarget === 'start' ? '起点' : '终点'}节点
            <button type="button" onClick={() => setPickTarget(null)}>取消</button>
          </div>
        )}
      </main>
    </div>
  );
}
