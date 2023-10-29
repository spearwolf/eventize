import {fake} from 'sinon';

import {eventize} from './index';

describe('retainClear()', () => {
  it('should work as expected', () => {
    const e = eventize();

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
});
