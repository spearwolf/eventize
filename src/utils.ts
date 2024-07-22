/* eslint-disable no-console */
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

export const warn = hasConsole
  ? console[console.warn ? 'warn' : 'log'].bind(console, LOG_NAMESPACE)
  : () => {};

type PropertyKey = string | symbol;
type PropertyValue = any;

export const definePublicPropertyRO = <T extends object>(
  obj: T,
  name: PropertyKey,
  value: PropertyValue,
): T => {
  Object.defineProperty(obj, name, {
    value,
    configurable: true,
    enumerable: true,
  });
  return obj;
};

export const definePublicPropertiesRO = <T extends object>(
  obj: T,
  attrs: Record<PropertyKey, PropertyValue>,
): T => {
  const keys = Object.keys(attrs);
  const len = keys.length;
  for (let i = 0; i < len; i += 1) {
    definePublicPropertyRO(obj, keys[i], attrs[keys[i]]);
  }
  return obj;
};

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
