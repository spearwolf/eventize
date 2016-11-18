# eventize.js

[![Build Status](https://img.shields.io/travis/spearwolf/eventize.svg?style=flat-square)](https://travis-ci.org/spearwolf/eventize)

yet another *fantastic* pub/sub events micro framework for javascript!

##### Features

- clean, minimal & powerful api
- all api-calls and downstream-listeners-calls are 100% synchronous, no async
- battle-proven & fully tested (jasmine specs & karma included)
- apache-2.0 license


## Installation

Install the latest version with: `npm install --save spearwolf/eventize`

## Getting Started

Attach the _eventized object_ **api** to any custom object you want.

```javascript
import eventize from '@spearwolf/eventize';

const obj = eventize({});

obj.on('foo', hello => console.log('hello', hello));

obj.emit('foo', 'world');       // => "hello world"

obj.connect({
    foo (bar) {
        console.log('hejho', bar);
    }
});

obj.emit('foo', 'eventize');       // => "hello eventize", "hejho eventize"
```


# API

## The _eventize_ API

### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/eventize.svg" alt="eventize()" width="240">

```
eventize( obj )
```

Attach the _eventized object_ **api** to an object. Returns the `obj`.



## The _eventized object_ API

### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/on.svg" alt="on()" width="96">

```
obj.on( eventName, [ priority, ] callbackFunc )
obj.on( eventName, [ priority, ] object )

obj.on( callbackFunc )    // => alias for: object.on( '*', callbackFunc )
obj.on( object )          // => alias for: object.on( '*', object )
```

Registers a listener to be executed whenever `eventName` gets fired.

- Define the listener by a _callback function_ (`callbackFunc`) or by an _object reference_ (`object`).
- The `priority` is optional and should be a _number_. The _default_ `priority` is defined by `eventize.PRIO_DEFAULT` (which is `0` by default).
- The `eventName` is mandatory and should be a _string_.
- Returns a listener _de-registration id_ (which is a *number*). Use this *id* to unregister your listener via `off()`.

Use `*` as `eventName` to create a _catch'm all_ listener. Catch'm all listeners will be called ..
- regardless off the event name
- but _after_ all other listeners within _same priority_

##### Define listener by object

- When the event is fired, a method with the same name as the event will be called (but only if such a method exists)
- When such a method does *not* exists, but the listener is an _eventized object_, the `emit()` method of the listener object will be called instead


```
obj.on( eventName )
obj.on()
```

Re-activates all listeners or by event name. You can de-activate listeners with `off()`.

### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/once.svg" alt="once()" width="144">

```
obj.once( eventName, [ priority, ] callbackFunc )
obj.once( eventName, [ priority, ] object )

obj.once( callbackFunc )      // => object.once( '*', callbackFunc )
obj.once( object )            // => object.once( '*', object )
```

Registers a listener to be executed when `eventName` gets fired. **Once the listener is called, de-register the listener.**
Apart from that `once()` works like `on()`.

### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/connect.svg" alt="connect()" width="216">

```
obj.connect( object )
```

Binds an object or multiple functions to multiple events.

Has almost the same effect as writing `obj.on(object)` but this **should be the preferred way** (there are some differences affecting the _sender context_ argument passed over to _eventized object listener_ .. see `emit()` for more details).

```
obj.connect( object, mapping )
```

Binds multiple functions from an object to multiple events configured by a mapping. Configure the _event name_ to _function name_ mapping with an optional priority for each event.

##### Examples

Connect multiple events to object methods:

```javascript
obj.connect({
    foo () { console.log('hello') }
    bar (sender) { console.log(obj === sender) }
});

obj.emit('foo');   // => 'hello'
obj.emit('bar');   // => 'true'
obj.emit('plah');  // nothing will happen
```

Connect an object with a mapping:

```javascript
obj.connect(options, {
    onProjectionUpdated : [100, 'projectionUpdated'],
    onFrame             : 'frame',
    onFrameEnd          : 'frameEnd'
});

obj.emit('frame', ..);   // => options.onFrame(..)
```


### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/emit.svg" alt="emit()" width="144">

```
obj.emit( eventName [, args... ] )
```

_Fire an event._

All listeners will be called in (1st) _priority_ and (2nd) _creation time_ order.

There are two expections of this rule:
- _catch'm all_ listeners will be called **after** _all_ other listeners within _same priority_
- listeners registered by `connect()` will be called with `priority = eventize.PRIO_DEFAULT` BUT _before_ all _catch'm all_ listeners for this priority.

`emit()` will not return any value (*undefined*).

_You should NOT emit the **catch'm all** event!_

##### The Listener Context

(the `this` reference _inside_ your listener function)

- When the listener is registered by a _callback function_, `this` is the *sender context* (this is your _eventized object_ which owns the `emit()` method)
- When the listener is registered by an _object reference_ or by `connect()`, is always the listener object itself!

All other `args` will be transferred to the listener.

All _object_ listeners (which are registered by _object reference_ via `on()` or by `connect()`) will receive an extra argument
(as last argument) which is a reference to the _sender object_.

##### Sender Object

The _sender object_ passed into the listener as additional argument is defined by how the listener was registered ..
- _connected_ objects (registered by `connect()`) will always get a reference to the _emitting_ object (that is the object which is executing `emit()`)
- _object_ listeners registered by `a.on()` will always get a reference to the object in which they were _filed_ (that is the object with `.on()`)


##### Examples

```javascript
const PRIO = 100;

let a = eventize({});

a.on('foo', (x, y, z, undef) => {    // by function
    console.log(x+3, y+3, z+3, undef === undefined);
});

a.on('*', PRIO, {                    // by object
    foo (x, y, z, senderCtx) {
      console.log(x+6, y+6, z+6, a === senderCtx);
    }
});

a.connect({                          // connect object
    foo (x, y, z, senderCtx) {
      console.log(x+9, y+9, z+9, a === senderCtx);
    }
});

let b = eventize({});                // by eventized object

b.on('foo', (x, y, z, senderCtx) => {
    console.log(x, y, z, b === senderCtx);
});

a.on('foo', PRIO, b);

a.emit('foo', 1, 2, 3);

// "1 2 3 false"
// "4 5 6 true"
// "7 8 9 true"
// "10 11 12 true"
```


### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/emitReduce.svg" alt="emitReduce()" width="288">


```
obj.emitReduce( eventName [, value= {} ] [, args... ] )
```

Fire an event and return a result.

The *return value* from a listener is the *new* `value` used for the next listener in the call chain (unless the return value is `undefined`).
That means the *result* (return value from `emitReduce()`) is the return value from the _last called listener_.

Apart from that it works like `emit()`.


### <img src="https://cdn.rawgit.com/spearwolf/eventize/master/doc/images/off.svg" alt="off()" width="120">

```
obj.off( id )
obj.off( callback )
obj.off( object )
obj.off( eventName )
obj.off()
```

Removes a listener from an event.

De-activate listener by `id` or previously bound `object` (registered by `.on()` or `.connect()`) or
`callback` function reference or `eventName` or silence *all* events.


## Extra API Helpers

```
eventize.is( obj )
```

Check if `obj` is an _eventized object_ (has the _eventized object_ **api**). Returns `true` or `false`

```
eventize.PRIO_MAX
eventize.PRIO_A
eventize.PRIO_B
eventize.PRIO_C
eventize.PRIO_DEFAULT = 0
eventize.PRIO_LOW
eventize.PRIO_MIN
```

Some predefined priorities. Use it or not. They are defined just for convenience.


