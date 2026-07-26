import {EventKeeper} from './EventKeeper';
import {EventStore} from './EventStore';
import {NAMESPACE} from './constants';
import {isEventized} from './isEventized';
import type {EventizedObject} from './types';
import {defineHiddenPropertyRO} from './utils';

export function asEventized<T extends object>(obj: T): T & EventizedObject {
  if (isEventized(obj)) {
    // it already has the interface - no need to inject it again
    return obj;
  }

  if (!Object.isExtensible(obj)) {
    // `Object.isExtensible()` covers `Object.freeze()`, `Object.seal()` and
    // `Object.preventExtensions()` alike — the native `TypeError` that
    // `defineHiddenPropertyRO()` would otherwise throw here names neither
    // eventize nor the actual cause. Kept as a `TypeError` so code that
    // distinguishes on error class sees the same class as before, just with
    // a message that says why. Checked after the `isEventized()` guard
    // above, so an object that was eventized *before* it got frozen never
    // reaches this branch.
    throw new TypeError(
      'eventize() cannot attach to a non-extensible object — eventize before freezing, or eventize a wrapper',
    );
  }

  const store = new EventStore();
  const keeper = new EventKeeper();

  defineHiddenPropertyRO(obj, NAMESPACE, {keeper, store});

  return obj as T & EventizedObject;
}
