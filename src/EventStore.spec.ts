import {EventListener} from './EventListener';
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
    it('removing the last listener for an event name deletes the map entry (off via EventListener)', () => {
      const store = new EventStore();
      const listener = store.add(new EventListener('foo', 0, () => {}));
      expect(store.namedListeners.has('foo')).toBe(true);

      store.remove(listener, null);

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
        store.remove(listener, null);
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

      store.remove(target, null);

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

      store.remove(target, null);

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

    it('inserts instead of deduplicating when noDedup is set', () => {
      const store = new EventStore();
      const listenerObject = {};
      const first = store.add(new EventListener('foo', 0, listenerObject));
      // what once() passes: a similar listener is present, and it is ignored
      const second = store.add(
        new EventListener('foo', 0, listenerObject),
        true,
      );

      expect(second).not.toBe(first);
      expect(first.refCount).toBe(1);
      expect(second.refCount).toBe(1);
      expect(store.getSubscriptionCount()).toBe(2);

      store.remove(second, null);
      expect(store.getSubscriptionCount()).toBe(1);
      store.remove(first, null);
      expect(store.getSubscriptionCount()).toBe(0);
    });

    it('honours refCount before removing anything', () => {
      const store = new EventStore();
      const listenerObject = {};
      const first = store.add(new EventListener('foo', 0, listenerObject));
      const second = store.add(new EventListener('foo', 0, listenerObject));
      expect(second).toBe(first);
      expect(first.refCount).toBe(2);

      store.remove(first, null);
      expect(store.getSubscriptionCount()).toBe(1);

      store.remove(first, null);
      expect(store.getSubscriptionCount()).toBe(0);
    });

    it('ignores an event name with no bucket', () => {
      const store = new EventStore();
      const listenerObject = {};
      store.add(new EventListener('foo', 0, listenerObject));

      store.remove('never-subscribed', listenerObject, true);

      expect(store.getSubscriptionCount()).toBe(1);
    });

    // Pins a pre-existing quirk rather than fixing one: the foreign listener is
    // detach()ed and its refCount decremented while it stays in its own store's
    // array. The pre-refactor full scan did exactly the same — documentation,
    // not a behaviour change.
    it('ignores a listener that belongs to another store', () => {
      const a = new EventStore();
      const b = new EventStore();
      const target = a.add(new EventListener('foo', 0, () => {}));
      b.add(new EventListener('foo', 0, () => {})); // same name, different instance

      expect(() => b.remove(target, null)).not.toThrow();
      expect(b.getSubscriptionCount()).toBe(1);
    });

    it('ignores a foreign listener whose event name is unknown here', () => {
      const a = new EventStore();
      const b = new EventStore();
      const target = a.add(new EventListener('foo', 0, () => {}));

      expect(() => b.remove(target, null)).not.toThrow();
    });
  });

  // Both buckets are dense in every reachable code path — add()/remove() never
  // leave a hole behind. These two tests break that invariant on purpose (by
  // growing `.length` past the real entries, which is enough to create holes
  // without needing a cast) to pin two specific defensive throws. This is not
  // general hole-tolerance for the class: findSimilarListener/isSimilar die
  // on a hole with their own uncaught TypeError (`b.listenerType`) for the
  // LISTENER_IS_OBJ/LISTENER_IS_NAMED_FUNC path, removeByEventNameAndListenerObject
  // and removeByListener the same way through isEqual, and removeListenerFromArray
  // (used by removeByListener) walks holes silently via its `!== undefined`
  // guard rather than throwing at all. Only add()'s no-similar-listener path
  // and forEach()'s merge loop are pinned here.
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
