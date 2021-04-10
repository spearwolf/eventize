import {EVENT_CATCH_EM_ALL} from './constants';
import {EventName} from './types';

export const isCatchEmAll = (eventName: unknown): eventName is string =>
  eventName === EVENT_CATCH_EM_ALL;

export const isEventName = (eventName: unknown): eventName is EventName => {
  switch (typeof eventName) {
    case 'string':
    case 'symbol':
      return true;
    default:
      return false;
  }
};
