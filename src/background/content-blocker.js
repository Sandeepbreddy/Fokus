// src/background/content-blocker.js - Main content blocking logic
import { Logger } from '../shared/logger.js';
import { Utils } from '../shared/utils.js';
import { STORAGE_KEYS, DEFAULT_KEYWORDS, TIMEOUTS } from '../shared/constants.js';
import { storageManager } from './storage-manager.js';
import { blocklistManager } from '../services/blocklist-manager.js';
import { errorHandler } from '../shared/error-handler.js';

class DomainTrie
{
    constructor()
    {
        this.root = {};
        this.size = 0;
    }

    add(domain)
    {
        const parts = domain.split('.').reverse();
        let node = this.root;

        for (const part of parts)
        {
            if (!node[part])
            {
                node[part] = {};
            }
            node = node[part];
        }

        node.isEnd = true;
        this.size++;
    }

    check(domain)
    {
        const parts = domain.split('.').reverse();
        let node = this.root;

        for (let i = 0; i < parts.length; i++)
        {
            const part = parts[i];

            if (node[part])
            {
                node = node[part];
                if (node.isEnd)
                {
                    return true;
                }
            } else if (node['*'])
            {
                return true;
            } else
            {
                return false;
            }
        }
        return false;
    }

    clear()
    {
        this.root = {};
        this.size = 0;
    }

    getSize()
    {
        return this.size;
    }
}

export class ContentBlocker
{
    constructor()
    {
        this.logger = new Logger('ContentBlocker');
        this.domainTrie = new DomainTrie();
        this.customDomainTrie = new DomainTrie();
        this.blockedKeywords = new Set();
        this.isActive = true;
        this.lastGithubUpdate = 0;
        this.githubUpdateInterval = 24 * 60 * 60 * 1000; // 24 hours

        this.tabCache = new Map();
        this.pendingChecks = new Map();

        this.init();
    }

    async init()
    {
        try
        {
            this.logger.info('Initializing ContentBlocker...');

            await this.loadSettings();
            this.setupEventHandlers();
            this.setupBlocking();
            this.setupTabCleanup();

            this.logger.info('ContentBlocker initialized successfully');
        } catch (error)
        {
            errorHandler.handleError(error, 'content-blocker-init');
        }
    }

    setupEventHandlers()
    {
        // Extension lifecycle events
        if (chrome.runtime.onInstalled)
        {
            chrome.runtime.onInstalled.addListener(async (details) =>
            {
                this.logger.info('Extension event:', details.reason);
                if (details.reason === 'install')
                {
                    await this.setupDefaults();
                }
            });
        }

        if (chrome.runtime.onStartup)
        {
            chrome.runtime.onStartup.addListener(() =>
            {
                this.logger.info('Browser startup - clearing cache');
                this.tabCache.clear();
                blocklistManager.clearCache();
            });
        }
    }

    async setupDefaults()
    {
        try
        {
            await storageManager.set({
                [STORAGE_KEYS.PIN]: '1234',
                [STORAGE_KEYS.BLOCKED_KEYWORDS]: DEFAULT_KEYWORDS,
                [STORAGE_KEYS.CUSTOM_DOMAINS]: [],
                [STORAGE_KEYS.IS_ACTIVE]: true,
                [STORAGE_KEYS.BLOCKS_TODAY]: 0,
                [STORAGE_KEYS.FOCUS_STREAK]: 0,
                [STORAGE_KEYS.TOTAL_BLOCKS]: 0,
                installDate: new Date().toISOString()
            });

            await storageManager.flush();
            this.logger.info('Default settings initialized');
        } catch (error)
        {
            errorHandler.handleError(error, 'setup-defaults');
        }
    }

    setupBlocking()
    {
        // Tab update events
        if (chrome.tabs && chrome.tabs.onUpdated)
        {
            chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) =>
            {
                if (changeInfo.status === 'loading' && tab.url)
                {
                    await this.debouncedCheckAndBlockTab(tabId, tab.url);
                }
            });
        }

        if (chrome.tabs && chrome.tabs.onCreated)
        {
            chrome.tabs.onCreated.addListener(async (tab) =>
            {
                if (tab.url)
                {
                    await this.debouncedCheckAndBlockTab(tab.id, tab.url);
                }
            });
        }

        // Navigation events
        if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate)
        {
            chrome.webNavigation.onBeforeNavigate.addListener(async (details) =>
            {
                if (details.frameId === 0)
                {
                    await this.debouncedCheckAndBlockTab(details.tabId, details.url);
                }
            });
        }
    }

    setupTabCleanup()
    {
        // Clean up when tabs are removed
        if (chrome.tabs && chrome.tabs.onRemoved)
        {
            chrome.tabs.onRemoved.addListener((tabId) =>
            {
                this.tabCache.delete(tabId);
                const pendingCheck = this.pendingChecks.get(tabId);
                if (pendingCheck)
                {
                    clearTimeout(pendingCheck);
                    this.pendingChecks.delete(tabId);
                }
            });
        }

        // Periodic cleanup
        setInterval(() =>
        {
            const now = Date.now();

            // Limit cache size
            if (this.tabCache.size > 100)
            {
                const entries = Array.from(this.tabCache.entries());
                this.tabCache = new Map(entries.slice(-50));
            }

            // Remove expired entries
            for (const [key, value] of this.tabCache.entries())
            {
                if (now - value.timestamp > TIMEOUTS.TAB_CACHE_TIMEOUT)
                {
                    this.tabCache.delete(key);
                }
            }
        }, 60000);
    }

    async debouncedCheckAndBlockTab(tabId, url)
    {
        const existingTimeout = this.pendingChecks.get(tabId);
        if (existingTimeout)
        {
            clearTimeout(existingTimeout);
        }

        return new Promise((resolve) =>
        {
            const timeout = setTimeout(async () =>
            {
                this.pendingChecks.delete(tabId);
                await this.checkAndBlockTab(tabId, url);
                resolve();
            }, 100);

            this.pendingChecks.set(tabId, timeout);
        });
    }

    async checkAndBlockTab(tabId, url)
    {
        try
        {
            const urlObj = new URL(url);

            // Skip extension pages
            if (Utils.isExtensionUrl(url)) return;

            const cacheKey = `${tabId}-${url}`;
            const cached = this.tabCache.get(cacheKey);

            if (cached && Date.now() - cached.timestamp < 5000)
            {
                if (cached.blocked && chrome.tabs && chrome.tabs.update)
                {
                    chrome.tabs.update(tabId, { url: cached.redirectUrl });
                }
                return;
            }

            let blocked = false;
            let redirectUrl = null;

            // Check domain blocking
            if (await this.isDomainBlocked(urlObj.hostname))
            {
                redirectUrl = chrome.runtime.getURL('src/ui/blocked/blocked.html') +
                    '?domain=' + encodeURIComponent(urlObj.hostname);
                blocked = true;
            }
            // Check keyword blocking in URL
            else if (await this.containsBlockedKeywords(url))
            {
                redirectUrl = chrome.runtime.getURL('src/ui/blocked/blocked.html') +
                    '?reason=keyword&url=' + encodeURIComponent(url);
                blocked = true;
            }
            // Check Google search queries
            else if (urlObj.hostname.includes('google.com') && urlObj.pathname.includes('/search'))
            {
                const query = urlObj.searchParams.get('q');
                if (query && await this.containsBlockedKeywords(query))
                {
                    redirectUrl = chrome.runtime.getURL('src/ui/blocked/blocked.html') +
                        '?reason=search&query=' + encodeURIComponent(query);
                    blocked = true;
                }
            }

            // Cache result
            this.tabCache.set(cacheKey, {
                blocked,
                redirectUrl,
                timestamp: Date.now()
            });

            if (blocked && chrome.tabs && chrome.tabs.update)
            {
                chrome.tabs.update(tabId, { url: redirectUrl });
                await this.incrementBlockCount();
            }
        } catch (error)
        {
            this.logger.debug('Error checking URL:', error.message);
        }
    }

    async loadSettings()
    {
        try
        {
            const data = await storageManager.get([
                STORAGE_KEYS.CUSTOM_DOMAINS,
                STORAGE_KEYS.BLOCKED_KEYWORDS,
                STORAGE_KEYS.IS_ACTIVE,
                STORAGE_KEYS.PIN,
                STORAGE_KEYS.BLOCKED_DOMAINS,
                STORAGE_KEYS.LAST_GITHUB_UPDATE
            ]);

            // Clear and rebuild tries
            this.domainTrie.clear();
            this.customDomainTrie.clear();

            if (data[STORAGE_KEYS.BLOCKED_DOMAINS])
            {
                for (const domain of data[STORAGE_KEYS.BLOCKED_DOMAINS])
                {
                    this.domainTrie.add(domain);
                }
            }

            if (data[STORAGE_KEYS.CUSTOM_DOMAINS])
            {
                for (const domain of data[STORAGE_KEYS.CUSTOM_DOMAINS])
                {
                    this.customDomainTrie.add(domain);
                }
            }

            this.blockedKeywords = new Set(data[STORAGE_KEYS.BLOCKED_KEYWORDS] || DEFAULT_KEYWORDS);
            this.isActive = data[STORAGE_KEYS.IS_ACTIVE] !== undefined ? data[STORAGE_KEYS.IS_ACTIVE] : true;
            this.lastGithubUpdate = data[STORAGE_KEYS.LAST_GITHUB_UPDATE] || 0;

            if (!data[STORAGE_KEYS.PIN])
            {
                await storageManager.set({ [STORAGE_KEYS.PIN]: '1234' });
            }

            this.logger.info(`Loaded ${this.domainTrie.getSize()} blocked domains and ${this.customDomainTrie.getSize()} custom domains`);
        } catch (error)
        {
            errorHandler.handleError(error, 'load-settings');
        }
    }

    async isDomainBlocked(hostname)
    {
        if (!this.isActive) return false;
        return this.domainTrie.check(hostname) || this.customDomainTrie.check(hostname);
    }

    async containsBlockedKeywords(text)
    {
        if (!this.isActive || !text) return false;

        const lowerText = text.toLowerCase();
        for (const keyword of this.blockedKeywords)
        {
            if (lowerText.includes(keyword.toLowerCase()))
            {
                this.logger.debug(`Blocked keyword detected: "${keyword}"`);
                return true;
            }
        }
        return false;
    }

    async incrementBlockCount()
    {
        try
        {
            const data = await storageManager.get([
                STORAGE_KEYS.BLOCKS_TODAY,
                STORAGE_KEYS.TOTAL_BLOCKS,
                STORAGE_KEYS.LAST_BLOCK_DATE
            ]);

            const today = new Date().toDateString();
            let blocksToday = data[STORAGE_KEYS.BLOCKS_TODAY] || 0;
            let totalBlocks = data[STORAGE_KEYS.TOTAL_BLOCKS] || 0;

            if (data[STORAGE_KEYS.LAST_BLOCK_DATE] !== today)
            {
                blocksToday = 1;
            } else
            {
                blocksToday++;
            }
            totalBlocks++;

            await storageManager.set({
                [STORAGE_KEYS.BLOCKS_TODAY]: blocksToday,
                [STORAGE_KEYS.TOTAL_BLOCKS]: totalBlocks,
                [STORAGE_KEYS.LAST_BLOCK_DATE]: today
            });
        } catch (error)
        {
            errorHandler.handleError(error, 'increment-block-count');
        }
    }

    async addCustomDomain(domain)
    {
        try
        {
            const data = await storageManager.get([STORAGE_KEYS.CUSTOM_DOMAINS]);
            const domains = new Set(data[STORAGE_KEYS.CUSTOM_DOMAINS] || []);

            if (domains.has(domain))
            {
                return { success: false, error: 'Domain already blocked' };
            }

            domains.add(domain);
            this.customDomainTrie.add(domain);

            await storageManager.set({ [STORAGE_KEYS.CUSTOM_DOMAINS]: Array.from(domains) });
            await storageManager.flush();

            return { success: true };
        } catch (error)
        {
            errorHandler.handleError(error, 'add-custom-domain');
            return { success: false, error: error.message };
        }
    }

    async removeCustomDomain(domain)
    {
        try
        {
            const data = await storageManager.get([STORAGE_KEYS.CUSTOM_DOMAINS]);
            const domains = new Set(data[STORAGE_KEYS.CUSTOM_DOMAINS] || []);
            domains.delete(domain);

            // Rebuild Trie
            this.customDomainTrie.clear();
            for (const d of domains)
            {
                this.customDomainTrie.add(d);
            }

            await storageManager.set({ [STORAGE_KEYS.CUSTOM_DOMAINS]: Array.from(domains) });
            await storageManager.flush();

            return { success: true };
        } catch (error)
        {
            errorHandler.handleError(error, 'remove-custom-domain');
            return { success: false, error: error.message };
        }
    }

    async setActive(active)
    {
        try
        {
            await storageManager.set({ [STORAGE_KEYS.IS_ACTIVE]: active });
            await storageManager.flush();
            this.isActive = active;

            // Clear cache when toggling protection
            this.tabCache.clear();

            return { success: true };
        } catch (error)
        {
            errorHandler.handleError(error, 'set-active');
            return { success: false, error: error.message };
        }
    }

    async getCurrentTab()
    {
        try
        {
            if (chrome.tabs && chrome.tabs.query)
            {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                return { url: tab?.url || null };
            }
            return { url: null };
        } catch (error)
        {
            return { url: null };
        }
    }

    async addDomainFromTab()
    {
        try
        {
            const tabInfo = await this.getCurrentTab();
            if (!tabInfo.url)
            {
                return { success: false, error: 'No active tab' };
            }

            const url = new URL(tabInfo.url);
            const result = await this.addCustomDomain(url.hostname);
            if (result.success)
            {
                result.domain = url.hostname;
            }
            return result;
        } catch (error)
        {
            errorHandler.handleError(error, 'add-domain-from-tab');
            return { success: false, error: error.message };
        }
    }

    // Cleanup method
    destroy()
    {
        // Clear all timers
        for (const timer of this.pendingChecks.values())
        {
            clearTimeout(timer);
        }
        this.pendingChecks.clear();

        // Clear caches
        this.tabCache.clear();
        this.domainTrie.clear();
        this.customDomainTrie.clear();
        this.blockedKeywords.clear();

        this.logger.info('ContentBlocker destroyed');
    }
}