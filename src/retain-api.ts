import {asEventized} from './asEventized';
import {EVENT_CATCH_EM_ALL} from './constants';
import {internalsOf} from './internals';
import {isEventized} from './isEventized';
import type {
  AnyEventNames,
  EventKeysOf,
  EventMap,
  EventizedObject,
  NonTypedEmitter,
} from './types';

const hasWildcard = (eventNames: unknown): boolean =>
  Array.isArray(eventNames)
    ? eventNames.some((name) => name === EVENT_CATCH_EM_ALL)
    : eventNames === EVENT_CATCH_EM_ALL;

// ---------------------------------------------------------------------------
// retain() / retainClear() / unretain() — typed event-name overload first.
// ---------------------------------------------------------------------------

export function retain<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>,
): void;
export function retain<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
): void;
// implementation
export function retain(obj: object, eventNames: AnyEventNames): void {
  if (hasWildcard(eventNames)) {
    throw new Error(
      "retain() must be called with a concrete event name — '*' is reserved for subscribing to all events and cannot be retained",
    );
  }
  const eventizedObj = asEventized(obj);
  const {keeper} = internalsOf(eventizedObj);
  keeper.add(eventNames);
}

export function retainClear<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>,
): void;
export function retainClear<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
): void;
// implementation
export function retainClear(
  eventizedObj: object,
  eventNames: AnyEventNames,
): void {
  if (!isEventized(eventizedObj)) {
    throw new TypeError(
      'retainClear() cannot operate on a non-eventized object — eventize(obj) first, or guard the call with isEventized(obj)',
    );
  }
  const {keeper} = internalsOf(eventizedObj);
  if (hasWildcard(eventNames)) {
    keeper.clearAll();
    return;
  }
  keeper.clear(eventNames);
}

export function unretain<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>,
): void;
export function unretain<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
): void;
// implementation
export function unretain(
  eventizedObj: object,
  eventNames: AnyEventNames,
): void {
  if (!isEventized(eventizedObj)) {
    throw new TypeError(
      'unretain() cannot operate on a non-eventized object — eventize(obj) first, or guard the call with isEventized(obj)',
    );
  }
  const {keeper} = internalsOf(eventizedObj);
  if (hasWildcard(eventNames)) {
    keeper.removeAll();
    return;
  }
  keeper.remove(eventNames);
}
