import {fake} from 'sinon';

import {Eventize, eventize, emit, on, retain, unretain} from './index';

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

  it('throws error when called on non-eventized object', () => {
    const obj = {};

    expect(() => {
      unretain(obj, 'foo');
    }).toThrow('object is not eventized');
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
});
