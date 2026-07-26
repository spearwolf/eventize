import {
  emit,
  emitAsync,
  eventize,
  Eventize,
  off,
  on,
  once,
  onceAsync,
  retain,
  retainClear,
  unretain,
} from '../index';
import type {
  AnyEventNames,
  EventArgs,
  OnceAsyncOptions,
  SubscribeArgs,
  UnsubscribeFunc,
} from '../types';

export const expect2ImplEventizeApi = (obj: any) => {
  describe('implements the eventizedObject API', () => {
    it('.on()', () => {
      expect(typeof obj.on).toBe('function');
    });
    it('.once()', () => {
      expect(typeof obj.once).toBe('function');
    });
    it('.onceAsync()', () => {
      expect(typeof obj.onceAsync).toBe('function');
    });
    it('.off()', () => {
      expect(typeof obj.off).toBe('function');
    });
    it('.emit()', () => {
      expect(typeof obj.emit).toBe('function');
    });
    it('.emitAsync()', () => {
      expect(typeof obj.emitAsync).toBe('function');
    });
    it('.retain()', () => {
      expect(typeof obj.retain).toBe('function');
    });
    it('.retainClear()', () => {
      expect(typeof obj.retainClear).toBe('function');
    });
    it('.unretain()', () => {
      expect(typeof obj.unretain).toBe('function');
    });
  });
};

// ---------------------------------------------------------------------------
// apiSurfaces — the conformity-suite counterpart to expect2ImplEventizeApi
// above. That helper only proves the nine methods exist; this drives actual
// behavior through all three surfaces documented in AGENTS.md ("Three API
// surfaces, one implementation"): the standalone functions, the
// eventize.inject(obj) methods, and the class Eventize instance methods.
// Each surface's create() returns a fresh emitter through a uniform shape so
// the same behavior-case spec can run unmodified against all three.
// ---------------------------------------------------------------------------

export interface ConformityApi {
  on: (...args: SubscribeArgs) => UnsubscribeFunc;
  once: (...args: SubscribeArgs) => UnsubscribeFunc;
  onceAsync: <ReturnType = void>(
    eventNames: AnyEventNames,
    options?: OnceAsyncOptions,
  ) => Promise<ReturnType>;
  off: (listener?: unknown, listenerObject?: unknown) => void;
  emit: (eventNames: AnyEventNames, ...args: EventArgs) => void;
  emitAsync: (eventNames: AnyEventNames, ...args: EventArgs) => Promise<any>;
  retain: (eventNames: AnyEventNames) => void;
  retainClear: (eventNames: AnyEventNames) => void;
  unretain: (eventNames: AnyEventNames) => void;
}

export interface ApiSurface {
  name: string;
  create: () => ConformityApi;
}

// Same cast rationale as src/eventize.ts: the public overload sets are tuned
// for end users and don't accept a spread of SubscribeArgs / a loose
// AnyEventNames on the loose fallback, so the standalone-function surface
// below goes through the implementation-shape signatures, same as the
// class/inject delegations do internally.
const onLoose = on as (obj: object, ...args: SubscribeArgs) => UnsubscribeFunc;
const onceLoose = once as (
  obj: object,
  ...args: SubscribeArgs
) => UnsubscribeFunc;
const offLoose = off as (
  obj: unknown,
  listener?: unknown,
  listenerObject?: unknown,
) => void;
const emitLoose = emit as (
  obj: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
) => void;
const emitAsyncLoose = emitAsync as (
  obj: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
) => Promise<any>;
const onceAsyncLoose = onceAsync as <ReturnType = void>(
  obj: object,
  eventNames: AnyEventNames,
  options?: OnceAsyncOptions,
) => Promise<ReturnType>;
const retainLoose = retain as (obj: object, eventNames: AnyEventNames) => void;
const retainClearLoose = retainClear as (
  obj: object,
  eventNames: AnyEventNames,
) => void;
const unretainLoose = unretain as (
  obj: object,
  eventNames: AnyEventNames,
) => void;

export const apiSurfaces: ApiSurface[] = [
  {
    name: 'standalone functions',
    create: (): ConformityApi => {
      const ε = eventize();
      return {
        on: (...args) => onLoose(ε, ...args),
        once: (...args) => onceLoose(ε, ...args),
        onceAsync: (eventNames, options) =>
          onceAsyncLoose(ε, eventNames, options),
        off: (listener, listenerObject) =>
          offLoose(ε, listener, listenerObject),
        emit: (eventNames, ...args) => emitLoose(ε, eventNames, ...args),
        emitAsync: (eventNames, ...args) =>
          emitAsyncLoose(ε, eventNames, ...args),
        retain: (eventNames) => retainLoose(ε, eventNames),
        retainClear: (eventNames) => retainClearLoose(ε, eventNames),
        unretain: (eventNames) => unretainLoose(ε, eventNames),
      };
    },
  },
  {
    name: 'eventize.inject(obj) methods',
    // The runtime methods Object.assign()-ed by inject() already accept the
    // loose implementation-shape args (see eventize.ts) — only the exposed
    // TS type is the tuned public one, so the cast is a type-level fix-up,
    // not a runtime behavior change.
    create: (): ConformityApi =>
      eventize.inject({}) as unknown as ConformityApi,
  },
  {
    name: 'class Eventize',
    create: (): ConformityApi =>
      new (class extends Eventize {})() as unknown as ConformityApi,
  },
];
