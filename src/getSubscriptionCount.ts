import {EventStore} from './EventStore';
import {NAMESPACE} from './constants';
import {isEventized} from './isEventized';
import { EventizedObject } from './types.js';

export const getSubscriptionCount = (o: object): number => {
  if (isEventized(o)) {
    return (
      (
        (o as EventizedObject)[NAMESPACE]?.store as EventStore | undefined
      )?.getSubscriptionCount() ?? 0
    );
  }
  return 0;
};
