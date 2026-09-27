import { ModelMetadataCache, CacheManager } from "./ModelMetadataCache";

describe("ModelMetadataCache", () => {
  it("should store and retrieve cached values", () => {
    const cache = new ModelMetadataCache();
    cache.set("key1", { name: "model1" });

    expect(cache.get("key1")).toEqual({ name: "model1" });
  });

  it("should return undefined for missing keys", () => {
    const cache = new ModelMetadataCache();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("should detect cached keys with has()", () => {
    const cache = new ModelMetadataCache();
    cache.set("key1", "value1");

    expect(cache.has("key1")).toBe(true);
    expect(cache.has("key2")).toBe(false);
  });

  it("should expire entries after TTL", async () => {
    const cache = new ModelMetadataCache({ ttlMs: 100 });
    cache.set("key1", "value1");

    expect(cache.get("key1")).toBe("value1");

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(cache.get("key1")).toBeUndefined();
    expect(cache.has("key1")).toBe(false);
  });

  it("should clear all entries", () => {
    const cache = new ModelMetadataCache();
    cache.set("key1", "value1");
    cache.set("key2", "value2");

    expect(cache.size()).toBe(2);

    cache.clear();

    expect(cache.size()).toBe(0);
  });

  it("should delete specific entries", () => {
    const cache = new ModelMetadataCache();
    cache.set("key1", "value1");
    cache.set("key2", "value2");

    const deleted = cache.delete("key1");

    expect(deleted).toBe(true);
    expect(cache.has("key1")).toBe(false);
    expect(cache.has("key2")).toBe(true);
  });

  it("should return keys", () => {
    const cache = new ModelMetadataCache();
    cache.set("key1", "value1");
    cache.set("key2", "value2");

    const keys = cache.keys();

    expect(keys).toContain("key1");
    expect(keys).toContain("key2");
    expect(keys.length).toBe(2);
  });

  it("should enforce max entries limit", () => {
    const cache = new ModelMetadataCache({ maxEntries: 3 });
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.set("key3", "value3");

    expect(cache.size()).toBe(3);

    cache.set("key4", "value4");

    expect(cache.size()).toBe(3);
    expect(cache.has("key1")).toBe(false); // oldest entry removed
    expect(cache.has("key4")).toBe(true);
  });

  it("should support getOrCompute", async () => {
    const cache = new ModelMetadataCache();
    const compute = jest.fn(async () => ({ name: "computed" }));

    const result1 = await cache.getOrCompute("key1", compute);
    const result2 = await cache.getOrCompute("key1", compute);

    expect(result1).toEqual({ name: "computed" });
    expect(result2).toEqual({ name: "computed" });
    expect(compute).toHaveBeenCalledTimes(1); // compute called only once
  });

  it("should invalidate with predicate", () => {
    const cache = new ModelMetadataCache();
    cache.set("prefix_1", "value1");
    cache.set("prefix_2", "value2");
    cache.set("other_1", "value3");

    const count = cache.invalidateWhere(key => key.startsWith("prefix_"));

    expect(count).toBe(2);
    expect(cache.has("prefix_1")).toBe(false);
    expect(cache.has("other_1")).toBe(true);
  });

  it("should provide cache statistics", () => {
    const cache = new ModelMetadataCache({ maxEntries: 100, ttlMs: 10000 });
    cache.set("key1", "value1");
    cache.set("key2", "value2");

    const stats = cache.getStats();

    expect(stats.totalEntries).toBe(2);
    expect(stats.activeEntries).toBe(2);
    expect(stats.expiredEntries).toBe(0);
    expect(stats.maxEntries).toBe(100);
    expect(stats.ttlMs).toBe(10000);
  });

  it("should respect enabled flag", () => {
    const cache = new ModelMetadataCache({ enabled: false });
    cache.set("key1", "value1");

    expect(cache.get("key1")).toBeUndefined();
    expect(cache.has("key1")).toBe(false);
  });
});

describe("CacheManager", () => {
  it("should create and retrieve named caches", () => {
    const manager = new CacheManager();
    const cache1 = manager.getOrCreateCache("cache1");
    const cache2 = manager.getOrCreateCache("cache1");

    expect(cache1).toBe(cache2); // Should be same instance
  });

  it("should apply default config to new caches", () => {
    const manager = new CacheManager({ ttlMs: 5000, maxEntries: 50 });
    const cache = manager.getOrCreateCache("cache1");

    const stats = cache.getStats();

    expect(stats.ttlMs).toBe(5000);
    expect(stats.maxEntries).toBe(50);
  });

  it("should override default config", () => {
    const manager = new CacheManager({ ttlMs: 5000 });
    const cache = manager.getOrCreateCache("cache1", { ttlMs: 10000 });

    const stats = cache.getStats();

    expect(stats.ttlMs).toBe(10000);
  });

  it("should clear all caches", () => {
    const manager = new CacheManager();
    const cache1 = manager.getOrCreateCache("cache1");
    const cache2 = manager.getOrCreateCache("cache2");

    cache1.set("key1", "value1");
    cache2.set("key2", "value2");

    manager.clearAll();

    expect(cache1.size()).toBe(0);
    expect(cache2.size()).toBe(0);
  });

  it("should provide stats for all caches", () => {
    const manager = new CacheManager();
    const cache1 = manager.getOrCreateCache("cache1");
    const cache2 = manager.getOrCreateCache("cache2");

    cache1.set("key1", "value1");
    cache2.set("key2", "value2");
    cache2.set("key3", "value3");

    const stats = manager.getStats();

    expect(stats.cache1.totalEntries).toBe(1);
    expect(stats.cache2.totalEntries).toBe(2);
  });

  it("should get existing cache", () => {
    const manager = new CacheManager();
    const cache1 = manager.getOrCreateCache("cache1");

    const retrieved = manager.getCache("cache1");

    expect(retrieved).toBe(cache1);
  });

  it("should return undefined for non-existent cache", () => {
    const manager = new CacheManager();

    const retrieved = manager.getCache("missing");

    expect(retrieved).toBeUndefined();
  });
});
