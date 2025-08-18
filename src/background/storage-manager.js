// src/background/storage-manager.js - Optimized storage operations
import { Logger } from '../shared/logger.js';
import { TIMEOUTS, LIMITS } from '../shared/constants.js';
import { errorHandler } from '../shared/error-handler.js';

export class StorageManager
{
    constructor()
    {
        this.logger = new Logger('StorageManager');
        this.pendingWrites = new Map();
        this.writeTimer = null;
        this.writeInterval = TIMEOUTS.BATCH_WRITE_INTERVAL;
        this.cache = new Map();
        this.cacheTimestamps = new Map();
    }

    async set(data)
    {
        try
        {
            Object.entries(data).forEach(([key, value]) =>
            {
                this.pendingWrites.set(key, value);
                // Update cache
                this.cache.set(key, value);
                this.cacheTimestamps.set(key, Date.now());
            });

            this.scheduleWrite();
            this.logger.debug('Scheduled write for keys:', Object.keys(data));
        } catch (error)
        {
            errorHandler.handleError(error, 'storage-set');
            throw error;
        }
    }

    scheduleWrite()
    {
        if (this.writeTimer) return;

        this.writeTimer = setTimeout(async () =>
        {
            if (this.pendingWrites.size > 0)
            {
                const data = Object.fromEntries(this.pendingWrites);

                try
                {
                    await chrome.storage.local.set(data);
                    this.logger.debug('Batch write completed:', Object.keys(data));
                } catch (error)
                {
                    this.logger.error('Batch write failed:', error);
                    errorHandler.handleError(error, 'storage-batch-write');
                }

                this.pendingWrites.clear();
            }
            this.writeTimer = null;
        }, this.writeInterval);
    }

    async get(keys)
    {
        try
        {
            // Flush pending writes first for requested keys
            const keysArray = Array.isArray(keys) ? keys : [keys];
            const hasPendingWrites = keysArray.some(key => this.pendingWrites.has(key));

            if (hasPendingWrites)
            {
                await this.flush();
            }

            // Check cache first
            const cachedData = {};
            const uncachedKeys = [];

            for (const key of keysArray)
            {
                if (this.cache.has(key) && this.isCacheValid(key))
                {
                    cachedData[key] = this.cache.get(key);
                } else
                {
                    uncachedKeys.push(key);
                }
            }

            // Fetch uncached data
            let fetchedData = {};
            if (uncachedKeys.length > 0)
            {
                fetchedData = await chrome.storage.local.get(uncachedKeys);

                // Update cache
                Object.entries(fetchedData).forEach(([key, value]) =>
                {
                    this.cache.set(key, value);
                    this.cacheTimestamps.set(key, Date.now());
                });
            }

            const result = { ...cachedData, ...fetchedData };
            this.logger.debug('Retrieved data for keys:', keysArray);
            return result;
        } catch (error)
        {
            errorHandler.handleError(error, 'storage-get');
            throw error;
        }
    }

    isCacheValid(key)
    {
        const timestamp = this.cacheTimestamps.get(key);
        if (!timestamp) return false;
        return (Date.now() - timestamp) < TIMEOUTS.CACHE_TIMEOUT;
    }

    async flush()
    {
        if (this.writeTimer)
        {
            clearTimeout(this.writeTimer);
            this.writeTimer = null;
        }

        if (this.pendingWrites.size > 0)
        {
            const data = Object.fromEntries(this.pendingWrites);

            try
            {
                await chrome.storage.local.set(data);
                this.logger.debug('Manual flush completed:', Object.keys(data));
            } catch (error)
            {
                this.logger.error('Manual flush failed:', error);
                errorHandler.handleError(error, 'storage-flush');
                throw error;
            }

            this.pendingWrites.clear();
        }
    }

    async remove(keys)
    {
        try
        {
            const keysArray = Array.isArray(keys) ? keys : [keys];

            // Remove from pending writes and cache
            keysArray.forEach(key =>
            {
                this.pendingWrites.delete(key);
                this.cache.delete(key);
                this.cacheTimestamps.delete(key);
            });

            await chrome.storage.local.remove(keysArray);
            this.logger.debug('Removed keys:', keysArray);
        } catch (error)
        {
            errorHandler.handleError(error, 'storage-remove');
            throw error;
        }
    }

    async clear()
    {
        try
        {
            this.pendingWrites.clear();
            this.cache.clear();
            this.cacheTimestamps.clear();

            if (this.writeTimer)
            {
                clearTimeout(this.writeTimer);
                this.writeTimer = null;
            }

            await chrome.storage.local.clear();
            this.logger.info('Storage cleared');
        } catch (error)
        {
            errorHandler.handleError(error, 'storage-clear');
            throw error;
        }
    }

    clearCache()
    {
        this.cache.clear();
        this.cacheTimestamps.clear();
        this.logger.debug('Cache cleared');
    }

    getCacheStats()
    {
        return {
            size: this.cache.size,
            pendingWrites: this.pendingWrites.size,
            hasTimer: !!this.writeTimer
        };
    }

    // Cleanup method
    destroy()
    {
        if (this.writeTimer)
        {
            clearTimeout(this.writeTimer);
            this.writeTimer = null;
        }

        this.pendingWrites.clear();
        this.cache.clear();
        this.cacheTimestamps.clear();
        this.logger.info('StorageManager destroyed');
    }
}

// Export singleton instance
export const storageManager = new StorageManager();