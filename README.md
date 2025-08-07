# @spearwolf/eventize

A tiny, clever, and dependency-free library for synchronous event-driven programming in JavaScript and TypeScript.

![npm (scoped)](https://img.shields.io/npm/v/%40spearwolf/eventize)
![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/spearwolf/eventize/main.yml)
![GitHub](https://img.shields.io/github/license/spearwolf/eventize)

## Introduction 👀

`@spearwolf/eventize` provides a powerful and intuitive API for building event-based systems. This library invokes event listeners *synchronously*. This design choice gives you precise control over your execution flow, which is critical in scenarios like game loops (`requestAnimationFrame`), real-time applications, or any situation where immediate, predictable execution is necessary.

Written entirely in TypeScript and targeting modern `ES2022`, it offers a robust, type-safe developer experience without sacrificing performance or adding bloat.

### Features

-   🚀 **Developer-Focused API**: Clean, modern, and functional.
-   ✨ **Wildcards & Priorities**: Subscribe to all events and control listener execution order.
-   🔷 **Full TypeScript Support**: Leverage strong typing for more reliable code.
-   📦 **Zero Runtime Dependencies**: Lightweight with a minimal footprint (~3k gzipped).
-   ESM & CommonJS Support.
-   Apache 2.0 Licensed.


## ⚙️ Installation

Install the package using your favorite package manager:

```sh
$ npm i @spearwolf/eventize
```

The library is distributed in both ES Module (`import`) and CommonJS (`require`) formats.

> [!NOTE]
>  Since version 3.0.0 there is also a [CHANGELOG](./CHANGELOG.md)


## 📖 Getting Started

The core idea is simple: an object, called an **emitter**, can be "eventized" to emit named events. Other parts of your application, called **listeners**, can subscribe to these events and will be executed immediately when the event is emitted.

![Emitter emits named event to listeners](./docs-assets/emitter-emits-named-events-listeners.svg)

##### Emitter

> [!NOTE]
> _Emitter_ is a synonym for an _eventized object_, which in turn is a synonym for an object instance that has the _eventize superpowers_ attached to it!
> In this documentation we also use __ε__ as a variable name to indicate that it is an _eventized object_.


Any object can become an _emitter_; to do so, the object must be _upgraded_:

```js
import {eventize} from '@spearwolf/eventize'

// !!! THIS IS THE RECOMMENDED AND MOST DIRECT APPROACH TO CREATE AN EVENTIZED OBJECT !!!

const eventizedObj = eventize(obj)
```

> [!NOTE]
> If you don't want to specify an object, just leave it out and `{}` will be created for you: `const ε = eventize()` 

or, if you are more familiar with class-based objects, you can use

```js
import {Eventize} from '@spearwolf/eventize'

class Foo extends Eventize {}

const ε = new Foo()

// ε is now an object with eventize superpowers 🚀
```

For __typescript__, the following _composition over inheritance_ variant has also worked well:

```ts
import {eventize, type Eventize} from '@spearwolf/eventize'

export interface Foo extends Eventize {}

export class Foo {
  constructor() {
    eventize.inject(this);
  }
}
```

Since version 4.0.0 there is the _functional_ eventize API, so it is now possible to use `eventize()` in the constructor without any additions:

```ts
import {eventize} from '@spearwolf/eventize'

export class Foo {
  constructor() {
    eventize(this);
  }
}
```

##### Listener or Subscriptions

Any function can be used as a listener. However, you can also use an object that defines methods with the exact name of the given event.

```js
// ε is an eventized object

ε.on('foo', (bar) => {
  console.log('I am a listener function and you called me with bar=', bar)
})

ε.on('foo', {
  foo(bar, plah) {
    console.log('I am a method and you called me with bar=', bar, 'and plah=', plah)
  }
})

ε.on({
  foo(bar, plah) {
    console.log('foo ->', {bar, plah})
  },
  bar() {
    console.log('hej')
  }
})
```

##### Named Events

An emitter can emit any event name; parameters are optional

```js
ε.emit('bar')
// => "hej"

ε.emit('foo', 123, 456)
// => "I am a listener function and you called me with bar= 123"
// => "I am a method and you called me with bar= 123 and plah= 456"
// => "foo -> {bar: 123, plah: 456}"
```

If an emitter emits an event to which no listeners are attached, nothing happens.

> 🔎 an event name can be either a _string_ or a _symbol_


## 📚 API

### How to _emitter_

#### EventizedObject vs. EventizeApi

To give an object the eventize superpowers, it needs to be initialized once. for this purpose, there is the `eventize` function. The result is an `EventizedObject`.
To use the eventize API, the functions are available as named exports. The API currently includes the following functions:

| function | description |
|--------|-------------|
| on | subscribe to events |
| once | subscribe to the next event only |
| onceAsync | the async version of subscribe only to the next event |
| emit | dispatch an event |
| emitAsync | dispatch an event and wait for any promises returned by subscribers |
| off | unsubscribe |
| retain | hold the last event until it is received by a subscriber |
| retainClear | clear the last event |

###### Example

```typescript
import {eventize, on, emit} from '@spearwolf/eventize';

const obj = eventize();

on(obj, 'foo', () => console.log('foo called'));

emit(obj, 'foo');  // => call foo subscriber
```

###### EventizeApi

If the `Eventize` base class or `eventize.inject()` is used instead of `eventize()`, an eventized object is also returned, but here additionally with the EventizeApi attached as as methods:

```typescript
import {Eventize, on, emit} from '@spearwolf/eventize';

class Foo extends Eventize {}
const obj = new Foo();

obj.on('foo', () => console.log('foo called'));

obj.emit('foo');  // => call foo subscriber

emit(obj, 'foo');  // => call foo subscriber
```

###### EventizedObject vs EventizeApi Overview Matrix

There are several ways to convert any object into an emitter / eventized object.

| Method | is EventizedObject | has EventizeApi injected |
|--------|--------------------|--------------------------|
| `eventize(obj)` | ✅ | ❌ |
| `eventize.inject(obj)` | ✅ | ✅ |
| `class extends Eventize {}` | ✅ | ✅ |

#### eventize

The easiest way to create an eventized object is to use the `eventize` function. The result is an object with eventize superpowers, which can be accessed using the eventize API functions:

```ts
eventize( myObj )  // => myObj
```

#### eventize.inject

Alternatively, it is possible to create an eventized object which has the complete eventize api injected as methods at the same time

```ts
eventize.inject( myObj )  // => myObj
```

Returns the same object, with the eventize api attached, by modifying the original object.

![eventize.inject](./docs-assets/eventize-inject.svg)


#### Class-based inheritance

The class-based approach is essentially the same as the _extend_ method, but differs in how it is used:

```js
import {Eventize} from '@spearwolf/eventize'

class Foo extends Eventize {
  // constructor() {
  //   super()
  // }
}
```

#### Class-based, without inheritance

If you want to create an emitter class-based, but not via inheritance, you can also use the eventize method in the constructor, here as a typescript example:

```ts
import {eventize, Eventize} from '@spearwolf/eventize'

interface Foo extends Eventize {}

class Foo {
  constructor() {
    eventize.inject(this)
  }
}
```

---

### Eventize API

Each _emitter_ / _eventized_ object provides an API for subscribing, unsubscribing and emitting events.
This API is called the __eventize API__ (because "emitter eventize API" is a bit too long and cumbersome).

| method | description |
|--------|-------------|
| `on( .. )` | subscribe to events |
| `once( .. )` | subscribe only to the next event |
| `onceAsync( .. )` | the async version of subscribe only to the next event |
| `off( .. )` | unsubscribe |
| `retain( .. )` | hold the last event until it is received by a subscriber |
| `retainClear( .. )` | clear the last event |
| `emit( .. )` | dispatch an event |
| `emitAsync( .. )` | dispatch an event and waits for all promises returned by the subscribers |

All methods can be used in the _functional_ variant:

```js
on(obj, ...)
emit(obj, ...)
// ..
```

the objects that have been injected with the eventize api also offer the api as methods:

```js
obj.on(...)
obj.emit(...)
// ..
```

These API methods are described in detail below:

### How to listen

---

#### on

> `on(ε, .. )`
> `ε.on( .. )`

The simplest and most direct way is to use a function to subscribe to an event:

```js
import {eventize} from '@spearwolf/eventize'

const ε = eventize()

// short version
ε.on('foo', (a, b) => {
  console.log('foo ->', {a, b});
});

// extended version
const unsubscribe = ε.on('foo', (a, b) => {
  console.log('foo ->', {a, b});
});
```

The listener function is called when the named event is emitted.
The parameters of the listener function are optional and will be filled with the event parameters later (if there are any).

The return value of `on()` is always the _inverse of the call_ &mdash; the unsubscription of the listener.

##### Wildcards

If you want to respond to _all_ events, not just a specific named event, you can use the _catch-em-all_ wildcard event `*`:

```js
ε.on('*', (...args) => console.log('an event occured, args=', ...args))
```

If you wish, you can simply omit the wildcard event:

```js
ε.on((...args) => console.log('an event occured, args=', ...args))
```

##### Multiple event names

Instead of using a wildcard, you can specify multiple event names:

```js
ε.on(['foo', 'bar'], (...args) => console.log('foo or bar occured, args=', ...args))
```

##### Priorities

Sometimes you also want to control the _order_ in which the listeners are called.
By default, the listeners are called in the order in which they are subscribed &mdash; in their _priority group_; a priority group is defined by a number, where the default priority group is `0` and large numbers take precedence over small ones.

```js
ε.on('foo', () => console.log("I don't care when I'm called"))
ε.on('foo', -999, () => console.log("I want to be the last in line"))
ε.on(Number.MAX_VALUE, () => console.log("I will be the first"))

ε.emit('foo')
// => "I will be the first"
// => "I don't care when I'm called"
// => "I want to be the last in line"
```


##### Listener objects

You can also use a listener object instead of a function:

```js
ε.on('foo', {
  foo(...args) {
    console.log('foo called with args=', ...args)
  }
})
```

This is quite useful in conjunction with wildcards:

```js
const Init = Symbol('init')  // yes, symbols are used here as event names
const Render = Symbol('render')
const Dispose = Symbol('dispose')

ε.on({
  [Init]() {
    // initialize
  }
  [Render]() {
    // show something
  }
  [Dispose]() {
    // dispose resources
  }
})
```

.. or multiple event names:

```js
ε.on(['init', 'dispose'], {
  init() {
    // initialize
  }
  goWild() {
    // will probably not be called
  }
  dispose()) {
    // dispose resources
  }
})
```

Of course, this also works with priorities:

```js
ε.on(1000, {
  foo() {
    console.log('foo!')
  }
  bar() {
    console.log('bar!')
  }
})
```

As a last option, it is also possible to pass the listener method as a _name_ or _function_ to be called in addition to the listener object.

###### Named listener object method

```js
ε.on('hello', 'say', {
  say(hello) {
    console.log('hello', hello)
  }
})

ε.emit('hello', 'world')
// => "hello world"
```

###### Listener function with explicit context

```js
ε.on(
  'hello',
  function() {
    console.log('hello', this.receiver)
  }, {
    receiver: 'world'
  });

ε.emit('hello')
// => "hello world"
```

##### Complete on() method signature overview

Finally, here is an overview of all possible call signatures of the `.on( .. )` method:

```
.on( eventName*, [ priority, ] listenerFunc [, listenerObject] )
.on( eventName*, [ priority, ] listenerFuncName, listenerObject )
.on( eventName*, [ priority, ] listenerObject )
```

Additional shortcuts for the wildcard `*` syntax:

```
.on( [ priority, ] listenerFunc [, listenerObject] )
.on( [ priority, ] listenerObject )
```

###### Legend

| argument | type |
|----------|------|
| `eventName*` | _eventName_ or _eventName[]_ |
| `eventName` | _string_ or _symbol_ |
| `listenerFunc` | _function_ |
| `listenerFuncName` | _string_ or _symbol_ |
| `listenerObject` | _object_ |

---

#### once

> `once(ε, .. )`
> `ε.once( .. )`

`once()` does exactly the same as `on()`, with the difference that the listener is automatically unsubscribed after being called, so the listener method is called exactly _once_. No more and no less &ndash; there is really nothing more to say about _once_.

> [!NOTE]
> if called with multiple event names, the first called event wins

```js
ε.once('hi', () => console.log('hello'))

ε.emit('hi')
// => "hello"

ε.emit('hi')
// => (nothing happens here)
```

---

#### onceAsync

> `onceAsync(ε, eventName | eventName[] )`
> `ε.onceAsync( eventName | eventName[] )`

_since v3.3.*_

This creates a promise that will be fulfilled if one of the given events is emitted.

```js
// at this point please do nothing, just wait
await ε.onceAsync('loaded')

// a little later, somewhere else in the program
ε.emit('loaded')
```

---

#### off

> `off(ε, .. )`
> `ε.off( .. )`

##### The art of unsubscribing

At the beginning we learned that each call to `on()` returns an _unsubscribe function_. You can think of this as `on()` creating a _link_ to the _event listener_.
When this _unsubscribe function_ is called, the _link_ is removed.

So far, so good. Now let's say we write code that should respond to a dynamically generated event name with a particular method, e.g:

```js
const queue = eventize()

class Greeter {
  listenTo(name) {
    queue.on(name, 'sayHello', this)
  }

  sayHello() {
    // do what must be done
  }
}

const greeter = new Greeter()
greeter.listenTo('suzuka')
greeter.listenTo('yui')
greeter.listenTo('moa')
```

To silence our greeter, we would have to call the _unsubscribe function_ returned by `on()` for every call to `listenTo()`. Quite inconvenient. This is where `off()` comes in. With `off()` we can specifically disable one or more previously established _links_. In this case this would be

```js
queue.off(greeter)
```

... this will cancel _all_ subscriptions from `queue` to `greeter`!

##### All kinds of `.off()` parameters in the summary

`.off()` supports a number of variants, saving you from caching unsubscribe functions:

| `.off()` parameter | description |
|-|-|
| `ε.off(function)` | unsubscribe by function |
| `ε.off(function, object)` | unsubscribe by function and object context |
| `ε.off(eventName)` | unsubscribe by event name |
| `ε.off(object)` | unsubscribe by object |
| `ε.off()` | unsubscribe all listeners attached to ε |

> 🔎 For those with unanswered questions, we recommend a look at the detailed test cases [./src/off.spec.ts](./src/off.spec.ts)

###### getSubscriptionCount()

A small helper function that returns the number of subscriptions to the object. Very useful for tests, for example.

```js
import {getSubscriptionCount} from '@spearwolf/eventize';

getSubscriptionCount(ε) // => number of active subscriptions
```

### How to emit events

---

#### emit

> `emit(ε, .. )`
> `ε.emit( .. )`

Creating an event is fairly simple and straightforward:

```js
ε.emit('foo', 'bar', 666)
```

That's it. No return value. All subscribed event listeners are immediately invoked.

The first argument is the name of the event. This can be a _string_ or a _symbol_.
All other parameters are optional and will be passed to the listener.

If you want to send multiple events at once - with the same parameters - you can simply pass an array of event names as the first parameter:

```js
ε.emit(['foo', 'bar'], 'plah', 666)
```


---

#### emitAsync

> `emitAsync(ε, .. )`
> `ε.emitAsync( .. )`

_since v3.1.*_

```js
const results = await ε.emitAsync('load');
```

Emits an event and waits for all promises returned by the subscribers.

Unlike the normal `emit()`, here it is taken into account whether the subscribers return _something_.
If so, then all results are treated as promises and only when all have been resolved are the results
returned as an array.

Anything that is not `null` or `undefined` is considered a return value.

If there are no return values, then simply `undefined` is returned.

All arguments that are allowed in `emit()` are supported.


---

#### retain

> `retain(ε, eventName | eventName[] )`
> `ε.retain( eventName | eventName[] )`

##### Emit the last event to new subscribers

```js
ε.retain('foo')
```

With `retain` the last transmitted event is stored. Any new listener will get the last event, even if it was sent before they subscribed.

> NOTE: This behaviour is similar to the `new ReplaySubject(1)` of _rxjs_. But somehow the method name `retain` seemed more appropriate here.

---

#### retainClear

> `retainClear(ε, eventName | eventName[] )`
> `ε.retainClear( eventName | eventName[] )`

##### Clear the last event

_since v3.3.*_

```js
ε.retainClear('foo')
```

With `retainClear()` the _retain mode_ for the event is kept, but if there is already an event that is stored, it will now be cleared.
