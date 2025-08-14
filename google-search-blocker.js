// Google Search Results Blocker - runs immediately on search result pages

console.log('🔍 Google search blocker script loaded at:', new Date().toISOString());
console.log('🔍 Current URL:', window.location.href);
console.log('🔍 Document ready state:', document.readyState);

// Immediately check the URL before anything else loads
(function immediateURLCheck()
{
    console.log('🔍 Running immediate URL check...');

    // Check if this is a Google search results page
    if (!window.location.hostname.includes('google.com'))
    {
        console.log('❌ Not a Google domain, skipping');
        return;
    }

    if (!window.location.pathname.includes('/search') && !window.location.search.includes('q='))
    {
        console.log('❌ Not a search page, skipping');
        return;
    }

    // Extract search query from URL
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('q');

    if (!searchQuery)
    {
        console.log('❌ No search query found in URL');
        return;
    }

    console.log('🔍 Found search query:', searchQuery);

    // Hardcoded keywords for immediate checking (will be replaced with storage data when available)
    const defaultKeywords = ['porn', 'xxx', 'sex', 'adult', 'nude', 'naked', 'explicit', 'erotic'];

    // Check against hardcoded keywords first (immediate protection)
    const lowerQuery = searchQuery.toLowerCase();
    for (const keyword of defaultKeywords)
    {
        if (lowerQuery.includes(keyword))
        {
            console.log('🚫 IMMEDIATE BLOCK - Found keyword:', keyword);

            // Stop everything immediately
            if (window.stop) window.stop();
            if (document.execCommand)
            {
                try { document.execCommand('Stop'); } catch (e) { }
            }

            // Redirect immediately
            const blockedUrl = chrome.runtime.getURL('blocked.html') +
                '?reason=search&keyword=' + encodeURIComponent(keyword) +
                '&query=' + encodeURIComponent(searchQuery);

            console.log('🚫 Redirecting to:', blockedUrl);
            window.location.replace(blockedUrl);
            return;
        }
    }

    console.log('✅ No blocked keywords found in immediate check');
})();

// Async function to check with stored keywords
(async function asyncKeywordCheck()
{
    try
    {
        console.log('🔍 Loading stored keywords...');

        const data = await chrome.storage.local.get(['blockedKeywords', 'isActive']);
        const blockedKeywords = new Set(data.blockedKeywords || []);
        const isActive = data.isActive !== undefined ? data.isActive : true;

        console.log('🔍 Loaded keywords count:', blockedKeywords.size);
        console.log('🔍 Blocking active:', isActive);
        console.log('🔍 Keywords:', Array.from(blockedKeywords));

        if (!isActive)
        {
            console.log('❌ Blocking is disabled');
            return;
        }

        if (blockedKeywords.size === 0)
        {
            console.log('❌ No keywords configured');
            return;
        }

        // Check URL parameters again with stored keywords
        const urlParams = new URLSearchParams(window.location.search);
        const searchQuery = urlParams.get('q');

        if (searchQuery)
        {
            console.log('🔍 Checking stored keywords against query:', searchQuery);

            const lowerQuery = searchQuery.toLowerCase();
            for (const keyword of blockedKeywords)
            {
                if (lowerQuery.includes(keyword.toLowerCase()))
                {
                    console.log('🚫 STORED KEYWORDS BLOCK - Found keyword:', keyword);

                    // Stop page loading
                    if (window.stop) window.stop();

                    const blockedUrl = chrome.runtime.getURL('blocked.html') +
                        '?reason=search&keyword=' + encodeURIComponent(keyword) +
                        '&query=' + encodeURIComponent(searchQuery);

                    window.location.replace(blockedUrl);
                    return;
                }
            }

            console.log('✅ No stored keywords matched');
        }
    } catch (error)
    {
        console.error('❌ Error in async keyword check:', error);
    }
})();

// Monitor for any navigation attempts
let navigationBlocked = false;

function blockNavigation()
{
    if (navigationBlocked) return;

    console.log('🔍 Setting up navigation blocking...');

    // Override window.location
    const originalLocation = window.location;

    // Monitor beforeunload
    window.addEventListener('beforeunload', function (e)
    {
        console.log('🔍 Before unload triggered');

        const currentURL = window.location.href;
        if (currentURL.includes('/search') && currentURL.includes('q='))
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
                        console.log('🚫 Blocking navigation on beforeunload');
                        e.preventDefault();
                        e.returnValue = 'Content blocked by Focus Guard';
                        return 'Content blocked by Focus Guard';
                    }
                }
            }
        }
    }, true);

    navigationBlocked = true;
}

// Set up navigation blocking immediately
blockNavigation();

// Additional checks at different stages
document.addEventListener('DOMContentLoaded', function ()
{
    console.log('🔍 DOM Content Loaded - running additional checks');
    asyncKeywordCheck();
});

// Check after a delay to catch any missed navigation
setTimeout(() =>
{
    console.log('🔍 Delayed check running...');
    asyncKeywordCheck();
}, 100);

setTimeout(() =>
{
    console.log('🔍 Final delayed check running...');
    asyncKeywordCheck();
}, 500);