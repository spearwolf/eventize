import {asEventized} from './asEventized';
import {EVENT_CATCH_EM_ALL} from './constants';
import {createOnceObligation} from './EventListener';
import type {EventListener, OnceObligation} from './EventListener';
import {internalsOf} from './internals';
import {isEventized} from './isEventized';
import {subscribeTo} from './subscribeTo';
import type {
  AnyEventNames,
  DefaultEventMap,
  EventArgs,
  EventKeysOf,
  EventMap,
  EventizedObject,
  NonTypedEmitter,
  OnceAsyncOptions,
  StandaloneSubscribeFunc,
  SubscribeArgs,
  UnsubscribeFunc,
} from './types';
import {isEventName, isUnknownArray} from './utils';

// The handle is idempotent by construction: a second call is inert, not a
// second release. Without the guard a shared registration was decremented
// twice by the same handle, which released a sibling handle's count. Cleanup
// code that calls a stored handle defensively ("call it again, it's a no-op")
// is exactly the shape that hit it, and `docs/off.md` promised that no-op.
//
// The nulled capture *is* the consumed flag, and that is what stops a handle
// kept after its call from pinning anything — the emitter, and with it the
// store, the keeper and every retained payload. A separate boolean would leave
// both references in the closure forever. Both go in one slot so a single null
// test releases them together and TypeScript narrows both at once.
//
// on() and once() release through two different store calls now — a listener
// list against release(), one obligation against releaseObligation() — so they
// get their own handle makers below instead of sharing one shaped around
// whichever the store used to take. A once() handle in particular holds no
// listener at all: the obligation already knows every listener it was added
// to, which is exactly what lets whichever name fires first release the
// others too. Both makers keep the same guard for the same reason: reaching
// the emitter (and through it every retained payload) from a spent handle is
// the leak this design exists to prevent, whichever shape the capture is in.
const makeOnUnsubscribe = (
  host: EventizedObject,
  listeners: EventListener | Array<EventListener>,
): UnsubscribeFunc => {
  let held: {
    host: EventizedObject;
    listeners: EventListener | Array<EventListener>;
  } | null = {host, listeners};

  return () => {
    const target = held;
    if (target === null) return;
    held = null;
    const {store} = internalsOf(target.host);
    if (Array.isArray(target.listeners)) {
      target.listeners.forEach((listener) => store.release(listener));
    } else {
      store.release(target.listeners);
    }
  };
};

// The once() handle has a second way to be spent, and it is the common one:
// the dispatch that discharges the obligation. Up to the aggregation change
// that came for free — once() installed its own unsubscribe as the listener's
// `callAfterApply`, so firing ran the handle and nulled its capture. That hook
// now settles obligations instead (one listener can carry several, and a
// single closure could only ever speak for the last), so the release hangs off
// the obligation: the handle registers `onSettled`, EventStore's
// dischargeObligation() clears the field and runs it, and a fired once()
// releases the emitter without anyone calling the handle. Anything else leaves
// every emitter whose once() has already fired pinned until the caller's
// teardown loop runs — the leak the nulled capture exists to prevent, reached
// by the one route that never reaches the closure below.
//
// Capturing {store, obligation} instead would also free the emitter, and
// earlier: the store holds no back-reference to its host. It would free it too
// early, though. A handle whose subscription is still pending must pin the
// emitter — that is deliberate, it is what makeOnUnsubscribe() does, and
// src/lifecycle.spec.ts keeps a control group on the on() side to prove a
// `collected` verdict elsewhere means anything at all. A once() whose event
// never fires is the shape on this side that relies on it.
const makeOnceUnsubscribe = (
  host: EventizedObject,
  obligation: OnceObligation,
): UnsubscribeFunc => {
  let held: {host: EventizedObject; obligation: OnceObligation} | null = {
    host,
    obligation,
  };

  if (obligation.settled) {
    // Already discharged before this handle existed: a retained replay settles
    // the obligation from inside subscribeTo(). A hook installed now would
    // never run, so the capture is released here instead — the handle is born
    // spent, which is what it is.
    held = null;
  } else {
    obligation.onSettled = () => {
      held = null;
    };
  }

  return () => {
    const target = held;
    if (target === null) return;
    held = null;
    const {store} = internalsOf(target.host);
    store.releaseObligation(target.obligation);
  };
};

// True for exactly the `off()` arguments that make EventStore.remove() empty
// the whole registry. Mirrors that method's *effective* behaviour, not just
// its condition: its array branch forwards every element back into itself with
// a null listenerObject — recursively, so a nested array re-enters that same
// branch — until a `null`, `undefined` or `'*'` at any depth lands in the
// wipe-everything branch. An array is bulk if any (flattened) element would
// be. Testing only the top level here is what left `off(ε, [[null]])`
// emptying the store two levels down while the keeper never looked past the
// first — expects an already-flattened array; see the call site in off().
const isBulkRemoval = (listener: unknown): boolean =>
  Array.isArray(listener)
    ? listener.some((item) => item == null || item === EVENT_CATCH_EM_ALL)
    : listener === EVENT_CATCH_EM_ALL;

// ---------------------------------------------------------------------------
// on() and once() take the same overload set, and it is declared once, as
// `StandaloneSubscribeFunc` in `types.ts`. Both used to carry a hand-written
// copy of it — 230 lines each, kept in step by nothing but a comment asking
// them to. The load-bearing order, the group labels and the reasoning now sit
// with the interface.
//
// Annotated, not asserted, and that is the whole safety of the arrangement:
// an annotation makes TypeScript check the implementation *against* the
// overload set on every build, so an implementation that stops satisfying the
// signatures it claims fails the build. `as` would only ask the two types to
// be comparable, which is a weaker question and one they pass even when the
// implementation is wrong — assert a `void` return here and the assertion
// still succeeds, because `(…) => UnsubscribeFunc` is assignable to
// `(…) => void` and comparability takes either direction. The annotation
// rejects it. For a set declared once so the two copies cannot drift, letting
// implementation and declaration drift instead would be a poor trade.
//
// The reverse direction is where an assertion really is unavoidable, and it is
// a different check: `SubscribeImpl` in `src/eventize.ts` widens these fixed
// arities *back* to a rest parameter, which TypeScript refuses as an
// assignment (TS2322) because no overload set accepts a spread union of
// tuples. Nothing here needs that widening. The comment on the interface says
// why either of them is a different boundary from the one AGENTS.md draws
// around the internals.
// ---------------------------------------------------------------------------

export const on: StandaloneSubscribeFunc = (
  obj: object,
  ...args: SubscribeArgs
): UnsubscribeFunc => {
  const eventizedObj = asEventized(obj);
  const {store, keeper} = internalsOf(eventizedObj);
  return makeOnUnsubscribe(eventizedObj, subscribeTo(store, keeper, args));
};

// once() — auto-unsubscribes after the first call.
export const once: StandaloneSubscribeFunc = (
  obj: object,
  ...args: SubscribeArgs
): UnsubscribeFunc => {
  const eventizedObj = asEventized(obj);
  const {store, keeper} = internalsOf(eventizedObj);
  // One obligation per call, however many names it covers. A multi-name
  // once() shares this same object across every listener it registers, which
  // is what makes firing any one of them discharge the rest — the race
  // once(ε, ['a', 'b'], h) has always promised. The auto-unsubscribe is not
  // this handle's job: the store discharges the obligation from inside the
  // dispatch that satisfies it, retained replay included, which can happen
  // before this handle even exists — releaseObligation() bails on `settled`
  // if it already did.
  const obligation = createOnceObligation();
  subscribeTo(store, keeper, args, obligation);
  return makeOnceUnsubscribe(eventizedObj, obligation);
};

// ---------------------------------------------------------------------------
// onceAsync() — typed overload first; falls back to the loose v4 signature.
// An optional AbortSignal cancels the subscription and rejects the promise,
// in the shape of fetch(). Without it, an event that never fires keeps the
// listener and the caller's continuation alive for the emitter's whole
// lifetime.
//
// off(ε) does not help here either, deliberately: it empties the store, but
// the `onAbort` listener below is registered on the AbortSignal, not on the
// emitter, and nothing in off() knows the signal exists to tell it. A signal
// that outlives the emitter keeps this whole closure — promise, obligation,
// emitter reference — alive until the signal itself fires or is collected.
// See docs/lifecycle.md ("onceAsync and off()") for the consumer-facing
// writeup; there is no fix that doesn't require off() to know about signals
// or onceAsync() to know about off().
// ---------------------------------------------------------------------------

// `??`, not a `=== undefined` test: a signal aborted with an explicit null
// reason gets the synthesized DOMException too. fetch() would reject with the
// null itself, which tells a catch block nothing.
const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException('This operation was aborted', 'AbortError');

// The `| symbol` is the escape hatch `on`, `once` and `emit` carry: a private
// symbol event the map never declared. The return type asks `K extends keyof
// TEvents` because `TEvents[K]` is not writable for such a symbol — and it
// resolves nothing positional either, so it takes the `void` branch a declared
// empty tuple takes.
//
// The inner test reads the tuple exactly the way `ArgsFor` does — `readonly`
// admitted, `NonNullable` first — because it is the same declaration being
// read. A test for a mutable tuple alone would hand `Promise<void>` to a
// `readonly` or optional key whose `emit()` and `on()` are fully checked, which
// is the one failure mode nobody greps for: a return type that quietly went
// missing.
//
// The `[…] extends [never]` guard ahead of it catches the declarations that
// reach the tuple test empty: a key typed `undefined` or `null`, which
// `NonNullable` empties out, and one typed `never`, which arrives that way.
// `never` is assignable to the tuple pattern, so the `infer` would succeed on
// nothing and hand back `unknown` — wider than the `void` such a key resolved
// to before, and wider than the `never` its own `emit()` and `on()` resolve to.
// The brackets are spelling, not mechanism: they match `ListenerTaking`, where
// they are load-bearing, but nothing would distribute here either way —
// `NonNullable<TEvents[K]>` is not a naked type parameter.
export function onceAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  options?: OnceAsyncOptions,
): Promise<
  K extends keyof TEvents
    ? [NonNullable<TEvents[K]>] extends [never]
      ? void
      : NonNullable<TEvents[K]> extends readonly [infer A, ...any[]]
        ? A
        : void
    : void
>;
export function onceAsync<ReturnType = void, T extends object = object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
  options?: OnceAsyncOptions,
): Promise<ReturnType>;
// implementation
export function onceAsync<ReturnType = void>(
  obj: object,
  eventNames: AnyEventNames,
  options?: OnceAsyncOptions,
): Promise<ReturnType> {
  const signal = options?.signal;
  // A manual deferred, not `new Promise((resolve, reject) => { ... once() ... })`:
  // an argument error (empty name array, NaN priority, ...) is a programmer
  // mistake, and every other throw site in this library fails synchronously
  // at the call site rather than through a rejection. Calling once() inside a
  // Promise executor would catch that throw and hand it back as a rejection
  // instead — invisible to a fire-and-forget call with no `await`/`catch`,
  // and an unhandled rejection under Node's default
  // `--unhandled-rejections=throw`. Capturing `resolve`/`reject` here and
  // calling once() afterwards, outside the executor, lets such a throw
  // propagate straight out of onceAsync() to its caller.
  let resolve!: (value: ReturnType | PromiseLike<ReturnType>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<ReturnType>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  // Deliberately ahead of once(), and therefore ahead of the argument
  // validation once() carries out: if the signal already fired there is no
  // reason to touch the emitter at all. One consequence follows from that
  // ordering and is accepted rather than fixed — onceAsync(ε, [], {signal:
  // alreadyAborted}) rejects with the abort reason instead of throwing the
  // "insufficient arguments" error a bare onceAsync(ε, []) throws. Running
  // once() first to validate before this check would register a real
  // subscription, and a retained value can resolve that subscription
  // synchronously from inside once() itself — settling the promise with a
  // stale value the caller already told this call to abandon. Swallowing one
  // rare argument error is the cheaper mistake of the two.
  if (signal?.aborted) {
    reject(abortReason(signal));
    return promise;
  }
  // Declared before once() on purpose: the listener closure reads onAbort,
  // which can only be created once `unsubscribe` exists.
  let onAbort: (() => void) | undefined;
  // A retained event fires inside once(), before there is anything to attach.
  let resolved = false;
  const unsubscribe = once(obj, eventNames, (...args: EventArgs) => {
    resolved = true;
    if (signal != null && onAbort != null) {
      signal.removeEventListener('abort', onAbort);
    }
    resolve(args[0] as ReturnType);
  });
  if (signal != null && !resolved) {
    onAbort = () => {
      unsubscribe();
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, {once: true});
  }

  return promise;
}

// ---------------------------------------------------------------------------
// off() — fully permissive: accepts any object and any listener / listener
// object shape, mirroring the runtime which silently no-ops on anything it
// doesn't recognize. Typed event maps deliberately do NOT narrow the args
// here — cleanup paths often hand off arbitrary values.
// ---------------------------------------------------------------------------
export function off(
  eventizedObj: unknown,
  listener?: unknown,
  listenerObject?: unknown,
): void {
  if (!isEventized(eventizedObj)) {
    return;
  }
  const {store, keeper} = internalsOf(eventizedObj);
  const listenerType = typeof listener;
  const forceRemove =
    listenerObject != null &&
    (listenerType === 'string' || listenerType === 'symbol');
  store.remove(listener, listenerObject, forceRemove);

  // Flattened once, ahead of both places below that read an array's
  // elements. EventStore.remove()'s array branch recurses arbitrarily deep —
  // every element goes back into remove() with a null listenerObject, so a
  // nested array re-enters the same branch — and both isBulkRemoval() and the
  // name filter have to see that same depth, or a marker or a name one level
  // down from the top goes unseen on the keeper side while the store keeps
  // following it. A non-array listener passes through unchanged.
  //
  // The listenerObject == null gate is not a second condition to keep in sync
  // with the two readers below: it is the one both of them already carry. With
  // a listener object named, off(ε, [name, …], listenerObject) unsubscribes
  // nothing and clears nothing, and the flattened copy was allocated for a
  // path that never looks at it.
  //
  // Typed `unknown` rather than left to the ternary, which collapses to the
  // same thing without saying so: the value is whatever the consumer handed in,
  // and both readers below establish what they need about it themselves.
  const flatListener: unknown =
    listenerObject == null && Array.isArray(listener)
      ? listener.flat(Infinity)
      : listener;

  // off(ε), off(ε, '*') and any (nested) array whose elements make the store
  // wipe itself — ['*', …], [[null]], ['foo', undefined] — clear the keeper
  // too. This has to run before the array/name branches below, because
  // isEventName('*') is true and '*' would otherwise take the name path,
  // which clears nothing: retain() rejects '*' and it can never be an entry.
  // isBulkRemoval() reproduces what EventStore.remove() does to the listeners,
  // and matches how unretain()/retainClear() already read a wildcard anywhere
  // in an array as "all retained events". Leaving retained payloads behind
  // after "remove everything" kept them strongly referenced and still replayed
  // them to later subscribers.
  if (
    listener == null ||
    (listenerObject == null && isBulkRemoval(flatListener))
  ) {
    keeper.removeAll();
    return;
  }

  // The array test asks about `flatListener` rather than about `listener`, and
  // selects the same calls either way: with `listenerObject == null` already
  // established, the flattened value is an array exactly when `listener` was
  // one. Asking the value that is about to be filtered is what lets the element
  // type come out of the check instead of out of an assertion —
  // `isUnknownArray()` and not `Array.isArray()`, because the latter would
  // trade the assertion for `any` elements rather than for `unknown` ones.
  if (listenerObject == null && isUnknownArray(flatListener)) {
    // Only the event-name elements are meaningful to the keeper. One caller
    // reaches this branch: an explicit off(ε, [name, …]). The multi-event on()
    // handle used to be a second, passing an array of EventListener instances
    // through here; since v6.0.0 it gives each registration back through
    // EventStore.release() and never enters off() at all. The isEventName
    // filter stays because the surviving caller hands in whatever the consumer
    // assembled: it keeps symbol event names — which the old
    // `typeof === 'string'` test silently dropped — and ignores anything that
    // is not a name at all, nested arrays included — flattened above, a name
    // buried at any depth reads as a name too.
    //
    // The listenerObject == null guard mirrors EventStore.remove(): its array
    // branch requires the same condition, so off(ε, [names], listenerObject)
    // falls through to removeByListener(), where an array never matches a
    // listener identity and nothing is unsubscribed. Without this guard the
    // keeper cleared retained state for a call shape that detached no
    // listener at all.
    keeper.remove(flatListener.filter(isEventName));
  } else if (isEventName(listener)) {
    keeper.remove(listener);
  }
}

// Re-export so consumers can spot DefaultEventMap / EventMap without deep imports
export type {DefaultEventMap, EventMap};
