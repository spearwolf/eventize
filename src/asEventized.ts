import {EventKeeper} from './EventKeeper';
import {EventStore} from './EventStore';
import {NAMESPACE, PROTOCOL_VERSION} from './constants';
import {internalsOf} from './internals';
import {isEventized} from './isEventized';
import type {EventizedObject} from './types';
import {defineSealedHiddenProperty} from './utils';

export function asEventized<T extends object>(obj: T): T & EventizedObject {
  if (isEventized(obj)) {
    // it already has the interface - no need to inject it again.
    //
    // Which interface, though? The marker key is realm-wide, so a slot filled
    // by another copy of the library looks exactly like our own from here.
    // internalsOf() is the one place that asks — the return value is of no
    // use at this point, the throw is. Returning a foreign emitter silently
    // would hand the caller an object that breaks a few calls later, in a
    // frame that explains nothing.
    internalsOf(obj);
    return obj;
  }

  if (!Object.isExtensible(obj)) {
    // `Object.isExtensible()` covers `Object.freeze()`, `Object.seal()` and
    // `Object.preventExtensions()` alike — the native `TypeError` that
    // `defineSealedHiddenProperty()` would otherwise throw here names neither
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

  defineSealedHiddenProperty(obj, NAMESPACE, {
    protocol: PROTOCOL_VERSION,
    keeper,
    store,
  });

  return obj as T & EventizedObject;
}
