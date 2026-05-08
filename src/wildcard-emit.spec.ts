import {fake} from 'sinon';

import {emit, eventize, Eventize, on} from './index';

describe('emit() with the wildcard event name', () => {
  it("throws when emit() is called with '*' (scalar)", () => {
    const ε = eventize();
    on(ε, '*', () => {});
    expect(() => emit(ε, '*', 'data')).toThrow(/concrete event name/);
  });

  it("throws when emit() is called with ['*'] (array form)", () => {
    const ε = eventize();
    on(ε, '*', () => {});
    expect(() => emit(ε, ['*'], 'data')).toThrow(/concrete event name/);
  });

  it("throws when '*' appears in a multi-event array, after firing earlier events", () => {
    const ε = eventize();
    const fooFn = fake();
    on(ε, 'foo', fooFn);

    expect(() => emit(ε, ['foo', '*'], 1)).toThrow(/concrete event name/);

    // 'foo' fires before the throw, consistent with mid-dispatch error semantics.
    expect(fooFn.callCount).toBe(1);
  });
});

describe('listener-object .emit() fallback (public-API end-to-end)', () => {
  it('catch-all listener-object receives eventName via .emit() when no matching method exists', () => {
    const ε = eventize();
    const calls: Array<[unknown, unknown[]]> = [];

    on(ε, {
      emit(eventName: string, ...args: unknown[]) {
        calls.push([eventName, args]);
      },
    });

    emit(ε, 'foo', 1, 2);
    emit(ε, 'bar', 'A');

    expect(calls).toEqual([
      ['foo', [1, 2]],
      ['bar', ['A']],
    ]);
  });

  it('catch-all listener-object prefers a matching named method over .emit()', () => {
    const ε = eventize();
    const fooFn = fake();
    const emitFn = fake();

    on(ε, {foo: fooFn, emit: emitFn});

    emit(ε, 'foo', 'X');
    emit(ε, 'bar', 'Y');

    expect(fooFn.calledOnceWith('X')).toBe(true);
    expect(emitFn.calledOnceWith('bar', 'Y')).toBe(true);
  });

  it('named subscription falls back to .emit() when the named method is missing', () => {
    // This is the under-documented behavior: on(ε, 'foo', listenerObj) will
    // call listenerObj.emit('foo', ...) if listenerObj.foo is not a function.
    const ε = eventize();
    const emitFn = fake();

    on(ε, 'foo', {emit: emitFn});

    emit(ε, 'foo', 1, 2);

    expect(emitFn.calledOnceWith('foo', 1, 2)).toBe(true);
  });

  it('named subscription does not fall back to .emit() for a different event', () => {
    const ε = eventize();
    const emitFn = fake();

    on(ε, 'foo', {emit: emitFn});

    emit(ε, 'bar', 'ignored');

    expect(emitFn.called).toBe(false);
  });
});

describe('forwarding events between eventized objects', () => {
  it('eventize.inject() target works as a catch-all forwarding listener', () => {
    const upstream = eventize.inject();
    const downstream = eventize.inject();
    const observed = fake();

    on(downstream, 'data', observed);
    on(upstream, downstream); // downstream is a catch-all listener of upstream

    emit(upstream, 'data', 42, 'hello');

    expect(observed.calledOnceWith(42, 'hello')).toBe(true);
  });

  it('class extends Eventize target works as a catch-all forwarding listener', () => {
    const upstream = new Eventize();
    const downstream = new Eventize();
    const observed = fake();

    on(downstream, 'evt', observed);
    on(upstream, downstream);

    emit(upstream, 'evt', 1);

    expect(observed.calledOnceWith(1)).toBe(true);
  });

  it('plain eventize() target without an .emit method silently does not forward', () => {
    // eventize(obj) does NOT install an emit method on the object.
    // So forwarding via the listener-object .emit() fallback finds nothing
    // and the event quietly drops on the floor — by design.
    const upstream = eventize();
    const downstream = eventize();
    const observed = fake();

    on(downstream, 'data', observed);
    on(upstream, downstream);

    expect(() => emit(upstream, 'data', 1)).not.toThrow();
    expect(observed.called).toBe(false);
  });
});

describe('emit() re-entrancy', () => {
  it('allows a listener to emit a different event on the same emitter', () => {
    const ε = eventize();
    const barFn = fake();
    on(ε, 'bar', barFn);
    on(ε, 'foo', () => {
      emit(ε, 'bar', 'from-foo');
    });

    expect(() => emit(ε, 'foo')).not.toThrow();
    expect(barFn.calledOnceWith('from-foo')).toBe(true);
  });

  it('allows the same event to be emitted serially', () => {
    const ε = eventize();
    const fn = fake();
    on(ε, 'foo', fn);

    emit(ε, 'foo', 1);
    emit(ε, 'foo', 2);
    emit(ε, 'foo', 3);

    expect(fn.callCount).toBe(3);
  });

  it('continues to dispatch normally after a listener throws', () => {
    const ε = eventize();
    const unsub = on(ε, 'foo', () => {
      throw new Error('listener boom');
    });

    expect(() => emit(ε, 'foo')).toThrow('listener boom');

    unsub();
    const fn = fake();
    on(ε, 'foo', fn);
    expect(() => emit(ε, 'foo', 'second')).not.toThrow();
    expect(fn.calledOnceWith('second')).toBe(true);
  });
});
