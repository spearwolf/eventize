import {fake} from 'sinon';

import {eventize} from './index';

describe('once()', () => {
  describe('once() before on()', () => {
    const obj = eventize();

    const listenerFunc = fake();
    const otherListener = fake();

    beforeAll(() => {
      obj.once('foo', listenerFunc);
      obj.on('foo', otherListener);
    });

    it('emit() calls the listeners', () => {
      obj.emit('foo', 'bar', 666);

      expect(listenerFunc.callCount).toBe(1);
      expect(otherListener.callCount).toBe(1);
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      expect(otherListener.calledWith('bar', 666)).toBeTruthy();
    });

    it('after the first call to emit() the listener is removed from the list of subscribers', () => {
      obj.emit('foo', 'bar', 666);

      expect(listenerFunc.callCount).toBe(1);
      expect(otherListener.callCount).toBe(2);
    });
  });
});

describe('onceAsync()', () => {
  it('should work as expected', () => {
    const obj = eventize();

    const promise = obj.onceAsync('foo');

    obj.emit('foo', 'bar', 666);

    expect(promise).resolves.toBeUndefined();
  });
});

