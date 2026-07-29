import {fake} from 'sinon';

import {emit, eventize, getSubscriptionCount, on, once, retain} from './index';
import {storeOf} from './__test-utils__/listeners';

describe('on()/once() aggregate by listener identity', () => {
  describe('the registration order does not change the behaviour', () => {
    it('once() then on(): one registration, one call per emit', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      once(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('on() then once(): the same, field for field', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      on(ε, 'foo', listenerObject);
      once(ε, 'foo', listenerObject);

      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('the method-name form aggregates in both orders', () => {
      const first = eventize();
      const second = eventize();
      const a = {handler: fake()};
      const b = {handler: fake()};

      once(first, 'foo', 'handler', a);
      on(first, 'foo', 'handler', a);

      on(second, 'foo', 'handler', b);
      once(second, 'foo', 'handler', b);

      expect(getSubscriptionCount(first)).toBe(1);
      expect(getSubscriptionCount(second)).toBe(1);

      emit(first, 'foo');
      emit(second, 'foo');

      expect(a.handler.callCount).toBe(1);
      expect(b.handler.callCount).toBe(1);
      expect(getSubscriptionCount(first)).toBe(1);
      expect(getSubscriptionCount(second)).toBe(1);
    });

    it('the catch-em-all form aggregates in both orders', () => {
      const first = eventize();
      const second = eventize();
      const a = {foo: fake()};
      const b = {foo: fake()};

      once(first, a);
      on(first, a);

      on(second, b);
      once(second, b);

      expect(getSubscriptionCount(first)).toBe(1);
      expect(getSubscriptionCount(second)).toBe(1);

      emit(first, 'foo');
      emit(second, 'foo');

      expect(a.foo.callCount).toBe(1);
      expect(b.foo.callCount).toBe(1);
    });
  });

  describe('two once() registrations', () => {
    it('collapse into one obligation and one call', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      once(ε, 'foo', listenerObject);
      once(ε, 'foo', listenerObject);

      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(0);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
    });

    it('a duplicated event name in one call aggregates onto itself', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      once(ε, ['foo', 'foo'], listenerObject);

      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(0);
    });
  });

  describe('a multi-name once() shares one obligation across its listeners', () => {
    // once(ε, ['a', 'b'], h) is a race: whichever name fires first discharges
    // the obligation for both. This case is the one where discharging it must
    // not be the same as detaching every member — 'b' also carries an on()
    // registration on the very listener the obligation was added to, and that
    // listener has to survive the race the once() half of it just lost.
    it('a sibling aggregated onto an existing on() survives the race, the other member is dropped', () => {
      const ε = eventize();
      const h = {a: fake(), b: fake()};

      on(ε, 'b', h);
      once(ε, ['a', 'b'], h);

      expect(getSubscriptionCount(ε)).toBe(2);

      emit(ε, 'a');

      // the obligation is discharged for both 'a' and 'b' alike, but 'b' is
      // still held up by its own on() — only 'a', which had nothing else
      // keeping it alive, is actually dropped from the registry
      expect(h.a.callCount).toBe(1);
      expect(h.b.callCount).toBe(0);
      expect(getSubscriptionCount(ε)).toBe(1);

      // 'b' still dispatches, through the on() alone — the once() half of it
      // is spent, not the listener itself
      emit(ε, 'b');
      expect(h.b.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'a');
      expect(h.a.callCount).toBe(1); // 'a' is gone; no further calls
    });
  });

  describe('the handles stay independent', () => {
    it('releasing the once() handle leaves the on() registration', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsubOnce = once(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      unsubOnce();
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
    });

    it('releasing the on() handle leaves the once() obligation', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      once(ε, 'foo', listenerObject);
      const unsubOn = on(ε, 'foo', listenerObject);

      unsubOn();
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(0);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
    });

    it('releasing both detaches the listener', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsubOnce = once(ε, 'foo', listenerObject);
      const unsubOn = on(ε, 'foo', listenerObject);

      unsubOnce();
      unsubOn();

      expect(getSubscriptionCount(ε)).toBe(0);
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(0);
    });

    it('a once() handle is inert once the dispatch discharged it', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsubOnce = once(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      emit(ε, 'foo');
      unsubOnce();

      expect(getSubscriptionCount(ε)).toBe(1);
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
    });

    it('a spent once() handle does not discharge a later obligation', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const unsubOnce = once(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      emit(ε, 'foo');
      once(ε, 'foo', listenerObject);
      unsubOnce();

      // unsubOnce() holds the *first* once()'s obligation, which the emit
      // above already discharged — releaseObligation() bails on `settled` and
      // never touches the listener at all. The second once() made its own,
      // fresh obligation, and that one is still standing: it is discharged by
      // the emit below, not by a handle that was never released to it.
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('calling a handle twice stays inert', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      const first = on(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      first();
      first();

      expect(getSubscriptionCount(ε)).toBe(1);
      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
    });
  });

  describe('what does not aggregate', () => {
    it('two different priorities stay two registrations', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      once(ε, 'foo', listenerObject);
      on(ε, 'foo', 10, listenerObject);

      expect(getSubscriptionCount(ε)).toBe(2);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('two different listener objects stay two registrations', () => {
      const ε = eventize();
      const a = {foo: fake()};
      const b = {foo: fake()};

      once(ε, 'foo', a);
      on(ε, 'foo', b);

      expect(getSubscriptionCount(ε)).toBe(2);
    });

    it('function listeners never aggregate', () => {
      const ε = eventize();
      const listener = fake();

      once(ε, 'foo', listener);
      on(ε, 'foo', listener);

      expect(getSubscriptionCount(ε)).toBe(2);

      emit(ε, 'foo');
      expect(listener.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('two different event names stay two registrations', () => {
      const ε = eventize();
      const listenerObject = {foo: fake(), bar: fake()};

      once(ε, 'foo', listenerObject);
      on(ε, 'bar', listenerObject);

      expect(getSubscriptionCount(ε)).toBe(2);
    });
  });

  describe('retained events', () => {
    it('a once() aggregating onto an on() still receives the replay', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      retain(ε, 'foo');
      emit(ε, 'foo', 'RETAINED');

      on(ε, 'foo', listenerObject);
      expect(listenerObject.foo.callCount).toBe(1);

      once(ε, 'foo', listenerObject);
      expect(listenerObject.foo.callCount).toBe(2);
      expect(listenerObject.foo.calledWith('RETAINED')).toBe(true);

      // the replay discharged the obligation; the on() is what remains
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('an on() aggregating onto an on() does not replay again', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      retain(ε, 'foo');
      emit(ε, 'foo', 'RETAINED');

      on(ε, 'foo', listenerObject);
      on(ε, 'foo', listenerObject);

      expect(listenerObject.foo.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(1);
    });

    it('a once() on a retained event never reaches an aggregate', () => {
      const ε = eventize();
      const listenerObject = {foo: fake()};

      retain(ε, 'foo');
      emit(ε, 'foo', 'RETAINED');

      // the first obligation is discharged by its own replay, before the
      // second registration exists — so both insert, and both replay
      once(ε, 'foo', listenerObject);
      once(ε, 'foo', listenerObject);

      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(0);
    });
  });

  describe('settlement inside a running dispatch', () => {
    it('clones the bucket the walk is holding', () => {
      const ε = eventize();
      const persistent = {foo: fake()};
      const oneShot = {foo: fake()};

      on(ε, 'foo', persistent);
      once(ε, 'foo', oneShot);

      const before = storeOf(ε).getListenersForEventName('foo');
      expect(before).toHaveLength(2);

      emit(ε, 'foo');

      const after = storeOf(ε).getListenersForEventName('foo');
      expect(after).not.toBe(before);
      expect(after).toHaveLength(1);
      // the array the walk stepped through is left intact
      expect(before).toHaveLength(2);
      expect(persistent.foo.callCount).toBe(1);
      expect(oneShot.foo.callCount).toBe(1);
    });

    it('an aggregate subscribed from inside its own dispatch is not called twice', () => {
      const ε = eventize();
      const listenerObject = {
        foo: fake(() => {
          on(ε, 'foo', listenerObject);
        }),
      };

      once(ε, 'foo', listenerObject);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      // the on() from inside the callback aggregated onto the listener the
      // walk was dispatching, so the settlement leaves it standing
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
    });
  });
});
