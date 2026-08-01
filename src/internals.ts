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
 * Out of line on purpose: `internalsOf()` is on every dispatch path, and the
 * success case must cost one property load and one compare — no call, no
 * string building. Everything expensive lives here, where it runs once and
 * then the program is over anyway.
 */
const throwProtocolMismatch = (protocol: unknown): never => {
  throw new TypeError(
    `two incompatible copies of @spearwolf/eventize are active on this object (marker protocol ${String(protocol)}, expected ${PROTOCOL_VERSION}) — dedupe @spearwolf/eventize in your dependency tree so a single copy is loaded`,
  );
};

/**
 * The one cast on the boundary, and the reason it is safe: nothing can be an
 * `EventizedObject` without having gone through `asEventized()`, which is what
 * puts an `EventizeInternals` in that slot in the first place. The opaque
 * declaration exists to stop *callers* from reading it, not to express doubt
 * about what is in there.
 *
 * If a second cast ever becomes necessary to make this boundary work, the
 * boundary is drawn in the wrong place and belongs redrawn, not patched.
 *
 * It is also the one chokepoint where "is this marker mine?" can be asked
 * once for the whole library. The slot is realm-wide, so an object eventized
 * by another copy passes `isEventized()` and arrives here with a payload this
 * code cannot drive; without the compare below the mismatch surfaced calls
 * later as `store.add is not a function`, from a stack frame that named
 * neither eventize nor the cause.
 */
export const internalsOf = <T extends EventMap>(
  obj: EventizedObject<T>,
): EventizeInternals => {
  const internals = obj[NAMESPACE] as unknown as EventizeInternals;
  if (internals.protocol !== PROTOCOL_VERSION) {
    throwProtocolMismatch(internals.protocol);
  }
  return internals;
};
