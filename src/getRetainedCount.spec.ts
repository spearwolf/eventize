import {fake} from 'sinon';

import {
  emit,
  eventize,
  getRetainedCount,
  getRetainedEventNames,
  off,
  on,
  retain,
  retainClear,
  unretain,
} from './index';

describe('getRetainedCount() / getRetainedEventNames()', () => {
  it('returns 0 and [] for a fresh emitter', () => {
    const obj = eventize();
    expect(getRetainedCount(obj)).toBe(0);
    expect(getRetainedEventNames(obj)).toEqual([]);
  });

  it('returns 0 and [] for a non-eventized object', () => {
    expect(getRetainedCount({})).toBe(0);
    expect(getRetainedEventNames({})).toEqual([]);
  });

  it('counts a retain policy before the event ever fires', () => {
    const obj = eventize();
    retain(obj, 'foo');

    expect(getRetainedEventNames(obj)).toEqual(['foo']);
    expect(getRetainedCount(obj)).toBe(0);
  });

  it('counts a retained value after the event fires', () => {
    const obj = eventize();
    retain(obj, 'foo');
    emit(obj, 'foo', 'payload');

    expect(getRetainedCount(obj)).toBe(1);
    expect(getRetainedEventNames(obj)).toEqual(['foo']);
  });

  it('reports symbol event names', () => {
    const obj = eventize();
    const name = Symbol('foo');
    retain(obj, name);
    emit(obj, name, 1);

    expect(getRetainedEventNames(obj)).toEqual([name]);
    expect(getRetainedCount(obj)).toBe(1);
  });

  it('tracks dynamically generated names', () => {
    const obj = eventize();
    for (let i = 0; i < 100; i++) {
      retain(obj, `item-${i}`);
      emit(obj, `item-${i}`, {i});
    }

    expect(getRetainedCount(obj)).toBe(100);
    expect(getRetainedEventNames(obj)).toHaveLength(100);
  });

  it('drops to zero after unretain(ε, "*")', () => {
    const obj = eventize();
    retain(obj, 'a');
    retain(obj, 'b');
    emit(obj, 'a', 1);
    emit(obj, 'b', 2);
    expect(getRetainedCount(obj)).toBe(2);

    unretain(obj, '*');

    expect(getRetainedCount(obj)).toBe(0);
    expect(getRetainedEventNames(obj)).toEqual([]);
  });

  it('retainClear(ε, "*") clears values but keeps policies', () => {
    const obj = eventize();
    retain(obj, 'a');
    emit(obj, 'a', 1);

    retainClear(obj, '*');

    expect(getRetainedCount(obj)).toBe(0);
    expect(getRetainedEventNames(obj)).toEqual(['a']);
  });

  it('is unaffected by listener subscriptions', () => {
    const obj = eventize();
    on(obj, 'foo', fake());
    expect(getRetainedCount(obj)).toBe(0);
    off(obj, 'foo');
    expect(getRetainedCount(obj)).toBe(0);
  });

  it('is safe on null, undefined and primitives at runtime', () => {
    // The signature says `object`, so every one of these is a type error —
    // that is the point. They document what an untyped or typo'd JS call site
    // can still push through at runtime, and that it degrades to a zero/empty
    // answer instead of throwing.
    // @ts-expect-error null is not an `object` under strictNullChecks
    expect(getRetainedCount(null)).toBe(0);
    // @ts-expect-error undefined is not an `object` under strictNullChecks
    expect(getRetainedCount(undefined)).toBe(0);
    // @ts-expect-error a number is not an `object`
    expect(getRetainedCount(42)).toBe(0);
    // @ts-expect-error see above
    expect(getRetainedEventNames(null)).toEqual([]);
    // @ts-expect-error see above
    expect(getRetainedEventNames(undefined)).toEqual([]);
    // @ts-expect-error see above
    expect(getRetainedEventNames('nope')).toEqual([]);
  });
});
