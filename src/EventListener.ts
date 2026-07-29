import {
  LISTENER_IS_FUNC,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
} from './constants';

import type {EventName, EventArgs, ListenerObjectType} from './types';
import {dispatchableMember, isCatchEmAll, isEventName} from './utils';

type EmitFnType = Function | undefined;
type CallAfterApplyFnType = (() => void) | undefined;
// A listener may return anything, and this callback only forwards it into
// emitAsync()'s collector — nothing here inspects the value, so `unknown` is
// the accurate type. `any` would let a caller do arithmetic on it unchecked.
type ReturnValue = (retVal: unknown) => void;

/**
 * A dispatch target seen from the inside: event-named members that may or may
 * not be functions, plus the optional `emit()` fallback spelled out so that
 * `noPropertyAccessFromIndexSignature` allows `.emit`. Nothing trusts a member
 * to be callable — `apply()` checks before it invokes.
 */
type ObjListener = Record<EventName, unknown> & {emit?: EmitFnType};

/**
 * Narrows a *listener object* — the thing a method-name subscription reads its
 * method off. Non-nullish is the entire runtime precondition for property
 * access, so the predicate asserts nothing the check doesn't establish; what
 * comes back stays `unknown` until `apply()` has seen it is a function. A
 * function qualifies on purpose: `on(ε, 'foo', 'reset', SomeClass)` is a
 * supported shape.
 */
const canReadMembers = (obj: unknown): obj is ObjListener => obj != null;

/**
 * Narrows a *listener* that is itself the dispatch target. Stricter than
 * `canReadMembers()` by exactly the primitives, and it has to be: every
 * primitive carries a prototype whose method names an event can collide with,
 * so `on(ε, 'toFixed', 42)` would otherwise dispatch to `Number.prototype`,
 * feed the result into the `emitAsync()` aggregation and consume a `once()`.
 * This is the same test `detectListenerType()` makes for LISTENER_IS_OBJ.
 */
const isObjListener = (obj: unknown): obj is ObjListener =>
  obj != null && typeof obj === 'object';

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
 * cannot be one. This is also the filter `_subscribeTo()` applies: a value with
 * no tag never reaches the store, so a listener that arrives here always has
 * one and the undefined branch of `apply()` is unreachable through the public
 * API. It stays reachable by constructing an `EventListener` directly, which is
 * why `apply()` keeps its guards — the constructor is internal, not a
 * precondition anyone else honours.
 *
 * `typeof null === 'object'`, hence the explicit null check.
 *
 * The tag is what `EventStore.isSimilar()` compares. It is deliberately *not*
 * what `apply()` dispatches on — see the note there.
 */
export const detectListenerType = (listener: unknown): number | undefined => {
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

/**
 * One `once()` call's promise to fire at most once. A multi-name call shares a
 * single obligation across every listener it registers, so whichever name
 * fires first discharges it for all of them — the race `once(ε, ['a','b'], h)`
 * has always been. `members` is the back-reference that makes that reachable
 * from the listener the dispatch happened on.
 */
export interface OnceObligation {
  settled: boolean;
  members: EventListener[];
}

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
  // Runs after a dispatch that actually invoked the listener. It means "settle
  // the pending one-shot obligations", not "release a handle" — one listener
  // can carry several once() registrations, and a single closure per handle
  // could only ever speak for the last one.
  callAfterApply: CallAfterApplyFnType;
  isRemoved: boolean;
  // refCount is what on() adds — the listener lives while it is above zero,
  // independent of whatever once() obligations it also carries.
  refCount: number;
  // undefined means no pending obligations — the invariant every reader relies
  // on, and why removing the last one sets this back to undefined rather than
  // leaving an empty array. Lazy on purpose: a listener that never sees a
  // once() must not pay an allocation for the possibility. A listener is alive
  // while `refCount > 0 || onceObligations !== undefined`.
  onceObligations: OnceObligation[] | undefined;

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
    this.refCount = 0;
    this.onceObligations = undefined;
  }

  /**
   * In the test for equality, the priority is not considered.
   *
   * One shape: the `(listener, listenerObject)` pair a subscription was
   * registered with. The sole caller is `EventStore.removeByListener()`, the
   * last fall-through in `EventStore.remove()`.
   *
   * There used to be three more, all deleted for the same reason — no reachable
   * caller could ever take them. A match on the numeric `id` let
   * `off(ε, unsub.listener.id)` remove a subscription while skipping the
   * reference count every documented removal path honours. An event-name branch
   * could not be reached: `remove()` routes a name with no listener object to
   * `removeByEventName()`, and `off()` sets `forceRemove` for a name *with*
   * one, so neither shape arrives here. And a match on the listener instance
   * itself lost its last caller in v6.0.0, when association-matching removal
   * stopped collecting its victims and handing each one back in for an identity
   * search — it tests and splices in a single pass now. `remove()` no longer
   * has an `EventListener` branch at all: the unsubscribe handle gives its
   * registration back through `EventStore.release()` instead, so an
   * `EventListener` instance never reaches `remove()` to begin with.
   */
  isEqual(listener: unknown, listenerObject: unknown = null): boolean {
    return this.listener === listener && this.listenerObject === listenerObject;
  }

  /**
   * Marks the listener as removed and releases everything it holds. Removed
   * listeners are spliced out of their bucket, so nothing looks them up
   * again; `apply()` bails on `isRemoved` before touching any of the nulled
   * fields.
   *
   * `refCount` is left as it is — a detached listener is out of its bucket, so
   * no dedup search finds it again, and every reader bails on `isRemoved`
   * first. `onceObligations` is not: a force-removal (`off()`, `remove()`) does
   * not go through `EventStore.dischargeObligation()`, so nothing else ever
   * splices this listener out of the obligations it still holds. Left alone, a
   * later dispatch of some *other* member would discharge the obligation over
   * a `members` array still listing a detached listener — harmless by itself,
   * since `apply()` bails on `isRemoved`, but a bucket that grows without
   * bound is still a leak. This is the one piece of store bookkeeping `detach()`
   * has to do itself, precisely because the store isn't the one calling it here.
   */
  detach(): void {
    this.isRemoved = true;
    this.listener = null;
    this.listenerObject = null;
    this.callAfterApply = undefined;

    if (this.onceObligations !== undefined) {
      for (const obligation of this.onceObligations) {
        const idx = obligation.members.indexOf(this);
        if (idx >= 0) obligation.members.splice(idx, 1);
      }
      this.onceObligations = undefined;
    }
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
    if (!isObjListener(listener)) return;

    if (this.isCatchEmAll || this.eventName === eventName) {
      // dispatchableMember, not a raw `listener[eventName]`: a name colliding
      // with an Object.prototype member found the inherited function on any
      // object at all. Skipping it leaves the `emit()` fallback below as the
      // next link in the chain, which is what an unanswered name should reach.
      const didCall =
        apply(
          listener,
          dispatchableMember(listener, eventName),
          args,
          returnValue,
        ) || emit(eventName, listener, args, returnValue);
      if (didCall && this.callAfterApply) this.callAfterApply();
    }
  }
}
