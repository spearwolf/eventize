/* eslint-env jest */
import eventize from '../eventize';

describe('once()', () => {
  describe('once() before on()', () => {
    const obj = eventize({});
    const listenerFunc = jest.fn();
    const otherListener = jest.fn();

    obj.once('foo', listenerFunc);
    obj.on('foo', otherListener);

    obj.emit('foo', 'bar', 666);

    it('emit() calls the listeners', () => {
      expect(listenerFunc).toHaveBeenCalledWith('bar', 666);
      expect(otherListener).toHaveBeenCalledWith('bar', 666);
    });

    it('after the first call to emit() the listener is was removed from the list of subscribers', () => {
      listenerFunc.mockClear();
      otherListener.mockClear();

      obj.emit('foo', 'bar', 666);

      expect(listenerFunc).not.toHaveBeenCalled();
      expect(otherListener).toHaveBeenCalled();
    });
  });
});
