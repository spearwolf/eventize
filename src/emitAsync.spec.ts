import {emitAsync, eventize, on, Priority} from './index';

describe('emitAsync()', () => {
  it('should work as expected', async () => {
    const o = eventize();

    on(o, 'foo', () => 123);
    on(o, 'foo', (): object => null);
    on(o, 'foo', () => 'abc');
    on(o, 'foo', (): unknown => undefined);
    on(o, 'foo', () => Promise.resolve('xyz'));
    on(o, 'foo', () => '');
    on(o, 'foo', Priority.AAA, () => false);
    on(o, 'foo', () => [1, Promise.resolve(2), '3']);

    const results = await emitAsync(o, 'foo');

    expect(results).toEqual([false, 123, 'abc', 'xyz', '', [1, 2, '3']]);
  });

  it('should work as expected even if there is no subscriber', async () => {
    const o = eventize();

    const results = await emitAsync(o, 'foo');

    expect(results).toEqual(undefined);
  });
});
