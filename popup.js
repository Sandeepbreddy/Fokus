// popup.js - New authentication-first popup flow

class FokusPopup
{
    constructor()
    {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.isOfflineMode = false;
        this.init();
    }

    async init()
    {
        console.log('🚀 Initializing Fokus popup...');

        try
        {
            this.setupEventListeners();

            // Check authentication status
            await this.checkAuthStatus();

            console.log('✅ Popup initialized successfully');
        } catch (error)
        {
            console.error('❌ Failed to initialize popup:', error);
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
        console.log('🔍 Checking authentication status...');

        try
        {
            // Check if user has valid session
            const response = await this.sendMessage({ action: 'getAuthStatus' });

            if (response && response.isAuthenticated && response.user)
            {
                console.log('✅ User is authenticated:', response.user.email);
                this.currentUser = response.user;
                this.isAuthenticated = true;
                this.showDashboard();
            } else
            {
                // Check for offline mode
                const offlineData = await chrome.storage.local.get(['offlineMode', 'offlineExpiry']);
                if (offlineData.offlineMode && offlineData.offlineExpiry > Date.now())
                {
                    console.log('⚡ Using offline mode');
                    this.isOfflineMode = true;
                    this.showDashboard();
                } else
                {
                    console.log('🔐 User not authenticated, showing auth form');
                    this.showAuthentication();
                }
            }
        } catch (error)
        {
            console.error('❌ Auth check failed:', error);
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

        // Focus on email input
        setTimeout(() =>
        {
            document.getElementById('signin-email')?.focus();
        }, 100);
    }

    showDashboard()
    {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'flex';

        this.loadDashboardData();
    }

    switchAuthTab(tab)
    {
        // Update tab buttons
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');

        // Update forms
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById(`${tab}-form`).classList.add('active');

        // Clear messages
        this.clearAuthMessages();

        // Focus on first input
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
                this.showMessage(messageEl, '✅ Signed in successfully!', 'success');
                this.currentUser = response.user;
                this.isAuthenticated = true;

                setTimeout(() =>
                {
                    this.showDashboard();
                }, 1000);
            } else
            {
                this.showMessage(messageEl, '❌ ' + (response?.error || 'Sign in failed'), 'error');
            }
        } catch (error)
        {
            this.showMessage(messageEl, `❌ Sign in failed: ${error.message}`, 'error');
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
                        '✅ Account created! Please check your email for confirmation, then sign in.',
                        'success'
                    );
                    setTimeout(() => this.switchAuthTab('signin'), 3000);
                } else
                {
                    this.showMessage(messageEl, '✅ Account created and signed in!', 'success');
                    this.currentUser = response.user;
                    this.isAuthenticated = true;
                    setTimeout(() => this.showDashboard(), 1000);
                }
            } else
            {
                this.showMessage(messageEl, '❌ ' + (response?.error || 'Sign up failed'), 'error');
            }
        } catch (error)
        {
            this.showMessage(messageEl, `❌ Sign up failed: ${error.message}`, 'error');
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
            // Set offline mode for 24 hours
            const duration = 24 * 60 * 60 * 1000; // 24 hours
            const expiry = Date.now() + duration;

            await chrome.storage.local.set({
                offlineMode: true,
                offlineExpiry: expiry
            });

            this.isOfflineMode = true;
            this.showDashboard();
        } catch (error)
        {
            console.error('Failed to enable offline mode:', error);
            btn.textContent = 'Use Offline Mode';
            btn.disabled = false;
        }
    }

    async loadDashboardData()
    {
        try
        {
            // Update user info
            if (this.isOfflineMode)
            {
                document.getElementById('user-email').textContent = 'Offline Mode';
                document.querySelector('.connection-status').textContent = '⚡ Working offline';
            } else if (this.currentUser)
            {
                document.getElementById('user-email').textContent = this.currentUser.email;
                document.querySelector('.connection-status').textContent = '✅ Connected to cloud';
            }

            // Load stats
            await this.loadStats();

            // Load current site
            await this.loadCurrentSite();

            // Update protection status
            await this.updateProtectionStatus();

        } catch (error)
        {
            console.error('Failed to load dashboard data:', error);
        }
    }

    async loadStats()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blocksToday', 'focusStreak', 'customDomains', 'blockedDomains', 'totalBlocks'
            ]);

            document.getElementById('blocks-today').textContent = data.blocksToday || 0;
            document.getElementById('focus-streak').textContent = data.focusStreak || 0;

            const totalDomains = (data.customDomains || []).length + (data.blockedDomains || []).length;
            document.getElementById('total-domains').textContent = totalDomains.toLocaleString();

            const estimatedHours = Math.floor((data.totalBlocks || 0) * 2 / 60);
            document.getElementById('time-saved').textContent = estimatedHours > 0 ? `${estimatedHours}h` : '0h';
        } catch (error)
        {
            console.error('Failed to load stats:', error);
        }
    }

    async loadCurrentSite()
    {
        try
        {
            const response = await this.sendMessage({ action: 'getCurrentTab' });
            if (response && response.url)
            {
                const url = new URL(response.url);
                document.getElementById('current-url').textContent = url.hostname;
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
                toggle.classList.add('active');
                statusText.textContent = 'Protection Active';
            } else
            {
                toggle.classList.remove('active');
                statusText.textContent = 'Protection Paused';
            }
        } catch (error)
        {
            console.error('Failed to update protection status:', error);
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
            await this.updateProtectionStatus();

            const message = newState ? 'Protection enabled' : 'Protection paused';
            this.showTempMessage(message);
        } catch (error)
        {
            console.error('Failed to toggle protection:', error);
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
                this.showTempMessage(`✅ Blocked: ${response.domain}`);
                await this.loadStats();
            } else
            {
                this.showTempMessage('❌ Failed to block site');
            }
        } catch (error)
        {
            this.showTempMessage('❌ Failed to block site');
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
            const optionsUrl = chrome.runtime.getURL('options.html');
            chrome.tabs.create({ url: optionsUrl, active: true });
            window.close();
        } catch (error)
        {
            console.error('Failed to open settings:', error);
            this.showTempMessage('❌ Failed to open settings');
        }
    }

    async syncNow()
    {
        if (this.isOfflineMode)
        {
            this.showTempMessage('⚡ Sync not available in offline mode');
            return;
        }

        const btn = document.getElementById('sync-now');
        const originalText = btn.textContent;

        btn.textContent = '🔄 Syncing...';
        btn.disabled = true;

        try
        {
            await this.sendMessage({ action: 'syncToCloud' });
            await this.sendMessage({ action: 'syncFromCloud' });

            this.showTempMessage('✅ Sync completed');
            await this.loadStats();
        } catch (error)
        {
            this.showTempMessage('❌ Sync failed');
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
            if (!this.isOfflineMode)
            {
                await this.sendMessage({ action: 'signOut' });
            } else
            {
                // Clear offline mode
                await chrome.storage.local.remove(['offlineMode', 'offlineExpiry']);
            }

            this.currentUser = null;
            this.isAuthenticated = false;
            this.isOfflineMode = false;

            this.showAuthentication();
            this.clearAuthMessages();
        } catch (error)
        {
            console.error('Sign out error:', error);
            this.showTempMessage('❌ Sign out failed');
        }
    }

    // Utility Methods
    showMessage(element, message, type)
    {
        if (!element) return;

        const messageClass = type === 'success' ? 'success' :
            type === 'info' ? 'info' : 'error';

        element.innerHTML = `<div class="message ${messageClass}">${message}</div>`;

        // Auto-clear messages after 5 seconds
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
        // Create temporary message overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            right: 10px;
            padding: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border-radius: 6px;
            font-size: 12px;
            text-align: center;
            z-index: 10000;
            animation: slideDown 0.3s ease-out;
        `;
        overlay.textContent = message;

        // Add animation styles
        if (!document.getElementById('temp-message-styles'))
        {
            const style = document.createElement('style');
            style.id = 'temp-message-styles';
            style.textContent = `
                @keyframes slideDown {
                    from { transform: translateY(-20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);

        // Remove after 3 seconds
        setTimeout(() =>
        {
            if (overlay.parentNode)
            {
                overlay.style.animation = 'slideDown 0.3s ease-out reverse';
                setTimeout(() =>
                {
                    if (overlay.parentNode)
                    {
                        overlay.parentNode.removeChild(overlay);
                    }
                }, 300);
            }
        }, 3000);
    }

    clearAuthMessages()
    {
        document.getElementById('signin-message').innerHTML = '';
        document.getElementById('signup-message').innerHTML = '';
    }

    showError(message)
    {
        console.error('Popup error:', message);
        this.showTempMessage(`❌ ${message}`);
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
    console.log('🎯 Fokus popup DOM loaded');

    try
    {
        // Check if all required elements exist
        const requiredElements = [
            'signin-tab', 'signup-tab', 'signin-form', 'signup-form',
            'signin-email', 'signin-password', 'signin-btn',
            'signup-email', 'signup-password', 'signup-confirm', 'signup-btn',
            'dashboard-section', 'auth-section', 'loading-state'
        ];

        const missingElements = requiredElements.filter(id => !document.getElementById(id));

        if (missingElements.length > 0)
        {
            console.error('❌ Missing required elements:', missingElements);
            throw new Error(`Missing elements: ${missingElements.join(', ')}`);
        }

        // Initialize popup
        new FokusPopup();
        console.log('✅ Fokus popup initialized successfully');

    } catch (error)
    {
        console.error('❌ Failed to initialize popup:', error);

        // Show error message to user
        document.body.innerHTML = `
            <div style="padding: 20px; color: #721c24; background: #f8d7da; border-radius: 8px; margin: 10px; font-family: Arial, sans-serif; font-size: 14px;">
                <div style="text-align: center; margin-bottom: 15px;">
                    <div style="font-size: 32px; margin-bottom: 10px;">⚠️</div>
                    <strong>Popup Error</strong>
                </div>
                <p>Failed to initialize Fokus popup. Please try:</p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Refreshing the extension</li>
                    <li>Reloading the browser</li>
                    <li>Checking browser console for errors</li>
                </ul>
                <div style="font-size: 11px; margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 4px;">
                    <strong>Technical details:</strong><br>
                    ${error.message}
                </div>
            </div>
        `;
    }
});