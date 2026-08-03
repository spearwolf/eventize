# @spearwolf/eventize

A tiny, clever, and dependency-free library for synchronous event-driven programming in JavaScript and TypeScript.

![npm (scoped)](https://img.shields.io/npm/v/%40spearwolf/eventize)
![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/spearwolf/eventize/main.yml)
![GitHub](https://img.shields.io/github/license/spearwolf/eventize)

## Introduction 👀

`@spearwolf/eventize` provides a powerful and intuitive API for building event-based systems. This library invokes event listeners _synchronously_. That design choice gives you precise control over your execution flow, which is critical in scenarios like game loops (`requestAnimationFrame`), real-time applications, or anywhere immediate, predictable execution is necessary.

Written entirely in TypeScript and targeting modern `ES2022`, it offers a type-safe developer experience without sacrificing performance or adding bloat.

Zero runtime dependencies, `sideEffects: false`, tree-shakeable. The package
ships unminified — the ESM build is about 48 kB — which comes to roughly
5 kB once a bundler minifies it and the transport gzips it.

### Features

- 🚀 **Developer-Focused API**: Clean, modern, and functional.
- ✨ **Wildcards & Priorities**: Subscribe to all events and control listener execution order.
- 🔷 **Full TypeScript Support**: Optional generic event maps narrow `emit`, `on`, retained-event names and listener arguments — without losing first-class duck-typing for code that doesn't opt in.
- 📦 **Zero Runtime Dependencies**: Lightweight with a minimal footprint (~5 kB minified + gzipped).
- ESM & CommonJS Support.
- Apache 2.0 Licensed.

## ⚙️ Installation

```sh
$ npm install @spearwolf/eventize
```

The library is distributed in both ES Module (`import`) and CommonJS (`require`) formats.

> [!NOTE]
> Since version 3.0.0 there is also a [CHANGELOG](./CHANGELOG.md)

### 🤖 For AI coding agents

This repo ships a quick-reference skill for AI coding assistants (Claude Code & co.) at [`skills/using-eventize/`](./skills/using-eventize/SKILL.md). `SKILL.md` carries the mental model, the API surface, the four behavior families and the pitfalls; deeper material sits in `references/` and is loaded only when a task needs it:

| Reference | Covers |
| --- | --- |
| [`api-details.md`](./skills/using-eventize/references/api-details.md) | every `on()` / `off()` shape, per-event priorities, retain semantics in full |
| [`lifecycle.md`](./skills/using-eventize/references/lifecycle.md) | what an emitter holds, what each `off()` form releases, handle lifetime |
| [`typed-events.md`](./skills/using-eventize/references/typed-events.md) | generic event maps, the `EventMap` trap, symbol escape hatch |
| [`migration.md`](./skills/using-eventize/references/migration.md) | v5 → v6 breaking changes, the v4 → v5 emit change, the v4.3 type-brand migration for classes |

The skill folder is self-contained: everything it references lives inside it, so
it works when symlinked out of the repo.

To use it, copy or symlink the folder into your agent's skills directory, e.g. for Claude Code:

```sh
ln -s "$(pwd)/skills/using-eventize" ~/.claude/skills/using-eventize
```

Skills are auto-discovered — no extra registration step.

### 📚 Further documentation

The deep material behind the summaries below:

- [Unsubscribing in depth](./docs/off.md) — every `off()` signature, the interaction with `retain()`, and reference counting
- [Retained events in depth](./docs/retain.md) — `retain()`, `retainClear()`, `unretain()`, symbol names, and the wildcard bulk forms
- [Typed event maps](./docs/typed-events.md) — generic event maps, the inject and class forms, symbol events as an escape hatch
- [Lifecycle & cleanup](./docs/lifecycle.md) — what an emitter holds and what releases it
- [Migration guide](./docs/migration.md) — upgrading from v5, and the older jumps

## 📖 Getting Started

The core idea is simple: an object, called an **emitter**, can be "eventized" to emit named events. Other parts of your application, called **listeners**, subscribe to those events and run immediately when the event is emitted.

![Emitter emits named event to listeners](https://raw.githubusercontent.com/spearwolf/eventize/main/docs-assets/emitter-emits-named-events-listeners.svg)

```javascript
import {eventize, on, emit} from '@spearwolf/eventize';

// 1. Create an eventized object (the emitter)
const bus = eventize({});

// 2. Subscribe to a 'data' event
on(bus, 'data', (message, code) => {
  console.log(`Received message: ${message} with code ${code}`);
});

// 3. Emit the 'data' event with some arguments
emit(bus, 'data', 'Hello World!', 42);

// Output: Received message: Hello World! with code 42
```

## The Event-Driven Model

### Emitters

An emitter is any object that has been enhanced with event capabilities. The recommended way to create one is the `eventize()` function.

> [!TIP]
> We often use `ε` (epsilon) as a variable name to denote an _eventized_ object.

```javascript
import {eventize} from '@spearwolf/eventize';

const ε = eventize();          // from a new empty object

const myApp = {name: 'MyApp'};
eventize(myApp);               // myApp is now an emitter
```

### Listeners

A listener can be a function or a method on an object.

```js
on(ε, 'foo', (a) => {
  console.log('(1) Hello', a);
});

on(ε, 'foo', {
  foo(a, b) {
    console.log('(2)', b, a);
  },
});

on(ε, {
  foo(a, b) {
    console.log('(3) Hi', a);
  },
  bar() {
    console.log('(4) hej');
  },
});

emit(ε, 'foo', 'eventize', 'Greetings from');
// => "(1) Hello eventize"
// => "(2) Greetings from eventize"
// => "(3) Hi eventize"

emit(ε, 'bar');
// => "(4) hej"
```

### Events

Events are identified by a name, which can be a `string` or a `symbol`. Anywhere a name is accepted, an array of names works too.

```javascript
emit(ε, 'user-login');                          // no data
emit(ε, 'update', {id: 1, payload: 'new data'}); // one argument
emit(ε, 'hello', 'hi', 'hej', 'hallo');          // several arguments
```

## 📚 API Reference

The API is designed to be used functionally, with named exports like `on(ε, …)` and `emit(ε, …)`. For class-based patterns you can inject the same API as methods.

| API           | Description                                                          |
| ------------- | -------------------------------------------------------------------- |
| `on`          | subscribe to events                                                  |
| `once`        | subscribe to the next event only                                     |
| `onceAsync`   | the async version of subscribe only to the next event                |
| `emit`        | dispatch an event                                                    |
| `emitAsync`   | dispatch an event and wait for any promises returned by subscribers  |
| `off`         | unsubscribe                                                          |
| `retain`      | hold the last event until it is received by a subscriber             |
| `retainClear` | clear the last event                                                 |
| `unretain`    | remove the retain policy entirely (clears value and disables retain) |

### Creating Emitters

| Method                      | Is a `EventizedObject`? | Has API Methods Injected? | Recommended For                             |
| --------------------------- | ----------------------- | ------------------------- | ------------------------------------------- |
| `eventize(obj)`             | ✅                      | ❌                        | Functional programming, general use.        |
| `eventize.inject(obj)`      | ✅                      | ✅                        | Object-oriented or class-based composition. |
| `class extends Eventize {}` | ✅                      | ✅                        | Class-based inheritance.                    |

#### `eventize(obj)`

The primary and recommended approach — it prepares an object for the functional API.

```typescript
import {eventize, on, emit} from '@spearwolf/eventize';

const ε = eventize(); // creates an emitter from {}

on(ε, 'foo', () => console.log('foo called'));

emit(ε, 'foo'); // => "foo called"
```

The target must be extensible: `eventize(Object.freeze(obj))` throws a `TypeError` naming the cause — frozen, sealed and `preventExtensions()`ed alike. An object frozen *after* it was eventized keeps working.

#### `eventize.inject(obj)`

Modifies the object, attaching the entire API as methods.

```typescript
const myApp = {name: 'MyApp'};
const obj = eventize.inject(myApp);

obj.on('foo', () => console.log('foo called'));

obj.emit('foo'); // => "foo called"
```

#### `class extends Eventize`

```typescript
import {Eventize} from '@spearwolf/eventize';

class MyEmitter extends Eventize {}

const obj = new MyEmitter();

obj.on('foo', () => console.log('foo called'));

obj.emit('foo'); // => "foo called"
```

#### Class-based, but without inheritance

Call `eventize.inject` in the constructor instead:

```ts
import {eventize, Eventize} from '@spearwolf/eventize';

interface Foo extends Eventize {}

class Foo {
  constructor() {
    eventize.inject(this);
  }
}
```

---

### The four behavior families

Eventize splits its API into four families by how each function treats a target that was never eventized. This is **by design**:

| Function                                    | On a non-eventized object                    |
| ------------------------------------------- | -------------------------------------------- |
| `on()`, `once()`, `onceAsync()`, `retain()` | Auto-eventizes the object                    |
| `emit()`, `emitAsync()` (v5+)               | Duck-types: calls `obj[eventName](...args)` — a function target too (v6.0.0) |
| `off()`, `getSubscriptionCount()`, `getRetainedCount()`, `getRetainedEventNames()` | Silently does nothing / returns `0` / `[]` |
| `retainClear()`, `unretain()`               | Throws `"object is not eventized"`           |

**Why the split?**

`on` / `once` / `retain` _install_ behavior. Requiring an explicit `eventize(obj)` before every `on(obj, …)` would be pure ceremony, so they auto-eventize: `on({}, 'foo', fn)` is a perfectly meaningful intent.

`emit` / `emitAsync` fire events. On an eventized target they dispatch to subscribed listeners. On a non-eventized object (v5+) they fall back to duck-typing — the same pattern that already powers listener-object dispatch:

1. If `obj[eventName]` is a function the object actually provides → call it with the args (with `this === obj`).
2. Else if `obj.emit` is a function → call `obj.emit(eventName, ...args)`.
3. Otherwise → silently no-op.

Step 1 ignores a member that is identical to `Object.prototype`'s member of the same name, so an event called `toString`, `valueOf`, `constructor`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable` or `toLocaleString` does not dispatch to the function every object inherits — it moves on to step 2. The list is not a list: the test is identity against `Object.prototype`, so it covers every member that object carries, V8's `__defineGetter__` / `__lookupSetter__` family included. Define your own `toString` — on the object or on its class — and it is called as normal, because the check compares the resolved member against `Object.prototype`'s function by identity rather than going by the name. The one own property that is still skipped is an alias of that same function, `{toString: Object.prototype.toString}`. The same boundary applies to listener-object dispatch on an eventized target.

Since v6.0.0 the target may be a **function** — a class with static handlers, a factory carrying methods — and the same three steps apply, with the boundary extended one prototype level: a member identical to `Function.prototype`'s member of the same name is ignored too, so `call`, `apply`, `bind`, `toString` and `Symbol.hasInstance` are not handlers on a function target and move on to step 2. `name` and `length` are own properties of every function rather than inherited ones, so the boundary is not what decides them — they hold a string and a number, are therefore not callable, and reach step 2 all the same. Two names are the exception to "an unanswered name is harmless": `arguments` and `caller` throw a `TypeError` for a strict-mode function on the read itself, before any boundary can subtract them, so an event under either name surfaces that error out of the dispatch. `__proto__` is skipped unconditionally, the way `constructor` is: no identity test can subtract it, and on a function it resolves to `Function.prototype` — or, on a subclass, to the superclass — which the dispatch would otherwise call.

One collision: on a target with its own `.emit`, `emit(obj, 'emit', ...args)` hits step 1 and calls `obj.emit(...args)` without the event name — it never reaches step 2. A target with no `.emit` is unaffected (both steps fail, silent no-op). This is the protocol applied literally; the collision occurs when the event name matches the fallback method itself.

That lets you point `emit()` at adapters, mocks, or plain method-bags without ceremony. `null`, `undefined` and primitives silently no-op. **`'*'` still throws** — it remains subscribe-only.

Inside an array it throws *late*: `emit(ε, ['a', '*', 'b'])` dispatches `'a'`, then throws, and never dispatches `'b'` — a half-completed emit. `retain(ε, [names])` is the opposite and rejects atomically: a `'*'` anywhere in the array retains nothing at all.

`retainClear` / `unretain` _operate on retain state_ that only exists on eventized objects. There is no meaningful duck-typed equivalent, so they keep throwing — pointing them at a plain `{}` is almost always a bug.

`off` is permissive because cleanup code routinely runs against objects whose lifecycle isn't fully under the caller's control. `getSubscriptionCount` follows the same reasoning and returns `0` for any non-eventized input.

```javascript
// ✅ Auto-eventize: convenient, intent is clear
const obj = {};
on(obj, 'foo', () => console.log('foo')); // obj is now eventized
emit(obj, 'foo'); // works (dispatches to listener)

// ✅ Duck-typing (v5+): point emit() at a plain method-bag
const sink = {
  foo(msg) {
    console.log('foo:', msg);
  },
};
emit(sink, 'foo', 'hello'); // => "foo: hello"
emit(sink, 'missing'); // no-op (no method, no .emit fallback)

// ✅ Duck-typing (v6.0.0): a function or a class is a target too
class Registry {
  static reset(reason) {
    console.log('reset:', reason);
  }
}
emit(Registry, 'reset', 'shutdown'); // => "reset: shutdown"
emit(Registry, 'bind', globalThis); // no-op — inherited from Function.prototype

// ✅ off() is permissive — safe in cleanup paths
off({}); // no-op, no throw

// ❌ Strict: retain-state mutators still surface typos
retainClear({}, 'foo'); // throws: "object is not eventized"
unretain({}, 'foo'); // throws: "object is not eventized"
```

The type guard `isEventized(obj)` (see _Utilities_) lets you check defensively when you need to.

> **Migration from v4 → v5:** Previously `emit()` / `emitAsync()` also threw `"object is not eventized"` on a non-eventized target. If you relied on that as a typo-safety net, either gate the call with `isEventized()` or use a typed emitter (`eventize<TEvents>()`) — typed emitters still reject unknown event names at compile time. See the [migration guide](./docs/migration.md).

---

### Subscribing to Events

#### `on(emitter, ...args)`

Subscribes a listener to one or more events and returns an `unsubscribe` function.

```typescript
on(ε, eventName(s), [priority], listener, [context]);
on(ε, [priority], listener, [context]); // wildcard subscription
```

```javascript
const ε = eventize();
const listener = (val) => console.log(val);

const unsubscribe = on(ε, 'my-event', listener);
emit(ε, 'my-event', 'Hello!'); // => "Hello!"

unsubscribe();
emit(ε, 'my-event', 'Silent?'); // (nothing happens)
```

The full set of call shapes — including the method-name form `on(ε, 'foo', 'methodName', obj)` — is listed in [`skills/using-eventize/references/api-details.md`](./skills/using-eventize/references/api-details.md).

The listener slot takes only what can be dispatched to: a function, a method name (string or symbol), or a listener object. Anything else throws — `on(ε, 'foo', 5)` fails instead of registering a subscription no `emit()` could ever reach. Since v6.0.0; up to v5.1.0 the slot was tested for truthiness alone, so that call registered a dead entry while `on(ε, 'foo', 0)` threw.

That rejection shares one message, `subscribeTo() called with insufficient arguments`, with three other mistakes. Since v6.0.0 `Error.cause` says which one it was: `'missing-listener'` (the slot came out `null`/`undefined`), `'not-dispatchable'` (the case above), `'empty-method-name'` (a method name of `''`), and `'empty-names'` (an empty array of event names). All four reject atomically — nothing is registered before the check.

##### Multiple Event Names

```javascript
on(ε, ['foo', 'bar'], listener);

emit(ε, 'foo', 1); // => 1
emit(ε, 'bar', 2); // => 2
```

An **empty** array throws (since v6.0.0). Up to v5.1.0 it registered nothing at all and said nothing about it: `on(ε, [], listener)` handed back an unsubscribe function for zero subscriptions, and `onceAsync(ε, [])` returned a promise that never settled — no resolve, no reject, a dangling `await` for the emitter's lifetime. Where the name list is assembled at runtime, check its `.length` before subscribing.

##### Wildcards (`*`)

Listen to _all_ events of an object using `'*'` or by omitting the event name entirely.

```javascript
const wildcardListener = (...args) => {
  console.log('event fired with args:', args);
};

on(ε, '*', wildcardListener); // or just on(ε, wildcardListener)

emit(ε, 'foo', 1, 2); // => event fired with args: [1, 2]
emit(ε, 'bar', 'A'); // => event fired with args: ['A']
```

> [!IMPORTANT]
> A function-form wildcard listener receives **only the `emit()` arguments**. The event name is _not_ passed in. If you need to know which event fired, register a listener-object with an `.emit()` method instead — eventize falls back to it for events without a matching named method, and passes `eventName` as the first argument:
>
> ```javascript
> on(ε, {
>   emit(eventName, ...args) {
>     console.log(`Event '${eventName}' fired with:`, args);
>   },
> });
>
> emit(ε, 'foo', 1, 2); // => Event 'foo' fired with: [1, 2]
> emit(ε, 'bar', 'A'); // => Event 'bar' fired with: ['A']
> ```

> [!NOTE]
> The `.emit()` fallback also applies to **named** subscriptions. `on(ε, 'foo', listenerObj)` calls `listenerObj.emit('foo', ...args)` when `listenerObj.foo` is not a function. A matching named method always wins over `.emit()`.

##### Forwarding events between emitters

Because the `.emit()` fallback matches the signature of the `emit` method that `eventize.inject()` (and `class extends Eventize`) install, you can subscribe one eventized object directly as a catch-all listener of another to **forward all events**:

```javascript
const upstream = eventize.inject();
const downstream = eventize.inject();

on(downstream, 'data', (x) => console.log('downstream got', x));

on(upstream, downstream); // forward every event from upstream

emit(upstream, 'data', 42); // => downstream got 42
```

Caveats:

- The target must have an `.emit(eventName, ...args)` method. `eventize.inject(obj)` and `class extends Eventize` install one; **plain `eventize(obj)` does not** — forwarding to such a target silently does nothing.
- A target method whose name matches the event takes precedence over `.emit()`.
- **Forwarding cycles are not detected.** `A → B → A` (or same-emitter same-event re-emission from inside a listener) recurses without bound and overflows the stack. Eventize threw on this in v4.2, but the guard forbade valid scenarios; breaking cycles is now the caller's job (set a flag, gate the forward, or emit a different event).

##### Priorities

Listeners with higher priority numbers run first. The default is `0`.

```javascript
import {eventize, on, emit, Priority} from '@spearwolf/eventize';

const ε = eventize();
const calls = [];

on(ε, 'test', () => calls.push('Normal'));
on(ε, 'test', Priority.Low, () => calls.push('Low'));           // runs later
on(ε, 'test', Priority.Critical, () => calls.push('Critical')); // runs sooner

emit(ε, 'test');
console.log(calls); // => ["Critical", "Normal", "Low"]
```

`Priority` provides `Max`, `Critical`, `High`, `Medium`, `Normal`, `Low`, and `Min`. The legacy aliases `AAA` (= `Critical`), `BB` (= `High`), `C` (= `Medium`), and `Default` (= `Normal`) are `@deprecated` on `EventizePriority` and slated for removal in a future major — they keep working, but editors now strike them through.

A priority must be an actual number: since v6.0.0 `NaN` throws (`subscribeTo() called with a NaN priority`), in every position a priority can occupy — up to v5.1.0 it passed and left the listener wherever the size of the bucket put it. The guard is `typeof priority !== 'number' || Number.isNaN(priority)`, so a string, boolean or object reaching a `[name, priority]` tuple's second slot from an untyped call site is rejected the same way; the positional forms are already gated on `typeof` before they get here. `Priority.Max` and `Priority.Min` are `±Infinity` and are perfectly valid — this is not a finiteness test. Validate at the call site, not after: `on(ε, 'foo', Number.isNaN(p) ? Priority.Normal : p, listener)` — and a `[name, priority]` tuple needs the same guard on its own second element, the call-level one does not cover it.

To give each event of a multi-event subscription its own priority, pass `[eventName, priority]` tuples. Tuples and bare names may be mixed freely; a tuple's priority overrides the call-level one for that event:

```javascript
on(ε, [['foo', Priority.Critical], 'bar'], listener);
// 'foo' subscribed at Critical, 'bar' at the default priority

on(ε, [['foo', Priority.Critical], ['bar', Priority.Low]], Priority.High, listener);
// both tuples win over the call-level Priority.High
```

Since v5.1 this works on typed emitters too, and tuples may be mixed with bare names; event names inside tuples are still checked against the event map. Earlier versions required a homogeneous array of tuples and rejected the form on typed emitters.

The `NaN` rule reaches into the tuples, and it rejects the whole call: a single `NaN` in one tuple leaves none of the listed names subscribed, and a `NaN` at call level throws even when every tuple carries its own priority to override it.

##### Listener Objects

Subscribe an object whose method names match the event names.

```javascript
const service = {
  onSave(data) {
    console.log('Saving:', data);
  },
  onDelete(id) {
    console.log('Deleting:', id);
  },
};

on(ε, service); // methods are matched to event names

emit(ε, 'onSave', {user: 'test'}); // => "Saving: { user: 'test' }"
emit(ε, 'onDelete', 123); // => "Deleting: 123"
```

Subscribing the **same listener-object** twice for the same event with `on()` does _not_ register two listeners — eventize collapses the second call into the existing entry and increments an internal reference count, so the listener still fires once per `emit()`:

```javascript
const listener = {foo: () => console.log('foo')};

on(ε, 'foo', listener);
on(ε, 'foo', listener); // same (event, priority, listener, context) → refCount = 2

emit(ε, 'foo'); // => "foo"  (called once, not twice)
```

> [!IMPORTANT]
> De-duplication applies **only to listener-object forms** — and, since v6.0.0, `once()` shares it with `on()`: subscribing the same listener object through any mixture of the two calls, in any order, still yields one registration. Plain function listeners are **not** deduplicated: registering the same function twice produces two independent listeners that will both run. See [_Reference counting_](./docs/off.md#reference-counting) for details.

---

#### `once(emitter, ...args)`

Subscribes a listener that is removed automatically after its first call. Arguments are the same as for `on()`.

```javascript
once(ε, 'my-event', () => console.log('This runs only once.'));

emit(ε, 'my-event'); // => "This runs only once."
emit(ε, 'my-event'); // (nothing happens)
```

> [!NOTE]
> With multiple event names, the listener is removed after the _first_ of those events fires.

> [!NOTE]
> `once()` aggregates onto the same listener-object identity `on()` does (since v6.0.0). Two `once(ε, 'foo', listenerObject)` calls land on one listener: the next `emit()` calls it once and discharges both. An `on(ε, 'foo', listenerObject)` on the same identity keeps it subscribed after that. See [_Reference counting_](./docs/off.md#reference-counting).

#### `onceAsync(emitter, eventName | eventName[], options?)`

Returns a `Promise` that resolves with the event's first argument.

```javascript
async function waitForLoad() {
  console.log('Waiting for data...');
  const data = await onceAsync(ε, 'loaded');
  console.log('Data loaded:', data);
}

waitForLoad();

setTimeout(() => emit(ε, 'loaded', {content: '...'}), 100);
// => Waiting for data...
// => Data loaded: { content: '...' }
```

`onceAsync()` takes an optional `{signal}`. Without it, an event that never
fires keeps the listener, the resolve closure and the caller's `await`
continuation attached to the emitter for as long as the emitter lives —
there is no other handle to release them with.

```javascript
const controller = new AbortController();
try {
  const value = await onceAsync(ε, 'ready', {signal: controller.signal});
} catch (err) {
  if (err.name === 'AbortError') {
    /* cancelled */
  }
}
// somewhere in teardown:
controller.abort();
```

Aborting unsubscribes the internal `once()` and rejects with the signal's
`reason` whenever it has one, and with an `AbortError` `DOMException`
otherwise — including the `abort(null)` case, where `fetch()` would hand you a
`null` to catch. A signal that is already aborted rejects without ever
subscribing.

---

### Unsubscribing

#### `off(emitter, ...args)`

Removes listeners from an emitter — the counterpart to `on()`, for cleanup where you no longer hold the `unsubscribe` function.

```javascript
off(ε);                       // all listeners — and all retained state
off(ε, undefined);            // ⚠️ the same branch — wipes everything
off(ε, 'foo');                // all listeners for 'foo' (also unretains 'foo')
off(ε, ['foo', 'bar']);       // several events
off(ε, listenerFunc);         // that function, under every context it was registered with
off(ε, listenerFunc, ctx);    // only where it was registered with exactly that context
off(ε, listenerObject);       // every subscription of that object
off(ε, 'foo', listenerObject); // that object, on 'foo' only — but still unretains 'foo'
off(ε, '*', listenerObject);   // that object's wildcard subscription only
```

A nullish second argument is **not** a no-op. `off(ε, handlers[name])` empties the whole emitter when the lookup misses, and one `null` or `undefined` element turns an array form into the same total wipe. Guard the lookup, or keep the handle `on()` returned and call that.

Calling `off()` on a non-eventized object (or on `null`/`undefined` as the *emitter*) is a no-op, which makes it safe in cleanup paths without an `isEventized()` check.

Since v6.0.0 the bulk forms `off(ε)` and `off(ε, '*')` also empty the retained-events keeper — every retained value and every retain policy goes with the listeners. Before that they cleared only the listeners, so a subscriber arriving afterwards was still handed the old payload.

📖 **[Full `off()` reference →](./docs/off.md)** — every signature, the interaction with `retain()`, behavior during an active `emit()`, and reference counting.

---

### Emitting Events

#### `emit(emitter, eventName | eventName[], ...args)`

Dispatches an event synchronously, immediately invoking all subscribed listeners.

```javascript
on(ε, 'update', (id, data) => console.log(`Item ${id}:`, data));

emit(ε, 'update', 42, {status: 'complete'});
// => "Item 42: { status: 'complete' }"

emit(ε, ['update', 'log'], 100, {status: 'multi-event'});
```

> [!IMPORTANT]
> `'*'` is reserved for **subscribing** to all events and cannot be emitted. `emit(ε, '*', …)` throws — emit a concrete event name instead. (In an array form, events listed before the `'*'` element still dispatch before the throw, consistent with mid-dispatch error semantics.)
>
> Calling `emit()` from inside a listener is fine, including re-emitting the same event. Eventize does **not** detect forwarding cycles or same-event self-recursion — `A → B → A` (or `on(ε, 'foo', () => emit(ε, 'foo'))`) will overflow the stack. If you build a forwarding chain, break cycles yourself.

#### `emitAsync(emitter, ...)`

Emits an event and returns a `Promise` that resolves once all promises returned by listeners have resolved. Non-`null` and non-`undefined` return values are collected into an array.

```javascript
on(ε, 'load', () => Promise.resolve('Data from source 1'));
on(ε, 'load', () => 'Simple data');
on(ε, 'load', () => null); // ignored

const results = await emitAsync(ε, 'load');
console.log(results); // => ["Data from source 1", "Simple data"]
```

A listener returning an array has its elements awaited with `Promise.all`, but the array stays one entry of the result: a lone listener returning `[1, Promise.resolve(2)]` gives `[[1, 2]]`, not `[1, 2]`. Flatten yourself if you want the elements inline.

> [!NOTE]
> When nothing was collected — no listeners, or every listener returned `null`/`undefined` — the promise resolves to **`undefined`**, not to an empty array.

---

### Error Handling in Listeners

Listeners are dispatched **synchronously**. If a listener throws, the exception propagates out of the `emit()` call (or out of the synchronous portion of `emitAsync()`) — eventize does **not** catch it for you.

Consequences worth knowing:

- **Dispatch is aborted.** Listeners that haven't run yet for the same `emit()` will _not_ be called. Listeners that already ran are unaffected.
- **The throwing listener stays subscribed.** It is not auto-removed; the next `emit()` calls it again.
- **`retain()` is not updated for that emit.** The retained value is written _after_ all listeners run, so a thrown exception leaves the previously retained value untouched.

```javascript
const calls = [];

on(ε, 'foo', () => calls.push('first'));
on(ε, 'foo', () => {
  throw new Error('boom');
});
on(ε, 'foo', () => calls.push('third')); // not reached

try {
  emit(ε, 'foo');
} catch (err) {
  console.error(err.message); // => "boom"
}

console.log(calls); // => ["first"]
```

**Recommendation:** if a single listener's failure should not stop dispatch to the others, wrap that listener's body in `try/catch` yourself. Eventize deliberately keeps no global error handler so error policy stays explicit at each subscription site.

> [!NOTE]
> `emitAsync()` aggregates listener return values into a single `Promise.all`. A listener returning a **rejected promise** rejects the awaited result, but the other listeners — being dispatched synchronously — have already run by then. A listener that throws synchronously still aborts dispatch in the same way as with `emit()`.

> [!NOTE]
> Mixing the two in one dispatch costs the collected values. The aggregation is built *after* the dispatch returns, so a synchronous throw — from a listener, or from `'*'` inside a name array — never reaches it: the caller gets the throw and nothing else. Every value collected up to that point is dropped, and any rejection among them is discarded along with it, so no `unhandledrejection` fires and Node's default `--unhandled-rejections=throw` has nothing to terminate on. What a listener already returned is unrecoverable, though — wrap a throwing listener in `try/catch` if the values before it matter.

---

### State Management

#### `retain(emitter, eventName | eventName[])`

Tells an emitter to hold onto the last-emitted event and its data. A new listener is immediately called with the retained data — comparable to a `ReplaySubject(1)` in RxJS.

```javascript
import {eventize, retain, emit, on} from '@spearwolf/eventize';

const ε = eventize();

retain(ε, 'status');

emit(ε, 'status', 'ready'); // nobody is listening yet

on(ε, 'status', (currentStatus) => {
  console.log(`Status is: ${currentStatus}`);
});
// the new listener fires immediately => "Status is: ready"

emit(ε, 'status', 'running'); // => "Status is: running"
```

Only the **last** emission is kept, events emitted _before_ the `retain()` call are not stored, and `retain()` on a plain object auto-eventizes it.

`retainClear(ε, name)` discards the stored value but keeps retaining future emissions. `unretain(ε, name)` drops the value **and** the policy. Both throw on a non-eventized object.

📖 **[Full retain reference →](./docs/retain.md)** — multiple events, symbol names, interaction with `once()`/`onceAsync()`, and the exact difference between `retainClear` and `unretain`.

---

### Utilities

#### `isEventized(obj)`

A type guard returning `true` if an object has been processed by `eventize()`. Also available as `eventize.is(obj)`. On a typed emitter it preserves the event map it narrows, so a wrong event name stays a compile error *inside* the `if` — up to v5.1.0 the narrowing widened the map back to the permissive default and silently reopened every loose overload.

```javascript
import {eventize, isEventized} from '@spearwolf/eventize';

console.log(isEventized(eventize())); // => true
console.log(isEventized({}));         // => false
console.log(eventize.is({}));         // => false
```

#### `asEventized(obj)`

The low-level primitive behind `eventize(obj)`: attaches the hidden emitter slot and returns the object, without injecting any API methods. Idempotent — an already-eventized object is returned untouched, unless *another copy* of the library eventized it, in which case it throws the protocol-mismatch `TypeError` rather than handing back an emitter it cannot drive. Like `eventize()`, it refuses a non-extensible target. Reach for `eventize()` unless you specifically need the primitive.

#### `getEventizeProtocol(obj)`

Which copy of eventize eventized this object. The marker is keyed by `Symbol.for('eventize')` — realm-wide, so two majors installed side by side share one slot and each reads the other's payload as its own. Since v6.0.0 the payload carries a protocol number, and this is how you read it.

```javascript
import {eventize, getEventizeProtocol, isEventized} from '@spearwolf/eventize';

console.log(getEventizeProtocol(eventize())); // => 6
console.log(getEventizeProtocol({}));         // => undefined
console.log(getEventizeProtocol(null));       // => undefined
```

It never throws — it is the tool for diagnosing the situation *before* something else does. Two kinds of `undefined` come back, and `isEventized()` separates them: `false` means the object was never eventized, `true` means a copy from before the field existed (up to v5.1.0) got there first.

Any other number means two incompatible copies are live on the same object, and every `on()` / `emit()` / `off()` against it throws a `TypeError` naming both protocols and the remedy — dedupe `@spearwolf/eventize` in your dependency tree. See the [migration guide](./docs/migration.md).

#### `getSubscriptionCount(emitter)`

Returns the number of active subscriptions (named + wildcard listeners). Useful for debugging, testing, or verifying that cleanup actually happened.

```javascript
const ε = eventize();

on(ε, 'foo', () => {});
on(ε, 'bar', () => {});
on(ε, '*', () => {}); // wildcard listeners are counted too

console.log(getSubscriptionCount(ε)); // => 3

off(ε);

console.log(getSubscriptionCount(ε)); // => 0
```

Edge cases worth knowing:

- A **non-eventized** object returns `0` rather than throwing — safe to call on any input.

  ```javascript
  getSubscriptionCount({}); // => 0
  getSubscriptionCount(new Date()); // => 0
  ```

- A **wildcard listener-object** counts as a _single_ subscription, no matter how many event-named methods it exposes — dispatch resolves `listener[eventName]` at `emit()` time.

  ```javascript
  on(ε, {foo() {}, bar() {}, baz() {}});
  getSubscriptionCount(ε); // => 1, not 3
  ```

- Subscriptions sharing an entry through reference counting count as **one**, not as the number of `on()` calls.
- A `once()` listener counts as a normal subscription until it fires.

### Inspecting emitter state

- `getSubscriptionCount(ε)` — how many listeners are registered.
- `getRetainedCount(ε)` — how many events hold a retained value.
- `getRetainedEventNames(ε)` — every name carrying a retain policy, fired or not.
- `getEventizeProtocol(ε)` — which copy of eventize owns the marker.

The first three return `0` / `[]` for objects that were never eventized. Their
TypeScript signature takes `object`, which is the typed contract — but the
runtime check underneath is a plain truthy/property probe with no `typeof`
guard, so none of them throw even when a `null`, `undefined`, or primitive
value reaches them past the type system (an untyped call site, a teardown
helper). They exist for debugging, testing, and verifying that cleanup
actually happened.

The one input they do not survive is an object marked by an incompatible copy
of the library: the three counters read the emitter's internals and therefore
raise the same protocol-mismatch `TypeError` every other entry point does. That
is deliberate — a plausible-looking `0` from a store nobody can reach is worse
than a diagnosis. `getEventizeProtocol()` is the one that answers without
throwing.

#### `EVENT_CATCH_EM_ALL`

The wildcard event name (`'*'`) as a named export, so you don't have to write the magic string.

---

## TypeScript: Typed Event Maps

Eventize ships an _opt-in_ generic event map for `eventize<TEvents>()`, `eventize.inject<TEvents>()`, and `class extends Eventize<TEvents>`. The map describes each event's argument tuple, and all three surfaces pick the types up automatically — the standalone functions since v4.1, the injected methods and the class since v6.0.0.

```ts
import {eventize, emit, on} from '@spearwolf/eventize';

interface ChatEvents {
  message: [from: string, text: string];
  joined: [user: string];
  closed: [];
}

const ε = eventize<ChatEvents>();

on(ε, 'message', (from, text) => {
  // from: string, text: string — inferred from the map
});

emit(ε, 'message', 'alice', 'hello'); // ✅
// emit(ε, 'unknown', 1);             // ❌ unknown event name
// emit(ε, 'message', 'alice');       // ❌ missing 'text'
```

Define the map as a **plain interface**. `extends EventMap` buys nothing — `EventMap` is `object`, so nothing is inherited and the narrowing survives — but it costs an import for no effect. What actually reopens the map is an index signature written into it (`[key: string]: any[]`), which is the deliberate escape hatch for dynamic names.

Without a generic, every API behaves exactly like v4.0.x: arbitrary event names, arbitrary arguments, listener-objects with whatever method names you like.

#### Exported types

Everything below is exported from the package root, and each exists to be written by a consumer rather than merely inferred:

| Type | What it is for |
| --- | --- |
| `EventMap`, `DefaultEventMap` | the constraint on an event map, and the permissive default |
| `UnsubscribeFunc` | what `on()` and `once()` hand back — `() => void`, nothing else |
| `OnceAsyncOptions` | the `{signal?: AbortSignal}` bag `onceAsync()` takes |
| `EventNameWithPriority` | the `[eventName, priority]` tuple the array form of `on()` accepts |
| `SubscribeImpl` | the implementation signature to cast to when writing a forwarding wrapper around `on()` / `once()` |
| `SubscribeArgs` | the union of every accepted argument shape, plus eleven named arms so a wrapper can name the one it handles |

The last two are the ones worth knowing about: TypeScript refuses to spread a union of tuples into a fixed-arity call, so `on(target, ...args)` never compiles against the public overloads. `const rawOn = on as SubscribeImpl` is the sanctioned escape — see [`docs/typed-events.md` → Wrapping `on()` / `once()`](./docs/typed-events.md#wrapping-on--once).

📖 **[Full typed-events reference →](./docs/typed-events.md)** — typed listener-objects, the inject and class forms, symbol events as an escape hatch, and the caveats around `off()` and multi-event calls.
