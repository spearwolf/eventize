import {fake} from 'sinon';

import eventize from '.';

describe('on() multiple times', () => {
  it('on(eventName, listenerObject)', () => {
    const obj = eventize({
      foo: fake(),
    });

    const unsubscribe0 = obj.on('foo', obj);
    const unsubscribe1 = obj.on('foo', obj);
    obj.once('foo', obj);

    obj.emit('foo');

    expect(obj.foo.callCount).toBe(1);

    unsubscribe0();
    obj.foo.resetHistory();

    obj.emit('foo');
    expect(obj.foo.callCount).toBe(1);

    unsubscribe1();
    obj.foo.resetHistory();

    obj.emit('foo');
    expect(obj.foo.callCount).toBe(0);
  });

  it('on(eventName, listenerFuncName, listenerObject)', () => {
    const obj = eventize({
      foo: fake(),
    });

    const unsubscribe0 = obj.on('bar', 'foo', obj);
    const unsubscribe1 = obj.on('bar', 'foo', obj);
    obj.once('bar', 'foo', obj);

    obj.emit('bar');

    expect(obj.foo.callCount).toBe(1);

    unsubscribe0();
    obj.foo.resetHistory();

    obj.emit('bar');
    expect(obj.foo.callCount).toBe(1);

    unsubscribe1();
    obj.foo.resetHistory();

    obj.emit('bar');
    expect(obj.foo.callCount).toBe(0);
  });

  it('off(eventName, listenerObject)', () => {
    const obj = eventize({
      foo: fake(),
    });

    obj.on('foo', obj);
    obj.on('foo', obj);

    obj.emit('foo');

    expect(obj.foo.callCount).toBe(1);

    obj.off('foo', obj);
    obj.foo.resetHistory();

    obj.emit('foo');
    expect(obj.foo.callCount).toBe(0);
  });

  it('on(listenerObject)', () => {
    const obj = eventize({
      foo: fake(),
    });

    const unsubscribe0 = obj.on(obj);
    const unsubscribe1 = obj.on(obj);
    obj.once(obj);

    obj.emit('foo');

    expect(obj.foo.callCount).toBe(1);

    unsubscribe0();
    obj.foo.resetHistory();

    obj.emit('foo');
    expect(obj.foo.callCount).toBe(1);

    unsubscribe1();
    obj.foo.resetHistory();

    obj.emit('foo');
    expect(obj.foo.callCount).toBe(0);
  });

  it('off(listenerObject)', () => {
    const obj = {
      foo: fake(),
    };

    const signal = eventize({});

    signal.on(obj);
    signal.on(obj);

    signal.emit('foo');

    expect(obj.foo.callCount).toBe(1);

    signal.off(obj);
    obj.foo.resetHistory();

    signal.emit('foo');
    expect(obj.foo.callCount).toBe(0);
  });
});
