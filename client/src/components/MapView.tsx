import type { GraphSnapshot, MapEdge, MapNode, RoutePlan } from '../types';
import { TYPE_META, CROWD_META } from '../constants';

interface MapViewProps {
  graph: GraphSnapshot;
  mode: 'audience' | 'admin';
  startId?: string | null;
  goalId?: string | null;
  pickTarget?: 'start' | 'goal' | null;
  onPickNode?: (id: string) => void;
  routes?: RoutePlan[];
  activeMode?: string;
  selectedNodeId?: string | null;
  selectedEdgeKey?: string | null;
  onNodeClick?: (id: string) => void;
  onEdgeClick?: (key: string) => void;
}

const ZONES = [
  { cx: 500, cy: 175, rx: 320, ry: 120, label: '北侧舞台区', fill: 'rgba(255,45,149,0.05)', round: false },
  { cx: 500, cy: 635, rx: 320, ry: 120, label: '南侧舞台区', fill: 'rgba(255,45,149,0.05)', round: false },
  { cx: 195, cy: 420, rx: 110, ry: 130, label: '', fill: 'rgba(255,176,32,0.05)', round: true },
  { cx: 805, cy: 420, rx: 110, ry: 130, label: '', fill: 'rgba(255,176,32,0.05)', round: true },
  { cx: 500, cy: 420, rx: 95, ry: 95, label: '中央广场', fill: 'rgba(34,211,238,0.045)', round: true }
];

export default function MapView(props: MapViewProps) {
  const { graph, mode } = props;
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const activeRoute =
    props.routes?.find((r) => r.mode === props.activeMode) ?? props.routes?.[0] ?? null;
  const routeEdgeSet = new Set(activeRoute?.edgePath ?? []);
  const routeNodeSet = new Set(activeRoute?.nodePath ?? []);
  const showingRoute = Boolean(activeRoute);

  const edgeMid = (e: MapEdge) => {
    const a = nodeById.get(e.a)!;
    const b = nodeById.get(e.b)!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const nodeClickable = (n: MapNode) => {
    if (mode === 'admin') return true;
    if (!props.pickTarget) return false;
    if (!n.open) return false;
    return TYPE_META[n.type].pickable;
  };

  const handleNodeClick = (n: MapNode) => {
    if (!nodeClickable(n)) return;
    if (mode === 'admin') props.onNodeClick?.(n.id);
    else props.onPickNode?.(n.id);
  };

  return (
    <div className="map-wrap">
      <svg viewBox="0 0 1000 800" className="venue-svg" role="img" aria-label="音乐节简化场地图">
        <defs>
          <radialGradient id="bgGlow" cx="50%" cy="42%" r="70%">
            <stop offset="0%" stopColor="#1e2447" />
            <stop offset="100%" stopColor="#0c0f22" />
          </radialGradient>
          <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#ff2d95" />
          </linearGradient>
          <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width="1000" height="800" fill="url(#bgGlow)" />

        {/* 功能分区底纹 */}
        {ZONES.map((z, i) =>
          z.round ? (
            <ellipse key={i} cx={z.cx} cy={z.cy} rx={z.rx} ry={z.ry} fill={z.fill} stroke="rgba(255,255,255,0.05)" />
          ) : (
            <g key={i}>
              <ellipse cx={z.cx} cy={z.cy} rx={z.rx} ry={z.ry} fill={z.fill} stroke="rgba(255,255,255,0.06)" strokeDasharray="6 8" />
              <text x={z.cx} y={z.cy - z.ry + 26} textAnchor="middle" className="zone-label">{z.label}</text>
            </g>
          )
        )}

        {/* 路段底层 */}
        <g>
          {graph.edges.map((e) => {
            const a = nodeById.get(e.a)!;
            const b = nodeById.get(e.b)!;
            const isRoute = routeEdgeSet.has(e.key);
            const selected = props.selectedEdgeKey === e.key;
            const dim = showingRoute && !isRoute;
            if (e.blocked) {
              return (
                <g key={e.key} opacity={dim ? 0.25 : 1}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ff3b5c" strokeWidth={4} strokeDasharray="10 8" opacity="0.85" />
                  <BlockedBadge x={edgeMid(e).x} y={edgeMid(e).y} />
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={18}
                    className={mode === 'admin' ? 'edge-hit' : ''}
                    onClick={() => mode === 'admin' && props.onEdgeClick?.(e.key)}
                    cursor={mode === 'admin' ? 'pointer' : 'default'}
                  />
                  <title>{`${a.name} ↔ ${b.name}｜${e.distance}m｜封控中`}</title>
                </g>
              );
            }
            const color = CROWD_META[e.crowd].color;
            return (
              <g key={e.key} opacity={dim ? 0.16 : isRoute ? 0.35 : 0.75}>
                {selected && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fde68a" strokeWidth={11} opacity="0.45" />}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={isRoute ? 4 : 5} strokeLinecap="round" />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={18}
                  className={mode === 'admin' ? 'edge-hit' : ''}
                  onClick={() => mode === 'admin' && props.onEdgeClick?.(e.key)}
                  cursor={mode === 'admin' ? 'pointer' : 'default'}
                />
                <title>{`${a.name} ↔ ${b.name}｜${e.distance}m｜人流：${CROWD_META[e.crowd].label}`}</title>
              </g>
            );
          })}
        </g>

        {/* 推荐路线高亮层 */}
        {activeRoute && (
          <polyline
            className="route-line"
            points={activeRoute.nodePath
              .map((id) => {
                const n = nodeById.get(id)!;
                return `${n.x},${n.y}`;
              })
              .join(' ')}
            fill="none"
            stroke="url(#routeGrad)"
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#routeGlow)"
          />
        )}

        {/* 节点 */}
        <g>
          {graph.nodes.map((n) => {
            const meta = TYPE_META[n.type];
            const isJunction = n.type === 'junction';
            const r = isJunction ? 8 : 15;
            const isStart = props.startId === n.id;
            const isGoal = props.goalId === n.id;
            const selected = props.selectedNodeId === n.id;
            const onRoute = routeNodeSet.has(n.id);
            const clickable = nodeClickable(n);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y})`}
                className={clickable ? 'node-hit' : ''}
                onClick={() => handleNodeClick(n)}
                cursor={clickable ? 'pointer' : 'default'}
              >
                <title>
                  {`${n.name}（${meta.label}）${n.open ? '' : '·已关闭'}${
                    mode === 'audience' && props.pickTarget ? `｜点击设为${props.pickTarget === 'start' ? '起点' : '终点'}` : ''
                  }`}
                </title>
                {(isStart || isGoal) && (
                  <circle r={r + 8} fill="none" stroke={isStart ? '#4ade80' : '#ff2d95'} strokeWidth={2} opacity="0.9">
                    <animate attributeName="r" values={`${r + 6};${r + 14};${r + 6}`} dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                )}
                {selected && <circle r={r + 6} fill="none" stroke="#fde68a" strokeWidth={2.5} />}
                <circle
                  r={r}
                  fill={n.open ? meta.color : '#3a3f5c'}
                  fillOpacity={n.open ? (isJunction ? 0.55 : 0.95) : 0.9}
                  stroke={onRoute ? '#ffffff' : 'rgba(255,255,255,0.55)'}
                  strokeWidth={onRoute ? 3 : 1.5}
                  strokeDasharray={n.open ? undefined : '4 3'}
                />
                {!isJunction && (
                  <text textAnchor="middle" dy="0.36em" className="node-emoji" fontSize={n.open ? 15 : 13}>
                    {n.open ? meta.emoji : '🚫'}
                  </text>
                )}
                {!isJunction && (
                  <text
                    y={n.y < 120 ? r + 16 : n.y > 700 ? -r - 8 : r + 16}
                    textAnchor="middle"
                    className={`node-label${n.open ? '' : ' node-label--closed'}`}
                  >
                    {n.name}
                  </text>
                )}
                {(isStart || isGoal) && (
                  <g transform={`translate(0 ${-r - 10})`}>
                    <rect x="-16" y="-13" width="32" height="18" rx="9" fill={isStart ? '#4ade80' : '#ff2d95'} />
                    <text textAnchor="middle" dy="1" className="endpoint-tag">{isStart ? '起' : '终'}</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <MapLegend />
    </div>
  );
}

function BlockedBadge({ x, y }: { x: number; y: number }) {
  const w = 44;
  return (
    <g transform={`translate(${x - w / 2} ${y - 11})`} pointerEvents="none">
      <rect width={w} height={22} rx={11} fill="rgba(255,59,92,0.18)" stroke="#ff3b5c" strokeWidth={1} />
      <text x={w / 2} y={15} textAnchor="middle" className="blocked-tag">封控</text>
    </g>
  );
}

function MapLegend() {
  return (
    <div className="map-legend">
      <span className="legend-title">人流</span>
      {CROWD_META.map((c) => (
        <span key={c.label} className="legend-item">
          <i style={{ background: c.color }} />
          {c.label}
        </span>
      ))}
      <span className="legend-item">
        <i className="legend-blocked" />
        封控
      </span>
    </div>
  );
}
