import {
  emit,
  emitAsync,
  Eventize,
  eventize,
  getSubscriptionCount,
  off,
  on,
  once,
  onceAsync,
  retain,
  retainClear,
  unretain,
} from './index';
import type {AnyEventNames, EventizeApi} from './index';

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

    // The symbol escape hatch is documented without a restriction, so every
    // member has to honour it — up to v5.1.0 the four below restricted their
    // typed arm to `EventKeysOf<TEvents>` while their loose arm was already
    // closed by the typed map, which made `retain(ε, SECRET)` a TS2769 on an
    // emitter that could subscribe and fire the very same event.
    it('accepts an undeclared symbol event in the retain family and onceAsync', async () => {
      const ε = eventize<MyEvents>();
      const SECRET = Symbol('secret');
      const seen: unknown[] = [];

      retain(ε, SECRET);
      emit(ε, SECRET, 'kept');
      on(ε, SECRET, (value) => seen.push(value));
      expect(seen).toEqual(['kept']);

      retainClear(ε, SECRET);
      unretain(ε, SECRET);
      retain(ε, [SECRET]);

      // The resolved value is typed `void`, not `any`: an event the map never
      // declared has no first tuple element to name. The annotation is the pin
      // — `unknown` would accept every other resolution too. At runtime the
      // value is the first argument, the same as for a declared event.
      const pending = onceAsync(ε, SECRET);
      emit(ε, SECRET, 'awaited');
      const resolved: void = await pending;
      expect(resolved).toBe('awaited');

      // The spelling that gets the value typed: the loose overload with an
      // explicit return-type argument. It is the standalone form only — the
      // method surface has no loose arm left once the map is typed.
      unretain(ε, SECRET); // else the retained 'awaited' replays into it
      const typed: Promise<string> = onceAsync<string>(ε, SECRET);
      emit(ε, SECRET, 'annotated');
      expect(await typed).toBe('annotated');
    });

    it('accepts an undeclared symbol in the array arm of emit and emitAsync', async () => {
      const ε = eventize<MyEvents>();
      const SECRET = Symbol('secret');
      const fn = jest.fn();

      on(ε, SECRET, fn);
      emit(ε, [SECRET], 'shh');
      await emitAsync(ε, [SECRET], 'shh again');

      // The price of the hatch in the array arm, and the sharpest edge of the
      // documented union gap: one undeclared symbol in the list makes `any[]`
      // one member of the argument union, so the *declared* names in the same
      // call are unchecked too. `data` is [string, number] and this compiles.
      emit(ε, [SECRET, 'data'], 1);

      expect(fn).toHaveBeenCalledTimes(3);
    });

    // The one member the hatch does not reach, named here so a spec fails if
    // that changes in either direction: the array arm of on()/once() infers a
    // key type it also feeds to `MultiArgsFor`, and a symbol has no tuple to
    // merge.
    it('does not reach the array arm of on() and once()', () => {
      const ε = eventize<MyEvents>();
      const SECRET = Symbol('secret');
      // @ts-expect-error a symbol is not accepted in the array form of on()
      on(ε, [SECRET], () => {});
      // @ts-expect-error nor in the array form of once()
      once(ε, [SECRET], () => {});
      expect(true).toBe(true);
    });

    it('honours the symbol escape hatch on the method surface too', async () => {
      const ε = eventize.inject<MyEvents>({});
      const SECRET = Symbol('secret');
      const seen: unknown[] = [];

      ε.retain(SECRET);
      ε.emit(SECRET, 'kept');
      ε.on(SECRET, (value) => seen.push(value));
      ε.retainClear(SECRET);
      ε.unretain(SECRET);
      ε.emit([SECRET], 'again');
      await ε.emitAsync([SECRET], 'and again');

      const pending = ε.onceAsync(SECRET);
      ε.emit(SECRET, 'awaited');
      const resolved: void = await pending;

      expect(seen).toEqual(['kept', 'again', 'and again', 'awaited']);
      expect(resolved).toBe('awaited');
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

    // The `EventMap` doc comment promises that a map deviating from the
    // `{[eventName]: arg-tuple}` convention fails at the call site rather than
    // at the declaration. Up to v5.1.0 it did not: `ArgsFor` fell back to
    // `any[]` for anything that was not a mutable array, which switched
    // checking off for the one key its author got wrong.
    it('rejects every argument list for a map value that is not an array', () => {
      interface WrongEvents {
        data: string;
      }
      const ε = eventize<WrongEvents>();
      // @ts-expect-error `data` is declared as `string`, not as an arg tuple
      emit(ε, 'data', 1, 2, 3, {nonsense: true});
      // Not even the empty call: there is no argument list a non-tuple
      // declares, so the slot is `never` rather than "anything goes".
      // @ts-expect-error same reason — `data` declares no argument tuple
      emit(ε, 'data');
      expect(true).toBe(true);
    });

    // The other half of the same promise, and the half that fails silently:
    // `never` as an argument list makes `(...args: never) => void`, which every
    // function is assignable to. Without the guard in `ListenerTaking` a broken
    // map would reject every emit and accept every listener — checked in one
    // direction only, which is worse than either.
    it('rejects a listener for a map value that is not an array, on all three surfaces', () => {
      interface WrongEvents {
        data: string;
      }
      const ε = eventize<WrongEvents>();
      const injected = eventize.inject<WrongEvents>({});
      class WrongClass extends Eventize<WrongEvents> {}
      const instance = new WrongClass();

      // Parameters annotated so the marker below has exactly one error to
      // catch — unannotated they would also be an implicit `any` each, and a
      // marker that swallows two diagnostics pins neither.
      // @ts-expect-error `data` declares no argument tuple, so it has no listener
      on(ε, 'data', (payload: string, code: number) => {
        void payload;
        void code;
      });
      // @ts-expect-error same on the inject surface
      injected.on('data', () => {});
      // @ts-expect-error and on the class surface
      instance.once('data', () => {});
      // The array form goes the same way — `MultiArgsFor` collapses to `never`
      // for a single broken name too.
      // @ts-expect-error `data` declares no argument tuple
      on(ε, ['data'], () => {});
      // The typed listener-object form reads the same declaration.
      // @ts-expect-error `data` declares no argument tuple
      on(ε, {data() {}});
      expect(true).toBe(true);
    });

    // The rule, from its passing side: a broken key fails wherever an argument
    // list is checked and passes through wherever none is. Pinned so the prose
    // describing it cannot quietly widen back to "nothing for that key
    // compiles" — every line below follows from the rule rather than being an
    // exception to it, which is why neither this case nor the prose counts them.
    it('passes a broken key through wherever no argument list is checked', () => {
      interface MixedEvents {
        message: string; // breaks the convention
        joined: [user: string]; // sound
      }
      const ε = eventize<MixedEvents>();
      const handlers = {handler() {}, message() {}};

      // No argument list is read here: the method name and the listener object
      // are resolved at dispatch, which is what late binding means. The event
      // name is checked and everything after it is not.
      on(ε, 'message', 'handler', handlers);
      on(ε, 'message', handlers);

      // A multi-name call distributes `ArgsFor` over the key union, and `never`
      // is the empty case of a union — so one sound key in the list absorbs the
      // broken one. This is the documented union gap, seen from its other side.
      emit(ε, ['message', 'joined'], 'bob');
      on(ε, ['message', 'joined'], (user) => void user);

      // `onceAsync()` names an event and awaits a value — no argument list is
      // involved at all. The annotation is the pin, and `void` is the point:
      // it is exactly what an undeclared symbol event resolves to, so this call
      // cannot tell a broken key from a private one, and an unannotated await
      // reports nothing.
      const p: Promise<void> = onceAsync(ε, 'message');
      void p;

      // The same array with the broken key alone has no union to hide in.
      // @ts-expect-error `message` declares no argument tuple
      emit(ε, ['message'], 'bob');
      expect(true).toBe(true);
    });

    it('agrees across emit, on and onceAsync on a key typed undefined', () => {
      // `NonNullable` empties this declaration out. `never` satisfies the tuple
      // pattern, so an unguarded `infer` would resolve `Promise<unknown>` here
      // while emit and on resolve `never` — one member of the API contradicting
      // the other two about one declaration.
      interface NothingEvents {
        nothing: undefined;
      }
      const ε = eventize<NothingEvents>();
      // @ts-expect-error `nothing` declares no argument tuple
      emit(ε, 'nothing');
      const pending: Promise<void> = onceAsync(ε, 'nothing');
      void pending;
      expect(true).toBe(true);
    });

    it('keeps an optional key emittable and typed', async () => {
      // `data?: [payload: string]` is `[payload: string] | undefined`, which is
      // not an array — without the `NonNullable` in `ArgsFor` the key would be
      // un-emittable. Optionality says nothing about the argument list.
      interface OptionalEvents {
        data?: [payload: string];
      }
      const ε = eventize<OptionalEvents>();
      const fn = jest.fn<void, [string]>();
      on(ε, 'data', fn);
      emit(ε, 'data', 'hello');
      // @ts-expect-error data expects [string]
      emit(ε, 'data', 42);
      expect(fn).toHaveBeenCalledWith('hello');

      // Same annotation-as-pin as for the readonly key above.
      const pending: Promise<string> = onceAsync(ε, 'data');
      emit(ε, 'data', 'awaited');
      expect(await pending).toBe('awaited');
    });

    it('checks a readonly tuple instead of waving it through', async () => {
      // What falls out of `as const`, and up to v5.1.0 not an `any[]` — so the
      // key it declared was unchecked.
      interface ReadonlyEvents {
        data: readonly [payload: string, code: number];
      }
      const ε = eventize<ReadonlyEvents>();
      const fn = jest.fn<void, [string, number]>();
      on(ε, 'data', fn);
      emit(ε, 'data', 'hello', 42);
      // @ts-expect-error data expects [string, number]; passing [number, string]
      emit(ε, 'data', 42, 'flipped');
      expect(fn).toHaveBeenCalledWith('hello', 42);

      // The annotation is the pin: `onceAsync()` reads the same declaration,
      // and a condition testing for a *mutable* tuple would hand back
      // `Promise<void>` here — a return type lost without a word, on a key
      // whose emit and on are fully checked.
      const pending: Promise<string> = onceAsync(ε, 'data');
      emit(ε, 'data', 'awaited', 1);
      expect(await pending).toBe('awaited');
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

    // The guard here sits on the event-name slot, so the forms that carry no
    // name stay open. The standalone functions close theirs on `obj`, which is
    // why they need the mirrored arms pinned further down rather than the
    // guard alone.
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
      // Late binding covers the method, not the object it lives on: an object
      // that does not carry `suppliedLater` yet is fine, a missing object is
      // not — on an untyped surface just as much as on a typed one.
      const lateBound: Record<string, unknown> = {};
      ε.on('anything', 'suppliedLater', lateBound);

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

    // The divergence `docs/typed-events.md` accepts rather than fixes: the
    // guard on the method surfaces sits on the event-name slot, and a
    // listener-object passed alone carries no name for it to close. The
    // standalone rejection of the same literal is pinned above.
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

  // The standalone guard sits on `obj`, so for a typed emitter it used to take
  // the *whole* loose overload set with it — including forms that carry no
  // event name and therefore no typo to guard against. What survived was
  // `on(ε, name, fn)`, `on(ε, [names], fn)` and `on(ε, listenerObject)`; four
  // shapes the runtime dispatches perfectly well had no compiling standalone
  // spelling. Every case below is a compile assertion first — the runtime
  // expectations are there to prove the shape still dispatches, and to keep
  // jest from reporting an empty test.
  describe('the standalone on() / once() on a typed emitter', () => {
    it('takes a listener object under a checked event name', () => {
      const ε = eventize<MyEvents>();
      const seen: Array<[string, number]> = [];
      const listenerObject = {
        data(payload: string, code: number) {
          seen.push([payload, code]);
        },
      };

      on(ε, 'data', listenerObject);
      emit(ε, 'data', 'x', 1);
      expect(seen).toEqual([['x', 1]]);
    });

    // The name is checked, everything after it is not — this arm resolves the
    // member at dispatch, so a listener object whose methods the map never
    // declares is legal and simply dispatches to nothing under `data`. That
    // asymmetry is what separates these arms from the function-plus-context
    // one below, where the listener *is* checked against the event.
    it('leaves the listener object method names unchecked', () => {
      const ε = eventize<MyEvents>();
      const undeclared = jest.fn();

      on(ε, 'data', {anythingAtAll: undeclared});
      on(ε, 'data', {anythingAtAll: undeclared}, {tag: 'ctx'});
      emit(ε, 'data', 'x', 1);

      expect(undeclared).not.toHaveBeenCalled();
      expect(getSubscriptionCount(ε)).toBe(2);
    });

    it('takes a method name plus a listener object', () => {
      const ε = eventize<MyEvents>();
      const handler = jest.fn();

      on(ε, 'data', 'handler', {handler});
      emit(ε, 'data', 'x', 1);
      expect(handler).toHaveBeenCalledWith('x', 1);

      // Late binding: the method is resolved at dispatch and is not required
      // to exist — an empty object subscribes fine and dispatches to nothing
      // until it grows the method. The object itself is required, on the typed
      // surface exactly as on the loose one.
      on(ε, 'ready', 'suppliedLater', {});
      expect(() => emit(ε, 'ready')).not.toThrow();
      // @ts-expect-error a method name needs something to read the method off
      expect(() => on(ε, 'ready', 'suppliedLater', null)).toThrow(
        'subscribeTo() called with insufficient arguments',
      );
    });

    it('takes a listener function with a trailing context object', () => {
      const ε = eventize<MyEvents>();
      const listener = jest.fn();
      const context = {tag: 'ctx'};

      on(ε, 'data', listener, context);
      emit(ε, 'data', 'x', 1);
      expect(listener).toHaveBeenCalledWith('x', 1);

      // The context is the fourth slot of the dedup tuple, which is what
      // `off(ε, fn, ctx)` removes by — the reason this shape needs a spelling.
      off(ε, listener, context);
      emit(ε, 'data', 'y', 2);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('takes a catch-all listener function', () => {
      const ε = eventize<MyEvents>();
      const seen: string[] = [];

      on(ε, (...args: unknown[]) => {
        seen.push(String(args[0]));
      });
      emit(ε, 'data', 'x', 1);
      emit(ε, 'shutdown', 'bye');
      expect(seen).toEqual(['x', 'bye']);
    });

    it('takes the priority variants of the same four shapes', () => {
      const ε = eventize<MyEvents>();
      const order: string[] = [];
      const context = {tag: 'ctx'};

      on(ε, 'data', 10, {data: () => order.push('object')});
      on(ε, 'data', 20, 'handler', {handler: () => order.push('method')});
      on(ε, 'data', 30, () => order.push('func'), context);
      on(ε, 40, () => order.push('catchAll'));
      on(ε, 50, 'handler', {handler: () => order.push('catchAllMethod')});
      on(ε, 60, {data: () => order.push('catchAllObject')});
      on(ε, {data: () => order.push('typedObject')}, context);

      emit(ε, 'data', 'x', 1);
      // Highest priority first, then the priority-free (1b) form last — the
      // mirrored arms take the priority slot exactly as the loose ones do.
      expect(order).toEqual([
        'catchAllObject',
        'catchAllMethod',
        'catchAll',
        'func',
        'method',
        'object',
        'typedObject',
      ]);
    });

    it('gives once() the same four shapes', () => {
      const ε = eventize<MyEvents>();
      const handler = jest.fn();
      const listener = jest.fn();
      const catchAll = jest.fn();
      const context = {tag: 'ctx'};

      once(ε, 'data', {data: handler});
      once(ε, 'data', 'handler', {handler});
      once(ε, 'data', listener, context);
      once(ε, catchAll);

      emit(ε, 'data', 'x', 1);
      emit(ε, 'data', 'y', 2);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(catchAll).toHaveBeenCalledTimes(1);
    });

    it('still checks the event name in every mirrored form', () => {
      const ε = eventize<MyEvents>();
      const context = {tag: 'ctx'};

      // @ts-expect-error 'nope' is not a key of MyEvents
      on(ε, 'nope', {nope: () => {}});
      // @ts-expect-error 'nope' is not a key of MyEvents
      on(ε, 'nope', 'handler', {handler: () => {}});
      // @ts-expect-error 'nope' is not a key of MyEvents
      on(ε, 'nope', () => {}, context);
      // @ts-expect-error 'nope' is not a key of MyEvents
      once(ε, 'nope', 10, {nope: () => {}});
      // @ts-expect-error data is [string, number], not [number]
      on(ε, 'data', (code: number) => void code, context);

      // The directives above are the assertions; `@ts-expect-error` suppresses
      // the diagnostic, it does not stop the call, so these five did subscribe.
      expect(getSubscriptionCount(ε)).toBe(5);
    });

    // The one loose shape that stays closed, and the reason the mirrored
    // object arms all require an event name or a priority ahead of the
    // listener object: two arguments alone still land on the typed
    // `EventListenerMethods<TEvents>` arm, whose method names are checked.
    // `ε.on({banana() {}})` remains the accepted divergence — closing it there
    // would take the catch-all listener-object subscription away from typed
    // maps entirely.
    it('still rejects an undeclared method on a listener object passed alone', () => {
      const ε = eventize<MyEvents>();
      const banana = jest.fn();

      // @ts-expect-error 'banana' is not a key of MyEvents
      on(ε, {banana});

      expect(banana).not.toHaveBeenCalled();
    });

    it('leaves every call form on an untyped emitter exactly as it was', () => {
      const ε = eventize();
      const seen: string[] = [];
      const context = {tag: 'ctx'};
      const dynamic: string = 'runtime';

      on(ε, 'anything', () => seen.push('fn'));
      on(ε, 'anything', () => seen.push('fnCtx'), context);
      on(ε, 'anything', 'handler', {handler: () => seen.push('method')});
      on(ε, 'anything', {anything: () => seen.push('object')});
      on(ε, 'anything', {anything: () => seen.push('objectCtx')}, context);
      on(ε, 'anything', 10, () => seen.push('prio'));
      on(ε, 'anything', 10, 'handler', {
        handler: () => seen.push('prioMethod'),
      });
      on(ε, 'anything', 10, {anything: () => seen.push('prioObject')});
      on(ε, () => seen.push('catchAll'));
      on(ε, 10, () => seen.push('catchAllPrio'));
      on(ε, 10, 'handler', {handler: () => seen.push('catchAllMethod')});
      on(ε, {anything: () => seen.push('catchAllObject')});
      on(ε, {anything: () => seen.push('catchAllObjectCtx')}, context);
      on(ε, dynamic, () => seen.push('dynamic'));

      emit(ε, 'anything');
      expect(seen).toHaveLength(13);
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

    // `PairEvents` above declares both names with the same tuple, which is
    // exactly the case where the documented union gap does not show. This map
    // is the case where it does — both halves pinned, because the gap widening
    // and the gap closing are each a change nobody would otherwise notice.
    interface SplitEvents {
      opened: [id: number];
      closed: [reason: string];
    }

    it('checks the array arm against the union of the listed tuples, not a shared one', () => {
      const ε = eventize.inject<SplitEvents>({});
      const seen: unknown[] = [];
      ε.on('closed', (reason) => {
        seen.push(reason);
      });

      // The documented gap, deliberately accepted: the call compiles as soon
      // as the arguments fit at least *one* listed name, and the runtime then
      // hands the same arguments to every name — so `closed`, whose tuple is
      // [string], is dispatched a number here without a word from the checker.
      ε.emit(['opened', 'closed'], 7);
      expect(seen).toEqual([7]);

      // The other direction of the same gap.
      ε.emit(['opened', 'closed'], 'boom');
      expect(seen).toEqual([7, 'boom']);

      // Arguments fitting neither name are still rejected — that is the half
      // of the check the gap does not swallow. Both lines still run, so they
      // come after the assertions above.
      // @ts-expect-error neither [id: number] nor [reason: string] takes a boolean
      ε.emit(['opened', 'closed'], true);
      // @ts-expect-error same for the async sibling
      ε.emitAsync(['opened', 'closed'], true);
    });
  });
});

// ---------------------------------------------------------------------------
// Arm-group parity — on() / once() across the three subscribe surfaces
//
// `SubscribeFunc` (the method form) and `StandaloneSubscribeFunc` (the same set
// with the emitter moved into the first slot) state the same call shapes twice,
// and what kept them in step was the comment at `StandaloneSubscribeFunc`
// asking nicely: "diverge here and the three API surfaces start disagreeing at
// a new place". This table is that sentence turned into something `tsc` runs.
//
// The eleven groups are not invented for the table. They are the eleven arms of
// `SubscribeArgs` in `src/types.ts` — the shapes `_subscribeTo()` decodes — so a
// group that loses its spelling on one surface is a call the runtime handles and
// the types refuse. Listed below with the arms that carry them on each side; the
// arm labels are the (1a)/(2t)/(4t) group markers written in `src/types.ts`
// itself, because line numbers in a comment go stale on the next edit.
//
//  1  NamedFuncArgs                (names, listener, listenerObject?)
//     SubscribeFunc:  (1a) two- and three-arg arms, plus the LooseNames pair
//     Standalone:     (1a) three- and four-arg arms, plus the (1) NonTypedEmitter pair
//
//  2  NamedMethodArgs              (names, methodName, listenerObject)
//     SubscribeFunc:  (2t) first arm, plus its LooseNames twin
//     Standalone:     (2t) first arm, plus (2) first arm
//
//  3  NamedObjectArgs              (names, listenerObject, listenerContext?)
//     SubscribeFunc:  (2t) third arm, plus its LooseNames twin
//     Standalone:     (2t) third arm, plus (3) three- and four-arg arms
//
//  4  NamedPriorityFuncArgs        (names, priority, listener, listenerObject?)
//     SubscribeFunc:  (1a) priority arms, plus the LooseNames pair
//     Standalone:     (1a) priority arms, plus the (1) priority pair
//
//  5  NamedPriorityMethodArgs      (names, priority, methodName, listenerObject)
//     SubscribeFunc:  (2t) second arm, plus its LooseNames twin
//     Standalone:     (2t) second arm, plus (2) second arm
//
//  6  NamedPriorityObjectArgs      (names, priority, listenerObject, listenerContext?)
//     SubscribeFunc:  (2t) fourth arm, plus its LooseNames twin
//     Standalone:     (2t) fourth arm, plus (3) four- and five-arg arms
//
//  7  CatchAllFuncArgs             (listener, listenerObject?)
//     SubscribeFunc:  (4) first arm — unguarded, so it serves both maps
//     Standalone:     (4t) first arm, plus (4) two- and three-arg arms
//
//  8  CatchAllObjectArgs           (listenerObject, listenerContext?)
//     SubscribeFunc:  (1b) for the bare form, (4) fourth arm otherwise
//     Standalone:     (1b) for the bare form, (4t) fourth arm and (4)/(3) otherwise
//
//  9  CatchAllPriorityFuncArgs     (priority, listener, listenerObject?)
//     SubscribeFunc:  (4) second arm
//     Standalone:     (4t) second arm, plus the (4) priority pair
//
// 10  CatchAllPriorityMethodArgs   (priority, methodName, listenerObject)
//     SubscribeFunc:  (4) third arm
//     Standalone:     (4t) third arm, plus the catch-all sibling in (2)
//
// 11  CatchAllPriorityObjectArgs   (priority, listenerObject, listenerContext?)
//     SubscribeFunc:  (4) fifth arm
//     Standalone:     (4t) fifth arm, plus (4) last arm and (3) fifth arm
//
// Two of the group markers in `src/types.ts` are spellings rather than groups of
// their own, and they are folded in above: (1c) is the array form of groups 1
// and 4 — the event-name slot is `OnEventNames`, which already admits a list and
// `[name, priority]` tuples — and (1b) is the typed form of group 8's bare arm.
//
// Every case below runs each group's literal on all three surfaces, once against
// an untyped emitter (where the loose arms carry it) and once against a typed one
// (where the typed arms do). The runtime assertion is `getSubscriptionCount()`:
// the calls are compile assertions first, the count only proves they registered
// rather than merely type-checked.
//
// The eleven group cases are spelled through `on()`. A twelfth case re-spells
// four of them through `once()`, so that both names are exercised rather than
// one of them being taken on trust; which four, and why those four, is stated
// there.
// ---------------------------------------------------------------------------

describe('arm-group parity across the three subscribe surfaces', () => {
  const looseTrio = () => ({
    standalone: eventize(),
    injected: eventize.inject({}),
    klass: new (class extends Eventize {})(),
  });

  const typedTrio = () => ({
    standalone: eventize<MyEvents>(),
    injected: eventize.inject<MyEvents>({}),
    klass: new (class extends Eventize<MyEvents> {})(),
  });

  const counts = (trio: {
    standalone: object;
    injected: object;
    klass: object;
  }) => [
    getSubscriptionCount(trio.standalone),
    getSubscriptionCount(trio.injected),
    getSubscriptionCount(trio.klass),
  ];

  const ctx = {tag: 'ctx'};

  it('(1) NamedFuncArgs — event name(s), listener, optional context', () => {
    const loose = looseTrio();
    on(loose.standalone, 'foo', () => {});
    on(loose.standalone, 'foo', () => {}, ctx);
    on(loose.standalone, ['foo', ['bar', 10]], () => {});
    loose.injected.on('foo', () => {});
    loose.injected.on('foo', () => {}, ctx);
    loose.injected.on(['foo', ['bar', 10]], () => {});
    loose.klass.on('foo', () => {});
    loose.klass.on('foo', () => {}, ctx);
    loose.klass.on(['foo', ['bar', 10]], () => {});

    const typed = typedTrio();
    on(typed.standalone, 'data', (payload, code) => void [payload, code]);
    on(typed.standalone, 'data', (payload) => void payload, ctx);
    on(typed.standalone, [['data', 10]], (payload) => void payload);
    typed.injected.on('data', (payload, code) => void [payload, code]);
    typed.injected.on('data', (payload) => void payload, ctx);
    typed.injected.on([['data', 10]], (payload) => void payload);
    typed.klass.on('data', (payload, code) => void [payload, code]);
    typed.klass.on('data', (payload) => void payload, ctx);
    typed.klass.on([['data', 10]], (payload) => void payload);

    expect(counts(loose)).toEqual([4, 4, 4]);
    expect(counts(typed)).toEqual([3, 3, 3]);
  });

  it('(2) NamedMethodArgs — event name(s), method name, listener object', () => {
    const loose = looseTrio();
    on(loose.standalone, 'foo', 'handler', {handler: () => {}});
    loose.injected.on('foo', 'handler', {handler: () => {}});
    loose.klass.on('foo', 'handler', {handler: () => {}});

    const typed = typedTrio();
    on(typed.standalone, 'data', 'handler', {handler: () => {}});
    typed.injected.on('data', 'handler', {handler: () => {}});
    typed.klass.on('data', 'handler', {handler: () => {}});

    expect(counts(loose)).toEqual([1, 1, 1]);
    expect(counts(typed)).toEqual([1, 1, 1]);
  });

  it('(3) NamedObjectArgs — event name(s), listener object, optional context', () => {
    const loose = looseTrio();
    on(loose.standalone, 'foo', {foo: () => {}});
    on(loose.standalone, 'foo', {foo: () => {}}, ctx);
    loose.injected.on('foo', {foo: () => {}});
    loose.injected.on('foo', {foo: () => {}}, ctx);
    loose.klass.on('foo', {foo: () => {}});
    loose.klass.on('foo', {foo: () => {}}, ctx);

    const typed = typedTrio();
    on(typed.standalone, 'data', {data: () => {}});
    on(typed.standalone, 'data', {data: () => {}}, ctx);
    typed.injected.on('data', {data: () => {}});
    typed.injected.on('data', {data: () => {}}, ctx);
    typed.klass.on('data', {data: () => {}});
    typed.klass.on('data', {data: () => {}}, ctx);

    expect(counts(loose)).toEqual([2, 2, 2]);
    expect(counts(typed)).toEqual([2, 2, 2]);
  });

  it('(4) NamedPriorityFuncArgs — event name(s), priority, listener, optional context', () => {
    const loose = looseTrio();
    on(loose.standalone, 'foo', 10, () => {});
    on(loose.standalone, 'foo', 10, () => {}, ctx);
    on(loose.standalone, ['foo', 'bar'], 10, () => {});
    loose.injected.on('foo', 10, () => {});
    loose.injected.on('foo', 10, () => {}, ctx);
    loose.injected.on(['foo', 'bar'], 10, () => {});
    loose.klass.on('foo', 10, () => {});
    loose.klass.on('foo', 10, () => {}, ctx);
    loose.klass.on(['foo', 'bar'], 10, () => {});

    const typed = typedTrio();
    on(typed.standalone, 'data', 10, (payload, code) => void [payload, code]);
    on(typed.standalone, 'data', 10, (payload) => void payload, ctx);
    on(typed.standalone, ['data'], 10, (payload) => void payload);
    typed.injected.on('data', 10, (payload, code) => void [payload, code]);
    typed.injected.on('data', 10, (payload) => void payload, ctx);
    typed.injected.on(['data'], 10, (payload) => void payload);
    typed.klass.on('data', 10, (payload, code) => void [payload, code]);
    typed.klass.on('data', 10, (payload) => void payload, ctx);
    typed.klass.on(['data'], 10, (payload) => void payload);

    expect(counts(loose)).toEqual([4, 4, 4]);
    expect(counts(typed)).toEqual([3, 3, 3]);
  });

  it('(5) NamedPriorityMethodArgs — event name(s), priority, method name, listener object', () => {
    const loose = looseTrio();
    on(loose.standalone, 'foo', 10, 'handler', {handler: () => {}});
    loose.injected.on('foo', 10, 'handler', {handler: () => {}});
    loose.klass.on('foo', 10, 'handler', {handler: () => {}});

    const typed = typedTrio();
    on(typed.standalone, 'data', 10, 'handler', {handler: () => {}});
    typed.injected.on('data', 10, 'handler', {handler: () => {}});
    typed.klass.on('data', 10, 'handler', {handler: () => {}});

    expect(counts(loose)).toEqual([1, 1, 1]);
    expect(counts(typed)).toEqual([1, 1, 1]);
  });

  it('(6) NamedPriorityObjectArgs — event name(s), priority, listener object, optional context', () => {
    const loose = looseTrio();
    on(loose.standalone, 'foo', 10, {foo: () => {}});
    on(loose.standalone, 'foo', 10, {foo: () => {}}, ctx);
    loose.injected.on('foo', 10, {foo: () => {}});
    loose.injected.on('foo', 10, {foo: () => {}}, ctx);
    loose.klass.on('foo', 10, {foo: () => {}});
    loose.klass.on('foo', 10, {foo: () => {}}, ctx);

    const typed = typedTrio();
    on(typed.standalone, 'data', 10, {data: () => {}});
    on(typed.standalone, 'data', 10, {data: () => {}}, ctx);
    typed.injected.on('data', 10, {data: () => {}});
    typed.injected.on('data', 10, {data: () => {}}, ctx);
    typed.klass.on('data', 10, {data: () => {}});
    typed.klass.on('data', 10, {data: () => {}}, ctx);

    expect(counts(loose)).toEqual([2, 2, 2]);
    expect(counts(typed)).toEqual([2, 2, 2]);
  });

  it('(7) CatchAllFuncArgs — listener, optional context', () => {
    const loose = looseTrio();
    on(loose.standalone, () => {});
    on(loose.standalone, () => {}, ctx);
    loose.injected.on(() => {});
    loose.injected.on(() => {}, ctx);
    loose.klass.on(() => {});
    loose.klass.on(() => {}, ctx);

    const typed = typedTrio();
    on(typed.standalone, () => {});
    on(typed.standalone, () => {}, ctx);
    typed.injected.on(() => {});
    typed.injected.on(() => {}, ctx);
    typed.klass.on(() => {});
    typed.klass.on(() => {}, ctx);

    expect(counts(loose)).toEqual([2, 2, 2]);
    expect(counts(typed)).toEqual([2, 2, 2]);
  });

  it('(8) CatchAllObjectArgs — listener object, optional context', () => {
    const loose = looseTrio();
    on(loose.standalone, {foo: () => {}});
    on(loose.standalone, {foo: () => {}}, ctx);
    loose.injected.on({foo: () => {}});
    loose.injected.on({foo: () => {}}, ctx);
    loose.klass.on({foo: () => {}});
    loose.klass.on({foo: () => {}}, ctx);

    // The one group whose literals are allowed to differ, and the reason sits
    // in `src/types.ts` at the (4t) comment: the bare two-argument standalone
    // form is owned by (1b), which checks the method names against the map,
    // while the method surfaces have no `obj` slot for the guard and fall
    // through to the unchecked (4) arm. That is the accepted divergence at the
    // `NonTypedEmitter` boundary, not a gap in this table — an undeclared
    // method is pinned on both sides elsewhere in this file. With a context
    // object all three take the same unchecked arm again.
    const typed = typedTrio();
    on(typed.standalone, {data: () => {}});
    on(typed.standalone, {data: () => {}}, ctx);
    typed.injected.on({data: () => {}});
    typed.injected.on({data: () => {}}, ctx);
    typed.klass.on({data: () => {}});
    typed.klass.on({data: () => {}}, ctx);

    expect(counts(loose)).toEqual([2, 2, 2]);
    expect(counts(typed)).toEqual([2, 2, 2]);
  });

  it('(9) CatchAllPriorityFuncArgs — priority, listener, optional context', () => {
    const loose = looseTrio();
    on(loose.standalone, 10, () => {});
    on(loose.standalone, 10, () => {}, ctx);
    loose.injected.on(10, () => {});
    loose.injected.on(10, () => {}, ctx);
    loose.klass.on(10, () => {});
    loose.klass.on(10, () => {}, ctx);

    const typed = typedTrio();
    on(typed.standalone, 10, () => {});
    on(typed.standalone, 10, () => {}, ctx);
    typed.injected.on(10, () => {});
    typed.injected.on(10, () => {}, ctx);
    typed.klass.on(10, () => {});
    typed.klass.on(10, () => {}, ctx);

    expect(counts(loose)).toEqual([2, 2, 2]);
    expect(counts(typed)).toEqual([2, 2, 2]);
  });

  it('(10) CatchAllPriorityMethodArgs — priority, method name, listener object', () => {
    const loose = looseTrio();
    on(loose.standalone, 10, 'handler', {handler: () => {}});
    loose.injected.on(10, 'handler', {handler: () => {}});
    loose.klass.on(10, 'handler', {handler: () => {}});

    const typed = typedTrio();
    on(typed.standalone, 10, 'handler', {handler: () => {}});
    typed.injected.on(10, 'handler', {handler: () => {}});
    typed.klass.on(10, 'handler', {handler: () => {}});

    expect(counts(loose)).toEqual([1, 1, 1]);
    expect(counts(typed)).toEqual([1, 1, 1]);
  });

  it('(11) CatchAllPriorityObjectArgs — priority, listener object, optional context', () => {
    const loose = looseTrio();
    on(loose.standalone, 10, {foo: () => {}});
    on(loose.standalone, 10, {foo: () => {}}, ctx);
    loose.injected.on(10, {foo: () => {}});
    loose.injected.on(10, {foo: () => {}}, ctx);
    loose.klass.on(10, {foo: () => {}});
    loose.klass.on(10, {foo: () => {}}, ctx);

    const typed = typedTrio();
    on(typed.standalone, 10, {data: () => {}});
    on(typed.standalone, 10, {data: () => {}}, ctx);
    typed.injected.on(10, {data: () => {}});
    typed.injected.on(10, {data: () => {}}, ctx);
    typed.klass.on(10, {data: () => {}});
    typed.klass.on(10, {data: () => {}}, ctx);

    expect(counts(loose)).toEqual([2, 2, 2]);
    expect(counts(typed)).toEqual([2, 2, 2]);
  });

  // The eleven cases above are spelled through `on()`. `once()` shares their
  // overload set by declaration rather than by copy, and the identity
  // assertions at the end of this file are what check that — but no identity
  // check shows that the name `once` is actually reachable through the arms on
  // every surface. Four of the eleven groups are spelled a second time here to
  // show it.
  //
  // Four, not eleven: this is coverage of the name, not a second matrix. The
  // four span the argument forms the remaining seven only vary within — (1) a
  // listener function after the event names, (2) a method name with its
  // listener object, (4) the priority slot in the named form, (11) the
  // catch-all form, which carries a listener object and a priority at once.
  // The seven left out recombine those same slots — (7) and (8) drop the name
  // slot, (5) and (10) add a method name, (3) and (6) put a listener object
  // where a function stood, (9) moves the priority onto the catch-all form —
  // and none of them needs a slot the four above leave unspelled.
  //
  // The counts are the ones the matching `on()` group asserts, unchanged: a
  // `once()` subscription sits in the store like any other until something
  // dispatches it, and nothing here emits.
  it('spells four of the groups through once() on all three surfaces', () => {
    // (1) NamedFuncArgs
    const looseNamed = looseTrio();
    once(looseNamed.standalone, 'foo', () => {});
    once(looseNamed.standalone, 'foo', () => {}, ctx);
    once(looseNamed.standalone, ['foo', ['bar', 10]], () => {});
    looseNamed.injected.once('foo', () => {});
    looseNamed.injected.once('foo', () => {}, ctx);
    looseNamed.injected.once(['foo', ['bar', 10]], () => {});
    looseNamed.klass.once('foo', () => {});
    looseNamed.klass.once('foo', () => {}, ctx);
    looseNamed.klass.once(['foo', ['bar', 10]], () => {});

    const typedNamed = typedTrio();
    once(
      typedNamed.standalone,
      'data',
      (payload, code) => void [payload, code],
    );
    once(typedNamed.standalone, 'data', (payload) => void payload, ctx);
    once(typedNamed.standalone, [['data', 10]], (payload) => void payload);
    typedNamed.injected.once('data', (payload, code) => void [payload, code]);
    typedNamed.injected.once('data', (payload) => void payload, ctx);
    typedNamed.injected.once([['data', 10]], (payload) => void payload);
    typedNamed.klass.once('data', (payload, code) => void [payload, code]);
    typedNamed.klass.once('data', (payload) => void payload, ctx);
    typedNamed.klass.once([['data', 10]], (payload) => void payload);

    // (2) NamedMethodArgs
    const looseMethod = looseTrio();
    once(looseMethod.standalone, 'foo', 'handler', {handler: () => {}});
    looseMethod.injected.once('foo', 'handler', {handler: () => {}});
    looseMethod.klass.once('foo', 'handler', {handler: () => {}});

    const typedMethod = typedTrio();
    once(typedMethod.standalone, 'data', 'handler', {handler: () => {}});
    typedMethod.injected.once('data', 'handler', {handler: () => {}});
    typedMethod.klass.once('data', 'handler', {handler: () => {}});

    // (4) NamedPriorityFuncArgs
    const loosePriority = looseTrio();
    once(loosePriority.standalone, 'foo', 10, () => {});
    once(loosePriority.standalone, 'foo', 10, () => {}, ctx);
    once(loosePriority.standalone, ['foo', 'bar'], 10, () => {});
    loosePriority.injected.once('foo', 10, () => {});
    loosePriority.injected.once('foo', 10, () => {}, ctx);
    loosePriority.injected.once(['foo', 'bar'], 10, () => {});
    loosePriority.klass.once('foo', 10, () => {});
    loosePriority.klass.once('foo', 10, () => {}, ctx);
    loosePriority.klass.once(['foo', 'bar'], 10, () => {});

    const typedPriority = typedTrio();
    once(
      typedPriority.standalone,
      'data',
      10,
      (payload, code) => void [payload, code],
    );
    once(typedPriority.standalone, 'data', 10, (payload) => void payload, ctx);
    once(typedPriority.standalone, ['data'], 10, (payload) => void payload);
    typedPriority.injected.once(
      'data',
      10,
      (payload, code) => void [payload, code],
    );
    typedPriority.injected.once('data', 10, (payload) => void payload, ctx);
    typedPriority.injected.once(['data'], 10, (payload) => void payload);
    typedPriority.klass.once(
      'data',
      10,
      (payload, code) => void [payload, code],
    );
    typedPriority.klass.once('data', 10, (payload) => void payload, ctx);
    typedPriority.klass.once(['data'], 10, (payload) => void payload);

    // (11) CatchAllPriorityObjectArgs
    const looseCatchAll = looseTrio();
    once(looseCatchAll.standalone, 10, {foo: () => {}});
    once(looseCatchAll.standalone, 10, {foo: () => {}}, ctx);
    looseCatchAll.injected.once(10, {foo: () => {}});
    looseCatchAll.injected.once(10, {foo: () => {}}, ctx);
    looseCatchAll.klass.once(10, {foo: () => {}});
    looseCatchAll.klass.once(10, {foo: () => {}}, ctx);

    const typedCatchAll = typedTrio();
    once(typedCatchAll.standalone, 10, {data: () => {}});
    once(typedCatchAll.standalone, 10, {data: () => {}}, ctx);
    typedCatchAll.injected.once(10, {data: () => {}});
    typedCatchAll.injected.once(10, {data: () => {}}, ctx);
    typedCatchAll.klass.once(10, {data: () => {}});
    typedCatchAll.klass.once(10, {data: () => {}}, ctx);

    // The loose (1) and (4) trios each hold four: the array spelling covers two
    // event names, the other two calls one each. Their typed twins list a
    // single name, so they hold three.
    expect(counts(looseNamed)).toEqual([4, 4, 4]);
    expect(counts(typedNamed)).toEqual([3, 3, 3]);
    expect(counts(looseMethod)).toEqual([1, 1, 1]);
    expect(counts(typedMethod)).toEqual([1, 1, 1]);
    expect(counts(loosePriority)).toEqual([4, 4, 4]);
    expect(counts(typedPriority)).toEqual([3, 3, 3]);
    expect(counts(looseCatchAll)).toEqual([2, 2, 2]);
    expect(counts(typedCatchAll)).toEqual([2, 2, 2]);
  });

  // The other half of the table, and the half that makes the first half worth
  // running. Eleven accepted shapes prove nothing on their own if the overload
  // sets also accept everything else; each group below violates its *own*
  // trailing slot with a value `_subscribeTo()` refuses at runtime too — a
  // nullish listener or listener object, or an array where a listener object
  // belongs. `@ts-expect-error` is the assertion: an unused one is TS2578 and
  // fails `npm run typecheck`, so a surface that quietly widens a slot breaks
  // the build here rather than in a consumer's code.
  it('rejects the same eleven malformed shapes on all three surfaces', () => {
    // Never called. `tsc` checks a function body whether or not anything runs
    // it, and running these would only re-assert `_subscribeTo()`'s runtime
    // guards, which have their own specs. What is pinned here is the type.
    const rejected = () => {
      const loose = looseTrio();
      const typed = typedTrio();

      // (1) the listener slot takes a function, not a lookup that missed
      // @ts-expect-error null is not a listener
      on(loose.standalone, 'foo', null);
      // @ts-expect-error null is not a listener
      loose.injected.on('foo', null);
      // @ts-expect-error null is not a listener
      loose.klass.on('foo', null);
      // @ts-expect-error null is not a listener
      on(typed.standalone, 'data', null);
      // @ts-expect-error null is not a listener
      typed.injected.on('data', null);
      // @ts-expect-error null is not a listener
      typed.klass.on('data', null);

      // (2) a method name needs an object to be read off at dispatch time
      // @ts-expect-error a method name needs something to read the method off
      on(loose.standalone, 'foo', 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      loose.injected.on('foo', 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      loose.klass.on('foo', 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      on(typed.standalone, 'data', 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      typed.injected.on('data', 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      typed.klass.on('data', 'handler', null);

      // (3) an array in the listener-object slot is a mis-typed name list
      // @ts-expect-error an array is not a listener object
      on(loose.standalone, 'foo', [1, 2]);
      // @ts-expect-error an array is not a listener object
      loose.injected.on('foo', [1, 2]);
      // @ts-expect-error an array is not a listener object
      loose.klass.on('foo', [1, 2]);
      // @ts-expect-error an array is not a listener object
      on(typed.standalone, 'data', [1, 2]);
      // @ts-expect-error an array is not a listener object
      typed.injected.on('data', [1, 2]);
      // @ts-expect-error an array is not a listener object
      typed.klass.on('data', [1, 2]);

      // (4) same as (1), with the priority slot filled
      // @ts-expect-error null is not a listener
      on(loose.standalone, 'foo', 10, null);
      // @ts-expect-error null is not a listener
      loose.injected.on('foo', 10, null);
      // @ts-expect-error null is not a listener
      loose.klass.on('foo', 10, null);
      // @ts-expect-error null is not a listener
      on(typed.standalone, 'data', 10, null);
      // @ts-expect-error null is not a listener
      typed.injected.on('data', 10, null);
      // @ts-expect-error null is not a listener
      typed.klass.on('data', 10, null);

      // (5) same as (2), with the priority slot filled
      // @ts-expect-error a method name needs something to read the method off
      on(loose.standalone, 'foo', 10, 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      loose.injected.on('foo', 10, 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      loose.klass.on('foo', 10, 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      on(typed.standalone, 'data', 10, 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      typed.injected.on('data', 10, 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      typed.klass.on('data', 10, 'handler', null);

      // (6) same as (3), with the priority slot filled
      // @ts-expect-error an array is not a listener object
      on(loose.standalone, 'foo', 10, [1, 2]);
      // @ts-expect-error an array is not a listener object
      loose.injected.on('foo', 10, [1, 2]);
      // @ts-expect-error an array is not a listener object
      loose.klass.on('foo', 10, [1, 2]);
      // @ts-expect-error an array is not a listener object
      on(typed.standalone, 'data', 10, [1, 2]);
      // @ts-expect-error an array is not a listener object
      typed.injected.on('data', 10, [1, 2]);
      // @ts-expect-error an array is not a listener object
      typed.klass.on('data', 10, [1, 2]);

      // (7) the catch-all listener slot, same rule without an event name
      // @ts-expect-error null is neither a listener nor a listener object
      on(loose.standalone, null);
      // @ts-expect-error null is neither a listener nor a listener object
      loose.injected.on(null);
      // @ts-expect-error null is neither a listener nor a listener object
      loose.klass.on(null);
      // @ts-expect-error null is neither a listener nor a listener object
      on(typed.standalone, null);
      // @ts-expect-error null is neither a listener nor a listener object
      typed.injected.on(null);
      // @ts-expect-error null is neither a listener nor a listener object
      typed.klass.on(null);

      // (8) the catch-all listener-object slot; an array here reads as a name
      //     list one slot too far to the right
      // @ts-expect-error an array is not a listener object
      on(loose.standalone, [1, 2], ctx);
      // @ts-expect-error an array is not a listener object
      loose.injected.on([1, 2], ctx);
      // @ts-expect-error an array is not a listener object
      loose.klass.on([1, 2], ctx);
      // @ts-expect-error an array is not a listener object
      on(typed.standalone, [1, 2], ctx);
      // @ts-expect-error an array is not a listener object
      typed.injected.on([1, 2], ctx);
      // @ts-expect-error an array is not a listener object
      typed.klass.on([1, 2], ctx);

      // (9) same as (7), with the priority slot filled
      // @ts-expect-error null is neither a listener nor a listener object
      on(loose.standalone, 10, null);
      // @ts-expect-error null is neither a listener nor a listener object
      loose.injected.on(10, null);
      // @ts-expect-error null is neither a listener nor a listener object
      loose.klass.on(10, null);
      // @ts-expect-error null is neither a listener nor a listener object
      on(typed.standalone, 10, null);
      // @ts-expect-error null is neither a listener nor a listener object
      typed.injected.on(10, null);
      // @ts-expect-error null is neither a listener nor a listener object
      typed.klass.on(10, null);

      // (10) the catch-all method-name form, missing its listener object
      // @ts-expect-error a method name needs something to read the method off
      on(loose.standalone, 10, 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      loose.injected.on(10, 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      loose.klass.on(10, 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      on(typed.standalone, 10, 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      typed.injected.on(10, 'handler', null);
      // @ts-expect-error a method name needs something to read the method off
      typed.klass.on(10, 'handler', null);

      // (11) same as (8), with the priority slot filled
      // @ts-expect-error an array is not a listener object
      on(loose.standalone, 10, [1, 2]);
      // @ts-expect-error an array is not a listener object
      loose.injected.on(10, [1, 2]);
      // @ts-expect-error an array is not a listener object
      loose.klass.on(10, [1, 2]);
      // @ts-expect-error an array is not a listener object
      on(typed.standalone, 10, [1, 2]);
      // @ts-expect-error an array is not a listener object
      typed.injected.on(10, [1, 2]);
      // @ts-expect-error an array is not a listener object
      typed.klass.on(10, [1, 2]);
    };

    expect(rejected).toBeInstanceOf(Function);
  });

  // The table above spells `on()` in all eleven groups and `once()` in four of
  // them, so both names are known to reach the arms. What a call literal cannot
  // show is that no surface has grown a declaration of its own: `on` and `once`
  // resolve to a single shared type today, and each pair below therefore
  // compares that type with itself. That is the point of the check rather than
  // a flaw in it: a compare stops holding as soon as its pair stops being one
  // type. It takes all four together, though, and they catch different things.
  // A class body that declares only `on` — the failure `AGENTS.md` names — is
  // what `classMatches` is there for; declare `on` and `once` there alike and
  // `classMatches` stays true, and only `surfacesMatch` reports it. None of the
  // four is, or claims to be, a comparison of two independently written
  // overload sets.
  //
  // Identity, not mutual assignability: two overload sets can accept each
  // other's calls and still disagree about which arm wins, and arm order is
  // load-bearing in both interfaces. The two-parameter conditional is the usual
  // way to ask TypeScript for identity — deferring both sides makes the compiler
  // compare the types rather than relate them.
  it('declares once() with the same overload set as on(), on every surface', () => {
    type IdenticalTo<A, B> =
      (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? true
        : false;

    const standaloneMatches: IdenticalTo<typeof on, typeof once> = true;
    const injectMatches: IdenticalTo<
      EventizeApi<MyEvents>['on'],
      EventizeApi<MyEvents>['once']
    > = true;
    const classMatches: IdenticalTo<
      Eventize<MyEvents>['on'],
      Eventize<MyEvents>['once']
    > = true;

    // And the two method surfaces share one type outright, which is "three API
    // surfaces, one implementation" stated at the type level: the class body
    // declares no members of its own, so anything that changed only one of the
    // two would have to have been written twice on purpose.
    const surfacesMatch: IdenticalTo<
      EventizeApi<MyEvents>['on'],
      Eventize<MyEvents>['on']
    > = true;

    expect([
      standaloneMatches,
      injectMatches,
      classMatches,
      surfacesMatch,
    ]).toEqual([true, true, true, true]);
  });
});
