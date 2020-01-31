# eventize.js

[![npm version](https://img.shields.io/npm/v/eventize-js?style=for-the-badge)](https://www.npmjs.com/package/eventize-js)
[![Build Status](https://img.shields.io/travis/spearwolf/eventize.svg?style=for-the-badge)](https://travis-ci.org/spearwolf/eventize)

yet another *fantastic* event emitter micro framework for javascript!

##### FEATURES

- :sparkles: **wildcards** & **priorities** :exclamation:
- has **typescript types** included :tada:
- :rocket: **powerful api** (*partial* similar to [node.js events](https://nodejs.org/api/events.html))
- all api-calls and downstream-listener-calls are **100% synchronous** :boom: no async! :stuck_out_tongue_closed_eyes:
- supports all major browsers and Node.js environments
- very small footsprint ~2.8k gzip'd
- no runtime dependencies
- apache-2.0 license


## Getting Started

Attach the _eventizer_ **api** to any javascript object you want.

```javascript
import eventize from 'eventize-js';

const say = hello => world => console.log(hello, world);
const obj = eventize({});

obj.on('foo', say('hello'));

obj.once(['foo', 'bar'], PRIO_A, {
  foo: say('hej'),
});

obj.on(['foo', 'bar'], PRIO_LOW, say('moin moin'))

obj.emit('foo', 'world');
// => "hej world"
// => "hello world"
// => "moin moin world"

obj.on('foo', () => obj.off('foo'));

obj.emit(['foo', 'bar'], 'eventize');
// => "hello eventize"
// => "moin moin eventize"

```


## Installation

Install the latest version with: `npm install --save eventize-js`


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
eventize.PRIO_MAX
eventize.PRIO_A
eventize.PRIO_B
eventize.PRIO_C
eventize.PRIO_DEFAULT = 0
eventize.PRIO_LOW
eventize.PRIO_MIN
```

Some predefined priorities. Use it or not. They are defined just for convenience.


