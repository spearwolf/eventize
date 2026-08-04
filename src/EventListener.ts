import {
  LISTENER_IS_FUNC,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
} from './constants';

import type {EventName, EventArgs, ListenerObjectType} from './types';
import type {DispatchTarget} from './utils';
import {
  dispatchToTarget,
  invokeListener,
  isCatchEmAll,
  isEventName,
} from './utils';

// The watermark is the obligation sequence counter's value immediately before
// this dispatch invoked the listener — read there, not inside this callback,
// because a handler that re-subscribes itself with once() aggregates onto the
// very listener being dispatched and appends its brand-new obligation to that
// same array before this ever runs. Settling has to discharge only the
// obligations stamped below this watermark, or a once() armed from inside its
// own dispatch is discharged before it ever gets to fire. See the sequence
// counter next to `OnceObligation` for why this is a stamped number and not a
// count of array entries.
type CallAfterApplyFnType = ((watermark: number) => void) | undefined;
// A listener may return anything, and this callback only forwards it into
// emitAsync()'s collector — nothing here inspects the value, so `unknown` is
// the accurate type. `any` would let a caller do arithmetic on it unchecked.
type ReturnValue = (retVal: unknown) => void;

/**
 * Narrows a *listener object* — the thing a method-name subscription reads its
 * method off. Non-nullish is the entire runtime precondition for property
 * access, so the predicate asserts nothing the check doesn't establish; what
 * comes back stays `unknown` until `apply()` has seen it is a function. A
 * function qualifies on purpose: `on(ε, 'foo', 'reset', SomeClass)` is a
 * supported shape.
 */
const canReadMembers = (obj: unknown): obj is DispatchTarget => obj != null;

/**
 * Narrows a *listener* that is itself the dispatch target. Stricter than
 * `canReadMembers()` by exactly the primitives, and it has to be: every
 * primitive carries a prototype whose method names an event can collide with,
 * so `on(ε, 'toFixed', 42)` would otherwise dispatch to `Number.prototype`,
 * feed the result into the `emitAsync()` aggregation and consume a `once()`.
 * This is the same test `detectListenerType()` makes for LISTENER_IS_OBJ.
 */
const isObjListener = (obj: unknown): obj is DispatchTarget =>
  obj != null && typeof obj === 'object';

// The domain of the LISTENER_IS_* tags, spelled out as literals rather than
// mirrored with `typeof LISTENER_IS_OBJ` and friends: a `typeof` alias tracks
// whatever the constant happens to hold, so a typo'd constant (`= 5` instead
// of `= 4`) would recompute the union around the mistake and hide it. The
// hardcoded `1 | 2 | 4` is what makes that same typo a `TS2322` where
// `LISTENER_IS_OBJ` is returned as this type.
type ListenerTypeTag = 1 | 2 | 4;

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
export const detectListenerType = (
  listener: unknown,
): ListenerTypeTag | undefined => {
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

// A listener's own `onceObligations` array is not a stable timeline: releasing
// a handle (EventStore.releaseObligation()) or a force-removal (detach()) can
// splice an obligation out of the *middle* of it, which shifts every later
// entry left. A position — "the first N entries" — stops meaning "the ones
// that existed before this dispatch" the moment that happens: an obligation
// created *during* a dispatch can end up sitting at the same index one
// removed *from* that same array a moment earlier just vacated, and a
// position-based watermark would settle it as if it had been there all along.
// A number stamped once at creation and never touched again has no such
// problem — wherever the obligation ends up in whatever array, the number
// that says when it was created stays exactly what it always was. Same
// pattern as `EventListener.lastId` above and `EventKeeper.nextOrderId`: a
// module-global counter, scoped to one loaded module instance rather than one
// realm. That scoping is safe for `lastId`: a mis-ordered comparison there
// only reorders equal-priority listeners, and every listener `lastId` is ever
// compared against belongs to the same emitter, hence the same module
// instance that constructed it. It is not safe here in the same way:
// `asEventized()`'s marker is realm-wide by design, so if both the ESM and
// CJS builds are loaded against the same objects, a store obtained from one
// module instance can still receive a listener `new EventListener()`'d by the
// other — `EventStore.add()` matches structurally, not by module identity —
// and gain an obligation whose `sequence` was stamped by that other
// instance's counter. That listener's `apply()` then reads its watermark from
// *this* instance's counter, which shares nothing with the counter that
// stamped the obligation; if the foreign counter is ahead, `sequence <
// watermark` is never true and the obligation never discharges — a `once()`
// that fires on every emit instead of settling once. Loading both builds
// against the same eventized objects is unsupported for exactly this reason,
// not merely a guarantee this counter happens to provide. See AGENTS.md,
// "Counters are per module instance".
let nextObligationSequence = 0;

/**
 * One `once()` call's promise to fire at most once. A multi-name call shares a
 * single obligation across every listener it registers, so whichever name
 * fires first discharges it for all of them — the race `once(ε, ['a','b'], h)`
 * has always been. `members` is the back-reference that makes that reachable
 * from the listener the dispatch happened on.
 *
 * `sequence` is stamped once, by `createOnceObligation()`, and never changes:
 * it is what lets `EventStore.settleOneShots()` tell "existed before this
 * dispatch" from "the callback just created it" without trusting position in
 * an array that removal can reshuffle.
 *
 * `onSettled` is the one hook the obligation offers, and it exists for exactly
 * one caller: `makeOnceUnsubscribe()` installs a closure that nulls the
 * handle's capture, and `EventStore.dischargeObligation()` clears the field and
 * runs it. That restores what the pre-aggregation wiring got for free — `once()`
 * used to install its *own* unsubscribe as `callAfterApply`, so the dispatch
 * that spent the subscription also consumed the handle and released the
 * emitter. `callAfterApply` now settles obligations rather than releasing
 * handles (one listener can carry several), so the release has to hang off the
 * obligation instead. One `once()` call makes one obligation and one handle, so
 * a single slot is the whole relationship. It stays `undefined` in two cases:
 * an obligation a spec builds directly, and one a retained replay settled from
 * inside `subscribeTo()` before there was a handle to release — that handle is
 * born spent and nulls its own capture rather than installing a hook nothing
 * would ever run. And it is nulled before it is called, so a re-entrant
 * discharge cannot run it twice.
 */
export interface OnceObligation {
  settled: boolean;
  members: EventListener[];
  readonly sequence: number;
  onSettled: (() => void) | undefined;
}

/** The only place an `OnceObligation` is ever created — see `sequence` above. */
export const createOnceObligation = (): OnceObligation => ({
  settled: false,
  members: [],
  sequence: nextObligationSequence++,
  onSettled: undefined,
});

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
  readonly listenerType: ListenerTypeTag | undefined;
  // Runs after a dispatch that actually invoked the listener. It means "settle
  // the pending one-shot obligations", not "release a handle" — one listener
  // can carry several once() registrations, and a single closure per handle
  // could only ever speak for the last one. Takes the pre-dispatch watermark
  // `apply()` captured, so it settles only the obligations stamped before the
  // dispatch began — never one the callback just added by re-subscribing.
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
   * last fall-through in `EventStore.remove()`, and since v6.0.0 it only asks
   * when the caller actually named a listener object — `off(ε, fn)` compares
   * the listener alone, at the call site. Hence no default for the second
   * parameter any more: the one caller that used to lean on it was the one
   * that no longer comes here.
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
  isEqual(listener: unknown, listenerObject: unknown): boolean {
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
    // Read before the dispatch below, not after: the callback it is about to
    // run may itself call once() and aggregate onto this very listener, which
    // appends a brand-new obligation before this method gets anywhere near
    // settling anything. The obligation sequence counter's *current* value —
    // not a count of this listener's own onceObligations entries, and not
    // derived from that array at all — is the watermark: every obligation
    // that already existed anywhere was stamped with a lower number, and
    // anything the callback creates during this dispatch gets a number at or
    // above it, regardless of where either one ends up sitting in the array.
    const watermark = nextObligationSequence;

    // Settling only after the callback below returns is also why a once()
    // whose own callback re-emits the same event before returning fires
    // twice: `isRemoved` is still false and `callAfterApply` has not run yet,
    // so the nested emit() dispatches to this same, still-live listener.
    // Not a separate defect — it falls out of two decisions kept on purpose:
    // no recursion guard (src/EventStore.ts), and a throwing listener keeps
    // its one-shot rather than losing it to an exception mid-call. See
    // docs/lifecycle.md for the consumer-facing writeup.

    // LISTENER_IS_FUNC
    if (typeof listener === 'function') {
      invokeListener(listenerObject, listener, args, returnValue);
      // Unconditional: a function listener is callable by construction, so the
      // dispatch above always invoked it. Nothing to survive here.
      if (this.callAfterApply) this.callAfterApply(watermark);
      return;
    }

    // LISTENER_IS_NAMED_FUNC
    if (isEventName(listener)) {
      const didCall =
        canReadMembers(listenerObject) &&
        invokeListener(
          listenerObject,
          listenerObject[listener],
          args,
          returnValue,
        );
      // A once() must survive a dispatch that found no method: late-bound
      // listener objects are a normal pattern, and the object may grow the
      // method between two emits. The `canReadMembers()` half is no longer
      // reachable through `on()` / `once()` — `_subscribeTo()` rejects a method
      // name without a listener object, and `detach()` only nulls the slot of a
      // listener that is already removed — so it guards what remains: a
      // directly constructed `EventListener`, which honours no such
      // precondition.
      if (didCall && this.callAfterApply) this.callAfterApply(watermark);
      return;
    }

    // LISTENER_IS_OBJ
    if (!isObjListener(listener)) return;

    if (this.isCatchEmAll || this.eventName === eventName) {
      // The member-then-emit() chain lives in dispatchToTarget(), shared with
      // the duck-typed path — including the boolean this reads: a once() is
      // spent only by a dispatch that actually invoked something.
      const didCall = dispatchToTarget(listener, eventName, args, returnValue);
      if (didCall && this.callAfterApply) this.callAfterApply(watermark);
    }
  }
}
