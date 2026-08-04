import {internalsOf} from './internals';
import {isEventized} from './isEventized';

/**
 * How many listeners are currently subscribed on `o`, across all event
 * names and priorities.
 *
 * Returns `0` for an object that was never eventized rather than throwing —
 * safe to call before checking `isEventized(o)`.
 */
export const getSubscriptionCount = (o: object): number => {
  if (isEventized(o)) {
    // No optional chaining: `isEventized()` is exactly the test that the
    // marker slot is populated, so reaching for it afterwards cannot miss.
    return internalsOf(o).store.getSubscriptionCount();
  }
  return 0;
};
