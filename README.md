# eventize.js

[![Build Status](https://travis-ci.org/spearwolf/eventize.svg?branch=master)](https://travis-ci.org/spearwolf/eventize)

yet another fantastic pub/sub events micro framework for javascript!

##### Features

- clean, minimal & easy api
- all api-calls and downstream-listeners-calls are 100% synchronous, no async
- fully tested (jasmine specs included) and battle-proven
- apache-2.0 license

## Getting Started

Attach the _eventized object_ **api** to any custom object you want.

```javascript
const eventize = require('eventize');

var obj = eventize({});

obj.on('foo', (bar) => console.log('hello', bar));

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

#### eventize()

```
eventize( obj )
```

Attach the _eventized object_ **api** to an object. Returns the object.


#### eventize.is()

```
eventize.is( obj )
```

Check if the given object is _eventized_ (has the _eventized object_ **api**). Returns `true` or `false`


### The _eventized object_ API

#### on()

```
obj.on( eventName, [ prio, ] callbackFunc )
obj.on( eventName, [ prio, ] obj )

obj.on( callbackFunc )    // => alias for: object.on( '*', callbackFunc )
obj.on( obj )             // => alias for: object.on( '*', obj )

obj.on()
```

Adds a listener to an event name.
When the event is fired all listeners will be called.


#### once()

```
obj.once( eventName, [ prio, ] callbackFunc )
obj.once( eventName, [ prio, ] obj )

obj.once( callbackFunc )      // => object.once( '*', callbackFunc )
obj.once( obj )               // => object.once( '*', obj )
```

Adds a listener to an event name.
__The listener will be removed after the function gets called once.__
When the event is fired all listeners will be called in _priority_ and _creation time_ order.


#### connect()

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


#### emit()

```
obj.emit( eventName [, arguments .. ] )
```

Fire an event.
The listeners calling order is determinated by priority and creation time.


#### emitReduce()

```
obj.emitReduce( eventName [, value= {} ] [, arguments .. ] )
```

Fire an event and returns a result.

The returned result from a listener function is the new value for the next listener (if the value is not undefined).
Thats means that the *result* is the returned value from the *last* called listener function.

The calling order is determinated by listener priority.


#### off()

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


