import type { GraphSnapshot, RoutePlan } from '../types';
import { crowdColor, crowdLabel } from '../constants';

interface RouteCardProps {
  route: RoutePlan;
  graph: GraphSnapshot;
  active: boolean;
  index: number;
  onSelect: () => void;
}

export default function RouteCard({ route, graph, active, index, onSelect }: RouteCardProps) {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
  const { stats } = route;

  return (
    <button className={`route-card${active ? ' route-card--active' : ''}`} onClick={onSelect} type="button">
      <div className="route-card__head">
        <span className="route-card__no">方案 {index + 1}</span>
        <span className="route-card__badge">{route.badge}</span>
      </div>
      <div className="route-card__title">{route.label}</div>
      <div className="route-card__desc">{route.desc}</div>

      <div className="route-card__stats">
        <div className="stat stat--time">
          <b>{stats.totalMinutes}</b>
          <span>分钟</span>
        </div>
        <div className="stat">
          <b>{stats.totalDistance}</b>
          <span>米</span>
        </div>
        <div className="stat">
          <b className="stat__crowd" style={{ color: crowdColor(stats.maxCrowd) }}>
            {crowdLabel(stats.maxCrowd)}
          </b>
          <span>最高人流</span>
        </div>
        <div className="stat">
          <b>{stats.crowdedMeters}</b>
          <span>米拥挤段</span>
        </div>
      </div>

      <div className="route-card__path">
        <span className="path-label">途经：</span>
        <span className="path-chain">
          {route.nodePath.map((id, i) => {
            const seg = i > 0 ? route.segments[i - 1] : null;
            return (
              <span key={`${id}-${i}`} className="path-node">
                {seg && (
                  <span className="path-arrow">
                    <i className="dot" style={{ background: crowdColor(seg.crowd) }} title={crowdLabel(seg.crowd)} />
                    →
                  </span>
                )}
                {name(id)}
              </span>
            );
          })}
        </span>
      </div>
    </button>
  );
}
