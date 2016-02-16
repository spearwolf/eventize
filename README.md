# eventize.js

[![Build Status](https://travis-ci.org/spearwolf/eventize.svg?branch=master)](https://travis-ci.org/spearwolf/eventize)

yet another fantastic pub/sub events micro framework for javascript!

features:
- simple and minimal api
- all api calls and calls-to-listeners are 100% synchronous, no async
- fully tested (specs included) and battle-proved
- apache-2.0 license

## Getting Started

Attach the _eventized-object_ api to any object you want.

```
const eventize = require('eventize');

var obj = eventize({});
```

## The _eventized-object_ API

### on()

```
object.on( eventName, [ prio, ] callbackFunc )
object.on( eventName, [ prio, ] obj )

object.on( callbackFunc )    // => object.on( '*', callbackFunc )
object.on( obj )             // => object.on( '*', obj )

object.on()
```

Adds a listener to an event name.
When the event is fired all listeners will be called.


### once()

```
object.once( eventName, [ prio, ] callbackFunc )
object.once( eventName, [ prio, ] obj )

object.once( callbackFunc )      // => object.once( '*', callbackFunc )
object.once( obj )               // => object.once( '*', obj )
```

Adds a listener to an event name.
__The listener will be removed after the function gets called once.__
When the event is fired all listeners will be called in _priority_ and _creation time_ order.


### connect()

```
object.connect( obj )
object.connect( obj, mapping )
```

Bind multiple functions to events.

#### Examples

connect an object:

```
object.connect({
     foo: functions () { console.log('hello') }
})

object.emit('foo')   // => 'hello'
object.emit('bar')   // nothing will happen
```

connect an object with mapping:

```
object.connect(options, {
     onProjectionUpdated : [100, 'projectionUpdated'],
     onFrame             : 'frame',
     onFrameEnd          : 'frameEnd'
})

object.emit('frame', ..)   // => options.onFrame(..)
```


### emit()

```
object.emit( eventName [, arguments .. ] )
```

Fire an event.
The listeners calling order is determinated by priority and creation time.


### emitReduce()

```
object.emitReduce( eventName [, value= {} ] [, arguments .. ] )
```

Fire an event and returns a result.

The returned result from a listener function is the new value for the next listener (if the value is not undefined).
Thats means that the *result* is the returned value from the *last* called listener function.

The calling order is determinated by listener priority.


### off()

```
object.off( id )
object.off( callback )
object.off( obj )
object.off( eventName )
object.off()
```

Removes a listener from an event.

Deactivate listener by id or previously bound object or
function reference or event name or silence all events.


