import type {EventizePriority} from './types';

export const Priority: EventizePriority = {
  Max: Number.POSITIVE_INFINITY,
  Critical: 1e9,
  High: 1e6,
  Medium: 1e3,
  Normal: 0,
  Low: -1e4,
  Min: Number.NEGATIVE_INFINITY,
  // Legacy aliases — deprecated, see EventizePriority. `C` is the reason
  // `Medium` exists: its value sits between High and Normal and was never an
  // alias of anything.
  AAA: 1e9,
  BB: 1e6,
  C: 1e3,
  Default: 0,
};
