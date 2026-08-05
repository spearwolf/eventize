import {detectListenerType, EventListener} from './EventListener';
import type {OnceObligation} from './EventListener';
import {EVENT_CATCH_EM_ALL} from './constants';
import type {EventName, ListenerObjectType} from './types';
import {isCatchEmAll, isEventName} from './utils';
import {
  createBucket,
  detachAll,
  EMPTY_CATCH_EM_ALL,
  EMPTY_NAMED_LISTENERS,
  HELD_BY,
} from './bucket';
import type {ListenerBucket} from './bucket';
import {
  DEDUP_INDEX,
  findSimilarListener,
  indexAdd,
  indexRemove,
} from './dedupIndex';
import {findInsertIndex, mergeWalk, walkBucket} from './walk';
import type {WalkCallback} from './walk';

/**
 * `peekListeners()`'s answer for a name nothing is registered under. One
 * frozen array, reused for every miss instead of allocating a throwaway one
 * per call. Freezing it matters *because* it is shared: a caller reaching
 * past the `ReadonlyArray` type with a cast would otherwise corrupt every
 * other name's empty answer along with its own, which a per-bucket array
 * never risks.
 */
const EMPTY_LISTENERS: ReadonlyArray<EventListener> = Object.freeze([]);

export class EventStore {
  // Both start on the shared stand-ins and are swapped for a container of
  // their own by the first write — see `EMPTY_NAMED_LISTENERS` in `bucket.ts`.
  // Neither is `readonly` any more for that reason, and both are private for
  // the one they always should have been: read-only from the outside,
  // swappable from the inside. Clone-on-mutate has replaced the wildcard reference since
  // v6.0.0, and lazy allocation now replaces the named one too; a getter over
  // a private field buys that without widening what a holder of the store may
  // do with it. (Consumers never see the store at all — the internals slot is
  // opaque in the published types — but this is the boundary AGENTS.md asks to
  // keep drawn, not a hypothetical.)
  private namedBuckets: Map<EventName, ListenerBucket> = EMPTY_NAMED_LISTENERS;

  private catchEmAllBucket: ListenerBucket = EMPTY_CATCH_EM_ALL;

  get namedListeners(): Map<EventName, ListenerBucket> {
    return this.namedBuckets;
  }

  /**
   * The wildcard bucket, live and mutable — which makes this the creating door
   * of the pair, the way `getListenersForEventName()` is for a named one.
   * Handing the stand-in out through a mutable `Array<EventListener>` would be
   * handing out the one array in the module nobody may write to, and a caller
   * that then writes to it has neither reached the registry nor been told so.
   * `peekListeners('*')` is the looking door: it promises no mutation through
   * its return type and creates nothing, so it answers from the field and may
   * hand back the stand-in.
   *
   * Nothing in the library reads this — `add()` goes to the materializer
   * directly — so the allocation it forces lands on the specs and the test
   * utils that ask for the array by name.
   */
  get catchEmAllListeners(): Array<EventListener> {
    return this.mutableCatchEmAllBucket();
  }

  private mutableNamedBuckets(): Map<EventName, ListenerBucket> {
    if (this.namedBuckets === EMPTY_NAMED_LISTENERS) {
      this.namedBuckets = new Map();
    }
    return this.namedBuckets;
  }

  private mutableCatchEmAllBucket(): ListenerBucket {
    if (this.catchEmAllBucket === EMPTY_CATCH_EM_ALL) {
      this.catchEmAllBucket = createBucket();
    }
    return this.catchEmAllBucket;
  }

  /**
   * `eventName === '*'` is not special-cased here: `'*'` is a legal key in
   * `namedListeners` as far as this method knows, so it gets a bucket of its
   * own like any other name, distinct from `catchEmAllBucket`. `forEach()`
   * never walks that key — a `'*'` dispatch reads `catchEmAllBucket` only —
   * so a bucket created this way is never held and never seen by a running
   * emit. `peekListeners('*')` disagrees on purpose: it reads
   * `catchEmAllBucket` for `'*'`, the array wildcard listeners actually land
   * in. Calling both with `'*'` therefore answers from two different arrays;
   * see `EventStore.spec.ts`'s impostor-bucket case for the mechanism, and
   * `peekListeners()`'s own doc comment for the reading side of it.
   */
  getListenersForEventName(eventName: string | symbol): ListenerBucket {
    let namedListeners = this.namedBuckets.get(eventName);
    if (!namedListeners) {
      namedListeners = createBucket();
      // The first named subscription on this emitter is also what buys it a
      // Map of its own; up to here it shared the stand-in with every other
      // store this module built.
      this.mutableNamedBuckets().set(eventName, namedListeners);
    }
    return namedListeners;
  }

  /**
   * The second door promised for a caller that only wants to look:
   * `getListenersForEventName()` stays the creating one — `add()` needs a
   * bucket to insert into, and lazy creation plus the `'*'`-as-key edge are
   * both pinned by spec against it — while this one never adds a bucket or a
   * map entry. An unknown name reads back the same frozen empty array every
   * time; a known one is handed back by reference, not copied, because
   * nothing here is a snapshot promise, only a no-mutation one — reading it
   * again after a mutation may hand back the pre-clone array, same as
   * `getListenersForEventName()` (see AGENTS.md).
   *
   * That no-mutation promise is the return type, not a runtime copy: what
   * comes back is `ReadonlyArray`, so a caller cannot `push()` or `splice()`
   * their way into the registry without reaching past the type first. The
   * use-it-immediately discipline `getListenersForEventName()` can only ask
   * for in a comment is half enforced here instead: the compiler takes the
   * no-mutation half, and freshness stays the caller's problem either way. Frozen-ness is not part of that promise and is not uniform: it
   * holds for the shared empty answer to an unknown name and for the
   * catch-em-all stand-in an emitter without wildcard listeners still sits on,
   * while a bucket that exists is a live array underneath and stays mutable
   * via a cast, because `bucketForMutation()` still has to splice it in place.
   * Nobody outside this file may rely on either state.
   *
   * `eventName === '*'` reads `catchEmAllBucket`, not a `'*'` key in
   * `namedListeners` — the array wildcard listeners are actually in.
   * `getListenersForEventName('*')` disagrees: it treats `'*'` as an
   * ordinary name and creates a bucket of its own for it, a bucket
   * `forEach()` never walks. The two methods answer `'*'` from different
   * arrays; see the doc comment there and `EventStore.spec.ts`'s
   * impostor-bucket case.
   *
   * Unreachable in the published types, not at runtime: `EventStore` is not
   * exported from `src/index.ts` and the internals slot is opaque there —
   * the boundary AGENTS.md draws under "The internals boundary". The slot
   * itself is a documented, realm-wide symbol (`Symbol.for('eventize')`)
   * that code can still reach into directly, which is exactly what
   * `docs/retain.md` warns against doing. This method is not public API; it
   * just isn't unreachable by construction.
   */
  peekListeners(eventName: EventName): ReadonlyArray<EventListener> {
    if (isCatchEmAll(eventName)) {
      return this.catchEmAllBucket;
    }
    return this.namedBuckets.get(eventName) ?? EMPTY_LISTENERS;
  }

  /**
   * The array a mutation has to go through, and the one rule the whole
   * clone-on-mutate design rests on.
   *
   * If no walk is holding this bucket the mutation happens in place and
   * nothing is allocated — that covers every dispatch that mutates nothing at
   * all, and also every mutation of a bucket other than the one or two the
   * running walks are iterating. Only when the live bucket *is* an array a
   * walk is stepping through may it not change underneath: it is cloned, the
   * clone is swapped into the store, and the walk keeps the old array. That is
   * the entire protection `forEach()` used to buy with a `slice(0)` on
   * **every** dispatch.
   *
   * A clone therefore costs at most **once per bucket and walk**, never once
   * per mutation: the clone the store now holds is not the array anyone is
   * walking, so the next mutation of the same event name finds it unheld and
   * goes in place. And a bucket no walk ever looked at is never copied,
   * however often a dispatch changes it — a teardown listener calling
   * `off(ε, componentInstance)` across k event names copies at most the one
   * bucket its own emit is walking, not k of them.
   *
   * Three obligations for anyone adding a mutation path:
   *
   * 1. Route it through here, or a listener that subscribes from inside its
   *    own callback becomes visible to the running dispatch again.
   * 2. Call it only once a mutation is certain — never speculatively. A lookup
   *    that removes nothing must leave bucket identity alone, or "the array
   *    changed" stops meaning "the registry changed" and `EventStore.spec.ts`
   *    stops measuring anything.
   * 3. Pair every splice with the dedup index — but the two halves fail
   *    differently, and only one of them tells you. `indexAdd()` after an
   *    insert: skip it and the next identical subscription stops aggregating
   *    and registers a second time instead, which is a dispatch and a count
   *    error, and the suite says so loudly across several files.
   *    `indexRemove()` before the `detach()` that follows a removal: skip it
   *    and nothing goes red except the handful of cases that read the index
   *    directly, while the consumer's own object stays held by an emitter they
   *    have unsubscribed from — see `indexRemove()` in `dedupIndex.ts`.
   *
   * Indices computed against `bucket` stay valid in what comes back: the clone
   * is a `slice(0)`, element for element.
   *
   * Which slot the clone is installed into is derived from the **array**, not
   * from `eventName`: the caller holds the array, so that is the thing it
   * cannot get wrong. `'*'` can appear as a key in `namedListeners` — the
   * public `getListenersForEventName('*')` puts it there — and deriving the
   * destination from the name would send that bucket's clone into the wildcard
   * slot. That damage cannot actually occur, and the rule is worth keeping
   * anyway: `forEach()` never walks a `'*'` key, so such a bucket is never
   * counted, never cloned, and the name-derived branch is unreachable rather
   * than merely untested. No spec can catch the swap. Deriving from the array
   * is what keeps the question closed here instead of resting on an argument
   * about `forEach()` two hundred lines away.
   */
  private bucketForMutation(
    eventName: EventName,
    bucket: ListenerBucket,
  ): ListenerBucket {
    if (bucket[HELD_BY] === 0) return bucket;

    const clone = createBucket(bucket);
    if (bucket === this.catchEmAllBucket) {
      this.catchEmAllBucket = clone;
    } else {
      this.namedBuckets.set(eventName, clone);
    }
    return clone;
  }

  /** Splices one known instance out, if it is in there. Returns the bucket the store holds afterwards. */
  private spliceOut(
    eventName: EventName,
    bucket: ListenerBucket,
    item: EventListener,
  ): ListenerBucket {
    const idx = bucket.indexOf(item);
    if (idx < 0) return bucket;
    const target = this.bucketForMutation(eventName, bucket);
    target.splice(idx, 1);
    // Before the caller detaches it — see indexRemove().
    indexRemove(target, item);
    return target;
  }

  /**
   * Splices out *every* entry under `eventName` that `listenerObject` takes
   * part in — not just the first — detaching each, and returns the bucket the
   * store holds afterwards. Two shapes still put several matches in one
   * bucket: two `on()` calls at differing priorities (priority is part of the
   * similarity key, so they never collapse), and the same function subscribed
   * twice (functions never dedup). Two `once()` calls on one identity were a
   * third until v6.0.0; they aggregate into a single registration now, so this
   * pass finds one entry there however many obligations it carries.
   * `off(ε, eventName, listenerObject)` promises to remove all of them, and
   * splicing only the first left the rest subscribed and firing.
   *
   * One backward pass, reading from the array it was handed. Backwards keeps
   * the indices of the entries not yet visited valid across each splice, and
   * the clone — where one is owed — is element-for-element below every index
   * spliced so far, so the same `i` addresses the same entry in either array.
   * Each match is detached in the step that removes it, and the scan never
   * looks at an entry again afterwards, so no comparison ever reads the nulled
   * fields of a detached listener. Up to v5.1.0 both removal paths could: this
   * one collected its victims and then ran a fresh identity scan per victim,
   * and the sibling below ran its two tests as two sequential passes.
   *
   * `bucketForMutation()` is called at the first match and never before: a
   * lookup that removes nothing has to leave bucket identity alone.
   */
  private detachByAssociation(
    eventName: EventName,
    bucket: ListenerBucket,
    listenerObject: unknown,
  ): ListenerBucket {
    let target = bucket;
    for (let i = bucket.length - 1; i >= 0; i--) {
      // i walks strictly inside [0, bucket.length), so bucket[i] is always
      // defined here — the undefined branch exists for the compiler.
      const current = bucket[i];
      // Three registration shapes can associate an object with a listener:
      // on(ε, name, listenerObject) parks it in `listener`, while both
      // on(ε, name, methodName, listenerObject) and on(ε, name, fn, context)
      // park it in `listenerObject`. All three are matched here.
      if (
        current !== undefined &&
        current.eventName === eventName &&
        (current.listener === listenerObject ||
          current.listenerObject === listenerObject)
      ) {
        if (target === bucket) {
          target = this.bucketForMutation(eventName, bucket);
        }
        target.splice(i, 1);
        // Unfiled before it is detached, which nulls the slot it is keyed by.
        indexRemove(target, current);
        current.detach();
      }
    }
    return target;
  }

  /**
   * The same single backward pass as `detachByAssociation()`, with the test
   * `off(ε, fn[, obj])` and `off(ε, obj)` need: the registered
   * `(listener, listenerObject)` pair, plus — for an object argument — the
   * nameless association, which reduces to `listenerObject` identity because
   * the event-name half of the association test can never fire without a name.
   *
   * How much of that pair has to match depends on how much of it the caller
   * gave. `off(ε, fn, ctx)` names both halves and gets both compared. An
   * `off()` with no listener object at all — `listenerObject` arrives
   * `undefined` from `off()`, `null` from `remove()`'s array branch and from
   * an explicit `off(ε, fn, null)` — asks about the listener alone, and since
   * v6.0.0 that is what it is answered: the stored context is not part of a
   * question the caller did not ask. There is therefore no spelling left that
   * matches *only* a contextless registration; the handle `on()` returned is
   * what addresses one registration and nothing else.
   *
   * Up to v5.1.0 the missing half was read as "registered with no context",
   * so `on(ε, 'evt', this.handler, this)` survived `off(ε, this.handler)`
   * without a word and kept both the function and the context object alive on
   * an emitter the caller believed it had let go of. The narrow reading was
   * deliberate, and the broad one is not free either: a teardown calling
   * `off(ε, SomeClass.prototype.handler)` now detaches every *other* instance
   * that drew the same prototype method under its own context. That price is
   * accepted knowingly. An unsubscribe that silently removes nothing is the
   * worse of the two failures — nothing about it is observable until someone
   * measures what the emitter still holds — and `off(ε, fn, ctx)` is the way
   * to name one registration, which is the whole point of keeping the
   * three-argument form exact.
   *
   * An object argument reads the same way, and that is a decision rather than
   * a side effect — an `&& !isObjectListener` on the test above would have
   * held `off(ε, obj)` back, though only written `isEqual(listener,
   * listenerObject ?? null)`: `isEqual()` lost its `null` default in the same
   * change, so the exemption on its own would have asked the object-alone
   * form about `undefined` and matched nothing at all. The rule is worth more
   * than the exemption: the identity slot alone decides whenever the caller
   * names no second argument, for a function and an object alike, so there is
   * one sentence to know instead of two. What `off(ε, obj)` gains by it is the
   * one shape it used to walk past, `on(ε, 'evt', obj, ctx)`, which files the
   * object in the identity slot and something else in the context slot —
   * "every subscription of that object" is what the call has always promised.
   *
   * What the association disjunct needed instead is `&& matchListenerOnly`: it
   * answers the *nameless* association, so it has no business running once the
   * caller has named a context. Without the gate the three-argument form was
   * not narrowing at all — `off(ε, fn, ctx)` swept every other listener that
   * merely drew `fn` as its own context, and the whole point of keeping that
   * form exact is that there be one spelling for one registration. The gate
   * moves two things relative to v5.1.0, in opposite directions, and both are
   * intended: the two-argument forms remove *more* (the paragraph above, and
   * `off(ε, fn)` also reaching a function that sits in someone else's context
   * slot), while `off(ε, obj, ctx)` removes *less* — v5.1.0 and the untethered
   * v6 disjunct both took the foreign-context registrations along, and now
   * only the named pair goes. `off(ε, obj)` is the form for the broad sweep.
   * Note that `!isObjectListener` and `matchListenerOnly` are not two spellings
   * of one idea: the first asks what kind of thing the caller passed, the
   * second how much of the pair they named. Only the second is a question about
   * the call.
   *
   * The candidates come from the bucket's index rather than from the bucket,
   * and the test below is the one the scan ran per element, unchanged. What the
   * index buys is which elements it runs on: up to v5.1.0 — and, on the removal
   * side, up to the release this comment ships in — every `off(ε, fn)` and
   * `off(ε, obj)` read both identity slots of every listener under every event
   * name, and it read them to the end of each bucket rather than stopping at
   * the match, because a bucket can hold several. `dedupIndex.ts`'s
   * `eachIndexKey()` carries the
   * argument that makes the shortcut sound: a listener not filed under the
   * value `off()` names cannot match it.
   *
   * An index a bucket does not have means no listener in it is filed, which by
   * that same argument means none of them can match. Reachable and common
   * rather than theoretical: it is the wildcard bucket of every emitter nobody
   * ever subscribed a `'*'` listener to, visited once per `off(ε, fn)`.
   *
   * A copy of the candidate list, because unfiling a match splices it out of
   * that very list. Taken up front and therefore also when nothing matches —
   * `off(ε, fn, someOtherCtx)` pays for it and removes nothing — which is one
   * short array against a scan of the whole bucket, and the price of not
   * having to decide mid-loop whether the list is still the one being walked.
   * `spliceOut()` does the rest, and does it against `target` each time — so
   * the position is looked up in the array the store holds at that moment, and
   * neither the clone nor the shift from the previous splice has to be
   * reasoned about here.
   */
  private detachByIdentity(
    eventName: EventName,
    bucket: ListenerBucket,
    listener: unknown,
    listenerObject: unknown,
    isObjectListener: boolean,
  ): ListenerBucket {
    const index = bucket[DEDUP_INDEX];
    if (index === undefined) return bucket;
    const candidates = index.get(listener);
    if (candidates === undefined) return bucket;

    const matchListenerOnly = listenerObject == null;
    let target = bucket;
    for (const current of candidates.slice()) {
      if (
        (matchListenerOnly
          ? current.listener === listener
          : current.isEqual(listener, listenerObject)) ||
        (matchListenerOnly &&
          isObjectListener &&
          current.listenerObject === listener)
      ) {
        // spliceOut() unfiles before this detaches, which nulls the slots the
        // listener is keyed by.
        target = this.spliceOut(eventName, target, current);
        current.detach();
      }
    }
    return target;
  }

  /**
   * Whether the `add()` that returned last built the listener it handed back,
   * rather than finding one to aggregate onto. Meaningful only on the statement
   * that follows the call — a reader that stashes it for later is reading the
   * *next* registration's answer.
   *
   * It exists because `add()` no longer receives the listener it might insert:
   * the caller used to answer "was this one new?" by comparing the return value
   * against the instance it had just built, and that instance is precisely what
   * a deduplicating registration must stop allocating. A `{listener, created}`
   * result object would put the allocation straight back, one field narrower.
   *
   * The one reader is `registerEventListener()`, deciding whether a retained
   * value is replayed to a registration that aggregated.
   *
   * **What makes a single slot safe is that nothing between the write and the
   * read can register anything.** `add()` runs no consumer code after the
   * write — no dispatch, no `warn()`, no member read that could reach a getter
   * or a proxy trap — so a nested registration can only start outside `add()`,
   * where the pair it belongs to has already closed. Adding anything that
   * re-enters consumer code between the two breaks this field and nothing else
   * would say so, which is why the premise is pinned rather than asserted:
   * `once_on_aggregation.spec.ts` subscribes to a second retained event from
   * inside a retained replay, the tightest nesting the public API can build.
   */
  lastAddCreatedListener = false;

  /**
   * Returns the listener the registration landed on: a newly built one, or an
   * existing one with the same identity. Either way the registration is
   * recorded on it, which is what makes `on()` and `once()` aggregate in both
   * registration orders — see `lastAddCreatedListener` for how a caller tells
   * the two apart.
   *
   * Takes the subscription's five identifying slots rather than a listener,
   * and builds the `EventListener` only where one is actually inserted. The
   * dedup search reads nothing else (`dedupIndex.ts`'s `findSimilarListener()`),
   * so an
   * aggregating call now allocates nothing at all and burns no id from
   * `EventListener`'s module-global counter.
   *
   * `obligation` is what used to be a `noDedup`/`kind` flag: `null` for a
   * persistent `on()`, an `OnceObligation` for a `once()`. Its *presence*, not
   * a tag compared against it, is the whole test — the obligation itself is
   * the thing that later has to know every listener it was added to, so
   * threading it through here is what lets `once(ε, ['a','b'], h)` share one
   * obligation across two listeners instead of building two.
   */
  add(
    eventName: EventName,
    priority: number,
    listener: unknown,
    listenerObject: ListenerObjectType = null,
    obligation: OnceObligation | null = null,
  ): EventListener {
    // Materialized up front rather than at the splice below, and that is not
    // the speculative call `bucketForMutation()`'s rule forbids: the stand-in
    // is empty, an empty bucket holds nothing to aggregate onto, so reaching
    // here with it means the insertion at the end of this method is certain.
    // Both branches create — `getListenersForEventName()` is the named twin of
    // the materializer.
    const bucket = isCatchEmAll(eventName)
      ? this.mutableCatchEmAllBucket()
      : this.getListenersForEventName(eventName);

    // Recomputed here rather than read off a listener, and the constructor
    // below computes it a second time on the inserting path. That is the one
    // duplicated `typeof` switch this rebuild costs, and it is paid only where
    // an object is allocated anyway — an aggregating call pays it once and
    // allocates nothing.
    const listenerType = detectListenerType(listener);

    const similar = findSimilarListener(
      listenerType,
      priority,
      eventName,
      listener,
      listenerObject,
      bucket,
    );
    const target =
      similar ??
      new EventListener(eventName, priority, listener, listenerObject);

    if (obligation === null) {
      target.refCount += 1;
    } else if (!target.onceObligations?.includes(obligation)) {
      // The guard is for a duplicated name in one call — once(ε, ['a','a'], h)
      // aggregates onto the listener it just created, and one obligation must
      // not be counted on the same listener twice.
      (target.onceObligations ??= []).push(obligation);
      obligation.members.push(target);
    }

    // Two writes, and the optimistic one comes last — the field says "created"
    // only once the splice has actually happened. Deriving it from `similar`
    // in one write up here would leave it claiming a registration that does
    // not exist whenever `walk.ts`'s `findInsertIndex()` rejects a corrupted
    // bucket: that
    // throw skips the insertion, not the write. Written pessimistically first
    // for the same reason, so the throwing path leaves behind the answer that
    // is true of it.
    this.lastAddCreatedListener = false;

    // An aggregation touches no array and no index, so it owes no clone —
    // reading the live bucket's index above is safe for the same reason.
    if (similar) return similar;

    const arr = this.bucketForMutation(eventName, bucket);
    arr.splice(findInsertIndex(arr, target), 0, target);
    // Filed on the array the store holds afterwards, which is also the array the
    // next lookup will read — the clone shares the index of the bucket it came
    // from, so this lands in the same Map either way.
    //
    // Unconditional, while the dedup *gate* stays where it always was, in
    // findSimilarListener(): what the index holds and what aggregates are two
    // questions since the index gained its second reader. A function listener
    // is filed so off() can find it, and still never dedups, because the search
    // never asks about one — and could not match it if it did, isSimilar()
    // comparing listenerType first.
    indexAdd(arr, target);
    this.lastAddCreatedListener = true;
    return target;
  }

  remove(
    listener: unknown,
    listenerObject: unknown,
    removeSimilar = false,
  ): void {
    // off([...]) — recurses once per element, depth unbounded on purpose: a
    // self-referencing element re-enters this same branch and overflows the
    // stack with a RangeError rather than looping forever. That is the one
    // structure off()'s "accepts any shape" promise does not cover — see the
    // comment above off() in eventize-api.ts.
    if (listenerObject == null && Array.isArray(listener)) {
      listener.forEach((li) => this.remove(li, null, removeSimilar));
      return;
    }

    // off() / off('*')
    if (
      listener == null ||
      (listenerObject == null && isCatchEmAll(listener))
    ) {
      this.removeAllListeners();
      return;
    }

    // off('foo') / off(Symbol('foo'))
    if (listenerObject == null && isEventName(listener)) {
      this.removeByEventName(listener);
      return;
    }

    // off('foo', obj) / off(Symbol('foo'), obj)
    if (removeSimilar && isEventName(listener)) {
      this.removeByEventNameAndListenerObject(listener, listenerObject);
      return;
    }

    // off(fn[, obj]) / off(obj)
    this.removeByListener(listener, listenerObject);
  }

  private removeByEventName(eventName: EventName): void {
    const bucket = this.namedBuckets.get(eventName);
    // Returning early rather than deleting the key unconditionally: a bucket
    // under this name is also the proof that the Map is this store's own and
    // not the shared stand-in, which rejects `delete()` like every other write.
    if (bucket === undefined) return;

    detachAll(bucket);
    // Dropping the map entry is what empties the store here — this bucket is
    // not being *changed*, it is being let go of, which is why it needs no
    // clone. The truncation on top of it is a courtesy to a caller still
    // holding the array from getListenersForEventName(), and it is the one
    // thing a walk stepping through this very array must not suffer, so it
    // is skipped exactly then. A named bucket, hence the `false`. See
    // AGENTS.md, "the truncation exception".
    if (bucket[HELD_BY] === 0) {
      bucket.length = 0;
    }
    this.namedBuckets.delete(eventName);
  }

  /**
   * Gives one persistent (`on()`) registration back. `once()`'s handle calls
   * `releaseObligation()` instead — it holds no listener at all, only the
   * obligation, so there is nothing for this method to accept for that case.
   */
  release(listener: EventListener): void {
    if (listener.isRemoved) return;
    listener.refCount -= 1;
    if (listener.refCount > 0 || listener.onceObligations !== undefined) return;
    this.dropListener(listener);
  }

  /**
   * Gives one `once()` obligation back by hand, before anything discharged it.
   * A settled obligation is inert here on purpose: whichever name fired first
   * already ended it for every listener it was ever added to, and a handle
   * calling in after that has nothing left to give back.
   */
  releaseObligation(obligation: OnceObligation): void {
    if (obligation.settled) return;
    this.dischargeObligation(obligation);
  }

  /**
   * Discharges the obligations a listener carried *before* the dispatch that
   * just called this — all of them at once: they were satisfied by the same
   * call, and settling them one per dispatch would make a second `once()` on
   * the same identity fire on the next emit instead of this one.
   *
   * `watermark` is `EventListener.apply()`'s pre-dispatch snapshot of the
   * obligation sequence counter, not a count or an array slice boundary. Every
   * obligation this listener carries whose `sequence` is below that value
   * existed before the dispatch began, wherever it sits in the array — a
   * position cannot say that, because releasing a handle or a force-removal
   * can splice an obligation out of the *middle* of `onceObligations` and
   * shift every later entry left, including one the callback added *during*
   * this very dispatch by re-subscribing. Filtering by `sequence` instead of
   * position is what keeps that reshuffle from mattering.
   *
   * Runs from inside `EventListener.apply()`, so from inside a live `forEach()`
   * walk. `dischargeObligation()` → `dropListener()` routes through
   * `bucketForMutation()`, which is what keeps the walk's array intact.
   *
   * A copy, not the live array: discharging an obligation removes it from
   * every member's own list, this listener's included, out from under the
   * loop that is currently iterating it.
   */
  settleOneShots(listener: EventListener, watermark: number): void {
    const obligations = listener.onceObligations;
    if (obligations === undefined) return;

    for (const obligation of obligations.slice()) {
      if (obligation.sequence < watermark && !obligation.settled) {
        this.dischargeObligation(obligation);
      }
    }
  }

  /**
   * Ends one obligation everywhere it is held. `settled` and the emptied
   * `members` list go first, so a `dropListener()` below — which detaches,
   * which walks the dropped listener's own remaining obligations — cannot come
   * back into this one.
   *
   * This is the one place that knows about the race a multi-name `once()`
   * promises: `members` may hold several listeners, one per name the call
   * covered, and whichever of them got here first — through a real dispatch or
   * a handle calling `releaseObligation()` by hand — takes all of them out
   * together. A member already gone (force-removed by `off()`, which walks
   * straight to `EventListener.detach()` without going through here) is
   * skipped: `detach()` already spliced it out of `members` on its way out, so
   * `isRemoved` is a belt-and-braces check, not the one this relies on.
   *
   * The settle hook goes first, and it is read and cleared before it is called
   * so that neither a re-entrant discharge nor a throw from a member below can
   * run it twice or leave it standing. It is the `once()` handle's capture:
   * discharging is what spends a `once()`, whichever way it happened, and a
   * spent handle must hold nothing — see `OnceObligation.onSettled`.
   */
  private dischargeObligation(obligation: OnceObligation): void {
    obligation.settled = true;

    const onSettled = obligation.onSettled;
    obligation.onSettled = undefined;
    onSettled?.();

    const members = obligation.members.slice();
    obligation.members.length = 0;

    for (const member of members) {
      const held = member.onceObligations;
      if (held !== undefined) {
        const idx = held.indexOf(obligation);
        if (idx >= 0) held.splice(idx, 1);
        if (held.length === 0) {
          member.onceObligations = undefined;
          member.callAfterApply = undefined;
        }
      }

      if (
        !member.isRemoved &&
        member.refCount === 0 &&
        member.onceObligations === undefined
      ) {
        this.dropListener(member);
      }
    }
  }

  /**
   * Takes a listener out of the registry, unconditionally. A listener lives in
   * exactly one bucket: the catch-em-all array, or the named array for its own
   * eventName. A multi-event `on()` creates one EventListener per name, so
   * there is never more than one home to visit.
   */
  private dropListener(listener: EventListener): void {
    if (listener.isCatchEmAll) {
      this.spliceOut(listener.eventName, this.catchEmAllBucket, listener);
    } else {
      const bucket = this.namedBuckets.get(listener.eventName);
      if (bucket) {
        const remaining = this.spliceOut(listener.eventName, bucket, listener);
        if (remaining.length === 0) {
          this.namedBuckets.delete(listener.eventName);
        }
      }
    }

    listener.detach();
  }

  private removeByEventNameAndListenerObject(
    eventName: EventName,
    listenerObject: unknown,
  ): void {
    // '*' is not a key in namedListeners — wildcard listeners live in their own
    // array — so looking there made off(ε, '*', listenerObject) a silent no-op
    // that removed nothing and reported nothing. Every listener in that array
    // carries eventName === '*', so the same filter narrows it exactly as it
    // narrows a named bucket; the array is a fixed member rather than a Map
    // entry, so there is nothing to delete once it empties. Named subscriptions
    // of the same object stay — this is the targeted form, off(ε, listenerObject)
    // is the sweeping one.
    if (isCatchEmAll(eventName)) {
      this.detachByAssociation(
        eventName,
        this.catchEmAllBucket,
        listenerObject,
      );
      return;
    }

    // The event name is known, and the filter checks it anyway — no reason to
    // walk every other bucket. Catch-em-all listeners are not in this one:
    // they live in the array the branch above handles, which is where they
    // have always been and where this path only started looking in v6.0.0.
    const bucket = this.namedBuckets.get(eventName);
    if (!bucket) return;
    const remaining = this.detachByAssociation(
      eventName,
      bucket,
      listenerObject,
    );
    if (remaining.length === 0) {
      this.namedBuckets.delete(eventName);
    }
  }

  /**
   * The identity-based half of `off()` — `off(ε, fn)`, `off(ε, fn, ctx)` and
   * `off(ε, listenerObject)`. There is no reverse index from a listener back
   * to the event names it sits under, so this walks every bucket in
   * `namedListeners` plus the catch-em-all one and asks each "is this
   * listener here?"
   *
   * Two terms, and the first one used to be the whole model:
   *
   * - **once per registered event name**, whether or not the listener is
   *     subscribed under it — one Map lookup into that bucket's index, which
   *     answers `undefined` for every name the listener has nothing to do with;
   * - **once per listener actually removed**, plus the array work that removal
   *     costs: `spliceOut()` finds the position with `indexOf()` and then
   *     splices, so a removal from a bucket of depth d moves O(d) slots in the
   *     worst case and the memory traffic, not the identity test, is what is
   *     left of the old shape.
   *
   * Bucket depth is in that second term and nowhere else, which is the whole
   * change: what a removal *reads* is no longer proportional to how many
   * other listeners share the event name, only what it *moves* is. The claim
   * this replaces — "O(registered event names), roughly 11 ns per name" —
   * modelled the first term alone and predicted ~0.09 ms for a case that
   * measured ~85 ms, three orders of magnitude out, because the scan it was
   * written for read every listener of every name and the model counted only
   * the names. Any successor to it has to keep both terms, whatever happens to
   * the second. See `docs/off.md` for the consumer-facing version of this note,
   * and `DEDUP_INDEX` in `dedupIndex.ts` for the measurements.
   */
  private removeByListener(listener: unknown, listenerObject: unknown): void {
    // Both `typeof` values, because both are listener objects: the set is
    // `ListenerObjectType` in `types.ts` — `object | null | undefined`, which
    // in `typeof` terms is exactly these two. Not `canReadMembers()`, which is
    // a laxer test on the dispatch side and takes any non-nullish value,
    // primitives included: `on(ε, 'foo', 'toFixed', 42)` registers and
    // dispatches, and nothing here or in `off()` will ever remove it by
    // identity. `'object'` alone made `off(ε, Registry)` after
    // `on(ε, 'foo', 'reset', Registry)` the failure this file's other comments
    // call the worse one: nothing removed, nothing reported, the class still
    // held and still firing. `null` cannot arrive here — `remove()` routes a
    // nullish listener to `removeAllListeners()` long before this line.
    const isObjectListener =
      typeof listener === 'object' || typeof listener === 'function';

    this.namedBuckets.forEach((bucket, name) => {
      // Replacing the value of a key the Map is currently iterating is
      // defined behaviour and does not re-visit the entry — which is what
      // lets bucketForMutation() swap a clone in from right here.
      const remaining = this.detachByIdentity(
        name,
        bucket,
        listener,
        listenerObject,
        isObjectListener,
      );
      if (remaining.length === 0) {
        this.namedBuckets.delete(name);
      }
    });

    this.detachByIdentity(
      EVENT_CATCH_EM_ALL,
      this.catchEmAllBucket,
      listener,
      listenerObject,
      isObjectListener,
    );
  }

  removeAllListeners(): void {
    // Nothing registered under a name means nothing to detach — and skipping
    // the walk is also what keeps `clear()` off the shared stand-in, the same
    // shape of guard `EventKeeper.remove()` carries. The Map itself stays: a
    // spec holds the wildcard array across an `off(ε)` and expects the same
    // array back, and emptying one container while releasing the other would
    // be two rules where the truncation exception already states one.
    if (this.namedBuckets.size !== 0) {
      this.namedBuckets.forEach((bucket) => {
        detachAll(bucket);
        // The truncation exception again — see removeByEventName(). The map is
        // cleared right after, so the store lets go of these arrays either way.
        if (bucket[HELD_BY] === 0) {
          bucket.length = 0;
        }
      });
      this.namedBuckets.clear();
    }

    const wildcards = this.catchEmAllBucket;
    // An emitter no `'*'` listener ever reached has nothing here to detach and
    // nothing to truncate — and this is the one place in the class where a
    // removal path can reach a stand-in with a write in hand rather than a
    // lookup. Load-bearing, not tidiness: `detachAll()` clears the index slot
    // unconditionally, and on the frozen stand-in that assignment throws even
    // though it would be writing the `undefined` already sitting there. Taking
    // the guard out turns every `off(ε)` on an emitter without wildcard
    // listeners into a `TypeError` naming the frozen index slot — verified by
    // removing it, across seven suites.
    if (wildcards === EMPTY_CATCH_EM_ALL) return;

    detachAll(wildcards);
    if (wildcards[HELD_BY] !== 0) {
      // A walk is stepping through this array. Hand the store a fresh one
      // instead of truncating the one being iterated; the listeners in the old
      // array are detached, so the walk skips every one of them. Nobody is
      // holding the fresh one, so a later mutation in the same dispatch finds
      // it in place rather than cloning it.
      this.catchEmAllBucket = createBucket();
    } else {
      wildcards.length = 0;
    }
  }

  /**
   * Walks the listeners for `eventName` in dispatch order and hands each one to
   * `fn`, together with `a`, `b` and `c` unchanged — see `WalkCallback` in
   * `walk.ts` for why
   * the context travels as arguments rather than in a closure.
   *
   * The three slots are typed against the callback's own parameters, so passing
   * them in the wrong order is a compile error rather than a listener called
   * with its arguments shuffled. A context-typed callback requires all three —
   * optional slots would let `forEach(eventName, applyListener)` compile and
   * dispatch under `eventName === undefined` three times over. A callback that
   * takes only the listener — every spec in this repo — uses the other overload
   * instead, and needs no context at all.
   */
  forEach(eventName: EventName, fn: (listener: EventListener) => void): void;
  forEach<A, B, C>(
    eventName: EventName,
    fn: (listener: EventListener, a: A, b: B, c: C) => void,
    a: A,
    b: B,
    c: C,
  ): void;
  forEach(
    eventName: EventName,
    fn: WalkCallback,
    a?: any,
    b?: any,
    c?: any,
  ): void {
    // The walk runs over the *live* buckets. Up to v5.1.0 it copied them
    // first, which protected it against a listener subscribing or
    // unsubscribing from inside its own callback — at the price of one
    // allocation per dispatch, mutation or not. Since v6.0.0 the copy sits on
    // the mutating side instead: the walk counts itself into the one or two
    // buckets it steps through, and a mutation of a bucket with a live count
    // clones it and swaps the clone into the store, so the references taken
    // here stay both stable and complete for the duration of the walk. The
    // normal case — nothing mutates — allocates nothing at all, and neither
    // does a mutation of any other bucket.
    const catchEmAllBucket = this.catchEmAllBucket;
    const wildcards =
      catchEmAllBucket.length > 0 ? catchEmAllBucket : undefined;

    // A '*' emit walks the wildcard bucket only, so the named lookup is not
    // even made — and a '*' key in namedListeners (which the public
    // getListenersForEventName('*') can create) is never walked and therefore
    // never held.
    const namedBucket =
      eventName === EVENT_CATCH_EM_ALL
        ? undefined
        : this.namedBuckets.get(eventName);
    const named =
      namedBucket !== undefined && namedBucket.length > 0
        ? namedBucket
        : undefined;

    if (named === undefined) {
      // Nothing to walk is nothing to protect: the empty-emitter path stays
      // free of the bookkeeping and of the try/finally entirely.
      if (wildcards === undefined) return;
      // Counting in, not marking: nested emits over the same bucket each add
      // one, and each takes its own back. A boolean would have the inner walk's
      // exit tell the store the outer one is over.
      wildcards[HELD_BY] += 1;
      try {
        walkBucket(wildcards, fn, a, b, c);
      } finally {
        // From a `finally`, because a listener that throws must not leave a
        // dead walk counted in — every later mutation of that bucket would
        // clone for the rest of its life.
        wildcards[HELD_BY] -= 1;
      }
      return;
    }

    named[HELD_BY] += 1;
    if (wildcards !== undefined) wildcards[HELD_BY] += 1;
    try {
      if (wildcards === undefined) {
        walkBucket(named, fn, a, b, c);
      } else {
        mergeWalk(named, wildcards, fn, a, b, c);
      }
    } finally {
      named[HELD_BY] -= 1;
      if (wildcards !== undefined) wildcards[HELD_BY] -= 1;
    }
  }

  getSubscriptionCount(): number {
    let count = this.catchEmAllBucket.length;
    for (const namedListeners of this.namedBuckets.values()) {
      count += namedListeners.length;
    }
    return count;
  }

  /**
   * Every event name with at least one active listener: the keys of
   * `namedBuckets`, plus `EVENT_CATCH_EM_ALL` if a wildcard listener is
   * registered. Safe against the stand-ins from `namedBuckets` and
   * `catchEmAllBucket`'s own declarations — reading `.keys()` on the frozen
   * empty `Map` and `.length` on the frozen empty bucket materializes
   * neither, the same way `getSubscriptionCount()` above does not.
   *
   * `namedBuckets` never holds a key with an empty bucket: `add()` only
   * reaches `getListenersForEventName()` for a non-wildcard name (`'*'`
   * goes to `mutableCatchEmAllBucket()` instead, see `add()` above), and
   * every place that empties a bucket — `dropListener()`,
   * `removeByEventNameAndListenerObject()`, `removeByEventName()` — deletes
   * the map entry in the same step. No filtering is needed here for that
   * reason; the `getListenersForEventName('*')` impostor-bucket edge is
   * reachable only by calling that method directly, which nothing on the
   * public API path does.
   */
  getSubscribedEventNames(): EventName[] {
    const names: EventName[] = Array.from(this.namedBuckets.keys());
    if (this.catchEmAllBucket.length > 0) {
      names.push(EVENT_CATCH_EM_ALL);
    }
    return names;
  }
}
