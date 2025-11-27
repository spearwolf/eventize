import {fake} from 'sinon';

import {Eventize, eventize, retainClear, retain, emit, on} from './index';

describe('retainClear()', () => {
  it('should work as expected', () => {
    const e = new (class extends Eventize {})();

    const sub0 = fake();
    const sub1 = fake();
    const sub2 = fake();
    const sub3 = fake();

    e.retain('foo');
    e.emit('foo', 'bar');
    e.on('foo', sub0);

    expect(sub0.calledWith('bar')).toBeTruthy();
    expect(sub1.called).toBeFalsy();
    expect(sub2.called).toBeFalsy();
    expect(sub3.called).toBeFalsy();

    e.on('foo', sub1);

    expect(sub1.calledWith('bar')).toBeTruthy();

    e.retainClear('foo');
    e.on('foo', sub2);

    expect(sub2.called).toBeFalsy();

    e.emit('foo', 'plah');

    expect(sub0.callCount).toBe(2);
    expect(sub0.calledWith('plah')).toBeTruthy();
    expect(sub1.callCount).toBe(2);
    expect(sub1.calledWith('plah')).toBeTruthy();
    expect(sub2.callCount).toBe(1);
    expect(sub2.calledWith('plah')).toBeTruthy();
    expect(sub3.called).toBeFalsy();

    e.on('foo', sub3);

    expect(sub3.callCount).toBe(1);
    expect(sub3.calledWith('plah')).toBeTruthy();
  });

  it('throws error when called on non-eventized object', () => {
    const obj = {};

    expect(() => {
      retainClear(obj, 'foo');
    }).toThrow('object is not eventized');
  });

  it('works with symbol event names', () => {
    const e = eventize.inject();
    const myEvent = Symbol('myEvent');
    const sub = fake();

    e.retain(myEvent);
    e.emit(myEvent, 'data');
    e.retainClear(myEvent);

    e.on(myEvent, sub);

    expect(sub.called).toBeFalsy();
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

    e.retainClear(['event1', 'event2']);

    e.on('event1', sub1);
    e.on('event2', sub2);
    e.on('event3', sub3);

    expect(sub1.called).toBeFalsy();
    expect(sub2.called).toBeFalsy();
    expect(sub3.calledWith('data3')).toBeTruthy();
  });

  it('works with functional API', () => {
    const obj = eventize();
    const sub = fake();

    retain(obj, 'test');
    emit(obj, 'test', 'value');
    retainClear(obj, 'test');

    on(obj, 'test', sub);

    expect(sub.called).toBeFalsy();
  });

  it('clearing does not affect future emissions', () => {
    const e = eventize.inject();
    const sub = fake();

    e.retain('foo');
    e.emit('foo', 'first');
    e.retainClear('foo');

    e.on('foo', sub);

    expect(sub.called).toBeFalsy();

    // Future emissions should still be retained
    e.emit('foo', 'second');

    const sub2 = fake();
    e.on('foo', sub2);

    expect(sub2.calledWith('second')).toBeTruthy();
  });

  it('clearing non-existent retained event does not throw', () => {
    const e = eventize.inject();

    expect(() => {
      e.retainClear('nonexistent');
    }).not.toThrow();
  });

  it('clearing event that was retained but never emitted does not throw', () => {
    const e = eventize.inject();

    e.retain('foo');
    // Never emit, just clear

    expect(() => {
      e.retainClear('foo');
    }).not.toThrow();
  });

  it('clearing array of mixed string and symbol events', () => {
    const e = eventize.inject();
    const symEvent = Symbol('symEvent');
    const sub1 = fake();
    const sub2 = fake();

    e.retain(['strEvent', symEvent]);

    e.emit('strEvent', 'strData');
    e.emit(symEvent, 'symData');

    e.retainClear(['strEvent', symEvent]);

    e.on('strEvent', sub1);
    e.on(symEvent, sub2);

    expect(sub1.called).toBeFalsy();
    expect(sub2.called).toBeFalsy();
  });

  it('clearing and re-emitting re-retains the new value', () => {
    const e = eventize.inject();

    e.retain('foo');
    e.emit('foo', 'first');

    const sub1 = fake();
    e.on('foo', sub1);
    expect(sub1.calledWith('first')).toBeTruthy();

    e.retainClear('foo');

    const sub2 = fake();
    e.on('foo', sub2);
    expect(sub2.called).toBeFalsy();

    e.emit('foo', 'second');

    const sub3 = fake();
    e.on('foo', sub3);
    expect(sub3.calledWith('second')).toBeTruthy();
  });

  it('retainClear does not affect subscribers already registered', () => {
    const e = eventize.inject();
    const existingSub = fake();
    const newSub = fake();

    e.retain('foo');
    e.on('foo', existingSub);
    e.emit('foo', 'data');

    expect(existingSub.callCount).toBe(1);

    e.retainClear('foo');

    e.on('foo', newSub);

    expect(newSub.called).toBeFalsy();

    // Existing sub should still receive new events
    e.emit('foo', 'newData');

    expect(existingSub.callCount).toBe(2);
    expect(newSub.callCount).toBe(1);
  });

  it('multiple retainClear calls are idempotent', () => {
    const e = eventize.inject();

    e.retain('foo');
    e.emit('foo', 'data');

    e.retainClear('foo');
    e.retainClear('foo');
    e.retainClear('foo');

    const sub = fake();
    e.on('foo', sub);

    expect(sub.called).toBeFalsy();
  });
});
