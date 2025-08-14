// auth-required.js - Authentication page JavaScript

class AuthenticationManager
{
    constructor()
    {
        this.currentReason = this.getUrlParameter('reason') || 'general';
        this.offlineTimer = null;
        this.init();
    }

    init()
    {
        this.showReasonMessage();
        this.setupEventListeners();
        this.checkSupabaseConfig();
    }

    getUrlParameter(name)
    {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    showReasonMessage()
    {
        const reasonEl = document.getElementById('reason-message');
        const messages = {
            'install': '🎉 Welcome! Please create an account or sign in to start using Fokus.',
            'startup': '🔐 Please sign in to continue using Fokus with cloud sync.',
            'blocking': '⚠️ Authentication required to access this content. Please sign in to continue.',
            'update': '🔄 Extension updated! Please sign in again to restore your cloud settings.',
            'signout': '👋 You\'ve been signed out. Sign in again to continue using cloud features.',
            'general': '🔐 Please sign in to access Fokus features.'
        };

        const message = messages[this.currentReason] || messages['general'];
        reasonEl.textContent = message;
        reasonEl.style.display = 'block';
    }

    setupEventListeners()
    {
        // Tab switching
        document.getElementById('signin-tab').addEventListener('click', () => this.switchTab('signin'));
        document.getElementById('signup-tab').addEventListener('click', () => this.switchTab('signup'));

        // Form submissions
        document.getElementById('signin-btn').addEventListener('click', () => this.signIn());
        document.getElementById('signup-btn').addEventListener('click', () => this.signUp());

        // Enter key handlers
        document.getElementById('signin-password').addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.signIn();
        });
        document.getElementById('signup-confirm').addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.signUp();
        });

        // Offline mode
        document.getElementById('offline-mode-btn').addEventListener('click', () => this.enableOfflineMode());

        // Setup configuration
        document.getElementById('setup-config-btn').addEventListener('click', () => this.openConfiguration());
    }

    switchTab(tab)
    {
        // Update tab buttons
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');

        // Update forms
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById(`${tab}-form`).classList.add('active');

        // Clear messages
        this.clearMessages();
    }

    async checkSupabaseConfig()
    {
        try
        {
            const response = await this.sendMessage({ action: 'getSupabaseStatus' });

            if (!response.status.connected && response.status.reason === 'Not configured')
            {
                document.getElementById('setup-required').style.display = 'block';
                document.querySelector('.auth-container').style.display = 'none';
                document.querySelector('.offline-mode').style.display = 'none';
            }
        } catch (error)
        {
            console.log('Could not check Supabase config:', error);
        }
    }

    async signIn()
    {
        const email = document.getElementById('signin-email').value.trim();
        const password = document.getElementById('signin-password').value;
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

            if (response.success)
            {
                this.showMessage(messageEl, 'Successfully signed in! 🎉', 'success');

                // Notify background script
                await this.sendMessage({
                    action: 'authSuccess',
                    user: response.user
                });

                // Close this tab after short delay
                setTimeout(() =>
                {
                    window.close();
                }, 2000);
            } else
            {
                this.showMessage(messageEl, response.error || 'Sign in failed', 'error');
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
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;
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

            if (response.success)
            {
                if (response.needsConfirmation)
                {
                    this.showMessage(messageEl,
                        '✅ Account created! Please check your email for confirmation, then sign in.',
                        'success'
                    );
                    // Switch to sign-in tab
                    setTimeout(() => this.switchTab('signin'), 3000);
                } else
                {
                    this.showMessage(messageEl, 'Account created and signed in! 🎉', 'success');

                    // Notify background script
                    await this.sendMessage({
                        action: 'authSuccess',
                        user: response.user
                    });

                    // Close this tab after short delay
                    setTimeout(() =>
                    {
                        window.close();
                    }, 2000);
                }
            } else
            {
                this.showMessage(messageEl, response.error || 'Account creation failed', 'error');
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
        const timerEl = document.getElementById('offline-timer');

        btn.textContent = 'Enabling offline mode...';
        btn.disabled = true;

        try
        {
            const duration = 3600000; // 1 hour
            await this.sendMessage({
                action: 'enableOfflineMode',
                duration
            });

            // Show countdown timer
            timerEl.style.display = 'block';
            btn.style.display = 'none';

            this.startOfflineTimer(duration);

            // Close tab after short delay
            setTimeout(() =>
            {
                window.close();
            }, 3000);

        } catch (error)
        {
            console.error('Failed to enable offline mode:', error);
            btn.textContent = 'Use Offline Mode (1 Hour)';
            btn.disabled = false;
        }
    }

    startOfflineTimer(duration)
    {
        const timerEl = document.getElementById('offline-timer');
        const endTime = Date.now() + duration;

        const updateTimer = () =>
        {
            const remaining = endTime - Date.now();

            if (remaining <= 0)
            {
                timerEl.textContent = '⏰ Offline mode expired. Please sign in.';
                clearInterval(this.offlineTimer);
                return;
            }

            const minutes = Math.floor(remaining / 60000);
            timerEl.textContent = `⏰ Offline mode active: ${minutes} minutes remaining`;
        };

        updateTimer();
        this.offlineTimer = setInterval(updateTimer, 60000); // Update every minute
    }

    openConfiguration()
    {
        // Open extension options page
        const optionsUrl = chrome.runtime.getURL('options.html#supabase-config');
        chrome.tabs.create({ url: optionsUrl });
    }

    showMessage(element, message, type)
    {
        const messageClass = type === 'success' ? 'success' :
            type === 'info' ? 'info' : 'error';

        element.innerHTML = `<div class="message ${messageClass}">${message}</div>`;

        // Auto-clear error messages after 10 seconds
        if (type === 'error')
        {
            setTimeout(() =>
            {
                if (element.innerHTML.includes(message))
                {
                    element.innerHTML = '';
                }
            }, 10000);
        }
    }

    clearMessages()
    {
        document.getElementById('signin-message').innerHTML = '';
        document.getElementById('signup-message').innerHTML = '';
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
                        resolve(response || { success: true });
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
    console.log('🔐 Authentication page loaded');

    try
    {
        new AuthenticationManager();
        console.log('✅ Authentication manager initialized');
    } catch (error)
    {
        console.error('❌ Failed to initialize authentication manager:', error);

        // Show fallback message
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #721c24; background: #f8d7da; border-radius: 8px; margin: 20px;">
                <h3>⚠️ Authentication Error</h3>
                <p>Failed to initialize authentication. Please try:</p>
                <ul style="text-align: left; margin: 15px 0;">
                    <li>Refreshing this page</li>
                    <li>Reloading the extension</li>
                    <li>Checking browser console for errors</li>
                </ul>
                <button onclick="location.reload()" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Refresh Page
                </button>
            </div>
        `;
    }
});