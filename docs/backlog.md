# Backlog

A short residual list: decisions that outlived the conversation that
produced them and have no other home in the repository — no code location
to comment at, no CHANGELOG entry to carry them.

Everything that used to sit here and *did* have such a home is covered
there already — `AGENTS.md` and `docs/lifecycle.md` just lost their
back-reference to this file — or moved there for the first time:
`src/subscribeTo.ts` and `integration/README.md`. Everything else —
findings and the items accepted or deferred alongside them — is recorded in
[`audit.html`](../audit.html), the project audit dated 2026-07-29, either
as a listed finding or in its appendix.

Close an entry by deleting it, and record the change in `CHANGELOG.md` if a
consumer can observe it.

## Accepted, not scheduled

### The method surfaces and the standalone functions narrow in different places

A typed event map does not close the same set of call forms on
`eventize.inject<T>()` or `class extends Eventize<T>` as it does on the
standalone `on()`. The standalone side guards the `obj` parameter with
`NonTypedEmitter`, which resolves to `never` and therefore closes *every* loose
overload at once, catch-all and listener-object forms included. The method
surfaces have no `obj` parameter, so the guard sits on the event-name slot
instead — and a call that carries no event name has nothing for it to close.

Four shapes compile on `eventize.inject<MyEvents>({})` and on a
`class extends Eventize<MyEvents>` — the two surfaces share one interface, so
they are open in the same places — and are a compile error on
`on(eventize<MyEvents>(), …)`: the catch-all function `on(fn)`, the catch-all
object literal `on({banana() {}})`, the named object literal
`on('data', {banana() {}})`, and the method-name form
`on('data', 'handler', ctx)`. The named forms do check the event name; what they
do not check is the listener object's method names.

The object literal is the one that bites. It fails the excess-property check
against `EventListenerMethods<TEvents>`, falls through to the open
listener-object arm, and registers a subscription no typed `emit()` can ever
reach — silently, where the standalone spelling of the same call is rejected.

Accepted rather than fixed, because closing those arms would take the catch-all
listener-object subscription away from typed maps entirely: `on(ε, obj)` and
`on(ε, 10, obj)` are documented, dispatch correctly, and have no event name a
map could be consulted about. Narrowing them by the map's method names instead
of closing them is a larger design question than the guard this entry describes,
and it is not scheduled.

### Dev-dependency advisories and versions

`npm audit` reports advisories in the dev tree, rooted in
`npm-run-all`/`minimatch` and `esbuild`; `npm audit --omit=dev` reports none.
The package ships no runtime dependencies, so only CI runners are exposed.
`npm-run-all` has had no release since 2018 and carries the one advisory copy
that cannot be patched. `sinon` and `@types/sinon` sit a major behind.

All of this is held for a build-system reboot that is intended but not
scheduled.
