import {
  EVENT_CATCH_EM_ALL,
  PRIO_MAX,
  PRIO_A,
  PRIO_B,
  PRIO_C,
  PRIO_DEFAULT,
  PRIO_LOW,
  PRIO_MIN,
  NAMESPACE,
} from './constants';

describe('eventize constants', () => {
  test('EVENT_CATCH_EM_ALL', () => {
    expect(EVENT_CATCH_EM_ALL).toBe('*');
  });

  test('PRIO_MAX', () => {
    expect(PRIO_MAX).toBeGreaterThan(PRIO_A);
  });
  test('PRIO_A', () => {
    expect(PRIO_A).toBeGreaterThan(PRIO_B);
  });
  test('PRIO_B', () => {
    expect(PRIO_B).toBeGreaterThan(PRIO_C);
  });
  test('PRIO_C', () => {
    expect(PRIO_C).toBeGreaterThan(PRIO_DEFAULT);
  });
  test('PRIO_DEFAULT', () => {
    expect(PRIO_DEFAULT).toBe(0);
  });
  test('PRIO_LOW', () => {
    expect(PRIO_LOW).toBeLessThan(PRIO_DEFAULT);
  });
  test('PRIO_MIN', () => {
    expect(PRIO_MIN).toBeLessThan(PRIO_LOW);
  });

  test('NAMESPACE', () => {
    expect(typeof NAMESPACE).toBe('symbol');
  });
});
