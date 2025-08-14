// Content script for search engine keyword blocking and URL monitoring

class SearchFilter
{
    constructor()
    {
        this.blockedKeywords = new Set();
        this.blockedDomains = new Set();
        this.customDomains = new Set();
        this.isActive = true;
        this.init();
    }

    async init()
    {
        await this.loadSettings();
        this.checkCurrentPage();
        this.setupSearchInterception();
        this.setupKeywordHighlighting();
        this.setupURLMonitoring();
    }

    async loadSettings()
    {
        const data = await chrome.storage.local.get(['blockedKeywords', 'isActive', 'blockedDomains', 'customDomains']);
        this.blockedKeywords = new Set(data.blockedKeywords || []);
        this.blockedDomains = new Set(data.blockedDomains || []);
        this.customDomains = new Set(data.customDomains || []);
        this.isActive = data.isActive !== undefined ? data.isActive : true;
    }

    checkCurrentPage()
    {
        if (!this.isActive) return;

        const hostname = window.location.hostname;

        // Check if current domain should be blocked
        if (this.isDomainBlocked(hostname))
        {
            const blockedUrl = chrome.runtime.getURL('blocked.html') +
                '?domain=' + encodeURIComponent(hostname);
            window.location.href = blockedUrl;
            return;
        }

        // Check if current URL contains blocked keywords
        if (this.containsBlockedKeywords(window.location.href))
        {
            const blockedUrl = chrome.runtime.getURL('blocked.html') +
                '?reason=keyword&url=' + encodeURIComponent(window.location.href);
            window.location.href = blockedUrl;
            return;
        }
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

    setupURLMonitoring()
    {
        // Monitor for dynamic navigation (SPA apps)
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

        // Monitor for programmatic navigation
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function ()
        {
            originalPushState.apply(history, arguments);
            setTimeout(() => searchFilter.checkCurrentPage(), 100);
        };

        history.replaceState = function ()
        {
            originalReplaceState.apply(history, arguments);
            setTimeout(() => searchFilter.checkCurrentPage(), 100);
        };

        window.addEventListener('popstate', () =>
        {
            setTimeout(() => this.checkCurrentPage(), 100);
        });
    }

    containsBlockedKeywords(text)
    {
        if (!this.isActive) return false;

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

    setupSearchInterception()
    {
        // Google
        if (location.hostname.includes('google.com'))
        {
            this.interceptGoogleSearch();
        }

        // Bing
        if (location.hostname.includes('bing.com'))
        {
            this.interceptBingSearch();
        }

        // DuckDuckGo
        if (location.hostname.includes('duckduckgo.com'))
        {
            this.interceptDuckDuckGoSearch();
        }

        // YouTube
        if (location.hostname.includes('youtube.com'))
        {
            this.interceptYouTubeSearch();
        }

        // Other search engines
        this.interceptGenericSearch();
    }

    interceptGoogleSearch()
    {
        // Monitor search input
        const searchInput = document.querySelector('input[name="q"]');
        if (searchInput)
        {
            searchInput.addEventListener('input', (e) => this.checkSearchInput(e.target));
            searchInput.addEventListener('keydown', (e) =>
            {
                if (e.key === 'Enter')
                {
                    this.checkSearchSubmit(e);
                }
            });
        }

        // Monitor search forms
        const searchForms = document.querySelectorAll('form[action*="search"]');
        searchForms.forEach(form =>
        {
            form.addEventListener('submit', (e) => this.checkSearchSubmit(e));
        });
    }

    interceptBingSearch()
    {
        const searchInput = document.querySelector('input[name="q"]');
        if (searchInput)
        {
            searchInput.addEventListener('input', (e) => this.checkSearchInput(e.target));
            searchInput.addEventListener('keydown', (e) =>
            {
                if (e.key === 'Enter')
                {
                    this.checkSearchSubmit(e);
                }
            });
        }
    }

    interceptDuckDuckGoSearch()
    {
        const searchInput = document.querySelector('input[name="q"]');
        if (searchInput)
        {
            searchInput.addEventListener('input', (e) => this.checkSearchInput(e.target));
            searchInput.addEventListener('keydown', (e) =>
            {
                if (e.key === 'Enter')
                {
                    this.checkSearchSubmit(e);
                }
            });
        }
    }

    interceptYouTubeSearch()
    {
        const searchInput = document.querySelector('input#search');
        if (searchInput)
        {
            searchInput.addEventListener('input', (e) => this.checkSearchInput(e.target));
            searchInput.addEventListener('keydown', (e) =>
            {
                if (e.key === 'Enter')
                {
                    this.checkSearchSubmit(e);
                }
            });
        }
    }

    interceptGenericSearch()
    {
        // Generic search input detection
        const searchInputs = document.querySelectorAll('input[type="search"], input[name*="search"], input[name*="query"], input[name="q"]');
        searchInputs.forEach(input =>
        {
            input.addEventListener('input', (e) => this.checkSearchInput(e.target));
            input.addEventListener('keydown', (e) =>
            {
                if (e.key === 'Enter')
                {
                    this.checkSearchSubmit(e);
                }
            });
        });
    }

    checkSearchInput(input)
    {
        const blockedKeyword = this.containsBlockedKeywords(input.value);
        if (blockedKeyword)
        {
            input.style.border = '2px solid #ff4444';
            input.style.backgroundColor = '#ffe6e6';

            // Show warning tooltip
            this.showWarningTooltip(input, `Blocked keyword: "${blockedKeyword}"`);
        } else
        {
            input.style.border = '';
            input.style.backgroundColor = '';
            this.hideWarningTooltip();
        }
    }

    checkSearchSubmit(event)
    {
        const form = event.target.closest ? event.target.closest('form') : event.target.form || event.target;
        const inputs = form.querySelectorAll('input[type="search"], input[name*="search"], input[name*="query"], input[name="q"]');

        for (const input of inputs)
        {
            const blockedKeyword = this.containsBlockedKeywords(input.value);
            if (blockedKeyword)
            {
                event.preventDefault();
                event.stopPropagation();

                // Redirect to blocked page
                const blockedUrl = chrome.runtime.getURL('blocked.html') +
                    '?reason=search&keyword=' + encodeURIComponent(blockedKeyword) +
                    '&query=' + encodeURIComponent(input.value);

                window.location.href = blockedUrl;
                return false;
            }
        }
    }

    showWarningTooltip(element, message)
    {
        this.hideWarningTooltip();

        const tooltip = document.createElement('div');
        tooltip.id = 'focus-guard-tooltip';
        tooltip.innerHTML = message;
        tooltip.style.cssText = `
      position: absolute;
      background: #ff4444;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
      pointer-events: none;
      white-space: nowrap;
    `;

        document.body.appendChild(tooltip);

        const rect = element.getBoundingClientRect();
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.bottom + 5) + 'px';
    }

    hideWarningTooltip()
    {
        const tooltip = document.getElementById('focus-guard-tooltip');
        if (tooltip)
        {
            tooltip.remove();
        }
    }

    setupKeywordHighlighting()
    {
        // Highlight blocked keywords in search results
        const observer = new MutationObserver((mutations) =>
        {
            mutations.forEach((mutation) =>
            {
                mutation.addedNodes.forEach((node) =>
                {
                    if (node.nodeType === Node.ELEMENT_NODE)
                    {
                        this.highlightBlockedContent(node);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial highlighting
        this.highlightBlockedContent(document.body);
    }

    highlightBlockedContent(element)
    {
        if (!this.isActive) return;

        const textNodes = this.getTextNodes(element);
        textNodes.forEach(node =>
        {
            for (const keyword of this.blockedKeywords)
            {
                if (node.textContent.toLowerCase().includes(keyword.toLowerCase()))
                {
                    const parent = node.parentNode;
                    if (parent && !parent.classList.contains('focus-guard-flagged'))
                    {
                        parent.classList.add('focus-guard-flagged');
                        parent.style.cssText += `
              background-color: #ffe6e6 !important;
              border-left: 3px solid #ff4444 !important;
              opacity: 0.5 !important;
            `;
                    }
                }
            }
        });
    }

    getTextNodes(element)
    {
        const textNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode())
        {
            textNodes.push(node);
        }

        return textNodes;
    }
}

// Initialize the search filter
let searchFilter;

function initializeSearchFilter()
{
    try
    {
        console.log('Initializing search filter...');

        if (!searchFilter)
        {
            searchFilter = new SearchFilter();
            console.log('Search filter initialized successfully');
        }
    } catch (error)
    {
        console.error('Failed to initialize search filter:', error);
    }
}

if (document.readyState === 'loading')
{
    document.addEventListener('DOMContentLoaded', initializeSearchFilter);
} else
{
    initializeSearchFilter();
}