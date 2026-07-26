import {Priority} from './Priority';

describe('Priority', () => {
  it('has the predefined Priority.Max constant', () => {
    expect(typeof Priority.Max).toBe('number');
  });
  it('has the predefined Priority.Critical constant', () => {
    expect(typeof Priority.Critical).toBe('number');
  });
  it('has the predefined Priority.High constant', () => {
    expect(typeof Priority.High).toBe('number');
  });
  it('has the predefined Priority.Normal constant', () => {
    expect(typeof Priority.Normal).toBe('number');
  });
  it('has the predefined Priority.Low constant', () => {
    expect(typeof Priority.Low).toBe('number');
  });
  it('has the predefined Priority.Min constant', () => {
    expect(typeof Priority.Min).toBe('number');
  });

  describe('legacy aliases (backwards compatibility)', () => {
    it('has the predefined Priority.AAA constant', () => {
      expect(typeof Priority.AAA).toBe('number');
    });
    it('has the predefined Priority.BB constant', () => {
      expect(typeof Priority.BB).toBe('number');
    });
    it('has the predefined Priority.C constant', () => {
      expect(typeof Priority.C).toBe('number');
    });
    it('has the predefined Priority.Default constant', () => {
      expect(typeof Priority.Default).toBe('number');
    });

    it('Priority.AAA equals Priority.Critical', () => {
      expect(Priority.AAA).toBe(Priority.Critical);
    });
    it('Priority.BB equals Priority.High', () => {
      expect(Priority.BB).toBe(Priority.High);
    });
    it('Priority.Default equals Priority.Normal', () => {
      expect(Priority.Default).toBe(Priority.Normal);
    });
  });

  describe('Medium', () => {
    it('carries the value the legacy C alias always had', () => {
      expect(Priority.Medium).toBe(1e3);
      expect(Priority.C).toBe(Priority.Medium);
    });

    it('sorts between High and Normal', () => {
      expect(Priority.High).toBeGreaterThan(Priority.Medium);
      expect(Priority.Medium).toBeGreaterThan(Priority.Normal);
    });
  });

  describe('all predefined values should be in correct relationship to each other', () => {
    it('Priority.Max > Priority.Critical', () => {
      expect(Priority.Max > Priority.Critical).toBe(true);
    });
    it('Priority.Critical > Priority.High', () => {
      expect(Priority.Critical > Priority.High).toBe(true);
    });
    it('Priority.High > Priority.Normal', () => {
      expect(Priority.High > Priority.Normal).toBe(true);
    });
    it('Priority.Normal > Priority.Low', () => {
      expect(Priority.Normal > Priority.Low).toBe(true);
    });
    it('Priority.Low > Priority.Min', () => {
      expect(Priority.Low > Priority.Min).toBe(true);
    });
  });
});
