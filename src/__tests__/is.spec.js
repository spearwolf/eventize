/* eslint-env jest */
import eventize from '../eventize';

describe('eventize.is()', () => {
  it('returns true when obj has the eventized api attached', () => {
    const obj = eventize({});
    expect(eventize.is(obj)).toBe(true);
  });

  it('returns false when obj has not the eventized api attached', () => {
    expect(eventize.is({})).toBe(false);
  });
});
