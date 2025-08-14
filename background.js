// Background script for Focus Guard extension

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
        await this.loadSettings();
        await this.updateBlocklist();
        this.setupRequestInterceptor();
        this.setupTabUpdatedListener();

        // Update blocklist periodically
        setInterval(() => this.updateBlocklist(), this.githubUpdateInterval);
    }

    async loadSettings()
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
    }

    getDefaultKeywords()
    {
        return [
            'adult', 'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw',
            'explicit', 'mature', 'erotic', 'lesbian', 'gay', 'anal',
            'oral', 'bdsm', 'fetish', 'webcam', 'escort', 'dating'
        ];
    }

    async updateBlocklist()
    {
        const now = Date.now();
        if (now - this.lastGithubUpdate < this.githubUpdateInterval)
        {
            return;
        }

        try
        {
            // Get blocklist URLs from storage
            const data = await chrome.storage.local.get(['blocklistUrls']);
            const blocklistUrls = data.blocklistUrls || this.getDefaultBlocklistUrls();

            const allDomains = new Set();
            const updateResults = [];

            // Process each blocklist URL
            for (const urlConfig of blocklistUrls)
            {
                if (!urlConfig.enabled) continue;

                try
                {
                    console.log(`Updating blocklist from: ${urlConfig.name}`);
                    const response = await fetch(urlConfig.url);
                    const text = await response.text();

                    const domains = this.parseHostsFile(text);
                    domains.forEach(domain => allDomains.add(domain));

                    updateResults.push({
                        name: urlConfig.name,
                        url: urlConfig.url,
                        domains: domains.size,
                        success: true,
                        lastUpdated: now
                    });

                    console.log(`Loaded ${domains.size} domains from ${urlConfig.name}`);
                } catch (error)
                {
                    console.error(`Failed to update ${urlConfig.name}:`, error);
                    updateResults.push({
                        name: urlConfig.name,
                        url: urlConfig.url,
                        domains: 0,
                        success: false,
                        error: error.message,
                        lastUpdated: now
                    });
                }
            }

            this.blockedDomains = allDomains;
            await chrome.storage.local.set({
                blockedDomains: Array.from(allDomains),
                lastGithubUpdate: now,
                blocklistUpdateResults: updateResults
            });

            console.log(`Updated blocklist with ${allDomains.size} total domains from ${updateResults.filter(r => r.success).length} sources`);
        } catch (error)
        {
            console.error('Failed to update blocklist:', error);
        }
    }

    parseHostsFile(text)
    {
        const domains = new Set();
        const lines = text.split('\n');

        for (const line of lines)
        {
            const trimmedLine = line.trim();

            // Skip comments and empty lines
            if (!trimmedLine || trimmedLine.startsWith('#')) continue;

            // Parse hosts file format (0.0.0.0 domain.com or 127.0.0.1 domain.com)
            if (trimmedLine.startsWith('0.0.0.0 ') || trimmedLine.startsWith('127.0.0.1 '))
            {
                const parts = trimmedLine.split(/\s+/);
                if (parts.length >= 2)
                {
                    const domain = parts[1].trim();
                    if (domain && domain !== 'localhost' && !domain.includes('#') && this.isValidDomain(domain))
                    {
                        domains.add(domain);
                    }
                }
            }
            // Parse plain domain list format
            else if (this.isValidDomain(trimmedLine))
            {
                domains.add(trimmedLine);
            }
        }

        return domains;
    }

    isValidDomain(domain)
    {
        // Basic domain validation
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
        return domainRegex.test(domain) && domain.length <= 255;
    }

    getDefaultBlocklistUrls()
    {
        return [
            {
                id: 'stevenblack-porn',
                name: 'StevenBlack - Porn Only',
                url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts',
                enabled: true,
                description: 'Adult content domains only'
            },
            {
                id: 'stevenblack-porn-social',
                name: 'StevenBlack - Porn + Social',
                url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-social/hosts',
                enabled: false,
                description: 'Adult content + social media platforms'
            },
            {
                id: 'ut1-blacklist-adult',
                name: 'UT1 Adult Category',
                url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn/hosts',
                enabled: true,
                description: 'Comprehensive adult content blocklist'
            }
        ];
    }

    isDomainBlocked(hostname)
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

    containsBlockedKeywords(text)
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

    setupRequestInterceptor()
    {
        // Use declarative net request for Manifest V3 compatibility
        // We'll handle blocking through tab updates and redirects instead of webRequest blocking
        console.log('Setting up non-blocking request monitoring...');
    }

    setupTabUpdatedListener()
    {
        // Monitor tab updates for domain blocking
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) =>
        {
            if (changeInfo.status === 'loading' && tab.url)
            {
                try
                {
                    const url = new URL(tab.url);

                    // Check for Google search URLs specifically
                    if (url.hostname.includes('google.com') && url.pathname.includes('/search'))
                    {
                        const searchQuery = url.searchParams.get('q');
                        if (searchQuery && this.containsBlockedKeywords(searchQuery))
                        {
                            console.log('Background: Blocking Google search for:', searchQuery);
                            const blockedUrl = chrome.runtime.getURL('blocked.html') +
                                '?reason=search&keyword=' + encodeURIComponent(searchQuery) +
                                '&query=' + encodeURIComponent(searchQuery);
                            chrome.tabs.update(tabId, { url: blockedUrl });
                            return;
                        }
                    }

                    // Regular domain blocking
                    if (this.isDomainBlocked(url.hostname))
                    {
                        const blockedUrl = chrome.runtime.getURL('blocked.html') +
                            '?domain=' + encodeURIComponent(url.hostname);
                        chrome.tabs.update(tabId, { url: blockedUrl });
                    }
                } catch (error)
                {
                    // Ignore invalid URLs
                }
            }
        });

        // Monitor tab creation for immediate blocking
        chrome.tabs.onCreated.addListener((tab) =>
        {
            if (tab.url)
            {
                try
                {
                    const url = new URL(tab.url);

                    // Check for Google search URLs
                    if (url.hostname.includes('google.com') && url.pathname.includes('/search'))
                    {
                        const searchQuery = url.searchParams.get('q');
                        if (searchQuery && this.containsBlockedKeywords(searchQuery))
                        {
                            console.log('Background: Blocking new Google search tab for:', searchQuery);
                            const blockedUrl = chrome.runtime.getURL('blocked.html') +
                                '?reason=search&keyword=' + encodeURIComponent(searchQuery) +
                                '&query=' + encodeURIComponent(searchQuery);
                            chrome.tabs.update(tab.id, { url: blockedUrl });
                            return;
                        }
                    }

                    if (this.isDomainBlocked(url.hostname))
                    {
                        const blockedUrl = chrome.runtime.getURL('blocked.html') +
                            '?domain=' + encodeURIComponent(url.hostname);
                        chrome.tabs.update(tab.id, { url: blockedUrl });
                    }
                } catch (error)
                {
                    // Ignore invalid URLs
                }
            }
        });

        // Monitor navigation attempts
        chrome.webNavigation.onBeforeNavigate.addListener((details) =>
        {
            if (details.frameId === 0)
            { // Main frame only
                try
                {
                    const url = new URL(details.url);

                    // Check for Google search URLs
                    if (url.hostname.includes('google.com') && url.pathname.includes('/search'))
                    {
                        const searchQuery = url.searchParams.get('q');
                        if (searchQuery && this.containsBlockedKeywords(searchQuery))
                        {
                            console.log('Background: Blocking navigation to Google search for:', searchQuery);
                            const blockedUrl = chrome.runtime.getURL('blocked.html') +
                                '?reason=search&keyword=' + encodeURIComponent(searchQuery) +
                                '&query=' + encodeURIComponent(searchQuery);
                            chrome.tabs.update(details.tabId, { url: blockedUrl });
                            return;
                        }
                    }

                    if (this.isDomainBlocked(url.hostname))
                    {
                        const blockedUrl = chrome.runtime.getURL('blocked.html') +
                            '?domain=' + encodeURIComponent(url.hostname);
                        chrome.tabs.update(details.tabId, { url: blockedUrl });
                    }
                } catch (error)
                {
                    // Ignore invalid URLs
                }
            }
        });
    }

    async addCustomDomain(domain)
    {
        this.customDomains.add(domain);
        await chrome.storage.local.set({ customDomains: Array.from(this.customDomains) });
    }

    async removeCustomDomain(domain)
    {
        this.customDomains.delete(domain);
        await chrome.storage.local.set({ customDomains: Array.from(this.customDomains) });
    }

    async addKeyword(keyword)
    {
        const data = await chrome.storage.local.get(['blockedKeywords']);
        const keywords = new Set(data.blockedKeywords || this.getDefaultKeywords());
        keywords.add(keyword.toLowerCase());

        this.blockedKeywords = keywords;
        await chrome.storage.local.set({ blockedKeywords: Array.from(keywords) });
        console.log('Keyword added to background:', keyword);
    }

    async removeKeyword(keyword)
    {
        const data = await chrome.storage.local.get(['blockedKeywords']);
        const keywords = new Set(data.blockedKeywords || this.getDefaultKeywords());
        keywords.delete(keyword.toLowerCase());

        this.blockedKeywords = keywords;
        await chrome.storage.local.set({ blockedKeywords: Array.from(keywords) });
        console.log('Keyword removed from background:', keyword);
    }

    async setActive(active)
    {
        this.isActive = active;
        await chrome.storage.local.set({ isActive: active });
    }

    async addBlocklistUrl(urlConfig)
    {
        const data = await chrome.storage.local.get(['blocklistUrls']);
        const urls = data.blocklistUrls || this.getDefaultBlocklistUrls();

        // Generate ID if not provided
        if (!urlConfig.id)
        {
            urlConfig.id = 'custom-' + Date.now();
        }

        // Check for duplicates
        const existingIndex = urls.findIndex(u => u.id === urlConfig.id || u.url === urlConfig.url);
        if (existingIndex >= 0)
        {
            urls[existingIndex] = { ...urls[existingIndex], ...urlConfig };
        } else
        {
            urls.push(urlConfig);
        }

        await chrome.storage.local.set({ blocklistUrls: urls });
    }

    async removeBlocklistUrl(id)
    {
        const data = await chrome.storage.local.get(['blocklistUrls']);
        const urls = data.blocklistUrls || this.getDefaultBlocklistUrls();

        const filteredUrls = urls.filter(u => u.id !== id);
        await chrome.storage.local.set({ blocklistUrls: filteredUrls });
    }

    async toggleBlocklistUrl(id, enabled)
    {
        const data = await chrome.storage.local.get(['blocklistUrls']);
        const urls = data.blocklistUrls || this.getDefaultBlocklistUrls();

        const urlConfig = urls.find(u => u.id === id);
        if (urlConfig)
        {
            urlConfig.enabled = enabled;
            await chrome.storage.local.set({ blocklistUrls: urls });
        }
    }
}

// Initialize the content blocker
let contentBlocker;

try
{
    console.log('Initializing content blocker...');
    contentBlocker = new ContentBlocker();
    console.log('Content blocker initialized successfully');
} catch (error)
{
    console.error('Failed to initialize content blocker:', error);

    // Create a minimal fallback to handle basic messages
    contentBlocker = {
        async addCustomDomain() { return { success: false, error: 'Service unavailable' }; },
        async addKeyword() { return { success: false, error: 'Service unavailable' }; },
        async removeKeyword() { return { success: false, error: 'Service unavailable' }; },
        async setActive() { return { success: false, error: 'Service unavailable' }; },
        async updateBlocklist() { return { success: false, error: 'Service unavailable' }; },
        getDefaultBlocklistUrls() { return []; }
    };
}

// Handle messages from popup/options pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
{
    console.log('Background received message:', message);

    (async () =>
    {
        try
        {
            switch (message.action)
            {
                case 'getCurrentTab':
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    sendResponse({ url: tab.url });
                    break;

                case 'addDomainFromTab':
                    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (currentTab.url)
                    {
                        const domain = new URL(currentTab.url).hostname;
                        await contentBlocker.addCustomDomain(domain);
                        sendResponse({ success: true, domain });
                    }
                    break;

                case 'addCustomDomain':
                    await contentBlocker.addCustomDomain(message.domain);
                    sendResponse({ success: true });
                    break;

                case 'removeCustomDomain':
                    await contentBlocker.removeCustomDomain(message.domain);
                    sendResponse({ success: true });
                    break;

                case 'addKeyword':
                    await contentBlocker.addKeyword(message.keyword);
                    sendResponse({ success: true });
                    break;

                case 'removeKeyword':
                    await contentBlocker.removeKeyword(message.keyword);
                    sendResponse({ success: true });
                    break;

                case 'setActive':
                    await contentBlocker.setActive(message.active);
                    sendResponse({ success: true });
                    break;

                case 'forceUpdateBlocklist':
                    contentBlocker.lastGithubUpdate = 0;
                    await contentBlocker.updateBlocklist();
                    sendResponse({ success: true });
                    break;

                case 'addBlocklistUrl':
                    await contentBlocker.addBlocklistUrl(message.urlConfig);
                    sendResponse({ success: true });
                    break;

                case 'removeBlocklistUrl':
                    await contentBlocker.removeBlocklistUrl(message.id);
                    sendResponse({ success: true });
                    break;

                case 'toggleBlocklistUrl':
                    await contentBlocker.toggleBlocklistUrl(message.id, message.enabled);
                    sendResponse({ success: true });
                    break;

                case 'getBlocklistUrls':
                    const blocklistData = await chrome.storage.local.get(['blocklistUrls', 'blocklistUpdateResults']);
                    sendResponse({
                        urls: blocklistData.blocklistUrls || contentBlocker.getDefaultBlocklistUrls(),
                        results: blocklistData.blocklistUpdateResults || []
                    });
                    break;

                default:
                    console.log('Unknown action:', message.action);
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error)
        {
            console.error('Message handling error:', error);
            sendResponse({ error: error.message });
        }
    })();

    return true; // Indicates we will send response asynchronously
});