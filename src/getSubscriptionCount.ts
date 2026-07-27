import {internalsOf} from './internals';
import {isEventized} from './isEventized';

export const getSubscriptionCount = (o: object): number => {
  if (isEventized(o)) {
    // No optional chaining: `isEventized()` is exactly the test that the
    // marker slot is populated, so reaching for it afterwards cannot miss.
    return internalsOf(o).store.getSubscriptionCount();
  }
  return 0;
};
