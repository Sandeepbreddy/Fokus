// background.js - Complete rewrite with robust error handling

console.log('Fokus Extension - Background Script Starting...');

// CONTENT BLOCKER CLASS
class ContentBlocker
{
    constructor()
    {
        this.blockedDomains = new Set();
        this.customDomains = new Set();
        this.blockedKeywords = new Set();
        this.isActive = true;
        this.lastGithubUpdate = 0;
        this.githubUpdateInterval = 24 * 60 * 60 * 1000; // 24 hours

        this.init();
    }

    async init()
    {
        console.log('Initializing Content Blocker...');

        try
        {
            // Load basic settings first
            await this.loadSettings();

            // Setup event handlers
            this.setupEventHandlers();

            // Start basic blocking functionality
            this.setupBlocking();

            console.log('Content Blocker initialized');
        } catch (error)
        {
            console.error('Content Blocker initialization failed:', error);
        }
    }

    setupEventHandlers()
    {
        // Handle extension install/update
        chrome.runtime.onInstalled.addListener(async (details) =>
        {
            console.log('Extension event:', details.reason);

            if (details.reason === 'install')
            {
                console.log('First time install');
            }
        });

        // Handle browser startup
        chrome.runtime.onStartup.addListener(() =>
        {
            console.log('Browser startup');
        });
    }

    setupBlocking()
    {
        // Monitor tab updates for blocking
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) =>
        {
            if (changeInfo.status === 'loading' && tab.url)
            {
                await this.checkAndBlockTab(tabId, tab.url);
            }
        });

        // Monitor tab creation
        chrome.tabs.onCreated.addListener(async (tab) =>
        {
            if (tab.url)
            {
                await this.checkAndBlockTab(tab.id, tab.url);
            }
        });

        // Monitor navigation
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

            // Skip extension pages
            if (urlObj.protocol === 'chrome-extension:') return;

            // Check domain blocking
            if (await this.isDomainBlocked(urlObj.hostname))
            {
                const blockedUrl = chrome.runtime.getURL('blocked.html') +
                    '?domain=' + encodeURIComponent(urlObj.hostname);
                chrome.tabs.update(tabId, { url: blockedUrl });
                this.incrementBlockCount();
                return;
            }

            // Check Google search blocking
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
            // Ignore invalid URLs
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

            // Set default PIN if none exists
            if (!data.pin)
            {
                await chrome.storage.local.set({ pin: '1234' });
            }

            console.log('Settings loaded');
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

        // Check custom domains
        if (this.customDomains.has(hostname)) return true;

        // Check GitHub blocklist
        if (this.blockedDomains.has(hostname)) return true;

        // Check subdomains
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
            if (lowerText.includes(keyword.toLowerCase()))
            {
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

    // API METHODS

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

// INITIALIZATION

let contentBlocker;

try
{
    contentBlocker = new ContentBlocker();
    console.log('Content Blocker created successfully');
} catch (error)
{
    console.error('Failed to create Content Blocker:', error);

    // Create minimal fallback
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

// MESSAGE HANDLER

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
                // Domain management
                case 'addCustomDomain':
                    result = await contentBlocker.addCustomDomain(message.domain);
                    break;

                case 'removeCustomDomain':
                    result = await contentBlocker.removeCustomDomain(message.domain);
                    break;

                case 'addDomainFromTab':
                    result = await contentBlocker.addDomainFromTab();
                    break;

                // Keyword management
                case 'addKeyword':
                    result = await contentBlocker.addKeyword(message.keyword);
                    break;

                case 'removeKeyword':
                    result = await contentBlocker.removeKeyword(message.keyword);
                    break;

                // Extension control
                case 'setActive':
                    result = await contentBlocker.setActive(message.active);
                    break;

                // Tab info
                case 'getCurrentTab':
                    result = await contentBlocker.getCurrentTab();
                    break;

                // Blocklist operations (simplified)
                case 'addBlocklistUrl':
                case 'removeBlocklistUrl':
                case 'toggleBlocklistUrl':
                case 'getBlocklistUrls':
                case 'forceUpdateBlocklist':
                    result = { success: false, error: 'Blocklist features coming soon' };
                    break;

                default:
                    result = { success: false, error: 'Unknown action: ' + message.action };
            }

            console.log('Sending response:', result);
            sendResponse(result);

        } catch (error)
        {
            console.error('Message handler error:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();

    return true; // Will respond asynchronously
});

console.log('Background script loaded successfully');