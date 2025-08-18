// src/ui/popup/popup-controller.js - Popup controller logic
import { Logger } from '../../shared/logger.js';
import { Utils } from '../../shared/utils.js';
import { TIMEOUTS, MESSAGE_TYPES } from '../../shared/constants.js';

export class PopupController
{
    constructor()
    {
        this.logger = new Logger('PopupController');
        this.currentUser = null;
        this.isAuthenticated = false;
        this.isOfflineMode = false;
        this.statsCache = null;
        this.cacheTimeout = TIMEOUTS.CACHE_TIMEOUT;
        this.lastCacheTime = 0;
        this.messageHandlers = new Map();

        this.setupMessageHandlers();
    }

    setupMessageHandlers()
    {
        this.messageHandlers.set('auth-check', this.handleAuthCheck.bind(this));
        this.messageHandlers.set('sign-in', this.handleSignIn.bind(this));
        this.messageHandlers.set('sign-up', this.handleSignUp.bind(this));
        this.messageHandlers.set('sign-out', this.handleSignOut.bind(this));
        this.messageHandlers.set('toggle-protection', this.handleToggleProtection.bind(this));
        this.messageHandlers.set('block-site', this.handleBlockSite.bind(this));
        this.messageHandlers.set('sync-data', this.handleSyncData.bind(this));
        this.messageHandlers.set('load-stats', this.handleLoadStats.bind(this));
    }

    async init()
    {
        this.logger.info('Initializing popup controller...');

        try
        {
            await this.checkAuthStatus();
            await this.loadInitialData();
            this.logger.info('Popup controller initialized successfully');
        } catch (error)
        {
            this.logger.error('Failed to initialize popup controller:', error);
            throw error;
        }
    }

    async handleMessage(type, data = {})
    {
        const handler = this.messageHandlers.get(type);
        if (handler)
        {
            try
            {
                return await handler(data);
            } catch (error)
            {
                this.logger.error(`Error handling message ${type}:`, error);
                throw error;
            }
        } else
        {
            this.logger.warn(`No handler found for message type: ${type}`);
            return { success: false, error: 'Unknown message type' };
        }
    }

    async handleAuthCheck()
    {
        return await this.checkAuthStatus();
    }

    async checkAuthStatus()
    {
        try
        {
            this.logger.debug('Checking authentication status...');

            const response = await this.sendMessage({ action: MESSAGE_TYPES.GET_AUTH_STATUS });

            if (response && response.isAuthenticated)
            {
                this.currentUser = response.user;
                this.isAuthenticated = true;
                this.isOfflineMode = response.isOfflineMode || false;
                return { authenticated: true, user: this.currentUser };
            } else
            {
                // Check for offline mode
                const offlineData = await chrome.storage.local.get(['offlineMode', 'offlineExpiry']);
                if (offlineData.offlineMode && offlineData.offlineExpiry > Date.now())
                {
                    this.isOfflineMode = true;
                    this.currentUser = { email: offlineData.offlineEmail || 'offline@mode.local' };
                    return { authenticated: true, user: this.currentUser, offline: true };
                }

                return { authenticated: false };
            }
        } catch (error)
        {
            this.logger.error('Auth check failed:', error);
            return { authenticated: false, error: error.message };
        }
    }

    async handleSignIn(data)
    {
        const { email, password } = data;

        if (!email || !password)
        {
            return { success: false, error: 'Email and password required' };
        }

        if (!Utils.isValidEmail(email))
        {
            return { success: false, error: 'Invalid email format' };
        }

        try
        {
            const response = await this.sendMessage({
                action: MESSAGE_TYPES.SIGN_IN,
                email,
                password
            });

            if (response && response.success)
            {
                this.currentUser = response.user;
                this.isAuthenticated = true;
                this.isOfflineMode = response.isOfflineMode || false;
                this.statsCache = null; // Clear cache

                return {
                    success: true,
                    user: this.currentUser,
                    offline: this.isOfflineMode
                };
            } else
            {
                return { success: false, error: response?.error || 'Sign in failed' };
            }
        } catch (error)
        {
            this.logger.error('Sign in error:', error);
            return { success: false, error: error.message };
        }
    }

    async handleSignUp(data)
    {
        const { email, password, confirmPassword } = data;

        if (!email || !password || !confirmPassword)
        {
            return { success: false, error: 'All fields required' };
        }

        if (!Utils.isValidEmail(email))
        {
            return { success: false, error: 'Invalid email format' };
        }

        if (password !== confirmPassword)
        {
            return { success: false, error: 'Passwords do not match' };
        }

        if (password.length < 6)
        {
            return { success: false, error: 'Password must be at least 6 characters' };
        }

        try
        {
            const response = await this.sendMessage({
                action: MESSAGE_TYPES.SIGN_UP,
                email,
                password
            });

            if (response && response.success)
            {
                if (response.needsConfirmation)
                {
                    return {
                        success: true,
                        needsConfirmation: true,
                        message: 'Please check your email for confirmation'
                    };
                } else
                {
                    this.currentUser = response.user;
                    this.isAuthenticated = true;
                    this.isOfflineMode = response.isOfflineMode || false;
                    this.statsCache = null;

                    return {
                        success: true,
                        user: this.currentUser,
                        offline: this.isOfflineMode
                    };
                }
            } else
            {
                return { success: false, error: response?.error || 'Sign up failed' };
            }
        } catch (error)
        {
            this.logger.error('Sign up error:', error);
            return { success: false, error: error.message };
        }
    }

    async handleSignOut()
    {
        try
        {
            await this.sendMessage({ action: MESSAGE_TYPES.SIGN_OUT });
            await chrome.storage.local.remove(['offlineMode', 'offlineExpiry', 'offlineEmail']);

            this.currentUser = null;
            this.isAuthenticated = false;
            this.isOfflineMode = false;
            this.statsCache = null;

            return { success: true };
        } catch (error)
        {
            this.logger.error('Sign out error:', error);
            // Always succeed locally for sign out
            this.currentUser = null;
            this.isAuthenticated = false;
            this.isOfflineMode = false;
            this.statsCache = null;

            return { success: true };
        }
    }

    async handleToggleProtection()
    {
        try
        {
            const data = await chrome.storage.local.get(['isActive']);
            const currentState = data.isActive !== undefined ? data.isActive : true;
            const newState = !currentState;

            const response = await this.sendMessage({
                action: MESSAGE_TYPES.SET_ACTIVE,
                active: newState
            });

            if (response && response.success)
            {
                this.statsCache = null; // Clear cache
                return {
                    success: true,
                    active: newState,
                    message: newState ? 'Protection enabled' : 'Protection disabled'
                };
            } else
            {
                return { success: false, error: 'Failed to toggle protection' };
            }
        } catch (error)
        {
            this.logger.error('Toggle protection error:', error);
            return { success: false, error: error.message };
        }
    }

    async handleBlockSite()
    {
        try
        {
            const response = await this.sendMessage({ action: MESSAGE_TYPES.ADD_DOMAIN_FROM_TAB });

            if (response && response.success)
            {
                this.statsCache = null; // Clear cache to refresh stats
                return {
                    success: true,
                    domain: response.domain,
                    message: `Blocked: ${response.domain}`
                };
            } else
            {
                return {
                    success: false,
                    error: response?.error || 'Failed to block site'
                };
            }
        } catch (error)
        {
            this.logger.error('Block site error:', error);
            return { success: false, error: error.message };
        }
    }

    async handleSyncData()
    {
        if (this.isOfflineMode)
        {
            return { success: false, error: 'Sync not available in offline mode' };
        }

        try
        {
            const [syncToResult, syncFromResult] = await Promise.all([
                this.sendMessage({ action: MESSAGE_TYPES.SYNC_TO_CLOUD }),
                this.sendMessage({ action: MESSAGE_TYPES.SYNC_FROM_CLOUD })
            ]);

            if (syncToResult?.success || syncFromResult?.success)
            {
                this.statsCache = null; // Clear cache
                return {
                    success: true,
                    message: 'Sync completed successfully'
                };
            } else
            {
                return {
                    success: false,
                    error: 'Sync failed - please try again'
                };
            }
        } catch (error)
        {
            this.logger.error('Sync error:', error);
            return {
                success: false,
                error: 'Sync failed - please check your connection'
            };
        }
    }

    async handleLoadStats()
    {
        try
        {
            // Check cache
            if (this.statsCache && (Date.now() - this.lastCacheTime) < this.cacheTimeout)
            {
                return { success: true, stats: this.statsCache };
            }

            // Load fresh data
            const data = await chrome.storage.local.get([
                'blocksToday', 'focusStreak', 'customDomains',
                'blockedDomains', 'totalBlocks'
            ]);

            const stats = {
                blocksToday: data.blocksToday || 0,
                focusStreak: data.focusStreak || 0,
                totalDomains: (data.customDomains?.length || 0) + (data.blockedDomains?.length || 0),
                timeSaved: Utils.estimateTimeSaved(data.totalBlocks || 0)
            };

            // Cache the data
            this.statsCache = stats;
            this.lastCacheTime = Date.now();

            return { success: true, stats };
        } catch (error)
        {
            this.logger.error('Failed to load stats:', error);
            return {
                success: false,
                error: error.message,
                stats: {
                    blocksToday: 0,
                    focusStreak: 0,
                    totalDomains: 0,
                    timeSaved: '0m'
                }
            };
        }
    }

    async loadInitialData()
    {
        if (this.isAuthenticated)
        {
            await this.handleLoadStats();
        }
    }

    async getCurrentSite()
    {
        try
        {
            const response = await this.sendMessage({ action: MESSAGE_TYPES.GET_CURRENT_TAB });
            if (response && response.url)
            {
                return Utils.sanitizeUrl(response.url);
            }
            return 'Unable to detect';
        } catch (error)
        {
            this.logger.error('Failed to get current site:', error);
            return 'Unable to detect';
        }
    }

    async getProtectionStatus()
    {
        try
        {
            const data = await chrome.storage.local.get(['isActive']);
            return data.isActive !== undefined ? data.isActive : true;
        } catch (error)
        {
            this.logger.error('Failed to get protection status:', error);
            return true;
        }
    }

    getUserInfo()
    {
        return {
            user: this.currentUser,
            authenticated: this.isAuthenticated,
            offline: this.isOfflineMode
        };
    }

    openSettings()
    {
        try
        {
            chrome.runtime.openOptionsPage();
            window.close();
        } catch (error)
        {
            this.logger.error('Failed to open settings:', error);
            const optionsUrl = chrome.runtime.getURL('src/ui/options/options.html');
            chrome.tabs.create({ url: optionsUrl });
            window.close();
        }
    }

    async enableOfflineMode(email = 'offline@mode.local')
    {
        try
        {
            const duration = 24 * 60 * 60 * 1000; // 24 hours
            const expiry = Date.now() + duration;

            await chrome.storage.local.set({
                offlineMode: true,
                offlineExpiry: expiry,
                offlineEmail: email
            });

            this.isOfflineMode = true;
            this.currentUser = { email };
            this.statsCache = null;

            return { success: true, user: this.currentUser };
        } catch (error)
        {
            this.logger.error('Failed to enable offline mode:', error);
            return { success: false, error: error.message };
        }
    }

    clearCache()
    {
        this.statsCache = null;
        this.lastCacheTime = 0;
        this.logger.debug('Cache cleared');
    }

    sendMessage(message)
    {
        return new Promise((resolve, reject) =>
        {
            try
            {
                chrome.runtime.sendMessage(message, (response) =>
                {
                    if (chrome.runtime.lastError)
                    {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else
                    {
                        resolve(response);
                    }
                });
            } catch (error)
            {
                reject(error);
            }
        });
    }

    destroy()
    {
        this.messageHandlers.clear();
        this.statsCache = null;
        this.currentUser = null;
        this.logger.info('PopupController destroyed');
    }
}

export default PopupController;