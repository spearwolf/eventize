# CHANGELOG

## `v4.0.2` (2025-08-07)

- upgrade dependencies

## `v4.0.1` (2024-08-04)

- use `Symbol.for('eventize')`

## `v4.0.0` (2024-07-22)

**!! BREAKING CHANGES !!**

_Introduction of the new functional API_

Previously, the Eventize API methods were assigned to the object as methods after calling `eventize(obj)`
This behavior has changed in 4.0.0: all eventize methods are now available as library exports in the functional variant:

```js
import {
  on,
  once,
  onceAsync,
  off,
  emit,
  emitAsync,
  retain,
  retainClear
} from '@spearwolf/eventize';
```

| before | after |
|--------|-------|
| `obj.on(..)` | `on(obj, ...)` |
| `obj.once(..)` | `once(obj, ...)` |
| `obj.emit(..)` | `emit(obj, ...)` |
| `obj.off(..)` | `off(obj, ...)` |
| ... | ... |

There is still the option to inject the Eventize API as methods to the object (but this is no longer the default) by using:

- `eventize.inject(obj)` &rarr; _eventizedObj with eventize-api methods_
  - the `eventize.extend()` method has been removed, however 
- `new (class extends Eventize {})()`
  - the base class `Eventize` is still available and works in the same way as before
  
If you are using the syntax from the _composition via inheritance_ example, you should now be using `eventize.inject` directly:

```typescript
import {eventize, type Eventize} from '@spearwolf/eventize'

export interface Foo extends Eventize {}

export class Foo {
  constructor() {
    eventize.inject(this);
  }
}
```

Other API Changes

- The _default export_ is still the `eventize()` function, but the `Priority` object is no longer assigned here
  - `Priority` is still available as a named export (only)


## `v3.4.2` (2024-06-01)

- extend the signature of `.onceAsync()` so that the type of the promise return value can be specified optionally
- upgrade build package dependencies
- upgrade the javascript target version to ES2022 (was ES2021)

## `v3.4.1`

- retained events always maintain their original order in which they were published!
- the methods `.retain()` and `.retainClear()` now also optionally allow the specification of multiple events

## `v3.4.0`

- fix `.once()` behavior with multiple event names
- fix `.onceAsync()`

## `v3.3.0`

- with `.onceAsync()` only the event names are accepted as parameters, no callback functions anymore (this makes no sense)
- introduce the `.retainClear()` method: clear a saved event

## `v3.2.0`

- introduce `.onceAsync()`

## `v3.1.2`

- The `src/` folder no longer ends up in the npm package by mistake!

## `v3.1.1`

- `eventize()` can now create a `{}` by itself if no custom object is given

## `v3.1.0`

- introduce `.emitAsync()`

## `v3.0.2`

- Fix exported type definitions
- Clean up the build system internally (using `tsup`)

## `v3.0.1`

- Mark npm package as side effects free

## `v3.0.0`

### Npm Package

- Under the hood, the build pipeline has been modernised and now uses Typescript v5.2 internally.
- The javascript fragment output of the npm package `@spearwolf/eventize` has been fixed:
  - there is no _default_ export anymore. instead of the default export, the named export `eventize` should now be used.
- a CHANGELOG was finally introduced 😉

### Migration Guide

- Change all _default_ imports to the explicit named import: `import {eventize} from '@spearwolf/eventize'`
