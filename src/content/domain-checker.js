// src/content/domain-checker.js - Domain blocking logic
import { Logger } from '../shared/logger.js';
import { WHITELIST_DOMAINS } from '../shared/constants.js';

export class DomainChecker
{
    constructor()
    {
        this.logger = new Logger('DomainChecker');
        this.blockedDomains = new Set();
        this.customDomains = new Set();
        this.domainCache = new Map();
        this.cacheExpiry = 300000; // 5 minutes
    }

    async loadDomains()
    {
        try
        {
            const data = await chrome.storage.local.get(['blockedDomains', 'customDomains']);

            this.blockedDomains = new Set(data.blockedDomains || []);
            this.customDomains = new Set(data.customDomains || []);

            this.logger.debug(`Loaded ${this.blockedDomains.size} blocked domains and ${this.customDomains.size} custom domains`);
        } catch (error)
        {
            this.logger.error('Failed to load domains:', error);
        }
    }

    isDomainBlocked(hostname)
    {
        // Check cache first
        const cacheKey = hostname;
        const cached = this.domainCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheExpiry)
        {
            return cached.blocked;
        }

        // Check if domain is whitelisted
        if (this.isWhitelisted(hostname))
        {
            this.cacheResult(cacheKey, false);
            return false;
        }

        // Check blocking rules
        const blocked = this.checkBlockingRules(hostname);
        this.cacheResult(cacheKey, blocked);

        return blocked;
    }

    isWhitelisted(hostname)
    {
        return WHITELIST_DOMAINS.some(domain => hostname.includes(domain));
    }

    checkBlockingRules(hostname)
    {
        // Direct match
        if (this.customDomains.has(hostname) || this.blockedDomains.has(hostname))
        {
            return true;
        }

        // Check parent domains (subdomain blocking)
        const hostParts = hostname.split('.');
        for (let i = 1; i < hostParts.length; i++)
        {
            const parentDomain = hostParts.slice(i).join('.');
            if (this.customDomains.has(parentDomain) || this.blockedDomains.has(parentDomain))
            {
                return true;
            }
        }

        // Check wildcard patterns
        return this.checkWildcardPatterns(hostname);
    }

    checkWildcardPatterns(hostname)
    {
        // Check for wildcard patterns in blocked domains
        for (const domain of this.blockedDomains)
        {
            if (domain.includes('*'))
            {
                if (this.matchesWildcard(hostname, domain))
                {
                    return true;
                }
            }
        }

        for (const domain of this.customDomains)
        {
            if (domain.includes('*'))
            {
                if (this.matchesWildcard(hostname, domain))
                {
                    return true;
                }
            }
        }

        return false;
    }

    matchesWildcard(hostname, pattern)
    {
        // Convert wildcard pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*');

        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(hostname);
    }

    cacheResult(hostname, blocked)
    {
        this.domainCache.set(hostname, {
            blocked,
            timestamp: Date.now()
        });

        // Cleanup old cache entries
        if (this.domainCache.size > 1000)
        {
            const entries = Array.from(this.domainCache.entries());
            const validEntries = entries.filter(([, value]) =>
                Date.now() - value.timestamp < this.cacheExpiry
            );
            this.domainCache = new Map(validEntries.slice(-500));
        }
    }

    extractDomain(url)
    {
        try
        {
            const urlObj = new URL(url);
            return urlObj.hostname.toLowerCase();
        } catch (error)
        {
            // Fallback parsing
            const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\?#]+)/i);
            return match ? match[1].toLowerCase() : '';
        }
    }

    isValidDomain(domain)
    {
        const domainRegex = /^(?!-)(?:[a-zA-Z0-9-]{1,63}(?<!-)\.)*[a-zA-Z]{2,}$/;
        return domainRegex.test(domain) && domain.length <= 253;
    }

    addCustomDomain(domain)
    {
        if (this.isValidDomain(domain))
        {
            this.customDomains.add(domain.toLowerCase());
            this.domainCache.clear(); // Clear cache when rules change
            return true;
        }
        return false;
    }

    removeCustomDomain(domain)
    {
        const removed = this.customDomains.delete(domain.toLowerCase());
        if (removed)
        {
            this.domainCache.clear();
        }
        return removed;
    }

    getBlockedDomainsCount()
    {
        return this.blockedDomains.size + this.customDomains.size;
    }

    clearCache()
    {
        this.domainCache.clear();
        this.logger.debug('Domain cache cleared');
    }

    destroy()
    {
        this.domainCache.clear();
        this.blockedDomains.clear();
        this.customDomains.clear();
        this.logger.info('DomainChecker destroyed');
    }
}

export default DomainChecker;