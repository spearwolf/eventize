// Conformity suite: the same behavior cases run once per API surface
// (standalone functions, eventize.inject(obj), class Eventize), each against
// a freshly created emitter, so "three surfaces, one implementation"
// (AGENTS.md) is checked instead of merely claimed. expect2ImplEventizeApi
// only proved the nine methods exist; these cases exercise what they do —
// including the five delegations that existing specs never called:
// inject().off, inject().emitAsync, Eventize.once, Eventize.off and
// Eventize.emitAsync.

import {apiSurfaces} from './__test-utils__/expect2ImplEventizeApi';

describe.each(apiSurfaces)('$name', ({create}) => {
  it('on() + emit() pass arguments through', () => {
    const api = create();
    const listener = jest.fn();

    api.on('foo', listener);
    api.emit('foo', 1, 'two', [3]);

    expect(listener).toHaveBeenCalledWith(1, 'two', [3]);
  });

  it('once() fires exactly once', () => {
    const api = create();
    const listener = jest.fn();

    api.once('foo', listener);
    api.emit('foo', 1);
    api.emit('foo', 2);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1);
  });

  it('onceAsync() resolves with the first emitted value', async () => {
    const api = create();

    const promise = api.onceAsync<number>('foo');
    api.emit('foo', 42);

    await expect(promise).resolves.toBe(42);
  });

  it('off() bulk form removes every listener', () => {
    const api = create();
    const foo = jest.fn();
    const bar = jest.fn();

    api.on('foo', foo);
    api.on('bar', bar);
    api.off();
    api.emit('foo', 1);
    api.emit('bar', 1);

    expect(foo).not.toHaveBeenCalled();
    expect(bar).not.toHaveBeenCalled();
  });

  it('off() by event name removes only that event', () => {
    const api = create();
    const foo = jest.fn();
    const bar = jest.fn();

    api.on('foo', foo);
    api.on('bar', bar);
    api.off('foo');
    api.emit('foo', 1);
    api.emit('bar', 1);

    expect(foo).not.toHaveBeenCalled();
    expect(bar).toHaveBeenCalledWith(1);
  });

  it('emitAsync() aggregates listener return values', async () => {
    const api = create();

    api.on('foo', () => 1);
    api.on('foo', () => 2);

    await expect(api.emitAsync('foo')).resolves.toEqual([1, 2]);
  });

  // Narrowing emitAsync()'s return type was first done on the standalone
  // functions only; the inject() and class surfaces kept declaring
  // `Promise<any>` and went on accepting
  // the unchecked access. Pinning it here rather than beside the standalone
  // case is the point — this file is what makes "three surfaces, one
  // implementation" a check instead of a claim, and the type is part of the
  // implementation. Widening any of the three back fails the build: the
  // directive goes unused and TS2578 breaks it.
  it('emitAsync() resolves undefined, and the type says so', async () => {
    const api = create();
    const results = await api.emitAsync('foo');

    expect(results).toBeUndefined();
    expect(() => {
      // @ts-expect-error results may be undefined
      results.map((value: unknown) => value);
    }).toThrow(TypeError);
  });

  it('retain() replays the last value to a subscriber that joins later', () => {
    const api = create();

    api.retain('foo');
    api.emit('foo', 'retained');

    const listener = jest.fn();
    api.on('foo', listener);

    expect(listener).toHaveBeenCalledWith('retained');
  });

  it('unretain() stops replay to subscribers that join later', () => {
    const api = create();

    api.retain('foo');
    api.emit('foo', 'retained');
    api.unretain('foo');

    const listener = jest.fn();
    api.on('foo', listener);

    expect(listener).not.toHaveBeenCalled();
  });

  it('retainClear() drops the retained value but keeps the policy', () => {
    const api = create();

    api.retain('foo');
    api.emit('foo', 'first');
    api.retainClear('foo');

    const joinsAfterClear = jest.fn();
    api.on('foo', joinsAfterClear);
    expect(joinsAfterClear).not.toHaveBeenCalled();

    api.emit('foo', 'second');
    const joinsAfterReemit = jest.fn();
    api.on('foo', joinsAfterReemit);

    expect(joinsAfterReemit).toHaveBeenCalledWith('second');
  });
});
