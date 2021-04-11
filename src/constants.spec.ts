import {EVENT_CATCH_EM_ALL, NAMESPACE} from './constants';

describe('eventize constants', () => {
  test('EVENT_CATCH_EM_ALL', () => {
    expect(EVENT_CATCH_EM_ALL).toBe('*');
  });

  test('NAMESPACE', () => {
    expect(typeof NAMESPACE).toBe('symbol');
  });
});
