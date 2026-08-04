import {fake} from 'sinon';

import {
  Eventize,
  eventize,
  emit,
  getRetainedCount,
  getRetainedEventNames,
  on,
  retain,
  unretain,
} from './index';

describe('unretain()', () => {
  it('removes the retain policy and the currently stored value', () => {
    const e = new (class extends Eventize {})();
    const sub = fake();

    e.retain('foo');
    e.emit('foo', 'bar');

    e.unretain('foo');

    e.on('foo', sub);

    expect(sub.called).toBeFalsy();
  });

  it('future emissions are not retained after unretain', () => {
    const e = eventize.inject();
    const sub = fake();

    e.retain('foo');
    e.emit('foo', 'first');

    e.unretain('foo');
    e.emit('foo', 'second');

    e.on('foo', sub);

    expect(sub.called).toBeFalsy();
  });

  it('does not affect listeners that are already registered', () => {
    const e = eventize.inject();
    const existingSub = fake();

    e.retain('foo');
    e.on('foo', existingSub);
    e.emit('foo', 'data');

    expect(existingSub.callCount).toBe(1);

    e.unretain('foo');

    e.emit('foo', 'newData');

    expect(existingSub.callCount).toBe(2);
    expect(existingSub.calledWith('newData')).toBeTruthy();
  });

  it('works with array of event names', () => {
    const e = eventize.inject();
    const sub1 = fake();
    const sub2 = fake();
    const sub3 = fake();

    e.retain(['event1', 'event2', 'event3']);

    e.emit('event1', 'data1');
    e.emit('event2', 'data2');
    e.emit('event3', 'data3');

    e.unretain(['event1', 'event2']);

    e.on('event1', sub1);
    e.on('event2', sub2);
    e.on('event3', sub3);

    expect(sub1.called).toBeFalsy();
    expect(sub2.called).toBeFalsy();
    expect(sub3.calledWith('data3')).toBeTruthy();

    // event3 still retains future emissions
    e.emit('event3', 'data3-new');
    const lateSub = fake();
    e.on('event3', lateSub);
    expect(lateSub.calledWith('data3-new')).toBeTruthy();
  });

  it('works with symbol event names', () => {
    const e = eventize.inject();
    const myEvent = Symbol('myEvent');
    const sub = fake();

    e.retain(myEvent);
    e.emit(myEvent, 'data');

    e.unretain(myEvent);
    e.emit(myEvent, 'after-unretain');

    e.on(myEvent, sub);

    expect(sub.called).toBeFalsy();
  });

  it('can re-retain after unretain', () => {
    const e = eventize.inject();

    e.retain('foo');
    e.emit('foo', 'first');

    e.unretain('foo');

    e.retain('foo');
    e.emit('foo', 'second');

    const sub = fake();
    e.on('foo', sub);

    expect(sub.calledWith('second')).toBeTruthy();
  });

  it('unretain on a never-retained event does not throw', () => {
    const e = eventize.inject();

    expect(() => {
      e.unretain('foo');
    }).not.toThrow();
  });

  it('multiple unretain calls are idempotent', () => {
    const e = eventize.inject();

    e.retain('foo');
    e.emit('foo', 'data');

    e.unretain('foo');
    e.unretain('foo');
    e.unretain('foo');

    const sub = fake();
    e.on('foo', sub);

    expect(sub.called).toBeFalsy();
  });

  it('throws a TypeError when called on non-eventized object', () => {
    const obj = {};

    expect(() => {
      unretain(obj, 'foo');
    }).toThrow(TypeError);
    expect(() => {
      unretain(obj, 'foo');
    }).toThrow('unretain() cannot operate on a non-eventized object');
  });

  it('works with functional API', () => {
    const obj = eventize();
    const sub = fake();

    retain(obj, 'test');
    emit(obj, 'test', 'value');

    unretain(obj, 'test');
    emit(obj, 'test', 'value-after');

    on(obj, 'test', sub);

    expect(sub.called).toBeFalsy();
  });

  it('verifies retain → emit → unretain → on (new subscriber) → no replay', () => {
    const e = eventize.inject();
    const sub = fake();

    e.retain('foo');
    e.emit('foo', 'bar');
    e.unretain('foo');

    e.on('foo', sub);

    expect(sub.called).toBeFalsy();
  });

  it('mixed string and symbol event names in array', () => {
    const e = eventize.inject();
    const symEvent = Symbol('symEvent');
    const sub1 = fake();
    const sub2 = fake();

    e.retain(['strEvent', symEvent]);

    e.emit('strEvent', 'strData');
    e.emit(symEvent, 'symData');

    e.unretain(['strEvent', symEvent]);

    e.emit('strEvent', 'strData-2');
    e.emit(symEvent, 'symData-2');

    e.on('strEvent', sub1);
    e.on(symEvent, sub2);

    expect(sub1.called).toBeFalsy();
    expect(sub2.called).toBeFalsy();
  });

  // unretain() forwarded eventNames straight to EventKeeper.remove(), which
  // takes any value. The bare wildcard and an array containing it stay a
  // valid bulk form (tested below) — this covers everything else the
  // non-wildcard path now rejects, atomically and with the same cause
  // vocabulary retain() uses.
  describe('argument validation', () => {
    it('rejects a non-name single value', () => {
      const obj = eventize();
      retain(obj, 'foo'); // must already be eventized — unretain() never auto-eventizes
      expect(() => unretain(obj, 42 as any)).toThrow(Error);
    });

    it('carries the "invalid-name" cause and is not a TypeError', () => {
      const obj = eventize();
      retain(obj, 'foo');
      let caught: unknown;
      try {
        unretain(obj, 42 as any);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(TypeError);
      expect((caught as Error).cause).toBe('invalid-name');
    });

    it('rejects an empty array', () => {
      const obj = eventize();
      retain(obj, 'foo');
      let caught: unknown;
      try {
        unretain(obj, []);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(TypeError);
      expect((caught as Error).cause).toBe('empty-names');
    });

    it('rejects a sparse array of event names', () => {
      const obj = eventize();
      retain(obj, 'foo');
      let caught: unknown;
      try {
        unretain(
          obj,
          Object.assign(new Array(3), {0: 'a', 2: 'b'}) as unknown as string[],
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(TypeError);
      expect((caught as Error).cause).toBe('sparse-names');
    });

    it('rejects an array entry that is not an event name', () => {
      const obj = eventize();
      retain(obj, 'foo');
      let caught: unknown;
      try {
        unretain(obj, ['foo', 123] as any);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).cause).toBe('invalid-name');
    });

    it('leaves retained state unchanged after each rejection', () => {
      const obj = eventize();
      retain(obj, 'foo');
      emit(obj, 'foo', 'payload');

      const namesBefore = getRetainedEventNames(obj);
      const countBefore = getRetainedCount(obj);

      expect(() => unretain(obj, 42 as any)).toThrow();
      expect(() => unretain(obj, [])).toThrow();
      expect(() =>
        unretain(
          obj,
          Object.assign(new Array(2), {0: 'x'}) as unknown as string[],
        ),
      ).toThrow();
      expect(() => unretain(obj, ['x', 123] as any)).toThrow();

      expect(getRetainedEventNames(obj)).toEqual(namesBefore);
      expect(getRetainedCount(obj)).toBe(countBefore);
    });
  });

  describe("bulk form unretain(ε, '*')", () => {
    it('drops every retain policy and every retained value', () => {
      const obj = eventize();

      retain(obj, 'a');
      retain(obj, 'b');
      emit(obj, 'a', 1);
      emit(obj, 'b', 2);

      unretain(obj, '*');

      const listener = fake();
      on(obj, 'a', listener);
      on(obj, 'b', listener);
      expect(listener.callCount).toBe(0);

      // policy is gone too: a later emit is not retained either
      emit(obj, 'a', 3);
      const late = fake();
      on(obj, 'a', late);
      expect(late.callCount).toBe(0);
    });

    it('an array containing "*" behaves like the bare wildcard', () => {
      const obj = eventize();

      retain(obj, 'a');
      retain(obj, 'b');
      emit(obj, 'a', 1);
      emit(obj, 'b', 2);

      // 'b' is not listed, yet the wildcard takes everything with it
      unretain(obj, ['a', '*']);

      const listener = fake();
      on(obj, 'a', listener);
      on(obj, 'b', listener);
      expect(listener.callCount).toBe(0);

      emit(obj, 'b', 3);
      const late = fake();
      on(obj, 'b', late);
      expect(late.callCount).toBe(0);
    });
  });
});
