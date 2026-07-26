import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_FUNC,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
} from './constants';

import type {EventName, EventArgs, ListenerObjectType} from './types';
import {isCatchEmAll, isEventName} from './utils';

type EmitFnType = Function | undefined;
type CallAfterApplyFnType = (() => void) | undefined;
type ReturnValue = (retVal: any) => void;

/**
 * A dispatch target seen from the inside: event-named members that may or may
 * not be functions, plus the optional `emit()` fallback spelled out so that
 * `noPropertyAccessFromIndexSignature` allows `.emit`. Nothing trusts a member
 * to be callable — `apply()` checks before it invokes.
 */
type ObjListener = Record<EventName, unknown> & {emit?: EmitFnType};

/**
 * Narrows anything a member can be read off. Non-nullish is the entire runtime
 * precondition for property access, so the predicate asserts nothing the check
 * doesn't establish; whatever comes back stays `unknown` until `apply()` has
 * seen it is a function.
 */
const canReadMembers = (obj: unknown): obj is ObjListener => obj != null;

/**
 * Returns true when `func` was actually callable and got invoked. Takes
 * `unknown` rather than a function type: every call site feeds it a member
 * read off a listener object, and the callability test below is the only
 * thing that may decide the question.
 */
const apply = (
  context: unknown,
  func: unknown,
  args: EventArgs,
  returnValue?: ReturnValue,
): boolean => {
  if (typeof func === 'function') {
    const retVal = func.apply(context, args);
    if (retVal != null) {
      returnValue?.(retVal);
    }
    return true;
  }
  return false;
};

const emit = (
  eventName: EventName,
  listener: ObjListener,
  args: EventArgs,
  returnValue?: ReturnValue,
): boolean =>
  apply(listener, listener.emit, [eventName].concat(args), returnValue);

/**
 * Returns the LISTENER_IS_* tag for a listener, or undefined for a type that
 * cannot be one. `_subscribeTo()` rejects those before they reach here, so the
 * undefined branch is unreachable in practice — but the type must say so
 * rather than lie about it.
 *
 * `typeof null === 'object'`, hence the explicit null check.
 *
 * The tag is what `EventStore.isSimilar()` compares. It is deliberately *not*
 * what `apply()` dispatches on — see the note there.
 */
const detectListenerType = (listener: unknown): number | undefined => {
  switch (typeof listener) {
    case 'function':
      return LISTENER_IS_FUNC;
    case 'string':
    case 'symbol':
      return LISTENER_IS_NAMED_FUNC;
    case 'object':
      return listener === null ? undefined : LISTENER_IS_OBJ;
    default:
      return undefined;
  }
};

let lastId = 0;
const createUniqId = () => ++lastId;

export class EventListener {
  readonly id: number;
  readonly eventName: EventName;
  readonly isCatchEmAll: boolean;
  readonly priority: number;
  // Not readonly: detach() nulls these on removal so a retained unsubscribe
  // handle can't keep the emitter graph alive. Nothing inside this package
  // writes to them outside detach(), and consumers have no reason to either.
  listener: unknown;
  listenerObject: ListenerObjectType;
  // Read by EventStore.isSimilar(), which needs a value it can compare with
  // `===`. Never read by apply() — see the note there.
  readonly listenerType: number | undefined;
  callAfterApply: CallAfterApplyFnType;
  isRemoved: boolean;
  refCount: number;

  constructor(
    eventName: EventName,
    priority: number,
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
  isEqual(listener: unknown, listenerObject: unknown = null): boolean {
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

  /**
   * Marks the listener as removed and releases everything it holds. Removed
   * listeners are spliced out of their bucket, so nothing looks them up
   * again; `apply()` bails on `isRemoved` before touching any of the nulled
   * fields.
   */
  detach(): void {
    this.isRemoved = true;
    this.listener = null;
    this.listenerObject = null;
    this.callAfterApply = undefined;
  }

  // `args` defaults rather than staying `EventArgs | undefined`: the two
  // internal helpers below would otherwise have to thread the undefined
  // through, and `emit()` would concat it into the argument list as a literal
  // `undefined`. Every caller (_emitOne, EventKeeper.replayTo) passes an array.
  //
  // The three branches test `listener` directly instead of switching on the
  // numeric `listenerType`, because a number is not something TypeScript can
  // narrow a value from — the numeric switch needed four suppressions to reach
  // the same three shapes. The tests below are the same ones
  // `detectListenerType()` makes, in the same order, and they cannot disagree
  // with the tag: `listenerType` is readonly, `listener` is written only by the
  // constructor and by `detach()`, and a detached listener never gets here.
  apply(
    eventName: EventName,
    args: EventArgs = [],
    returnValue?: ReturnValue,
  ): void {
    if (this.isRemoved) return;

    const {listener, listenerObject} = this;

    // LISTENER_IS_FUNC
    if (typeof listener === 'function') {
      apply(listenerObject, listener, args, returnValue);
      // Unconditional: a function listener is callable by construction, so the
      // dispatch above always invoked it. Nothing to survive here.
      if (this.callAfterApply) this.callAfterApply();
      return;
    }

    // LISTENER_IS_NAMED_FUNC
    if (isEventName(listener)) {
      const didCall =
        canReadMembers(listenerObject) &&
        apply(listenerObject, listenerObject[listener], args, returnValue);
      // A once() must survive a dispatch that found no method — late-bound
      // listener objects are a normal pattern, and so is a listener object
      // that is not there at all.
      if (didCall && this.callAfterApply) this.callAfterApply();
      return;
    }

    // LISTENER_IS_OBJ
    if (!canReadMembers(listener)) return;

    if (this.isCatchEmAll || this.eventName === eventName) {
      const didCall =
        apply(listener, listener[eventName], args, returnValue) ||
        emit(eventName, listener, args, returnValue);
      if (didCall && this.callAfterApply) this.callAfterApply();
    }
  }
}
