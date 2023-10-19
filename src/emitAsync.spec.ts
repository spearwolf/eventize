import {eventize, Priority} from './index';

describe('emitAsync()', () => {
  it('should work as expected', async () => {
    const o = eventize();

    o.on('foo', () => 123);
    o.on('foo', (): Object => null);
    o.on('foo', () => 'abc');
    o.on('foo', (): unknown => undefined);
    o.on('foo', () => Promise.resolve('xyz'));
    o.on('foo', () => '');
    o.on('foo', Priority.AAA, () => false);
    o.on('foo', () => [1, Promise.resolve(2), '3']);

    const results = await o.emitAsync('foo');

    expect(results).toEqual([false, 123, 'abc', 'xyz', '', [1, 2, '3']]);
  });

  it('should work as expected even if there is no subscriber', async () => {
    const o = eventize();

    const results = await o.emitAsync('foo');

    expect(results).toEqual(undefined);
  });
});
