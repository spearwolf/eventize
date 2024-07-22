import {fake} from 'sinon';

import {emit, eventize, on, once} from './index';

describe('once()', () => {
  describe('once() before on()', () => {
    const obj = eventize();

    const listenerFunc = fake();
    const otherListener = fake();

    beforeAll(() => {
      once(obj, 'foo', listenerFunc);
      on(obj, 'foo', otherListener);
    });

    it('emit() calls the listeners', () => {
      emit(obj, 'foo', 'bar', 666);

      expect(listenerFunc.callCount).toBe(1);
      expect(otherListener.callCount).toBe(1);
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      expect(otherListener.calledWith('bar', 666)).toBeTruthy();
    });

    it('after the first call to emit() the listener is removed from the list of subscribers', () => {
      emit(obj, 'foo', 'bar', 666);

      expect(listenerFunc.callCount).toBe(1);
      expect(otherListener.callCount).toBe(2);
    });
  });

  it('called with multiple event names', () => {
    const e = eventize();

    const sub = jest.fn();

    // ---
    once(e, ['foo', 'bar'], sub);

    emit(e, 'foo', 42);
    expect(sub).toBeCalledWith(42);
    sub.mockClear();

    emit(e, 'bar');
    expect(sub).not.toHaveBeenCalled(); // is no longer called because 'foo' has already been called back

    // ---
    once(e, ['foo', 'bar'], sub);

    emit(e, 'bar', 666);
    expect(sub).toBeCalledTimes(1);
    expect(sub).toBeCalledWith(666);
    sub.mockClear();

    emit(e, 'foo');
    expect(sub).not.toHaveBeenCalled();
  });
});
