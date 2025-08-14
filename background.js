// background.js - Complete rewrite with robust error handling

console.log('🚀 Fokus Extension - Background Script Starting...');

// ============ SUPABASE CLIENT CLASS ============
class SupabaseClient
{
    constructor()
    {
        this.supabaseUrl = null;
        this.supabaseKey = null;
        this.headers = {};
        this.currentUser = null;
        this.isInitialized = false;
        this.config = null;
    }

    async init()
    {
        if (this.isInitialized) return true;

        try
        {
            console.log('🔄 Initializing Supabase client...');

            // Load config
            const configUrl = chrome.runtime.getURL('config.json');
            const response = await fetch(configUrl);

            if (!response.ok)
            {
                throw new Error('Config file not found');
            }

            this.config = await response.json();

            if (!this.config?.supabase?.url || !this.config?.supabase?.anonKey)
            {
                throw new Error('Invalid Supabase configuration');
            }

            this.supabaseUrl = this.config.supabase.url;
            this.supabaseKey = this.config.supabase.anonKey;
            this.headers = {
                'apikey': this.supabaseKey,
                'Authorization': `Bearer ${this.supabaseKey}`,
                'Content-Type': 'application/json'
            };

            // Check for stored session
            const session = await this.getStoredSession();
            if (session?.access_token)
            {
                this.currentUser = session.user;
                this.headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            this.isInitialized = true;
            console.log('✅ Supabase client initialized');
            return true;
        } catch (error)
        {
            console.error('❌ Supabase initialization failed:', error);
            return false;
        }
    }

    async makeRequest(method, endpoint, body = null)
    {
        if (!this.isInitialized)
        {
            throw new Error('Supabase client not initialized');
        }

        const url = `${this.supabaseUrl}/rest/v1/${endpoint}`;
        const options = {
            method,
            headers: { ...this.headers }
        };

        if (body)
        {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (!response.ok)
        {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} - ${errorText}`);
        }

        return response.json();
    }

    async signUp(email, password)
    {
        if (!this.isInitialized)
        {
            throw new Error('Supabase client not initialized');
        }

        const response = await fetch(`${this.supabaseUrl}/auth/v1/signup`, {
            method: 'POST',
            headers: {
                'apikey': this.supabaseKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok)
        {
            throw new Error(data.msg || data.message || 'Sign up failed');
        }

        if (data.user)
        {
            this.currentUser = data.user;
            if (data.session)
            {
                await this.storeSession(data.session);
                this.headers['Authorization'] = `Bearer ${data.session.access_token}`;
            }
        }

        return {
            success: true,
            user: data.user,
            needsConfirmation: !data.session
        };
    }

    async signIn(email, password)
    {
        if (!this.isInitialized)
        {
            throw new Error('Supabase client not initialized');
        }

        const response = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                'apikey': this.supabaseKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok)
        {
            throw new Error(data.msg || data.message || 'Invalid credentials');
        }

        this.currentUser = data.user;
        const session = data.session || data;
        await this.storeSession(session);
        this.headers['Authorization'] = `Bearer ${session.access_token}`;

        return { success: true, user: data.user };
    }

    async signOut()
    {
        if (this.isInitialized && this.currentUser)
        {
            try
            {
                await fetch(`${this.supabaseUrl}/auth/v1/logout`, {
                    method: 'POST',
                    headers: this.headers
                });
            } catch (error)
            {
                console.warn('Sign out API call failed, continuing with local sign out');
            }
        }

        this.currentUser = null;
        this.headers['Authorization'] = `Bearer ${this.supabaseKey}`;
        await this.clearStoredSession();
        return { success: true };
    }

    async storeSession(session)
    {
        await chrome.storage.local.set({
            supabaseSession: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                user: session.user,
                expires_at: session.expires_at
            }
        });
    }

    async getStoredSession()
    {
        const data = await chrome.storage.local.get(['supabaseSession']);
        return data.supabaseSession;
    }

    async clearStoredSession()
    {
        await chrome.storage.local.remove(['supabaseSession']);
    }

    isAuthenticated()
    {
        return !!this.currentUser;
    }

    getCurrentUser()
    {
        return this.currentUser;
    }

    async getConnectionStatus()
    {
        if (!this.isInitialized)
        {
            return { connected: false, reason: 'Not initialized' };
        }

        try
        {
            const testUrl = `${this.supabaseUrl}/rest/v1/user_profiles?limit=1`;
            const response = await fetch(testUrl, {
                method: 'HEAD',
                headers: this.headers
            });

            return {
                connected: response.ok,
                project: this.config?.supabase?.projectName || 'Fokus',
                reason: response.ok ? 'Connected' : `HTTP ${response.status}`
            };
        } catch (error)
        {
            return { connected: false, reason: error.message };
        }
    }
}

// ============ CONTENT BLOCKER CLASS ============
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

        // Authentication
        this.isAuthenticated = false;
        this.authCheckCompleted = false;

        // Initialize Supabase
        this.supabase = new SupabaseClient();

        this.init();
    }

    async init()
    {
        console.log('🔧 Initializing Content Blocker...');

        try
        {
            // Load basic settings first
            await this.loadSettings();

            // Setup event handlers
            this.setupEventHandlers();

            // Initialize Supabase (don't block on this)
            this.initializeSupabase();

            // Start basic blocking functionality
            this.setupBlocking();

            console.log('✅ Content Blocker initialized');
        } catch (error)
        {
            console.error('❌ Content Blocker initialization failed:', error);
        }
    }

    async initializeSupabase()
    {
        try
        {
            const initialized = await this.supabase.init();
            if (initialized)
            {
                console.log('☁️ Supabase available');
                await this.checkAuthenticationStatus();

                // Show auth screen on first install
                const data = await chrome.storage.local.get(['hasShownAuth']);
                if (!data.hasShownAuth)
                {
                    await this.showAuthenticationRequired('install');
                    await chrome.storage.local.set({ hasShownAuth: true });
                }
            } else
            {
                console.log('⚠️ Supabase not available - offline mode');
                this.isAuthenticated = true; // Allow offline usage
            }
            this.authCheckCompleted = true;
        } catch (error)
        {
            console.error('❌ Supabase initialization error:', error);
            this.isAuthenticated = true; // Allow offline usage
            this.authCheckCompleted = true;
        }
    }

    async checkAuthenticationStatus()
    {
        try
        {
            if (this.supabase.isAuthenticated())
            {
                this.isAuthenticated = true;
                console.log('✅ User authenticated:', this.supabase.getCurrentUser()?.email);
            } else
            {
                this.isAuthenticated = false;
                console.log('❌ User not authenticated');
            }
        } catch (error)
        {
            console.error('❌ Auth check failed:', error);
            this.isAuthenticated = false;
        }
    }

    setupEventHandlers()
    {
        // Handle extension install/update
        chrome.runtime.onInstalled.addListener(async (details) =>
        {
            console.log('📦 Extension event:', details.reason);

            if (details.reason === 'install')
            {
                console.log('🎉 First time install');
            }
        });

        // Handle browser startup
        chrome.runtime.onStartup.addListener(() =>
        {
            console.log('🔄 Browser startup');
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

            console.log('✅ Settings loaded');
        } catch (error)
        {
            console.error('❌ Failed to load settings:', error);
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
            console.error('❌ Failed to increment block count:', error);
        }
    }

    async showAuthenticationRequired(reason = 'general')
    {
        try
        {
            const authUrl = chrome.runtime.getURL('auth-required.html') + `?reason=${reason}`;
            await chrome.tabs.create({ url: authUrl, active: true });
        } catch (error)
        {
            console.error('❌ Failed to show auth screen:', error);
        }
    }

    // ============ API METHODS ============

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

    // ============ AUTH METHODS ============

    async signUp(email, password)
    {
        try
        {
            if (!this.supabase.isInitialized)
            {
                await this.supabase.init();
            }

            const result = await this.supabase.signUp(email, password);

            if (result.success && result.user && !result.needsConfirmation)
            {
                this.isAuthenticated = true;
                await chrome.storage.local.set({ wasAuthenticated: true });
            }

            return result;
        } catch (error)
        {
            console.error('❌ Sign up failed:', error);
            return { success: false, error: error.message };
        }
    }

    async signIn(email, password)
    {
        try
        {
            if (!this.supabase.isInitialized)
            {
                await this.supabase.init();
            }

            const result = await this.supabase.signIn(email, password);

            if (result.success)
            {
                this.isAuthenticated = true;
                await chrome.storage.local.set({ wasAuthenticated: true });
            }

            return result;
        } catch (error)
        {
            console.error('❌ Sign in failed:', error);
            return { success: false, error: error.message };
        }
    }

    async signOut()
    {
        try
        {
            if (this.supabase.isInitialized)
            {
                await this.supabase.signOut();
            }

            this.isAuthenticated = false;
            await chrome.storage.local.set({ wasAuthenticated: false });

            return { success: true };
        } catch (error)
        {
            console.error('❌ Sign out failed:', error);
            // Always succeed locally
            this.isAuthenticated = false;
            await chrome.storage.local.set({ wasAuthenticated: false });
            return { success: true };
        }
    }

    async enableOfflineMode(duration = 3600000)
    {
        try
        {
            await chrome.storage.local.set({
                allowOfflineMode: true,
                offlineModeExpiry: Date.now() + duration
            });

            this.isAuthenticated = true;

            return { success: true };
        } catch (error)
        {
            return { success: false, error: error.message };
        }
    }

    async getSupabaseStatus()
    {
        try
        {
            const status = await this.supabase.getConnectionStatus();
            return {
                status,
                isAuthenticated: this.supabase.isAuthenticated(),
                user: this.supabase.getCurrentUser()
            };
        } catch (error)
        {
            return {
                status: { connected: false, reason: 'Error: ' + error.message },
                isAuthenticated: false,
                user: null
            };
        }
    }
}

// ============ INITIALIZATION ============

let contentBlocker;

try
{
    contentBlocker = new ContentBlocker();
    console.log('✅ Content Blocker created successfully');
} catch (error)
{
    console.error('❌ Failed to create Content Blocker:', error);

    // Create minimal fallback
    contentBlocker = {
        addCustomDomain: async () => ({ success: false, error: 'Service unavailable' }),
        removeCustomDomain: async () => ({ success: false, error: 'Service unavailable' }),
        addKeyword: async () => ({ success: false, error: 'Service unavailable' }),
        removeKeyword: async () => ({ success: false, error: 'Service unavailable' }),
        setActive: async () => ({ success: false, error: 'Service unavailable' }),
        getCurrentTab: async () => ({ url: null }),
        addDomainFromTab: async () => ({ success: false, error: 'Service unavailable' }),
        signUp: async () => ({ success: false, error: 'Service unavailable' }),
        signIn: async () => ({ success: false, error: 'Service unavailable' }),
        signOut: async () => ({ success: true }),
        enableOfflineMode: async () => ({ success: false, error: 'Service unavailable' }),
        getSupabaseStatus: async () => ({
            status: { connected: false, reason: 'Service unavailable' },
            isAuthenticated: false,
            user: null
        })
    };
}

// ============ MESSAGE HANDLER ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
{
    console.log('📨 Message received:', message.action);

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

                // Authentication
                case 'signUp':
                    result = await contentBlocker.signUp(message.email, message.password);
                    break;

                case 'signIn':
                    result = await contentBlocker.signIn(message.email, message.password);
                    break;

                case 'signOut':
                    result = await contentBlocker.signOut();
                    break;

                case 'enableOfflineMode':
                    result = await contentBlocker.enableOfflineMode(message.duration);
                    break;

                // Status
                case 'getSupabaseStatus':
                    result = await contentBlocker.getSupabaseStatus();
                    break;

                case 'checkAuthStatus':
                    result = {
                        isAuthenticated: contentBlocker.isAuthenticated,
                        authCheckCompleted: contentBlocker.authCheckCompleted,
                        user: contentBlocker.supabase?.getCurrentUser()
                    };
                    break;

                // Cloud operations (simplified)
                case 'syncToCloud':
                case 'syncFromCloud':
                case 'createBackup':
                case 'getCloudBackups':
                case 'restoreBackup':
                case 'deleteBackup':
                    result = { success: false, error: 'Cloud features coming soon' };
                    break;

                default:
                    result = { success: false, error: 'Unknown action: ' + message.action };
            }

            console.log('📤 Sending response:', result);
            sendResponse(result);

        } catch (error)
        {
            console.error('💥 Message handler error:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();

    return true; // Will respond asynchronously
});

console.log('✅ Background script loaded successfully');