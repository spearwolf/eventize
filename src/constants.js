export const EVENT_CATCH_EM_ALL = '*';

export const LISTENER_UNKNOWN       = 0;
export const LISTENER_IS_FUNC       = 1;
export const LISTENER_IS_NAMED_FUNC = 2;
export const LISTENER_IS_OBJ        = 4;

export const PRIO_MAX     = Number.POSITIVE_INFINITY;
export const PRIO_A       = 1000000000;
export const PRIO_B       = 1000000;
export const PRIO_C       = 1000;
export const PRIO_DEFAULT = 0;
export const PRIO_LOW     = -10000;
export const PRIO_MIN     = Number.NEGATIVE_INFINITY;

export const NAMESPACE = (() => {
  if (!Symbol.eventize) {
    Symbol.eventize = Symbol('eventize');
  }
  return Symbol.eventize;
})();

export const LOG_NAMESPACE = '[@spearwolf/eventize]';
