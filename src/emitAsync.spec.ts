import {emitAsync, eventize, on, Priority} from './index';

describe('emitAsync()', () => {
  it('should work as expected', async () => {
    const o = eventize();

    on(o, 'foo', () => 123);
    on(o, 'foo', (): object | null => null);
    on(o, 'foo', () => 'abc');
    on(o, 'foo', (): unknown => undefined);
    on(o, 'foo', () => Promise.resolve('xyz'));
    on(o, 'foo', () => '');
    on(o, 'foo', Priority.AAA, () => false);
    on(o, 'foo', () => [1, Promise.resolve(2), '3']);

    const results = await emitAsync(o, 'foo');

    expect(results).toEqual([false, 123, 'abc', 'xyz', '', [1, 2, '3']]);
  });

  // A named listener and a '*' listener on the same emit is the only shape
  // that walks both buckets at once, and the collector has to survive that
  // walk as well — a dispatch over one bucket reaches it by a different route.
  // At equal priority the named listener goes first, which is why the wildcard
  // value comes second.
  it('collects the return values of named and wildcard listeners together', async () => {
    const o = eventize();

    on(o, 'foo', (n: number) => `named:${n}`);
    on(o, '*', (n: number) => `wildcard:${n}`);

    const results = await emitAsync(o, 'foo', 7);

    expect(results).toEqual(['named:7', 'wildcard:7']);
  });

  it('should work as expected even if there is no subscriber', async () => {
    const o = eventize();

    const results = await emitAsync(o, 'foo');

    expect(results).toEqual(undefined);
  });
});
