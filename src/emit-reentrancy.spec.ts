import {fake} from 'sinon';

import {emit, eventize, getSubscriptionCount, off, on} from './index';

describe('emit() re-entrancy (sub/unsub during dispatch)', () => {
  describe('unsubscribe during emit', () => {
    it('does NOT invoke a peer listener that was unsubscribed mid-dispatch', () => {
      // EventStore.forEach clones the listener array, so removal during
      // iteration cannot break the loop. But EventListener.apply also checks
      // `isRemoved` and short-circuits, so an unsubscribed listener is skipped
      // even though it is still in the cloned snapshot.
      const ε = eventize();
      const b = fake();

      on(ε, 'foo', 10, () => {
        off(ε, b);
      });
      on(ε, 'foo', 5, b);

      emit(ε, 'foo', 'x');

      expect(b.called).toBe(false);
      expect(getSubscriptionCount(ε)).toBe(1); // only listener A remains
    });

    it('still invokes earlier listeners that already ran before the unsubscribe', () => {
      const ε = eventize();
      const calls: string[] = [];

      on(ε, 'foo', 10, () => {
        calls.push('high');
      });
      on(ε, 'foo', 5, () => {
        calls.push('mid');
        off(ε, 'foo'); // remove ALL 'foo' listeners
      });
      on(ε, 'foo', 0, () => {
        calls.push('low');
      });

      emit(ε, 'foo');

      expect(calls).toEqual(['high', 'mid']);
    });

    it('completes iteration cleanly when off(ε) wipes everything mid-dispatch', () => {
      const ε = eventize();
      const calls: string[] = [];

      on(ε, 'foo', 10, () => {
        calls.push('first');
        off(ε); // wipe all listeners (named + catch-em-all)
      });
      on(ε, 'foo', 5, () => {
        calls.push('second');
      });
      on(ε, '*', 5, () => {
        calls.push('catch-all');
      });

      expect(() => emit(ε, 'foo', 'payload')).not.toThrow();

      expect(calls).toEqual(['first']);
      expect(getSubscriptionCount(ε)).toBe(0);
    });

    it('a listener that unsubscribes itself still completes the current invocation', () => {
      const ε = eventize();
      let runs = 0;
      const unsub = on(ε, 'foo', () => {
        runs += 1;
        unsub();
      });

      emit(ε, 'foo');
      expect(runs).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(0);

      // and is gone for subsequent emits
      emit(ε, 'foo');
      expect(runs).toBe(1);
    });
  });

  describe('subscribe during emit', () => {
    it('does NOT invoke a listener that was added mid-dispatch for the current emit', () => {
      const ε = eventize();
      const c = fake();

      on(ε, 'foo', 10, () => {
        on(ε, 'foo', 5, c);
      });

      emit(ε, 'foo', 'x');

      expect(c.called).toBe(false);
      expect(getSubscriptionCount(ε)).toBe(2);
    });

    it('invokes the newly-added listener on subsequent emits', () => {
      const ε = eventize();
      const c = fake();
      let added = false;

      on(ε, 'foo', () => {
        if (!added) {
          on(ε, 'foo', c);
          added = true;
        }
      });

      emit(ε, 'foo', 'first');
      expect(c.called).toBe(false);

      emit(ε, 'foo', 'second');
      expect(c.callCount).toBe(1);
      expect(c.firstCall.args).toEqual(['second']);
    });

    it('does not invoke a catch-em-all listener that was added mid-dispatch', () => {
      const ε = eventize();
      const catchAll = fake();

      on(ε, 'foo', () => {
        on(ε, '*', catchAll);
      });

      emit(ε, 'foo', 1);
      expect(catchAll.called).toBe(false);

      emit(ε, 'foo', 2);
      expect(catchAll.callCount).toBe(1);
    });
  });

  // No named listener is ever registered for 'foo' in this block, so
  // EventStore.forEach() takes its catch-em-all-only branch (namedListeners
  // is undefined for the emitted name). The named-only branch is covered
  // above; the merge branch is covered by this file's own
  // 'completes iteration cleanly when off(ε) wipes everything mid-dispatch'
  // test (line 46) — wildcard-emit.spec.ts's 'emit() re-entrancy' describe
  // exercises forwarding, serial emits and a throwing listener, not
  // sub/unsub during dispatch, so it does not cover this.
  describe('catch-em-all-only dispatch (no named listeners for this event)', () => {
    // These three describe observable outcomes that hold regardless of
    // whether forEach() copies the bucket first: EventListener.apply() skips
    // an already-removed listener on its own (isRemoved short-circuit,
    // EventListener.ts), off('*') truncates the array so the tail is simply
    // gone, and Array.prototype.forEach freezes `length` before it starts so
    // a mid-walk append is invisible either way. They pin real behaviour,
    // but none of them would fail if the copy-before-walk protection below
    // were removed — see the two tests after this block for that.
    it('does NOT invoke a catch-all peer that was unsubscribed mid-dispatch', () => {
      const ε = eventize();
      const b = fake();

      on(ε, '*', 10, () => {
        off(ε, b);
      });
      on(ε, '*', 5, b);

      emit(ε, 'foo', 'x');

      expect(b.called).toBe(false);
      expect(getSubscriptionCount(ε)).toBe(1); // only the high-priority listener remains
    });

    it('still invokes earlier catch-all listeners that already ran before the unsubscribe', () => {
      const ε = eventize();
      const calls: string[] = [];

      on(ε, '*', 10, () => {
        calls.push('high');
      });
      on(ε, '*', 5, () => {
        calls.push('mid');
        off(ε, '*'); // remove ALL catch-all listeners
      });
      on(ε, '*', 0, () => {
        calls.push('low');
      });

      emit(ε, 'foo');

      expect(calls).toEqual(['high', 'mid']);
    });

    it('does NOT invoke a catch-all listener that was added mid-dispatch', () => {
      const ε = eventize();
      const c = fake();

      on(ε, '*', 10, () => {
        on(ε, '*', 5, c);
      });

      emit(ε, 'foo', 'x');

      expect(c.called).toBe(false);
      expect(getSubscriptionCount(ε)).toBe(2);
    });

    // These two DO pin the copy-before-walk protection. A splice on the live
    // array shifts every later element's index down by one; a plain
    // `catchEmAllListeners.forEach(fn)` over the live array would then miss
    // the element that shifted into an index forEach has already passed —
    // not because that element was itself removed, but because the removal
    // of an earlier element moved it out from under the walk. Copying the
    // bucket before iterating means later removals can't move the elements
    // the walk hasn't visited yet.
    it('a catch-all listener that unsubscribes itself does not cause a still-pending peer to be skipped', () => {
      const ε = eventize();
      const calls: string[] = [];

      const unsubA = on(ε, '*', 10, () => {
        calls.push('a');
        unsubA();
      });
      on(ε, '*', 5, () => {
        calls.push('b');
      });

      emit(ε, 'foo');

      expect(calls).toEqual(['a', 'b']);
    });

    it('unsubscribing an already-run catch-all peer does not cause a still-pending listener to be skipped', () => {
      const ε = eventize();
      const calls: string[] = [];

      const unsubA = on(ε, '*', 10, () => {
        calls.push('a');
      });
      on(ε, '*', 5, () => {
        calls.push('b');
        unsubA(); // removes 'a', which already ran — shifts 'c' down in the live array
      });
      on(ε, '*', 0, () => {
        calls.push('c');
      });

      emit(ε, 'foo');

      expect(calls).toEqual(['a', 'b', 'c']);
    });
  });
});
