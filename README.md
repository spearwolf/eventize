# @spearwolf/eventize

## Introduction 👀

A tiny and clever framework for synchronous event-driven programming in javascript.

yes, read correctly: the emitters call the listeners here _synchronously_ and not _asynchronously_, as is the case with [node.js events](https://nodejs.org/api/events.html), for example

This is perfectly reasonable: sometimes you want to have control over when something happens. e.g., when your code runs inside an [animation frame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame). Or you want to release resources immediately and instantaneously.

### FEATURES

- all **API** calls and downstream-listener-calls are **100% synchronous** :boom: no async! :stuck_out_tongue_closed_eyes:
- :sparkles: **wildcards** &amp; **priorities** :exclamation:
- :rocket: **smart api** (based upon [node.js events](https://nodejs.org/api/events.html) but in a pretty extended way)
- has **typescript types** included (well, in fact, it is written in typescript) :tada:
- supports all major browsers and Node.js environments
- very small footsprint ~2.3k gzip'd
- no runtime dependencies
- Apache-2.0 license

## ⚙️ Installation

All you need is to install the package:

```sh
$ npm i @spearwolf/eventize
```


## 📖 Getting Started

The underlying concept is simple: certain kinds of objects (called "emitters") emit named events that cause function "listeners" to be called.

![Emitter emits named event to listeners](./docs-assets/emitter-emits-named-events-listeners.svg)

##### Emitter

Every object can become an _emitter_; for this, the object must inject the [eventize API](#eventize-api).

```js
import {eventize} from '@spearwolf/eventize'

const ε = eventize({})
```

or, if you are more familiar with class-based objects

```js
import {Eventize} from '@spearwolf/eventize'

class Foo extends Eventize {}

const ε = new Foo()
```

for __typescript__ the following _composition over inheritance_ variant has also proven itself:

```ts
import {eventize, type Eventize} from '@spearwolf/eventize'

export interface Foo extends Eventize {}

export class Foo {

  constructor() {
    eventize(this);
  }

  // ...
}
```

> 🔎 _emitter_ is a synonym for an _eventized object_ which in itself is a synonym for an object instance that has the _eventize api_ methods attached to it.
> In this documentation we also use __ε__ as variable name to show that this is an _eventized object_

##### Listener

Any function can be used as a listener. However, you can also use an object that defines methods that have the exact name of the given event.

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

There are several ways to convert any object into an emitter / eventized object.

Probably the most common method is to simply use `eventize( obj )`; this corresponds to the _inject_ variant:

#### inject

```ts
eventize.inject( myObj )  // => myObj
```

Returns the same object, with the eventize api attached, by modifying the original object.

![eventize.inject](./docs-assets/eventize-inject.svg)

To create an emitter without modifying the original object, you can use the  _extend_ variant:


#### extend

```js
eventize.extend( myObj )  // => myEventizedObj
```

Returns a new object, with the [Eventize API](#the-emitter-eventize-api) attached. The original object is not modified here, instead the _prototype_ of the new object is set to the original object.

> 🔎 For this purpose [`Object.create()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create) is used internally

![eventize.extend](./docs-assets/eventize-extend.svg)


#### Class-based inheritance

The class-based approach is essentially the same as the _extend_ method, but differs in its usage:

```js
import {Eventize} from '@spearwolf/eventize'

class Foo extends Eventize {
  // constructor() {
  //   super()
  // }
}
```

#### Class-based, without inheritance

If you want to create an emitter class-based, but not via inheritance, you can also do this with the eventize method in the constructor, here as a typescript example:

```ts
import {eventize, Eventize} from '@spearwolf/eventize'

interface Foo extends Eventize {}

class Foo {
  constructor() {
    eventize(this)
  }
}
```


### eventize API

Each _emitter_ / _eventized_ object provides an API for subscribing, unsubscribing and emitting events.
This API is called the __eventize API__ (because "Emitter Eventize API" is a bit too long and cumbersome).

| method | description |
|--------|-------------|
| `.on( .. )` | subscribe to events |
| `.once( .. )` | subscribe to only the next event |
| `.off( .. )` | unsubscribe listeners |
| `.retain( .. )` | hold the last event until a subscriber gets it |
| `.emit( .. )` | emit an event |

These methods are explained in detail below:

### How to listen

#### `ε.on( .. )`

The simplest and most direct way is to subscribe to an event using a function:

```js
import {eventize} from '@spearwolf/eventize'

const ε = eventize({})

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

If not only a specific named event should be reacted to, but _all_ events, the _catch-em-all_ wildcard event `*` can be used:

```js
ε.on('*', (...args) => console.log('an event occured, args=', ...args))
```

If you want, you can simply omit the wildcard event:

```js
ε.on((...args) => console.log('an event occured, args=', ...args))
```

##### Multiple event names

Instead of a wildcard, you can also specify multiple event names:

```js
ε.on(['foo', 'bar'], (...args) => console.log('foo or bar occured, args=', ...args))
```

##### Priorities

Sometimes you also want to control the _order_ in which the listeners are called.
By default, the listeners are called in the order in which they were subscribed &mdash; in their _priority group_; a priority group is defined by a number, where the default priority group is `0` and large numbers take precedence over small ones.

```js
ε.on('foo', () => console.log("I don't care when I am called"))
ε.on('foo', -999, () => console.log("I would like to be the last in line"))
ε.on(Number.MAX_VALUE, () => console.log("I will be the first"))

ε.emit('foo')
// => "I will be the first"
// => "I don't care when I am called"
// => "I would like to be the last in line"
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

As a last option it is also possible to pass the listener method as _name_ or _function_ to be called in addition to the listener object.

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


#### `.once( .. )`

`.once()` does exactly the same as `.on()`. the difference is: after the listener is called, it is automatically unsubscribed, so the listener method is only called exactly _once_. No more and no less &ndash; there is really nothing more to say about _once_.

```js
ε.once('hi', () => console.log('hello'))

ε.emit('hi')
// => "hello"

ε.emit('hi')
// => (nothing happens here)
```


#### `.off( .. )`

##### The art of unsubscribing

At the beginning we learned that each call to `on()` returns an _unsubscribe function_. You can think of it as `on()` creating a _link_ to the _event listener_.
If this _unsubscribe function_ is called, the _link_ is taken back again.

So far so good. Now let's assume we write code that should react to a dynamically generated event name with a certain method, e.g.:

```js
const queue = eventize({})

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

Now, to put our greeter to silence, we would have to call the _unsubscribe function_ returned by `on()` for each call to `listenTo()`. Quite awkward. Here `off()` helps us. Using `off()` we can specifically disable one or more previously established _links_. In this case that would be:

```js
queue.off(greeter)
```

... this will cancel all subscriptions from `queue` to `greeter`!

> TODO: add documentation for all supported ways to unsubscribe, see [/src/off.spec.ts](./src/off.spec.ts)

###### getSubscriptionCount()

A small helper function that returns the number of subscriptions to the object. very useful for e.g. tests

```js
import {getSubscriptionCount} from '@spearwolf/eventize';

getSubscriptionCount(queue) // => number
```

### How to emit events

#### `.emit( .. )`

Emitting an event is pretty easy and straight forward:

```js
ε.emit('foo', 'bar', 666)
```

That's it. No return value. All subscribed event listeners are called immediately.

The first argument is the event name. Can be a _string_ or a _symbol_.
All other parameters are optional and will be passed to the listener.

If you want to emit several events at once - with the same parameters, you can simply specify an array with the desired event names as the first parameter:

```js
ε.emit(['foo', 'bar'], 'plah', 666)
```


#### `.retain( .. )`

##### Emit the last event to new subscribers

```js
ε.retain('foo')
```

With `retain` the last emitted event is remembered. Every new listener gets the last event, even if it was emitted before subscribing.

> NOTE: This behavior is similar to the `new ReplaySubject(1)` of _rxjs_. But somehow the method name `retain` seemed more appropriate here.
