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
 */
export const isEventized: EventizeGuard = (
  obj: unknown,
): obj is EventizedObject =>
  Boolean(obj && (obj as Record<symbol, unknown>)[NAMESPACE]);
