import type {EventKeeper} from './EventKeeper';
import {internalsOf} from './internals';
import {isEventized} from './isEventized';
import type {EventName} from './types';

const keeperOf = (o: object): EventKeeper | undefined =>
  isEventized(o) ? internalsOf(o).keeper : undefined;

/**
 * How many events currently hold a retained value.
 *
 * The counterpart to `getSubscriptionCount()` for the other half of an
 * emitter's state. A name that carries a retain policy but has never been
 * emitted is *not* counted here — see `getRetainedEventNames()`.
 */
export const getRetainedCount = (o: object): number =>
  keeperOf(o)?.retainedCount ?? 0;

/**
 * Every event name carrying a retain policy, whether or not it has fired.
 *
 * `getRetainedEventNames(ε).length >= getRetainedCount(ε)` always holds.
 * Useful when retain() is used with dynamically generated names and the
 * caller needs to know what is still being held.
 */
export const getRetainedEventNames = (o: object): EventName[] => {
  const keeper = keeperOf(o);
  return keeper ? keeper.retainedNames() : [];
};
