import {fake} from 'sinon';

import {emit, eventize, getSubscriptionCount, off, on, once} from './index';

describe('on() multiple times', () => {
  it('on(eventName, listenerObject)', () => {
    const obj = eventize({
      foo: fake(),
    });

    const unsubscribe0 = on(obj, 'foo', obj);
    const unsubscribe1 = on(obj, 'foo', obj);
    // once() is exempt from dedup (v6.0.0): it does not join the refCount of
    // the two on() calls but adds a second, independent subscription.
    once(obj, 'foo', obj);

    expect(getSubscriptionCount(obj)).toBe(2);

    emit(obj, 'foo');

    // once per subscription: the deduplicated on() pair, and the once()
    expect(obj.foo.callCount).toBe(2);
    expect(getSubscriptionCount(obj)).toBe(1);

    unsubscribe0();
    obj.foo.resetHistory();

    expect(getSubscriptionCount(obj)).toBe(1);

    emit(obj, 'foo');
    expect(obj.foo.callCount).toBe(1);

    unsubscribe1();
    obj.foo.resetHistory();

    expect(getSubscriptionCount(obj)).toBe(0);

    emit(obj, 'foo');
    expect(obj.foo.callCount).toBe(0);
  });

  it('on(eventName, listenerFuncName, listenerObject)', () => {
    const obj = eventize({
      foo: fake(),
    });

    const unsubscribe0 = on(obj, 'bar', 'foo', obj);
    const unsubscribe1 = on(obj, 'bar', 'foo', obj);
    // not deduplicated against the on() pair — its own subscription
    once(obj, 'bar', 'foo', obj);

    emit(obj, 'bar');

    expect(obj.foo.callCount).toBe(2);

    unsubscribe0();
    obj.foo.resetHistory();

    emit(obj, 'bar');
    expect(obj.foo.callCount).toBe(1);

    unsubscribe1();
    obj.foo.resetHistory();

    emit(obj, 'bar');
    expect(obj.foo.callCount).toBe(0);
  });

  it('off(eventName, listenerObject)', () => {
    const obj = eventize({
      foo: fake(),
    });

    on(obj, 'foo', obj);
    on(obj, 'foo', obj);

    emit(obj, 'foo');

    expect(obj.foo.callCount).toBe(1);

    off(obj, 'foo', obj);
    obj.foo.resetHistory();

    emit(obj, 'foo');
    expect(obj.foo.callCount).toBe(0);
  });

  it('on(listenerObject)', () => {
    const obj = eventize({
      foo: fake(),
    });

    const unsubscribe0 = on(obj, obj);
    const unsubscribe1 = on(obj, obj);
    // not deduplicated against the on() pair — its own subscription
    once(obj, obj);

    emit(obj, 'foo');

    expect(obj.foo.callCount).toBe(2);

    unsubscribe0();
    obj.foo.resetHistory();

    emit(obj, 'foo');
    expect(obj.foo.callCount).toBe(1);

    unsubscribe1();
    obj.foo.resetHistory();

    emit(obj, 'foo');
    expect(obj.foo.callCount).toBe(0);
  });

  it('off(listenerObject)', () => {
    const obj = {
      foo: fake(),
    };

    const signal = eventize();

    on(signal, obj);
    on(signal, obj);

    on(signal, 'bar', 'foo', obj);

    on(signal, 'bar', '*', obj);

    expect(getSubscriptionCount(signal)).toBe(3);

    emit(signal, 'foo');

    expect(obj.foo.callCount).toBe(1);

    off(signal, obj);
    obj.foo.resetHistory();

    expect(getSubscriptionCount(signal)).toBe(0);

    emit(signal, 'foo');
    expect(obj.foo.callCount).toBe(0);

    emit(signal, 'bar');
    expect(obj.foo.callCount).toBe(0);
  });
});
