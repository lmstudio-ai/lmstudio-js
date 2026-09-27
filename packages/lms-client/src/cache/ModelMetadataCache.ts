/**
 * Configuration for model metadata cache.
 * @public
 */
export interface ModelCacheConfig {
  /**
   * Whether caching is enabled.
   * @default true
   */
  enabled?: boolean;

  /**
   * Time-to-live for cached entries in milliseconds.
   * @default 300000 (5 minutes)
   */
  ttlMs?: number;

  /**
   * Maximum number of entries to keep in cache.
   * @default 100
   */
  maxEntries?: number;
}

/**
 * Cached item with metadata.
 * @internal
 */
interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
}

/**
 * Model metadata cache implementation.
 * @public
 */
export class ModelMetadataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly config: Required<ModelCacheConfig>;

  public constructor(config: ModelCacheConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      ttlMs: config.ttlMs ?? 300000, // 5 minutes default
      maxEntries: config.maxEntries ?? 100,
    };
  }

  /**
   * Get a cached value by key.
   */
  public get<T>(key: string): T | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const entry = this.cache.get(key);
    if (entry === undefined) {
      return undefined;
    }

    // Check if entry is expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Set a value in the cache.
   */
  public set<T>(key: string, value: T): void {
    if (!this.config.enabled) {
      return;
    }

    // Enforce max entries limit
    if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
      // Remove the oldest entry
      let oldestKey: string | undefined;
      let oldestTime = Infinity;

      for (const [k, entry] of this.cache.entries()) {
        if (entry.createdAt < oldestTime) {
          oldestTime = entry.createdAt;
          oldestKey = k;
        }
      }

      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
    });
  }

  /**
   * Check if a key is in the cache and not expired.
   */
  public has(key: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const entry = this.cache.get(key);
    if (entry === undefined) {
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all entries from the cache.
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Remove a specific entry from the cache.
   */
  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Get the number of entries in the cache.
   */
  public size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache.
   */
  public keys(): string[] {
    const result: string[] = [];
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now <= entry.expiresAt) {
        result.push(key);
      } else {
        this.cache.delete(key);
      }
    }

    return result;
  }

  /**
   * Execute a function and cache its result.
   */
  public async getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(key, value);
    return value;
  }

  /**
   * Invalidate cache entries matching a predicate.
   */
  public invalidateWhere(predicate: (key: string) => boolean): number {
    let count = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (predicate(key)) {
        if (this.cache.delete(key)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Get cache statistics.
   */
  public getStats() {
    const now = Date.now();
    let expiredCount = 0;

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expiredCount++;
      }
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount,
      activeEntries: this.cache.size - expiredCount,
      maxEntries: this.config.maxEntries,
      ttlMs: this.config.ttlMs,
      enabled: this.config.enabled,
    };
  }
}

/**
 * Manager for multiple caches.
 * @public
 */
export class CacheManager {
  private caches = new Map<string, ModelMetadataCache>();
  private readonly defaultConfig: ModelCacheConfig;

  public constructor(defaultConfig: ModelCacheConfig = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a named cache.
   */
  public getOrCreateCache(name: string, config?: ModelCacheConfig): ModelMetadataCache {
    let cache = this.caches.get(name);
    if (cache === undefined) {
      cache = new ModelMetadataCache({
        ...this.defaultConfig,
        ...config,
      });
      this.caches.set(name, cache);
    }
    return cache;
  }

  /**
   * Get a named cache.
   */
  public getCache(name: string): ModelMetadataCache | undefined {
    return this.caches.get(name);
  }

  /**
   * Clear all caches.
   */
  public clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }

  /**
   * Get statistics for all caches.
   */
  public getStats() {
    const stats: Record<string, ReturnType<ModelMetadataCache["getStats"]>> = {};
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }
    return stats;
  }
}
