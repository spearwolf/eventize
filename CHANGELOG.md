# Changelog

## `v3.0.0`

### Npm Package

- under the hood the build pipeline has been modernized. internally typescript v5.2 is now used
- the javascript fragment output of the npm package `@spearwolf/eventize` has been adjusted:
  - there is no more _default_ export. instead of the default export the named export `eventize` should be used now
- `CHANGELOG.md` was introduced :)

### Migration Guide

- change all _default_ imports to the explicit named import: `import {eventize} from '@spearwolf/eventize'`
