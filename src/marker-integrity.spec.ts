import {NAMESPACE} from './constants';
import {
  asEventized,
  emit,
  eventize,
  getEventizeProtocol,
  getSubscriptionCount,
  isEventized,
  off,
  on,
} from './index';

// What a marker written by a *different* copy of the library looks like from
// here: the slot is taken — `Symbol.for('eventize')` is realm-wide, so every
// copy writes the same key — but the payload is not one this copy can drive.
// The pre-v6 shape carries no protocol at all; a hypothetical later one
// carries a number this copy does not speak.
const markAsForeign = <T extends object>(obj: T, payload: unknown): T => {
  Object.defineProperty(obj, NAMESPACE, {value: payload, configurable: true});
  return obj;
};

const legacyMarker = () => ({store: {}, keeper: {}});
const futureMarker = () => ({protocol: 7, store: {}, keeper: {}});

const MISMATCH = /two incompatible copies of @spearwolf\/eventize/;

describe('a marker written by another copy of eventize', () => {
  it('makes on() fail at the boundary, not inside the dispatch', () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => on(obj, 'foo', () => {})).toThrow(MISMATCH);
  });

  it('makes emit() fail at the boundary', () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => emit(obj, 'foo', 1, 2)).toThrow(MISMATCH);
  });

  // The internals resolution in the array branch of `_emit()` was moved so
  // that a run of concrete names pays `internalsOf()` once instead of once per
  // name — see the comment beside `_emitOne()` in emit-api.ts. The one way
  // that change could regress this boundary is by resolving the marker before
  // the `'*'` rejection runs. It must not: '*' is checked first, unconditionally,
  // both for the scalar form and for every element of an array — a foreign
  // marker given '*' must still get the wildcard message, never the mismatch.
  it("rejects '*' before it ever reads a foreign marker's protocol (scalar form)", () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => emit(obj, '*', 'data')).toThrow(/concrete event name/);
    expect(() => emit(obj, '*', 'data')).not.toThrow(MISMATCH);
  });

  it("rejects '*' before it ever reads a foreign marker's protocol (array form, '*' first)", () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => emit(obj, ['*', 'foo'], 'data')).toThrow(
      /concrete event name/,
    );
    expect(() => emit(obj, ['*', 'foo'], 'data')).not.toThrow(MISMATCH);
  });

  // The protocol check is a security boundary, not a cache — it must still run
  // on every emit() that actually dispatches something. What it must NOT do is
  // run for a call that dispatches nothing at all: an empty event-name array
  // never reaches `_emitOne()`, so `internalsOf()` is never called for it, and
  // that stays true whether the marker is genuine or foreign. This is the
  // baseline this package's optimization had to preserve, not a new relaxation.
  it('does not run the boundary check for an empty event-name array — nothing to dispatch, nothing to check', () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => emit(obj, [], 'data')).not.toThrow();
  });

  it('makes off() fail at the boundary', () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => off(obj, 'foo')).toThrow(MISMATCH);
  });

  it('makes asEventized() fail instead of handing back a foreign emitter', () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => asEventized(obj)).toThrow(MISMATCH);
  });

  it('makes eventize() fail through the standalone surface too', () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => eventize(obj)).toThrow(MISMATCH);
  });

  it('rejects a protocol from the future the same way', () => {
    const obj = markAsForeign({}, futureMarker());
    expect(() => on(obj, 'foo', () => {})).toThrow(MISMATCH);
  });

  it('throws a TypeError', () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => emit(obj, 'foo')).toThrow(TypeError);
  });

  it('names both the protocol found and the one this copy speaks', () => {
    const obj = markAsForeign({}, futureMarker());
    expect(() => emit(obj, 'foo')).toThrow(/protocol 7.*expected 6/);
  });

  it('names the remedy: dedupe the dependency', () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => emit(obj, 'foo')).toThrow(/dedupe/);
  });

  it('reaches the read-only helpers as well — a wrong count is worse than a diagnosis', () => {
    const obj = markAsForeign({}, legacyMarker());
    expect(() => getSubscriptionCount(obj)).toThrow(MISMATCH);
  });

  it('leaves isEventized() a pure slot probe that never throws', () => {
    // isEventized() is a type guard. "eventized" and "eventized by *this*
    // copy" are different questions, and the second one belongs to
    // getEventizeProtocol().
    const obj = markAsForeign({}, legacyMarker());
    expect(isEventized(obj)).toBe(true);
  });

  it('does not disturb an object this copy eventized', () => {
    const obj = eventize();
    const handler = jest.fn();
    on(obj, 'foo', handler);
    emit(obj, 'foo', 23);
    expect(handler).toHaveBeenCalledWith(23);
  });
});

describe('the marker slot cannot be deleted', () => {
  it('throws on delete instead of silently un-eventizing the object', () => {
    const obj = eventize();
    const slotOwner = obj as unknown as Record<symbol, unknown>;
    expect(() => {
      delete slotOwner[NAMESPACE];
    }).toThrow(TypeError);
  });

  it('keeps the emitter working after a failed delete', () => {
    const obj = eventize();
    const handler = jest.fn();
    on(obj, 'foo', handler);
    const slotOwner = obj as unknown as Record<symbol, unknown>;
    expect(() => {
      delete slotOwner[NAMESPACE];
    }).toThrow(TypeError);
    expect(isEventized(obj)).toBe(true);
    expect(getSubscriptionCount(obj)).toBe(1);
    emit(obj, 'foo');
    expect(handler).toHaveBeenCalled();
  });

  it('describes the slot as non-enumerable, non-writable and non-configurable', () => {
    const obj = eventize();
    expect(Object.getOwnPropertyDescriptor(obj, NAMESPACE)).toMatchObject({
      configurable: false,
      enumerable: false,
      writable: false,
    });
  });
});

// The marker is a property, not a registry entry, so it is inherited exactly
// the way every other property is. Eventizing a prototype therefore does not
// give each instance its own emitter: every instance reads the same
// inherited slot and so shares one `EventStore` and one `EventKeeper`. This
// is intended and stays intended — see the doc comment beside `isEventized()`
// in `src/isEventized.ts`. What follows pins the consequences a reader meets
// one step past "it's inherited": `on()` and `emit()` on different instances
// reach the same listeners, `getSubscriptionCount()` cannot tell the
// instances apart, `off()` on one instance detaches for all of them, and
// re-`eventize()`-ing an instance whose prototype already carries the slot
// does not fork off an own one.
describe('an eventized prototype shares one emitter across its instances', () => {
  const makeSharedPrototype = () => {
    class Instance {}
    eventize(Instance.prototype);
    return Instance;
  };

  it('reports every instance as eventized, at the same protocol as the prototype', () => {
    const Instance = makeSharedPrototype();
    const a = new Instance();
    const b = new Instance();

    expect(isEventized(Instance.prototype)).toBe(true);
    expect(isEventized(a)).toBe(true);
    expect(isEventized(b)).toBe(true);

    expect(getEventizeProtocol(a)).toBe(
      getEventizeProtocol(Instance.prototype),
    );
    expect(getEventizeProtocol(b)).toBe(
      getEventizeProtocol(Instance.prototype),
    );
  });

  it('lets on() on one instance fire for emit() on another', () => {
    const Instance = makeSharedPrototype();
    const a = new Instance();
    const b = new Instance();
    const handler = jest.fn();

    on(a, 'foo', handler);
    emit(b, 'foo', 42);

    expect(handler).toHaveBeenCalledWith(42);
  });

  it('reports the same getSubscriptionCount() for every instance', () => {
    const Instance = makeSharedPrototype();
    const a = new Instance();
    const b = new Instance();

    on(a, 'foo', () => {});

    expect(getSubscriptionCount(a)).toBe(1);
    expect(getSubscriptionCount(b)).toBe(1);
    expect(getSubscriptionCount(Instance.prototype)).toBe(1);
  });

  it('lets off() on one instance detach the subscription for all of them', () => {
    const Instance = makeSharedPrototype();
    const a = new Instance();
    const b = new Instance();
    const handler = jest.fn();

    on(a, 'foo', handler);
    off(b, 'foo');

    expect(getSubscriptionCount(a)).toBe(0);
    expect(getSubscriptionCount(b)).toBe(0);

    emit(a, 'foo', 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not give an instance its own slot when eventize() runs on it again', () => {
    const Instance = makeSharedPrototype();
    const a = new Instance();

    // asEventized() sees the inherited slot via isEventized() and returns the
    // object unchanged — no own NAMESPACE property is defined on `a`.
    const result = eventize(a);

    expect(result).toBe(a);
    expect(Object.getOwnPropertySymbols(a)).not.toContain(NAMESPACE);
    expect(Object.getOwnPropertySymbols(Instance.prototype)).toContain(
      NAMESPACE,
    );
  });
});
