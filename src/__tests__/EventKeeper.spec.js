/* eslint-env jest */
import EventKeeper from '../EventKeeper';

describe('EventKeeper', () => {
  it('is instanceable', () => {
    const keeper = new EventKeeper();
    expect(keeper).toBeDefined();
  });

  it('add(eventName)', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    keeper.add('bar');

    expect(keeper.isKnown('foo')).toBe(true);
    expect(keeper.isKnown('bar')).toBe(true);
    expect(keeper.isKnown('plah')).toBe(false);
  });

  it('add([eventNames])', () => {
    const keeper = new EventKeeper();
    keeper.add(['foo', 'plah']);

    expect(keeper.isKnown('foo')).toBe(true);
    expect(keeper.isKnown('bar')).toBe(false);
    expect(keeper.isKnown('plah')).toBe(true);
  });

  it('remove(eventName)', () => {
    const keeper = new EventKeeper();

    keeper.add('foo');
    expect(keeper.isKnown('foo')).toBe(true);

    keeper.remove('foo');
    expect(keeper.isKnown('foo')).toBe(false);
  });

  it('remove([eventNames])', () => {
    const keeper = new EventKeeper();

    keeper.add(['foo', 'bar']);
    keeper.add('plah');

    expect(keeper.isKnown('foo')).toBe(true);
    expect(keeper.isKnown('bar')).toBe(true);
    expect(keeper.isKnown('plah')).toBe(true);

    keeper.remove(['bar', 'foo', 'plah']);

    expect(keeper.isKnown('foo')).toBe(false);
    expect(keeper.isKnown('bar')).toBe(false);
    expect(keeper.isKnown('plah')).toBe(false);
  });

  it('retain(unknown eventName) should not retain event arguments', () => {
    const keeper = new EventKeeper();
    expect(keeper.isKnown('foo')).toBe(false);

    keeper.retain('foo', [1, 2, 3]);

    const emitter = { apply: jest.fn() };
    keeper.emit('foo', emitter);

    expect(emitter.apply).not.toHaveBeenCalled();
  });

  it('emit(known eventName) should emit event', () => {
    const keeper = new EventKeeper();
    keeper.add('foo');
    expect(keeper.isKnown('foo')).toBe(true);

    keeper.retain('foo', [1, 2, 3]);

    const emitter = { apply: jest.fn() };
    keeper.emit('foo', emitter);

    expect(emitter.apply).toHaveBeenCalledWith('foo', [1, 2, 3]);
  });
});