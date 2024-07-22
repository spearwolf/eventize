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

  const store = new EventStore();
  const keeper = new EventKeeper();

  defineHiddenPropertyRO(obj, NAMESPACE, {keeper, store});

  return obj as T & EventizedObject;
}
