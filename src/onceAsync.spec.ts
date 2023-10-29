import {eventize} from './index';

describe('onceAsnc()', () => {
  it('should work as expected', async () => {
    const ε = eventize();

    const p = ε.onceAsync('foo').then(() => 42);

    ε.emit('foo');

    await p;

    expect(p).resolves.toBe(42);
  });

  it('with retain', async () => {
    const e = eventize();

    e.retain('foo');
    e.emit('foo');

    expect(await e.onceAsync('foo').then(() => 666)).toBe(666);
  });

  it('with multiple event names', async () => {
    const e = eventize();

    e.retain('foo');
    e.emit('foo');

    expect(await e.onceAsync(['bar', 'foo']).then(() => 666)).toBe(666);
  });
});
