import type { NodeType } from './types';

export const TYPE_META: Record<NodeType, { label: string; color: string; emoji: string; pickable: boolean }> = {
  stage: { label: '舞台', color: '#ff2d95', emoji: '🎸', pickable: true },
  food: { label: '餐饮', color: '#ffb020', emoji: '🍜', pickable: true },
  restroom: { label: '洗手间', color: '#22d3ee', emoji: '🚻', pickable: true },
  exit: { label: '出口', color: '#4ade80', emoji: '🚪', pickable: true },
  junction: { label: '路口', color: '#8b93b8', emoji: '', pickable: false }
};

// 人流 0..4 对应的路段配色与文字
export const CROWD_META = [
  { label: '畅通', color: '#4ade80' },
  { label: '顺畅', color: '#a3e635' },
  { label: '适中', color: '#facc15' },
  { label: '拥挤', color: '#fb923c' },
  { label: '非常拥挤', color: '#ef4444' }
];

export const crowdLabel = (c: number) => CROWD_META[c]?.label ?? '未知';
export const crowdColor = (c: number) => CROWD_META[c]?.color ?? '#6b7194';
