export type NodeType = 'exit' | 'stage' | 'food' | 'restroom' | 'junction';

export interface MapNode {
  id: string;
  name: string;
  type: NodeType;
  x: number;
  y: number;
  open: boolean;
}

export interface MapEdge {
  key: string;
  a: string;
  b: string;
  distance: number;
  blocked: boolean;
  crowd: number; // 0..4
}

export interface GraphSnapshot {
  updatedAt: string;
  nodeTypes: Record<string, { label: string }>;
  nodes: MapNode[];
  edges: MapEdge[];
}

export interface RouteSegment {
  key: string;
  from: string;
  to: string;
  distance: number;
  crowd: number;
  minutes: number;
}

export interface RouteStats {
  totalDistance: number;
  totalMinutes: number;
  avgCrowd: number;
  maxCrowd: number;
  crowdedMeters: number;
}

export interface RoutePlan {
  mode: string;
  label: string;
  badge: string;
  desc: string;
  nodePath: string[];
  edgePath: string[];
  segments: RouteSegment[];
  stats: RouteStats;
}

export interface RoutesResponse {
  start: string;
  goal: string;
  updatedAt: string;
  routes: RoutePlan[];
}
