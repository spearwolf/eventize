export const expect2ImplEventizeApi = (obj: any) => {
  describe('implements the eventizedObject API', () => {
    it('.on()', () => {
      expect(typeof obj.on).toBe('function');
    });
    it('.once()', () => {
      expect(typeof obj.once).toBe('function');
    });
    it('.onceAsync()', () => {
      expect(typeof obj.onceAsync).toBe('function');
    });
    it('.off()', () => {
      expect(typeof obj.off).toBe('function');
    });
    it('.emit()', () => {
      expect(typeof obj.emit).toBe('function');
    });
    it('.emitAsync()', () => {
      expect(typeof obj.emitAsync).toBe('function');
    });
    it('.retain()', () => {
      expect(typeof obj.retain).toBe('function');
    });
    it('.retainClear()', () => {
      expect(typeof obj.retainClear).toBe('function');
    });
  });
};
