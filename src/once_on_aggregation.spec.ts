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

    // A once() call promises at most one invocation, retained replay
    // included — the same race as above, but triggered by subscribeTo()'s
    // own queued replays instead of a live emit(). Each name the call covers
    // queues its own replay against the one shared obligation, and
    // publishReplays() runs every one of them before returning. Without
    // a guard, whichever runs first settles the obligation through a real
    // dispatch — same as any once() firing — and every later replay in the
    // same batch would go on to call the listener again anyway, because
    // `isRemoved` never applies to a member an on() is still keeping alive.
    it('a retained replay does not fire twice through a member kept alive by on()', () => {
      const ε = eventize();
      const h = {a: fake(), b: fake()};

      retain(ε, ['a', 'b']);
      emit(ε, 'a', 'A');
      emit(ε, 'b', 'B');

      on(ε, ['a', 'b'], h);
      expect(h.a.callCount).toBe(1);
      expect(h.b.callCount).toBe(1);

      once(ε, ['a', 'b'], h);

      // One invocation for the once() call, total — not one per name it
      // covers. The pair, not the sum: 'a' replays first and settles the
      // shared obligation there, so a sum of 3 would read the same for the
      // 1-and-2 split, which is the failure this case is watching for. Both
      // listeners survive on their on() registrations either way.
      expect([h.a.callCount, h.b.callCount]).toEqual([2, 1]);
      expect(getSubscriptionCount(ε)).toBe(2);
    });

    it('a retained replay does not fire twice through a duplicated name aggregating onto an on()', () => {
      const ε = eventize();
      const h = {foo: fake()};

      retain(ε, 'foo');
      emit(ε, 'foo', 'V');

      on(ε, 'foo', h);
      expect(h.foo.callCount).toBe(1);

      once(ε, ['foo', 'foo'], h);

      // the duplicated name aggregates onto the same listener and the same
      // obligation twice, but the call still delivers exactly one invocation
      expect(h.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);
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

    // Named for what it pins: the *later* obligation survives. The spent
    // handle being inert is the `settled` guard's job, and that one is
    // asserted directly in EventStore.spec.ts — "releasing an already-settled
    // obligation is a no-op". Here it would pass with the guard gone anyway,
    // because dischargeObligation() empties `members` on its way out.
    it('a later obligation survives a handle spent on an earlier one', () => {
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

    // The tightest nesting the public API can build: a registration whose
    // retained replay runs consumer code that registers again, while that
    // outer registration has not finished answering "was I new?" for itself.
    // The two answers differ on purpose — the outer one inserts, the inner one
    // aggregates — so a decision leaking from one registration to the other is
    // visible in whichever direction it leaks: the outer would lose the replay
    // it is owed, or the inner would get one it is not.
    //
    // What this really pins is the premise `EventStore.lastAddCreatedListener`
    // rests on, namely that no consumer code runs between the write and the
    // read. Nothing in `add()` reaches consumer code today, and nothing but
    // this case would notice if something did.
    it('a subscription made from inside a retained replay keeps its own replay decision', () => {
      const ε = eventize();
      const outer = fake();
      const inner = {b: fake()};

      retain(ε, ['a', 'b']);
      emit(ε, 'a', 'A');
      emit(ε, 'b', 'B');

      // Registered up front, so the identical registration made from inside
      // the replay below aggregates onto it.
      on(ε, 'b', inner);
      expect(inner.b.callCount).toBe(1);

      on(ε, 'a', (value: string) => {
        outer(value);
        on(ε, 'b', inner);
      });

      // The outer registration inserted, so it is owed the retained value —
      // and owed it with the value, not merely a call.
      expect(outer.callCount).toBe(1);
      expect(outer.calledWith('A')).toBe(true);
      // The inner one aggregated onto a listener that has already seen 'B',
      // so an aggregating on() gets no second replay.
      expect(inner.b.callCount).toBe(1);
      expect(getSubscriptionCount(ε)).toBe(2);
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

    // The on() mirror of this case, above, keeps firing forever — refCount
    // just keeps growing, and nothing ever settles it. once() promises the
    // opposite: each dispatch must settle only the obligation that triggered
    // it, or a re-arm from inside the callback would be discharged before it
    // ever gets a chance to fire, and the once() would silently stop after
    // the first emit instead of firing once per emit indefinitely.
    it('a once() re-armed from inside its own dispatch fires again on the next emit', () => {
      const ε = eventize();
      const listenerObject = {
        foo: fake(() => {
          once(ε, 'foo', listenerObject);
        }),
      };

      once(ε, 'foo', listenerObject);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);
      // the re-arm aggregated its brand-new obligation onto the listener the
      // walk was still dispatching — settlement must leave that one alone
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(3);
    });

    // The settlement boundary is a stamped sequence number, not a position in
    // onceObligations — it has to be, because releasing a handle can splice an
    // obligation out of the *middle* of that array. Here the handler releases
    // its own (already-fired-adjacent) once() handle and arms a fresh once()
    // in the same breath: the release empties the array before the re-arm
    // refills it, so the new obligation lands in the same slot the old one
    // just vacated. A position-based cutoff would settle it as if it had been
    // there all along; a sequence-based one still tells them apart.
    //
    // on() is scaffolding, not the thing under test: it is what lets the
    // re-arm below find the listener still registered and aggregate onto it,
    // instead of building a second one — the shape the bug needs to
    // reproduce. Released immediately after the dispatch it was there for, so
    // everything from that point on is held up by the once() obligation alone
    // — which is what makes the bug observable through the public API at all:
    // with the on() still in place, a wrongly-discharged obligation and a
    // correctly-surviving one look identical from the outside, because the
    // listener stays registered either way.
    it('releasing one once() handle and arming another from inside the same dispatch settles only the old one', () => {
      const ε = eventize();
      // A mutable holder, not a forward-declared handle: the callback below
      // has to close over the handle its own registration produces, which
      // does not exist until listenerObject does.
      const handles: {unsubFirst?: () => void} = {};
      const listenerObject = {
        foo: fake(() => {
          handles.unsubFirst?.(); // no-op after the first call — the
          // obligation it holds is the one this very dispatch is about to settle
          once(ε, 'foo', listenerObject);
        }),
      };

      handles.unsubFirst = once(ε, 'foo', listenerObject);
      const unsubOn = on(ε, 'foo', listenerObject);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(1);

      unsubOn();
      // if the once() armed during this dispatch had been swallowed along
      // with the one the dispatch actually settled, nothing would be left
      // holding the listener and it would already be gone
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(2);
      expect(getSubscriptionCount(ε)).toBe(1);

      emit(ε, 'foo');
      expect(listenerObject.foo.callCount).toBe(3);
    });
  });
});
