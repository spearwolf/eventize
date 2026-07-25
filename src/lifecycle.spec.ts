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

    it('off(ε, undefined) also leaves retained state untouched, on its way to wiping every listener', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');
      on(obj, 'foo', fake());

      off(obj, undefined);

      expect(getSubscriptionCount(obj)).toBe(0);
      expect(getRetainedCount(obj)).toBe(1);
      expect(getRetainedEventNames(obj)).toEqual(['foo']);
    });

    it('off(ε) — the bare form — leaves retained state untouched', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');
      on(obj, 'foo', fake());

      off(obj);

      expect(getSubscriptionCount(obj)).toBe(0);
      expect(getRetainedCount(obj)).toBe(1);
      expect(getRetainedEventNames(obj)).toEqual(['foo']);
    });

    it('off(ε, "*") also leaves retained state untouched, just like the bare form', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');
      on(obj, 'foo', fake());

      off(obj, '*');

      expect(getSubscriptionCount(obj)).toBe(0);
      expect(getRetainedCount(obj)).toBe(1);
      expect(getRetainedEventNames(obj)).toEqual(['foo']);
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
    // MEM-002: two once() calls on the same listener object collapse into one
    // EventListener with refCount = 2, and the surviving handle is blocked by
    // its own idempotence guard. Fixed in v6.0.0 — task 24 flips this back to
    // a normal `it`.
    it.failing('does not degenerate into a permanent listener', () => {
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
      const unsubscribe = on(obj, 'foo', listenerObject) as any;

      unsubscribe();

      expect(unsubscribe.listener.listener).toBeNull();
      expect(unsubscribe.listener.listenerObject).toBeNull();
    });

    it('an array of consumed handles releases everything', () => {
      const obj = eventize();
      const subs: Array<() => void> = [];
      const objects = Array.from({length: 50}, (_, i) => ({
        [`e-${i}`]: fake(),
      }));

      objects.forEach((lo, i) => subs.push(on(obj, `e-${i}`, lo)));
      expect(getSubscriptionCount(obj)).toBe(50);

      subs.forEach((u) => u());

      expect(getSubscriptionCount(obj)).toBe(0);
      subs.forEach((u) => {
        expect((u as any).listener.listener).toBeNull();
      });
    });

    it('a de-duplicated subscription is not released until the LAST handle calls back', () => {
      const obj = eventize();
      const service = {foo: fake()};

      const h1 = on(obj, 'foo', service) as any;
      const h2 = on(obj, 'foo', service) as any; // shares one EventListener, refCount = 2
      expect(getSubscriptionCount(obj)).toBe(1);

      h1();

      // decremented, but not detached — the shared listener is still live
      expect(getSubscriptionCount(obj)).toBe(1);
      expect(h1.listener.listener).not.toBeNull();

      h2();

      // only the last outstanding handle actually releases the reference
      expect(getSubscriptionCount(obj)).toBe(0);
      expect(h1.listener.listener).toBeNull();
      expect(h2.listener.listener).toBeNull();
    });

    it('onceAsync with an aborted signal leaves nothing behind', async () => {
      const obj = eventize();
      const controller = new AbortController();
      const promise = onceAsync(obj, 'never', {signal: controller.signal});

      controller.abort();
      await expect(promise).rejects.toMatchObject({name: 'AbortError'});

      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('once() returns a handle carrying .listener, released once consumed', () => {
      const obj = eventize();
      const handle = once(obj, 'foo', fake()) as any;

      expect(handle.listener).not.toBeNull();

      emit(obj, 'foo');

      // once() already auto-unsubscribed after firing — the handle is a
      // no-op now, but it still carries the (detached) listener reference.
      expect(handle.listener.listener).toBeNull();
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('once(ε, [names]) returns a handle carrying .listeners, all released', () => {
      const obj = eventize();
      const handle = once(obj, ['foo', 'bar'], fake()) as any;

      expect(Array.isArray(handle.listeners)).toBe(true);
      expect(handle.listeners).toHaveLength(2);

      handle();

      expect(getSubscriptionCount(obj)).toBe(0);
      handle.listeners.forEach((l: any) => {
        expect(l.listener).toBeNull();
      });
    });
  });

  describe('the store empties its buckets', () => {
    it('leaves no empty named-listener buckets behind', () => {
      const obj = eventize() as any;
      const store = obj[Symbol.for('eventize')].store;

      for (let i = 0; i < 200; i++) {
        const unsubscribe = on(obj, `e-${i}`, fake());
        unsubscribe();
      }

      expect(store.namedListeners.size).toBe(0);
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });
});
