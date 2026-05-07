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
});
