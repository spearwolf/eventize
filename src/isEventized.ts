import {NAMESPACE} from './constants';
import type {EventizeGuard, EventizedObject} from './types';

/**
 * Does this object carry the eventize marker slot — anyone's?
 *
 * A type guard, and deliberately a narrow one: it probes for the slot and asks
 * nothing about who wrote it. "Eventized" and "eventized by *this* copy" are
 * different questions, and the marker key is realm-wide, so an object another
 * copy of the library eventized answers `true` here and is not wrong to.
 *
 * It never throws, which is what lets it sit in front of the calls that do.
 * The follow-up question — whose slot is it — belongs to the public
 * `getEventizeProtocol()`, which also never throws; enforcing the answer is
 * `internalsOf()`'s job alone.
 *
 * The read is a plain property lookup, so it walks the prototype chain like
 * any other: `obj[NAMESPACE]` finds an inherited slot exactly as readily as
 * an own one, because the marker is a property, not an entry in some
 * separate registry keyed by identity. Eventize a prototype and every
 * instance answers `true` here, `asEventized()` hands each one back
 * unchanged, and all of them read the same `EventStore` and `EventKeeper` —
 * one emitter shared by the whole class, `on()` on one instance reachable
 * from `emit()` on another. Useful when that sharing is the point (a class
 * of objects that really is one broadcast channel); surprising when each
 * instance was expected to keep its own independent subscriptions and
 * nothing separated them — see `marker-integrity.spec.ts` for the pinned
 * behaviour.
 */
export const isEventized: EventizeGuard = (
  obj: unknown,
): obj is EventizedObject =>
  // The cast is a probe onto the slot, not a second reading of what is in it:
  // the result is `unknown` and nothing here looks inside, so no field of the
  // payload is named outside `internals.ts`. That is where the one-cast rule
  // draws its line — `readMarker()` is the only door a shape comes back out of.
  Boolean(obj && (obj as Record<symbol, unknown>)[NAMESPACE]);
