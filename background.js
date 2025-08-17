console.log('Fokus Extension - Background Script Starting...');

// Polyfills for older browsers
if (!globalThis.AbortSignal?.timeout)
{
    AbortSignal.timeout = function (delay)
    {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), delay);
        return controller.signal;
    };
}

// Global error tracking
window.addEventListener('error', (event) =>
{
    console.error('Global error:', event.error);
    chrome.storage.local.get(['errorLog'], (data) =>
    {
        const errors = data.errorLog || [];
        errors.push({
            message: event.error.message,
            stack: event.error.stack,
            timestamp: new Date().toISOString(),
            context: 'background'
        });
        chrome.storage.local.set({
            errorLog: errors.slice(-50) // Keep only last 50 errors
        });
    });
});

// Batch Storage Manager
class BatchStorage
{
    constructor()
    {
        this.pendingWrites = new Map();
        this.writeTimer = null;
        this.writeInterval = 500; // Batch writes every 500ms
    }

    async set(data)
    {
        Object.entries(data).forEach(([key, value]) =>
        {
            this.pendingWrites.set(key, value);
        });
        this.scheduleWrite();
    }

    scheduleWrite()
    {
        if (this.writeTimer) return;

        this.writeTimer = setTimeout(async () =>
        {
            if (this.pendingWrites.size > 0)
            {
                const data = Object.fromEntries(this.pendingWrites);
                await chrome.storage.local.set(data);
                this.pendingWrites.clear();
            }
            this.writeTimer = null;
        }, this.writeInterval);
    }

    async get(keys)
    {
        // Flush pending writes first
        if (this.pendingWrites.size > 0)
        {
            await this.flush();
        }
        return chrome.storage.local.get(keys);
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
            await chrome.storage.local.set(data);
            this.pendingWrites.clear();
        }
    }
}

// efficient domain matching
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
                    return true; // Found exact match or parent domain
                }
            } else if (node['*'])
            {
                return true; // Wildcard match
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

// Blocklist Manager with caching and retry logic
class BlocklistManager
{
    constructor()
    {
        this.cache = new Map();
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.cacheExpiry = 3600000; // 1 hour
    }

    async fetchBlocklist(url)
    {
        // Check cache first
        const cached = this.cache.get(url);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry)
        {
            console.log(`Using cached blocklist for ${url}`);
            return cached.data;
        }

        try
        {
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

            console.log(`Fetched and cached blocklist from ${url}`);
            return data;
        } catch (error)
        {
            // Return cached data even if expired on error
            if (cached)
            {
                console.log('Using stale cache due to fetch error:', error.message);
                return cached.data;
            }
            throw error;
        }
    }

    async fetchWithRetry(url, maxRetries = this.maxRetries)
    {
        let lastError;

        for (let i = 0; i < maxRetries; i++)
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
                    signal: AbortSignal.timeout(10000) // 10 second timeout
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
                if (i < maxRetries - 1)
                {
                    const delay = Math.pow(2, i) * 1000;
                    console.log(`Retry ${i + 1} for ${url} after ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    clearCache()
    {
        this.cache.clear();
    }

    getCacheSize()
    {
        return this.cache.size;
    }
}

class ContentBlocker
{
    constructor()
    {
        this.domainTrie = new DomainTrie();
        this.customDomainTrie = new DomainTrie();
        this.blockedKeywords = new Set();
        this.isActive = true;
        this.lastGithubUpdate = 0;
        this.githubUpdateInterval = 24 * 60 * 60 * 1000;

        this.tabCache = new Map();
        this.pendingChecks = new Map();
        this.batchStorage = new BatchStorage();
        this.blocklistManager = new BlocklistManager();
        this.init();
    }

    async init()
    {
        try
        {
            await this.loadSettings();
            this.setupEventHandlers();
            this.setupBlocking();
            this.setupTabCleanup();
            console.log('Content Blocker initialized with optimizations');
        } catch (error)
        {
            console.error('Content Blocker initialization failed:', error);
        }
    }

    setupTabCleanup()
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

        setInterval(() =>
        {
            const now = Date.now();

            if (this.tabCache.size > 100)
            {
                const entries = Array.from(this.tabCache.entries());
                this.tabCache = new Map(entries.slice(-50));
            }

            for (const [key, value] of this.tabCache.entries())
            {
                if (now - value.timestamp > 30000)
                {
                    this.tabCache.delete(key);
                }
            }
        }, 60000);
    }

    setupEventHandlers()
    {
        chrome.runtime.onInstalled.addListener(async (details) =>
        {
            console.log('Extension event:', details.reason);
            if (details.reason === 'install')
            {
                console.log('First time install - setting up defaults');
                await this.setupDefaults();
            }
        });

        chrome.runtime.onStartup.addListener(() =>
        {
            console.log('Browser startup - clearing cache');
            this.tabCache.clear();
            this.blocklistManager.clearCache();
        });
    }

    async setupDefaults()
    {
        const defaultKeywords = [
            'adult', 'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw',
            'explicit', 'mature', 'erotic', 'lesbian', 'gay', 'anal',
            'oral', 'bdsm', 'fetish', 'webcam', 'escort', 'uncensored', 'decensored'
        ];

        await this.batchStorage.set({
            pin: '1234',
            blockedKeywords: defaultKeywords,
            customDomains: [],
            isActive: true,
            blocksToday: 0,
            focusStreak: 0,
            totalBlocks: 0,
            installDate: new Date().toISOString()
        });

        await this.batchStorage.flush();
    }

    setupBlocking()
    {
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) =>
        {
            if (changeInfo.status === 'loading' && tab.url)
            {
                await this.debouncedCheckAndBlockTab(tabId, tab.url);
            }
        });

        chrome.tabs.onCreated.addListener(async (tab) =>
        {
            if (tab.url)
            {
                await this.debouncedCheckAndBlockTab(tab.id, tab.url);
            }
        });

        chrome.webNavigation.onBeforeNavigate.addListener(async (details) =>
        {
            if (details.frameId === 0)
            {
                await this.debouncedCheckAndBlockTab(details.tabId, details.url);
            }
        });
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
            }, 100); // 100ms debounce

            this.pendingChecks.set(tabId, timeout);
        });
    }

    async checkAndBlockTab(tabId, url)
    {
        try
        {
            const urlObj = new URL(url);
            if (urlObj.protocol === 'chrome-extension:' ||
                urlObj.protocol === 'moz-extension:') return;


            const cacheKey = `${tabId}-${url}`;
            const cached = this.tabCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < 5000)
            {
                if (cached.blocked)
                {
                    chrome.tabs.update(tabId, { url: cached.redirectUrl });
                }
                return;
            }

            let blocked = false;
            let redirectUrl = null;

            if (await this.isDomainBlocked(urlObj.hostname))
            {
                redirectUrl = chrome.runtime.getURL('blocked.html') +
                    '?domain=' + encodeURIComponent(urlObj.hostname);
                blocked = true;
            } else if (urlObj.hostname.includes('google.com') &&
                urlObj.pathname.includes('/search'))
            {
                const query = urlObj.searchParams.get('q');
                if (query && await this.containsBlockedKeywords(query))
                {
                    redirectUrl = chrome.runtime.getURL('blocked.html') +
                        '?reason=search&query=' + encodeURIComponent(query);
                    blocked = true;
                }
            }

            this.tabCache.set(cacheKey, {
                blocked,
                redirectUrl,
                timestamp: Date.now()
            });

            if (blocked)
            {
                chrome.tabs.update(tabId, { url: redirectUrl });
                this.incrementBlockCount();
            }
        } catch (error)
        {
            console.log('Error checking URL:', error);
        }
    }

    async loadSettings()
    {
        try
        {
            const data = await this.batchStorage.get([
                'customDomains', 'blockedKeywords', 'isActive', 'pin',
                'blockedDomains', 'lastGithubUpdate'
            ]);

            this.domainTrie.clear();
            this.customDomainTrie.clear();

            if (data.blockedDomains)
            {
                for (const domain of data.blockedDomains)
                {
                    this.domainTrie.add(domain);
                }
            }

            if (data.customDomains)
            {
                for (const domain of data.customDomains)
                {
                    this.customDomainTrie.add(domain);
                }
            }

            this.blockedKeywords = new Set(data.blockedKeywords || this.getDefaultKeywords());
            this.isActive = data.isActive !== undefined ? data.isActive : true;
            this.lastGithubUpdate = data.lastGithubUpdate || 0;

            if (!data.pin)
            {
                await this.batchStorage.set({ pin: '1234' });
            }

            console.log(`Loaded ${this.domainTrie.getSize()} blocked domains and ${this.customDomainTrie.getSize()} custom domains`);
        } catch (error)
        {
            console.error('Failed to load settings:', error);
        }
    }

    getDefaultKeywords()
    {
        return [
            'adult', 'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw',
            'explicit', 'mature', 'erotic', 'lesbian', 'gay', 'anal',
            'oral', 'bdsm', 'fetish', 'webcam', 'escort', 'dating'
        ];
    }

    async isDomainBlocked(hostname)
    {
        if (!this.isActive) return false;

        // Check both Trie structures
        return this.domainTrie.check(hostname) || this.customDomainTrie.check(hostname);
    }

    async containsBlockedKeywords(text)
    {
        if (!this.isActive) return false;
        const lowerText = text.toLowerCase();
        for (const keyword of this.blockedKeywords)
        {
            const lowerKeyword = keyword.toLowerCase();
            if (lowerText.includes(lowerKeyword))
            {
                console.log(`Blocked keyword detected: "${lowerKeyword}"`);
                return true;
            }
        }
        return false;
    }

    async incrementBlockCount()
    {
        try
        {
            const data = await this.batchStorage.get(['blocksToday', 'totalBlocks', 'lastBlockDate']);
            const today = new Date().toDateString();
            let blocksToday = data.blocksToday || 0;
            let totalBlocks = data.totalBlocks || 0;

            if (data.lastBlockDate !== today)
            {
                blocksToday = 1;
            } else
            {
                blocksToday++;
            }
            totalBlocks++;

            await this.batchStorage.set({
                blocksToday,
                totalBlocks,
                lastBlockDate: today
            });
        } catch (error)
        {
            console.error('Failed to increment block count:', error);
        }
    }

    async addCustomDomain(domain)
    {
        try
        {
            const data = await this.batchStorage.get(['customDomains']);
            const domains = new Set(data.customDomains || []);
            if (domains.has(domain))
            {
                return { success: false, error: 'Domain already blocked' };
            }
            domains.add(domain);
            this.customDomainTrie.add(domain);

            await this.batchStorage.set({ customDomains: Array.from(domains) });
            await this.batchStorage.flush();

            return { success: true };
        } catch (error)
        {
            return { success: false, error: error.message };
        }
    }

    async removeCustomDomain(domain)
    {
        try
        {
            const data = await this.batchStorage.get(['customDomains']);
            const domains = new Set(data.customDomains || []);
            domains.delete(domain);

            // Rebuild Trie
            this.customDomainTrie.clear();
            for (const d of domains)
            {
                this.customDomainTrie.add(d);
            }

            await this.batchStorage.set({ customDomains: Array.from(domains) });
            await this.batchStorage.flush();

            return { success: true };
        } catch (error)
        {
            return { success: false, error: error.message };
        }
    }

    async addKeyword(keyword)
    {
        try
        {
            const data = await this.batchStorage.get(['blockedKeywords']);
            const keywords = new Set(data.blockedKeywords || []);
            const lowerKeyword = keyword.toLowerCase();
            if (keywords.has(lowerKeyword))
            {
                return { success: false, error: 'Keyword already blocked' };
            }
            keywords.add(lowerKeyword);
            this.blockedKeywords = keywords;

            await this.batchStorage.set({ blockedKeywords: Array.from(keywords) });
            await this.batchStorage.flush();

            return { success: true };
        } catch (error)
        {
            return { success: false, error: error.message };
        }
    }

    async removeKeyword(keyword)
    {
        try
        {
            const data = await this.batchStorage.get(['blockedKeywords']);
            const keywords = new Set(data.blockedKeywords || []);
            keywords.delete(keyword.toLowerCase());
            this.blockedKeywords = keywords;

            await this.batchStorage.set({ blockedKeywords: Array.from(keywords) });
            await this.batchStorage.flush();

            return { success: true };
        } catch (error)
        {
            return { success: false, error: error.message };
        }
    }

    async setActive(active)
    {
        try
        {
            await this.batchStorage.set({ isActive: active });
            await this.batchStorage.flush();
            this.isActive = active;

            // Clear cache when toggling protection
            this.tabCache.clear();

            return { success: true };
        } catch (error)
        {
            return { success: false, error: error.message };
        }
    }

    async getCurrentTab()
    {
        try
        {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return { url: tab.url };
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
            return { success: false, error: error.message };
        }
    }

    async fetchBlocklist(url)
    {
        try
        {
            console.log('Fetching blocklist:', url);
            const content = await this.blocklistManager.fetchBlocklist(url);

            console.log(`Fetched ${content.length} bytes from ${url}`);
            return {
                success: true,
                content: content,
                size: content.length,
                url: url
            };
        } catch (error)
        {
            console.error('Failed to fetch blocklist:', error);
            return {
                success: false,
                error: error.message,
                url: url
            };
        }
    }
}

// Initialize globals
let supabaseClient = null;
let contentBlocker = null;

async function loadSupabaseClient()
{
    try
    {
        const supabaseModule = await import(chrome.runtime.getURL('supabase-client.js'));
        return supabaseModule.SupabaseClient || window.SupabaseClient;
    } catch (error)
    {
        console.log('Supabase client not available:', error);
        return null;
    }
}

async function initializeSupabase()
{
    try
    {
        const SupabaseClientClass = await loadSupabaseClient();
        if (SupabaseClientClass)
        {
            supabaseClient = new SupabaseClientClass();
            const initialized = await supabaseClient.init();
            if (initialized)
            {
                console.log('Supabase client initialized');
                if (supabaseClient.isAuthenticated())
                {
                    await supabaseClient.setupAutoSync();
                }
            } else
            {
                supabaseClient = null;
            }
        } else
        {
            console.log('Supabase client not available, running in local mode');
        }
    } catch (error)
    {
        console.error('Failed to initialize Supabase:', error);
        supabaseClient = null;
    }
}

// Auth Functions with optimizations
async function getAuthStatus()
{
    try
    {
        if (supabaseClient && supabaseClient.isAuthenticated())
        {
            return {
                isAuthenticated: true,
                user: supabaseClient.getCurrentUser()
            };
        }

        const offlineData = await chrome.storage.local.get(['offlineMode', 'offlineExpiry']);
        if (offlineData.offlineMode && offlineData.offlineExpiry > Date.now())
        {
            return {
                isAuthenticated: true,
                isOfflineMode: true,
                user: { email: 'offline@mode.local' }
            };
        }

        return {
            isAuthenticated: false,
            cloudAvailable: !!supabaseClient
        };
    } catch (error)
    {
        console.error('Failed to get auth status:', error);
        return {
            isAuthenticated: false,
            cloudAvailable: false,
            error: error.message
        };
    }
}

async function signIn(email, password)
{
    try
    {
        if (!supabaseClient)
        {
            console.log('No Supabase client available, enabling offline mode');
            const duration = 24 * 60 * 60 * 1000;
            const expiry = Date.now() + duration;
            await chrome.storage.local.set({
                offlineMode: true,
                offlineExpiry: expiry,
                offlineEmail: email
            });
            return {
                success: true,
                user: { email: email },
                isOfflineMode: true,
                message: 'Working in offline mode - your settings are saved locally'
            };
        }

        const result = await supabaseClient.signIn(email, password);
        if (result.success)
        {
            try
            {
                await supabaseClient.syncFromCloud();
            } catch (syncError)
            {
                console.warn('Failed to sync after sign in:', syncError);
            }
        }
        return result;
    } catch (error)
    {
        console.error('Sign in failed:', error);
        if (error.message.includes('Cloud features not available') || error.message.includes('fetch'))
        {
            console.log('Cloud unavailable, falling back to offline mode');
            const duration = 24 * 60 * 60 * 1000;
            const expiry = Date.now() + duration;
            await chrome.storage.local.set({
                offlineMode: true,
                offlineExpiry: expiry,
                offlineEmail: email
            });
            return {
                success: true,
                user: { email: email },
                isOfflineMode: true,
                message: 'Cloud sync unavailable - working in offline mode'
            };
        }
        throw error;
    }
}

async function signUp(email, password)
{
    try
    {
        if (!supabaseClient)
        {
            const duration = 24 * 60 * 60 * 1000;
            const expiry = Date.now() + duration;
            await chrome.storage.local.set({
                offlineMode: true,
                offlineExpiry: expiry,
                offlineEmail: email,
                accountCreated: new Date().toISOString()
            });
            return {
                success: true,
                user: { email: email },
                isOfflineMode: true,
                message: 'Account created locally - cloud sync will be available when connection is restored'
            };
        }
        return await supabaseClient.signUp(email, password);
    } catch (error)
    {
        console.error('Sign up failed:', error);
        if (error.message.includes('Cloud features not available') || error.message.includes('fetch'))
        {
            const duration = 24 * 60 * 60 * 1000;
            const expiry = Date.now() + duration;
            await chrome.storage.local.set({
                offlineMode: true,
                offlineExpiry: expiry,
                offlineEmail: email,
                accountCreated: new Date().toISOString()
            });
            return {
                success: true,
                user: { email: email },
                isOfflineMode: true,
                message: 'Account created locally - cloud features will be available when connection is restored'
            };
        }
        throw error;
    }
}

async function signOut()
{
    try
    {
        if (supabaseClient)
        {
            await supabaseClient.signOut();
        }
        await chrome.storage.local.remove(['offlineMode', 'offlineExpiry', 'offlineEmail', 'accountCreated']);

        // Clear caches
        if (contentBlocker)
        {
            contentBlocker.tabCache.clear();
            contentBlocker.blocklistManager.clearCache();
        }

        return { success: true };
    } catch (error)
    {
        console.error('Sign out failed:', error);
        await chrome.storage.local.remove(['offlineMode', 'offlineExpiry', 'offlineEmail', 'accountCreated']);
        return { success: true };
    }
}

async function syncToCloud()
{
    try
    {
        if (!supabaseClient || !supabaseClient.isAuthenticated())
        {
            throw new Error('Cloud sync not available - sign in required');
        }
        return await supabaseClient.syncToCloud();
    } catch (error)
    {
        console.error('Sync to cloud failed:', error);
        throw error;
    }
}

async function syncFromCloud()
{
    try
    {
        if (!supabaseClient || !supabaseClient.isAuthenticated())
        {
            throw new Error('Cloud sync not available - sign in required');
        }
        const result = await supabaseClient.syncFromCloud();

        // Reload settings after sync
        if (contentBlocker)
        {
            await contentBlocker.loadSettings();
        }

        return result;
    } catch (error)
    {
        console.error('Sync from cloud failed:', error);
        throw error;
    }
}

async function initialize()
{
    const startTime = performance.now();

    try
    {
        const [supabaseResult] = await Promise.all([
            initializeSupabase(),
            new Promise(resolve =>
            {
                contentBlocker = new ContentBlocker();
                console.log('Content Blocker created successfully');
                resolve();
            })
        ]);

        const initTime = performance.now() - startTime;
        console.log(`Initialization completed in ${initTime.toFixed(2)}ms`);
    } catch (error)
    {
        console.error('Failed to initialize:', error);

        // Fallback content blocker
        contentBlocker = {
            addCustomDomain: async () => ({ success: false, error: 'Service unavailable' }),
            removeCustomDomain: async () => ({ success: false, error: 'Service unavailable' }),
            addKeyword: async () => ({ success: false, error: 'Service unavailable' }),
            removeKeyword: async () => ({ success: false, error: 'Service unavailable' }),
            setActive: async () => ({ success: false, error: 'Service unavailable' }),
            getCurrentTab: async () => ({ url: null }),
            addDomainFromTab: async () => ({ success: false, error: 'Service unavailable' }),
            fetchBlocklist: async () => ({ success: false, error: 'Service unavailable' })
        };
    }
}

// Message Handler with performance tracking
chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
{
    const startTime = performance.now();
    console.log('Message received:', message.action);

    (async () =>
    {
        try
        {
            let result;
            switch (message.action)
            {
                case 'getAuthStatus':
                    result = await getAuthStatus();
                    break;
                case 'signIn':
                    result = await signIn(message.email, message.password);
                    break;
                case 'signUp':
                    result = await signUp(message.email, message.password);
                    break;
                case 'signOut':
                    result = await signOut();
                    break;
                case 'syncToCloud':
                    result = await syncToCloud();
                    break;
                case 'syncFromCloud':
                    result = await syncFromCloud();
                    break;
                case 'fetchBlocklist':
                    result = await contentBlocker.fetchBlocklist(message.url);
                    break;
                case 'addCustomDomain':
                    result = await contentBlocker.addCustomDomain(message.domain);
                    break;
                case 'removeCustomDomain':
                    result = await contentBlocker.removeCustomDomain(message.domain);
                    break;
                case 'addDomainFromTab':
                    result = await contentBlocker.addDomainFromTab();
                    break;
                case 'addKeyword':
                    result = await contentBlocker.addKeyword(message.keyword);
                    break;
                case 'removeKeyword':
                    result = await contentBlocker.removeKeyword(message.keyword);
                    break;
                case 'setActive':
                    result = await contentBlocker.setActive(message.active);
                    break;
                case 'getCurrentTab':
                    result = await contentBlocker.getCurrentTab();
                    break;
                case 'addBlocklistUrl':
                case 'removeBlocklistUrl':
                case 'toggleBlocklistUrl':
                case 'getBlocklistUrls':
                case 'forceUpdateBlocklist':
                    result = {
                        success: false,
                        error: 'Blocklist features coming soon',
                        canRetry: false
                    };
                    break;
                case 'getBlockedPageUrl':
                    let blockedUrl = chrome.runtime.getURL('blocked.html') + '?reason=' + message.reason;
                    if (message.domain) blockedUrl += '&domain=' + encodeURIComponent(message.domain);
                    if (message.url) blockedUrl += '&url=' + encodeURIComponent(message.url);
                    if (message.keyword) blockedUrl += '&keyword=' + encodeURIComponent(message.keyword);
                    result = { blockedUrl: blockedUrl };
                    break;
                default:
                    result = {
                        success: false,
                        error: 'Unknown action: ' + message.action,
                        canRetry: false
                    };
            }

            const processingTime = performance.now() - startTime;
            console.log(`Message processed in ${processingTime.toFixed(2)}ms:`, result);

            sendResponse(result);
        } catch (error)
        {
            console.error('Message handler error:', error);
            const errorResponse = {
                success: false,
                error: error.message,
                canRetry: !error.message.includes('Cloud features not available'),
                isCloudError: error.message.includes('Cloud features not available') || error.message.includes('fetch'),
                suggestOfflineMode: error.message.includes('Cloud features not available')
            };
            sendResponse(errorResponse);
        }
    })();
    return true;
});

// Initialize on script load
initialize();
console.log('Background script loaded successfully with optimizations');