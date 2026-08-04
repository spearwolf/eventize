import {internalsOf} from './internals';
import {isEventized} from './isEventized';
import type {EventName} from './types';

/**
 * Every event name with at least one active listener — named events plus
 * `EVENT_CATCH_EM_ALL` if any wildcard listener is registered.
 *
 * The counterpart to `getRetainedEventNames()` for the listener half of an
 * emitter's state: `getSubscriptionCount()` says how many, this says which.
 * Folding the wildcard flag into the same array means
 * `getSubscribedEventNames(ε).length === 0` covers both halves the way
 * `getSubscriptionCount(ε) === 0` does — a single read tells a teardown
 * assertion whether *anything* is still subscribed, not just how many named
 * events are.
 *
 * Iteration order is unspecified. It happens to come back as `namedBuckets`'
 * `Map` insertion order today, with the wildcard name always last regardless
 * of when it was subscribed — but that is `EventStore`'s storage shape
 * leaking through, not a promise this function makes, so a name that is
 * dropped and resubscribed is not guaranteed to keep its old position and
 * nothing here is pinned against the order changing. Treat the result as a
 * set; sort it yourself if a stable order matters to the caller.
 */
export const getSubscribedEventNames = (o: object): EventName[] => {
  if (isEventized(o)) {
    // No optional chaining: `isEventized()` is exactly the test that the
    // marker slot is populated, so reaching for it afterwards cannot miss.
    return internalsOf(o).store.getSubscribedEventNames();
  }
  return [];
};
