import {NAMESPACE} from './constants';
import {expect2ImplEventizeApi} from './expect2ImplEventizeApi';

import {eventize, Eventize} from './index';

describe('class extends Eventize', () => {
  class Foo extends Eventize {}
  const foo = new Foo();

  it('emit works', () => {
    const listener = {foo: jest.fn()};
    foo.on(listener);
    foo.emit('foo');
    expect(listener.foo).toHaveBeenCalled();
  });

  expect2ImplEventizeApi(foo);
});

describe('eventize(eventizer) returns unmodified eventizer', () => {
  const eventizer = eventize();
  const magicNumber = Math.random();
  // @ts-ignore
  eventizer[NAMESPACE].magicNumber = magicNumber;
  const eObj2 = eventize(eventizer);

  it('is the same object', () => {
    expect(eObj2).toBe(eventizer);
  });
  it('magicNumber exists and is the same', () => {
    // @ts-ignore
    expect(eObj2[NAMESPACE].magicNumber).toBe(magicNumber);
  });
});
