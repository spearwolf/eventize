> !!! THIS IS THE DEVELOPMENT BRANCH - ALL STUFF HERE IS BY DEFAULT UNSTABLE - SO PLEASE USE IT WITH CARE !!!

# eventize.js

[![npm version](https://img.shields.io/npm/v/eventize-js?style=for-the-badge)](https://www.npmjs.com/package/eventize-js)
[![Build Status](https://img.shields.io/travis/spearwolf/eventize.svg?style=for-the-badge)](https://travis-ci.org/spearwolf/eventize)

A tiny and clever framework for synchronous event-driven programming in javascript.

yes, read correctly: the emitters call the listeners here _synchronously_ and not _asynchronously_, as is the case with [node.js events](https://nodejs.org/api/events.html), for example

This is perfectly reasonable: sometimes you want to have control over when something happens. e.g., when your code runs inside an [animation frame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame). Or you want to release resources immediately and instantaneously.


##### FEATURES

- all **API** calls and downstream-listener-calls are **100% synchronous** :boom: no async! :stuck_out_tongue_closed_eyes:
- :sparkles: **wildcards** &amp; **priorities** :exclamation:
- :rocket: **smart api** (based upon [node.js events](https://nodejs.org/api/events.html) but in a pretty extended way)
- has **typescript types** included (well, in fact, it is written in typescript) :tada:
- supports all major browsers and Node.js environments
- very small footsprint ~2.3k gzip'd
- no runtime dependencies
- Apache-2.0 license

## Installation

All you need is to install the package:

```sh
$ npm install eventize.js@2.0.0-alpha
```


## Getting Started

The underlying concept is simple: certain kinds of objects (called "emitters") emit named events that cause function "listeners" to be called.

![Emitter emits named event to listeners](./docs-assets/emitter-emits-named-events-listeners.svg)

##### Emitter

Every object can become an emitter; for this, the object must inject the [Eventize API](#the-emitter-eventize-api).

```js
import eventize, {Eventize} from 'eventize-js';

const myObj = eventize({});
```

or, if you are more familiar with class-based objects

```js
import {Eventize} from 'eventize-js';

class Foo extends Eventize {
  // constructor() {
  //   super();
  // }
}

const myOtherObj = new Foo();
```

##### Listener

Any function can be used as a listener. However, you can also use an object that defines methods that have the exact name of the given event.

```js
myObj.on('foo', (bar) => {
  console.log('I am a listener function and you called me with bar=', bar);
})

myObj.on('foo', {
  foo(bar, plah) {
    console.log('I am a method and you called me with bar=', bar, 'and plah=', plah);
  }
})
```

##### Named Events

An emitter can emit any event name; parameters are optional

```js
myObj.emit('bar');  // well, nothing happens here

myObj.emit('foo', 123, 456);
// => "I am a listener function and you called me with bar= 123"
// => "I am a method and you called me with bar= 123 and plah= 456"
```

If an emitter emits an event to which no listeners are attached, nothing happens.

_Btw._ an event name can be either a _string_ or a _symbol_


## API

### How to Emitter

There are several ways to convert any object into an emitter.

Probably the most common method is to simply use `eventize( myObj )`; this corresponds to the _inject_ variant:

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

For this purpose [`Object.create()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create) is used internally.

![eventize.extend](./docs-assets/eventize-extend.svg)


#### Class-based inheritance

The class-based approach is essentially the same as the _extend_ method, but differs in its usage:

```js
import {Eventize} from 'eventize-js';

class Foo extends Eventize {
  // constructor() {
  //   super();
  // }
}
```

#### Class-based, without inheritance

If you want to create an emitter class-based, but not via inheritance, you can also do this with the eventize method in the constructor, here as a typescript example:

```ts
import eventize, {Eventize} from 'eventize-js';

interface Foo extends Eventize {}

class Foo {
  constructor() {
    eventize(this);
  }
}
```


### The ~~Emitter~~ Eventize API

Each emitter object provides an API for subscribing, unsubscribing and emitting events.
This API is called the __Eventize API__ (because "Emitter Eventize API" is a bit too long and cumbersome).

| method | description |
|--------|-------------|
| `.on( .. )` | subscribe to events |
| `.once( .. )` | subscribe to only the next event |
| `.off( .. )` | unsubscribe listeners |
| `.retain( .. )` | hold the last event until a subscriber gets it |
| `.emit( .. )` | emit an event |

These methods are explained in detail below:

### How to listen

#### `.on( .. )`

The simplest and most direct way is to subscribe to an event using a function:

```js
import eventize from 'eventize-js'

const myObj = eventize({});

const unsubscribe = myObj.on('myEventName', (arg1, arg2) => {
  console.log('myEventName, arg1=', arg1, 'arg2=', arg2);
})
```
The listener function is called when the named event is emitted.
The parameters of the listener function are optional and will be filled with the event parameters later (if there are any).

The return value of `on()` is always the _inverse of the call_ &mdash; the unsubscription of the listener.

##### Wildcards

If not only a specific named event should be reacted to, but _all_ events, the _catch-em-all_ wildcard event `*` can be used:

```js
myObj.on('*', (...args) => console.log('an event occured, args=', ...args))
```

If you want, you can simply omit the wildcard event:

```js
myObj.on((...args) => console.log('an event occured, args=', ...args))
```

##### Multiple event names

Instead of a wildcard, you can also specify multiple event names:

```js
myObj.on(['foo', 'bar'], (...args) => console.log('foo or bar occured, args=', ...args))
```

##### Priorities

Sometimes you also want to control the _order_ in which the listeners are called.
By default, the listeners are called in the order in which they were subscribed &mdash; in their _priority group_; a priority group is defined by a number, where the default priority group is `0` and large numbers take precedence over small ones.

```js
myObj.on('foo', () => console.log("I don't care when I am called"));
myObj.on('foo', -999, () => console.log("I would like to be the last in line"));
myObj.on(Number.MAX_VALUE, () => console.log("I will be the first"));

myObj.emit('foo');
// => "I will be the first"
// => "I don't care when I am called"
// => "I would like to be the last in line"
```


##### Listener objects

You can also use a listener object instead of a function:

```js
myObj.on('foo', {
  foo(...args) {
    console.log('foo called with args=', ...args);
  }
})
```

This is quite useful in conjunction with wildcards:

```js
const Init = Symbol('init');  // yes, symbols are used here as event names
const Render = Symbol('render');
const Dispose = Symbol('dispose');

myObj.on({
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
myObj.on(['init', 'dispose'], {
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
myObj.on(1000, {
  foo() {
    console.log('foo!');
  }
  bar() {
    console.log('bar!');
  }
})
```

As a last option it is also possible to pass the listener method as _name_ or _function_ to be called in addition to the listener object.

###### Named listener object method

```js
myObj.on('hello', 'say', {
  say(hello) {
    console.log('hello', hello);
  }
})

myObj.emit('hello', 'world');
// => "hello world"
```

###### Listener function with explicit context

```js
myObj.on(
  'hello',
  function() {
    console.log('hello', this.receiver);
  }, {
    receiver: 'world'
  });

myObj.emit('hello');
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

`.once()` does exactly the same as `.on()`. the difference is: after the listener is called, it is automatically unsubscribed, so the listener method is only called exactly _once_.

```js
myObj.once('hi', () => console.log('hello'));

myObj.emit('hi');
// => "hello"

myObj.emit('hi');
// => (nothing happens here)
```


#### `.off( .. )`

TODO


### How to emit events

#### `.emit( .. )`

TODO

#### `.retain( .. )`

TODO


---

OLD DOCUMENTATION:

---

## Getting Started

Attach the _eventizer_ **api** to any javascript object you want.

```javascript
import eventize from 'eventize-js';

const say = hello => world => console.log(hello, world);
const obj = eventize({});

obj.on('foo', say('hello'));

obj.once(['foo', 'bar'], Priority.AAA, {
  foo: say('hej'),
});

obj.on(['foo', 'bar'], Priority.Low, say('moin moin'))

obj.emit('foo', 'world');
// => "hej world"
// => "hello world"
// => "moin moin world"

obj.on('foo', () => obj.off('foo'));

obj.emit(['foo', 'bar'], 'eventize');
// => "hello eventize"
// => "moin moin eventize"

```


# API Reference

## The _eventize_ API

### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/eventize.svg" alt="eventize()" width="240">

```
eventize( obj )  // alias for eventize.inject()

eventize.inject( obj )  // => eventizer === obj
eventize.extend( obj )  // => eventizer (prototype is obj)
eventize.create( obj )  // => eventizer
```

.. or if you like a more class based approach ..

```typescript
import {Eventize} from 'eventize-js';

class Foo extends Eventize {
  // foo has now the eventize superpowers!
}
```


## The _eventizer_ API

### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/on.svg" alt="on()" width="96">

```
.on( eventName*, [ priority, ] listenerFunc [, listenerObject] )
.on( eventName*, [ priority, ] listenerFuncName, listenerObject )
.on( eventName*, [ priority, ] listenerObject )

.on( [ priority, ] listenerFunc [, listenerObject] )   => listenerObject.on( '*', listenerFunc )
.on( [ priority, ] listenerObject )                    => listenerObject.on( '*', listenerObject )

eventName*:       eventName | Array<eventName>
eventName:        string

listenerFunc:     function
listenerFuncName: string
listenerObject:   object
```


### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/once.svg" alt="once()" width="144">

```
eventizer.once( ... )
```


### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/emit.svg" alt="emit()" width="144">

```
eventizer.emit( eventName* [, args... ] )
```

### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/off.svg" alt="off()" width="120">

```
eventizer.off( listenerFunc [, listenerObject] )
eventizer.off( listenerFuncName, listenerObject )
eventizer.off( listenerObject )
eventizer.off( eventName )
eventizer.off()
```

### retain()

```
eventizer.retain( eventName* )
```


## Additional API Helpers

```
eventize.is( obj )
```

Check if `obj` is an _eventizer_ (object has the _eventizer_ **api** implemented). Returns `true` or `false`

```
eventize.Priority.Max
eventize.Priority.AAA
eventize.Priority.BB
eventize.Priority.C
eventize.Priority.Default = 0
eventize.Priority.Low
eventize.Priority.Min
```

Some predefined priorities. Use it or not. They are defined just for convenience.
