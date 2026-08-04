import {readMarker} from './internals';

/**
 * Which copy of eventize eventized this object — the protocol number from its
 * marker, or `undefined` for anything that does not carry one.
 *
 * `isEventized()` answers "does this object have the marker slot", which is
 * realm-wide and therefore shared by every copy of the library in the process.
 * This answers the follow-up question: whose marker is it. A number different
 * from this copy's own `PROTOCOL_VERSION` means two majors of
 * `@spearwolf/eventize` are live on the same object, and every `on`/`emit`/
 * `off` against it will throw — dedupe the dependency tree.
 *
 * It never throws, because it exists to be called *before* the bang. Two kinds
 * of `undefined` come back and `isEventized()` separates them: `false` means
 * the object was never eventized, `true` means a copy that predates the
 * protocol field (up to v5.1.0) got there first.
 */
export const getEventizeProtocol = (obj: unknown): number | undefined => {
  if (!obj) return undefined;
  // Read through `readMarker()` rather than off `obj` here, which is the whole
  // point of `readMarker()` existing: this function used to declare the
  // payload's `protocol` field a second time, outside `internals.ts`, where a
  // rename would have left it compiling and answering `undefined` for every
  // object — "never eventized", for objects that are.
  const protocol = readMarker(obj)?.protocol;
  // The `typeof` test stays even though the declared shape says `number`: this
  // is the one caller that reads a slot nothing in this copy wrote, so the type
  // describes our own marker rather than promising anything about a foreign one.
  return typeof protocol === 'number' ? protocol : undefined;
};
