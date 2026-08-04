import {NAMESPACE, PROTOCOL_VERSION} from './constants';

import type {EventKeeper} from './EventKeeper';
import type {EventStore} from './EventStore';
import type {EventMap, EventizedObject} from './types';

/**
 * The two collaborators behind the eventized marker.
 *
 * This shape used to sit inline in `EventizedObject[NAMESPACE]`, which is
 * exported — so `EventKeeper`, `EventStore` and (through the store)
 * `EventListener` were reachable from the published type and tsup inlined all
 * three into `lib/index.d.ts`, private method names and all. No consumer could
 * use any of it: `EventStore` was not nameable and the `NAMESPACE` key is a
 * non-exported `unique symbol`, so the slot answered `TS7053` from outside.
 * It was a boundary the code kept and the types did not.
 *
 * Now `EventizedObject` carries an opaque slot and the real shape lives here,
 * unexported from `src/index.ts`. Everything internal reads the store and the
 * keeper through `internalsOf()`.
 */
export interface EventizeInternals {
  /**
   * Which copy of the library wrote this marker — see `PROTOCOL_VERSION`.
   * Read on every `on`/`emit`/`off`, so it sits first in the payload and stays
   * a plain number.
   */
  protocol: number;
  keeper: EventKeeper;
  store: EventStore;
}

/**
 * **The one cast** the internals boundary costs, and the only place the payload
 * shape is spelled out against the slot. Both doors below go through it, so a
 * renamed or moved field cannot leave a second reader compiling happily against
 * a shape that no longer exists — it would go on answering `undefined`, which
 * for `getEventizeProtocol()` reads as "never eventized" and is a wrong answer
 * no type error and no test is obliged to catch.
 *
 * `Partial`, because this door asks nothing: a marker written by a copy that
 * predates the protocol field (up to v5.1.0) has no `protocol`, and a foreign
 * marker guarantees no field at all. Turning that into an `EventizeInternals`
 * is `internalsOf()`'s job and costs the protocol compare.
 *
 * Probing *for* the slot rather than reading a shape out of it — what
 * `isEventized()` does — is not this cast and needs none of it: that read comes
 * back `unknown` and only asks whether something is there.
 *
 * No nullish guard, and truthy is all the callers owe it: `internalsOf()`
 * arrives with an `EventizedObject`, `getEventizeProtocol()` with whatever
 * passed its own `if (!obj)` — a number, a string or a symbol included, which
 * reads the slot off a throwaway wrapper and comes back `undefined` like any
 * other value that was never eventized.
 */
export const readMarker = (
  obj: unknown,
): Partial<EventizeInternals> | undefined =>
  (obj as Record<symbol, Partial<EventizeInternals> | undefined>)[NAMESPACE];

/**
 * Out of line on purpose: `internalsOf()` is on every dispatch path, and its
 * success case has to stay one property load and two compares' worth of work.
 * It does reach that through two calls — `readMarker()` and
 * `isCurrentProtocol()`, each a single expression at module level, the size a
 * JIT folds into its caller rather than the size it keeps. What must never join
 * them is the other kind of work: building the message below means a template
 * string and a `String()` on every dispatch, for an error that ends the program
 * anyway.
 */
const throwProtocolMismatch = (protocol: unknown): never => {
  throw new TypeError(
    `two incompatible copies of @spearwolf/eventize are active on this object (marker protocol ${String(protocol)}, expected ${PROTOCOL_VERSION}) — dedupe @spearwolf/eventize in your dependency tree so a single copy is loaded`,
  );
};

/**
 * What turns the unchecked read into a usable payload — a type predicate rather
 * than a second cast, and it earns the narrowing it claims: the protocol
 * compare is exactly the promise `EventizeInternals` makes over
 * `Partial<EventizeInternals>`, because a marker carrying this copy's protocol
 * number was written by this copy's `asEventized()` and by nothing else.
 */
const isCurrentProtocol = (
  marker: Partial<EventizeInternals> | undefined,
): marker is EventizeInternals => marker?.protocol === PROTOCOL_VERSION;

/**
 * The checking door onto the marker, and the reason it can be sure of what it
 * hands out: nothing can be an `EventizedObject` without having gone through
 * `asEventized()`, which is what puts an `EventizeInternals` in that slot in
 * the first place. The opaque declaration exists to stop *callers* from reading
 * it, not to express doubt about what is in there.
 *
 * It is also the one chokepoint where "is this marker mine?" can be asked
 * once for the whole library. The slot is realm-wide, so an object eventized
 * by another copy passes `isEventized()` and arrives here with a payload this
 * code cannot drive; without the compare the mismatch surfaced calls later as
 * `store.add is not a function`, from a stack frame that named neither eventize
 * nor the cause.
 */
export const internalsOf = <T extends EventMap>(
  obj: EventizedObject<T>,
): EventizeInternals => {
  const internals = readMarker(obj);
  if (!isCurrentProtocol(internals)) {
    return throwProtocolMismatch(internals?.protocol);
  }
  return internals;
};
