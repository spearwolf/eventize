import {EventStore} from './EventStore';
import {NAMESPACE} from './constants';
import {isEventized} from './isEventized';

export const getSubscriptionCount = (o: unknown): number => {
  if (isEventized(o)) {
    return (
      (
        (o as any)[NAMESPACE]?.store as EventStore | undefined
      )?.getSubscriptionCount() ?? 0
    );
  }
  return 0;
};
