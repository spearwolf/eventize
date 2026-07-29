import {fake} from 'sinon';

import {
  emit,
  eventize,
  getRetainedCount,
  getRetainedEventNames,
  getSubscriptionCount,
  off,
  on,
  once,
  onceAsync,
  retain,
  retainClear,
  unretain,
} from './index';
import {collect} from './__test-utils__/gc';
import {
  latestListener,
  latestListenerPair,
  storeOf,
} from './__test-utils__/listeners';

import type {EventListener} from './EventListener';

/**
 * What cleanup means in this library, as executable assertions.
 *
 * Every case here corresponds to a finding from the 2026-07-25 audit. They
 * live together rather than in the per-function specs because they describe
 * one subject — what an emitter holds, and what releases it.
 */
describe('lifecycle', () => {
  describe('subscription count after each off() form', () => {
    it('off(ε) clears every listener', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      on(obj, '*', fake());
      expect(getSubscriptionCount(obj)).toBe(3);

      off(obj);

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('off(ε, eventName) clears only that name', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());

      off(obj, 'foo');

      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('off(ε, [names]) clears each listed name', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      on(obj, 'baz', fake());

      off(obj, ['foo', 'bar']);

      expect(getSubscriptionCount(obj)).toBe(1);
    });

    it('off(ε, listenerFunc) clears that function everywhere', () => {
      const obj = eventize();
      const listener = fake();
      on(obj, 'foo', listener);
      on(obj, 'bar', listener);

      off(obj, listener);

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('off(ε, listenerObject) clears both subscription shapes', () => {
      const obj = eventize();
      const listenerObject = {foo: fake(), handler: fake()};
      on(obj, 'foo', listenerObject);
      on(obj, 'bar', 'handler', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      off(obj, listenerObject);

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('off(ε, eventName, listenerObject) clears both subscription shapes', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};
      on(obj, 'foo', listenerObject);
      off(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(0);

      const other = {handler: fake()};
      on(obj, 'foo', 'handler', other);
      off(obj, 'foo', other);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('off(ε, undefined) is not a no-op — it takes the off(ε) branch', () => {
      const obj = eventize();
      on(obj, 'foo', fake());
      on(obj, 'bar', fake());
      const maybeHandle: {listener?: unknown} = {};

      off(obj, maybeHandle.listener); // maybeHandle.listener is undefined

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('the unsubscribe handle clears its own subscription', () => {
      const obj = eventize();
      const unsubscribe = on(obj, 'foo', fake());

      unsubscribe();

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('the multi-event unsubscribe handle clears all of them', () => {
      const obj = eventize();
      const unsubscribe = on(obj, ['foo', 'bar'], fake());
      expect(getSubscriptionCount(obj)).toBe(2);

      unsubscribe();

      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });

  describe('keeper size', () => {
    it('off(ε, eventName) drops the retained value and the policy', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');
      expect(getRetainedCount(obj)).toBe(1);

      off(obj, 'foo');

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('off(ε, undefined) also clears retained state, on its way to wiping every listener', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');
      on(obj, 'foo', fake());

      off(obj, undefined);

      expect(getSubscriptionCount(obj)).toBe(0);
      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('off(ε) — the bare form — clears retained state', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');
      on(obj, 'foo', fake());

      off(obj);

      expect(getSubscriptionCount(obj)).toBe(0);
      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('off(ε, "*") also clears retained state, just like the bare form', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');
      on(obj, 'foo', fake());

      off(obj, '*');

      expect(getSubscriptionCount(obj)).toBe(0);
      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('off(ε) drops every retained value and policy', () => {
      const obj = eventize();
      retain(obj, ['a', 'b']);
      emit(obj, 'a', 1);
      emit(obj, 'b', 2);

      off(obj);

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('off(ε, [names]) drops the retained value and the policy for each listed name', () => {
      const obj = eventize();
      retain(obj, ['foo', 'bar', 'baz']);
      emit(obj, 'foo', 1);
      emit(obj, 'bar', 2);
      emit(obj, 'baz', 3);

      off(obj, ['foo', 'bar']);

      expect(getRetainedCount(obj)).toBe(1);
      expect(getRetainedEventNames(obj)).toEqual(['baz']);
    });

    it('off(ε, listenerFunc) and off(ε, listenerObject) leave retained state untouched', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');

      const fn = fake();
      on(obj, 'foo', fn);
      off(obj, fn);
      expect(getRetainedCount(obj)).toBe(1);

      const listenerObject = {foo: fake()};
      on(obj, 'foo', listenerObject);
      off(obj, listenerObject);
      expect(getRetainedCount(obj)).toBe(1);
      expect(getRetainedEventNames(obj)).toEqual(['foo']);
    });

    it('off(ε, eventName, listenerObject) unretains that name too, even though a sibling listener survives', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');
      const other = {foo: fake()};
      on(obj, 'foo', other);
      const listenerObject = {foo: fake()};
      on(obj, 'foo', listenerObject);
      expect(getSubscriptionCount(obj)).toBe(2);

      off(obj, 'foo', listenerObject);

      // one listener removed, one left...
      expect(getSubscriptionCount(obj)).toBe(1);
      // ...but the retained value and policy for 'foo' are both gone
      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it("off(ε, '*', listenerObject) leaves retained state untouched, unlike its named sibling", () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');
      const wildcardObj = {foo: fake()};
      on(obj, '*', wildcardObj);
      expect(getSubscriptionCount(obj)).toBe(1);

      off(obj, '*', wildcardObj);

      // the wildcard subscription is gone...
      expect(getSubscriptionCount(obj)).toBe(0);
      // ...and nothing else is: '*' can never carry retained state, so the
      // keeper call this form makes has nothing to drop.
      expect(getRetainedCount(obj)).toBe(1);
      expect(getRetainedEventNames(obj)).toEqual(['foo']);
    });

    it('retain() holds the payload by reference — no cloning', () => {
      const obj = eventize();
      const payload = {big: 'buffer-or-dom-node'};
      retain(obj, 'foo');

      emit(obj, 'foo', payload);

      const received = fake();
      on(obj, 'foo', received);

      expect(received.firstCall.args[0]).toBe(payload);
    });

    it('unretain(ε, "*") drops everything', () => {
      const obj = eventize();
      retain(obj, ['a', 'b', 'c']);
      emit(obj, 'a', 1);
      emit(obj, 'b', 2);

      unretain(obj, '*');

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toEqual([]);
    });

    it('retainClear(ε, "*") drops values and keeps policies', () => {
      const obj = eventize();
      retain(obj, ['a', 'b']);
      emit(obj, 'a', 1);

      retainClear(obj, '*');

      expect(getRetainedCount(obj)).toBe(0);
      expect(getRetainedEventNames(obj)).toHaveLength(2);
    });

    it('does not grow when the same name is re-emitted', () => {
      const obj = eventize();
      retain(obj, 'foo');
      for (let i = 0; i < 100; i++) {
        emit(obj, 'foo', i);
      }
      expect(getRetainedCount(obj)).toBe(1);
    });

    it('grows once per distinct name — the caller owns the cleanup', () => {
      const obj = eventize();
      for (let i = 0; i < 500; i++) {
        retain(obj, `item-${i}`);
        emit(obj, `item-${i}`, {i});
      }
      expect(getRetainedCount(obj)).toBe(500);

      unretain(obj, '*');

      expect(getRetainedCount(obj)).toBe(0);
    });
  });

  describe('repeated once() on the same listener object', () => {
    it('does not degenerate into a permanent listener', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};

      once(obj, 'foo', listenerObject);
      once(obj, 'foo', listenerObject);

      emit(obj, 'foo');
      emit(obj, 'foo');
      emit(obj, 'foo');

      // whatever the dedup semantics, the listener must not survive three
      // emits still subscribed
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });

  // The retention window of a once() is set by what a dispatch actually
  // called. An event name that only matches an inherited Object.prototype
  // member calls nothing, so the subscription stays — and keeps holding the
  // listener object — until it is either answered or released by hand.
  describe('a once() whose event name only matches Object.prototype', () => {
    it('stays subscribed, so the emitter keeps holding the listener object', () => {
      const obj = eventize();
      const listenerObject = {};

      const unsubscribe = once(obj, 'toString', listenerObject);
      const listener = latestListener(obj);
      emit(obj, 'toString');

      expect(getSubscriptionCount(obj)).toBe(1);
      expect(listener.listener).toBe(listenerObject);

      unsubscribe();
      expect(getSubscriptionCount(obj)).toBe(0);
      expect(listener.listener).toBeNull();
    });

    it('is released by the emit() fallback when the object has one', () => {
      const obj = eventize();
      const listenerObject = {emit: fake()};

      once(obj, 'toString', listenerObject);
      emit(obj, 'toString');

      expect(listenerObject.emit.calledOnceWith('toString')).toBe(true);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });

  describe('wildcard', () => {
    it('retain(ε, "*") is rejected, so a wildcard subscribe cannot recurse', () => {
      const obj = eventize();
      expect(() => retain(obj, '*')).toThrow();
      expect(() => on(obj, '*', fake())).not.toThrow();
    });
  });

  describe('handle lifetime', () => {
    it('a consumed handle holds no listener references', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};
      const unsubscribe = on(obj, 'foo', listenerObject);
      const listener = latestListener(obj);

      unsubscribe();

      expect(listener.listener).toBeNull();
      expect(listener.listenerObject).toBeNull();
    });

    it('an array of consumed handles releases everything', () => {
      const obj = eventize();
      const subs: Array<() => void> = [];
      const objects = Array.from({length: 50}, (_, i) => ({
        [`e-${i}`]: fake(),
      }));

      const listeners: EventListener[] = [];
      objects.forEach((lo, i) => {
        subs.push(on(obj, `e-${i}`, lo));
        listeners.push(latestListener(obj));
      });
      expect(getSubscriptionCount(obj)).toBe(50);

      subs.forEach((u) => u());

      expect(getSubscriptionCount(obj)).toBe(0);
      listeners.forEach((l) => {
        expect(l.listener).toBeNull();
      });
    });

    it('a de-duplicated subscription is not released until the LAST handle calls back', () => {
      const obj = eventize();
      const service = {foo: fake()};

      const h1 = on(obj, 'foo', service);
      const shared = latestListener(obj);
      const h2 = on(obj, 'foo', service); // dedups onto `shared`, refCount = 2
      expect(getSubscriptionCount(obj)).toBe(1);
      expect(latestListener(obj)).toBe(shared); // no second listener was built

      h1();

      // decremented, but not detached — the shared listener is still live
      expect(getSubscriptionCount(obj)).toBe(1);
      expect(shared.listener).not.toBeNull();

      h2();

      // only the last outstanding handle actually releases the reference
      expect(getSubscriptionCount(obj)).toBe(0);
      expect(shared.listener).toBeNull();
    });

    it('onceAsync with an aborted signal leaves nothing behind', async () => {
      const obj = eventize();
      const controller = new AbortController();
      const promise = onceAsync(obj, 'never', {signal: controller.signal});

      controller.abort();
      await expect(promise).rejects.toMatchObject({name: 'AbortError'});

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('once() detaches its listener the moment it fires', () => {
      const obj = eventize();
      once(obj, 'foo', fake());
      const listener = latestListener(obj);

      expect(listener.listener).not.toBeNull();

      emit(obj, 'foo');

      // once() already auto-unsubscribed after firing, so the registration is
      // detached even though nobody called the handle.
      expect(listener.listener).toBeNull();
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('once(ε, [names]) detaches every listener it registered', () => {
      const obj = eventize();
      const handle = once(obj, ['foo', 'bar'], fake());
      const listeners = latestListenerPair(obj);

      expect(getSubscriptionCount(obj)).toBe(2);

      handle();

      expect(getSubscriptionCount(obj)).toBe(0);
      listeners.forEach((l) => {
        expect(l.listener).toBeNull();
      });
    });
  });

  describe('a consumed handle releases the emitter itself', () => {
    // Each helper builds its emitter inside its own frame and hands back only
    // a WeakRef (plus, where the case calls for it, the handle). By the time
    // the assertion runs, the test frame holds no reference to the emitter —
    // anything still keeping it alive is held by the handle, not by the spec.

    const releaseAndDropHandle = (): WeakRef<object> => {
      const obj = eventize();
      const unsubscribe = on(obj, 'foo', () => {});
      unsubscribe();
      return new WeakRef(obj);
    };

    const releaseAndKeepHandle = () => {
      const obj = eventize();
      const unsubscribe = on(obj, 'foo', () => {});
      unsubscribe();
      return {handle: unsubscribe, ref: new WeakRef(obj)};
    };

    const retainPayloadAndKeepUnrelatedHandle = () => {
      const obj = eventize();
      const payload = {buffer: new Uint8Array(8 * 1024)};

      retain(obj, 'config');
      emit(obj, 'config', payload);

      // A handle for a completely different event name — it never touched
      // 'config', yet it closes over the emitter that keeps the payload.
      const unsubscribe = on(obj, 'unrelated', () => {});
      unsubscribe();

      return {handle: unsubscribe, ref: new WeakRef(payload)};
    };

    it('the emitter is collectable once the consumed handle is dropped (control)', async () => {
      // The control group: if this one ever fails, the GC harness is broken
      // and the assertions below prove nothing.
      expect(await collect(releaseAndDropHandle())).toMatch(/^collected/);
    });

    it('the emitter is collectable while the consumed handle is kept', async () => {
      const {handle, ref} = releaseAndKeepHandle();

      const verdict = await collect(ref);

      // Touch the handle *after* the collection rounds, so it is provably
      // still reachable while they run.
      expect(typeof handle).toBe('function');
      expect(verdict).toMatch(/^collected/);
    });

    it('a retained payload is collectable while a handle for another event is kept', async () => {
      const {handle, ref} = retainPayloadAndKeepUnrelatedHandle();

      const verdict = await collect(ref);

      expect(typeof handle).toBe('function');
      expect(verdict).toMatch(/^collected/);
    });

    it('the consumed handle is a bare function', () => {
      const obj = eventize();
      const listenerObject = {foo: fake()};
      const unsubscribe = on(obj, 'foo', listenerObject);
      const listener = latestListener(obj);

      unsubscribe();

      // The handle used to hand the detached EventListener back as
      // `.listener`. It carries nothing now — the detachment it used to make
      // visible is asserted on the registration itself.
      expect(Object.keys(unsubscribe)).toEqual([]);
      expect(listener.listener).toBeNull();

      const multi = on(obj, ['a', 'b'], listenerObject);
      const pair = latestListenerPair(obj);
      multi();

      expect(Object.keys(multi)).toEqual([]);
      pair.forEach((l) => {
        expect(l.listener).toBeNull();
      });
    });

    // A consumed handle releases the emitter even when the call only
    // decremented a shared reference count and the surviving listener leads
    // straight back to the emitter. That second half is new: up to v5.1.0 the
    // handle went on holding the listener, both through the `.listener`
    // property and through the closure capture behind it.
    //
    // Neither helper may hand the listener back. The whole question is what
    // the *handle* still reaches, and a listener held by the test frame keeps
    // the emitter alive on its own — which would make both assertions below
    // pass for the wrong reason.
    it('a consumed handle releases the emitter even when the surviving listener leads back to it', async () => {
      const plainSharedRegistration = () => {
        const obj = eventize();
        const listenerObject = {foo: () => {}};
        const first = on(obj, 'foo', listenerObject);
        on(obj, 'foo', listenerObject); // dedups, refCount = 2
        first(); // decrements to 1, detaches nothing
        return {handle: first, ref: new WeakRef(obj)};
      };

      const shared = plainSharedRegistration();
      const sharedVerdict = await collect(shared.ref);

      expect(typeof shared.handle).toBe('function');
      expect(sharedVerdict).toMatch(/^collected/);

      // The hard case: the surviving listener *is* the emitter, subscribed as
      // its own listener object. Consuming one of the two deduplicated handles
      // takes the count from 2 to 1 and detaches nothing, which used to leave
      // the chain handle -> closure -> listener -> listener object -> ε hanging
      // off the consumed handle. Nulling the capture cuts it at the first link.
      //
      // Up to the aggregation change this case was built from an on() that
      // deduplicated onto a pending once(), reading the back-reference through
      // callAfterApply. That hook now closes over the store, which holds no
      // reference back to the emitter, so the chain it tested no longer exists.
      const selfSubscribedTwice = () => {
        const obj = eventize();
        on(obj, 'foo', obj);
        const handle = on(obj, 'foo', obj); // aggregates, refCount = 2
        handle();
        return {handle, ref: new WeakRef(obj)};
      };

      const selfSubscribed = selfSubscribedTwice();
      const selfVerdict = await collect(selfSubscribed.ref);

      expect(typeof selfSubscribed.handle).toBe('function');
      expect(selfVerdict).toMatch(/^collected/);
    });

    // The control group for the case above. Without it, `collected` proves
    // nothing: an emitter nobody holds is collected whether or not the handle
    // releases anything. Here the handle is never called, so it must still
    // pin the emitter — if this one ever reports `collected`, the assertions
    // above are measuring an emitter that was already unreachable.
    it('an unconsumed handle still pins the emitter (control)', async () => {
      const keepUnconsumed = () => {
        const obj = eventize();
        const handle = on(obj, 'foo', {foo: () => {}});
        return {handle, ref: new WeakRef(obj)};
      };

      const kept = keepUnconsumed();
      const verdict = await collect(kept.ref);

      expect(typeof kept.handle).toBe('function');
      // A bare /^still reachable/ would also match a dead collector, which
      // would turn the one test asserting *not collected* green by accident.
      expect(verdict).toMatch(/^still reachable.*harness ok/);
    });
  });

  describe('the store empties its buckets', () => {
    it('leaves no empty named-listener buckets behind', () => {
      const obj = eventize();
      const store = storeOf(obj);

      for (let i = 0; i < 200; i++) {
        const unsubscribe = on(obj, `e-${i}`, fake());
        unsubscribe();
      }

      expect(store.namedListeners.size).toBe(0);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });
});
