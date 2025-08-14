// background.js - Updated with Hybrid Authentication Approach
// Import Supabase client
importScripts('supabase-client.js');

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

        // Authentication state
        this.authRequired = true;
        this.isAuthenticated = false;
        this.authCheckCompleted = false;

        // Initialize Supabase client
        this.supabase = new SupabaseClient();

        this.init();
    }

    async init()
    {
        console.log('🚀 Initializing Fokus Extension...');

        // Setup install/startup handlers first
        this.setupAuthenticationFlow();

        await this.loadSettings();
        await this.initializeSupabase();
        await this.checkAuthenticationStatus();

        // Only start blocking after auth check
        if (this.isAuthenticated || await this.checkSkipAuth())
        {
            await this.startNormalOperation();
        } else
        {
            console.log('⏸️ Extension paused - authentication required');
        }
    }

    setupAuthenticationFlow()
    {
        // Handle extension install
        chrome.runtime.onInstalled.addListener(async (details) =>
        {
            console.log('📦 Extension installed/updated:', details.reason);

            if (details.reason === 'install')
            {
                // Show welcome screen with auth prompt immediately
                await this.showAuthenticationRequired('install');
            } else if (details.reason === 'update')
            {
                // Check if user was authenticated before update
                const data = await chrome.storage.local.get(['wasAuthenticated']);
                if (data.wasAuthenticated && !this.supabase.isAuthenticated())
                {
                    await this.showAuthenticationRequired('update');
                }
            }
        });

        // Handle browser startup
        chrome.runtime.onStartup.addListener(async () =>
        {
            console.log('🔄 Browser startup detected');
            await this.checkAuthenticationStatus();

            if (!this.isAuthenticated)
            {
                setTimeout(() =>
                {
                    this.showAuthenticationRequired('startup');
                }, 2000); // Small delay to let browser settle
            }
        });
    }

    async checkAuthenticationStatus()
    {
        try
        {
            const initialized = await this.supabase.init();
            if (initialized && this.supabase.isAuthenticated())
            {
                this.isAuthenticated = true;
                await chrome.storage.local.set({ wasAuthenticated: true });
                console.log('✅ User authenticated:', this.supabase.getCurrentUser()?.email);
            } else
            {
                this.isAuthenticated = false;
                await chrome.storage.local.set({ wasAuthenticated: false });
                console.log('❌ User not authenticated');
            }
            this.authCheckCompleted = true;
        } catch (error)
        {
            console.error('Auth check failed:', error);
            this.authCheckCompleted = true;
        }
    }

    async checkSkipAuth()
    {
        // Allow skipping auth in development or if explicitly set
        const data = await chrome.storage.local.get(['skipAuthForTesting', 'allowOfflineMode']);
        return data.skipAuthForTesting || data.allowOfflineMode;
    }

    async showAuthenticationRequired(reason = 'general')
    {
        const authUrl = chrome.runtime.getURL('auth-required.html') + `?reason=${reason}`;

        try
        {
            // Create new tab for authentication
            const tab = await chrome.tabs.create({
                url: authUrl,
                active: true
            });

            console.log(`🔐 Authentication required (${reason}) - opened tab:`, tab.id);

            // Store auth tab ID to prevent multiple opens
            await chrome.storage.local.set({ authTabId: tab.id });

        } catch (error)
        {
            console.error('Failed to open auth tab:', error);
        }
    }

    async startNormalOperation()
    {
        console.log('▶️ Starting normal extension operation...');

        await this.updateBlocklist();
        this.setupRequestInterceptor();
        this.setupTabUpdatedListener();

        // Setup auto-sync if authenticated
        if (this.isAuthenticated)
        {
            await this.supabase.setupAutoSync();

            // Sync from cloud on startup
            try
            {
                const result = await this.supabase.syncFromCloud();
                console.log('Startup sync result:', result);

                if (result.action === 'downloaded')
                {
                    await this.loadSettings();
                }
            } catch (error)
            {
                console.error('Startup sync failed:', error);
            }
        }

        // Update blocklist periodically
        setInterval(() => this.updateBlocklist(), this.githubUpdateInterval);

        console.log('✅ Extension fully operational');
    }

    async initializeSupabase()
    {
        try
        {
            const initialized = await this.supabase.init();
            if (initialized)
            {
                console.log('☁️ Supabase initialized successfully');
                return true;
            } else
            {
                console.log('⚠️ Supabase not configured - offline mode');
                return false;
            }
        } catch (error)
        {
            console.error('Failed to initialize Supabase:', error);
            return false;
        }
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

        // Set default PIN if none exists (always local)
        if (!data.pin)
        {
            const defaultPin = '1234';
            await chrome.storage.local.set({ pin: defaultPin });
            console.log('🔑 Default PIN set:', defaultPin);
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

    // Enhanced blocking methods with auth checks
    async isDomainBlocked(hostname)
    {
        // If auth required but not authenticated, redirect to auth
        if (this.authRequired && !this.isAuthenticated && this.authCheckCompleted)
        {
            return 'auth-required';
        }

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
        // If auth required but not authenticated, return blocked
        if (this.authRequired && !this.isAuthenticated && this.authCheckCompleted)
        {
            return true;
        }

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

    setupTabUpdatedListener()
    {
        // Monitor tab updates for domain blocking
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) =>
        {
            if (changeInfo.status === 'loading' && tab.url)
            {
                try
                {
                    const url = new URL(tab.url);

                    // Skip extension pages
                    if (url.protocol === 'chrome-extension:') return;

                    const blockResult = await this.isDomainBlocked(url.hostname);

                    // Handle auth required
                    if (blockResult === 'auth-required')
                    {
                        const authUrl = chrome.runtime.getURL('auth-required.html') + '?reason=blocking';
                        chrome.tabs.update(tabId, { url: authUrl });
                        return;
                    }

                    // Check for Google search URLs specifically
                    if (url.hostname.includes('google.com') && url.pathname.includes('/search'))
                    {
                        const searchQuery = url.searchParams.get('q');
                        if (searchQuery && await this.containsBlockedKeywords(searchQuery))
                        {
                            console.log('Background: Blocking Google search for:', searchQuery);
                            const blockedUrl = chrome.runtime.getURL('blocked.html') +
                                '?reason=search&keyword=' + encodeURIComponent(searchQuery) +
                                '&query=' + encodeURIComponent(searchQuery);
                            chrome.tabs.update(tabId, { url: blockedUrl });
                            this.incrementBlockCount();
                            return;
                        }
                    }

                    // Regular domain blocking
                    if (blockResult === true)
                    {
                        const blockedUrl = chrome.runtime.getURL('blocked.html') +
                            '?domain=' + encodeURIComponent(url.hostname);
                        chrome.tabs.update(tabId, { url: blockedUrl });
                        this.incrementBlockCount();
                    }
                } catch (error)
                {
                    // Ignore invalid URLs
                }
            }
        });

        // Monitor tab creation for immediate blocking
        chrome.tabs.onCreated.addListener(async (tab) =>
        {
            if (tab.url)
            {
                try
                {
                    const url = new URL(tab.url);

                    // Skip extension pages
                    if (url.protocol === 'chrome-extension:') return;

                    const blockResult = await this.isDomainBlocked(url.hostname);

                    // Handle auth required
                    if (blockResult === 'auth-required')
                    {
                        const authUrl = chrome.runtime.getURL('auth-required.html') + '?reason=blocking';
                        chrome.tabs.update(tab.id, { url: authUrl });
                        return;
                    }

                    // Check for Google search URLs
                    if (url.hostname.includes('google.com') && url.pathname.includes('/search'))
                    {
                        const searchQuery = url.searchParams.get('q');
                        if (searchQuery && await this.containsBlockedKeywords(searchQuery))
                        {
                            console.log('Background: Blocking new Google search tab for:', searchQuery);
                            const blockedUrl = chrome.runtime.getURL('blocked.html') +
                                '?reason=search&keyword=' + encodeURIComponent(searchQuery) +
                                '&query=' + encodeURIComponent(searchQuery);
                            chrome.tabs.update(tab.id, { url: blockedUrl });
                            this.incrementBlockCount();
                            return;
                        }
                    }

                    if (blockResult === true)
                    {
                        const blockedUrl = chrome.runtime.getURL('blocked.html') +
                            '?domain=' + encodeURIComponent(url.hostname);
                        chrome.tabs.update(tab.id, { url: blockedUrl });
                        this.incrementBlockCount();
                    }
                } catch (error)
                {
                    // Ignore invalid URLs
                }
            }
        });

        // Monitor navigation attempts
        chrome.webNavigation.onBeforeNavigate.addListener(async (details) =>
        {
            if (details.frameId === 0)
            { // Main frame only
                try
                {
                    const url = new URL(details.url);

                    // Skip extension pages
                    if (url.protocol === 'chrome-extension:') return;

                    const blockResult = await this.isDomainBlocked(url.hostname);

                    // Handle auth required
                    if (blockResult === 'auth-required')
                    {
                        const authUrl = chrome.runtime.getURL('auth-required.html') + '?reason=blocking';
                        chrome.tabs.update(details.tabId, { url: authUrl });
                        return;
                    }

                    // Check for Google search URLs
                    if (url.hostname.includes('google.com') && url.pathname.includes('/search'))
                    {
                        const searchQuery = url.searchParams.get('q');
                        if (searchQuery && await this.containsBlockedKeywords(searchQuery))
                        {
                            console.log('Background: Blocking navigation to Google search for:', searchQuery);
                            const blockedUrl = chrome.runtime.getURL('blocked.html') +
                                '?reason=search&keyword=' + encodeURIComponent(searchQuery) +
                                '&query=' + encodeURIComponent(searchQuery);
                            chrome.tabs.update(details.tabId, { url: blockedUrl });
                            this.incrementBlockCount();
                            return;
                        }
                    }

                    if (blockResult === true)
                    {
                        const blockedUrl = chrome.runtime.getURL('blocked.html') +
                            '?domain=' + encodeURIComponent(url.hostname);
                        chrome.tabs.update(details.tabId, { url: blockedUrl });
                        this.incrementBlockCount();
                    }
                } catch (error)
                {
                    // Ignore invalid URLs
                }
            }
        });
    }

    // Method to enable offline mode temporarily
    async enableOfflineMode(duration = 3600000)
    { // 1 hour default
        await chrome.storage.local.set({
            allowOfflineMode: true,
            offlineModeExpiry: Date.now() + duration
        });

        this.isAuthenticated = true; // Temporary override
        await this.startNormalOperation();

        console.log('⚠️ Offline mode enabled for', duration / 60000, 'minutes');
    }

    // Method to handle successful authentication
    async onAuthenticationSuccess(user)
    {
        console.log('🎉 Authentication successful:', user.email);

        this.isAuthenticated = true;
        await chrome.storage.local.set({ wasAuthenticated: true });

        // Close any auth tabs
        const data = await chrome.storage.local.get(['authTabId']);
        if (data.authTabId)
        {
            try
            {
                await chrome.tabs.remove(data.authTabId);
            } catch (error)
            {
                // Tab might already be closed
            }
            await chrome.storage.local.remove(['authTabId']);
        }

        // Start normal operation
        await this.startNormalOperation();

        // Load settings from cloud
        try
        {
            const result = await this.supabase.syncFromCloud();
            if (result.action === 'downloaded')
            {
                await this.loadSettings();
            }
        } catch (error)
        {
            console.error('Failed to sync from cloud after auth:', error);
        }
    }

    // Enhanced authentication handling methods
    async signInUser(email, password)
    {
        try
        {
            const result = await this.supabase.signIn(email, password);

            if (result.success)
            {
                await this.onAuthenticationSuccess(result.user);
            }

            return result;
        } catch (error)
        {
            console.error('Failed to sign in user:', error);
            throw error;
        }
    }

    async signUpUser(email, password)
    {
        try
        {
            const result = await this.supabase.signUp(email, password);

            if (result.success && result.user && !result.needsConfirmation)
            {
                await this.onAuthenticationSuccess(result.user);
            }

            return result;
        } catch (error)
        {
            console.error('Failed to sign up user:', error);
            throw error;
        }
    }

    async signOutUser()
    {
        try
        {
            const result = await this.supabase.signOut();

            if (result.success)
            {
                this.isAuthenticated = false;
                await chrome.storage.local.set({ wasAuthenticated: false });

                // Show auth required after sign out
                setTimeout(() =>
                {
                    this.showAuthenticationRequired('signout');
                }, 1000);
            }

            return result;
        } catch (error)
        {
            console.error('Failed to sign out user:', error);
            throw error;
        }
    }

    // Rest of the methods remain the same as previous implementation
    // ... (keeping all the existing sync, blocking, and utility methods)

    setupRequestInterceptor()
    {
        console.log('Setting up non-blocking request monitoring...');
    }

    async updateBlocklist()
    {
        // Only update if authenticated or in offline mode
        if (!this.isAuthenticated && !(await this.checkSkipAuth()))
        {
            console.log('⏸️ Skipping blocklist update - authentication required');
            return;
        }

        const now = Date.now();
        if (now - this.lastGithubUpdate < this.githubUpdateInterval)
        {
            return;
        }

        try
        {
            console.log('🔄 Updating blocklist...');
            // ... existing updateBlocklist implementation
        } catch (error)
        {
            console.error('Failed to update blocklist:', error);
        }
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

            // Sync stats to cloud if authenticated
            if (this.isAuthenticated)
            {
                clearTimeout(this.statsyncTimeout);
                this.statsyncTimeout = setTimeout(async () =>
                {
                    try
                    {
                        await this.supabase.syncToCloud();
                    } catch (error)
                    {
                        console.error('Failed to sync stats to cloud:', error);
                    }
                }, 5000);
            }
        } catch (error)
        {
            console.error('Failed to increment block count:', error);
        }
    }

    // All other existing methods remain the same
    // ... (keeping existing implementation for brevity)
}

// Initialize the content blocker
let contentBlocker;

try
{
    console.log('🚀 Initializing Fokus content blocker...');
    contentBlocker = new ContentBlocker();
    console.log('✅ Content blocker initialized successfully');
} catch (error)
{
    console.error('❌ Failed to initialize content blocker:', error);

    // Create a minimal fallback
    contentBlocker = {
        async addCustomDomain() { return { success: false, error: 'Service unavailable' }; },
        async addKeyword() { return { success: false, error: 'Service unavailable' }; },
        async removeKeyword() { return { success: false, error: 'Service unavailable' }; },
        async setActive() { return { success: false, error: 'Service unavailable' }; },
        async updateBlocklist() { return { success: false, error: 'Service unavailable' }; },
        getDefaultBlocklistUrls() { return []; }
    };
}

// Enhanced message handling with authentication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
{
    console.log('📨 Background received message:', message);

    (async () =>
    {
        try
        {
            switch (message.action)
            {
                // Authentication-specific actions
                case 'checkAuthStatus':
                    sendResponse({
                        isAuthenticated: contentBlocker.isAuthenticated,
                        authCheckCompleted: contentBlocker.authCheckCompleted,
                        user: contentBlocker.supabase?.getCurrentUser()
                    });
                    break;

                case 'enableOfflineMode':
                    await contentBlocker.enableOfflineMode(message.duration);
                    sendResponse({ success: true });
                    break;

                case 'authSuccess':
                    await contentBlocker.onAuthenticationSuccess(message.user);
                    sendResponse({ success: true });
                    break;

                // Enhanced existing actions
                case 'signIn':
                    const signInResult = await contentBlocker.signInUser(message.email, message.password);
                    sendResponse(signInResult);
                    break;

                case 'signUp':
                    const signUpResult = await contentBlocker.signUpUser(message.email, message.password);
                    sendResponse(signUpResult);
                    break;

                case 'signOut':
                    const signOutResult = await contentBlocker.signOutUser();
                    sendResponse(signOutResult);
                    break;

                // All existing actions remain the same
                case 'getCurrentTab':
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    sendResponse({ url: tab.url });
                    break;

                // ... (all other existing message handlers)

                default:
                    console.log('❓ Unknown action:', message.action);
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error)
        {
            console.error('💥 Message handling error:', error);
            sendResponse({ error: error.message });
        }
    })();

    return true; // Indicates we will send response asynchronously
});