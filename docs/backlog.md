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

### Dev-dependency advisories and versions

`npm audit` reports advisories in the dev tree, rooted in
`npm-run-all`/`minimatch` and `esbuild`; `npm audit --omit=dev` reports none.
The package ships no runtime dependencies, so only CI runners are exposed.
`npm-run-all` has had no release since 2018 and carries the one advisory copy
that cannot be patched. `sinon` and `@types/sinon` sit a major behind.

All of this is held for a build-system reboot that is intended but not
scheduled.
