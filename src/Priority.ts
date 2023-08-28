import type {EventizePriority} from './types';

export const Priority: EventizePriority = {
  Max: Number.POSITIVE_INFINITY,
  AAA: 1000000000,
  BB: 1000000,
  C: 1000,
  Default: 0,
  Low: -10000,
  Min: Number.NEGATIVE_INFINITY,
};
