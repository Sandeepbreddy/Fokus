console.log('Fokus content script loaded');

class UnifiedBlocker
{
    constructor()
    {
        this.blockedKeywords = new Set();
        this.blockedDomains = new Set();
        this.customDomains = new Set();
        this.isActive = true;
        this.initialized = false;
        this.init();
    }

    async init()
    {
        // Skip if already on blocked page or extension pages
        if (window.location.href.includes('chrome-extension://') ||
            window.location.href.includes('moz-extension://') ||
            window.location.href.includes('blocked.html'))
        {
            return;
        }

        await this.loadSettings();
        this.checkCurrentPage();
        this.setupMonitoring();
        this.initialized = true;
    }

    async loadSettings()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blockedKeywords', 'isActive', 'blockedDomains', 'customDomains'
            ]);
            this.blockedKeywords = new Set(data.blockedKeywords || []);
            this.blockedDomains = new Set(data.blockedDomains || []);
            this.customDomains = new Set(data.customDomains || []);
            this.isActive = data.isActive !== undefined ? data.isActive : true;
        } catch (error)
        {
            console.log('Failed to load settings:', error);
        }
    }

    checkCurrentPage()
    {
        if (!this.isActive) return;

        const hostname = window.location.hostname;
        const fullUrl = window.location.href;

        // Check domain blocking
        if (this.isDomainBlocked(hostname))
        {
            this.redirectToBlockedPage('domain', hostname);
            return;
        }

        // Check keyword blocking in URL
        const blockedKeyword = this.containsBlockedKeywords(fullUrl);
        if (blockedKeyword)
        {
            this.redirectToBlockedPage('keyword', null, fullUrl, blockedKeyword);
            return;
        }

        // Check Google search queries
        if (hostname.includes('google.com') && window.location.pathname.includes('/search'))
        {
            const urlParams = new URLSearchParams(window.location.search);
            const searchQuery = urlParams.get('q');
            if (searchQuery)
            {
                const keyword = this.containsBlockedKeywords(searchQuery);
                if (keyword)
                {
                    this.redirectToBlockedPage('search', null, searchQuery, keyword);
                    return;
                }
            }
        }
    }

    isDomainBlocked(hostname)
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

    containsBlockedKeywords(text)
    {
        if (!this.isActive || !text) return false;
        const lowerText = text.toLowerCase();
        for (const keyword of this.blockedKeywords)
        {
            if (lowerText.includes(keyword.toLowerCase()))
            {
                return keyword;
            }
        }
        return false;
    }

    redirectToBlockedPage(reason, domain = null, url = null, keyword = null)
    {
        let blockedUrl = chrome.runtime.getURL('blocked.html') + '?reason=' + reason;
        if (domain) blockedUrl += '&domain=' + encodeURIComponent(domain);
        if (url) blockedUrl += '&url=' + encodeURIComponent(url);
        if (keyword) blockedUrl += '&keyword=' + encodeURIComponent(keyword);

        // Stop page loading
        if (window.stop) window.stop();
        window.location.replace(blockedUrl);
    }

    setupMonitoring()
    {
        // Monitor URL changes for SPAs
        let lastUrl = location.href;
        new MutationObserver(() =>
        {
            const url = location.href;
            if (url !== lastUrl)
            {
                lastUrl = url;
                setTimeout(() => this.checkCurrentPage(), 100);
            }
        }).observe(document, { subtree: true, childList: true });

        // Monitor history API
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function ()
        {
            originalPushState.apply(history, arguments);
            setTimeout(() => unifiedBlocker.checkCurrentPage(), 100);
        };

        history.replaceState = function ()
        {
            originalReplaceState.apply(history, arguments);
            setTimeout(() => unifiedBlocker.checkCurrentPage(), 100);
        };

        // Monitor popstate
        window.addEventListener('popstate', () =>
        {
            setTimeout(() => this.checkCurrentPage(), 100);
        });

        // Monitor link clicks
        document.addEventListener('click', (e) =>
        {
            const link = e.target.closest('a');
            if (link && link.href)
            {
                try
                {
                    const url = new URL(link.href);
                    if (this.isDomainBlocked(url.hostname) || this.containsBlockedKeywords(link.href))
                    {
                        e.preventDefault();
                        e.stopPropagation();
                        this.redirectToBlockedPage(
                            this.isDomainBlocked(url.hostname) ? 'domain' : 'keyword',
                            url.hostname,
                            link.href
                        );
                    }
                } catch (error)
                {
                    // Invalid URL, ignore
                }
            }
        }, true);

        // Monitor form submissions
        document.addEventListener('submit', (e) =>
        {
            const form = e.target;
            const inputs = form.querySelectorAll('input[type="search"], input[name*="search"], input[name*="query"], input[name="q"]');

            for (const input of inputs)
            {
                const blockedKeyword = this.containsBlockedKeywords(input.value);
                if (blockedKeyword)
                {
                    e.preventDefault();
                    e.stopPropagation();
                    this.redirectToBlockedPage('search', null, input.value, blockedKeyword);
                    return;
                }
            }
        }, true);

        // Special handling for search engines
        if (window.location.hostname.includes('google.com') ||
            window.location.hostname.includes('bing.com') ||
            window.location.hostname.includes('duckduckgo.com'))
        {
            this.setupSearchInterception();
        }
    }

    setupSearchInterception()
    {
        const searchInput = document.querySelector('input[name="q"], input#search, input[type="search"]');
        if (searchInput)
        {
            searchInput.addEventListener('input', (e) =>
            {
                const blockedKeyword = this.containsBlockedKeywords(e.target.value);
                if (blockedKeyword)
                {
                    e.target.style.border = '2px solid #ff4444';
                    e.target.style.backgroundColor = '#ffe6e6';
                } else
                {
                    e.target.style.border = '';
                    e.target.style.backgroundColor = '';
                }
            });

            searchInput.addEventListener('keydown', (e) =>
            {
                if (e.key === 'Enter')
                {
                    const blockedKeyword = this.containsBlockedKeywords(e.target.value);
                    if (blockedKeyword)
                    {
                        e.preventDefault();
                        this.redirectToBlockedPage('search', null, e.target.value, blockedKeyword);
                    }
                }
            });
        }
    }
}

// Initialize
let unifiedBlocker;

function initialize()
{
    try
    {
        if (!unifiedBlocker)
        {
            unifiedBlocker = new UnifiedBlocker();
            console.log('Unified blocker initialized');
        }
    } catch (error)
    {
        console.error('Failed to initialize unified blocker:', error);
    }
}

// Immediate check for Google search results
if (window.location.hostname.includes('google.com') && window.location.pathname.includes('/search'))
{
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('q');
    if (searchQuery)
    {
        const defaultKeywords = ['porn', 'xxx', 'sex', 'adult', 'nude', 'naked', 'explicit', 'erotic'];
        const lowerQuery = searchQuery.toLowerCase();
        for (const keyword of defaultKeywords)
        {
            if (lowerQuery.includes(keyword))
            {
                if (window.stop) window.stop();
                const blockedUrl = chrome.runtime.getURL('blocked.html') +
                    '?reason=search&keyword=' + encodeURIComponent(keyword) +
                    '&query=' + encodeURIComponent(searchQuery);
                window.location.replace(blockedUrl);
                break;
            }
        }
    }
}

if (document.readyState === 'loading')
{
    document.addEventListener('DOMContentLoaded', initialize);
} else
{
    initialize();
}

// Ensure initialization happens
setTimeout(() =>
{
    if (!unifiedBlocker)
    {
        initialize();
    }
}, 50);