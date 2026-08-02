import {fake} from 'sinon';

import {emit, eventize, off, on, once, Priority} from './index';

describe('emit()', () => {
  describe('calls the listener with all given args (except the event name)', () => {
    const obj = eventize();
    const fn1 = fake();
    const fn2 = fake();

    beforeAll(() => {
      on(obj, 'foo', 0, fn1);
      on(obj, '*', fn2);
      emit(obj, 'foo', 'bar', 666);
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
    const obj = eventize();
    const results: Array<string> = [];

    beforeAll(() => {
      on(obj, 'foo', (hello) => results.push(`hello ${hello}`));

      once(obj, ['foo', 'bar'], Priority.AAA, {
        foo: (hello: string) => results.push(`hej ${hello}`),
      });

      on(obj, ['foo', 'bar'], Priority.Low, (hello) =>
        results.push(`moin moin ${hello}`),
      );
    });

    it('first emit()', () => {
      emit(obj, 'foo', 'world');

      expect(results).toEqual(['hej world', 'hello world', 'moin moin world']);
    });

    it('second emit()', () => {
      results.length = 0;

      on(obj, 'foo', () => off(obj, 'foo'));
      emit(obj, ['foo', 'bar'], 'eventize');

      expect(results).toEqual(['hello eventize', 'moin moin eventize']);
    });
  });

  describe('duck typing (v5+)', () => {
    it('no longer throws when the target is a non-eventized plain object', () => {
      expect(() => {
        emit({}, 'foo', 'bar', 666);
      }).not.toThrow();
    });
  });

  // A class instance's `constructor` is the class itself — never identical to
  // `Object.prototype.constructor` — so the Object.prototype identity check
  // that keeps other inherited members from being dispatchable does not catch
  // it here, and `constructor` is never a legitimate handler name regardless.
  describe('event name "constructor" against a class-instance listener object', () => {
    it('does not invoke the class constructor and falls back instead', () => {
      class Thing {}
      const obj = eventize();
      const emitFn = fake();
      const listenerObject = Object.assign(new Thing(), {emit: emitFn});

      on(obj, listenerObject);

      expect(() => emit(obj, 'constructor', 1, 2)).not.toThrow();
      expect(emitFn.calledOnceWith('constructor', 1, 2)).toBe(true);
    });
  });
});
