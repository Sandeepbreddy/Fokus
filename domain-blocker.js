// Domain blocker content script - runs on all websites

class DomainBlocker
{
    constructor()
    {
        this.blockedDomains = new Set();
        this.customDomains = new Set();
        this.blockedKeywords = new Set();
        this.isActive = true;
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
        this.setupNavigationMonitoring();
    }

    async loadSettings()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blockedDomains', 'customDomains', 'blockedKeywords', 'isActive'
            ]);

            this.blockedDomains = new Set(data.blockedDomains || []);
            this.customDomains = new Set(data.customDomains || []);
            this.blockedKeywords = new Set(data.blockedKeywords || []);
            this.isActive = data.isActive !== undefined ? data.isActive : true;
        } catch (error)
        {
            console.log('Failed to load domain blocker settings:', error);
        }
    }

    checkCurrentPage()
    {
        if (!this.isActive) return;

        const hostname = window.location.hostname;
        const fullUrl = window.location.href;

        // Check if current domain should be blocked
        if (this.isDomainBlocked(hostname))
        {
            this.redirectToBlockedPage('domain', hostname);
            return;
        }

        // Check if current URL contains blocked keywords
        if (this.containsBlockedKeywords(fullUrl))
        {
            this.redirectToBlockedPage('keyword', null, fullUrl);
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

    redirectToBlockedPage(reason, domain = null, url = null)
    {
        let blockedUrl = chrome.runtime.getURL('blocked.html') + '?reason=' + reason;

        if (domain)
        {
            blockedUrl += '&domain=' + encodeURIComponent(domain);
        }

        if (url)
        {
            blockedUrl += '&url=' + encodeURIComponent(url);
        }

        // Use replace to prevent back button issues
        window.location.replace(blockedUrl);
    }

    setupNavigationMonitoring()
    {
        // Monitor for dynamic navigation (SPA apps)
        let lastUrl = location.href;

        const checkForChanges = () =>
        {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl)
            {
                lastUrl = currentUrl;
                setTimeout(() => this.checkCurrentPage(), 100);
            }
        };

        // Monitor DOM changes for SPA navigation
        const observer = new MutationObserver(checkForChanges);
        observer.observe(document, { subtree: true, childList: true });

        // Monitor history API
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function ()
        {
            originalPushState.apply(history, arguments);
            setTimeout(() => domainBlocker.checkCurrentPage(), 100);
        };

        history.replaceState = function ()
        {
            originalReplaceState.apply(history, arguments);
            setTimeout(() => domainBlocker.checkCurrentPage(), 100);
        };

        // Monitor popstate events
        window.addEventListener('popstate', () =>
        {
            setTimeout(() => this.checkCurrentPage(), 100);
        });

        // Monitor click events for potential navigation
        document.addEventListener('click', (e) =>
        {
            // Check if clicked element is a link
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

        // Monitor form submissions (search forms, etc.)
        document.addEventListener('submit', (e) =>
        {
            const form = e.target;
            if (form.action)
            {
                try
                {
                    const url = new URL(form.action, window.location.href);
                    if (this.isDomainBlocked(url.hostname))
                    {
                        e.preventDefault();
                        e.stopPropagation();
                        this.redirectToBlockedPage('domain', url.hostname, form.action);
                    }
                } catch (error)
                {
                    // Invalid URL, ignore
                }
            }
        }, true);
    }
}

// Initialize domain blocker
let domainBlocker;

function initializeDomainBlocker()
{
    try
    {
        console.log('Initializing domain blocker...');

        // Skip if already on blocked page or extension pages
        if (window.location.href.includes('chrome-extension://') ||
            window.location.href.includes('moz-extension://') ||
            window.location.href.includes('blocked.html'))
        {
            console.log('Skipping domain blocker on extension page');
            return;
        }

        if (!domainBlocker)
        {
            domainBlocker = new DomainBlocker();
            console.log('Domain blocker initialized successfully');
        }
    } catch (error)
    {
        console.error('Failed to initialize domain blocker:', error);
    }
}

if (document.readyState === 'loading')
{
    document.addEventListener('DOMContentLoaded', initializeDomainBlocker);
} else
{
    initializeDomainBlocker();
}

// Handle immediate execution for very fast page loads
setTimeout(() =>
{
    if (!domainBlocker)
    {
        initializeDomainBlocker();
    }
}, 50);