import {expect2ImplEventizeApi} from './expect2ImplEventizeApi';

import {emit, eventize, Eventize, on} from './index';

describe('composition over inheritance', () => {
  interface Foo extends Eventize {}
  class Foo {
    constructor() {
      eventize.inject(this);
    }
  }

  const obj = new Foo();

  it('emit works', () => {
    const listener = {foo: jest.fn()};
    obj.on(listener);
    obj.emit('foo');
    expect(listener.foo).toHaveBeenCalled();
  });

  expect2ImplEventizeApi(obj);
});

describe('interface class extends EventizedObject', () => {
  class Foo {
    constructor() {
      eventize(this);
    }
  }

  const obj = new Foo();

  it('emit works', () => {
    const listener = {foo: jest.fn()};
    on(obj, listener);
    emit(obj, 'foo');
    expect(listener.foo).toHaveBeenCalled();
  });
});
