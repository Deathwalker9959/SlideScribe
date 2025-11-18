/**
 * Storage Service Unit Tests
 * Tests the localStorage and memory storage implementations
 */

import { LocalStorageService, MemoryStorageService, StorageServiceFactory } from '../../../src/taskpane/services/utility/StorageService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    key: jest.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
    get length() {
      return Object.keys(store).length;
    },
  };
})();

// Mock window object
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('StorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  describe('LocalStorageService', () => {
    let storageService: LocalStorageService;

    beforeEach(() => {
      storageService = new LocalStorageService();
    });

    describe('Basic Operations', () => {
      test('stores and retrieves simple values', async () => {
        await storageService.set('test-key', 'test-value');
        const result = await storageService.get('test-key');
        expect(result).toBe('test-value');
      });

      test('stores and retrieves complex objects', async () => {
        const testObject = {
          id: 1,
          name: 'Test Object',
          nested: { value: 'nested value' },
        };

        await storageService.set('object-key', testObject);
        const result = await storageService.get('object-key');
        expect(result).toEqual(testObject);
      });

      test('returns null for non-existent keys', async () => {
        const result = await storageService.get('non-existent');
        expect(result).toBeNull();
      });

      test('removes items', async () => {
        await storageService.set('test-key', 'test-value');
        await storageService.remove('test-key');
        const result = await storageService.get('test-key');
        expect(result).toBeNull();
      });

      test('checks if items exist', async () => {
        expect(await storageService.exists('test-key')).toBe(false);
        await storageService.set('test-key', 'test-value');
        expect(await storageService.exists('test-key')).toBe(true);
        await storageService.remove('test-key');
        expect(await storageService.exists('test-key')).toBe(false);
      });

      test('gets all keys', async () => {
        await storageService.set('key1', 'value1');
        await storageService.set('key2', 'value2');
        await storageService.set('key3', 'value3');

        const keys = await storageService.keys();
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
        expect(keys).toContain('key3');
        expect(keys).toHaveLength(3);
      });

      test('clears all items', async () => {
        await storageService.set('key1', 'value1');
        await storageService.set('key2', 'value2');

        await storageService.clear();

        expect(await storageService.keys()).toHaveLength(0);
        expect(await storageService.get('key1')).toBeNull();
        expect(await storageService.get('key2')).toBeNull();
      });
    });

    describe('Cache Operations', () => {
      test('stores and retrieves cached items', async () => {
        await storageService.setCache('cache-key', 'cache-value', 60000); // 1 minute TTL
        const result = await storageService.getCache('cache-key');
        expect(result).toBe('cache-value');
      });

      test('returns null for expired cache items', async () => {
        jest.useFakeTimers();

        await storageService.setCache('cache-key', 'cache-value', 1000); // 1 second TTL

        // Before expiration
        let result = await storageService.getCache('cache-key');
        expect(result).toBe('cache-value');

        // After expiration
        jest.advanceTimersByTime(1100);
        result = await storageService.getCache('cache-key');
        expect(result).toBeNull();

        jest.useRealTimers();
      });

      test('removes expired cache items', async () => {
        jest.useFakeTimers();

        await storageService.setCache('valid-key', 'valid-value', 10000); // 10 seconds
        await storageService.setCache('expired-key', 'expired-value', 1000); // 1 second

        jest.advanceTimersByTime(1100);
        await storageService.removeExpired();

        expect(await storageService.getCache('valid-key')).toBe('valid-value');
        expect(await storageService.getCache('expired-key')).toBeNull();

        jest.useRealTimers();
      });
    });

    describe('Batch Operations', () => {
      test('gets multiple items', async () => {
        await storageService.set('key1', 'value1');
        await storageService.set('key2', 'value2');
        await storageService.set('key3', 'value3');

        const results = await storageService.getMultiple(['key1', 'key2', 'key3', 'key4']);
        expect(results).toEqual({
          key1: 'value1',
          key2: 'value2',
          key3: 'value3',
          key4: null,
        });
      });

      test('sets multiple items', async () => {
        const items = {
          key1: 'value1',
          key2: 'value2',
          key3: 'value3',
        };

        await storageService.setMultiple(items);

        const results = await storageService.getMultiple(Object.keys(items));
        expect(results).toEqual({
          key1: 'value1',
          key2: 'value2',
          key3: 'value3',
        });
      });

      test('removes multiple items', async () => {
        await storageService.set('key1', 'value1');
        await storageService.set('key2', 'value2');
        await storageService.set('key3', 'value3');

        await storageService.removeMultiple(['key1', 'key3']);

        const results = await storageService.getMultiple(['key1', 'key2', 'key3']);
        expect(results).toEqual({
          key1: null,
          key2: 'value2',
          key3: null,
        });
      });
    });

    describe('Error Handling', () => {
      test('handles localStorage quota exceeded errors', async () => {
        const mockSetItem = localStorageMock.setItem as jest.Mock;
        mockSetItem.mockImplementation(() => {
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        });

        await expect(storageService.set('large-key', 'x'.repeat(1000000))).rejects.toThrow();

        // Should still be able to get other items
        await storageService.set('small-key', 'small-value');
        expect(await storageService.get('small-key')).toBe('small-value');
      });

      test('handles JSON parsing errors', async () => {
        const mockGetItem = localStorageMock.getItem as jest.Mock;
        mockGetItem.mockReturnValue('invalid-json');

        const result = await storageService.get('invalid-json-key');
        expect(result).toBeNull();
      });
    });

    describe('Utility Methods', () => {
      test('calculates storage size', async () => {
        await storageService.set('key1', 'value1');
        await storageService.set('key2', 'value2');

        const size = await storageService.getStorageSize();
        expect(size).toBeGreaterThan(0);
      });

      test('calculates cache size', async () => {
        await storageService.setCache('cache-key1', 'cache-value1', 60000);
        await storageService.setCache('cache-key2', 'cache-value2', 60000);

        const size = await storageService.getCacheSize();
        expect(size).toBeGreaterThan(0);
      });
    });
  });

  describe('MemoryStorageService', () => {
    let storageService: MemoryStorageService;

    beforeEach(() => {
      storageService = new MemoryStorageService();
    });

    test('stores and retrieves values correctly', async () => {
      await storageService.set('test-key', 'test-value');
      const result = await storageService.get('test-key');
      expect(result).toBe('test-value');
    });

    test('handles expiration correctly', async () => {
      jest.useFakeTimers();

      await storageService.setCache('cache-key', 'cache-value', 1000); // 1 second

      // Before expiration
      let result = await storageService.getCache('cache-key');
      expect(result).toBe('cache-value');

      // After expiration
      jest.advanceTimersByTime(1100);
      result = await storageService.getCache('cache-key');
      expect(result).toBeNull();

      jest.useRealTimers();
    });

    test('clears all data', async () => {
      await storageService.set('key1', 'value1');
      await storageService.set('key2', 'value2');

      await storageService.clear();

      expect(await storageService.get('key1')).toBeNull();
      expect(await storageService.get('key2')).toBeNull();
    });
  });

  describe('StorageServiceFactory', () => {
    test('creates LocalStorageService when localStorage is available', () => {
      const service = StorageServiceFactory.createLocalStorageService();
      expect(service).toBeInstanceOf(LocalStorageService);
    });

    test('creates MemoryStorageService when requested', () => {
      const service = StorageServiceFactory.createMemoryService();
      expect(service).toBeInstanceOf(MemoryStorageService);
    });

    test('getInstance returns LocalStorageService by default', () => {
      const service = StorageServiceFactory.getInstance();
      expect(service).toBeInstanceOf(LocalStorageService);
    });
  });

  describe('Edge Cases', () => {
    let storageService: LocalStorageService;

    beforeEach(() => {
      storageService = new LocalStorageService();
    });

    test('handles empty localStorage', async () => {
      const keys = await storageService.keys();
      expect(keys).toHaveLength(0);
    });

    test('handles very long keys and values', async () => {
      const longKey = 'k'.repeat(100);
      const longValue = 'v'.repeat(10000);

      await storageService.set(longKey, longValue);
      const result = await storageService.get(longKey);
      expect(result).toBe(longValue);
    });

    test('handles special characters in keys', async () => {
      const specialKeys = [
        'key-with-dashes',
        'key_with_underscores',
        'key.with.dots',
        'key with spaces',
        'key@with#special$chars%',
      ];

      for (const key of specialKeys) {
        await storageService.set(key, `value for ${key}`);
        expect(await storageService.get(key)).toBe(`value for ${key}`);
      }
    });

    test('handles circular references in objects', async () => {
      const circularObject: any = { name: 'circular' };
      circularObject.self = circularObject;

      // Should throw an error when trying to serialize circular reference
      await expect(storageService.set('circular', circularObject)).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    let storageService: LocalStorageService;

    beforeEach(() => {
      storageService = new LocalStorageService();
    });

    test('handles large number of items efficiently', async () => {
      const items: Record<string, string> = {};
      const itemCount = 1000;

      // Create many items
      for (let i = 0; i < itemCount; i++) {
        items[`key-${i}`] = `value-${i}`;
      }

      const startTime = Date.now();
      await storageService.setMultiple(items);
      const setTime = Date.now() - startTime;

      expect(setTime).toBeLessThan(1000); // Should complete within 1 second

      const getStartTime = Date.now();
      const results = await storageService.getMultiple(Object.keys(items));
      const getTime = Date.now() - getStartTime;

      expect(getTime).toBeLessThan(500); // Should complete within 0.5 seconds
      expect(Object.keys(results)).toHaveLength(itemCount);
    });
  });
});