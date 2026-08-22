import type { SwipeDeckConfig } from './types';

/** The original demo's tuning, named (design F5). */
export const DEFAULT_CONFIG: SwipeDeckConfig = {
  visibleCards: 5,
  stackOffsetY: 23,
  stackScaleStep: 0.07,
  maxRotationRad: Math.PI / 20,
  swipeThresholdRatio: 1 / 3,
  exitDistanceRatio: 1.5,
};
