import {Priority} from './Priority';

describe('Priority', () => {
  it('has the predefined Priority.Max constant', () => {
    expect(typeof Priority.Max).toBe('number');
  });
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
  it('has the predefined Priority.Low constant', () => {
    expect(typeof Priority.Low).toBe('number');
  });
  it('has the predefined Priority.Min constant', () => {
    expect(typeof Priority.Min).toBe('number');
  });

  describe('all predefined values should be in correct relationship to each other', () => {
    it('Priority.Max > Priority.AAA', () => {
      expect(Priority.Max > Priority.AAA).toBe(true);
    });
    it('Priority.AAA > Priority.BB', () => {
      expect(Priority.AAA > Priority.BB).toBe(true);
    });
    it('Priority.BB > Priority.C', () => {
      expect(Priority.BB > Priority.C).toBe(true);
    });
    it('Priority.C > Priority.Default', () => {
      expect(Priority.C > Priority.Default).toBe(true);
    });
    it('Priority.Default > Priority.Low', () => {
      expect(Priority.Default > Priority.Low).toBe(true);
    });
    it('Priority.Low > Priority.Min', () => {
      expect(Priority.Low > Priority.Min).toBe(true);
    });
  });
});
