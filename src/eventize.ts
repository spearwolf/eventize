import {Priority} from './Priority';
import {EVENT_CATCH_EM_ALL} from './constants';
import {injectEventizeApi} from './injectEventizeApi';
import {isEventized} from './isEventized';
import type {EventizeApi, EventizeFuncApi} from './types';

export const eventize: EventizeFuncApi = (() => {
  const api = <T extends Object>(obj: T): T & EventizeApi =>
    injectEventizeApi(obj);

  api.inject = injectEventizeApi;

  api.extend = <T extends Object>(obj: T): T & EventizeApi =>
    injectEventizeApi(Object.create(obj));

  api.create = (obj: Object): EventizeApi => {
    const eventizer = injectEventizeApi({});
    eventizer.on(EVENT_CATCH_EM_ALL, Priority.Default, obj);
    return eventizer;
  };

  api.is = isEventized;
  api.Priority = Priority;

  return api;
})();

export interface Eventize extends EventizeApi {}

export class Eventize {
  constructor() {
    eventize(this);
  }
}
