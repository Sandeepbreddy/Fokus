console.log('Fokus content script loaded');

// Optimized Unified Blocker with performance improvements
class UnifiedBlocker
{
    constructor()
    {
        this.blockedKeywords = new Set();
        this.blockedDomains = new Set();
        this.customDomains = new Set();
        this.isActive = true;
        this.initialized = false;
        this.settingsLoaded = false;
        this.lastUrl = location.href;

        // Performance optimizations
        this.debounceTimers = new Map();
        this.mutationObserver = null;

        // Whitelist of domains to skip
        this.whitelist = new Set([
            'chrome.google.com',
            'addons.mozilla.org',
            'microsoftedge.microsoft.com',
            'chrome-extension',
            'moz-extension',
            'edge-extension'
        ]);

        // Initialize
        this.init();
    }

    async init()
    {
        // Skip if already on blocked page or extension pages
        if (window.location.href.includes('chrome-extension://') ||
            window.location.href.includes('moz-extension://') ||
            window.location.href.includes('edge-extension://') ||
            window.location.href.includes('blocked.html'))
        {
            return;
        }

        // Skip initialization for whitelisted domains
        const hostname = window.location.hostname;
        if (this.isWhitelisted(hostname))
        {
            console.log('Skipping initialization for whitelisted domain:', hostname);
            return;
        }

        // Load settings lazily
        await this.loadSettings();

        // Check current page immediately
        this.checkCurrentPage();

        // Defer non-critical monitoring
        if (typeof requestIdleCallback !== 'undefined')
        {
            requestIdleCallback(() =>
            {
                this.setupMonitoring();
            }, { timeout: 2000 });
        } else
        {
            // Fallback for browsers without requestIdleCallback
            setTimeout(() =>
            {
                this.setupMonitoring();
            }, 100);
        }

        this.initialized = true;
    }

    isWhitelisted(hostname)
    {
        for (const domain of this.whitelist)
        {
            if (hostname.includes(domain))
            {
                return true;
            }
        }
        return false;
    }

    async loadSettings()
    {
        if (this.settingsLoaded) return;

        try
        {
            const data = await chrome.storage.local.get([
                'blockedKeywords', 'isActive', 'blockedDomains', 'customDomains'
            ]);

            this.blockedKeywords = new Set(data.blockedKeywords || []);
            this.blockedDomains = new Set(data.blockedDomains || []);
            this.customDomains = new Set(data.customDomains || []);
            this.isActive = data.isActive !== undefined ? data.isActive : true;
            this.settingsLoaded = true;

            console.log(`Loaded settings: ${this.blockedKeywords.size} keywords, ${this.blockedDomains.size + this.customDomains.size} domains`);
        } catch (error)
        {
            console.log('Failed to load settings:', error);
            // Use default keywords as fallback
            this.blockedKeywords = new Set(['porn', 'xxx', 'sex', 'adult', 'nude', 'naked', 'explicit', 'erotic']);
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

        // Direct lookup first (fastest)
        if (this.customDomains.has(hostname) || this.blockedDomains.has(hostname))
        {
            return true;
        }

        // Check subdomains (slower, so do it second)
        const hostParts = hostname.split('.');
        for (let i = 1; i < hostParts.length; i++)
        {
            const parentDomain = hostParts.slice(i).join('.');
            if (this.customDomains.has(parentDomain) || this.blockedDomains.has(parentDomain))
            {
                return true;
            }
        }

        return false;
    }

    containsBlockedKeywords(text)
    {
        if (!this.isActive || !text) return false;
        const lowerText = text.toLowerCase();

        // Use for...of for better performance with early return
        for (const keyword of this.blockedKeywords)
        {
            if (lowerText.includes(keyword.toLowerCase()))
            {
                return keyword;
            }
        }
        return false;
    }

    async redirectToBlockedPage(reason, domain = null, url = null, keyword = null)
    {
        // Stop page loading immediately
        if (window.stop)
        {
            window.stop();
        }

        try
        {
            // Get blocked page URL from background script
            const response = await chrome.runtime.sendMessage({
                action: 'getBlockedPageUrl',
                reason: reason,
                domain: domain,
                url: url,
                keyword: keyword
            });

            if (response && response.blockedUrl)
            {
                window.location.replace(response.blockedUrl);
            } else
            {
                // Fallback - construct URL manually
                let blockedUrl = '/blocked.html?reason=' + reason;
                if (domain) blockedUrl += '&domain=' + encodeURIComponent(domain);
                if (url) blockedUrl += '&url=' + encodeURIComponent(url);
                if (keyword) blockedUrl += '&keyword=' + encodeURIComponent(keyword);

                window.location.replace(blockedUrl);
            }
        } catch (error)
        {
            console.error('Failed to redirect to blocked page:', error);
            // Final fallback
            window.location.replace('/blocked.html');
        }
    }

    setupMonitoring()
    {
        // Optimized MutationObserver with specific config
        this.setupOptimizedMutationObserver();

        // Monitor history API changes
        this.setupHistoryMonitoring();

        // Monitor link clicks with delegation
        this.setupLinkMonitoring();

        // Monitor form submissions
        this.setupFormMonitoring();

        // Special handling for search engines
        if (this.isSearchEngine())
        {
            this.setupSearchInterception();
        }
    }

    setupOptimizedMutationObserver()
    {
        // Use debounced observer for better performance
        const debouncedCheck = this.debounce(() =>
        {
            const url = location.href;
            if (url !== this.lastUrl)
            {
                this.lastUrl = url;
                this.checkCurrentPage();
            }
        }, 200);

        // Only observe body with minimal config
        const targetNode = document.body;
        if (targetNode)
        {
            this.mutationObserver = new MutationObserver(debouncedCheck);
            this.mutationObserver.observe(targetNode, {
                childList: true,
                subtree: false, // Don't observe entire subtree for performance
                attributes: false,
                characterData: false
            });
        }
    }

    setupHistoryMonitoring()
    {
        // Wrap history methods
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        const debouncedCheck = this.debounce(() => this.checkCurrentPage(), 100);

        history.pushState = function ()
        {
            originalPushState.apply(history, arguments);
            debouncedCheck();
        };

        history.replaceState = function ()
        {
            originalReplaceState.apply(history, arguments);
            debouncedCheck();
        };

        // Monitor popstate
        window.addEventListener('popstate', debouncedCheck);
    }

    setupLinkMonitoring()
    {
        // Use event delegation for better performance
        document.addEventListener('click', async (e) =>
        {
            // Find closest link element
            const link = e.target.closest('a');
            if (!link || !link.href) return;

            // Skip internal links
            if (link.href.startsWith('#') || link.href.startsWith('javascript:')) return;

            try
            {
                const url = new URL(link.href);

                // Quick check for blocked content
                if (this.isDomainBlocked(url.hostname) || this.containsBlockedKeywords(link.href))
                {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    await this.redirectToBlockedPage(
                        this.isDomainBlocked(url.hostname) ? 'domain' : 'keyword',
                        url.hostname,
                        link.href
                    );
                }
            } catch (error)
            {
                // Invalid URL, ignore
            }
        }, true); // Use capture phase for earlier interception
    }

    setupFormMonitoring()
    {
        // Monitor form submissions with delegation
        document.addEventListener('submit', async (e) =>
        {
            const form = e.target;

            // Check search-related inputs
            const searchSelectors = [
                'input[type="search"]',
                'input[name*="search"]',
                'input[name*="query"]',
                'input[name="q"]',
                'input[placeholder*="search" i]'
            ];

            const inputs = form.querySelectorAll(searchSelectors.join(','));

            for (const input of inputs)
            {
                if (!input.value) continue;

                const blockedKeyword = this.containsBlockedKeywords(input.value);
                if (blockedKeyword)
                {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    await this.redirectToBlockedPage('search', null, input.value, blockedKeyword);
                    return;
                }
            }
        }, true);
    }

    isSearchEngine()
    {
        const hostname = window.location.hostname;
        const searchEngines = ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com', 'yandex'];
        return searchEngines.some(engine => hostname.includes(engine));
    }

    setupSearchInterception()
    {
        // Find search input with multiple selectors
        const searchSelectors = [
            'input[name="q"]',
            'input#search',
            'input[type="search"]',
            'input[role="combobox"]',
            'input[aria-label*="search" i]',
            'input[placeholder*="search" i]'
        ];

        const searchInput = document.querySelector(searchSelectors.join(','));
        if (!searchInput) return;

        // Visual feedback for blocked keywords
        const checkInput = this.debounce((e) =>
        {
            const blockedKeyword = this.containsBlockedKeywords(e.target.value);
            if (blockedKeyword)
            {
                e.target.style.border = '2px solid #ff4444';
                e.target.style.backgroundColor = '#ffe6e6';
                e.target.setAttribute('data-blocked', 'true');
            } else
            {
                e.target.style.border = '';
                e.target.style.backgroundColor = '';
                e.target.removeAttribute('data-blocked');
            }
        }, 150);

        searchInput.addEventListener('input', checkInput);

        // Prevent submission of blocked searches
        searchInput.addEventListener('keydown', async (e) =>
        {
            if (e.key === 'Enter' && e.target.getAttribute('data-blocked') === 'true')
            {
                e.preventDefault();
                e.stopPropagation();
                const blockedKeyword = this.containsBlockedKeywords(e.target.value);
                await this.redirectToBlockedPage('search', null, e.target.value, blockedKeyword);
            }
        });

        // Also monitor the search button if exists
        const searchButton = document.querySelector('button[type="submit"], input[type="submit"], button[aria-label*="search" i]');
        if (searchButton)
        {
            searchButton.addEventListener('click', async (e) =>
            {
                if (searchInput.getAttribute('data-blocked') === 'true')
                {
                    e.preventDefault();
                    e.stopPropagation();
                    const blockedKeyword = this.containsBlockedKeywords(searchInput.value);
                    await this.redirectToBlockedPage('search', null, searchInput.value, blockedKeyword);
                }
            });
        }
    }

    debounce(func, wait)
    {
        return (...args) =>
        {
            const key = func.toString();
            clearTimeout(this.debounceTimers.get(key));

            const timeout = setTimeout(() =>
            {
                this.debounceTimers.delete(key);
                func.apply(this, args);
            }, wait);

            this.debounceTimers.set(key, timeout);
        };
    }

    // Cleanup method to prevent memory leaks
    destroy()
    {
        // Disconnect mutation observer
        if (this.mutationObserver)
        {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }

        // Clear all timers
        for (const timer of this.debounceTimers.values())
        {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        // Clear data
        this.blockedKeywords.clear();
        this.blockedDomains.clear();
        this.customDomains.clear();
    }
}

// Initialize with performance tracking
let unifiedBlocker;
const initStartTime = performance.now();

function initialize()
{
    try
    {
        if (!unifiedBlocker)
        {
            unifiedBlocker = new UnifiedBlocker();
            const initTime = performance.now() - initStartTime;
            console.log(`Unified blocker initialized in ${initTime.toFixed(2)}ms`);
        }
    } catch (error)
    {
        console.error('Failed to initialize unified blocker:', error);
    }
}

// Immediate check for Google search results (highest priority)
if (window.location.hostname.includes('google.com') && window.location.pathname.includes('/search'))
{
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('q');
    if (searchQuery)
    {
        // Use minimal keyword set for immediate blocking
        const criticalKeywords = ['porn', 'xxx', 'sex', 'adult', 'nude', 'naked', 'explicit', 'erotic'];
        const lowerQuery = searchQuery.toLowerCase();

        for (const keyword of criticalKeywords)
        {
            if (lowerQuery.includes(keyword))
            {
                // Stop page immediately
                if (window.stop) window.stop();

                // Use basic redirect since we can't easily access chrome.runtime.getURL here
                window.location.replace('/blocked.html?reason=search&keyword=' +
                    encodeURIComponent(keyword) + '&query=' + encodeURIComponent(searchQuery));
                break;
            }
        }
    }
}

// Initialize based on document state
if (document.readyState === 'loading')
{
    document.addEventListener('DOMContentLoaded', initialize);
} else
{
    initialize();
}

// Fallback initialization
setTimeout(() =>
{
    if (!unifiedBlocker)
    {
        initialize();
    }
}, 50);

// Cleanup on page unload to prevent memory leaks
window.addEventListener('unload', () =>
{
    if (unifiedBlocker)
    {
        unifiedBlocker.destroy();
        unifiedBlocker = null;
    }
});