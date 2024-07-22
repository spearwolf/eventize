import {emit, eventize, onceAsync, retain} from './index';

describe('onceAsync()', () => {
  it('should work as expected', async () => {
    const ε = eventize();

    const p = onceAsync(ε, 'foo');

    emit(ε, 'foo', 42);

    await p;

    expect(p).resolves.toBe(42);
  });

  it('with retain', async () => {
    const e = eventize();

    retain(e, 'foo');
    emit(e, 'foo', 666);

    expect(await onceAsync(e, 'foo')).toBe(666);
  });

  it('with multiple event names', async () => {
    const e = eventize();

    retain(e, 'foo');
    emit(e, 'foo', 1001);

    expect(await onceAsync<number>(e, ['bar', 'foo'])).toBe(1001);
  });
});
