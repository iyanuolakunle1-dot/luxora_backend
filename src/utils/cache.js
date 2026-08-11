/**
 * High-performance Server-Side In-Memory Cache (TTL based)
 * Reduces database load on Supabase and speeds up response times to ~1ms.
 */

class ServerCache {
  constructor(defaultTtlMs = 60 * 1000) {
    this.cache = new Map();
    this.defaultTtl = defaultTtlMs;

    // Periodically clean expired keys every 2 minutes
    setInterval(() => this.cleanup(), 2 * 60 * 1000).unref();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtl) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Invalidates all cache keys that start with or contain a table name
   */
  invalidateTable(table) {
    const clean = table.toLowerCase();
    for (const key of this.cache.keys()) {
      if (key.toLowerCase().includes(clean)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export const serverCache = new ServerCache(60 * 1000); // 60s default TTL
export default serverCache;
