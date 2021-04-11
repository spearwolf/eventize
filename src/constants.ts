export const EVENT_CATCH_EM_ALL = '*';

export const LISTENER_UNKNOWN = 0;
export const LISTENER_IS_FUNC = 1;
export const LISTENER_IS_NAMED_FUNC = 2;
export const LISTENER_IS_OBJ = 4;

export const NAMESPACE: symbol = (() => {
  // @ts-ignore
  if (!Symbol.eventize) {
    // @ts-ignore
    Symbol.eventize = Symbol('eventize');
  }
  // @ts-ignore
  return Symbol.eventize;
})();

export const LOG_NAMESPACE = '[eventize]';
