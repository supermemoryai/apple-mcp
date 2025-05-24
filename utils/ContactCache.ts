/**
 * Contact caching system with TTL (Time-To-Live) expiration and memory management
 * Prevents repeated loading of all contacts, improving performance significantly
 */

export interface ContactsData {
    [contactName: string]: string[];
}

export interface CacheEntry {
    data: ContactsData;
    timestamp: number;
    accessCount: number;
    lastAccessed: number;
}

export interface CacheConfig {
    enabled: boolean;
    ttlMs: number; // Time-to-live in milliseconds
    maxMemoryMB: number; // Maximum memory usage in MB
    maxEntries: number; // Maximum number of cache entries
    cleanupIntervalMs: number; // How often to run cleanup
}

export interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    totalQueries: number;
    currentEntries: number;
    estimatedMemoryMB: number;
    hitRate: number;
}

const DEFAULT_CONFIG: CacheConfig = {
    enabled: true,
    ttlMs: 10 * 60 * 1000, // 10 minutes
    maxMemoryMB: 50, // 50MB max
    maxEntries: 10, // Max 10 different cache entries
    cleanupIntervalMs: 60 * 1000, // Cleanup every minute
};

/**
 * High-performance contact cache with automatic cleanup and memory management
 */
export class ContactCache {
    private cache = new Map<string, CacheEntry>();
    private config: CacheConfig;
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        totalQueries: 0,
        currentEntries: 0,
        estimatedMemoryMB: 0,
        hitRate: 0,
    };
    private cleanupTimer: NodeJS.Timeout | null = null;

    constructor(config: Partial<CacheConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        if (this.config.enabled) {
            this.startCleanupTimer();
        }
    }

    /**
     * Get cached contacts data if valid, otherwise return null
     */
    get(key: string = 'default'): ContactsData | null {
        this.stats.totalQueries++;

        if (!this.config.enabled) {
            this.stats.misses++;
            return null;
        }

        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        const now = Date.now();
        const age = now - entry.timestamp;

        // Check if expired
        if (age > this.config.ttlMs) {
            this.cache.delete(key);
            this.stats.misses++;
            this.stats.evictions++;
            this.updateStats();
            return null;
        }

        // Update access tracking
        entry.accessCount++;
        entry.lastAccessed = now;
        
        this.stats.hits++;
        this.updateStats();
        
        console.log(`🚀 Cache HIT: Retrieved ${Object.keys(entry.data).length} contacts (age: ${Math.round(age / 1000)}s)`);
        return entry.data;
    }

    /**
     * Store contacts data in cache
     */
    set(data: ContactsData, key: string = 'default'): void {
        if (!this.config.enabled) {
            return;
        }

        const now = Date.now();
        const entry: CacheEntry = {
            data,
            timestamp: now,
            accessCount: 1,
            lastAccessed: now,
        };

        // Check memory limits before adding
        if (this.shouldEvictForMemory(data)) {
            this.evictLeastRecentlyUsed();
        }

        // Check entry count limits
        if (this.cache.size >= this.config.maxEntries) {
            this.evictLeastRecentlyUsed();
        }

        this.cache.set(key, entry);
        this.updateStats();
        
        console.log(`💾 Cache SET: Stored ${Object.keys(data).length} contacts (TTL: ${this.config.ttlMs / 1000}s)`);
    }

    /**
     * Manually invalidate cache entry or all entries
     */
    invalidate(key?: string): void {
        if (key) {
            const deleted = this.cache.delete(key);
            if (deleted) {
                console.log(`🗑️ Cache INVALIDATED: ${key}`);
            }
        } else {
            const count = this.cache.size;
            this.cache.clear();
            console.log(`🗑️ Cache CLEARED: ${count} entries removed`);
        }
        this.updateStats();
    }

    /**
     * Get current cache statistics
     */
    getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * Update cache configuration
     */
    updateConfig(newConfig: Partial<CacheConfig>): void {
        const oldEnabled = this.config.enabled;
        this.config = { ...this.config, ...newConfig };

        // Handle enable/disable
        if (!oldEnabled && this.config.enabled) {
            this.startCleanupTimer();
        } else if (oldEnabled && !this.config.enabled) {
            this.stopCleanupTimer();
            this.cache.clear();
        }

        console.log(`⚙️ Cache config updated:`, this.config);
    }

    /**
     * Get current cache configuration
     */
    getConfig(): CacheConfig {
        return { ...this.config };
    }

    /**
     * Cleanup expired entries and enforce memory limits
     */
    cleanup(): void {
        if (!this.config.enabled) {
            return;
        }

        const now = Date.now();
        let expiredCount = 0;

        // Remove expired entries
        for (const [key, entry] of this.cache.entries()) {
            const age = now - entry.timestamp;
            if (age > this.config.ttlMs) {
                this.cache.delete(key);
                expiredCount++;
                this.stats.evictions++;
            }
        }

        // Enforce memory limits
        while (this.isOverMemoryLimit()) {
            this.evictLeastRecentlyUsed();
        }

        this.updateStats();

        if (expiredCount > 0) {
            console.log(`🧹 Cache cleanup: ${expiredCount} expired entries removed`);
        }
    }

    /**
     * Destroy cache and cleanup resources
     */
    destroy(): void {
        this.stopCleanupTimer();
        this.cache.clear();
        this.updateStats();
        console.log(`🔥 Cache destroyed`);
    }

    // Private methods

    private startCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.config.cleanupIntervalMs);
    }

    private stopCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    private updateStats(): void {
        this.stats.currentEntries = this.cache.size;
        this.stats.estimatedMemoryMB = this.estimateMemoryUsage();
        this.stats.hitRate = this.stats.totalQueries > 0 
            ? (this.stats.hits / this.stats.totalQueries) * 100 
            : 0;
    }

    private estimateMemoryUsage(): number {
        let totalSize = 0;
        
        for (const entry of this.cache.values()) {
            // Rough estimation: each contact name + phone numbers
            for (const [name, phones] of Object.entries(entry.data)) {
                totalSize += name.length * 2; // UTF-16 characters
                totalSize += phones.reduce((sum, phone) => sum + phone.length * 2, 0);
            }
            // Add overhead for objects and arrays
            totalSize += 200; // Rough overhead per entry
        }
        
        return totalSize / (1024 * 1024); // Convert to MB
    }

    private shouldEvictForMemory(newData: ContactsData): boolean {
        const currentMemory = this.estimateMemoryUsage();
        
        // Estimate size of new data
        let newDataSize = 0;
        for (const [name, phones] of Object.entries(newData)) {
            newDataSize += name.length * 2;
            newDataSize += phones.reduce((sum, phone) => sum + phone.length * 2, 0);
        }
        newDataSize = newDataSize / (1024 * 1024);

        return (currentMemory + newDataSize) > this.config.maxMemoryMB;
    }

    private isOverMemoryLimit(): boolean {
        return this.estimateMemoryUsage() > this.config.maxMemoryMB;
    }

    private evictLeastRecentlyUsed(): void {
        if (this.cache.size === 0) {
            return;
        }

        let lruKey: string | null = null;
        let oldestAccess = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < oldestAccess) {
                oldestAccess = entry.lastAccessed;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.cache.delete(lruKey);
            this.stats.evictions++;
            console.log(`🗑️ Cache EVICTED: ${lruKey} (LRU)`);
        }
    }
}

// Global cache instance
let globalCache: ContactCache | null = null;

/**
 * Get or create the global contact cache instance
 */
export function getContactCache(config?: Partial<CacheConfig>): ContactCache {
    if (!globalCache) {
        globalCache = new ContactCache(config);
    } else if (config) {
        globalCache.updateConfig(config);
    }
    return globalCache;
}

/**
 * Destroy the global cache instance
 */
export function destroyContactCache(): void {
    if (globalCache) {
        globalCache.destroy();
        globalCache = null;
    }
} 