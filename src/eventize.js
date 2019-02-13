import injectEventizeApi from './inject';

import {
  EVENT_CATCH_EM_ALL,
  NAMESPACE,
  PRIO_A,
  PRIO_B,
  PRIO_C,
  PRIO_DEFAULT,
  PRIO_LOW,
  PRIO_MAX,
  PRIO_MIN,
} from './constants';

function eventize(obj) {
  return injectEventizeApi(obj);
}

eventize.inject = injectEventizeApi;

eventize.extend = obj => injectEventizeApi(Object.create(obj));

eventize.create = (obj) => {
  const eventizer = injectEventizeApi({});
  eventizer.on(EVENT_CATCH_EM_ALL, PRIO_DEFAULT, obj);
  return eventizer;
};

eventize.is = obj => !!(obj && obj[NAMESPACE]);

Object.assign(eventize, {
  PRIO_MAX,
  PRIO_A,
  PRIO_B,
  PRIO_C,
  PRIO_DEFAULT,
  PRIO_LOW,
  PRIO_MIN,
});

export {
  EVENT_CATCH_EM_ALL,
  NAMESPACE,
  PRIO_MAX,
  PRIO_A,
  PRIO_B,
  PRIO_C,
  PRIO_DEFAULT,
  PRIO_LOW,
  PRIO_MIN,
};

export default eventize;
