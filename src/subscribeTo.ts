import {publishReplays} from './EventKeeper';
import type {EventKeeper, KeeperEvent} from './EventKeeper';
import {detectListenerType, EventListener} from './EventListener';
import type {OnceObligation} from './EventListener';
import type {EventStore} from './EventStore';
import {Priority} from './Priority';
import {EVENT_CATCH_EM_ALL, LISTENER_IS_NAMED_FUNC} from './constants';
import type {EventArgs, EventName, ListenerObjectType} from './types';
import {isEventName, warn} from './utils';

/**
 * Holds the batch of queued replays for one `subscribeTo()` call, lazily.
 *
 * Most emitters never call `retain()`, so `hasRetainedFor()` below is false for
 * every name a call registers and `events` is never touched — no array is
 * built, matching the premise `EventKeeper`'s own shared stand-ins and
 * `hasRetainedFor()` already rely on. The field materializes the moment the
 * first replay is queued (`EventKeeper.replayTo()`'s own default-parameter
 * idiom does the allocating), and every further call in the same batch reuses
 * that array instead of starting a new one — the same box travels through
 * `_subscribeTo()` and every `registerEventListener()` call it makes.
 */
type ReplayQueue = {events?: KeeperEvent[]};

const registerEventListener = (
  store: EventStore,
  keeper: EventKeeper,
  eventName: EventName,
  priority: number,
  listener: unknown,
  listenerObject: ListenerObjectType,
  replayQueue: ReplayQueue,
  obligation: OnceObligation | null,
): EventListener => {
  const newListener = new EventListener(
    eventName,
    priority,
    listener,
    listenerObject,
  );
  const el = store.add(newListener, obligation);

  if (obligation !== null && el.callAfterApply === undefined) {
    // One hook per listener, however many once() obligations it carries. It
    // outlives none of them: settleOneShots() clears it when the last one
    // discharges. The watermark comes from apply() at the moment it calls
    // this — see settleOneShots() for why it has to be the sequence counter's
    // value, not a count or a position.
    el.callAfterApply = (watermark) => store.settleOneShots(el, watermark);
  }

  // An aggregating on() gets no replay — the handler already saw that value.
  // An aggregating once() does: its obligation is new, and without the replay
  // whether a once() fires on a retained event would depend on the incidental
  // existence of an on() with the same handler.
  //
  // A multi-name once() queues one such replay per name it covers, all
  // against the one obligation it shares, and publishReplays() runs
  // every replay queued by this call in sequence before returning. Whichever
  // one runs first can settle that obligation — through the real dispatch it
  // triggers, same as any other emit — and a once() promises at most one
  // invocation in total, retained replay included.
  //
  // That last promise holds for as long as no replay throws. Settling happens
  // after the dispatch returns, so a replay that throws settles nothing, the
  // guard below still reads `settled === false`, and the next replay of the
  // same batch reaches this very handler again — a batch is no longer stopped
  // by one throwing replay. See the doc comment at `publishReplays()`,
  // which is where that isolation lives and why.
  //
  // `isRemoved` cannot be what
  // stops a later replay in the same batch: a member kept alive by an on()
  // registration is never removed at all, so its queued replay would call the
  // listener a second time with nothing left to guard it. The obligation
  // itself is the guard, checked when the replay actually runs — never at
  // queue time, since nothing queued by this call has run yet while this call
  // is still queueing.
  //
  // `hasRetainedFor()` in front of all that answers a different question, and
  // only that one: whether the keeper holds anything this name could replay.
  // It never decides whether a listener is entitled to a replay — that stays
  // with the obligation, below and at replay time. Most emitters never see
  // retain(), so it is false for most registrations, and then neither the
  // wrapper object nor its closure gets built for a once().
  if (
    keeper.hasRetainedFor(eventName) &&
    (el === newListener || obligation !== null)
  ) {
    const replayTarget: {apply: (name: EventName, args?: EventArgs) => void} =
      obligation === null
        ? el
        : {
            apply: (name, args) => {
              if (!obligation.settled) el.apply(name, args);
            },
          };
    replayQueue.events = keeper.replayTo(
      eventName,
      replayTarget,
      replayQueue.events,
    );
  }

  return el;
};

/**
 * NaN is a `number`, so the positional decoding below takes it for a priority —
 * and `sortByPriorityAndId()` then compares with `b.priority - a.priority`,
 * which is NaN for every pair. Every comparison is false, `findInsertIndex()`
 * walks its binary search all the way right, and the listener lands at a
 * position determined by the bucket size instead of by its priority. No error,
 * no warning, just the wrong call order.
 *
 * `Number.isNaN` alone only catches the literal value NaN. The `[name,
 * priority]` tuple's second slot reaches this function without a `typeof`
 * gate at branch selection (branches A and B only enter here because
 * `typeof args[…] === 'number'` already held) — so an untyped call site (a
 * cast, or plain JS with no type checker) can hand a string, boolean or
 * object into a tuple's priority slot, `Number.isNaN()` answers `false` for
 * it just as it does for NaN, and it poisons the sort exactly the same way.
 * The `typeof` check widens the guard to every such value while leaving the
 * thrown message and cause untouched — this is a stricter test, not a new
 * failure mode.
 *
 * `Number.isNaN`, not `Number.isFinite`: `Priority.Max` and `Priority.Min` are
 * `±Infinity`, which sorts perfectly well and is documented API.
 */
const assertPriorityIsUsable = (priority: number, args: EventArgs): void => {
  if (typeof priority !== 'number' || Number.isNaN(priority)) {
    // No `hasConsole` guard: `warn` is already the no-op arrow when there is no
    // console. The guard that used to sit here (and at the listener check
    // below) could never be false in any environment a test can construct, so
    // it only ever showed up as an uncovered branch.
    warn('called with a NaN priority!', args);
    // The message is the one thing here that predates the cause vocabulary and
    // stays untouched — it is the only rejection in this file that does not
    // read "insufficient arguments", so a catch block keying on `cause` used to
    // have to fall back to matching text for this single case.
    throw new Error('subscribeTo() called with a NaN priority', {
      cause: 'invalid-priority',
    });
  }
};

/**
 * Rejects a value in the event-name slot that no dispatch can ever carry. The
 * array branch checked the array — empty, holey — and never its
 * elements, so `on(ε, [123], fn)` registered a bucket under `123`; it counted
 * towards `getSubscriptionCount()` and no `emit()` could reach it. The numeric
 * case is the one with teeth: `off(ε, 123)` cannot address it either, because
 * `isEventName(123)` is false and `EventStore.remove()` therefore forwards it
 * to identity matching, where nothing matches — leaving a registration only
 * `off(ε, listener)` can reach.
 *
 * The same gap sits one branch over. Branch B selects on
 * `typeof args[1] === 'number'` alone and then takes `args[0]` as the name
 * unread, so `on(ε, {}, 10, fn)`, `on(ε, null, 10, fn)` and the four-argument
 * `on(ε, 5, 10, fn, ctx)` filed a bucket under a non-name exactly as `[123]`
 * did. Branches A and C fill the name slot themselves — with `'*'`, or from an
 * `args[0]` a `typeof` test has already established — so the single-name gate
 * below costs them one `typeof` switch and rejects nothing they can produce.
 */
const assertEventNameIsUsable = (name: unknown, args: EventArgs): void => {
  if (!isEventName(name)) {
    warn('called with a value that cannot be an event name!', args);
    throw new Error('subscribeTo() called with insufficient arguments', {
      cause: 'invalid-name',
    });
  }
};

const _subscribeTo = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  replayQueue: ReplayQueue,
  obligation: OnceObligation | null,
): EventListener | Array<EventListener> => {
  const len = args.length;
  const typeOfFirstArg = typeof args[0];

  let eventName: EventName;
  let priority: number;
  let listener: unknown;
  let listenerObject: ListenerObjectType;

  // Each branch below names the `SubscribeArgs` arm it decodes (see the arm
  // definitions in types.ts, which are grouped by these very branches).
  // Nothing mechanically enforces that the two stay in step, which is why
  // AGENTS.md requires them to be changed together — but a renamed arm is now
  // a grep away instead of a paragraph away.
  if (len >= 2 && len <= 3 && typeOfFirstArg === 'number') {
    // Branch A: CatchAllPriorityFuncArgs | CatchAllPriorityMethodArgs
    //         | CatchAllPriorityObjectArgs
    eventName = EVENT_CATCH_EM_ALL;
    [priority, listener, listenerObject] = args;
  } else if (len >= 3 && len <= 4 && typeof args[1] === 'number') {
    // Branch B: NamedPriorityFuncArgs | NamedPriorityMethodArgs
    //         | NamedPriorityObjectArgs
    [eventName, priority, listener, listenerObject] = args;
  } else {
    priority = Priority.Normal;
    if (
      typeOfFirstArg === 'string' ||
      typeOfFirstArg === 'symbol' ||
      Array.isArray(args[0])
    ) {
      // Branch C1: NamedFuncArgs | NamedMethodArgs | NamedObjectArgs
      [eventName, listener, listenerObject] = args;
    } else {
      // Branch C2: CatchAllFuncArgs | CatchAllObjectArgs
      eventName = EVENT_CATCH_EM_ALL;
      [listener, listenerObject] = args;
    }
  }

  // Truthiness used to be the entire test, so any truthy value that cannot be
  // dispatched — a number, a boolean, a bigint — was registered as a listener
  // and every emit() fell through all three branches of EventListener.apply().
  // The dead entry could only be removed with off(), and until then it inflated
  // getSubscriptionCount(). The type test is what makes that undefined branch
  // unreachable through the public API rather than merely claiming it.
  //
  // `!listener` stays in front of the type test: '' does carry a listener type
  // (a method name is a string), but an empty method name was rejected before
  // this change and there is no reason to start accepting it.
  if (!listener || detectListenerType(listener) === undefined) {
    // Three ways in, and the log line is where anyone actually looks — so it
    // says which one it was. The last branch is `''` and nothing else: it is
    // the only falsy value `detectListenerType()` still tags. The ternary is
    // evaluated once and its result feeds both the warn() line and the
    // thrown Error's cause — recomputing it for the cause would let the two
    // drift apart.
    const cause =
      listener == null
        ? 'missing-listener'
        : detectListenerType(listener) === undefined
          ? 'not-dispatchable'
          : 'empty-method-name';
    warn(
      cause === 'missing-listener'
        ? 'called with insufficient arguments!'
        : cause === 'not-dispatchable'
          ? 'called with a value that cannot be a listener!'
          : 'called with an empty method name!',
      args,
    );
    // The thrown message stays exactly this string for all three causes —
    // unchanged since v4 and documented — but the cause itself now rides
    // along on Error.cause, so it no longer only reaches the console.
    throw new Error('subscribeTo() called with insufficient arguments', {
      cause,
    });
  }

  // A method name is resolved off the listener object at dispatch time, which
  // is what makes late binding work: the method may appear after the
  // subscription. The object slot itself has no such second chance — nothing
  // writes it after registration except `detach()`, which nulls it — so a
  // method-name subscription that arrives without one is dead the moment it is
  // made. It used to be made anyway: `apply()` finds no object to read from and
  // returns, the entry counts towards `getSubscriptionCount()`, and a `once()`
  // in this shape never reaches the settle hook, so its obligation pins the
  // emitter through the handle for as long as the handle is kept.
  //
  // Only `null` / `undefined` are rejected. Any other value is a thing property
  // access works on, and whether it carries the method is the late-binding
  // question, not this one.
  if (
    detectListenerType(listener) === LISTENER_IS_NAMED_FUNC &&
    listenerObject == null
  ) {
    warn('called with a method name but no listener object!', args);
    throw new Error('subscribeTo() called with insufficient arguments', {
      cause: 'missing-listener-object',
    });
  }

  // The single-name gate. An array is checked entry by entry further down,
  // where the `[name, priority]` tuples are resolved; everything else is a name
  // in its own right and is checked here, before the priority and before any
  // registration. Name before priority, the same order the array entries take:
  // a call that is wrong about where its listener is filed is answered for that
  // first.
  if (!Array.isArray(eventName)) {
    assertEventNameIsUsable(eventName, args);
  }

  assertPriorityIsUsable(priority, args);

  // One flat function taking both varying arguments, not a curried pair — the
  // array branch below used to call `register(prio)` once per name only to
  // discard the outer closure after a single use; `registerOne(prio, event)`
  // is the same shape `applyListener()` uses on the emit path for the same
  // reason.
  const registerOne = (prio: number, event: EventName): EventListener =>
    registerEventListener(
      store,
      keeper,
      event,
      prio,
      listener,
      listenerObject,
      replayQueue,
      obligation,
    );

  if (Array.isArray(eventName)) {
    if (eventName.length === 0) {
      // The map below registers one listener per name, so an empty array used
      // to register nothing at all: on(ε, [], h) and once(ε, [], h) returned a
      // handle for zero subscriptions with no warning and no throw, and
      // onceAsync(ε, []) resolved a promise that never settles. Rejected here,
      // atomically and before anything is registered — the same treatment a
      // NaN in one tuple gets below. Same message and cause vocabulary as the
      // listener check above: one more way "insufficient arguments" is
      // insufficient.
      warn('called with an empty array of event names!', args);
      throw new Error('subscribeTo() called with insufficient arguments', {
        cause: 'empty-names',
      });
    }
    // A hole is a missing element, not a value — `!(i in eventName)` is what
    // tells the two apart; `entry === undefined` would not, since an element
    // explicitly set to `undefined` reads back the same way but is a value.
    // Rejected here, atomically and before any resolution, same as the
    // empty-array case just above: the per-name `map()`s below both skip
    // holes (that is what `Array.prototype.map()` does), so without this
    // guard a hole silently registers a subset of the names instead of
    // throwing, and an all-holes array — `new Array(n)` — registers nothing
    // and hands back a live-looking handle, or for onceAsync() a promise that
    // never settles. Exactly the empty-array failure, reachable through a
    // length that isn't 0.
    for (let i = 0; i < eventName.length; i++) {
      if (!(i in eventName)) {
        warn('called with a sparse array of event names!', args);
        throw new Error('subscribeTo() called with insufficient arguments', {
          cause: 'sparse-names',
        });
      }
    }
    // Resolve every per-event priority before registering anything, so a NaN
    // in one tuple rejects the whole call instead of leaving the names in
    // front of it subscribed — the same atomicity `retain(ε, [name, …])` has
    // for '*'. One pass builds and validates each entry; a second, separate
    // pass registers — folding those two together would let entry N register
    // while a later entry could still fail its check, and a registration
    // cannot be undone once `store.add()` has run. Two passes, not three: the
    // old third pass (a `for` loop doing only the validation) is gone because
    // `assertPriorityIsUsable()` now runs inside the first `map()`, where a
    // throw stops that `map()` before it produces a complete `entries` array
    // — so the registering `map()` after it never starts either.
    //
    // A tuple without a priority only reaches here from untyped call sites —
    // `EventNameWithPriority` is a fixed 2-tuple, so the typed API rejects it.
    // Falling back to the call-level priority is what a missing override means,
    // and it keeps `undefined` out of the arithmetic in sortByPriorityAndId,
    // where it would become NaN. `??` rather than `||` — 0 is Priority.Normal,
    // not "absent" — which is also why `??` lets an explicit NaN through to the
    // assertion rather than swallowing it.
    const entries: Array<[EventName, number]> = eventName.map((name) => {
      const entry: [EventName, number] = Array.isArray(name)
        ? [name[0], name[1] ?? priority]
        : [name, priority];
      // Name before priority: a `[123, NaN]` entry is wrong about the thing
      // that decides where it is filed before it is wrong about the order it
      // is filed in.
      assertEventNameIsUsable(entry[0], args);
      assertPriorityIsUsable(entry[1], args);
      return entry;
    });
    return entries.map((entry) => registerOne(entry[1], entry[0]));
  }
  return registerOne(priority, eventName);
};

export const subscribeTo = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  obligation: OnceObligation | null = null,
): EventListener | Array<EventListener> => {
  // No array here — see the ReplayQueue doc comment above. Most calls never
  // populate `.events`, and then `publishReplays()` is never even called.
  const replayQueue: ReplayQueue = {};
  const listeners = _subscribeTo(store, keeper, args, replayQueue, obligation);
  if (replayQueue.events !== undefined) {
    publishReplays(replayQueue.events);
  }
  return listeners;
};
