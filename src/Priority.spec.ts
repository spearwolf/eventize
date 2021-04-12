import {Priority} from './Priority';

import eventize from '.';

describe('eventize()', () => {
  it('has the predefined Priority.Max constant', () => {
    expect(typeof eventize.Priority.Max).toBe('number');
  });
  it('has the predefined Priority.AAA constant', () => {
    expect(typeof eventize.Priority.AAA).toBe('number');
  });
  it('has the predefined Priority.BB constant', () => {
    expect(typeof eventize.Priority.BB).toBe('number');
  });
  it('has the predefined Priority.C constant', () => {
    expect(typeof eventize.Priority.C).toBe('number');
  });
  it('has the predefined Priority.Default constant', () => {
    expect(typeof eventize.Priority.Default).toBe('number');
  });
  it('has the predefined Priority.Low constant', () => {
    expect(typeof eventize.Priority.Low).toBe('number');
  });
  it('has the predefined Priority.Min constant', () => {
    expect(typeof eventize.Priority.Min).toBe('number');
  });

  describe('all predefined values should be in correct relationship to each other', () => {
    it('Priority.Max > Priority.AAA', () => {
      expect(eventize.Priority.Max > eventize.Priority.AAA).toBe(true);
    });
    it('Priority.AAA > Priority.BB', () => {
      expect(eventize.Priority.AAA > eventize.Priority.BB).toBe(true);
    });
    it('Priority.BB > Priority.C', () => {
      expect(eventize.Priority.BB > eventize.Priority.C).toBe(true);
    });
    it('Priority.C > Priority.Default', () => {
      expect(eventize.Priority.C > eventize.Priority.Default).toBe(true);
    });
    it('Priority.Default > Priority.Low', () => {
      expect(eventize.Priority.Default > eventize.Priority.Low).toBe(true);
    });
    it('Priority.Low > Priority.Min', () => {
      expect(eventize.Priority.Low > eventize.Priority.Min).toBe(true);
    });
  });
});

describe('eventize module named exports', () => {
  it('Priority.Max', () => {
    expect(Priority.Max).toBe(eventize.Priority.Max);
  });
  it('Priority.AAA', () => {
    expect(Priority.AAA).toBe(eventize.Priority.AAA);
  });
  it('Priority.BB', () => {
    expect(Priority.BB).toBe(eventize.Priority.BB);
  });
  it('Priority.C', () => {
    expect(Priority.C).toBe(eventize.Priority.C);
  });
  it('Priority.Default', () => {
    expect(Priority.Default).toBe(eventize.Priority.Default);
  });
  it('Priority.Low', () => {
    expect(Priority.Low).toBe(eventize.Priority.Low);
  });
  it('Priority.Min', () => {
    expect(Priority.Min).toBe(eventize.Priority.Min);
  });
});
