import {NAMESPACE} from './constants';

import {eventize, Eventize} from './index';

const expect2ImplEventizeApi = (obj: any) => {
  describe('implements the eventizedObject API', () => {
    it('.on()', () => {
      expect(typeof obj.on).toBe('function');
    });
    it('.once()', () => {
      expect(typeof obj.once).toBe('function');
    });
    it('.off()', () => {
      expect(typeof obj.off).toBe('function');
    });
    it('.emit()', () => {
      expect(typeof obj.emit).toBe('function');
    });
  });
};

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
