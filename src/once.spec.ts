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

  it('called with multiple event names', () => {
    const e = eventize();

    const sub = jest.fn();

    // ---
    e.once(['foo', 'bar'], sub);

    e.emit('foo', 42);
    expect(sub).toBeCalledWith(42);
    sub.mockClear();

    e.emit('bar');
    expect(sub).not.toHaveBeenCalled(); // is no longer called because 'foo' has already been called back

    // ---
    e.once(['foo', 'bar'], sub);

    e.emit('bar', 666);
    expect(sub).toBeCalledTimes(1);
    expect(sub).toBeCalledWith(666);
    sub.mockClear();

    e.emit('foo');
    expect(sub).not.toHaveBeenCalled();
  });
});
