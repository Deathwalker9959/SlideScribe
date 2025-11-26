/**
 * Storage Service
 * Handles local storage, caching, and data persistence for the taskpane
 */

export interface StorageItem<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl?: number; // Time to live in milliseconds
}

export interface StorageService {
  // Basic storage operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  exists(key: string): Promise<boolean>;
  keys(): Promise<string[]>;

  // Cache operations
  getCache<T>(key: string): Promise<T | null>;
  setCache<T>(key: string, value: T, ttl: number): Promise<void>;
  removeExpired(): Promise<void>;

  // Batch operations
  getMultiple<T>(keys: string[]): Promise<Record<string, T | null>>;
  setMultiple<T>(items: Record<string, T>): Promise<void>;
  removeMultiple(keys: string[]): Promise<void>;
}

/**
 * Local Storage Implementation
 */
export class LocalStorageService implements StorageService {
  private readonly CACHE_PREFIX = "slidescribe_cache_";
  private readonly METADATA_PREFIX = "slidescribe_meta_";

  async get<T>(key: string): Promise<T | null> {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return null;
      }

      const item = localStorage.getItem(key);
      if (!item) {
        return null;
      }

      const parsedItem: StorageItem<T> = JSON.parse(item);

      // Check if item has expired
      if (parsedItem.ttl && Date.now() > parsedItem.timestamp + parsedItem.ttl) {
        await this.remove(key);
        return null;
      }

      return parsedItem.value;
    } catch (error) {
      console.warn(`Failed to get item from localStorage: ${key}`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        throw new Error("localStorage not available");
      }

      const item: StorageItem<T> = {
        key,
        value,
        timestamp: Date.now(),
      };

      localStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
      console.error(`Failed to set item in localStorage: ${key}`, error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }

      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove item from localStorage: ${key}`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }

      localStorage.clear();
    } catch (error) {
      console.warn("Failed to clear localStorage", error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return false;
      }

      return localStorage.getItem(key) !== null;
    } catch (error) {
      console.warn(`Failed to check if item exists in localStorage: ${key}`, error);
      return false;
    }
  }

  async keys(): Promise<string[]> {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return [];
      }

      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          keys.push(key);
        }
      }
      return keys;
    } catch (error) {
      console.warn("Failed to get localStorage keys", error);
      return [];
    }
  }

  // Cache operations with TTL
  async getCache<T>(key: string): Promise<T | null> {
    return this.get<T>(`${this.CACHE_PREFIX}${key}`);
  }

  async setCache<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        throw new Error("localStorage not available");
      }

      const item: StorageItem<T> = {
        key: `${this.CACHE_PREFIX}${key}`,
        value,
        timestamp: Date.now(),
        ttl,
      };

      localStorage.setItem(`${this.CACHE_PREFIX}${key}`, JSON.stringify(item));
    } catch (error) {
      console.error(`Failed to set cache item in localStorage: ${key}`, error);
      throw error;
    }
  }

  async removeExpired(): Promise<void> {
    try {
      const keys = await this.keys();
      const expiredKeys: string[] = [];

      for (const key of keys) {
        if (key.startsWith(this.CACHE_PREFIX)) {
          const item = localStorage.getItem(key);
          if (item) {
            try {
              const parsedItem: StorageItem = JSON.parse(item);
              if (parsedItem.ttl && Date.now() > parsedItem.timestamp + parsedItem.ttl) {
                expiredKeys.push(key);
              }
            } catch {
              // Invalid JSON, remove the key
              expiredKeys.push(key);
            }
          }
        }
      }

      for (const expiredKey of expiredKeys) {
        localStorage.removeItem(expiredKey);
      }
    } catch (error) {
      console.warn("Failed to remove expired cache items", error);
    }
  }

  // Batch operations
  async getMultiple<T>(keys: string[]): Promise<Record<string, T | null>> {
    const results: Record<string, T | null> = {};

    for (const key of keys) {
      results[key] = await this.get<T>(key);
    }

    return results;
  }

  async setMultiple<T>(items: Record<string, T>): Promise<void> {
    const errors: Error[] = [];

    for (const [key, value] of Object.entries(items)) {
      try {
        await this.set(key, value);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to set ${errors.length} items: ${errors.map((e) => e.message).join(", ")}`
      );
    }
  }

  async removeMultiple(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.remove(key)));
  }

  // Utility methods
  async getStorageSize(): Promise<number> {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return 0;
      }

      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += key.length + value.length;
          }
        }
      }
      return totalSize;
    } catch (error) {
      console.warn("Failed to calculate storage size", error);
      return 0;
    }
  }

  async getCacheSize(): Promise<number> {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return 0;
      }

      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_PREFIX)) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += key.length + value.length;
          }
        }
      }
      return totalSize;
    } catch (error) {
      console.warn("Failed to calculate cache size", error);
      return 0;
    }
  }
}

/**
 * Memory Storage Implementation (for testing and fallback)
 */
export class MemoryStorageService implements StorageService {
  private storage: Map<string, StorageItem> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const item = this.storage.get(key);
    if (!item) {
      return null;
    }

    // Check if item has expired
    if (item.ttl && Date.now() > item.timestamp + item.ttl) {
      this.storage.delete(key);
      return null;
    }

    return item.value;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const item: StorageItem<T> = {
      key,
      value,
      timestamp: Date.now(),
    };
    this.storage.set(key, item);
  }

  async remove(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async getCache<T>(key: string): Promise<T | null> {
    return this.get<T>(`cache_${key}`);
  }

  async setCache<T>(key: string, value: T, ttl: number): Promise<void> {
    const item: StorageItem<T> = {
      key: `cache_${key}`,
      value,
      timestamp: Date.now(),
      ttl,
    };
    this.storage.set(`cache_${key}`, item);
  }

  async removeExpired(): Promise<void> {
    const now = Date.now();
    for (const [key, item] of this.storage.entries()) {
      if (item.ttl && now > item.timestamp + item.ttl) {
        this.storage.delete(key);
      }
    }
  }

  async getMultiple<T>(keys: string[]): Promise<Record<string, T | null>> {
    const results: Record<string, T | null> = {};

    for (const key of keys) {
      results[key] = await this.get<T>(key);
    }

    return results;
  }

  async setMultiple<T>(items: Record<string, T>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      await this.set(key, value);
    }
  }

  async removeMultiple(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.storage.delete(key);
    }
  }
}

/**
 * Service Factory
 */
export class StorageServiceFactory {
  private static instance: StorageService;

  static getInstance(): StorageService {
    if (!this.instance) {
      if (typeof window !== "undefined" && window.localStorage) {
        this.instance = new LocalStorageService();
      } else {
        console.warn("localStorage not available, falling back to memory storage");
        this.instance = new MemoryStorageService();
      }
    }
    return this.instance;
  }

  static createMemoryService(): StorageService {
    return new MemoryStorageService();
  }

  static createLocalStorageService(): StorageService {
    return new LocalStorageService();
  }
}

// Export default instance
export default StorageServiceFactory.getInstance();
