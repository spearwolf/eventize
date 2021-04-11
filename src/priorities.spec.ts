import {
  PRIO_A,
  PRIO_B,
  PRIO_C,
  PRIO_MAX,
  PRIO_MIN,
  PRIO_LOW,
  PRIO_DEFAULT,
} from './priorities';

import eventize from '.';

describe('eventize()', () => {
  it('has the predefined PRIO_MAX constant', () => {
    expect(typeof eventize.PRIO_MAX).toBe('number');
  });
  it('has the predefined PRIO_A constant', () => {
    expect(typeof eventize.PRIO_A).toBe('number');
  });
  it('has the predefined PRIO_B constant', () => {
    expect(typeof eventize.PRIO_B).toBe('number');
  });
  it('has the predefined PRIO_C constant', () => {
    expect(typeof eventize.PRIO_C).toBe('number');
  });
  it('has the predefined PRIO_DEFAULT constant', () => {
    expect(typeof eventize.PRIO_DEFAULT).toBe('number');
  });
  it('has the predefined PRIO_LOW constant', () => {
    expect(typeof eventize.PRIO_LOW).toBe('number');
  });
  it('has the predefined PRIO_MIN constant', () => {
    expect(typeof eventize.PRIO_MIN).toBe('number');
  });

  describe('all predefined values should be in correct relationship to each other', () => {
    it('PRIO_MAX > PRIO_A', () => {
      expect(eventize.PRIO_MAX > eventize.PRIO_A).toBe(true);
    });
    it('PRIO_A > PRIO_B', () => {
      expect(eventize.PRIO_A > eventize.PRIO_B).toBe(true);
    });
    it('PRIO_B > PRIO_C', () => {
      expect(eventize.PRIO_B > eventize.PRIO_C).toBe(true);
    });
    it('PRIO_C > PRIO_DEFAULT', () => {
      expect(eventize.PRIO_C > eventize.PRIO_DEFAULT).toBe(true);
    });
    it('PRIO_DEFAULT > PRIO_LOW', () => {
      expect(eventize.PRIO_DEFAULT > eventize.PRIO_LOW).toBe(true);
    });
    it('PRIO_LOW > PRIO_MIN', () => {
      expect(eventize.PRIO_LOW > eventize.PRIO_MIN).toBe(true);
    });
  });
});

describe('eventize module named exports', () => {
  it('PRIO_MAX', () => {
    expect(PRIO_MAX).toBe(eventize.PRIO_MAX);
  });
  it('PRIO_A', () => {
    expect(PRIO_A).toBe(eventize.PRIO_A);
  });
  it('PRIO_B', () => {
    expect(PRIO_B).toBe(eventize.PRIO_B);
  });
  it('PRIO_C', () => {
    expect(PRIO_C).toBe(eventize.PRIO_C);
  });
  it('PRIO_DEFAULT', () => {
    expect(PRIO_DEFAULT).toBe(eventize.PRIO_DEFAULT);
  });
  it('PRIO_LOW', () => {
    expect(PRIO_LOW).toBe(eventize.PRIO_LOW);
  });
  it('PRIO_MIN', () => {
    expect(PRIO_MIN).toBe(eventize.PRIO_MIN);
  });
});
