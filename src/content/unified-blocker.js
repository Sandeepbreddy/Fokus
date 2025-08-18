// src/content/unified-blocker.js - Optimized content script
import { WHITELIST_DOMAINS, SEARCH_ENGINES, BLOCKED_REASONS } from '../shared/constants.js';
import { Utils } from '../shared/utils.js';

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

        // Critical keywords for immediate blocking
        this.criticalKeywords = new Set([
            'porn', 'xxx', 'sex', 'adult', 'nude', 'naked', 'explicit', 'erotic'
        ]);

        this.init();
    }

    async init()
    {
        // Skip extension pages and whitelisted domains
        if (this.shouldSkipPage())
        {
            return;
        }

        // Immediate check for critical content
        this.performImmediateCheck();

        // Load settings and setup monitoring
        await this.loadSettings();
        this.checkCurrentPage();
        this.deferredSetup();

        this.initialized = true;
    }

    shouldSkipPage()
    {
        const url = window.location.href;
        const hostname = window.location.hostname;

        // Skip extension pages
        if (Utils.isExtensionUrl(url) || url.includes('blocked.html'))
        {
            return true;
        }

        // Skip whitelisted domains
        return WHITELIST_DOMAINS.some(domain => hostname.includes(domain));
    }

    performImmediateCheck()
    {
        // Quick check for Google search with critical keywords
        if (window.location.hostname.includes('google.com') &&
            window.location.pathname.includes('/search'))
        {

            const urlParams = new URLSearchParams(window.location.search);
            const searchQuery = urlParams.get('q');

            if (searchQuery)
            {
                const lowerQuery = searchQuery.toLowerCase();
                for (const keyword of this.criticalKeywords)
                {
                    if (lowerQuery.includes(keyword))
                    {
                        this.immediateRedirect(BLOCKED_REASONS.SEARCH, null, searchQuery, keyword);
                        return;
                    }
                }
            }
        }
    }

    immediateRedirect(reason, domain = null, url = null, keyword = null)
    {
        // Stop page loading
        if (window.stop) window.stop();

        // Basic redirect construction (fallback)
        let redirectUrl = '/blocked.html?reason=' + reason;
        if (domain) redirectUrl += '&domain=' + encodeURIComponent(domain);
        if (url) redirectUrl += '&url=' + encodeURIComponent(url);
        if (keyword) redirectUrl += '&keyword=' + encodeURIComponent(keyword);

        window.location.replace(redirectUrl);
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
            console.log('Failed to load settings, using defaults:', error);
            // Use critical keywords as fallback
            this.blockedKeywords = new Set([...this.criticalKeywords]);
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
            this.redirectToBlockedPage(BLOCKED_REASONS.DOMAIN, hostname);
            return;
        }

        // Check keyword blocking in URL
        const blockedKeyword = this.containsBlockedKeywords(fullUrl);
        if (blockedKeyword)
        {
            this.redirectToBlockedPage(BLOCKED_REASONS.KEYWORD, null, fullUrl, blockedKeyword);
            return;
        }

        // Check search queries
        if (this.isSearchEngine(hostname) && window.location.pathname.includes('/search'))
        {
            const query = this.extractSearchQuery();
            if (query)
            {
                const keyword = this.containsBlockedKeywords(query);
                if (keyword)
                {
                    this.redirectToBlockedPage(BLOCKED_REASONS.SEARCH, null, query, keyword);
                    return;
                }
            }
        }
    }

    isDomainBlocked(hostname)
    {
        if (!this.isActive) return false;

        // Direct lookup first
        if (this.customDomains.has(hostname) || this.blockedDomains.has(hostname))
        {
            return true;
        }

        // Check parent domains
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
        for (const keyword of this.blockedKeywords)
        {
            if (lowerText.includes(keyword.toLowerCase()))
            {
                return keyword;
            }
        }
        return false;
    }

    isSearchEngine(hostname)
    {
        return SEARCH_ENGINES.some(engine => hostname.includes(engine));
    }

    extractSearchQuery()
    {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('q') || urlParams.get('query') || urlParams.get('search');
    }

    async redirectToBlockedPage(reason, domain = null, url = null, keyword = null)
    {
        if (window.stop) window.stop();

        try
        {
            const response = await chrome.runtime.sendMessage({
                action: 'getBlockedPageUrl',
                reason,
                domain,
                url,
                keyword
            });

            if (response && response.blockedUrl)
            {
                window.location.replace(response.blockedUrl);
            } else
            {
                this.immediateRedirect(reason, domain, url, keyword);
            }
        } catch (error)
        {
            console.error('Failed to get blocked page URL:', error);
            this.immediateRedirect(reason, domain, url, keyword);
        }
    }

    deferredSetup()
    {
        if (typeof requestIdleCallback !== 'undefined')
        {
            requestIdleCallback(() =>
            {
                this.setupMonitoring();
            }, { timeout: 2000 });
        } else
        {
            setTimeout(() =>
            {
                this.setupMonitoring();
            }, 100);
        }
    }

    setupMonitoring()
    {
        this.setupMutationObserver();
        this.setupHistoryMonitoring();
        this.setupLinkMonitoring();
        this.setupFormMonitoring();

        if (this.isSearchEngine(window.location.hostname))
        {
            this.setupSearchInterception();
        }
    }

    setupMutationObserver()
    {
        const debouncedCheck = Utils.debounce(() =>
        {
            const url = location.href;
            if (url !== this.lastUrl)
            {
                this.lastUrl = url;
                this.checkCurrentPage();
            }
        }, 200);

        const targetNode = document.body;
        if (targetNode)
        {
            this.mutationObserver = new MutationObserver(debouncedCheck);
            this.mutationObserver.observe(targetNode, {
                childList: true,
                subtree: false,
                attributes: false,
                characterData: false
            });
        }
    }

    setupHistoryMonitoring()
    {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        const debouncedCheck = Utils.debounce(() => this.checkCurrentPage(), 100);

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

        window.addEventListener('popstate', debouncedCheck);
    }

    setupLinkMonitoring()
    {
        document.addEventListener('click', async (e) =>
        {
            const link = e.target.closest('a');
            if (!link || !link.href) return;

            if (link.href.startsWith('#') || link.href.startsWith('javascript:')) return;

            try
            {
                const url = new URL(link.href);

                if (this.isDomainBlocked(url.hostname) || this.containsBlockedKeywords(link.href))
                {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    await this.redirectToBlockedPage(
                        this.isDomainBlocked(url.hostname) ? BLOCKED_REASONS.DOMAIN : BLOCKED_REASONS.KEYWORD,
                        url.hostname,
                        link.href
                    );
                }
            } catch (error)
            {
                // Invalid URL, ignore
            }
        }, true);
    }

    setupFormMonitoring()
    {
        document.addEventListener('submit', async (e) =>
        {
            const form = e.target;

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

                    await this.redirectToBlockedPage(BLOCKED_REASONS.SEARCH, null, input.value, blockedKeyword);
                    return;
                }
            }
        }, true);
    }

    setupSearchInterception()
    {
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

        // Visual feedback
        const checkInput = Utils.debounce((e) =>
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

        // Prevent blocked searches
        searchInput.addEventListener('keydown', async (e) =>
        {
            if (e.key === 'Enter' && e.target.getAttribute('data-blocked') === 'true')
            {
                e.preventDefault();
                e.stopPropagation();
                const blockedKeyword = this.containsBlockedKeywords(e.target.value);
                await this.redirectToBlockedPage(BLOCKED_REASONS.SEARCH, null, e.target.value, blockedKeyword);
            }
        });

        // Monitor search button
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
                    await this.redirectToBlockedPage(BLOCKED_REASONS.SEARCH, null, searchInput.value, blockedKeyword);
                }
            });
        }
    }

    destroy()
    {
        if (this.mutationObserver)
        {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }

        for (const timer of this.debounceTimers.values())
        {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        this.blockedKeywords.clear();
        this.blockedDomains.clear();
        this.customDomains.clear();
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
        }
    } catch (error)
    {
        console.error('Failed to initialize unified blocker:', error);
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

// Cleanup on unload
window.addEventListener('unload', () =>
{
    if (unifiedBlocker)
    {
        unifiedBlocker.destroy();
        unifiedBlocker = null;
    }
});