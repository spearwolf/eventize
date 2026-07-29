import {EventListener} from './EventListener';
import type {OnceObligation} from './EventListener';
import {EventStore} from './EventStore';

import {EVENT_CATCH_EM_ALL} from './constants';

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
  // skills/using-eventize/references/api-details.md (BUG-004). Both
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
      const obligation: OnceObligation = {settled: false, members: []};
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
      const obligation: OnceObligation = {settled: false, members: []};
      const listener = store.add(
        new EventListener('foo', 0, listenerObject),
        obligation,
      );
      store.add(new EventListener('foo', 0, listenerObject));

      store.settleOneShots(listener, 1);
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

    it('settleOneShots() leaves obligations beyond the given count untouched', () => {
      const store = new EventStore();
      const listenerObject = {};
      const before: OnceObligation = {settled: false, members: []};
      const listener = store.add(
        new EventListener('foo', 0, listenerObject),
        before,
      );
      // Simulates a once() that re-subscribed itself from inside its own
      // dispatch: a second obligation, appended after apply() already took
      // its pre-dispatch snapshot of the count.
      const reArmed: OnceObligation = {settled: false, members: []};
      store.add(new EventListener('foo', 0, listenerObject), reArmed);

      store.settleOneShots(listener, 1);

      expect(before.settled).toBe(true);
      expect(reArmed.settled).toBe(false);
      expect(listener.onceObligations).toEqual([reArmed]);
      expect(store.getSubscriptionCount()).toBe(1);
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
        const obligation: OnceObligation = {settled: true, members: []};
        const listener = new EventListener('foo', 0, {});
        listener.onceObligations = [obligation];
        store.add(listener);

        expect(() => store.settleOneShots(listener, 1)).not.toThrow();
        // Left exactly as found: skipping a settled obligation must not
        // silently clear it from a listener that was never actually
        // discharged for it.
        expect(listener.onceObligations).toEqual([obligation]);
      });

      it('releaseObligation() tolerates a member with no obligations of its own', () => {
        const store = new EventStore();
        const persistentOnly = store.add(new EventListener('foo', 0, {}));
        const obligation: OnceObligation = {
          settled: false,
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
        const otherObligation: OnceObligation = {settled: false, members: []};
        listener.onceObligations = [otherObligation];
        const obligation: OnceObligation = {
          settled: false,
          members: [listener],
        };

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

  // Both buckets are dense in every reachable code path — add()/remove() never
  // leave a hole behind. These two tests break that invariant on purpose (by
  // growing `.length` past the real entries, which is enough to create holes
  // without needing a cast) to pin two specific defensive throws. This is not
  // general hole-tolerance for the class, and the paths differ: add()'s dedup
  // search dies on a hole with an uncaught TypeError from inside isSimilar
  // (`b.listenerType`, because Array.prototype.find visits holes) for the
  // LISTENER_IS_OBJ/LISTENER_IS_NAMED_FUNC types, while both removal loops
  // walk holes silently instead, each guarding its candidate with
  // `!== undefined`. Only add()'s no-similar-listener path and forEach()'s
  // merge loop are pinned here.
  describe('pins the two defensive branches that throw on a holey bucket', () => {
    it('findInsertIndex throws instead of silently choosing an insert position', () => {
      const store = new EventStore();
      const bucket = store.getListenersForEventName('foo');
      bucket.length = 3; // three holes, no real listeners

      // A function listener is LISTENER_IS_FUNC, which isSimilarListenerType()
      // excludes — findSimilarListener() returns undefined without ever
      // calling Array.prototype.find over the holey bucket, so add() falls
      // straight through to findInsertIndex() and hits *that* throw. Swap
      // this for `new EventListener('foo', 0, {})` (LISTENER_IS_OBJ) and the
      // test still throws, but earlier and elsewhere: find() visits holes
      // (unlike forEach), so isSimilar() receives `b === undefined` and dies
      // on `b.listenerType` before findInsertIndex ever runs. The assertion
      // below is specific to the message this throw produces — it is not
      // simply "add() throws on a holey bucket".
      expect(() => store.add(new EventListener('foo', 0, () => {}))).toThrow(
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
});
