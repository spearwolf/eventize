import {NAMESPACE} from './constants';
import {
  asEventized,
  emit,
  eventize,
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
