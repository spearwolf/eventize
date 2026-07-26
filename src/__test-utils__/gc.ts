import v8 from 'node:v8';
import vm from 'node:vm';

/**
 * A collector this process can actually call.
 *
 * `globalThis.gc` only exists when node was started with `--expose-gc`, and
 * that flag is not reliably accepted through `NODE_OPTIONS` across the node
 * versions this package supports — node 18 refuses to start at all with it
 * (`--expose-gc is not allowed in NODE_OPTIONS`), and 18 sits in both workflow
 * matrices. Flipping the V8 flag at runtime and taking `gc` out of a freshly
 * created context works on 18, 20, 22 and 24 alike and leaves the test command
 * alone — which is the point: a GC assertion that skips itself when the flag is
 * missing would replace the gap it was written to close with an invisible one.
 *
 * The trade-off, so nobody has to weigh it a second time: node documents
 * `v8.setFlagsFromString()` with "changing settings after the VM has started
 * may result in unpredictable behaviour", and that warning is real for flags
 * touching compilation or heap layout. `--expose-gc` only decides whether newly
 * created contexts get a `gc` binding, it is set back immediately, and nothing
 * outside the spec suite is involved — this is test scaffolding, not something
 * the library does. Should a future node make even this unsafe, move the flag
 * onto the test command; do not make the spec optional.
 */
const exposeGc = (): (() => void) => {
  const existing = (globalThis as {gc?: () => void}).gc;
  if (typeof existing === 'function') return existing;

  v8.setFlagsFromString('--expose-gc');
  try {
    return vm.runInNewContext('gc') as () => void;
  } finally {
    // The function is already bound into the new context; clearing the flag
    // again keeps every *later* context in this process unchanged.
    v8.setFlagsFromString('--no-expose-gc');
  }
};

export const gc = exposeGc();

const GC_ROUNDS = 10;

const collectRounds = async (
  ref: WeakRef<object>,
  rounds: number,
): Promise<number> => {
  for (let i = 0; i < rounds; i++) {
    // The yield before each collection is not decoration — it is what makes
    // the check work at all. Both `new WeakRef(target)` and `target.deref()`
    // add the referent to the job's "kept objects" set, where it is immune to
    // collection until the job ends; a `gc()` running before the next macrotask
    // therefore always finds the referent reachable, however dead it is. Yield
    // first, collect, then look.
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
    if (ref.deref() === undefined) return i + 1;
  }
  return -1;
};

/** Whether the collector in this process collects anything at all. */
const harnessVerdict = async (): Promise<string> =>
  (await collectRounds(
    ((): WeakRef<object> => new WeakRef({probe: [1, 2, 3]}))(),
    GC_ROUNDS,
  )) > 0
    ? 'harness ok'
    : 'HARNESS BROKEN — gc() collects nothing in this process';

/**
 * Collects until `ref`'s referent is gone, and reports what happened.
 *
 * The verdict is a string, and it is the assertion value on purpose. A bare
 * boolean fails as `expect(false).toBe(true)`, which on an unfamiliar node
 * build says neither how long the collector was given nor whether it was
 * working at all — a broken harness and a real leak look identical. Match the
 * string instead: `/^collected/` for "must be released", and
 * `/^still reachable.*harness ok/` — never a bare `/^still reachable/` — to pin
 * something that is deliberately still held, so that a dead collector cannot
 * satisfy the one kind of assertion it would otherwise make true.
 */
export const collect = async (
  ref: WeakRef<object>,
  rounds = GC_ROUNDS,
): Promise<string> => {
  const round = await collectRounds(ref, rounds);
  return round > 0
    ? `collected after ${round} gc round(s)`
    : `still reachable after ${rounds} gc rounds (${await harnessVerdict()})`;
};
