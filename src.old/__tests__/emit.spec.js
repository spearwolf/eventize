/* eslint-env jest */
import eventize, { PRIO_A, PRIO_LOW } from '../eventize';

describe('emit()', () => {
  describe('calls the listener with all given args (except the event name)', () => {
    const obj = eventize({});
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    obj.on('foo', 0, fn1);
    obj.on('*', fn2);
    obj.emit('foo', 'bar', 666);

    it('named event listener', () => {
      expect(fn1).toHaveBeenCalledWith('bar', 666);
    });
    it('catch-em-all event listener', () => {
      expect(fn2).toHaveBeenCalledWith('bar', 666);
    });
  });

  describe('getting started example', () => {
    const obj = eventize({});
    const results = [];

    obj.on('foo', (hello) => results.push(`hello ${hello}`));

    obj.once(['foo', 'bar'], PRIO_A, {
      foo: (hello) => results.push(`hej ${hello}`),
    });

    obj.on(['foo', 'bar'], PRIO_LOW, (hello) => results.push(`moin moin ${hello}`));

    it('first emit()', () => {
      obj.emit('foo', 'world');

      expect(results).toEqual([
        'hej world',
        'hello world',
        'moin moin world',
      ]);
    });

    it('second emit()', () => {
      results.length = 0;

      obj.on('foo', () => obj.off('foo'));
      obj.emit(['foo', 'bar'], 'eventize');

      expect(results).toEqual([
        'hello eventize',
        'moin moin eventize',
      ]);
    });
  });
});
