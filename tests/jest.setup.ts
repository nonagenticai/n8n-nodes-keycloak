import { jest } from '@jest/globals';

// Mock localStorage for Node environment
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    store: {} as Record<string, string>,
    getItem(key: string) {
      return this.store[key] || null;
    },
    setItem(key: string, value: string) {
      this.store[key] = value;
    },
    removeItem(key: string) {
      delete this.store[key];
    },
    clear() {
      this.store = {};
    },
    key(index: number) {
      return Object.keys(this.store)[index] || null;
    },
    get length() {
      return Object.keys(this.store).length;
    },
  },
  writable: true,
});
