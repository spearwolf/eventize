/* eslint-env jest */
import eventize, {
  PRIO_A,
  PRIO_B,
  PRIO_C,
  PRIO_MAX,
  PRIO_MIN,
  PRIO_LOW,
  PRIO_DEFAULT,
} from '../eventize';

describe('eventize()', () => {
  it('has the predefined PRIO_MAX constant', () => {
    expect(typeof eventize.PRIO_MAX).toBe('number');  // eslint-disable-line
  });
  it('has the predefined PRIO_A constant', () => {
    expect(typeof eventize.PRIO_A).toBe('number');  // eslint-disable-line
  });
  it('has the predefined PRIO_B constant', () => {
    expect(typeof eventize.PRIO_B).toBe('number');  // eslint-disable-line
  });
  it('has the predefined PRIO_C constant', () => {
    expect(typeof eventize.PRIO_C).toBe('number');  // eslint-disable-line
  });
  it('has the predefined PRIO_DEFAULT constant', () => {
    expect(typeof eventize.PRIO_DEFAULT).toBe('number');  // eslint-disable-line
  });
  it('has the predefined PRIO_LOW constant', () => {
    expect(typeof eventize.PRIO_LOW).toBe('number');  // eslint-disable-line
  });
  it('has the predefined PRIO_MIN constant', () => {
    expect(typeof eventize.PRIO_MIN).toBe('number');  // eslint-disable-line
  });

  describe('all predefined values should be in correct relationship to each other', () => {
    it('PRIO_MAX > PRIO_A', () => {
      expect(eventize.PRIO_MAX > eventize.PRIO_A).toBe(true);  // eslint-disable-line
    });
    it('PRIO_A > PRIO_B', () => {
      expect(eventize.PRIO_A > eventize.PRIO_B).toBe(true);  // eslint-disable-line
    });
    it('PRIO_B > PRIO_C', () => {
      expect(eventize.PRIO_B > eventize.PRIO_C).toBe(true);  // eslint-disable-line
    });
    it('PRIO_C > PRIO_DEFAULT', () => {
      expect(eventize.PRIO_C > eventize.PRIO_DEFAULT).toBe(true);  // eslint-disable-line
    });
    it('PRIO_DEFAULT > PRIO_LOW', () => {
      expect(eventize.PRIO_DEFAULT > eventize.PRIO_LOW).toBe(true);  // eslint-disable-line
    });
    it('PRIO_LOW > PRIO_MIN', () => {
      expect(eventize.PRIO_LOW > eventize.PRIO_MIN).toBe(true);  // eslint-disable-line
    });
  });
});

describe('eventize module named exports', () => {
  it('PRIO_MAX', () => {
    expect(PRIO_MAX).toBe(eventize.PRIO_MAX);  // eslint-disable-line
  });
  it('PRIO_A', () => {
    expect(PRIO_A).toBe(eventize.PRIO_A);  // eslint-disable-line
  });
  it('PRIO_B', () => {
    expect(PRIO_B).toBe(eventize.PRIO_B);  // eslint-disable-line
  });
  it('PRIO_C', () => {
    expect(PRIO_C).toBe(eventize.PRIO_C);  // eslint-disable-line
  });
  it('PRIO_DEFAULT', () => {
    expect(PRIO_DEFAULT).toBe(eventize.PRIO_DEFAULT);  // eslint-disable-line
  });
  it('PRIO_LOW', () => {
    expect(PRIO_LOW).toBe(eventize.PRIO_LOW);  // eslint-disable-line
  });
  it('PRIO_MIN', () => {
    expect(PRIO_MIN).toBe(eventize.PRIO_MIN);  // eslint-disable-line
  });
});
