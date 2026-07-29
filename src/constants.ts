export const EVENT_CATCH_EM_ALL = '*';

export const LISTENER_IS_FUNC = 1;
export const LISTENER_IS_NAMED_FUNC = 2;
export const LISTENER_IS_OBJ = 4;

export const NAMESPACE = Symbol.for('eventize');

export const LOG_NAMESPACE = '[eventize]';

// How long a registration lives, decided by the call that made it. The store
// keeps one listener per identity and counts the two kinds separately, so a
// listener survives exactly as long as one of its registrations still wants it.
export const REGISTER_PERSISTENT = 0;
export const REGISTER_ONE_SHOT = 1;

export type RegisterKind =
  typeof REGISTER_PERSISTENT | typeof REGISTER_ONE_SHOT;
