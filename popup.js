// popup.js - Optimized Fokus Popup with performance improvements

class FokusPopup
{
    constructor()
    {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.isOfflineMode = false;
        this.statsCache = null;
        this.cacheTimeout = 10000; // 10 seconds cache
        this.lastCacheTime = 0;
        this.init();
    }

    async init()
    {
        console.log('Initializing Fokus popup...');
        const startTime = performance.now();

        try
        {
            this.setupEventListeners();
            await this.checkAuthStatus();

            const initTime = performance.now() - startTime;
            console.log(`Popup initialized in ${initTime.toFixed(2)}ms`);
        } catch (error)
        {
            console.error('Failed to initialize popup:', error);
            this.showError('Failed to initialize. Please refresh.');
        }
    }

    setupEventListeners()
    {
        // Auth tab switching
        document.getElementById('signin-tab')?.addEventListener('click', () => this.switchAuthTab('signin'));
        document.getElementById('signup-tab')?.addEventListener('click', () => this.switchAuthTab('signup'));

        // Auth actions
        document.getElementById('signin-btn')?.addEventListener('click', () => this.signIn());
        document.getElementById('signup-btn')?.addEventListener('click', () => this.signUp());
        document.getElementById('offline-mode-btn')?.addEventListener('click', () => this.enableOfflineMode());

        // Dashboard actions
        document.getElementById('open-settings')?.addEventListener('click', () => this.openSettings());
        document.getElementById('sync-now')?.addEventListener('click', () => this.syncNow());
        document.getElementById('sign-out-btn')?.addEventListener('click', () => this.signOut());
        document.getElementById('block-current-site')?.addEventListener('click', () => this.blockCurrentSite());
        document.getElementById('protection-toggle')?.addEventListener('click', () => this.toggleProtection());

        // Enter key handlers
        document.getElementById('signin-password')?.addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.signIn();
        });
        document.getElementById('signup-confirm')?.addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.signUp();
        });
    }

    async checkAuthStatus()
    {
        console.log('Checking authentication status...');
        try
        {
            const response = await this.sendMessage({ action: 'getAuthStatus' });

            if (response && response.isAuthenticated)
            {
                console.log('User is authenticated');
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
                    console.log('Using offline mode');
                    this.isOfflineMode = true;
                    this.currentUser = { email: offlineData.offlineEmail || 'offline@mode.local' };
                    this.showDashboard();
                } else
                {
                    console.log('User not authenticated, showing auth form');
                    this.showAuthentication();
                }
            }
        } catch (error)
        {
            console.error('Auth check failed:', error);
            this.showAuthentication();
        } finally
        {
            this.hideLoading();
        }
    }

    showLoading()
    {
        document.getElementById('loading-state').style.display = 'block';
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'none';
    }

    hideLoading()
    {
        document.getElementById('loading-state').style.display = 'none';
    }

    showAuthentication()
    {
        document.getElementById('auth-section').style.display = 'flex';
        document.getElementById('dashboard-section').style.display = 'none';
        document.getElementById('dashboard-section').classList.remove('active');

        // Focus email input
        setTimeout(() =>
        {
            document.getElementById('signin-email')?.focus();
        }, 100);
    }

    showDashboard()
    {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'flex';
        document.getElementById('dashboard-section').classList.add('active');

        this.loadDashboardData();
    }

    async loadDashboardData()
    {
        try
        {
            // Update user info
            if (this.isOfflineMode)
            {
                document.getElementById('user-email').textContent = this.currentUser?.email || 'Offline Mode';
                document.querySelector('.connection-status').textContent = '⚠️ Working offline';
            } else if (this.currentUser)
            {
                document.getElementById('user-email').textContent = this.currentUser.email;
                document.querySelector('.connection-status').textContent = '✅ Connected to cloud';
            }

            // Load all data in parallel
            await Promise.all([
                this.loadCurrentSite(),
                this.loadStats(),
                this.updateProtectionStatus()
            ]);
        } catch (error)
        {
            console.error('Failed to load dashboard data:', error);
        }
    }

    async loadStats()
    {
        try
        {
            // Check if we have recent cache
            if (this.statsCache && (Date.now() - this.lastCacheTime) < this.cacheTimeout)
            {
                this.updateStatsUI(this.statsCache);
                return;
            }

            // Load fresh data
            const data = await chrome.storage.local.get([
                'blocksToday', 'focusStreak', 'customDomains', 'blockedDomains', 'totalBlocks'
            ]);

            // Cache the data
            this.statsCache = data;
            this.lastCacheTime = Date.now();

            this.updateStatsUI(data);
        } catch (error)
        {
            console.error('Failed to load stats:', error);
            // Show defaults if error
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
        document.getElementById('blocks-today').textContent = data.blocksToday || 0;
        document.getElementById('focus-streak').textContent = data.focusStreak || 0;

        const totalDomains = (data.customDomains?.length || 0) + (data.blockedDomains?.length || 0);
        document.getElementById('total-domains').textContent = totalDomains.toLocaleString();

        const estimatedHours = Math.floor((data.totalBlocks || 0) * 2 / 60);
        document.getElementById('time-saved').textContent = estimatedHours > 0 ? `${estimatedHours}h` : '0h';
    }

    async loadCurrentSite()
    {
        try
        {
            const response = await this.sendMessage({ action: 'getCurrentTab' });
            if (response && response.url)
            {
                try
                {
                    const url = new URL(response.url);
                    document.getElementById('current-url').textContent = url.hostname;
                } catch
                {
                    document.getElementById('current-url').textContent = 'Unable to detect';
                }
            } else
            {
                document.getElementById('current-url').textContent = 'Unable to detect';
            }
        } catch (error)
        {
            document.getElementById('current-url').textContent = 'Unable to detect';
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
                toggle?.classList.add('active');
                if (statusText) statusText.textContent = 'Protection Active';
            } else
            {
                toggle?.classList.remove('active');
                if (statusText) statusText.textContent = 'Protection Paused';
            }
        } catch (error)
        {
            console.error('Failed to update protection status:', error);
        }
    }

    switchAuthTab(tab)
    {
        // Update tabs
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`${tab}-tab`)?.classList.add('active');

        // Update forms
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById(`${tab}-form`)?.classList.add('active');

        // Clear messages
        this.clearAuthMessages();

        // Focus input
        setTimeout(() =>
        {
            document.getElementById(`${tab}-email`)?.focus();
        }, 100);
    }

    async signIn()
    {
        const email = document.getElementById('signin-email')?.value.trim();
        const password = document.getElementById('signin-password')?.value;
        const messageEl = document.getElementById('signin-message');
        const btn = document.getElementById('signin-btn');

        if (!email || !password)
        {
            this.showMessage(messageEl, 'Please enter email and password.', 'error');
            return;
        }

        btn.textContent = 'Signing in...';
        btn.disabled = true;

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

                // Clear cache
                this.statsCache = null;

                setTimeout(() =>
                {
                    this.showDashboard();
                }, 1000);
            } else
            {
                this.showMessage(messageEl, response?.error || 'Sign in failed', 'error');
            }
        } catch (error)
        {
            this.showMessage(messageEl, `Sign in failed: ${error.message}`, 'error');
        } finally
        {
            btn.textContent = 'Sign In';
            btn.disabled = false;
        }
    }

    async signUp()
    {
        const email = document.getElementById('signup-email')?.value.trim();
        const password = document.getElementById('signup-password')?.value;
        const confirm = document.getElementById('signup-confirm')?.value;
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

        btn.textContent = 'Creating account...';
        btn.disabled = true;

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

                    // Clear cache
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
            btn.textContent = 'Create Account';
            btn.disabled = false;
        }
    }

    async enableOfflineMode()
    {
        const btn = document.getElementById('offline-mode-btn');
        btn.textContent = 'Enabling...';
        btn.disabled = true;

        try
        {
            const duration = 24 * 60 * 60 * 1000; // 24 hours
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
            console.error('Failed to enable offline mode:', error);
            btn.textContent = 'Use Offline Mode';
            btn.disabled = false;
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

            // Clear cache to force reload
            this.statsCache = null;

            await this.updateProtectionStatus();

            const message = newState ? 'Protection enabled' : 'Protection paused';
            this.showTempMessage(message);
        } catch (error)
        {
            console.error('Failed to toggle protection:', error);
            this.showTempMessage('Failed to toggle protection');
        }
    }

    async blockCurrentSite()
    {
        const btn = document.getElementById('block-current-site');
        const originalText = btn.textContent;

        btn.textContent = 'Blocking...';
        btn.disabled = true;

        try
        {
            const response = await this.sendMessage({ action: 'addDomainFromTab' });
            if (response && response.success)
            {
                this.showTempMessage(`Blocked: ${response.domain}`);

                // Clear cache and reload stats
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
            btn.textContent = originalText;
            btn.disabled = false;
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
            console.error('Failed to open settings:', error);
            // Fallback method
            const optionsUrl = chrome.runtime.getURL('options.html');
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

        btn.textContent = 'Syncing...';
        btn.disabled = true;

        try
        {
            // Sync to cloud first, then from cloud
            const syncToResult = await this.sendMessage({ action: 'syncToCloud' });
            const syncFromResult = await this.sendMessage({ action: 'syncFromCloud' });

            if (syncToResult?.success || syncFromResult?.success)
            {
                this.showTempMessage('Sync completed successfully');

                // Clear cache and reload stats
                this.statsCache = null;
                await this.loadStats();
            } else
            {
                this.showTempMessage('Sync failed - please try again');
            }
        } catch (error)
        {
            console.error('Sync error:', error);
            this.showTempMessage('Sync failed - please check your connection');
        } finally
        {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    async signOut()
    {
        if (!confirm('Sign out and return to login screen?')) return;

        try
        {
            await this.sendMessage({ action: 'signOut' });

            // Clear local offline mode data
            await chrome.storage.local.remove(['offlineMode', 'offlineExpiry', 'offlineEmail']);

            this.currentUser = null;
            this.isAuthenticated = false;
            this.isOfflineMode = false;
            this.statsCache = null;

            this.showAuthentication();
            this.clearAuthMessages();
        } catch (error)
        {
            console.error('Sign out error:', error);
            this.showTempMessage('Sign out failed');
        }
    }

    showMessage(element, message, type)
    {
        if (!element) return;

        const messageClass = type === 'success' ? 'success' :
            type === 'info' ? 'info' : 'error';

        element.innerHTML = `<div class="message ${messageClass}">${message}</div>`;

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
        // Remove existing toast if any
        const existing = document.querySelector('.toast-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'toast-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            right: 10px;
            padding: 10px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            border-radius: 6px;
            font-size: 12px;
            text-align: center;
            z-index: 10000;
            animation: slideDown 0.3s ease-out;
        `;
        overlay.textContent = message;

        // Add animation styles if not present
        if (!document.getElementById('temp-message-styles'))
        {
            const style = document.createElement('style');
            style.id = 'temp-message-styles';
            style.textContent = `
                @keyframes slideDown {
                    from { transform: translateY(-20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(0); opacity: 1; }
                    to { transform: translateY(-20px); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);

        setTimeout(() =>
        {
            if (overlay.parentNode)
            {
                overlay.style.animation = 'slideUp 0.3s ease-out';
                setTimeout(() =>
                {
                    if (overlay.parentNode)
                    {
                        overlay.remove();
                    }
                }, 300);
            }
        }, 3000);
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
        console.error('Popup error:', message);
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
                        console.error('Runtime error:', chrome.runtime.lastError.message);
                        reject(new Error(chrome.runtime.lastError.message));
                    } else
                    {
                        resolve(response);
                    }
                });
            } catch (error)
            {
                console.error('Failed to send message:', error);
                reject(error);
            }
        });
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () =>
{
    console.log('Fokus popup DOM loaded');
    const startTime = performance.now();

    try
    {
        // Verify required elements exist
        const requiredElements = [
            'signin-tab', 'signup-tab', 'signin-form', 'signup-form',
            'signin-email', 'signin-password', 'signin-btn',
            'signup-email', 'signup-password', 'signup-confirm', 'signup-btn',
            'dashboard-section', 'auth-section', 'loading-state'
        ];

        const missingElements = requiredElements.filter(id => !document.getElementById(id));

        if (missingElements.length > 0)
        {
            console.error('Missing required elements:', missingElements);
            throw new Error(`Missing elements: ${missingElements.join(', ')}`);
        }

        // Initialize popup
        window.fokusPopup = new FokusPopup();

        const loadTime = performance.now() - startTime;
        console.log(`Fokus popup initialized in ${loadTime.toFixed(2)}ms`);

    } catch (error)
    {
        console.error('Failed to initialize popup:', error);

        // Show error UI
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">
                <div style="color: #e74c3c; font-size: 16px; font-weight: bold; margin-bottom: 10px;">
                    Initialization Error
                </div>
                <p style="color: #333; font-size: 14px; margin-bottom: 15px;">
                    Failed to initialize Fokus popup.
                </p>
                <button onclick="location.reload()" style="
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                ">
                    Reload
                </button>
                <div style="margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 5px;">
                    <small style="color: #666;">
                        Error: ${error.message}
                    </small>
                </div>
            </div>
        `;
    }
});

// Error tracking
window.addEventListener('error', (event) =>
{
    console.error('Popup error:', event.error);

    // Store error for debugging
    chrome.storage.local.get(['errorLog'], (data) =>
    {
        const errors = data.errorLog || [];
        errors.push({
            message: event.error.message,
            stack: event.error.stack,
            timestamp: new Date().toISOString(),
            context: 'popup'
        });
        chrome.storage.local.set({
            errorLog: errors.slice(-50) // Keep only last 50 errors
        });
    });
});

// Cleanup on unload
window.addEventListener('unload', () =>
{
    if (window.fokusPopup)
    {
        window.fokusPopup.statsCache = null;
        window.fokusPopup = null;
    }
});