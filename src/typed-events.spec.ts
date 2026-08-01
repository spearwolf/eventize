import {
  emit,
  emitAsync,
  Eventize,
  eventize,
  on,
  once,
  onceAsync,
  retain,
  retainClear,
  unretain,
} from './index';
import type {AnyEventNames} from './index';

// Compile-time tests are interleaved with runtime assertions. The runtime
// assertions verify duck-typing & backwards compatibility actually works;
// the compile-time tests (via @ts-expect-error) verify the type narrowing.
//
// Note the user-side event map below has no `extends EventMap` — that's the
// supported usage. Adding `extends EventMap` would inherit an index signature
// and widen `keyof MyEvents` to `string | symbol`, defeating the narrowing.

interface MyEvents {
  data: [payload: string, code: number];
  ready: [];
  shutdown: [reason?: string];
}

// The documented escape hatch: an index signature makes `IsLooseMap` true
// again, which reopens every loose overload on all three surfaces.
interface OpenEvents {
  data: [payload: string, code: number];
  [key: string]: any[];
}

describe('typed events — generic event-map support', () => {
  describe('eventize<TEvents>() (functional API)', () => {
    it('passes typed args through emit and into the listener', () => {
      const ε = eventize<MyEvents>();
      const fn = jest.fn<void, [string, number]>();
      on(ε, 'data', fn);
      emit(ε, 'data', 'hello', 42);
      expect(fn).toHaveBeenCalledWith('hello', 42);
    });

    it('typed listener-object form: methods receive typed args', () => {
      const ε = eventize<MyEvents>();
      const calls: Array<[string, ...unknown[]]> = [];
      on(ε, {
        data(payload, code) {
          calls.push(['data', payload, code]);
        },
        ready() {
          calls.push(['ready']);
        },
      });
      emit(ε, 'data', 'x', 1);
      emit(ε, 'ready');
      expect(calls).toEqual([['data', 'x', 1], ['ready']]);
    });

    it('emits zero-arg events with the empty tuple type', () => {
      const ε = eventize<MyEvents>();
      const fn = jest.fn();
      on(ε, 'ready', fn);
      emit(ε, 'ready');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('emits optional-arg events with or without the trailing arg', () => {
      const ε = eventize<MyEvents>();
      const fn = jest.fn();
      on(ε, 'shutdown', fn);
      emit(ε, 'shutdown');
      emit(ε, 'shutdown', 'cleanup');
      expect(fn.mock.calls).toEqual([[], ['cleanup']]);
    });

    it('once with typed event passes args correctly', () => {
      const ε = eventize<MyEvents>();
      const fn = jest.fn();
      once(ε, 'data', fn);
      emit(ε, 'data', 'first', 1);
      emit(ε, 'data', 'second', 2);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('first', 1);
    });

    it('onceAsync resolves with the typed first argument', async () => {
      const ε = eventize<MyEvents>();
      const promise = onceAsync(ε, 'data');
      emit(ε, 'data', 'async!', 7);
      const result = await promise;
      expect(result).toBe('async!');
    });

    it('emitAsync still works on typed emitters', async () => {
      const ε = eventize<MyEvents>();
      on(ε, 'data', () => Promise.resolve('done'));
      const result = await emitAsync(ε, 'data', 'q', 1);
      expect(result).toEqual(['done']);
    });

    it('retain/unretain accept typed event names', () => {
      const ε = eventize<MyEvents>();
      retain(ε, 'data');
      emit(ε, 'data', 'kept', 9);
      const fn = jest.fn();
      on(ε, 'data', fn);
      expect(fn).toHaveBeenCalledWith('kept', 9);

      unretain(ε, 'data');
      emit(ε, 'data', 'live', 10);
      const fn2 = jest.fn();
      on(ε, 'data', fn2);
      // fn2 sees nothing — retain was removed before subscription
      expect(fn2).not.toHaveBeenCalled();
    });

    it('retainClear accepts typed event names', () => {
      const ε = eventize<MyEvents>();
      retain(ε, 'data');
      emit(ε, 'data', 'a', 1);
      retainClear(ε, 'data');
      const fn = jest.fn();
      on(ε, 'data', fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it('arrays of typed event names work for retain', () => {
      const ε = eventize<MyEvents>();
      retain(ε, ['data', 'ready']);
      emit(ε, 'ready');
      emit(ε, 'data', 's', 1);
      const fn = jest.fn();
      on(ε, {data: fn, ready: fn});
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('eventize.inject<TEvents>() — typed methods on the object', () => {
    it('typed emit + on with method API', () => {
      const ε = eventize.inject<MyEvents>();
      const fn = jest.fn<void, [string, number]>();
      ε.on('data', fn);
      ε.emit('data', 'x', 5);
      expect(fn).toHaveBeenCalledWith('x', 5);
    });

    it('typed listener-object form via .on()', () => {
      const ε = eventize.inject<MyEvents>();
      const calls: Array<[string, ...unknown[]]> = [];
      ε.on({
        data(p, c) {
          calls.push(['data', p, c]);
        },
        ready() {
          calls.push(['ready']);
        },
      });
      ε.emit('data', 'a', 1);
      ε.emit('ready');
      expect(calls).toEqual([['data', 'a', 1], ['ready']]);
    });
  });

  describe('class extends Eventize<TEvents>', () => {
    class MyEmitter extends Eventize<MyEvents> {}

    it('typed emit/on works on subclasses', () => {
      const ε = new MyEmitter();
      const fn = jest.fn();
      ε.on('data', fn);
      ε.emit('data', 'cls', 99);
      expect(fn).toHaveBeenCalledWith('cls', 99);
    });
  });

  describe('backwards compatibility — duck-typing first class', () => {
    it('untyped eventize() still accepts arbitrary event names and args', () => {
      const ε = eventize();
      const fn = jest.fn();
      on(ε, 'whatever', fn);
      emit(ε, 'whatever', 1, 'two', {three: 3});
      expect(fn).toHaveBeenCalledWith(1, 'two', {three: 3});
    });

    it('plain object enhanced via eventize() works without a generic', () => {
      const obj = eventize({foo: 'bar'});
      expect(obj.foo).toBe('bar');
      const fn = jest.fn();
      on(obj, 'evt', fn);
      emit(obj, 'evt', 'data');
      expect(fn).toHaveBeenCalledWith('data');
    });

    it('listener-object with methods named for arbitrary events still works', () => {
      const ε = eventize();
      const calls: string[] = [];
      on(ε, {
        anything() {
          calls.push('anything');
        },
        whatever() {
          calls.push('whatever');
        },
      });
      emit(ε, 'anything');
      emit(ε, 'whatever');
      expect(calls).toEqual(['anything', 'whatever']);
    });

    it('symbol event names still work on typed emitters via fallback overload', () => {
      const ε = eventize<MyEvents>();
      const SECRET = Symbol('secret');
      const fn = jest.fn();
      // Symbol events fall through to the loose overload
      on(ε, SECRET, fn);
      emit(ε, SECRET, 'shh');
      expect(fn).toHaveBeenCalledWith('shh');
    });

    it('Eventize<> base class with no generic stays permissive', () => {
      class Loose extends Eventize {}
      const ε = new Loose();
      const fn = jest.fn();
      ε.on('foo', fn);
      ε.emit('foo', 1, 2, 3);
      expect(fn).toHaveBeenCalledWith(1, 2, 3);
    });
  });

  describe('compile-time type checks (covered by tsc, not jest)', () => {
    // These tests do not run any expectations — they exist so that tsc
    // chokes if the type narrowing regresses. The `@ts-expect-error`
    // pragma is a compile-time assertion that the next line errors.
    // (Kept inside an it() block so jest's runtime is happy.)
    it('rejects unknown event names on typed emitters', () => {
      const ε = eventize<MyEvents>();
      // @ts-expect-error 'wrong' is not a key of MyEvents
      emit(ε, 'wrong', 1);
      // Suppress jest "no expect" warning — the assertion above is at type-time.
      expect(true).toBe(true);
    });

    it('rejects mismatched argument tuples on typed emit', () => {
      const ε = eventize<MyEvents>();
      // @ts-expect-error data expects [string, number]; passing [number, string]
      emit(ε, 'data', 42, 'flipped');
      expect(true).toBe(true);
    });

    it('rejects wrong listener signature on typed on()', () => {
      const ε = eventize<MyEvents>();
      // @ts-expect-error listener arity wrong: data is [string, number]
      on(ε, 'data', (s: string, n: number, x: boolean) => {
        void s;
        void n;
        void x;
      });
      expect(true).toBe(true);
    });

    it('rejects unknown keys in typed listener-object', () => {
      const ε = eventize<MyEvents>();
      // @ts-expect-error 'banana' is not a key of MyEvents
      on(ε, {
        banana() {},
      });
      expect(true).toBe(true);
    });

    it('rejects unknown event name in typed retain/unretain', () => {
      const ε = eventize<MyEvents>();
      // @ts-expect-error 'nope' is not a key of MyEvents
      retain(ε, 'nope');
      // @ts-expect-error
      unretain(ε, 'nope');
      // @ts-expect-error
      retainClear(ε, 'nope');
      expect(true).toBe(true);
    });

    // Not parity with the standalone functions: `NonTypedEmitter` closes every
    // loose overload there, while the guard here sits on the event-name slot
    // and leaves the forms that carry no name open. See `docs/backlog.md`.
    it('rejects wrong event names and wrong tuples on the inject surface', () => {
      const ε = eventize.inject<MyEvents>({});
      // @ts-expect-error 'wrong' is not a key of MyEvents
      ε.emit('wrong', 1);
      // @ts-expect-error data expects [string, number]
      ε.emit('data', 42, 'flipped');
      // @ts-expect-error 'wrong' is not a key of MyEvents
      ε.on('wrong', () => {});
      // @ts-expect-error
      ε.retain('nope');
      expect(true).toBe(true);
    });

    it('keeps every duck-typing route open on an untyped inject surface', () => {
      const ε = eventize.inject({});
      const seen: string[] = [];
      // Typed `string`, not the literal type — this is how a name read from
      // config or assembled at runtime arrives.
      const dynamic: string = 'runtime';
      const SECRET = Symbol('secret');

      ε.on('anything', () => seen.push('fn'));
      ε.on({whatever() {}});
      ε.on('anything', 'handler', {handler: () => seen.push('method')});
      ε.on(() => seen.push('catchAll'));
      ε.on(dynamic, () => seen.push('dynamic'));
      ε.on(SECRET, () => seen.push('symbol'));
      // Late-bound: the listener object may be supplied later, so this one
      // dispatches to nothing rather than throwing. Compiling is the assertion.
      ε.on('anything', 'suppliedLater', null);

      ε.emit('anything');
      ε.emit(dynamic);
      ε.emit(SECRET);

      expect(seen).toEqual(
        expect.arrayContaining([
          'fn',
          'method',
          'catchAll',
          'dynamic',
          'symbol',
        ]),
      );
    });

    it('reopens dynamic names for a map that declares an index signature', () => {
      const ε = eventize.inject<OpenEvents>({});
      const fake = jest.fn();
      ε.on('anythingAtAll', fake);
      ε.emit('anythingAtAll', 1);
      expect(fake).toHaveBeenCalledWith(1);
    });

    // The index signature is the remedy `CHANGELOG.md` and `docs/migration.md`
    // prescribe for the narrowing break, and the skill offers it for all three
    // surfaces. The inject case above was the only one pinned; a remedy that
    // works on one surface and not the others is worse than no remedy.
    it('reopens dynamic names on the class surface too', () => {
      class Open extends Eventize<OpenEvents> {}
      const ε = new Open();
      const fake = jest.fn();
      ε.on('anythingAtAll', fake);
      ε.emit('anythingAtAll', 1);
      expect(fake).toHaveBeenCalledWith(1);
    });

    it('reopens dynamic names on the standalone surface too', () => {
      const ε = eventize<OpenEvents>();
      const fake = jest.fn();
      on(ε, 'anythingAtAll', fake);
      emit(ε, 'anythingAtAll', 1);
      expect(fake).toHaveBeenCalledWith(1);
    });

    // The divergence `docs/backlog.md` accepts rather than fixes: the guard on
    // the method surfaces sits on the event-name slot, and a listener-object
    // passed alone carries no name for it to close. The standalone rejection
    // of the same literal is pinned above.
    it('accepts an undeclared listener-object method on the method surfaces', () => {
      const injectedBanana = jest.fn();
      const classBanana = jest.fn();

      const injected = eventize.inject<MyEvents>({});
      injected.on({banana: injectedBanana});

      class Chat extends Eventize<MyEvents> {
        subscribe() {
          this.on({banana: classBanana});
        }
      }
      const chat = new Chat();
      chat.subscribe();

      // Registered and live on both — but no *typed* emit can name the event
      // they wait for, which is what makes the acceptance a silent one. The
      // declared events go straight past them.
      injected.emit('data', 'x', 1);
      chat.emit('data', 'x', 1);
      expect(injectedBanana).not.toHaveBeenCalled();
      expect(classBanana).not.toHaveBeenCalled();

      // @ts-expect-error 'banana' is not a key of MyEvents
      injected.emit('banana');
      // @ts-expect-error 'banana' is not a key of MyEvents
      chat.emit('banana');
      expect(injectedBanana).toHaveBeenCalledTimes(1);
      expect(classBanana).toHaveBeenCalledTimes(1);
    });

    // The loose overloads stay and get the guard rather than being deleted.
    // Deleting them covers every *literal* call — `EventKeysOf<DefaultEventMap>`
    // is already `string | symbol` — but not a value that already carries
    // `AnyEventNames`, which is exactly how a forwarding wrapper types its own
    // parameter: `EventName | EventName[]` matches neither `K` nor `K[]`.
    it('still forwards an AnyEventNames-typed value on an untyped emitter', () => {
      const ε = eventize.inject({});
      const names: AnyEventNames = ['a', 'b'];
      const fake = jest.fn();
      ε.on(names, fake);
      ε.emit(names, 1);
      expect(fake).toHaveBeenCalledTimes(2);
    });
  });

  // `LooseEmitNames<TEvents>` is `never` for a typed map, so the loose array
  // route is closed on the method surfaces. The typed `K[]` arms of `emit()`
  // and `emitAsync()` on `EventizeApi` are what is left — without them a typed
  // inject or class surface could not emit an array at all.
  describe('the typed array arms of emit() and emitAsync()', () => {
    interface PairEvents {
      opened: [id: number];
      closed: [id: number];
    }

    it('emits several declared names in one call on the inject surface', async () => {
      const ε = eventize.inject<PairEvents>({});
      const seen: Array<[string, number]> = [];
      ε.on('opened', (id) => {
        seen.push(['opened', id]);
      });
      ε.on('closed', (id) => {
        seen.push(['closed', id]);
      });

      ε.emit(['opened', 'closed'], 7);
      expect(seen).toEqual([
        ['opened', 7],
        ['closed', 7],
      ]);

      await expect(
        ε.emitAsync(['opened', 'closed'], 8),
      ).resolves.toBeUndefined();
      expect(seen).toHaveLength(4);
    });

    it('emits several declared names in one call on the class surface', async () => {
      class Pair extends Eventize<PairEvents> {}
      const ε = new Pair();
      const seen: Array<[string, number]> = [];
      ε.on('opened', (id) => {
        seen.push(['opened', id]);
      });
      ε.on('closed', (id) => {
        seen.push(['closed', id]);
      });

      ε.emit(['opened', 'closed'], 7);
      expect(seen).toEqual([
        ['opened', 7],
        ['closed', 7],
      ]);

      await expect(
        ε.emitAsync(['opened', 'closed'], 8),
      ).resolves.toBeUndefined();
      expect(seen).toHaveLength(4);
    });

    it('still checks every name in the array and the argument tuple', () => {
      const ε = eventize.inject<PairEvents>({});
      // @ts-expect-error 'nope' is not a key of PairEvents
      ε.emit(['opened', 'nope'], 9);
      // @ts-expect-error opened expects [number]
      ε.emit(['opened'], 'nine');
      // @ts-expect-error 'nope' is not a key of PairEvents
      ε.emitAsync(['opened', 'nope'], 9);
      expect(true).toBe(true);
    });
  });
});
