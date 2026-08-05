import {eventize} from '../index';

import {latestListener} from './listeners';

// Test-infrastructure spec: `__test-utils__` sits outside `collectCoverageFrom`
// (see jest.config.ts), so nothing here binds the coverage threshold. It
// exists anyway because the failure message is the point of TEST-003 — a
// spec pinning the wrong message would be worse than no spec at all.
describe('latestListener()', () => {
  it('throws a message naming itself and the missing listener, instead of a bare reduce() TypeError', () => {
    const obj = eventize();
    expect(() => latestListener(obj)).toThrow(
      'latestListener(): no listener registered',
    );
  });
});
