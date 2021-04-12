import {EVENT_CATCH_EM_ALL} from './constants';
import {injectEventizeApi} from './injectEventizeApi';
import {isEventized} from './isEventized';
import {
  PRIO_A,
  PRIO_B,
  PRIO_C,
  PRIO_DEFAULT,
  PRIO_LOW,
  PRIO_MAX,
  PRIO_MIN,
} from './priorities';
import {EventizeApi, EventizeFuncApi} from './types';

export const eventize: EventizeFuncApi = (() => {
  const api = <T extends Object>(obj: T): T & EventizeApi =>
    injectEventizeApi(obj);

  api.inject = injectEventizeApi;

  api.extend = <T extends Object>(obj: T): T & EventizeApi =>
    injectEventizeApi(Object.create(obj));

  api.create = (obj: Object): EventizeApi => {
    const eventizer = injectEventizeApi({});
    eventizer.on(EVENT_CATCH_EM_ALL, PRIO_DEFAULT, obj);
    return eventizer;
  };

  api.is = isEventized;

  return Object.assign(api, {
    PRIO_MAX,
    PRIO_A,
    PRIO_B,
    PRIO_C,
    PRIO_DEFAULT,
    PRIO_LOW,
    PRIO_MIN,
  });
})();

export interface Eventize extends EventizeApi {}

export class Eventize {
  constructor() {
    eventize(this);
  }
}
