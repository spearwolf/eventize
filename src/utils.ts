import {LOG_NAMESPACE, EVENT_CATCH_EM_ALL} from './constants';
import type {EventName} from './types';

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

export const hasConsole = typeof console !== 'undefined';

// `console.warn` is non-optional in lib.dom, so a truthiness test on it reads
// as always-true to the compiler (TS2774). The typeof form keeps the same
// runtime guard for hosts whose console is narrower than the type claims.
export const warn = hasConsole
  ? console[typeof console.warn === 'function' ? 'warn' : 'log'].bind(
      console,
      LOG_NAMESPACE,
    )
  : () => {};

type PropertyKey = string | symbol;
type PropertyValue = any;

export const defineHiddenPropertyRO = <T extends object>(
  obj: T,
  name: PropertyKey,
  value: PropertyValue,
): T => {
  Object.defineProperty(obj, name, {
    value,
    configurable: true,
  });
  return obj;
};
