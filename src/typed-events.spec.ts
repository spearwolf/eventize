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
