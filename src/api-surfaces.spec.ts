// Conformity suite: the same behavior cases run once per API surface
// (standalone functions, eventize.inject(obj), class Eventize), each against
// a freshly created emitter, so "three surfaces, one implementation"
// (AGENTS.md) is checked instead of merely claimed. expect2ImplEventizeApi
// only proved the nine methods exist; these cases exercise what they do —
// including the five delegations that existing specs never called:
// inject().off, inject().emitAsync, Eventize.once, Eventize.off and
// Eventize.emitAsync.

import {apiSurfaces} from './__test-utils__/expect2ImplEventizeApi';
import {Eventize, eventize} from './index';
import type {AnyEventNames, EventArgs, OnEventNames} from './types';

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

describe('the class surface is the same contract as the other two', () => {
  interface MyEvents {
    data: [payload: string, code: number];
  }

  it('narrows event names and infers listener arguments', () => {
    class Chat extends Eventize<MyEvents> {}
    const chat = new Chat();
    const seen: Array<[string, number]> = [];

    chat.on('data', (payload, code) => {
      // Both parameters must be inferred from the map. If the class ever goes
      // back to declaring its own loose signature they become `any`, and the
      // two directives below stop being necessary.
      seen.push([payload, code]);
    });
    chat.emit('data', 'x', 1);
    expect(seen).toEqual([['x', 1]]);

    // @ts-expect-error 'wrong' is not a key of MyEvents
    chat.emit('wrong', 1);
    // @ts-expect-error 'wrong' is not a key of MyEvents
    chat.on('wrong', () => {});
  });

  it('keeps its methods non-enumerable on the prototype', () => {
    class Chat extends Eventize<MyEvents> {}
    const chat = new Chat();
    const enumerated: string[] = [];
    for (const key in chat) enumerated.push(key);

    expect(enumerated).toEqual([]);
    expect(typeof chat.on).toBe('function');
    expect(Object.prototype.hasOwnProperty.call(Eventize.prototype, 'on')).toBe(
      true,
    );
    // All three flags, not just `enumerable`. A later simplification to a bare
    // `{value}` descriptor would ship methods that are non-writable and
    // non-configurable — breaking `jest.spyOn` and every monkey-patch — and a
    // check on `enumerable` alone would still pass.
    expect(
      Object.getOwnPropertyDescriptor(Eventize.prototype, 'on'),
    ).toMatchObject({writable: true, configurable: true, enumerable: false});
  });

  // A member declared in a class body still wins over the merged interface —
  // that mechanism did not go away, the base class stopped using it. So an
  // override has to be assignable to the whole merged overload set, which
  // only the loose implementation signature is, and while it is declared the
  // subclass is loose in that one member again.
  it('lets a subclass override a method and reach the base through super', () => {
    class Chat extends Eventize<MyEvents> {
      seen: AnyEventNames[] = [];
      override emit(eventNames: AnyEventNames, ...args: EventArgs): void {
        this.seen.push(eventNames);
        super.emit(eventNames as never, ...args);
      }
    }

    const chat = new Chat();
    const listener = jest.fn();

    chat.on('data', listener);
    chat.emit('data', 'x', 1);

    expect(chat.seen).toEqual(['data']);
    expect(listener).toHaveBeenCalledWith('x', 1);
  });

  // The other half of the same rule, and the one the CHANGELOG calls a
  // breaking change: narrowing the override is what stopped compiling. Up to
  // v5.1.0 the class's own loose declaration was the only base member an
  // override had to match; the merged interface is a whole overload set now,
  // and a name-narrowed emit() satisfies neither the array arm nor the loose
  // one.
  it('rejects a subclass override that narrows one of the merged signatures', () => {
    class Chat extends Eventize<MyEvents> {
      // @ts-expect-error TS2416 — not assignable to the merged EventizeApi
      // overload set. The loose implementation signature is the one that is.
      override emit(eventName: 'data', ...args: [string, number]): void {
        super.emit(eventName, ...args);
      }
    }

    const chat = new Chat();
    const listener = jest.fn();

    chat.on('data', listener);
    chat.emit('data', 'x', 1);

    expect(listener).toHaveBeenCalledWith('x', 1);
  });
});

// eventize.inject() used to install its nine methods with Object.assign(),
// as own enumerable properties — the class surface twelve lines away in
// eventize.ts installs the same nine on the prototype with
// Object.defineProperties() and {enumerable: false} instead, and its comment
// names Object.assign() as the wrong choice for exactly this reason. This
// suite pins the inject surface to the same descriptor, so a spread or an
// Object.keys() over an injected object no longer carries a functioning,
// closure-capturing emitter along with it.
describe('the inject surface installs its methods non-enumerable, like the class surface', () => {
  it('keeps its methods off Object.keys() and for…in', () => {
    const obj = eventize.inject({});
    const enumerated: string[] = [];
    for (const key in obj) enumerated.push(key);

    expect(enumerated).toEqual([]);
    expect(Object.keys(obj)).toEqual([]);
    expect(typeof obj.on).toBe('function');
  });

  it('does not carry a functioning emit() through a spread', () => {
    const obj = eventize.inject({});
    const listener = jest.fn();
    obj.on('foo', listener);

    const spread = {...obj};

    expect((spread as any).emit).toBeUndefined();
    expect((spread as any).on).toBeUndefined();

    // the original is unaffected by taking the spread
    obj.emit('foo', 1);
    expect(listener).toHaveBeenCalledWith(1);
  });

  it('survives structuredClone() instead of throwing DataCloneError', () => {
    const obj = eventize.inject({});
    obj.on('foo', jest.fn());

    expect(() => structuredClone(obj)).not.toThrow();
  });

  it('still destructures out working methods', () => {
    const obj = eventize.inject({});
    const listener = jest.fn();
    const {on, emit} = obj;

    on('foo', listener);
    emit('foo', 42);

    expect(listener).toHaveBeenCalledWith(42);
  });

  it('all nine descriptors match the class prototype shape', () => {
    const obj = eventize.inject({});

    for (const name of [
      'on',
      'once',
      'onceAsync',
      'off',
      'emit',
      'emitAsync',
      'retain',
      'retainClear',
      'unretain',
    ] as const) {
      expect(Object.getOwnPropertyDescriptor(obj, name)).toMatchObject({
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
  });

  // Object.assign() runs an assignment through whatever accessor or
  // writability the existing property has; Object.defineProperty() never
  // does — it replaces the descriptor outright. That difference reaches
  // every member Object.assign() could not write through, not only a
  // getter-only one, and it only flips the outcome when the member is also
  // configurable: a non-configurable one is still rejected below, by
  // defineProperty()'s own check instead of the assignment's.
  it('overwrites a pre-existing getter-only member instead of throwing', () => {
    const obj: {emit?: unknown} = {};
    Object.defineProperty(obj, 'emit', {
      get: () => 'not an emitter',
      configurable: true,
      enumerable: true,
    });

    expect(() => eventize.inject(obj)).not.toThrow();

    const listener = jest.fn();
    (obj as any).on('foo', listener);
    (obj as any).emit('foo', 'bar');

    expect(listener).toHaveBeenCalledWith('bar');
  });

  it('overwrites a pre-existing non-writable, configurable data property instead of throwing', () => {
    const obj: {emit?: unknown} = {};
    Object.defineProperty(obj, 'emit', {
      value: 'not an emitter',
      writable: false,
      configurable: true,
      enumerable: true,
    });

    expect(() => eventize.inject(obj)).not.toThrow();

    const listener = jest.fn();
    (obj as any).on('foo', listener);
    (obj as any).emit('foo', 'bar');

    expect(listener).toHaveBeenCalledWith('bar');
  });

  // The one shape that still fails, and for a different reason than before:
  // defineProperty() refuses to redefine a non-configurable property at all,
  // whether it is a getter or a plain data property, so inject() still
  // throws here — now "Cannot redefine property", not the old assignment
  // error, and thrown by the same defineProperty() call regardless of which
  // of the two descriptor shapes made the property non-configurable.
  it('still throws on a pre-existing non-configurable member, now from defineProperty()', () => {
    const obj: {emit?: unknown} = {};
    Object.defineProperty(obj, 'emit', {
      value: 'not an emitter',
      writable: false,
      configurable: false,
      enumerable: true,
    });

    expect(() => eventize.inject(obj)).toThrow(/Cannot redefine property/);
  });
});

// `ConformityApi` above erases the real signatures to run one behaviour case
// against three surfaces, so nothing in that suite makes `tsc` resolve a
// `SubscribeFunc` arm. These two do, for the object-listener-with-context
// family: `src/on.spec.ts` covers the standalone spelling of the same shapes
// and the method surfaces carry their own arms. Both arms that take
// `eventNames + priority + listenerObject` are reached — the `EventKeysOf`
// one through a typed map, the `LooseNames` one through an untyped emitter —
// and each call dispatches, so these stay behavioural specs.
describe('the object-listener-with-context arms on the method surfaces', () => {
  interface MyEvents {
    data: [payload: string, code: number];
  }

  it('takes a context on the typed inject surface, with and without a priority', () => {
    const ε = eventize.inject<MyEvents>({});
    const owner = {};
    const plain = {data: jest.fn()};
    const prioritised = {data: jest.fn()};

    ε.on('data', plain, owner);
    ε.on('data', 10, prioritised, owner);
    ε.emit('data', 'x', 1);

    expect(plain.data).toHaveBeenCalledWith('x', 1);
    expect(prioritised.data).toHaveBeenCalledWith('x', 1);

    // The context is the key `off()` removes by, on this surface too.
    ε.off(owner);
    ε.emit('data', 'y', 2);

    expect(plain.data).toHaveBeenCalledTimes(1);
    expect(prioritised.data).toHaveBeenCalledTimes(1);
  });

  it('takes a context on the untyped class surface, in all four positions', () => {
    class Bus extends Eventize {}
    const ε = new Bus();
    const owner = {};
    const named = {data: jest.fn()};
    const namedWithPriority = {data: jest.fn()};
    const catchAll = {data: jest.fn()};
    const catchAllWithPriority = {data: jest.fn()};

    // A value already typed as `OnEventNames` matches neither `K` nor `K[]`,
    // which is what sends these two calls to the `LooseNames`-guarded arms
    // rather than to the typed ones a string literal would bind.
    const names: OnEventNames = 'data';

    ε.on(names, named, owner);
    ε.on(names, 10, namedWithPriority, owner);
    ε.on(catchAll, owner);
    ε.on(20, catchAllWithPriority, owner);
    ε.emit('data', 'x', 1);

    expect(named.data).toHaveBeenCalledWith('x', 1);
    expect(namedWithPriority.data).toHaveBeenCalledWith('x', 1);
    expect(catchAll.data).toHaveBeenCalledWith('x', 1);
    expect(catchAllWithPriority.data).toHaveBeenCalledWith('x', 1);

    ε.off(owner);
    ε.emit('data', 'y', 2);

    expect(named.data).toHaveBeenCalledTimes(1);
    expect(namedWithPriority.data).toHaveBeenCalledTimes(1);
    expect(catchAll.data).toHaveBeenCalledTimes(1);
    expect(catchAllWithPriority.data).toHaveBeenCalledTimes(1);
  });
});
