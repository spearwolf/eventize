import {fake} from 'sinon';

import {emit, eventize, getSubscriptionCount, off, on, retain} from './index';

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

  describe('retain order under nested emit()', () => {
    // _emitOne() (eventize-api.ts) calls keeper.retain() only *after*
    // store.forEach() returns — that ordering is what lets a throwing
    // listener leave the previously retained value untouched (docs/retain.md:
    // "the retain write happens after all listeners have run"). The same
    // ordering has a broader consequence than same-event recursion: *any*
    // emit() call that is still nested inside another when it finishes
    // writes its retain state before the enclosing call does, regardless of
    // whether the two calls share an event name. The ordinary way to nest
    // one emit() inside another is forwarding — a listener that relays one
    // event as another, synchronously, before returning.
    it('retains forwarded events in completion order, not emission order, when a listener forwards to a different event', () => {
      const ε = eventize();
      retain(ε, 'a');
      retain(ε, 'b');

      // 'a' forwards to 'b' — the emit(ε, 'b', …) call is nested inside the
      // 'a' dispatch and returns (and retains) before it does.
      on(ε, 'a', () => emit(ε, 'b', 'B'));

      emit(ε, 'a', 'A');

      const seen: string[] = [];
      // A wildcard function listener never receives the event name — a
      // listener-object with .emit() does, and doubles as the catch-all
      // fallback for names it has no dedicated method for.
      on(ε, {emit: (name: string) => seen.push(name)});

      // 'b' was retained first (the inner, forwarded call finished first),
      // 'a' second (the outer call finished last) — the reverse of the
      // order the two events were actually emitted in.
      expect(seen).toEqual(['b', 'a']);
    });

    // Self-recursion — a listener re-emitting the *same* event name — is
    // the special case where the rule above is most surprising, because
    // both nested calls compete for a single retained slot instead of two.
    it('retains the outermost call’s args, not the innermost, after a listener re-emits the same event', () => {
      const ε = eventize();
      retain(ε, 'ping');

      on(ε, 'ping', (value: number) => {
        if (value < 2) {
          emit(ε, 'ping', value + 1);
        }
      });

      emit(ε, 'ping', 0);

      const seen: number[] = [];
      on(ε, 'ping', (value: number) => seen.push(value));

      expect(seen).toEqual([0]);
    });
  });
});
