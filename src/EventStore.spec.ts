import {createOnceObligation, EventListener} from './EventListener';
import {dedupIndexOf, EventStore} from './EventStore';

import {EVENT_CATCH_EM_ALL} from './constants';
import {emit, eventize, off, on, once} from './index';
import {storeOf} from './__test-utils__/listeners';

// A stand-in listener for the fixtures that only care about bookkeeping, not
// about dispatch. It has to be a *real* listener value: a `null` listener has
// no listener type at all, so the store never treats two of them as similar
// and the refCount-dedup these fixtures exercise would never trigger.
const NOOP = 'noop';

describe('EventStore', () => {
  describe('add()', () => {
    let store: EventStore;

    beforeEach(() => {
      store = new EventStore();
    });

    it('adding a named listener adds the listener to namedListeners store', () => {
      expect(store.namedListeners.get('a')).toBe(undefined);
      store.add(new EventListener('a', 0, NOOP));
      expect(store.namedListeners.get('a')).toHaveLength(1);
      expect(store.getSubscriptionCount()).toBe(1);
    });

    it('adding a catch-em-all listener adds the listener to the catchEmAllListeners array', () => {
      expect(store.catchEmAllListeners).toHaveLength(0);
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, NOOP));
      expect(store.catchEmAllListeners).toHaveLength(1);
      expect(store.getSubscriptionCount()).toBe(1);
    });
  });

  describe('without previously added catch-em-all listeners', () => {
    const store = new EventStore();
    const origListener = [
      new EventListener('a', -7, NOOP),
      new EventListener('a', 0, NOOP),
      new EventListener('a', 666, NOOP),
      new EventListener('b', 0, NOOP),
      new EventListener('a', 0, NOOP), // similar to [1] — deduped into it
    ].map((listener) => store.add(listener));

    it('catchEmAllListeners store should be empty', () => {
      expect(store.catchEmAllListeners).toHaveLength(0);
    });

    it('forEach() calls the listener listener in highest-priority-and-id-comes-first order for all listeners for the given event name', () => {
      const listeners: Array<EventListener> = [];
      store.forEach('a', (listener) => listeners.push(listener));
      expect(listeners).toHaveLength(3);
      expect(listeners).toEqual([
        origListener[2], // a, 666
        origListener[1], // a, 0
        origListener[0], // a, -7
      ]);
    });
  });

  describe('without previously added named listeners', () => {
    const store = new EventStore();
    const origListener = [
      new EventListener(EVENT_CATCH_EM_ALL, -7, NOOP),
      new EventListener(EVENT_CATCH_EM_ALL, 0, NOOP),
      new EventListener(EVENT_CATCH_EM_ALL, 666, NOOP),
      new EventListener(EVENT_CATCH_EM_ALL, 0, NOOP), // similar to [1]
    ].map((listener) => store.add(listener));

    it('catchEmAllListeners should not be empty', () => {
      expect(store.catchEmAllListeners).toHaveLength(3);
    });

    it('forEach() calls the listener listener in highest-priority-and-id-comes-first order for all catch-em-all listeners', () => {
      const listeners: Array<EventListener> = [];
      store.forEach('foo', (listener) => listeners.push(listener));
      expect(listeners).toHaveLength(3);
      expect(listeners).toEqual([
        origListener[2],
        origListener[1],
        origListener[0],
      ]);
    });
  });

  describe('namedListeners memory cleanup', () => {
    it('removing the last listener for an event name deletes the map entry (release())', () => {
      const store = new EventStore();
      const listener = store.add(new EventListener('foo', 0, () => {}));
      expect(store.namedListeners.has('foo')).toBe(true);

      store.release(listener);

      expect(store.namedListeners.has('foo')).toBe(false);
      expect(store.namedListeners.size).toBe(0);
    });

    it('removing all listeners for an event name deletes the map entry (off by name)', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 0, () => {}));
      store.add(new EventListener('foo', 0, () => {}));
      expect(store.namedListeners.has('foo')).toBe(true);

      store.remove('foo', null);

      expect(store.namedListeners.has('foo')).toBe(false);
      expect(store.namedListeners.size).toBe(0);
    });

    it('removing by listener function cleans empty map entries (off by fn)', () => {
      const store = new EventStore();
      const fn = () => {};
      store.add(new EventListener('foo', 0, fn));
      store.add(new EventListener('bar', 0, () => {}));

      store.remove(fn, null);

      expect(store.namedListeners.has('foo')).toBe(false);
      expect(store.namedListeners.has('bar')).toBe(true);
      expect(store.namedListeners.size).toBe(1);
    });

    it('removing similar listeners cleans empty map entries (off by name+obj)', () => {
      const store = new EventStore();
      const obj = {};
      store.add(new EventListener('foo', 0, obj));

      store.remove('foo', obj, true);

      expect(store.namedListeners.has('foo')).toBe(false);
      expect(store.namedListeners.size).toBe(0);
    });

    it('does not leak with many unique event names (1000 add/remove cycles)', () => {
      const store = new EventStore();
      for (let i = 0; i < 1000; i++) {
        const name = `event-${i}`;
        const listener = store.add(new EventListener(name, 0, () => {}));
        store.release(listener);
      }
      expect(store.namedListeners.size).toBe(0);
      expect(store.getSubscriptionCount()).toBe(0);
    });
  });

  // peekListeners() is the read-only counterpart to getListenersForEventName():
  // same data for a name that already has a bucket, no side effect for one
  // that doesn't. The two promises worth pinning are exactly the two things
  // that make it worth having a second method at all — see AGENTS.md.
  describe('peekListeners()', () => {
    it('creates no bucket and no map entry for an unknown event name', () => {
      const store = new EventStore();
      expect(store.namedListeners.has('foo')).toBe(false);

      const result = store.peekListeners('foo');

      expect(result).toHaveLength(0);
      // Unlike getListenersForEventName('foo'), which would have set this —
      // that contrast is the whole point of this method existing.
      expect(store.namedListeners.has('foo')).toBe(false);
      expect(store.namedListeners.size).toBe(0);
    });

    it('creates no map entry across repeated misses on different names', () => {
      const store = new EventStore();
      store.peekListeners('a');
      store.peekListeners('b');
      store.peekListeners('c');
      expect(store.namedListeners.size).toBe(0);
    });

    it('answers every unknown name with the same frozen, empty array', () => {
      const store = new EventStore();
      const a = store.peekListeners('a');
      const b = store.peekListeners('unrelated-name');

      // Shared, not one allocation per miss.
      expect(a).toBe(b);
      expect(a).toHaveLength(0);
      // Frozen, not just typed ReadonlyArray: this array is shared across
      // every unknown name, so a caller reaching past the type with a cast
      // must not be able to corrupt every other name's empty answer too.
      expect(Object.isFrozen(a)).toBe(true);
      expect(() =>
        (a as EventListener[]).push(new EventListener('a', 0, () => {})),
      ).toThrow();
    });

    it('reads the live bucket once one exists, by reference — not a copy', () => {
      const store = new EventStore();
      const listener = store.add(new EventListener('foo', 0, () => {}));

      const result = store.peekListeners('foo');

      // Identity and length, not toEqual() — the live bucket carries the
      // HELD_BY symbol a plain array literal doesn't, and toEqual() compares
      // own enumerable symbols too. See AGENTS.md, "compare buckets by
      // identity and length".
      expect(result).toBe(store.namedListeners.get('foo'));
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(listener);
    });

    it("reads the wildcard bucket for '*', the same special case listenersOf() makes", () => {
      const store = new EventStore();
      const wildcard = store.add(
        new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}),
      );

      const result = store.peekListeners(EVENT_CATCH_EM_ALL);

      expect(result).toBe(store.catchEmAllListeners);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(wildcard);
    });

    // The impostor-bucket case above (in the clone-on-mutate block) shows
    // getListenersForEventName('*') creating a '*' key in namedListeners that
    // forEach() never walks. peekListeners('*') must not do that: it answers
    // from catchEmAllBucket instead, so the no-map-entry promise has to hold
    // for '*' too, not just for an ordinary unknown name. A naive refactor
    // that routed peekListeners() through getListenersForEventName() for '*'
    // fails here in addition to the wildcard-identity case above, and is the
    // only case that catches the map-entry side of it.
    it("leaves namedListeners without a '*' key, unlike getListenersForEventName('*')", () => {
      const store = new EventStore();
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}));
      expect(store.namedListeners.has(EVENT_CATCH_EM_ALL)).toBe(false);

      store.peekListeners(EVENT_CATCH_EM_ALL);

      expect(store.namedListeners.has(EVENT_CATCH_EM_ALL)).toBe(false);
    });

    it('refuses mutation through its declared type — reaching the live array needs a cast', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 0, () => {}));
      const result = store.peekListeners('foo');

      // @ts-expect-error ReadonlyArray<EventListener> has no push(): the
      // no-mutation promise is enforced by the compiler, not by a runtime
      // copy — this line is the proof. If the return type ever widens back
      // to a mutable array, this directive itself starts failing typecheck.
      // It also actually mutates the live store bucket, past
      // bucketForMutation() and every clone-on-mutate protection — visible
      // below, not left silent: this is the exact operation AGENTS.md
      // forbids for anything that isn't the store's own internals.
      result.push(new EventListener('foo', 0, () => {}));

      expect(store.namedListeners.get('foo')).toHaveLength(2);
    });
  });

  describe('insertion order with mixed priorities', () => {
    it('keeps listeners sorted by descending priority then ascending id, regardless of insertion order', () => {
      const store = new EventStore();
      // priorities chosen so that insertion order != sort order
      const priorities = [0, 100, -50, 50, 0, 25, 100, -10, 75, 0];
      const added = priorities.map((p, idx) =>
        store.add(new EventListener('e', p, `L${idx}`)),
      );

      const seen: EventListener[] = [];
      store.forEach('e', (l) => seen.push(l));

      const sorted = [...added].sort((a, b) =>
        a.priority !== b.priority ? b.priority - a.priority : a.id - b.id,
      );
      expect(seen).toEqual(sorted);
    });

    it('keeps insertion stable for equal-priority listeners (FIFO by id)', () => {
      const store = new EventStore();
      const listeners = Array.from({length: 20}, (_, i) =>
        store.add(new EventListener('e', 0, `L${i}`)),
      );
      const seen: EventListener[] = [];
      store.forEach('e', (l) => seen.push(l));
      expect(seen).toEqual(listeners);
    });
  });

  describe('with named and catch-em-all listeners', () => {
    const store = new EventStore();
    [
      new EventListener('a', -7, '0'),
      new EventListener(EVENT_CATCH_EM_ALL, 100, '1'),
      new EventListener('a', 0, '2'),
      new EventListener(EVENT_CATCH_EM_ALL, 666, '3'),
      new EventListener('a', 666, '4'),
      new EventListener(EVENT_CATCH_EM_ALL, 0, '5'),
      new EventListener('b', 0, '6'),
      new EventListener(EVENT_CATCH_EM_ALL, -3, '7'),
      new EventListener('a', 0, '8'),
    ].forEach((listener) => store.add(listener));

    it('forEach() calls the listener in highest-priority-and-id-comes-first order for all listeners', () => {
      const listeners: Array<EventListener> = [];
      store.forEach('a', (listener) => listeners.push(listener));
      expect(listeners).toHaveLength(8);
      expect(listeners.map((h) => h.listener)).toEqual([
        '4',
        '3',
        '1',
        '2',
        '8',
        '5',
        '7',
        '0',
      ]);
    });
  });

  // "Equal priorities keep insertion order" holds only within a bucket.
  // sortByPriorityAndId breaks a priority tie on id, but it only ever
  // compares listeners of the same kind (findInsertIndex is always called
  // against one bucket). The merge in forEach() that interleaves a named
  // bucket with catchEmAllListeners compares priority alone
  // (`cur.priority >= other.priority`) and never looks at id, so at equal
  // priority the named listener always runs first — independent of
  // registration order. This is a documented scope limit, not something to
  // fix here: see AGENTS.md "Known asymmetries" and
  // skills/using-eventize/references/api-details.md, "`Priority` values". Both
  // registration directions are pinned below, but neither closes a gap: the
  // wildcard-first direction was already exercised implicitly by the
  // mixed-priority fixture above ('with named and catch-em-all listeners' —
  // wildcard '5' registered before named '8', both at priority 0, expects
  // '8' before '5'). These two cases give that pin its own name and add the
  // reverse direction next to it, instead of leaving the asymmetry buried in
  // a fixture built for something else.
  describe('equal-priority merge across the named/wildcard split favors the named listener', () => {
    it('runs the named listener first when the wildcard was registered first', () => {
      const store = new EventStore();
      const wildcard = store.add(
        new EventListener(EVENT_CATCH_EM_ALL, 0, 'wildcard'),
      );
      const named = store.add(new EventListener('e', 0, 'named'));

      const seen: EventListener[] = [];
      store.forEach('e', (l) => seen.push(l));

      // Registration order was wildcard, then named — the id-ordered
      // insertion order would replay the wildcard first. The merge ignores
      // id across the bucket boundary, so the named listener wins the tie
      // instead, contradicting registration order.
      expect(seen).toEqual([named, wildcard]);
    });

    it('runs the named listener first when the named listener was registered first', () => {
      const store = new EventStore();
      const named = store.add(new EventListener('e', 0, 'named'));
      const wildcard = store.add(
        new EventListener(EVENT_CATCH_EM_ALL, 0, 'wildcard'),
      );

      const seen: EventListener[] = [];
      store.forEach('e', (l) => seen.push(l));

      // Same outcome as above, but this time it agrees with registration
      // order — which is what makes the guarantee look bucket-spanning when
      // only this direction is exercised.
      expect(seen).toEqual([named, wildcard]);
    });
  });

  describe('removal addresses the bucket directly', () => {
    it('removes a named listener without scanning other buckets', () => {
      const store = new EventStore();
      for (let i = 0; i < 100; i++) {
        store.add(new EventListener(`other-${i}`, 0, () => {}));
      }
      const target = store.add(new EventListener('target', 0, () => {}));
      expect(store.namedListeners.size).toBe(101);

      store.release(target);

      expect(store.namedListeners.has('target')).toBe(false);
      expect(store.namedListeners.size).toBe(100);
      expect(store.getSubscriptionCount()).toBe(100);
    });

    it('removes a catch-em-all listener', () => {
      const store = new EventStore();
      const target = store.add(
        new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}),
      );
      store.add(new EventListener('named', 0, () => {}));

      store.release(target);

      expect(store.catchEmAllListeners).toHaveLength(0);
      expect(store.getSubscriptionCount()).toBe(1);
    });

    it('removes by event name and listener object without touching other names', () => {
      const store = new EventStore();
      const listenerObject = {};
      store.add(new EventListener('foo', 0, listenerObject));
      store.add(new EventListener('bar', 0, listenerObject));

      store.remove('foo', listenerObject, true);

      expect(store.namedListeners.has('foo')).toBe(false);
      expect(store.namedListeners.has('bar')).toBe(true);
      expect(store.getSubscriptionCount()).toBe(1);
    });

    it('aggregates a once() obligation onto a similar listener', () => {
      const store = new EventStore();
      const listenerObject = {};
      const first = store.add(new EventListener('foo', 0, listenerObject));
      const obligation = createOnceObligation();
      // what once() passes: the identity is already registered, so the
      // obligation joins it instead of inserting a second listener
      const second = store.add(
        new EventListener('foo', 0, listenerObject),
        obligation,
      );

      expect(second).toBe(first);
      expect(first.refCount).toBe(1);
      expect(first.onceObligations).toEqual([obligation]);
      expect(obligation.members).toEqual([first]);
      expect(store.getSubscriptionCount()).toBe(1);

      store.releaseObligation(obligation);
      expect(store.getSubscriptionCount()).toBe(1);
      store.release(first);
      expect(store.getSubscriptionCount()).toBe(0);
    });

    it('releasing an already-settled obligation is a no-op', () => {
      const store = new EventStore();
      const listenerObject = {};
      const obligation = createOnceObligation();
      const listener = store.add(
        new EventListener('foo', 0, listenerObject),
        obligation,
      );
      store.add(new EventListener('foo', 0, listenerObject));

      store.settleOneShots(listener, obligation.sequence + 1);
      expect(obligation.settled).toBe(true);
      expect(listener.onceObligations).toBe(undefined);

      // A handle calling in after its obligation was already discharged by a
      // dispatch — the shape that, under the old counter model, needed a
      // generation check to keep from decrementing a count that had moved on
      // to a later registration. `settled` makes the same guarantee directly:
      // there is no count to miscount, only a flag that is already true.
      store.releaseObligation(obligation);

      expect(listener.refCount).toBe(1);
      expect(store.getSubscriptionCount()).toBe(1);
    });

    it('settleOneShots() is a no-op for a listener with no pending obligations', () => {
      const store = new EventStore();
      const listener = store.add(new EventListener('foo', 0, {}));

      expect(() => store.settleOneShots(listener, 0)).not.toThrow();

      expect(listener.refCount).toBe(1);
      expect(store.getSubscriptionCount()).toBe(1);
    });

    it('settleOneShots() leaves an obligation created after the watermark untouched', () => {
      const store = new EventStore();
      const listenerObject = {};
      const before = createOnceObligation();
      const listener = store.add(
        new EventListener('foo', 0, listenerObject),
        before,
      );
      // The watermark a dispatch would have captured right here — before
      // anything re-subscribes. `reArmed` is created after it on purpose,
      // simulating a once() that re-subscribed itself from inside its own
      // dispatch: it shares the listener's onceObligations array, but not
      // this watermark.
      const watermark = before.sequence + 1;
      const reArmed = createOnceObligation();
      store.add(new EventListener('foo', 0, listenerObject), reArmed);

      store.settleOneShots(listener, watermark);

      expect(before.settled).toBe(true);
      expect(reArmed.settled).toBe(false);
      expect(listener.onceObligations).toEqual([reArmed]);
      expect(store.getSubscriptionCount()).toBe(1);
    });

    // Position cannot substitute for the watermark check above: if a listener
    // holds an *older* obligation that ends up sitting after a *newer* one in
    // `onceObligations` — exactly what a mid-array release or force-removal
    // produces — a position-based cutoff would settle the wrong one. Ordering
    // it deliberately out of sequence is what makes this case different from
    // the one above rather than a duplicate of it.
    it('settleOneShots() finds a qualifying obligation regardless of its position in the array', () => {
      const store = new EventStore();
      const listenerObject = {};
      const older = createOnceObligation();
      const newer = createOnceObligation();
      const listener = store.add(new EventListener('foo', 0, listenerObject));
      // Built out of registration order on purpose: `newer` occupies index 0,
      // `older` index 1 — the reverse of creation order.
      listener.onceObligations = [newer, older];
      newer.members.push(listener);
      older.members.push(listener);

      store.settleOneShots(listener, older.sequence + 1);

      expect(older.settled).toBe(true);
      expect(newer.settled).toBe(false);
      expect(listener.onceObligations).toEqual([newer]);
    });

    // The four cases below construct states EventStore.add() never actually
    // produces — it always pairs a listener's onceObligations entry with the
    // matching obligation.members entry, on both sides, in the same call. What
    // they pin is dischargeObligation()'s and detach()'s own half of that
    // pairing: neither trusts the other side of a relationship it did not
    // just create, the same caution EventStore.spec.ts already applies to a
    // holey bucket.
    describe('mismatched obligation bookkeeping is tolerated, not trusted', () => {
      it('settleOneShots() skips an obligation that is already settled', () => {
        const store = new EventStore();
        const obligation = createOnceObligation();
        obligation.settled = true;
        const listener = new EventListener('foo', 0, {});
        listener.onceObligations = [obligation];
        store.add(listener);

        expect(() =>
          store.settleOneShots(listener, obligation.sequence + 1),
        ).not.toThrow();
        // Left exactly as found: skipping a settled obligation must not
        // silently clear it from a listener that was never actually
        // discharged for it.
        expect(listener.onceObligations).toEqual([obligation]);
      });

      it('releaseObligation() tolerates a member with no obligations of its own', () => {
        const store = new EventStore();
        const persistentOnly = store.add(new EventListener('foo', 0, {}));
        const obligation = {
          ...createOnceObligation(),
          members: [persistentOnly],
        };

        expect(() => store.releaseObligation(obligation)).not.toThrow();

        expect(obligation.settled).toBe(true);
        expect(persistentOnly.refCount).toBe(1);
        expect(store.getSubscriptionCount()).toBe(1);
      });

      it('releaseObligation() tolerates a member whose obligations list a different one', () => {
        const store = new EventStore();
        const listener = store.add(new EventListener('foo', 0, {}));
        const otherObligation = createOnceObligation();
        listener.onceObligations = [otherObligation];
        const obligation = {...createOnceObligation(), members: [listener]};

        expect(() => store.releaseObligation(obligation)).not.toThrow();

        // The mismatch is left alone rather than corrupting the unrelated
        // obligation the listener actually holds.
        expect(listener.onceObligations).toEqual([otherObligation]);
        expect(store.getSubscriptionCount()).toBe(1);
      });
    });

    it('honours refCount before removing anything', () => {
      const store = new EventStore();
      const listenerObject = {};
      const first = store.add(new EventListener('foo', 0, listenerObject));
      const second = store.add(new EventListener('foo', 0, listenerObject));
      expect(second).toBe(first);
      expect(first.refCount).toBe(2);

      store.release(first);
      expect(store.getSubscriptionCount()).toBe(1);

      store.release(first);
      expect(store.getSubscriptionCount()).toBe(0);
    });

    it('ignores an event name with no bucket', () => {
      const store = new EventStore();
      const listenerObject = {};
      store.add(new EventListener('foo', 0, listenerObject));

      store.remove('never-subscribed', listenerObject, true);

      expect(store.getSubscriptionCount()).toBe(1);
    });

    // remove() no longer special-cases an EventListener instance at all — that
    // branch is gone along with removeByEventListener(), and a handle now
    // gives its registration back through release() instead. What is left is
    // the generic identity comparison every unrecognized object hits: a
    // foreign listener never equals anything in another store's buckets, in
    // its own store's namedListeners entry, or in the catch-em-all bucket, so
    // remove() harmlessly matches nothing.
    it('a foreign EventListener instance never matches by identity', () => {
      const a = new EventStore();
      const b = new EventStore();
      const target = a.add(new EventListener('foo', 0, () => {}));
      b.add(new EventListener('foo', 0, () => {})); // same name, different instance

      expect(() => b.remove(target, null)).not.toThrow();
      expect(b.getSubscriptionCount()).toBe(1);
      expect(a.getSubscriptionCount()).toBe(1);
    });

    // release() takes the caller's word for which store a listener belongs
    // to — it has no way to check. Pins the same pre-existing quirk the
    // instanceof-EventListener branch of remove() used to reach: a foreign
    // listener is detach()ed and its own count decremented, while it stays put
    // in its own store's bucket. dropListener() still has to visit *this*
    // store's bucket for the name (or the absence of one) without throwing.
    it('releasing a foreign listener detaches it without touching this store’s bucket for that name', () => {
      const a = new EventStore();
      const b = new EventStore();
      const target = a.add(new EventListener('foo', 0, () => {}));
      b.add(new EventListener('foo', 0, () => {})); // same name, different instance, own bucket

      expect(() => b.release(target)).not.toThrow();

      expect(target.isRemoved).toBe(true);
      expect(a.getSubscriptionCount()).toBe(1);
      expect(b.getSubscriptionCount()).toBe(1);
    });

    it('releasing a foreign listener whose event name has no bucket here does not throw', () => {
      const a = new EventStore();
      const b = new EventStore();
      const target = a.add(new EventListener('foo', 0, () => {}));

      expect(() => b.release(target)).not.toThrow();

      expect(target.isRemoved).toBe(true);
      expect(a.getSubscriptionCount()).toBe(1);
    });
  });

  // Up to v5.1.0 forEach() protected its walk by copying the bucket
  // before every dispatch — one allocation per emit, whether or not anything
  // mutated. Since v6.0.0 the copy moved to the mutating side: a walk declares
  // the one or two arrays it is stepping through, and a path that changes one
  // of *those* clones it, swaps the clone into the store and leaves the walk
  // holding the old array. Everything else in the store — every bucket no walk
  // is holding — changes in place, whether or not a dispatch is running.
  // Bucket identity is the only externally visible trace of that; every other
  // spec in this repo asserts dispatch behaviour, which the rewrite leaves
  // untouched by construction. Without these cases the whole thing is
  // invisible and the next refactor puts the copy back.
  describe('clone-on-mutate: a bucket is copied only when a dispatch mutates it', () => {
    it('reuses the named bucket across a dispatch that mutates nothing', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 0, () => {}));
      const before = store.namedListeners.get('foo');

      store.forEach('foo', () => {});
      store.forEach('foo', () => {});

      expect(store.namedListeners.get('foo')).toBe(before);
    });

    it('reuses the wildcard bucket across a dispatch that mutates nothing', () => {
      const store = new EventStore();
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}));
      const before = store.catchEmAllListeners;

      store.forEach('foo', () => {});

      expect(store.catchEmAllListeners).toBe(before);
    });

    it('reuses both buckets across a mutation-free merge dispatch', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 0, () => {}));
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}));
      const beforeNamed = store.namedListeners.get('foo');
      const beforeWildcard = store.catchEmAllListeners;

      const seen: EventListener[] = [];
      store.forEach('foo', (l) => seen.push(l));

      expect(seen).toHaveLength(2);
      expect(store.namedListeners.get('foo')).toBe(beforeNamed);
      expect(store.catchEmAllListeners).toBe(beforeWildcard);
    });

    it('replaces the named bucket when a listener subscribes mid-dispatch', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 10, () => {}));
      const before = store.namedListeners.get('foo');

      store.forEach('foo', () => {
        store.add(new EventListener('foo', 5, () => {}));
      });

      const after = store.namedListeners.get('foo');
      expect(after).not.toBe(before);
      // The walk kept the array it started on — which is exactly why the
      // listener added mid-dispatch does not run in the current emit.
      expect(before).toHaveLength(1);
      expect(after).toHaveLength(2);
    });

    it('replaces the named bucket when a listener unsubscribes mid-dispatch', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 10, () => {}));
      const doomed = store.add(new EventListener('foo', 5, () => {}));
      const before = store.namedListeners.get('foo');

      let dispatched = 0;
      store.forEach('foo', () => {
        dispatched += 1;
        store.release(doomed);
      });

      const after = store.namedListeners.get('foo');
      expect(after).not.toBe(before);
      expect(before).toHaveLength(2);
      expect(after).toHaveLength(1);
      // Both entries of the old array are still walked; `doomed` is skipped by
      // EventListener.apply()'s isRemoved check, not by the array shrinking.
      expect(dispatched).toBe(2);
    });

    it('replaces the wildcard bucket when a wildcard listener unsubscribes mid-dispatch', () => {
      const store = new EventStore();
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 10, () => {}));
      const doomed = store.add(
        new EventListener(EVENT_CATCH_EM_ALL, 5, () => {}),
      );
      const before = store.catchEmAllListeners;

      store.forEach('foo', () => {
        store.release(doomed);
      });

      expect(store.catchEmAllListeners).not.toBe(before);
      expect(before).toHaveLength(2);
      expect(store.catchEmAllListeners).toHaveLength(1);
    });

    it('replaces both buckets when everything is removed mid-dispatch', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 10, () => {}));
      store.add(new EventListener('foo', 5, () => {}));
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 7, () => {}));
      const beforeNamed = store.namedListeners.get('foo');
      const beforeWildcard = store.catchEmAllListeners;

      store.forEach('foo', () => {
        store.remove(null, null); // off(ε)
      });

      expect(store.getSubscriptionCount()).toBe(0);
      // The named entry is gone from the map entirely; the wildcard array is a
      // fixed member, so it is swapped for a fresh one instead of truncated.
      expect(store.namedListeners.has('foo')).toBe(false);
      expect(store.catchEmAllListeners).not.toBe(beforeWildcard);
      // Neither of the arrays the walk is holding was truncated under it.
      expect(beforeNamed).toHaveLength(2);
      expect(beforeWildcard).toHaveLength(1);
    });

    // The cases above only say *that* the bucket was replaced. The ones below
    // say how often, and for which buckets — which is the whole difference
    // between clone-on-mutate and a version of the copy it replaced that is
    // merely rearranged, or quadratic. n mutations in one dispatch must cost
    // one clone, not n; and k *other* buckets touched by that dispatch must
    // cost nothing at all. Without these, a store that clones per mutation, or
    // one that clones every bucket it touches while any walk is running,
    // passes every other spec in this repo.
    it('clones a bucket once per walk, not once per mutation', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 10, () => {}));
      const before = store.namedListeners.get('foo');

      let afterFirst: EventListener[] | undefined;
      store.forEach('foo', () => {
        store.add(new EventListener('foo', 5, () => {}));
        afterFirst = store.namedListeners.get('foo');
        store.add(new EventListener('foo', 4, () => {}));
        store.add(new EventListener('foo', 3, () => {}));
      });

      expect(afterFirst).not.toBe(before);
      // The second and third mutation land in the clone the first one made —
      // no running walk is holding it, so there is nothing to protect.
      expect(store.namedListeners.get('foo')).toBe(afterFirst);
      expect(before).toHaveLength(1);
      expect(afterFirst).toHaveLength(4);
    });

    it('clones again once a nested walk has taken the clone over', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 10, () => {}));
      const original = store.namedListeners.get('foo');

      let outerClone: EventListener[] | undefined;
      let innerClone: EventListener[] | undefined;
      store.forEach('foo', () => {
        store.add(new EventListener('foo', 5, () => {}));
        outerClone = store.namedListeners.get('foo');
        store.forEach('foo', () => {
          // This nested walk started *after* the clone was installed, so it is
          // holding it and the clone is no longer free to change.
          store.add(new EventListener('foo', 4, () => {}));
          innerClone = store.namedListeners.get('foo');
        });
      });

      expect(outerClone).not.toBe(original);
      expect(innerClone).not.toBe(outerClone);
      expect(outerClone).toHaveLength(2);
    });

    // A clone is free to change only until some walk picks it up. Both nested
    // walks below run at the same nesting depth and inside the same dispatch
    // tree, so anything that decides "this array is safe" from the depth it
    // was created at, or from "the store made it during this dispatch", hands
    // the second walk an array it is itself stepping through.
    it('clones again for a second nested walk over the first one’s clone', () => {
      const store = new EventStore();
      store.add(new EventListener('outer', 0, () => {}));
      store.add(new EventListener('inner', 0, () => {}));

      let firstClone: EventListener[] | undefined;
      let secondClone: EventListener[] | undefined;
      store.forEach('outer', () => {
        store.forEach('inner', () => {
          store.add(new EventListener('inner', -1, () => {}));
          firstClone = store.namedListeners.get('inner');
        });
        // The first nested walk is over; this one is new, and it grabs the
        // clone that walk left behind.
        store.forEach('inner', () => {
          store.add(new EventListener('inner', -2, () => {}));
          secondClone = store.namedListeners.get('inner');
        });
      });

      expect(firstClone).not.toBe(secondClone);
      // Untouched by the second walk's mutations — which is the point.
      expect(firstClone).toHaveLength(2);
      // The second walk runs over those two entries, so it mutates twice: the
      // first add clones, the second lands in that clone.
      expect(secondClone).toHaveLength(4);
    });

    it('clones each of the two buckets it walks at most once', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 10, () => {}));
      const namedDoomed = store.add(new EventListener('foo', 5, () => {}));
      const wildcardDoomed = store.add(
        new EventListener(EVENT_CATCH_EM_ALL, 7, () => {}),
      );

      let step = 0;
      let namedAfterFirst: EventListener[] | undefined;
      // Dispatch order: named@10, wildcard@7, named@5 — one mutation each, and
      // the third one returns to the bucket the first one cloned.
      store.forEach('foo', () => {
        step += 1;
        if (step === 1) {
          store.release(namedDoomed);
          namedAfterFirst = store.namedListeners.get('foo');
        } else if (step === 2) {
          store.release(wildcardDoomed);
        } else {
          store.add(new EventListener('foo', 1, () => {}));
        }
      });

      expect(step).toBe(3);
      // The wildcard bucket cloned in between must not have displaced what the
      // store knows about the named one — otherwise the third mutation clones
      // a second time and the per-walk bound only holds for one bucket at a
      // time.
      expect(store.namedListeners.get('foo')).toBe(namedAfterFirst);
    });

    // The other half of the bound, and the one this design was nearly lost on:
    // a walk holds its own two arrays and nothing else, so every other bucket a
    // dispatch touches changes in place. A store that copies whichever bucket
    // it is about to change "because a dispatch is running" pays one copy per
    // *mutated* bucket instead of one per *walked* bucket — and off(ε, obj)
    // from a teardown listener, the documented cleanup form, walks the lot.
    it('does not clone a bucket no walk is holding', () => {
      const store = new EventStore();
      const context = {};
      store.add(new EventListener('go', 0, () => {}));
      for (const name of ['a', 'b', 'c']) {
        store.add(new EventListener(name, 0, NOOP, context));
      }
      const before = {
        go: store.namedListeners.get('go'),
        a: store.namedListeners.get('a'),
        b: store.namedListeners.get('b'),
        c: store.namedListeners.get('c'),
      };

      store.forEach('go', () => {
        store.remove(context, null);
      });

      // 'a', 'b' and 'c' emptied in place — the arrays captured above are the
      // ones that were spliced. A clone would have left each of them holding
      // its listener and moved the emptying into a copy nobody can see.
      expect(before.a).toHaveLength(0);
      expect(before.b).toHaveLength(0);
      expect(before.c).toHaveLength(0);
      expect(store.namedListeners.has('a')).toBe(false);
      // 'go' is the bucket the walk is stepping through, so that one *is*
      // cloned — the removal must not shrink it under the running walk.
      expect(before.go).toHaveLength(1);
    });

    it('does not clone anything when a dispatch only subscribes to other events', () => {
      const store = new EventStore();
      store.add(new EventListener('go', 0, () => {}));
      const names = ['n0', 'n1', 'n2', 'n3', 'n4'];
      for (const name of names) store.add(new EventListener(name, 0, () => {}));
      const before = names.map((n) => store.namedListeners.get(n));

      store.forEach('go', () => {
        for (const name of names) {
          store.add(new EventListener(name, -1, () => {}));
        }
      });

      names.forEach((name, i) => {
        expect(store.namedListeners.get(name)).toBe(before[i]);
        expect(before[i]).toHaveLength(2);
      });
    });

    // Nesting is not a stack of one: the enclosing walks are still stepping
    // through their own arrays, and a mutation from the innermost callback has
    // to answer for all of them. An implementation that only remembers the
    // innermost walk's two buckets splices `outer` under the walk that is
    // reading it.
    it('clones an enclosing walk’s bucket when a nested walk mutates it', () => {
      const store = new EventStore();
      store.add(new EventListener('outer', 10, () => {}));
      const doomed = store.add(new EventListener('outer', 5, () => {}));
      store.add(new EventListener('inner', 0, () => {}));
      const before = store.namedListeners.get('outer');

      let dispatched = 0;
      let step = 0;
      store.forEach('outer', () => {
        dispatched += 1;
        if (++step > 1) return;
        store.forEach('inner', () => {
          store.release(doomed);
        });
      });

      expect(store.namedListeners.get('outer')).not.toBe(before);
      expect(before).toHaveLength(2);
      // Both entries of the array the outer walk started on are still visited;
      // `doomed` is skipped by EventListener.apply()'s isRemoved check.
      expect(dispatched).toBe(2);
    });

    // An empty bucket is not walked, so no walk holds it and a mid-dispatch
    // subscription goes straight in. The dispatch still does not see the new
    // listener — forEach() never looks at that array again — and the emitter
    // is spared a copy of an array with nothing in it.
    it('does not clone an empty wildcard bucket the walk skipped', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 0, () => {}));
      const before = store.catchEmAllListeners;
      const seen: EventListener[] = [];

      store.forEach('foo', (l) => {
        seen.push(l);
        store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}));
      });

      expect(seen).toHaveLength(1);
      expect(store.catchEmAllListeners).toBe(before);
      expect(before).toHaveLength(1);
    });

    // Held-ness rides on the bucket, so a bucket has to carry it from the
    // moment it exists. An array that reaches the registry without the field
    // reads as held — `undefined === 0` is false — and buys itself one copy it
    // does not owe, which then installs a well-formed clone and hides the
    // mistake for good. Both places a bucket is born from nothing are checked
    // here; the third, the clone in bucketForMutation(), is covered by the
    // copy-count cases above, which go red three at a time without it.
    it('mutates a freshly created bucket in place — no dispatch, no copy', () => {
      const store = new EventStore();

      const named = store.getListenersForEventName('foo');
      store.add(new EventListener('foo', 0, () => {}));
      expect(store.namedListeners.get('foo')).toBe(named);

      const wildcards = store.catchEmAllListeners;
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}));
      expect(store.catchEmAllListeners).toBe(wildcards);
    });

    it('mutates the wildcard bucket a mid-dispatch off(ε) installed in place', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 0, () => {}));
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}));

      let step = 0;
      let fresh: Array<EventListener> | undefined;
      store.forEach('foo', () => {
        if (++step > 1) return;
        store.remove(null, null); // off(ε) — hands the store a fresh bucket
        fresh = store.catchEmAllListeners;
        store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}));
      });

      expect(fresh).not.toBe(undefined);
      expect(store.catchEmAllListeners).toBe(fresh);
      expect(fresh).toHaveLength(1);
    });

    // Held-ness is a count on the bucket, not a mark. Both walks below are
    // stepping through the same array, so the inner one's exit takes back its
    // own claim and no more — anything that clears the state outright hands
    // the mutation an array the outer walk is still reading.
    it('still clones after a nested walk over the same bucket has returned', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 10, () => {}));
      const before = store.namedListeners.get('foo');

      let step = 0;
      store.forEach('foo', () => {
        if (++step > 1) return;
        store.forEach('foo', () => {});
        store.add(new EventListener('foo', 5, () => {}));
      });

      expect(store.namedListeners.get('foo')).not.toBe(before);
      expect(before).toHaveLength(1);
      expect(store.namedListeners.get('foo')).toHaveLength(2);
    });

    it('still clones after a nested dispatch has returned', () => {
      const store = new EventStore();
      store.add(new EventListener('outer', 0, () => {}));
      store.add(new EventListener('inner', 0, () => {}));
      const before = store.namedListeners.get('outer');

      store.forEach('outer', () => {
        // The nested walk finishes first. Its exit must hand the enclosing
        // walk's buckets back, not declare the store free of walks — the outer
        // one is still running over 'outer'.
        store.forEach('inner', () => {});
        store.add(new EventListener('outer', -1, () => {}));
      });

      expect(store.namedListeners.get('outer')).not.toBe(before);
      expect(before).toHaveLength(1);
    });

    // One removal call can take several entries out of one bucket — the same
    // object subscribed at two priorities, two once() registrations, the same
    // function twice. The first of them owes the clone; the rest have to land
    // in it, and the loop that does the splicing has to notice that it already
    // switched arrays. Getting that wrong copies per removed entry, or worse,
    // splices the second one out of the array the walk is reading.
    it('clones once when off(ε, listenerObject) takes several entries out of the walked bucket', () => {
      const store = new EventStore();
      const context = {};
      store.add(new EventListener('foo', 10, () => {}));
      store.add(new EventListener('foo', 5, NOOP, context));
      store.add(new EventListener('foo', 4, NOOP, context));
      const before = store.namedListeners.get('foo');

      let afterFirst: EventListener[] | undefined;
      let dispatched = 0;
      store.forEach('foo', () => {
        dispatched += 1;
        if (dispatched > 1) return;
        store.remove(context, null);
        afterFirst = store.namedListeners.get('foo');
      });

      expect(afterFirst).not.toBe(before);
      expect(store.namedListeners.get('foo')).toBe(afterFirst);
      expect(afterFirst).toHaveLength(1);
      expect(before).toHaveLength(3);
      expect(dispatched).toBe(3);
    });

    it('clones once when off(ε, name, listenerObject) takes several entries out of the walked bucket', () => {
      const store = new EventStore();
      const context = {};
      store.add(new EventListener('foo', 10, () => {}));
      store.add(new EventListener('foo', 5, NOOP, context));
      store.add(new EventListener('foo', 4, NOOP, context));
      const before = store.namedListeners.get('foo');

      let afterFirst: EventListener[] | undefined;
      let dispatched = 0;
      store.forEach('foo', () => {
        dispatched += 1;
        if (dispatched > 1) return;
        store.remove('foo', context, true);
        afterFirst = store.namedListeners.get('foo');
      });

      expect(afterFirst).not.toBe(before);
      expect(store.namedListeners.get('foo')).toBe(afterFirst);
      expect(afterFirst).toHaveLength(1);
      expect(before).toHaveLength(3);
      expect(dispatched).toBe(3);
    });

    // forEach('*') is a store-level call — emit(ε, '*') throws long before it —
    // and it walks the wildcard bucket only. A '*' key in namedListeners, which
    // the public getListenersForEventName('*') creates on the spot, is not
    // walked, is therefore never held, and so is never cloned. That is what
    // keeps bucketForMutation()'s choice between the wildcard slot and the map
    // out of reach of the one name where the two disagree.
    it("forEach('*') walks the wildcard bucket and leaves a '*' key in namedListeners alone", () => {
      const store = new EventStore();
      const wildcard = store.add(
        new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}),
      );
      const impostor = store.getListenersForEventName(EVENT_CATCH_EM_ALL);
      impostor.push(new EventListener(EVENT_CATCH_EM_ALL, 0, () => {}));

      const seen: EventListener[] = [];
      store.forEach(EVENT_CATCH_EM_ALL, (l) => {
        seen.push(l);
        store.add(new EventListener('foo', 0, () => {}));
      });

      expect(seen).toEqual([wildcard]);
      expect(store.catchEmAllListeners).toHaveLength(1);
      expect(store.namedListeners.get(EVENT_CATCH_EM_ALL)).toBe(impostor);
      expect(impostor).toHaveLength(1);
    });

    it('mutates in place again after a listener threw mid-dispatch', () => {
      const store = new EventStore();
      store.add(new EventListener('foo', 0, () => {}));
      const before = store.namedListeners.get('foo');

      expect(() =>
        store.forEach('foo', () => {
          throw new Error('boom');
        }),
      ).toThrow('boom');

      // The buckets are released from a finally block: a throwing listener
      // must not leave a dead walk holding one, or every later mutation of it
      // clones for the rest of the store's life.
      store.add(new EventListener('foo', -1, () => {}));
      expect(store.namedListeners.get('foo')).toBe(before);
      expect(before).toHaveLength(2);
    });
  });

  // add()'s dedup search is an index lookup, not a walk over the bucket: n
  // object or method-name subscriptions on one event name used to cost n²/2
  // isSimilar() calls, and every spec elsewhere in this repo pins the answer
  // rather than the way it is found. What is pinned here is the bookkeeping,
  // which is invisible everywhere else *by construction* — a stale index entry
  // changes no dispatch and no count. All it does is keep a detached listener,
  // and in the key the consumer's own object, alive on an emitter the consumer
  // believes it has unsubscribed from. Delete the indexRemove() calls and
  // nothing outside this block notices.
  describe('the dedup index', () => {
    it('files a function listener under the function itself', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const first = () => {};
      const second = () => {};

      const a = store.add(new EventListener('foo', 0, first));
      const b = store.add(new EventListener('foo', 0, second));

      // A function listener still never dedups — two of them stay two, and the
      // case below this one says so from the other side. It is filed all the
      // same, because off(ε, fn) reads this Map to find it. What the index
      // holds and what aggregates are two questions.
      expect(bucket).toHaveLength(2);
      const index = dedupIndexOf(bucket);
      expect(index?.get(first)).toEqual([a]);
      expect(index?.get(second)).toEqual([b]);
      expect(index?.size).toBe(2);
    });

    // The other half of the same rule, and the one detachByIdentity()'s
    // shortcut rests on: no index means nothing in this bucket is filed, and
    // nothing filed means nothing that any off() argument could match. A
    // listener with no identity in either slot is the only way to build such a
    // bucket, and only by hand — on() rejects a listener detectListenerType()
    // gives no tag. Removing it must not go looking for a Map that is not
    // there.
    it('files a listener with no identity in either slot nowhere', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const listener = store.add(new EventListener('foo', 0, null));

      expect(bucket).toHaveLength(1);
      // The Map itself is created before the keys are worked out, so this
      // bucket gets an empty one. Nothing reachable through on() lands here —
      // every listener type it admits carries an identity in one slot or the
      // other — so the allocation is not worth a second pass to avoid.
      expect(dedupIndexOf(bucket)?.size).toBe(0);

      // Nothing an off() can name reaches it, and giving it back is quiet.
      store.remove({}, null);
      expect(bucket).toHaveLength(1);

      expect(() => store.release(listener)).not.toThrow();
      expect(bucket).toHaveLength(0);
      expect(dedupIndexOf(bucket)?.size).toBe(0);
    });

    it('files the same function twice without aggregating it', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const fn = () => {};

      const a = store.add(new EventListener('foo', 0, fn));
      const b = store.add(new EventListener('foo', 0, fn));

      // The dedup gate sits in findSimilarListener(), not at the filing site,
      // so widening what is filed cannot widen what aggregates: the search
      // never asks about a function listener, and isSimilar() compares
      // listenerType first and so could not match one if it did.
      expect(b).not.toBe(a);
      expect(bucket).toHaveLength(2);
      expect(dedupIndexOf(bucket)?.get(fn)).toEqual([a, b]);
    });

    it('files a listener under both of its identity slots when they differ', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const fn = () => {};
      const ctx = {};

      const listener = store.add(new EventListener('foo', 0, fn, ctx));

      // off(ε, fn) and off(ε, ctx) both name this one registration, so both
      // values have to be keys. The second is what the removal side gained.
      const index = dedupIndexOf(bucket);
      expect(index?.get(fn)).toEqual([listener]);
      expect(index?.get(ctx)).toEqual([listener]);
      expect(index?.size).toBe(2);
    });

    it('gives a method name no key of its own', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const target = {handler() {}};

      const listener = store.add(
        new EventListener('foo', 0, 'handler', target),
      );

      // A string can never be the listener argument of a removal that reaches
      // detachByIdentity() — remove() routes one to removeByEventName(), or to
      // the association path when a listener object comes with it — so a key
      // for it would be one nothing ever looks up.
      const index = dedupIndexOf(bucket);
      expect(index?.get('handler')).toBe(undefined);
      expect(index?.get(target)).toEqual([listener]);
      expect(index?.size).toBe(1);
    });

    it('files each listener under the slot that carries its identity', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const target = {handler() {}};
      const self = {foo() {}};

      const named = store.add(new EventListener('foo', 0, 'handler', target));
      const object = store.add(new EventListener('foo', 0, self));

      const index = dedupIndexOf(bucket);
      // The listener object for a method-name subscription, the listener
      // itself for an object one.
      expect(index?.get(target)).toEqual([named]);
      expect(index?.get(self)).toEqual([object]);
      expect(index?.size).toBe(2);
    });

    // The two identity slots are different fields but the same *value* here:
    // `on(ε, 'foo', 'handler', target)` files under its listenerObject and
    // `on(ε, 'foo', target)` under its listener, and both are `target`. They
    // share a key and must still not dedup into one another — the listener type
    // is part of the similarity test, and it is the only thing separating them.
    it('keeps two listener types apart when they share a key', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const target = {handler() {}, foo() {}};

      const named = store.add(new EventListener('foo', 0, 'handler', target));
      const object = store.add(new EventListener('foo', 0, target));

      expect(object).not.toBe(named);
      expect(bucket).toHaveLength(2);
      expect(dedupIndexOf(bucket)?.size).toBe(1);
      expect(dedupIndexOf(bucket)?.get(target)).toEqual([named, object]);
    });

    // A function listener with a context object is filed under that context,
    // in the same candidate list a method-name listener on the same object
    // lands in. Taking one of the two out must leave the other's entry exactly
    // as it was, and must take the function's own key with it.
    it('leaves a shared key populated when one of its two listeners goes', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const target = {handler() {}};
      const fn = () => {};
      const named = store.add(new EventListener('foo', 0, 'handler', target));
      const func = store.add(new EventListener('foo', 0, fn, target));

      expect(dedupIndexOf(bucket)?.get(target)).toEqual([named, func]);

      store.release(func);

      expect(bucket).toHaveLength(1);
      expect(dedupIndexOf(bucket)?.get(target)).toEqual([named]);
      expect(dedupIndexOf(bucket)?.get(fn)).toBe(undefined);
    });

    it('unfiles a listener whose last registration is given back', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const target = {handler() {}};
      const listener = store.add(
        new EventListener('foo', 0, 'handler', target),
      );

      store.release(listener);

      // The key goes with the last candidate under it — an emptied array left
      // behind would still hold `target`.
      expect(dedupIndexOf(bucket)?.size).toBe(0);
    });

    it('unfiles what off(ε, eventName, listenerObject) takes out', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const target = {handler() {}};
      store.add(new EventListener('foo', 0, 'handler', target));
      store.add(new EventListener('foo', 100, 'handler', target));

      store.remove('foo', target, true);

      expect(bucket).toHaveLength(0);
      expect(dedupIndexOf(bucket)?.size).toBe(0);
    });

    it('unfiles what off(ε, listenerObject) takes out', () => {
      const store = new EventStore();
      const wildcards = store.catchEmAllListeners;
      const self = {foo() {}};
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, self));

      store.remove(self, null);

      expect(wildcards).toHaveLength(0);
      expect(dedupIndexOf(wildcards)?.size).toBe(0);
    });

    // A listener filed under two keys has to lose both. Missing the second
    // leaves the emitter holding whichever value it was — the failure
    // AGENTS.md calls the quiet one, and the one this whole block exists for:
    // no count and no dispatch anywhere else in this repo can see it.
    it('unfiles a two-key listener from both of its keys', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const fn = () => {};
      const ctx = {};
      store.add(new EventListener('foo', 0, fn, ctx));

      expect(dedupIndexOf(bucket)?.size).toBe(2);

      // Names the function; the context has to go with it all the same.
      store.remove(fn, null);

      expect(bucket).toHaveLength(0);
      expect(dedupIndexOf(bucket)?.size).toBe(0);
    });

    it('finds a two-key listener through either of its keys', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      const fn = () => {};
      const ctx = {};
      store.add(new EventListener('foo', 0, fn, ctx));

      // The context slot is the key the removal side gained. Up to v5.1.0 a
      // linear scan answered both spellings; now the index has to.
      store.remove(ctx, null);

      expect(bucket).toHaveLength(0);
      expect(dedupIndexOf(bucket)?.size).toBe(0);
    });

    // unfileFrom()'s two early returns. Neither is reachable through on() /
    // off(): a listener is only ever unfiled under a key it was filed under,
    // and nothing else empties a candidate list. What they stand between is
    // `indexOf()` on `undefined` and a `splice(-1, 1)` that would unfile a
    // listener still in the bucket, so they are pinned the way the
    // holey-bucket throws are — by corrupting the structure by hand.
    describe('survives an index that has already lost the entry', () => {
      // Reaches past `dedupIndexOf()`'s readonly return type, which is the
      // whole exercise: these two cases are the ones only a caller doing
      // exactly that can produce.
      const rawIndex = (bucket: ReadonlyArray<EventListener>) =>
        dedupIndexOf(bucket) as Map<unknown, EventListener[]>;

      it('when the key is gone', () => {
        const store = new EventStore();
        const bucket = store.getListenersForEventName('foo');
        const self = {foo() {}};
        const listener = store.add(new EventListener('foo', 0, self));

        rawIndex(bucket).delete(self);

        expect(() => store.release(listener)).not.toThrow();
        expect(bucket).toHaveLength(0);
      });

      // indexRemove()'s own guard, one level above unfileFrom()'s two. It was
      // reachable and covered while filing was conditional; since indexAdd()
      // runs for every listener, a bucket holding one always has a Map. Same
      // class of access as rawIndex(), one level deeper — the slot rather than
      // the Map in it.
      it('when the whole index is gone', () => {
        const store = new EventStore();
        const bucket = store.getListenersForEventName('foo');
        const self = {foo() {}};
        const listener = store.add(new EventListener('foo', 0, self));

        const [slot] = Object.getOwnPropertySymbols(bucket).filter(
          (symbol) => symbol.description === 'eventize.EventStore.dedupIndex',
        );
        (bucket as unknown as Record<symbol, unknown>)[slot as symbol] =
          undefined;
        // The corruption has to have taken, or the rest of this case asserts
        // nothing at all — a symbol description that stops matching would
        // otherwise leave a green test measuring the ordinary path.
        expect(dedupIndexOf(bucket)).toBe(undefined);

        expect(() => store.release(listener)).not.toThrow();
        expect(bucket).toHaveLength(0);
      });

      it('when the key is there and the candidate is not', () => {
        const store = new EventStore();
        const bucket = store.getListenersForEventName('foo');
        const self = {foo() {}};
        const listener = store.add(new EventListener('foo', 0, self));

        const candidates = rawIndex(bucket).get(self) as EventListener[];
        expect(candidates).toHaveLength(1);
        candidates.length = 0;

        expect(() => store.release(listener)).not.toThrow();
        expect(bucket).toHaveLength(0);
        // The emptied list stays — nothing deletes a key it did not empty
        // itself, which is the point of the guard rather than an oversight.
        expect(rawIndex(bucket).has(self)).toBe(true);
      });
    });

    it('drops the index of every bucket off(ε) empties', () => {
      const store = new EventStore();
      const named = store.getListenersForEventName('foo');
      const wildcards = store.catchEmAllListeners;
      const target = {handler() {}};
      store.add(new EventListener('foo', 0, 'handler', target));
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, 'handler', target));

      store.remove(null, null);

      // The named bucket leaves the store with its index; the wildcard array
      // is truncated in place and *stays*, so an index left standing on it
      // would outlive every listener that put something in it.
      expect(dedupIndexOf(named)).toBe(undefined);
      expect(store.catchEmAllListeners).toBe(wildcards);
      expect(dedupIndexOf(wildcards)).toBe(undefined);
    });

    it('hands a clone the index of the bucket it copies', () => {
      const store = new EventStore();
      const target = {handler() {}};
      const first = store.add(new EventListener('foo', 0, 'handler', target));
      const before = store.getListenersForEventName('foo');

      let aggregated: EventListener | undefined;
      store.forEach('foo', () => {
        // Mutates the bucket this walk is holding, so the store swaps in a
        // clone — and the second add() has to find `first` through it.
        store.add(new EventListener('foo', -1, () => {}));
        aggregated = store.add(new EventListener('foo', 0, 'handler', target));
      });

      const clone = store.getListenersForEventName('foo');
      expect(clone).not.toBe(before);
      expect(aggregated).toBe(first);
      expect(clone).toHaveLength(2);
      // The same Map, not a rebuilt one: a clone is element-for-element
      // identical, and rebuilding would put an O(n) fill on the one path
      // clone-on-mutate exists to keep cheap.
      expect(dedupIndexOf(clone)).toBe(dedupIndexOf(before));
    });

    it('never aggregates onto a listener that has already been removed', () => {
      const store = new EventStore();
      const target = {handler() {}};
      const first = store.add(new EventListener('foo', 0, 'handler', target));
      store.release(first);
      expect(first.isRemoved).toBe(true);

      const second = store.add(new EventListener('foo', 0, 'handler', target));

      // Two guards stand behind this, and it holds if either does: the removal
      // unfiled `first`, and isSimilar() could not have matched it anyway —
      // detach() nulls both identity slots, which no listener arriving at add()
      // ever has.
      expect(second).not.toBe(first);
      expect(store.getListenersForEventName('foo')).toHaveLength(1);
    });
  });

  // Both buckets are dense in every reachable code path — add()/remove() never
  // leave a hole behind. These two tests break that invariant on purpose (by
  // growing `.length` past the real entries, which is enough to create holes
  // without needing a cast) to pin two specific defensive throws. This is not
  // general hole-tolerance for the class, and the paths differ: add() reaches
  // findInsertIndex()'s throw for every listener type since the dedup search
  // became an index lookup — it no longer touches the bucket at all, so a hole
  // in it cannot be what the search dies on. On the removal side
  // detachByAssociation() still walks the bucket and skips holes silently,
  // guarding its candidate with `!== undefined`, while detachByIdentity() has
  // stopped walking it at all: it reads candidates from the index and lets
  // spliceOut()'s indexOf() find them, which sees no hole either. Only add()'s
  // no-similar-listener path and forEach()'s merge loop are pinned here.
  describe('pins the two defensive branches that throw on a holey bucket', () => {
    it('findInsertIndex throws instead of silently choosing an insert position', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      bucket.length = 3; // three holes, no real listeners

      // The assertion is specific to the message this throw produces — it is
      // not simply "add() throws on a holey bucket".
      expect(() => store.add(new EventListener('foo', 0, () => {}))).toThrow(
        'EventStore: findInsertIndex encountered a hole',
      );
      // Up to the dedup index, an object listener died before ever reaching
      // findInsertIndex: the search was an Array.prototype.find over the
      // bucket, find() visits holes (unlike forEach), and isSimilar() got
      // `b === undefined` and threw a bare TypeError on `b.listenerType`. The
      // search reads a Map now and never sees the array, so both types reach
      // the same explicit throw. A corrupted bucket is not a reachable state
      // either way; what changed is which of the two guards reports it.
      expect(() => store.add(new EventListener('foo', 0, {}))).toThrow(
        'EventStore: findInsertIndex encountered a hole',
      );
    });

    it('forEach() throws instead of silently dispatching a truncated prefix', () => {
      const store = new EventStore();
      const namedBucket = store.getListenersForEventName('foo');
      namedBucket.length = 2; // holes only
      store.catchEmAllListeners.length = 2; // holes only

      const seen: EventListener[] = [];
      expect(() => store.forEach('foo', (l) => seen.push(l))).toThrow(
        'EventStore: forEach encountered a hole',
      );
      expect(seen).toHaveLength(0);
    });
  });

  // Both containers are lazy, and until the first write both fields point at
  // one pair shared by every store this module instance built — the same
  // arrangement EventKeeper.spec.ts watches for the retain index. That makes
  // every write path a place where a forgotten materialization would put one
  // emitter's listeners into all of them at once, a corruption no behavioural
  // spec can see because the emitter under test would still behave correctly.
  // These cases watch the stand-ins themselves.
  describe('the shared empty containers', () => {
    // peekListeners() is the only door that hands the wildcard stand-in out:
    // catchEmAllListeners returns a mutable array and therefore materializes,
    // the way getListenersForEventName() does for a named bucket.
    const wildcardBucketOf = (
      store: EventStore,
    ): ReadonlyArray<EventListener> => store.peekListeners(EVENT_CATCH_EM_ALL);

    // Reaching past the ReadonlyArray, which is what a stray write inside the
    // store would do too — the type is not what protects the shared object.
    const asMutable = (listeners: ReadonlyArray<EventListener>) =>
      listeners as EventListener[];

    it('a fresh store builds neither a map nor a bucket of its own', () => {
      const a = new EventStore();
      const b = new EventStore();

      expect(a.namedListeners).toBe(b.namedListeners);
      expect(wildcardBucketOf(a)).toBe(wildcardBucketOf(b));
      expect(a.namedListeners.size).toBe(0);
      expect(wildcardBucketOf(a)).toHaveLength(0);
      expect(a.getSubscriptionCount()).toBe(0);
    });

    // The stand-in is handed out by peekListeners() and read by dedupIndexOf(),
    // so it has to be a bucket in full — AGENTS.md: every array that can become
    // one is born in createBucket(), the shared empty one included. An array
    // literal would arrive without the held count, read as *held*, and buy the
    // first mutation a clone it does not owe.
    it('the wildcard stand-in is a bucket, not a bare array', () => {
      const store = new EventStore();
      const standIn = wildcardBucketOf(store);
      const real = store.getListenersForEventName('foo');

      expect(Object.getOwnPropertySymbols(standIn)).toEqual(
        Object.getOwnPropertySymbols(real),
      );
      expect(dedupIndexOf(standIn)).toBe(undefined);
    });

    it('the first write replaces the stand-in, and only for that store', () => {
      const store = new EventStore();
      const untouched = new EventStore();

      store.add(new EventListener('foo', 0, NOOP));
      expect(store.namedListeners).not.toBe(untouched.namedListeners);
      // A named subscription buys the Map, never the wildcard bucket.
      expect(wildcardBucketOf(store)).toBe(wildcardBucketOf(untouched));

      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, NOOP));
      expect(wildcardBucketOf(store)).not.toBe(wildcardBucketOf(untouched));

      expect(untouched.namedListeners.size).toBe(0);
      expect(untouched.getSubscriptionCount()).toBe(0);
    });

    // The poisoning, one entry per write the store makes on either container.
    // Each of these is what a forgotten materialization would have executed
    // against the shared object instead of against this emitter's own.
    it('rejects mutation instead of corrupting every store this module built', () => {
      const store = new EventStore();
      const listener = new EventListener(EVENT_CATCH_EM_ALL, 0, NOOP);

      // getListenersForEventName(), bucketForMutation() and the three delete
      // paths, in that order.
      expect(() =>
        store.namedListeners.set('foo', [] as unknown as never),
      ).toThrow(/shared empty stand-in/);
      expect(() => store.namedListeners.delete('foo')).toThrow(
        /shared empty stand-in/,
      );
      expect(() => store.namedListeners.clear()).toThrow(
        /shared empty stand-in/,
      );

      const standIn = asMutable(wildcardBucketOf(store));

      // add()'s insert, and every other mutator Array.prototype offers.
      expect(() => standIn.splice(0, 0, listener)).toThrow(
        /shared empty stand-in/,
      );
      expect(() => standIn.push(listener)).toThrow(/shared empty stand-in/);
      expect(() => standIn.pop()).toThrow(/shared empty stand-in/);
      expect(() => standIn.shift()).toThrow(/shared empty stand-in/);
      expect(() => standIn.unshift(listener)).toThrow(/shared empty stand-in/);
      expect(() => standIn.sort()).toThrow(/shared empty stand-in/);
      expect(() => standIn.reverse()).toThrow(/shared empty stand-in/);

      // The three writes no stub can shadow, which is why the stand-in is
      // frozen on top of them: an element, the length, and the two symbol
      // slots — forEach()'s `bucket[HELD_BY] += 1` and indexAdd()'s
      // `bucket[DEDUP_INDEX] ??= new Map()`.
      expect(() => {
        standIn[0] = listener;
      }).toThrow();
      expect(() => {
        standIn.length = 1;
      }).toThrow();
      for (const slot of Object.getOwnPropertySymbols(standIn)) {
        expect(() => {
          (standIn as unknown as Record<symbol, unknown>)[slot] = new Map();
        }).toThrow();
      }

      expect(standIn).toHaveLength(0);
      expect(new EventStore().getSubscriptionCount()).toBe(0);
    });

    // The other half of the poisoning: every path that reads or removes has to
    // arrive at the stand-in without writing to it. A missed guard here is a
    // throw rather than a corruption, which is the whole point — but it is a
    // throw on `off()`, so it is worth one case that names the callers.
    it('leaves the stand-ins in place across every read and every no-op removal', () => {
      const pristine = new EventStore();
      const store = new EventStore();
      const listenerObject = {handler() {}};

      expect(() => {
        store.forEach('foo', () => {});
        store.forEach(EVENT_CATCH_EM_ALL, () => {});
        store.peekListeners('foo');
        store.getSubscriptionCount();
        store.remove('foo', null); // off(ε, 'foo')
        store.remove(['foo', 'bar'], null); // off(ε, ['foo', 'bar'])
        store.remove(listenerObject, null); // off(ε, listenerObject)
        store.remove(listenerObject.handler, listenerObject); // off(ε, fn, ctx)
        store.remove('foo', listenerObject, true); // off(ε, 'foo', listenerObject)
        store.remove(EVENT_CATCH_EM_ALL, listenerObject, true); // off(ε, '*', o)
        store.remove(null, null); // off(ε)
        store.removeAllListeners();
      }).not.toThrow();

      expect(store.namedListeners).toBe(pristine.namedListeners);
      expect(wildcardBucketOf(store)).toBe(wildcardBucketOf(pristine));
    });

    // Everything above watches a store built by hand. The three cases below
    // watch the library driving it, because the saving is easier to give back
    // than to make: `catchEmAllListeners` reads like a getter and allocates,
    // so an internal caller that starts using it — a debug helper, a
    // `forEach()` refactored to read the array by name — would undo MEM-001
    // without turning a single bar red. Every count and every dispatch would
    // go on being right; only the stand-ins would be gone. Same reasoning as
    // retain.spec.ts's case for the keeper's pair, and the same shape.
    //
    // One case per emitter shape, because the two containers are earned
    // separately and each shape drives a different set of store methods. The
    // wildcard stand-in is read through peekListeners(), never through
    // catchEmAllListeners — the latter is the door that creates.
    // Takes the two stores rather than the emitter: `storeOf()` binds its type
    // parameter per call, because the phantom brand on `EventizedObject` makes
    // it invariant, and a helper that took the object would need the same
    // generic signature to stay cast-free.
    const wildcardStandInIntact = (store: EventStore, pristine: EventStore) =>
      expect(store.peekListeners(EVENT_CATCH_EM_ALL)).toBe(
        pristine.peekListeners(EVENT_CATCH_EM_ALL),
      );

    it('a dispatch on an emitter nobody subscribed to builds neither container', () => {
      const pristine = storeOf(eventize({}));
      const silent = eventize({});

      // `'*'` is not emittable — the wildcard bucket is reached by every
      // ordinary dispatch instead, which is the read this case is about.
      emit(silent, 'foo', 'payload');
      emit(silent, ['bar', 'baz'], 'payload');

      expect(storeOf(silent).namedListeners).toBe(pristine.namedListeners);
      wildcardStandInIntact(storeOf(silent), pristine);
    });

    // Every removal route the named half has, the unsubscribe handle included:
    // off(name) reaches removeByEventName(), off(ε) reaches
    // removeAllListeners(), and the handles on/once hand back reach
    // release()/releaseObligation() → dropListener(), which is a path of its
    // own and the only one that touches the wildcard array directly.
    it('an emitter with named subscriptions only never reaches for the wildcard stand-in', () => {
      const pristine = storeOf(eventize({}));
      const named = eventize({});
      const heard: unknown[] = [];

      const unsubscribeOn = on(named, 'handled', (v: unknown) => heard.push(v));
      const unsubscribeOnce = once(named, 'pending', () => heard.push('never'));
      on(named, 'foo', (v: unknown) => heard.push(v));
      once(named, 'bar', (v: unknown) => heard.push(v));

      emit(named, 'handled', 0);
      emit(named, 'foo', 1);
      emit(named, 'bar', 2);
      emit(named, 'never-subscribed', 3);

      unsubscribeOn(); // release() → dropListener()
      unsubscribeOnce(); // releaseObligation() → dropListener()
      off(named, 'foo'); // removeByEventName()
      off(named); // removeAllListeners()

      expect(heard).toEqual([0, 1, 2]);
      expect(storeOf(named).namedListeners).not.toBe(pristine.namedListeners);
      wildcardStandInIntact(storeOf(named), pristine);
    });

    // The mirror. `add()`'s wildcard arm does not touch `namedBuckets` today,
    // and `dropListener()`'s wildcard arm does not either — but that is a
    // property of how the two branches happen to be written, and nothing else
    // in the suite would notice if either started resolving a named bucket on
    // the way past.
    it('an emitter with wildcard subscriptions only never reaches for the named stand-in', () => {
      const pristine = storeOf(eventize({}));
      const wild = eventize({});
      const heard: unknown[] = [];

      const unsubscribe = on(wild, '*', (v: unknown) => heard.push(v));
      once(wild, '*', (v: unknown) => heard.push(v));

      emit(wild, 'foo', 1);
      emit(wild, 'bar', 2);

      unsubscribe(); // dropListener() takes the catch-em-all branch
      off(wild);

      expect(heard).toEqual([1, 1, 2]);
      expect(storeOf(wild).namedListeners).toBe(pristine.namedListeners);
      expect(storeOf(wild).peekListeners(EVENT_CATCH_EM_ALL)).not.toBe(
        pristine.peekListeners(EVENT_CATCH_EM_ALL),
      );
    });

    // The keeper's containers come back on a bulk teardown; the store's do
    // not, and that asymmetry is deliberate rather than an omission. A caller
    // holding the wildcard array across an off(ε) gets the same array back,
    // truncated — the truncation exception in AGENTS.md — and releasing the
    // Map while keeping the array would make two rules out of one.
    it('keeps the containers it has once built, even after off(ε)', () => {
      const pristine = new EventStore();
      const store = new EventStore();
      store.add(new EventListener('foo', 0, NOOP));
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, NOOP));
      const wildcards = store.catchEmAllListeners;

      store.remove(null, null); // off(ε)

      expect(store.getSubscriptionCount()).toBe(0);
      expect(store.namedListeners).not.toBe(pristine.namedListeners);
      expect(store.catchEmAllListeners).toBe(wildcards);
      expect(wildcards).toHaveLength(0);
    });
  });
});
