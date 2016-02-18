# eventize.js

[![Build Status](https://img.shields.io/travis/spearwolf/eventize.svg?style=flat-square)](https://travis-ci.org/spearwolf/eventize)

yet another fantastic pub/sub events micro framework for javascript!

##### Features

- clean, minimal & easy api
- all api-calls and downstream-listeners-calls are 100% synchronous, no async
- battle-proven & fully tested (jasmine specs & karma included)
- apache-2.0 license

## Getting Started

Attach the _eventized object_ **api** to any custom object you want.

```javascript
const eventize = require('eventize');

var obj = eventize({});

obj.on('foo', hello => console.log('hello', hello));

obj.emit('foo', 'world');       // => "hello world"

obj.connect({
    foo (bar) {
        console.log('hejho', bar);
    }
});

obj.emit('foo', 'eventize');       // => "hello eventize", "hejho eventize"
```

## API

### The _eventize_ API

---

#### `eventize()`

```
eventize( obj )
```

Attach the _eventized object_ **api** to an object. Returns the object.

---

#### `eventize.is()`

```
eventize.is( obj )
```

Check if the given object is _eventized_ (has the _eventized object_ **api**). Returns `true` or `false`


### The _eventized object_ API

---

#### `on()`

```
obj.on( eventName, [ priority, ] callbackFunc )
obj.on( eventName, [ priority, ] object )

obj.on( callbackFunc )    // => alias for: object.on( '*', callbackFunc )
obj.on( obj )             // => alias for: object.on( '*', object )
```

Adds a listener to an event name.

The **priority** is optional and should be a _number_. The _default_ **priority** is defined by `eventize.PRIO_DEFAULT` (which is `0` by default)

The **eventName** is mandatory and should be a _string_.

The _catch'm all_ **eventName** `*` is special: listeners will be called ..
- regardless off the event name
- _after all_ other listeners with _same priority_
- with an extra function argument (as last arg) set to the current event name


```
obj.on( eventName )
obj.on()
```

Reactivate all listeners or by event name. You can deactivate listeners with `obj.off()`

---

#### `once()`

```
obj.once( eventName, [ prio, ] callbackFunc )
obj.once( eventName, [ prio, ] object )

obj.once( callbackFunc )      // => object.once( '*', callbackFunc )
obj.once( obj )               // => object.once( '*', object )
```

Adds a listener to an event name.
__The listener will be removed after the function gets called once.__
Apart from that `once()` works like `on()`

---

#### `connect()`

```
obj.connect( obj )
obj.connect( obj, mapping )
```

Bind multiple functions to events.

##### Examples

Connect multiple events to object methods:

```javascript
obj.connect({
    foo () { console.log('hello') }
});

obj.emit('foo');   // => 'hello'
obj.emit('bar');   // nothing will happen
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

---

#### `emit()`

```
obj.emit( eventName [, arguments .. ] )
```

Fire an event.

All listeners will be called in (1st) _priority_ and (2nd) _creation time_ order.

There are two expections of this rule:
- _catch'm all_ event listeners will be called _after_ all other listeners within _same priority_
- listeners registered by `connect()` will be called with _priority_ = `eventize.PRIO_DEFAULT` BUT _before_ the _catch'm all_ listeners for this priority.

_You should NOT emit the **catch'm all** event!_

The context (that's the `this` reference) depends on your listener ..
- when registered by _callback function_
  - .. is the sender context (that's your _eventized object_ which has the `emit()` method)
- when registered by _object reference_ or by `connect()`
  - .. is, of course, the listener!

All additional arguments will be transferred to the listeners.

##### Examples

```javascript
let a = eventize({})

a.on('foo', (x, y, z) => {          // by function
    console.log(x, y, z);
})

a.on('foo', {                       // by object
    foo (x, y, z) {
      console.log(x+3, y+3, z+3);  
    }
})

let b = eventize({})                // by eventized object
b.on('foo', (x, y, z) => {
    console.log(x+6, y+6, z+6);
})
a.on('foo', b)

a.emit('foo', 1, 2, 3);
// "1 2 3"
// "4 5 6"
// "7 8 9"
```

---

#### `emitReduce()`

```
obj.emitReduce( eventName [, value= {} ] [, arguments .. ] )
```

Fire an event and returns a result.

The returned result from a listener function is the new value for the next listener (if the value is not undefined).
Thats means that the *result* is the returned value from the *last* called listener function.

The calling order is determinated by listener priority.

---

#### `off()`

```
obj.off( id )
obj.off( callback )
obj.off( obj )
obj.off( eventName )
obj.off()
```

Remove a listener from an event.

Deactivate listener by id or previously bound object or
function reference or event name or silence all events.


