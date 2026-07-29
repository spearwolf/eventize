import {EventKeeper} from './EventKeeper';
import {EventStore} from './EventStore';
import {REGISTER_ONE_SHOT} from './constants';
import {subscribeTo} from './subscribeTo';

// eventize-api.ts is the only caller, and both on() and once() always pass an
// explicit kind — REGISTER_PERSISTENT or REGISTER_ONE_SHOT. The default on
// the `kind` parameter exists for a caller that omits it entirely, which
// nothing in this package does; this is the direct-module test that exercises
// it anyway, the same way EventStore.spec.ts and EventListener.spec.ts reach
// past the public API to pin an internal default.
describe('subscribeTo() with no kind argument', () => {
  it('defaults to a persistent registration', () => {
    const store = new EventStore();
    const keeper = new EventKeeper();
    const listenerObject = {foo: () => {}};

    const registration = subscribeTo(store, keeper, ['foo', listenerObject]);

    expect(Array.isArray(registration)).toBe(false);
    const {listener} = registration as {
      listener: {refCount: number; onceCount: number};
    };
    expect(listener.refCount).toBe(1);
    expect(listener.onceCount).toBe(0);

    // A once() on the same identity aggregates onto it — proof that the first
    // call really did land as REGISTER_PERSISTENT and not as a one-shot
    // obligation nothing would ever discharge.
    subscribeTo(store, keeper, ['foo', listenerObject], REGISTER_ONE_SHOT);
    expect(listener.onceCount).toBe(1);
  });
});
