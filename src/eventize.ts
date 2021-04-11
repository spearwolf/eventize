import {EVENT_CATCH_EM_ALL} from './constants';
import {injectEventizeApi} from './injectEventizeApi';
import {isEventized, EventizeGuard} from './isEventized';
import {
  PRIO_A,
  PRIO_B,
  PRIO_C,
  PRIO_DEFAULT,
  PRIO_LOW,
  PRIO_MAX,
  PRIO_MIN,
} from './priorities';
import {EventizeApi} from './types';

function eventize<T extends Object>(obj: T): T & EventizeApi {
  return injectEventizeApi(obj);
}

eventize.inject = injectEventizeApi;

eventize.extend = <T extends Object>(obj: T): T & EventizeApi =>
  injectEventizeApi(Object.create(obj));

eventize.create = (obj: Object): EventizeApi => {
  const eventizer = injectEventizeApi({});
  eventizer.on(EVENT_CATCH_EM_ALL, PRIO_DEFAULT, obj);
  return eventizer;
};

eventize.is = isEventized;

Object.assign(eventize, {
  PRIO_MAX,
  PRIO_A,
  PRIO_B,
  PRIO_C,
  PRIO_DEFAULT,
  PRIO_LOW,
  PRIO_MIN,
});

export interface EventizerFunc {
  <T extends Object>(obj: T): T & EventizeApi;
}

export interface EventizeFuncApi extends EventizerFunc {
  inject: EventizerFunc;
  extend: EventizerFunc;
  create(obj: Object): EventizeApi;

  is: EventizeGuard;

  PRIO_MAX: number;
  PRIO_A: number;
  PRIO_B: number;
  PRIO_C: number;
  PRIO_DEFAULT: number;
  PRIO_LOW: number;
  PRIO_MIN: number;
}

export default eventize as EventizeFuncApi;

export interface Eventize extends EventizeApi {}

export class Eventize {
  constructor() {
    eventize(this);
  }
}
