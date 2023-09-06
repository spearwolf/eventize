import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_FUNC,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
} from './constants';

import type {EventName, EventArgs, ListenerObjectType} from './types';
import {isCatchEmAll} from './utils';

type EmitFnType = Function | undefined;
type CallAfterApplyFnType = (() => void) | undefined;

const apply = (context: unknown, func: EmitFnType, args: EventArgs) => {
  if (typeof func === 'function') {
    func.apply(context, args);
  }
};

const emit = (
  eventName: EventName,
  listener: {emit: EmitFnType},
  args: EventArgs,
) => apply(listener, listener.emit, [eventName].concat(args));

const detectListenerType = (listener: unknown) => {
  switch (typeof listener) {
    case 'function':
      return LISTENER_IS_FUNC;
    case 'string':
    case 'symbol':
      return LISTENER_IS_NAMED_FUNC;
    case 'object':
      return LISTENER_IS_OBJ;
  }
};

let lastId = 0;
const createUniqId = () => ++lastId;

export class EventListener {
  readonly id: number;
  readonly eventName: EventName;
  readonly isCatchEmAll: boolean;
  readonly priority: number | undefined;
  readonly listener: unknown;
  readonly listenerObject: ListenerObjectType;
  readonly listenerType: number;
  callAfterApply: CallAfterApplyFnType;
  isRemoved: boolean;
  refCount: number;

  constructor(
    eventName: EventName,
    priority: number | undefined,
    listener: unknown,
    listenerObject: ListenerObjectType = null,
  ) {
    this.id = createUniqId();
    this.eventName = eventName;
    this.isCatchEmAll = isCatchEmAll(eventName);
    this.listener = listener;
    this.listenerObject = listenerObject;
    this.priority = priority;
    this.listenerType = detectListenerType(listener);
    this.callAfterApply = undefined;
    this.isRemoved = false;
    this.refCount = 1;
  }

  /** In the test for equality, the priority is not considered */
  isEqual(
    listener: unknown,
    listenerObject: ListenerObjectType = null,
  ): boolean {
    if (listener === this) return true;
    const typeofListener = typeof listener;
    if (typeofListener === 'number' && listener === this.id) return true;
    if (
      listenerObject === null &&
      (typeofListener === 'string' || typeofListener === 'symbol')
    ) {
      if (listener === EVENT_CATCH_EM_ALL) return true;
      if (listener === this.eventName) return true;
      return false;
    }
    return this.listener === listener && this.listenerObject === listenerObject;
  }

  apply(eventName: EventName, args?: EventArgs): void {
    if (this.isRemoved) return;

    const {listener, listenerObject} = this;

    switch (this.listenerType) {
      case LISTENER_IS_FUNC:
        // @ts-ignore
        apply(listenerObject, listener, args);
        if (this.callAfterApply) this.callAfterApply();
        break;

      case LISTENER_IS_NAMED_FUNC:
        // @ts-ignore
        apply(listenerObject, listenerObject[listener], args);
        if (this.callAfterApply) this.callAfterApply();
        break;

      case LISTENER_IS_OBJ: {
        // @ts-ignore
        const func = listener[eventName];
        if (this.isCatchEmAll || this.eventName === eventName) {
          if (typeof func === 'function') {
            func.apply(listener, args);
          } else {
            // @ts-ignore
            emit(eventName, listener, args);
          }
          if (this.callAfterApply) this.callAfterApply();
        }
        break;
      }
    }
  }
}
