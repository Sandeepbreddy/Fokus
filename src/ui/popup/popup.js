// src/ui/popup/popup.js - Popup UI controller
import { Utils } from '../../shared/utils.js';
import { Logger } from '../../shared/logger.js';
import { TIMEOUTS } from '../../shared/constants.js';

class PopupController
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

        this.init();
    }

    async init()
    {
        this.logger.info('Initializing popup...');
        const startTime = performance.now();

        try
        {
            this.setupEventListeners();
            await this.checkAuthStatus();

            const initTime = performance.now() - startTime;
            this.logger.debug(`Popup initialized in ${initTime.toFixed(2)}ms`);
        } catch (error)
        {
            this.logger.error('Failed to initialize popup:', error);
            this.showError('Failed to initialize. Please refresh.');
        }
    }

    setupEventListeners()
    {
        // Auth tab switching
        this.addClickListener('signin-tab', () => this.switchAuthTab('signin'));
        this.addClickListener('signup-tab', () => this.switchAuthTab('signup'));

        // Auth actions
        this.addClickListener('signin-btn', () => this.signIn());
        this.addClickListener('signup-btn', () => this.signUp());
        this.addClickListener('offline-mode-btn', () => this.enableOfflineMode());

        // Dashboard actions
        this.addClickListener('open-settings', () => this.openSettings());
        this.addClickListener('sync-now', () => this.syncNow());
        this.addClickListener('sign-out-btn', () => this.signOut());
        this.addClickListener('block-current-site', () => this.blockCurrentSite());
        this.addClickListener('protection-toggle', () => this.toggleProtection());

        // Enter key handlers
        this.addKeyListener('signin-password', 'Enter', () => this.signIn());
        this.addKeyListener('signup-confirm', 'Enter', () => this.signUp());
    }

    addClickListener(id, handler)
    {
        const element = document.getElementById(id);
        if (element)
        {
            element.addEventListener('click', handler);
        }
    }

    addKeyListener(id, key, handler)
    {
        const element = document.getElementById(id);
        if (element)
        {
            element.addEventListener('keypress', (e) =>
            {
                if (e.key === key) handler();
            });
        }
    }

    async checkAuthStatus()
    {
        this.logger.debug('Checking authentication status...');

        try
        {
            const response = await this.sendMessage({ action: 'getAuthStatus' });

            if (response && response.isAuthenticated)
            {
                this.currentUser = response.user;
                this.isAuthenticated = true;
                this.isOfflineMode = response.isOfflineMode || false;
                this.showDashboard();
            } else
            {
                // Check for offline mode fallback
                const offlineData = await chrome.storage.local.get(['offlineMode', 'offlineExpiry']);
                if (offlineData.offlineMode && offlineData.offlineExpiry > Date.now())
                {
                    this.isOfflineMode = true;
                    this.currentUser = { email: offlineData.offlineEmail || 'offline@mode.local' };
                    this.showDashboard();
                } else
                {
                    this.showAuthentication();
                }
            }
        } catch (error)
        {
            this.logger.error('Auth check failed:', error);
            this.showAuthentication();
        } finally
        {
            this.hideLoading();
        }
    }

    showLoading()
    {
        this.setElementDisplay('loading-state', 'block');
        this.setElementDisplay('auth-section', 'none');
        this.setElementDisplay('dashboard-section', 'none');
    }

    hideLoading()
    {
        this.setElementDisplay('loading-state', 'none');
    }

    showAuthentication()
    {
        this.setElementDisplay('auth-section', 'flex');
        this.setElementDisplay('dashboard-section', 'none');
        this.removeClass('dashboard-section', 'active');

        // Focus email input
        setTimeout(() =>
        {
            const emailInput = document.getElementById('signin-email');
            if (emailInput) emailInput.focus();
        }, 100);
    }

    showDashboard()
    {
        this.setElementDisplay('auth-section', 'none');
        this.setElementDisplay('dashboard-section', 'flex');
        this.addClass('dashboard-section', 'active');

        this.loadDashboardData();
    }

    async loadDashboardData()
    {
        try
        {
            // Update user info
            const userEmailEl = document.getElementById('user-email');
            const statusEl = document.querySelector('.connection-status');

            if (this.isOfflineMode)
            {
                this.setElementText('user-email', this.currentUser?.email || 'Offline Mode');
                this.setElementText('.connection-status', '⚠️ Working offline');
            } else if (this.currentUser)
            {
                this.setElementText('user-email', this.currentUser.email);
                this.setElementText('.connection-status', '✅ Connected to cloud');
            }

            // Load data in parallel
            await Promise.all([
                this.loadCurrentSite(),
                this.loadStats(),
                this.updateProtectionStatus()
            ]);
        } catch (error)
        {
            this.logger.error('Failed to load dashboard data:', error);
        }
    }

    async loadStats()
    {
        try
        {
            // Check cache
            if (this.statsCache && (Date.now() - this.lastCacheTime) < this.cacheTimeout)
            {
                this.updateStatsUI(this.statsCache);
                return;
            }

            // Load fresh data
            const data = await chrome.storage.local.get([
                'blocksToday', 'focusStreak', 'customDomains', 'blockedDomains', 'totalBlocks'
            ]);

            this.statsCache = data;
            this.lastCacheTime = Date.now();
            this.updateStatsUI(data);
        } catch (error)
        {
            this.logger.error('Failed to load stats:', error);
            this.updateStatsUI({
                blocksToday: 0,
                focusStreak: 0,
                customDomains: [],
                blockedDomains: [],
                totalBlocks: 0
            });
        }
    }

    updateStatsUI(data)
    {
        this.setElementText('blocks-today', data.blocksToday || 0);
        this.setElementText('focus-streak', data.focusStreak || 0);

        const totalDomains = (data.customDomains?.length || 0) + (data.blockedDomains?.length || 0);
        this.setElementText('total-domains', totalDomains.toLocaleString());

        const estimatedTime = Utils.estimateTimeSaved(data.totalBlocks || 0);
        this.setElementText('time-saved', estimatedTime);
    }

    async loadCurrentSite()
    {
        try
        {
            const response = await this.sendMessage({ action: 'getCurrentTab' });
            if (response && response.url)
            {
                const hostname = Utils.sanitizeUrl(response.url);
                this.setElementText('current-url', hostname);
            } else
            {
                this.setElementText('current-url', 'Unable to detect');
            }
        } catch (error)
        {
            this.setElementText('current-url', 'Unable to detect');
        }
    }

    async updateProtectionStatus()
    {
        try
        {
            const data = await chrome.storage.local.get(['isActive']);
            const isActive = data.isActive !== undefined ? data.isActive : true;

            const toggle = document.getElementById('protection-toggle');
            const statusText = document.getElementById('protection-status');

            if (isActive)
            {
                this.addClass('protection-toggle', 'active');
                this.setElementText('protection-status', 'Protection Active');
            } else
            {
                this.removeClass('protection-toggle', 'active');
                this.setElementText('protection-status', 'Protection Paused');
            }
        } catch (error)
        {
            this.logger.error('Failed to update protection status:', error);
        }
    }

    switchAuthTab(tab)
    {
        // Update tabs
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        this.addClass(`${tab}-tab`, 'active');

        // Update forms
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        this.addClass(`${tab}-form`, 'active');

        // Clear messages
        this.clearAuthMessages();

        // Focus input
        setTimeout(() =>
        {
            const input = document.getElementById(`${tab}-email`);
            if (input) input.focus();
        }, 100);
    }

    async signIn()
    {
        const email = this.getElementValue('signin-email')?.trim();
        const password = this.getElementValue('signin-password');
        const messageEl = document.getElementById('signin-message');
        const btn = document.getElementById('signin-btn');

        if (!email || !password)
        {
            this.showMessage(messageEl, 'Please enter email and password.', 'error');
            return;
        }

        this.setButtonLoading(btn, 'Signing in...');

        try
        {
            const response = await this.sendMessage({
                action: 'signIn',
                email,
                password
            });

            if (response && response.success)
            {
                this.showMessage(messageEl, 'Signed in successfully!', 'success');
                this.currentUser = response.user;
                this.isAuthenticated = true;
                this.isOfflineMode = response.isOfflineMode || false;
                this.statsCache = null;

                setTimeout(() => this.showDashboard(), 1000);
            } else
            {
                this.showMessage(messageEl, response?.error || 'Sign in failed', 'error');
            }
        } catch (error)
        {
            this.showMessage(messageEl, `Sign in failed: ${error.message}`, 'error');
        } finally
        {
            this.setButtonLoading(btn, 'Sign In', false);
        }
    }

    async signUp()
    {
        const email = this.getElementValue('signup-email')?.trim();
        const password = this.getElementValue('signup-password');
        const confirm = this.getElementValue('signup-confirm');
        const messageEl = document.getElementById('signup-message');
        const btn = document.getElementById('signup-btn');

        if (!email || !password || !confirm)
        {
            this.showMessage(messageEl, 'Please fill in all fields.', 'error');
            return;
        }

        if (password !== confirm)
        {
            this.showMessage(messageEl, 'Passwords do not match.', 'error');
            return;
        }

        if (password.length < 6)
        {
            this.showMessage(messageEl, 'Password must be at least 6 characters.', 'error');
            return;
        }

        this.setButtonLoading(btn, 'Creating account...');

        try
        {
            const response = await this.sendMessage({
                action: 'signUp',
                email,
                password
            });

            if (response && response.success)
            {
                if (response.needsConfirmation)
                {
                    this.showMessage(messageEl,
                        'Account created! Please check your email for confirmation, then sign in.',
                        'success'
                    );
                    setTimeout(() => this.switchAuthTab('signin'), 3000);
                } else
                {
                    this.showMessage(messageEl, 'Account created and signed in!', 'success');
                    this.currentUser = response.user;
                    this.isAuthenticated = true;
                    this.isOfflineMode = response.isOfflineMode || false;
                    this.statsCache = null;

                    setTimeout(() => this.showDashboard(), 1000);
                }
            } else
            {
                this.showMessage(messageEl, response?.error || 'Sign up failed', 'error');
            }
        } catch (error)
        {
            this.showMessage(messageEl, `Sign up failed: ${error.message}`, 'error');
        } finally
        {
            this.setButtonLoading(btn, 'Create Account', false);
        }
    }

    async enableOfflineMode()
    {
        const btn = document.getElementById('offline-mode-btn');
        this.setButtonLoading(btn, 'Enabling...');

        try
        {
            const duration = 24 * 60 * 60 * 1000;
            const expiry = Date.now() + duration;

            await chrome.storage.local.set({
                offlineMode: true,
                offlineExpiry: expiry,
                offlineEmail: 'offline@mode.local'
            });

            this.isOfflineMode = true;
            this.currentUser = { email: 'offline@mode.local' };
            this.statsCache = null;

            this.showDashboard();
        } catch (error)
        {
            this.logger.error('Failed to enable offline mode:', error);
            this.setButtonLoading(btn, 'Use Offline Mode', false);
        }
    }

    async toggleProtection()
    {
        try
        {
            const data = await chrome.storage.local.get(['isActive']);
            const currentState = data.isActive !== undefined ? data.isActive : true;
            const newState = !currentState;

            await this.sendMessage({ action: 'setActive', active: newState });
            this.statsCache = null;
            await this.updateProtectionStatus();

            const message = newState ? 'Protection enabled' : 'Protection paused';
            this.showTempMessage(message);
        } catch (error)
        {
            this.logger.error('Failed to toggle protection:', error);
            this.showTempMessage('Failed to toggle protection');
        }
    }

    async blockCurrentSite()
    {
        const btn = document.getElementById('block-current-site');
        const originalText = btn.textContent;

        this.setButtonLoading(btn, 'Blocking...');

        try
        {
            const response = await this.sendMessage({ action: 'addDomainFromTab' });
            if (response && response.success)
            {
                this.showTempMessage(`Blocked: ${response.domain}`);
                this.statsCache = null;
                await this.loadStats();
            } else
            {
                this.showTempMessage(response?.error || 'Failed to block site');
            }
        } catch (error)
        {
            this.showTempMessage('Failed to block site');
        } finally
        {
            this.setButtonLoading(btn, originalText, false);
        }
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

    async syncNow()
    {
        if (this.isOfflineMode)
        {
            this.showTempMessage('Sync not available in offline mode');
            return;
        }

        const btn = document.getElementById('sync-now');
        const originalText = btn.textContent;

        this.setButtonLoading(btn, 'Syncing...');

        try
        {
            const [syncToResult, syncFromResult] = await Promise.all([
                this.sendMessage({ action: 'syncToCloud' }),
                this.sendMessage({ action: 'syncFromCloud' })
            ]);

            if (syncToResult?.success || syncFromResult?.success)
            {
                this.showTempMessage('Sync completed successfully');
                this.statsCache = null;
                await this.loadStats();
            } else
            {
                this.showTempMessage('Sync failed - please try again');
            }
        } catch (error)
        {
            this.logger.error('Sync error:', error);
            this.showTempMessage('Sync failed - please check your connection');
        } finally
        {
            this.setButtonLoading(btn, originalText, false);
        }
    }

    async signOut()
    {
        if (!confirm('Sign out and return to login screen?')) return;

        try
        {
            await this.sendMessage({ action: 'signOut' });
            await chrome.storage.local.remove(['offlineMode', 'offlineExpiry', 'offlineEmail']);

            this.currentUser = null;
            this.isAuthenticated = false;
            this.isOfflineMode = false;
            this.statsCache = null;

            this.showAuthentication();
            this.clearAuthMessages();
        } catch (error)
        {
            this.logger.error('Sign out error:', error);
            this.showTempMessage('Sign out failed');
        }
    }

    // UI Helper methods
    setElementDisplay(id, display)
    {
        const element = document.getElementById(id);
        if (element) element.style.display = display;
    }

    setElementText(selector, text)
    {
        const element = selector.startsWith('#') ?
            document.getElementById(selector.slice(1)) :
            document.querySelector(selector);
        if (element) element.textContent = text;
    }

    getElementValue(id)
    {
        const element = document.getElementById(id);
        return element ? element.value : '';
    }

    addClass(id, className)
    {
        const element = document.getElementById(id);
        if (element) element.classList.add(className);
    }

    removeClass(id, className)
    {
        const element = document.getElementById(id);
        if (element) element.classList.remove(className);
    }

    setButtonLoading(button, text, loading = true)
    {
        if (button)
        {
            button.textContent = text;
            button.disabled = loading;
        }
    }

    showMessage(element, message, type)
    {
        if (!element) return;

        const messageClass = type === 'success' ? 'success' :
            type === 'info' ? 'info' : 'error';

        element.innerHTML = `<div class="message ${messageClass}">${Utils.escapeHtml(message)}</div>`;

        setTimeout(() =>
        {
            if (element.innerHTML.includes(message))
            {
                element.innerHTML = '';
            }
        }, 5000);
    }

    showTempMessage(message)
    {
        Utils.createToast(message, 'info', 3000);
    }

    clearAuthMessages()
    {
        const signinMsg = document.getElementById('signin-message');
        const signupMsg = document.getElementById('signup-message');
        if (signinMsg) signinMsg.innerHTML = '';
        if (signupMsg) signupMsg.innerHTML = '';
    }

    showError(message)
    {
        this.logger.error('Popup error:', message);
        this.showTempMessage(message);
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () =>
{
    const startTime = performance.now();

    try
    {
        // Verify required elements
        const requiredElements = [
            'signin-tab', 'signup-tab', 'signin-form', 'signup-form',
            'signin-email', 'signin-password', 'signin-btn',
            'signup-email', 'signup-password', 'signup-confirm', 'signup-btn',
            'dashboard-section', 'auth-section', 'loading-state'
        ];

        const missingElements = requiredElements.filter(id => !document.getElementById(id));

        if (missingElements.length > 0)
        {
            throw new Error(`Missing elements: ${missingElements.join(', ')}`);
        }

        window.popupController = new PopupController();

        const loadTime = performance.now() - startTime;
        console.log(`Popup initialized in ${loadTime.toFixed(2)}ms`);

    } catch (error)
    {
        console.error('Failed to initialize popup:', error);
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">
                <div style="color: #e74c3c; font-size: 16px; font-weight: bold; margin-bottom: 10px;">
                    Initialization Error
                </div>
                <p style="color: #333; font-size: 14px; margin-bottom: 15px;">
                    Failed to initialize popup.
                </p>
                <button onclick="location.reload()" style="
                    background: #4CAF50; color: white; border: none;
                    padding: 10px 20px; border-radius: 5px; cursor: pointer;
                ">Reload</button>
            </div>
        `;
    }
});

// Cleanup on unload
window.addEventListener('unload', () =>
{
    if (window.popupController)
    {
        window.popupController.statsCache = null;
        window.popupController = null;
    }
});