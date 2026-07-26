import {fake} from 'sinon';

import {
  emit,
  emitAsync,
  eventize,
  getSubscriptionCount,
  on,
  once,
  retain,
} from './index';

describe('emit() with a throwing listener', () => {
  it('propagates the exception to the emit() caller', () => {
    const ε = eventize();
    const boom = new Error('boom');

    on(ε, 'foo', () => {
      throw boom;
    });

    expect(() => emit(ε, 'foo')).toThrow(boom);
  });

  it('aborts dispatch: subsequent listeners (in the same emit) are NOT invoked', () => {
    const ε = eventize();
    const second = fake();
    const third = fake();

    on(ε, 'foo', () => {
      throw new Error('boom');
    });
    on(ε, 'foo', second);
    on(ε, 'foo', third);

    expect(() => emit(ε, 'foo', 'bar')).toThrow('boom');

    expect(second.called).toBe(false);
    expect(third.called).toBe(false);
  });

  it('runs higher-priority listeners that were scheduled before the throwing one', () => {
    const ε = eventize();
    const calls: string[] = [];

    on(ε, 'foo', 10, () => {
      calls.push('high');
    });
    on(ε, 'foo', 5, () => {
      calls.push('mid');
      throw new Error('boom');
    });
    on(ε, 'foo', 0, () => {
      calls.push('low');
    });

    expect(() => emit(ε, 'foo')).toThrow('boom');
    expect(calls).toEqual(['high', 'mid']);
  });

  it('does not retain the event value when a listener throws', () => {
    const ε = eventize();

    retain(ε, 'foo');

    on(ε, 'foo', () => {
      throw new Error('boom');
    });

    expect(() => emit(ε, 'foo', 'first')).toThrow('boom');

    const lateSubscriber = fake();
    on(ε, 'foo', lateSubscriber);

    expect(lateSubscriber.called).toBe(false);
  });

  it('leaves the throwing listener subscribed (it is not auto-removed)', () => {
    const ε = eventize();
    let calls = 0;

    on(ε, 'foo', () => {
      calls += 1;
      throw new Error('boom');
    });

    expect(() => emit(ε, 'foo')).toThrow('boom');
    expect(() => emit(ε, 'foo')).toThrow('boom');
    expect(calls).toBe(2);
  });
});

describe('once() with a throwing listener', () => {
  it('leaves the throwing listener subscribed and fires it again on the next emit()', () => {
    const ε = eventize();
    let calls = 0;

    once(ε, 'foo', () => {
      calls += 1;
      throw new Error('boom');
    });

    expect(() => emit(ε, 'foo')).toThrow('boom');
    expect(getSubscriptionCount(ε)).toBe(1);

    expect(() => emit(ε, 'foo')).toThrow('boom');
    expect(getSubscriptionCount(ε)).toBe(1);
    expect(calls).toBe(2);
  });

  it('unsubscribes once the dispatch completes without throwing', () => {
    const ε = eventize();
    let calls = 0;
    let shouldThrow = true;

    once(ε, 'foo', () => {
      calls += 1;
      if (shouldThrow) {
        throw new Error('boom');
      }
    });

    expect(() => emit(ε, 'foo')).toThrow('boom');
    expect(getSubscriptionCount(ε)).toBe(1);

    shouldThrow = false;
    emit(ε, 'foo');
    expect(getSubscriptionCount(ε)).toBe(0);
    expect(calls).toBe(2);

    emit(ε, 'foo');
    expect(calls).toBe(2);
  });
});

describe('emitAsync() with a throwing listener', () => {
  it('propagates a synchronously-thrown exception to the emitAsync() caller', () => {
    const ε = eventize();

    on(ε, 'foo', () => {
      throw new Error('boom');
    });

    expect(() => emitAsync(ε, 'foo')).toThrow('boom');
  });

  it('rejects the returned promise when a listener returns a rejected promise', async () => {
    const ε = eventize();
    const second = fake.returns('ok');

    on(ε, 'foo', () => Promise.reject(new Error('async-boom')));
    on(ε, 'foo', second);

    await expect(emitAsync(ε, 'foo')).rejects.toThrow('async-boom');
    // Both listeners are dispatched synchronously; only the awaited
    // aggregation rejects. The second listener has already run.
    expect(second.called).toBe(true);
  });
});
