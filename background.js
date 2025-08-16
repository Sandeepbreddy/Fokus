console.log('Fokus Extension - Background Script Starting...');
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

class ContentBlocker
{
    constructor()
    {
        this.blockedDomains = new Set();
        this.customDomains = new Set();
        this.blockedKeywords = new Set();
        this.isActive = true;
        this.lastGithubUpdate = 0;
        this.githubUpdateInterval = 24 * 60 * 60 * 1000;
        this.init();
    }

    async init()
    {
        try
        {
            await this.loadSettings();
            this.setupEventHandlers();
            this.setupBlocking();
            console.log('Content Blocker initialized');
        } catch (error)
        {
            console.error('Content Blocker initialization failed:', error);
        }
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
            console.log('Browser startup');
        });
    }

    async setupDefaults()
    {
        const defaultKeywords = [
            'adult', 'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw',
            'explicit', 'mature', 'erotic', 'lesbian', 'gay', 'anal',
            'oral', 'bdsm', 'fetish', 'webcam', 'escort', 'dating'
        ];

        await chrome.storage.local.set({
            pin: '1234',
            blockedKeywords: defaultKeywords,
            customDomains: [],
            isActive: true,
            blocksToday: 0,
            focusStreak: 0,
            totalBlocks: 0,
            installDate: new Date().toISOString()
        });
    }

    setupBlocking()
    {
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) =>
        {
            if (changeInfo.status === 'loading' && tab.url)
            {
                await this.checkAndBlockTab(tabId, tab.url);
            }
        });

        chrome.tabs.onCreated.addListener(async (tab) =>
        {
            if (tab.url)
            {
                await this.checkAndBlockTab(tab.id, tab.url);
            }
        });

        chrome.webNavigation.onBeforeNavigate.addListener(async (details) =>
        {
            if (details.frameId === 0)
            {
                await this.checkAndBlockTab(details.tabId, details.url);
            }
        });
    }

    async checkAndBlockTab(tabId, url)
    {
        try
        {
            const urlObj = new URL(url);
            if (urlObj.protocol === 'chrome-extension:' || urlObj.protocol === 'moz-extension:') return;

            if (await this.isDomainBlocked(urlObj.hostname))
            {
                const blockedUrl = chrome.runtime.getURL('blocked.html') +
                    '?domain=' + encodeURIComponent(urlObj.hostname);
                chrome.tabs.update(tabId, { url: blockedUrl });
                this.incrementBlockCount();
                return;
            }

            if (urlObj.hostname.includes('google.com') && urlObj.pathname.includes('/search'))
            {
                const query = urlObj.searchParams.get('q');
                if (query && await this.containsBlockedKeywords(query))
                {
                    const blockedUrl = chrome.runtime.getURL('blocked.html') +
                        '?reason=search&query=' + encodeURIComponent(query);
                    chrome.tabs.update(tabId, { url: blockedUrl });
                    this.incrementBlockCount();
                    return;
                }
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
            const data = await chrome.storage.local.get([
                'customDomains', 'blockedKeywords', 'isActive', 'pin',
                'blockedDomains', 'lastGithubUpdate'
            ]);

            this.customDomains = new Set(data.customDomains || []);
            this.blockedKeywords = new Set(data.blockedKeywords || this.getDefaultKeywords());
            this.isActive = data.isActive !== undefined ? data.isActive : true;
            this.blockedDomains = new Set(data.blockedDomains || []);
            this.lastGithubUpdate = data.lastGithubUpdate || 0;

            if (!data.pin)
            {
                await chrome.storage.local.set({ pin: '1234' });
            }
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
        if (this.customDomains.has(hostname)) return true;
        if (this.blockedDomains.has(hostname)) return true;

        for (const domain of this.customDomains)
        {
            if (hostname.endsWith('.' + domain)) return true;
        }
        for (const domain of this.blockedDomains)
        {
            if (hostname.endsWith('.' + domain)) return true;
        }
        return false;
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
            const data = await chrome.storage.local.get(['blocksToday', 'totalBlocks', 'lastBlockDate']);
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

            await chrome.storage.local.set({
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
            const data = await chrome.storage.local.get(['customDomains']);
            const domains = new Set(data.customDomains || []);
            if (domains.has(domain))
            {
                return { success: false, error: 'Domain already blocked' };
            }
            domains.add(domain);
            await chrome.storage.local.set({ customDomains: Array.from(domains) });
            this.customDomains = domains;
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
            const data = await chrome.storage.local.get(['customDomains']);
            const domains = new Set(data.customDomains || []);
            domains.delete(domain);
            await chrome.storage.local.set({ customDomains: Array.from(domains) });
            this.customDomains = domains;
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
            const data = await chrome.storage.local.get(['blockedKeywords']);
            const keywords = new Set(data.blockedKeywords || []);
            const lowerKeyword = keyword.toLowerCase();
            if (keywords.has(lowerKeyword))
            {
                return { success: false, error: 'Keyword already blocked' };
            }
            keywords.add(lowerKeyword);
            await chrome.storage.local.set({ blockedKeywords: Array.from(keywords) });
            this.blockedKeywords = keywords;
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
            const data = await chrome.storage.local.get(['blockedKeywords']);
            const keywords = new Set(data.blockedKeywords || []);
            keywords.delete(keyword.toLowerCase());
            await chrome.storage.local.set({ blockedKeywords: Array.from(keywords) });
            this.blockedKeywords = keywords;
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
            await chrome.storage.local.set({ isActive: active });
            this.isActive = active;
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
}

// Auth Functions
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
        return await supabaseClient.syncFromCloud();
    } catch (error)
    {
        console.error('Sync from cloud failed:', error);
        throw error;
    }
}

async function fetchBlocklist(url)
{
    try
    {
        console.log('Background script fetching blocklist:', url);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'text/plain',
                'User-Agent': 'Mozilla/5.0 (compatible; Fokus-Extension/1.0.0)',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            mode: 'cors',
            credentials: 'omit'
        });

        if (!response.ok)
        {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const content = await response.text();
        console.log(`Background fetch successful: ${content.length} bytes from ${url}`);

        if (!content || content.length < 100)
        {
            throw new Error('Invalid or empty response');
        }

        return {
            success: true,
            content: content,
            size: content.length,
            url: url
        };
    } catch (error)
    {
        console.error('Background fetch failed for', url, ':', error);
        return {
            success: false,
            error: error.message,
            url: url
        };
    }
}

// Initialize
async function initialize()
{
    try
    {
        await initializeSupabase();
        contentBlocker = new ContentBlocker();
        console.log('Content Blocker created successfully');
    } catch (error)
    {
        console.error('Failed to initialize:', error);
        contentBlocker = {
            addCustomDomain: async () => ({ success: false, error: 'Service unavailable' }),
            removeCustomDomain: async () => ({ success: false, error: 'Service unavailable' }),
            addKeyword: async () => ({ success: false, error: 'Service unavailable' }),
            removeKeyword: async () => ({ success: false, error: 'Service unavailable' }),
            setActive: async () => ({ success: false, error: 'Service unavailable' }),
            getCurrentTab: async () => ({ url: null }),
            addDomainFromTab: async () => ({ success: false, error: 'Service unavailable' })
        };
    }
}

// Message Handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
{
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
                    result = await fetchBlocklist(message.url);
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
                default:
                    result = {
                        success: false,
                        error: 'Unknown action: ' + message.action,
                        canRetry: false
                    };
            }
            console.log('Sending response:', result);
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

initialize();
console.log('Background script loaded successfully');