// src/services/blocklist-manager.js - Blocklist management service
import { Logger } from '../shared/logger.js';
import { Utils } from '../shared/utils.js';
import { TIMEOUTS, LIMITS } from '../shared/constants.js';
import { errorHandler } from '../shared/error-handler.js';

export class BlocklistManager
{
    constructor()
    {
        this.logger = new Logger('BlocklistManager');
        this.cache = new Map();
        this.retryAttempts = new Map();
        this.maxRetries = LIMITS.MAX_RETRIES;
        this.cacheExpiry = LIMITS.BLOCKLIST_CACHE_EXPIRY;
    }

    async fetchBlocklist(url)
    {
        try
        {
            // Check cache first
            const cached = this.cache.get(url);
            if (cached && Date.now() - cached.timestamp < this.cacheExpiry)
            {
                this.logger.debug(`Using cached blocklist for ${url}`);
                return cached.data;
            }

            this.logger.info(`Fetching blocklist from ${url}`);
            const response = await this.fetchWithRetry(url);
            const data = await response.text();

            // Validate response
            if (!data || data.length < 100)
            {
                throw new Error('Invalid or empty blocklist response');
            }

            // Cache successful response
            this.cache.set(url, {
                data,
                timestamp: Date.now()
            });

            this.logger.info(`Fetched and cached blocklist from ${url} (${Utils.formatBytes(data.length)})`);
            return data;
        } catch (error)
        {
            // Return cached data even if expired on error
            if (cached)
            {
                this.logger.warn('Using stale cache due to fetch error:', error.message);
                return cached.data;
            }

            errorHandler.handleError(error, 'blocklist-fetch', { url });
            throw error;
        }
    }

    async fetchWithRetry(url, maxRetries = this.maxRetries)
    {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++)
        {
            try
            {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/plain',
                        'User-Agent': 'Mozilla/5.0 (compatible; Fokus-Extension/1.0.0)',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    mode: 'cors',
                    credentials: 'omit',
                    signal: Utils.createAbortSignal(TIMEOUTS.FETCH_TIMEOUT)
                });

                if (response.ok)
                {
                    this.retryAttempts.delete(url);
                    return response;
                }

                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
            } catch (error)
            {
                lastError = error;

                // Exponential backoff
                if (attempt < maxRetries)
                {
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    this.logger.warn(`Retry ${attempt} for ${url} after ${delay}ms`);
                    await Utils.sleep(delay);
                }
            }
        }

        throw lastError;
    }

    async fetchMultipleBlocklists(sources, maxConcurrency = 2)
    {
        const results = [];
        const chunks = Utils.chunkArray(sources.filter(s => s.enabled), maxConcurrency);

        for (const chunk of chunks)
        {
            const chunkResults = await Promise.all(
                chunk.map(async source =>
                {
                    try
                    {
                        this.logger.debug(`Fetching blocklist: ${source.name}`);
                        const content = await this.fetchBlocklist(source.url);
                        const domains = Utils.parseHostsFile(content);

                        if (domains.length === 0)
                        {
                            throw new Error('No valid domains found in hosts file');
                        }

                        return {
                            id: source.id,
                            success: true,
                            domainCount: domains.length,
                            lastUpdated: new Date().toISOString(),
                            domains: domains
                        };
                    } catch (error)
                    {
                        this.logger.error(`Failed to update ${source.name}:`, error);
                        return {
                            id: source.id,
                            success: false,
                            error: error.message,
                            lastUpdated: new Date().toISOString(),
                            domains: []
                        };
                    }
                })
            );

            results.push(...chunkResults);
        }

        return results;
    }

    parseBlocklistContent(content, format = 'hosts')
    {
        switch (format)
        {
            case 'hosts':
                return Utils.parseHostsFile(content);
            case 'domains':
                return this.parseDomainList(content);
            case 'adblock':
                return this.parseAdblockList(content);
            default:
                throw new Error(`Unsupported blocklist format: ${format}`);
        }
    }

    parseDomainList(content)
    {
        const domains = new Set();
        const lines = content.split('\n');

        for (const line of lines)
        {
            const trimmed = line.trim().toLowerCase();

            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//'))
            {
                continue;
            }

            if (Utils.isValidDomain(trimmed))
            {
                domains.add(trimmed);
            }
        }

        return Array.from(domains);
    }

    parseAdblockList(content)
    {
        const domains = new Set();
        const lines = content.split('\n');

        for (const line of lines)
        {
            const trimmed = line.trim();

            if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('['))
            {
                continue;
            }

            // Extract domain from adblock rules (simplified)
            const domainMatch = trimmed.match(/\|\|([^\/\^]+)/);
            if (domainMatch && Utils.isValidDomain(domainMatch[1]))
            {
                domains.add(domainMatch[1].toLowerCase());
            }
        }

        return Array.from(domains);
    }

    async getBlocklistStats()
    {
        const stats = {
            totalCached: this.cache.size,
            cacheSize: 0,
            oldestCache: null,
            newestCache: null
        };

        for (const [url, cached] of this.cache.entries())
        {
            stats.cacheSize += cached.data.length;

            const cacheTime = new Date(cached.timestamp);
            if (!stats.oldestCache || cacheTime < stats.oldestCache)
            {
                stats.oldestCache = cacheTime;
            }
            if (!stats.newestCache || cacheTime > stats.newestCache)
            {
                stats.newestCache = cacheTime;
            }
        }

        return stats;
    }

    clearCache()
    {
        this.cache.clear();
        this.retryAttempts.clear();
        this.logger.info('Blocklist cache cleared');
    }

    getCacheSize()
    {
        return this.cache.size;
    }

    isUrlCached(url)
    {
        const cached = this.cache.get(url);
        if (!cached) return false;
        return (Date.now() - cached.timestamp) < this.cacheExpiry;
    }

    // Cleanup method
    destroy()
    {
        this.clearCache();
        this.logger.info('BlocklistManager destroyed');
    }
}

// Export singleton instance
export const blocklistManager = new BlocklistManager();