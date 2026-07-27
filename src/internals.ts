import {NAMESPACE} from './constants';

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
  keeper: EventKeeper;
  store: EventStore;
}

/**
 * The one cast on the boundary, and the reason it is safe: nothing can be an
 * `EventizedObject` without having gone through `asEventized()`, which is what
 * puts an `EventizeInternals` in that slot in the first place. The opaque
 * declaration exists to stop *callers* from reading it, not to express doubt
 * about what is in there.
 *
 * If a second cast ever becomes necessary to make this boundary work, the
 * boundary is drawn in the wrong place and belongs redrawn, not patched.
 */
export const internalsOf = <T extends EventMap>(
  obj: EventizedObject<T>,
): EventizeInternals => obj[NAMESPACE] as unknown as EventizeInternals;
