/**
 * The wildcard event name, `'*'`, used to subscribe a catch-all listener
 * with `on()`/`once()`.
 *
 * It is subscribe-only: passing it (or an array containing it) to `emit()`,
 * `emitAsync()` or `retain()` throws rather than dispatching or retaining
 * every event.
 */
export const EVENT_CATCH_EM_ALL = '*';

export const LISTENER_IS_FUNC = 1;
export const LISTENER_IS_NAMED_FUNC = 2;
export const LISTENER_IS_OBJ = 4;

export const NAMESPACE = Symbol.for('eventize');

/**
 * The shape of the marker payload, versioned. `NAMESPACE` is realm-wide by
 * design — identity has to be — which also means every copy of this library
 * writes the same key. Two majors resolved side by side (npm is happy to
 * install `^5` and `^6` for two different dependents) therefore share one slot
 * and each reads the other's payload as its own. The number here is what tells
 * them apart at the boundary; bump it whenever the payload behind the marker
 * stops being drivable by the previous major.
 */
export const PROTOCOL_VERSION = 6;

export const LOG_NAMESPACE = '[eventize]';
