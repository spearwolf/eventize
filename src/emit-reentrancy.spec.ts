import {fake} from 'sinon';

import {storeOf} from './__test-utils__/listeners';
import {
  emit,
  eventize,
  getSubscriptionCount,
  off,
  on,
  once,
  retain,
} from './index';

describe('emit() re-entrancy (sub/unsub during dispatch)', () => {
  describe('unsubscribe during emit', () => {
    it('does NOT invoke a peer listener that was unsubscribed mid-dispatch', () => {
      // Removal during iteration cannot break the loop: since v6.0.0
      // EventStore.forEach walks the live bucket and a mid-dispatch removal
      // clones it, so the walk keeps an array nobody splices. The removed
      // listener is therefore still in the array being walked — what skips it
      // is EventListener.apply's `isRemoved` short-circuit, which is a
      // separate guarantee and the one this case measures.
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

    // `off(ε, name)` empties the bucket and drops the map entry, and truncates
    // the array on top of that as a courtesy to anyone still holding it from
    // `EventStore.getListenersForEventName()`. That truncation is the one thing
    // a walk stepping through that very array must not suffer, so the store
    // skips it exactly then — and this is the only shape that proves it. A
    // *merge* dispatch reads the named bucket's length once, up front, and
    // interleaves it with the wildcard bucket by priority; empty that array
    // from inside the walk and the merge reads past its own end, where the hole
    // guard turns a truncated bucket into an `Error` thrown out of `emit()`.
    // The `off(ε)` case two tests up looks similar and is not: it clears the
    // whole store, and the wildcard array it swaps for a fresh one is guarded
    // separately.
    it('survives off(ε, name) for the very name being dispatched, alongside a wildcard listener', () => {
      const ε = eventize();
      const calls: string[] = [];

      on(ε, '*', 0, (n) => {
        calls.push('w:' + String(n));
      });
      on(ε, 'foo', 10, () => {
        calls.push('a');
        off(ε, 'foo');
      });
      on(ε, 'foo', 5, () => {
        calls.push('b');
      });

      expect(() => emit(ε, 'foo', 1)).not.toThrow();

      // 'b' is skipped because it was detached, not because the array shrank —
      // the walk still steps over its slot. The wildcard listener, queued
      // behind it in the merge, is exactly what a truncated bucket loses.
      expect(calls).toEqual(['a', 'w:1']);
      expect(getSubscriptionCount(ε)).toBe(1);
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
  // test in the first describe of this file — wildcard-emit.spec.ts's
  // 'emit() re-entrancy' describe exercises forwarding, serial emits and a
  // throwing listener, not sub/unsub during dispatch, so it does not cover
  // this. (Named, not numbered: the line reference this replaces had drifted
  // by eleven lines.)
  describe('catch-em-all-only dispatch (no named listeners for this event)', () => {
    // These three describe observable outcomes that survive the removal of
    // every copy in the dispatch path, on either side of the fence. What
    // carries the first two is `EventListener.apply()`'s `isRemoved`
    // short-circuit (EventListener.ts): an unsubscribed listener is skipped
    // because it was detached, not because the array it sits in changed —
    // `off(ε, '*')` does not truncate the array a walk is stepping through
    // (`EventStore.removeAllListeners()` hands the store a fresh one instead,
    // leaving the walked array intact and every entry in it detached). The
    // third is carried by `Array.prototype.forEach`, which fixes `length`
    // before it starts: an entry landing at or beyond that length is never
    // reached, whether or not anything was copied. Note which way round that
    // runs — the frozen length says nothing about a splice *below* the walk's
    // current position, which shifts everything after it and is exactly what
    // the two tests following this block are about. These three pin real
    // behaviour, but none of them would fail if the mid-walk protection were
    // removed altogether.
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

    // These two DO pin the mid-walk protection, whatever it is implemented
    // with. An in-place splice shifts every later element's index down by one,
    // so a walk over the array being spliced skips the element that moved into
    // an index it has already passed — not because that element was removed,
    // but because the removal of an earlier one moved it out from under the
    // walk. Up to v5.1.0 `forEach()` bought immunity by copying the bucket
    // before iterating; since v6.0.0 it walks the live array and declares that
    // it is holding it, so a mutation of *that* array copies instead
    // (`EventStore.bucketForMutation()`) and leaves the walk with something
    // nothing can splice. Same guarantee, opposite side of the fence — and
    // these two fail if either mechanism is removed.
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

  // Every case above states an outcome — who ran, who didn't — and would pass
  // whether forEach() copies the bucket up front or the store copies it on
  // mutation (v6.0.0). These say which of the two is in place, and
  // how much of it happens, through the one thing the choice is observable in:
  // the identity of the array the store holds for the event name.
  describe('bucket identity across a real emit()', () => {
    it('does not copy the listener bucket when the dispatch mutates nothing', () => {
      const ε = eventize();
      on(ε, 'foo', () => {});
      const store = storeOf(ε);
      const before = store.namedListeners.get('foo');

      emit(ε, 'foo', 1);
      emit(ε, 'foo', 2);

      expect(store.namedListeners.get('foo')).toBe(before);
    });

    it('copies the bucket once for a burst of once() listeners, not once per listener', () => {
      // Every fired once() releases itself from inside the dispatch, so a
      // store that copied per mutation instead of per walk would copy the
      // whole bucket n times for n one-shot listeners — quadratic in exactly
      // the pattern one-shot subscriptions are used for.
      const ε = eventize();
      const store = storeOf(ε);
      const seen: Array<unknown> = [];
      const probe = () => seen.push(store.namedListeners.get('foo'));

      once(ε, 'foo', probe);
      once(ε, 'foo', probe);
      once(ε, 'foo', probe);
      const before = store.namedListeners.get('foo');

      emit(ε, 'foo');

      expect(seen).toHaveLength(3);
      expect(seen[0]).toBe(before); // nothing has been released yet
      expect(seen[1]).not.toBe(before); // the first one released itself
      expect(seen[2]).toBe(seen[1]); // the second one reused that copy
      expect(getSubscriptionCount(ε)).toBe(0);
    });

    it('copies the listener bucket when a listener subscribes mid-dispatch', () => {
      const ε = eventize();
      on(ε, 'foo', 10, () => {
        on(ε, 'foo', 5, () => {});
      });
      const store = storeOf(ε);
      const before = store.namedListeners.get('foo');

      emit(ε, 'foo', 1);

      expect(store.namedListeners.get('foo')).not.toBe(before);
      expect(before).toHaveLength(1);
      expect(getSubscriptionCount(ε)).toBe(2);
    });

    // The documented teardown form (docs/off.md): one object unsubscribes from
    // everything at once, from inside a dispatch. It touches as many buckets
    // as the object had subscriptions — and a copy per *touched* bucket rather
    // than per *walked* one turns the cheapest cleanup call in the API into
    // the most expensive one.
    it('copies only the bucket being walked when a listener object detaches from many events', () => {
      const ε = eventize();
      const component = {
        alpha() {},
        beta() {},
        gamma() {},
      };
      on(ε, 'alpha', component);
      on(ε, 'beta', component);
      on(ε, 'gamma', component);
      on(ε, 'teardown', () => {
        off(ε, component);
      });

      const store = storeOf(ε);
      const before = {
        alpha: store.namedListeners.get('alpha'),
        teardown: store.namedListeners.get('teardown'),
      };

      emit(ε, 'teardown');

      expect(getSubscriptionCount(ε)).toBe(1); // the teardown listener itself
      // Emptied in place: the array captured before the emit is the one that
      // was spliced, so no copy of it was ever made.
      expect(before.alpha).toHaveLength(0);
      // The walked bucket is the exception, and stays intact under its walk.
      expect(before.teardown).toHaveLength(1);
    });
  });

  describe('once() re-entrancy', () => {
    // EventListener.apply() settles a once() obligation only after the
    // callback returns (EventListener.ts, callAfterApply). A
    // callback that re-emits its own event before returning is therefore
    // dispatched to its own listener a second time, while that listener is
    // still fully subscribed — the "at most one call" promise breaks under
    // self re-emission. Deliberate: it falls out of two decisions kept on
    // purpose elsewhere (no recursion guard, and a throwing listener keeps
    // its one-shot) rather than a defect of its own. See docs/lifecycle.md.
    it('fires twice when its own callback re-emits the same event before returning', () => {
      const ε = eventize();
      let calls = 0;

      once(ε, 'ping', () => {
        calls += 1;
        if (calls === 1) {
          emit(ε, 'ping'); // re-entrant: this once() has not settled yet
        }
      });

      emit(ε, 'ping');

      expect(calls).toBe(2);
      // settled once the re-entrant call unwinds, not left dangling
      expect(getSubscriptionCount(ε)).toBe(0);

      emit(ε, 'ping');
      expect(calls).toBe(2); // truly gone afterwards
    });

    // The way out, and the reason the case above is documented rather than
    // guarded: the caller already holds something that settles the one-shot
    // early. Releasing the handle detaches the listener from the store before
    // the nested walk starts, so the re-entrant emit finds nothing to call —
    // no recursion guard needed for a callback that knows it re-enters.
    it('does not fire twice when the callback releases its handle before re-emitting', () => {
      const ε = eventize();
      let calls = 0;

      const unsubscribe = once(ε, 'ping', () => {
        calls += 1;
        unsubscribe();
        if (calls === 1) {
          emit(ε, 'ping');
        }
      });

      emit(ε, 'ping');

      expect(calls).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(0);
    });
  });

  describe('retain order under nested emit()', () => {
    // _emitOne() (emit-api.ts) calls keeper.retain() only *after*
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
