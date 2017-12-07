/* eslint-env jest */
import eventize, { NAMESPACE } from '../eventize';

const expect2ImplEventizeApi = (obj) => {
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

describe('eventize.inject(obj) -> eventizer', () => {
  const obj = {};
  const eventizer = eventize.inject(obj);

  it('is the same object given as first argument', () => {
    expect(obj).toEqual(eventizer);
  });

  expect2ImplEventizeApi(eventizer);
});

describe('eventize.extend(obj) -> eventizer', () => {
  const obj = {};
  const eventizer = eventize.extend(obj);

  it('is a new object', () => {
    expect(obj).not.toEqual(eventizer);
  });

  it('the prototype is the original object given as argument', () => {
    expect(Object.getPrototypeOf(eventizer)).toEqual(obj);
  });

  expect2ImplEventizeApi(eventizer);
});

describe('eventize.create(obj) -> eventizer', () => {
  const obj = {
    foo: jest.fn(),
  };
  const eventizer = eventize.create(obj);

  it('is a new object', () => {
    expect(obj).not.toEqual(eventizer);
  });

  it('forwards all events to the original object given as argument', () => {
    eventizer.emit('foo');
    expect(obj.foo).toBeCalled();
  });

  expect2ImplEventizeApi(eventizer);
});

describe('eventize(eventizer) returns unmodified eventizer', () => {
  const eventizer = eventize({});
  const magicNumber = Math.random();
  eventizer[NAMESPACE].magicNumber = magicNumber;
  const eObj2 = eventize(eventizer);

  it('is the same object', () => {
    expect(eObj2).toBe(eventizer);
  });
  it('magicNumber exists and is the same', () => {
    expect(eObj2[NAMESPACE].magicNumber).toBe(magicNumber);
  });
});
