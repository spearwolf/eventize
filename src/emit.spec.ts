import {fake} from 'sinon';

import {eventize, Priority} from '.';

describe('emit()', () => {
  describe('calls the listener with all given args (except the event name)', () => {
    const obj = eventize({});
    const fn1 = fake();
    const fn2 = fake();

    beforeAll(() => {
      obj.on('foo', 0, fn1);
      obj.on('*', fn2);
      obj.emit('foo', 'bar', 666);
    });

    it('named event listener', () => {
      expect(fn1.calledOnce).toBe(true);
      expect(fn2.calledWith('bar', 666)).toBeTruthy();
    });

    it('catch-em-all event listener', () => {
      expect(fn2.calledOnce).toBeTruthy();
      expect(fn2.calledWith('bar', 666)).toBeTruthy();
    });
  });

  describe('getting started example', () => {
    const obj = eventize({});
    const results: Array<string> = [];

    beforeAll(() => {
      obj.on('foo', (hello) => results.push(`hello ${hello}`));

      obj.once(['foo', 'bar'], Priority.AAA, {
        foo: (hello: string) => results.push(`hej ${hello}`),
      });

      obj.on(['foo', 'bar'], Priority.Low, (hello) =>
        results.push(`moin moin ${hello}`),
      );
    });

    it('first emit()', () => {
      obj.emit('foo', 'world');

      expect(results).toEqual(['hej world', 'hello world', 'moin moin world']);
    });

    it('second emit()', () => {
      results.length = 0;

      obj.on('foo', () => obj.off('foo'));
      obj.emit(['foo', 'bar'], 'eventize');

      expect(results).toEqual(['hello eventize', 'moin moin eventize']);
    });
  });
});
