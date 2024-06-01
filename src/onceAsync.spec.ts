import {eventize} from './index';

describe('onceAsync()', () => {
  it('should work as expected', async () => {
    const ε = eventize();

    const p = ε.onceAsync('foo');

    ε.emit('foo', 42);

    await p;

    expect(p).resolves.toBe(42);
  });

  it('with retain', async () => {
    const e = eventize();

    e.retain('foo');
    e.emit('foo', 666);

    expect(await e.onceAsync('foo')).toBe(666);
  });

  it('with multiple event names', async () => {
    const e = eventize();

    e.retain('foo');
    e.emit('foo', 1001);

    expect(await e.onceAsync<number>(['bar', 'foo'])).toBe(1001);
  });
});
