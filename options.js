// options.js - Complete rewrite with centralized Supabase configuration

class OptionsManager
{
    constructor()
    {
        this.isInitialized = false;
        this.currentPin = null;
        this.defaultKeywords = [
            'adult', 'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw',
            'explicit', 'mature', 'erotic', 'lesbian', 'gay', 'anal',
            'oral', 'bdsm', 'fetish', 'webcam', 'escort', 'dating'
        ];
    }

    async init()
    {
        console.log('🚀 Initializing Options Manager...');

        try
        {
            this.setupEventListeners();
            await this.loadAllSettings();
            await this.initializeSupabaseFeatures();
            this.updateBrowserInfo();

            this.isInitialized = true;
            console.log('✅ Options Manager initialized successfully');
        } catch (error)
        {
            console.error('❌ Failed to initialize Options Manager:', error);
            this.showError('Failed to initialize settings. Please refresh the page.');
        }
    }

    setupEventListeners()
    {
        // PIN Management
        this.setupPinEventListeners();

        // Cloud Sync & Authentication
        this.setupCloudEventListeners();

        // Keywords Management
        this.setupKeywordsEventListeners();

        // Domains Management
        this.setupDomainsEventListeners();

        // Blocklist Management
        this.setupBlocklistEventListeners();

        // Backup & Restore
        this.setupBackupEventListeners();

        // Extension Status
        this.setupStatusEventListeners();

        // Advanced Settings
        this.setupAdvancedEventListeners();
    }

    // ============ PIN MANAGEMENT ============
    setupPinEventListeners()
    {
        // Show/hide PIN
        document.getElementById('show-pin')?.addEventListener('click', () => this.togglePinVisibility());
        document.getElementById('copy-pin')?.addEventListener('click', () => this.copyPin());

        // PIN change
        document.getElementById('change-pin')?.addEventListener('click', () => this.changePIN());
        document.getElementById('reset-to-default')?.addEventListener('click', () => this.resetPinToDefault());

        // Quick PIN buttons
        document.querySelectorAll('.quick-pin-btn').forEach(btn =>
        {
            btn.addEventListener('click', () => this.useQuickPin(btn.dataset.pin));
        });
        document.getElementById('generate-random-pin')?.addEventListener('click', () => this.generateRandomPin());

        // Enter key handlers
        document.getElementById('confirm-pin')?.addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.changePIN();
        });
    }

    async loadCurrentPin()
    {
        try
        {
            const data = await chrome.storage.local.get(['pin']);
            this.currentPin = data.pin || '1234';
            this.updatePinDisplay();
        } catch (error)
        {
            console.error('❌ Failed to load current PIN:', error);
            this.currentPin = '1234';
        }
    }

    updatePinDisplay()
    {
        const display = document.getElementById('current-pin-display');
        if (display)
        {
            display.textContent = '••••';
            display.dataset.pin = this.currentPin;
        }
    }

    togglePinVisibility()
    {
        const display = document.getElementById('current-pin-display');
        const btn = document.getElementById('show-pin');

        if (display.textContent === '••••')
        {
            display.textContent = this.currentPin;
            btn.innerHTML = '🙈 Hide PIN';

            // Auto-hide after 5 seconds
            setTimeout(() =>
            {
                if (display.textContent === this.currentPin)
                {
                    display.textContent = '••••';
                    btn.innerHTML = '👁️ Show PIN';
                }
            }, 5000);
        } else
        {
            display.textContent = '••••';
            btn.innerHTML = '👁️ Show PIN';
        }
    }

    async copyPin()
    {
        try
        {
            await navigator.clipboard.writeText(this.currentPin);
            const btn = document.getElementById('copy-pin');
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Copied!';
            setTimeout(() =>
            {
                btn.innerHTML = originalText;
            }, 2000);
        } catch (error)
        {
            console.error('❌ Failed to copy PIN:', error);
            alert('Failed to copy PIN to clipboard');
        }
    }

    async changePIN()
    {
        const currentPin = document.getElementById('current-pin')?.value;
        const newPin = document.getElementById('new-pin')?.value;
        const confirmPin = document.getElementById('confirm-pin')?.value;
        const messageEl = document.getElementById('pin-message');

        if (!messageEl) return;

        // Clear previous messages
        messageEl.innerHTML = '';

        if (!currentPin || !newPin || !confirmPin)
        {
            this.showMessage(messageEl, 'Please fill in all PIN fields.', 'error');
            return;
        }

        if (currentPin !== this.currentPin)
        {
            this.showMessage(messageEl, 'Current PIN is incorrect.', 'error');
            return;
        }

        if (newPin !== confirmPin)
        {
            this.showMessage(messageEl, 'New PINs do not match.', 'error');
            return;
        }

        if (newPin.length < 4)
        {
            this.showMessage(messageEl, 'PIN must be at least 4 characters.', 'error');
            return;
        }

        if (!/^\d+$/.test(newPin))
        {
            this.showMessage(messageEl, 'PIN should contain only numbers.', 'error');
            return;
        }

        try
        {
            await chrome.storage.local.set({ pin: newPin });
            this.currentPin = newPin;
            this.updatePinDisplay();

            this.showMessage(messageEl, 'PIN changed successfully! 🎉', 'success');

            // Clear form
            ['current-pin', 'new-pin', 'confirm-pin'].forEach(id =>
            {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });

        } catch (error)
        {
            console.error('❌ PIN change error:', error);
            this.showMessage(messageEl, 'Failed to change PIN. Please try again.', 'error');
        }
    }

    async resetPinToDefault()
    {
        if (!confirm('Reset PIN to default (1234)?')) return;

        try
        {
            await chrome.storage.local.set({ pin: '1234' });
            this.currentPin = '1234';
            this.updatePinDisplay();

            const messageEl = document.getElementById('pin-message');
            if (messageEl)
            {
                this.showMessage(messageEl, 'PIN reset to default (1234) successfully!', 'success');
            }
        } catch (error)
        {
            console.error('❌ PIN reset error:', error);
            const messageEl = document.getElementById('pin-message');
            if (messageEl)
            {
                this.showMessage(messageEl, 'Failed to reset PIN. Please try again.', 'error');
            }
        }
    }

    useQuickPin(pin)
    {
        const newPinEl = document.getElementById('new-pin');
        const confirmPinEl = document.getElementById('confirm-pin');

        if (newPinEl) newPinEl.value = pin;
        if (confirmPinEl) confirmPinEl.value = pin;

        // Highlight the selected button temporarily
        const btn = document.querySelector(`[data-pin="${pin}"]`);
        if (btn)
        {
            const originalStyle = btn.style.background;
            btn.style.background = '#4CAF50';
            btn.style.color = 'white';

            setTimeout(() =>
            {
                btn.style.background = originalStyle;
                btn.style.color = '#4CAF50';
            }, 1000);
        }
    }

    generateRandomPin()
    {
        const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
        const newPinEl = document.getElementById('new-pin');
        const confirmPinEl = document.getElementById('confirm-pin');

        if (newPinEl) newPinEl.value = randomPin;
        if (confirmPinEl) confirmPinEl.value = randomPin;

        // Show the generated PIN briefly
        const btn = document.getElementById('generate-random-pin');
        if (btn)
        {
            const originalText = btn.innerHTML;
            btn.innerHTML = `🎲 ${randomPin}`;

            setTimeout(() =>
            {
                btn.innerHTML = originalText;
            }, 3000);
        }
    }

    // ============ CLOUD SYNC & AUTHENTICATION ============
    setupCloudEventListeners()
    {
        // Authentication form switching
        document.getElementById('show-sign-up')?.addEventListener('click', () => this.showSignUpForm());
        document.getElementById('show-sign-in')?.addEventListener('click', () => this.showSignInForm());

        // Authentication actions
        document.getElementById('sign-up')?.addEventListener('click', () => this.signUp());
        document.getElementById('sign-in')?.addEventListener('click', () => this.signIn());
        document.getElementById('sign-out')?.addEventListener('click', () => this.signOut());

        // Sync operations
        document.getElementById('sync-to-cloud')?.addEventListener('click', () => this.syncToCloud());
        document.getElementById('sync-from-cloud')?.addEventListener('click', () => this.syncFromCloud());
        document.getElementById('force-sync')?.addEventListener('click', () => this.forceSync());

        // Backup operations
        document.getElementById('create-backup')?.addEventListener('click', () => this.createBackup());
        document.getElementById('test-connection')?.addEventListener('click', () => this.testConnection());
        document.getElementById('export-cloud-data')?.addEventListener('click', () => this.exportCloudData());

        // Enter key handlers
        document.getElementById('auth-password')?.addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.signIn();
        });
        document.getElementById('signup-confirm')?.addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.signUp();
        });
    }

    async initializeSupabaseFeatures()
    {
        try
        {
            await this.checkSupabaseStatus();
        } catch (error)
        {
            console.error('❌ Failed to initialize Supabase features:', error);
        }
    }

    async checkSupabaseStatus()
    {
        try
        {
            console.log('🔍 Checking Supabase connection status...');

            const response = await this.sendMessage({ action: 'getSupabaseStatus' });

            if (response.status.connected)
            {
                this.updateConnectionStatus('Connected', response.status.project || 'Fokus Database', 'Authenticated');

                if (response.isAuthenticated && response.user)
                {
                    this.showUserDashboard(response.user);
                } else
                {
                    this.showSignInForm();
                }
            } else
            {
                this.updateConnectionStatus('Not Connected', response.status.reason, 'Not authenticated');
                this.showSignInForm();
            }
        } catch (error)
        {
            console.error('❌ Failed to check Supabase status:', error);
            this.updateConnectionStatus('Error', 'Connection failed', 'Error');
            this.showSignInForm();
        }
    }

    updateConnectionStatus(status, project, auth)
    {
        const elements = {
            connectionState: document.getElementById('connection-state'),
            projectName: document.getElementById('project-name'),
            authState: document.getElementById('auth-state')
        };

        if (elements.connectionState)
        {
            elements.connectionState.textContent = status;
            elements.connectionState.style.color = status === 'Connected' ? '#4CAF50' :
                status === 'Not Connected' ? '#ff9800' : '#f44336';
        }

        if (elements.projectName)
        {
            elements.projectName.textContent = project;
        }

        if (elements.authState)
        {
            elements.authState.textContent = auth;
            elements.authState.style.color = auth === 'Authenticated' ? '#4CAF50' : '#666';
        }
    }

    showSignInForm()
    {
        this.hideAllAuthForms();
        const signInForm = document.getElementById('sign-in-form');
        if (signInForm)
        {
            signInForm.classList.add('active');
        }
    }

    showSignUpForm()
    {
        this.hideAllAuthForms();
        const signUpForm = document.getElementById('sign-up-form');
        if (signUpForm)
        {
            signUpForm.classList.add('active');
        }
    }

    showUserDashboard(user)
    {
        this.hideAllAuthForms();
        const dashboard = document.getElementById('user-dashboard');
        if (dashboard)
        {
            dashboard.classList.add('active');

            const emailElement = document.getElementById('current-user-email');
            if (emailElement)
            {
                emailElement.textContent = user.email;
            }

            this.loadSyncStatus();
            this.loadCloudBackups();
            this.loadSyncStatistics();
        }
    }

    hideAllAuthForms()
    {
        const forms = ['sign-in-form', 'sign-up-form', 'user-dashboard'];
        forms.forEach(formId =>
        {
            const form = document.getElementById(formId);
            if (form)
            {
                form.classList.remove('active');
            }
        });
    }

    async signUp()
    {
        const email = document.getElementById('signup-email')?.value.trim();
        const password = document.getElementById('signup-password')?.value;
        const confirm = document.getElementById('signup-confirm')?.value;
        const messageEl = document.getElementById('signup-message');

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

        try
        {
            this.showMessage(messageEl, 'Creating account...', 'info');

            const response = await this.sendMessage({
                action: 'signUp',
                email,
                password
            });

            if (response.success)
            {
                if (response.needsConfirmation)
                {
                    this.showMessage(messageEl, '✅ Account created! Please check your email for confirmation, then sign in.', 'success');
                    setTimeout(() => this.showSignInForm(), 3000);
                } else
                {
                    this.showMessage(messageEl, '✅ Account created and signed in successfully!', 'success');
                    setTimeout(() =>
                    {
                        this.showUserDashboard(response.user);
                        this.checkSupabaseStatus();
                    }, 1500);
                }
            }
        } catch (error)
        {
            this.showMessage(messageEl, `❌ Sign up failed: ${error.message}`, 'error');
        }
    }

    async signIn()
    {
        const email = document.getElementById('auth-email')?.value.trim();
        const password = document.getElementById('auth-password')?.value;
        const messageEl = document.getElementById('auth-message');

        if (!email || !password)
        {
            this.showMessage(messageEl, 'Please enter email and password.', 'error');
            return;
        }

        try
        {
            this.showMessage(messageEl, 'Signing in...', 'info');

            const response = await this.sendMessage({
                action: 'signIn',
                email,
                password
            });

            if (response.success)
            {
                this.showMessage(messageEl, '✅ Signed in successfully!', 'success');
                setTimeout(() =>
                {
                    this.showUserDashboard(response.user);
                    this.checkSupabaseStatus();
                    this.loadAllSettings(); // Reload settings after sign in
                }, 1500);
            }
        } catch (error)
        {
            this.showMessage(messageEl, `❌ Sign in failed: ${error.message}`, 'error');
        }
    }

    async signOut()
    {
        if (!confirm('Sign out and stop cloud sync?')) return;

        try
        {
            const response = await this.sendMessage({ action: 'signOut' });

            if (response.success)
            {
                this.showSignInForm();
                this.updateConnectionStatus('Connected', 'Fokus Database', 'Not authenticated');
                this.showSuccess('✅ Signed out successfully!');
            }
        } catch (error)
        {
            this.showError(`❌ Sign out failed: ${error.message}`);
        }
    }

    async syncToCloud()
    {
        const button = document.getElementById('sync-to-cloud');
        if (!button) return;

        const originalHTML = button.innerHTML;

        button.innerHTML = '<span>⏳</span><span>Uploading...</span>';
        button.disabled = true;

        try
        {
            const response = await this.sendMessage({ action: 'syncToCloud' });

            if (response.success)
            {
                button.innerHTML = '<span>✅</span><span>Uploaded!</span>';
                this.loadSyncStatus();
                this.showSuccess('✅ Settings uploaded to cloud successfully!');
            } else
            {
                button.innerHTML = '<span>❌</span><span>Failed</span>';
                this.showError('❌ Failed to upload settings to cloud');
            }
        } catch (error)
        {
            button.innerHTML = '<span>❌</span><span>Failed</span>';
            this.showError(`❌ Upload failed: ${error.message}`);
        } finally
        {
            setTimeout(() =>
            {
                button.innerHTML = originalHTML;
                button.disabled = false;
            }, 2000);
        }
    }

    async syncFromCloud()
    {
        const button = document.getElementById('sync-from-cloud');
        if (!button) return;

        const originalHTML = button.innerHTML;

        button.innerHTML = '<span>⏳</span><span>Downloading...</span>';
        button.disabled = true;

        try
        {
            const response = await this.sendMessage({ action: 'syncFromCloud' });

            if (response.success)
            {
                if (response.action === 'downloaded')
                {
                    button.innerHTML = '<span>✅</span><span>Downloaded!</span>';
                    this.loadAllSettings(); // Reload UI with new settings
                    this.showSuccess('✅ Settings downloaded from cloud successfully!');
                } else if (response.action === 'up_to_date')
                {
                    button.innerHTML = '<span>✅</span><span>Up to date!</span>';
                    this.showSuccess('✅ Local settings are already up to date!');
                } else
                {
                    button.innerHTML = '<span>✅</span><span>Uploaded!</span>';
                    this.showSuccess('✅ Local settings uploaded to cloud!');
                }
                this.loadSyncStatus();
            } else
            {
                button.innerHTML = '<span>❌</span><span>Failed</span>';
                this.showError('❌ Failed to download settings from cloud');
            }
        } catch (error)
        {
            button.innerHTML = '<span>❌</span><span>Failed</span>';
            this.showError(`❌ Download failed: ${error.message}`);
        } finally
        {
            setTimeout(() =>
            {
                button.innerHTML = originalHTML;
                button.disabled = false;
            }, 2000);
        }
    }

    async forceSync()
    {
        const button = document.getElementById('force-sync');
        if (!button) return;

        const originalHTML = button.innerHTML;

        button.innerHTML = '<span>⏳</span><span>Syncing...</span>';
        button.disabled = true;

        try
        {
            // Force upload first, then download
            await this.sendMessage({ action: 'syncToCloud' });
            const response = await this.sendMessage({ action: 'syncFromCloud' });

            button.innerHTML = '<span>✅</span><span>Synced!</span>';
            this.loadSyncStatus();
            this.loadAllSettings();
            this.showSuccess('✅ Full sync completed successfully!');
        } catch (error)
        {
            button.innerHTML = '<span>❌</span><span>Failed</span>';
            this.showError(`❌ Sync failed: ${error.message}`);
        } finally
        {
            setTimeout(() =>
            {
                button.innerHTML = originalHTML;
                button.disabled = false;
            }, 2000);
        }
    }

    async createBackup()
    {
        const nameInput = document.getElementById('backup-name');
        const name = nameInput?.value.trim() || `Backup ${new Date().toLocaleDateString()}`;

        try
        {
            const response = await this.sendMessage({
                action: 'createBackup',
                name
            });

            if (response)
            {
                if (nameInput) nameInput.value = '';
                this.loadCloudBackups();
                this.showSuccess(`✅ Backup "${name}" created successfully!`);
            }
        } catch (error)
        {
            this.showError(`❌ Failed to create backup: ${error.message}`);
        }
    }

    async loadSyncStatus()
    {
        try
        {
            const data = await chrome.storage.local.get(['lastCloudSync', 'lastSyncDirection']);
            const lastSync = data.lastCloudSync;

            const syncStatusEl = document.getElementById('sync-status');
            const lastSyncEl = document.getElementById('last-sync-time');

            if (lastSync)
            {
                const date = new Date(lastSync);
                if (lastSyncEl) lastSyncEl.textContent = date.toLocaleString();
                if (syncStatusEl)
                {
                    syncStatusEl.textContent = 'Synced';
                    syncStatusEl.style.color = '#4CAF50';
                }
            } else
            {
                if (lastSyncEl) lastSyncEl.textContent = 'Never';
                if (syncStatusEl)
                {
                    syncStatusEl.textContent = 'Not synced';
                    syncStatusEl.style.color = '#ff9800';
                }
            }
        } catch (error)
        {
            console.error('❌ Failed to load sync status:', error);
        }
    }

    async loadCloudBackups()
    {
        const container = document.getElementById('cloud-backups-list');
        if (!container) return;

        try
        {
            const response = await this.sendMessage({ action: 'getCloudBackups' });
            const backups = response.backups || [];

            if (backups.length === 0)
            {
                container.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No cloud backups found</div>';
                return;
            }

            container.innerHTML = backups.map(backup => `
                <div class="list-item">
                    <div style="flex: 1;">
                        <strong>${this.escapeHtml(backup.name)}</strong>
                        <div style="font-size: 12px; color: #666; margin-top: 2px;">
                            Created: ${new Date(backup.created_at).toLocaleString()}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" 
                                onclick="optionsManager.restoreBackup('${backup.id}')">
                            ♻️ Restore
                        </button>
                        <button class="remove-btn" onclick="optionsManager.deleteBackup('${backup.id}')">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error)
        {
            container.innerHTML = '<div style="text-align: center; color: #f44336; padding: 20px;">Failed to load backups</div>';
            console.error('❌ Failed to load cloud backups:', error);
        }
    }

    async restoreBackup(backupId)
    {
        if (!confirm('Restore this backup? This will overwrite your current settings.')) return;

        try
        {
            const response = await this.sendMessage({
                action: 'restoreBackup',
                backupId
            });

            if (response.success)
            {
                this.loadAllSettings();
                this.loadSyncStatus();
                this.showSuccess('✅ Backup restored successfully!');
            }
        } catch (error)
        {
            this.showError(`❌ Failed to restore backup: ${error.message}`);
        }
    }

    async deleteBackup(backupId)
    {
        if (!confirm('Delete this backup? This action cannot be undone.')) return;

        try
        {
            const response = await this.sendMessage({
                action: 'deleteBackup',
                backupId
            });

            if (response.success)
            {
                this.loadCloudBackups();
                this.showSuccess('✅ Backup deleted successfully!');
            }
        } catch (error)
        {
            this.showError(`❌ Failed to delete backup: ${error.message}`);
        }
    }

    async testConnection()
    {
        const button = document.getElementById('test-connection');
        if (!button) return;

        const originalText = button.textContent;

        button.textContent = '🔧 Testing...';
        button.disabled = true;

        try
        {
            const response = await this.sendMessage({ action: 'getSupabaseStatus' });

            if (response.status.connected)
            {
                button.textContent = '✅ Connected!';
                alert(`✅ Connection Test Successful!\n\n` +
                    `Status: Connected\n` +
                    `Project: ${response.status.project || 'Fokus Database'}\n` +
                    `User: ${response.user ? response.user.email : 'Not authenticated'}\n` +
                    `Authentication: ${response.isAuthenticated ? 'Valid' : 'Invalid'}`);
            } else
            {
                button.textContent = '❌ Failed';
                alert(`❌ Connection Test Failed!\n\nReason: ${response.status.reason}`);
            }
        } catch (error)
        {
            button.textContent = '❌ Error';
            alert(`❌ Connection Test Error!\n\n${error.message}`);
        } finally
        {
            setTimeout(() =>
            {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);
        }
    }

    async exportCloudData()
    {
        try
        {
            const response = await this.sendMessage({ action: 'getCloudBackups' });
            const statusResponse = await this.sendMessage({ action: 'getSupabaseStatus' });

            const exportData = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                user: statusResponse.user,
                backups: response.backups || [],
                syncStatus: statusResponse.status
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `fokus-cloud-data-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showSuccess('✅ Cloud data exported successfully!');
        } catch (error)
        {
            this.showError(`❌ Failed to export cloud data: ${error.message}`);
        }
    }

    async loadSyncStatistics()
    {
        try
        {
            const data = await chrome.storage.local.get(['totalSyncs']);

            // Show statistics section
            const statsSection = document.getElementById('sync-statistics');
            if (statsSection)
            {
                statsSection.style.display = 'block';
            }

            // Update counters
            const totalSyncsEl = document.getElementById('total-syncs');
            if (totalSyncsEl)
            {
                totalSyncsEl.textContent = data.totalSyncs || 0;
            }

            // Get backup count from cloud
            try
            {
                const response = await this.sendMessage({ action: 'getCloudBackups' });
                const totalBackupsEl = document.getElementById('total-backups');
                if (totalBackupsEl)
                {
                    totalBackupsEl.textContent = (response.backups || []).length;
                }
            } catch (error)
            {
                const totalBackupsEl = document.getElementById('total-backups');
                if (totalBackupsEl)
                {
                    totalBackupsEl.textContent = '?';
                }
            }

            // Estimate data usage
            const estimatedSize = this.estimateDataSize();
            const dataUsageEl = document.getElementById('data-usage');
            if (dataUsageEl)
            {
                dataUsageEl.textContent = this.formatBytes(estimatedSize);
            }

        } catch (error)
        {
            console.error('❌ Failed to load sync statistics:', error);
        }
    }

    // ============ KEYWORDS MANAGEMENT ============
    setupKeywordsEventListeners()
    {
        document.getElementById('add-keyword')?.addEventListener('click', () => this.addKeyword());
        document.getElementById('new-keyword')?.addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.addKeyword();
        });
        document.getElementById('reset-keywords')?.addEventListener('click', () => this.resetKeywords());
        document.getElementById('clear-keywords')?.addEventListener('click', () => this.clearKeywords());
    }

    async loadKeywords()
    {
        try
        {
            const data = await chrome.storage.local.get(['blockedKeywords']);
            const keywords = data.blockedKeywords || this.defaultKeywords;
            this.renderKeywordsList(keywords);
        } catch (error)
        {
            console.error('❌ Failed to load keywords:', error);
            this.renderKeywordsList(this.defaultKeywords);
            this.showError('Failed to load keywords, showing defaults');
        }
    }

    renderKeywordsList(keywords)
    {
        const container = document.getElementById('keywords-list');
        if (!container) return;

        if (keywords.length === 0)
        {
            container.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No keywords blocked</div>';
            return;
        }

        container.innerHTML = keywords.map(keyword => `
            <div class="list-item">
                <span>${this.escapeHtml(keyword)}</span>
                <button class="remove-btn" onclick="optionsManager.removeKeyword('${this.escapeHtml(keyword)}')">
                    🗑️ Remove
                </button>
            </div>
        `).join('');
    }

    async addKeyword()
    {
        const input = document.getElementById('new-keyword');
        if (!input) return;

        const keyword = input.value.trim().toLowerCase();

        if (!keyword)
        {
            this.showError('Please enter a keyword.');
            return;
        }

        if (keyword.length < 2)
        {
            this.showError('Keyword must be at least 2 characters long.');
            return;
        }

        try
        {
            const data = await chrome.storage.local.get(['blockedKeywords']);
            const currentKeywords = data.blockedKeywords || this.defaultKeywords;

            if (currentKeywords.includes(keyword))
            {
                this.showError('This keyword is already blocked.');
                return;
            }

            const updatedKeywords = [...currentKeywords, keyword];
            await chrome.storage.local.set({ blockedKeywords: updatedKeywords });

            // Notify background script
            try
            {
                await this.sendMessage({ action: 'addKeyword', keyword });
            } catch (bgError)
            {
                console.log('Background script not responding, but keyword was saved to storage');
            }

            input.value = '';
            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess('Keyword added successfully!');

        } catch (error)
        {
            console.error('❌ Add keyword error:', error);
            this.showError('Failed to add keyword. Please try again.');
        }
    }

    async removeKeyword(keyword)
    {
        if (!confirm(`Remove keyword "${keyword}"?`)) return;

        try
        {
            const data = await chrome.storage.local.get(['blockedKeywords']);
            const currentKeywords = data.blockedKeywords || this.defaultKeywords;
            const updatedKeywords = currentKeywords.filter(k => k !== keyword);

            await chrome.storage.local.set({ blockedKeywords: updatedKeywords });

            // Notify background script
            try
            {
                await this.sendMessage({ action: 'removeKeyword', keyword });
            } catch (bgError)
            {
                console.log('Background script not responding, but keyword was removed from storage');
            }

            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess('Keyword removed successfully!');

        } catch (error)
        {
            console.error('❌ Remove keyword error:', error);
            this.showError('Failed to remove keyword. Please try again.');
        }
    }

    async resetKeywords()
    {
        if (!confirm('Reset to default keywords? This will replace all current keywords.')) return;

        try
        {
            await chrome.storage.local.set({ blockedKeywords: this.defaultKeywords });
            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess('Keywords reset to defaults!');
        } catch (error)
        {
            this.showError('Failed to reset keywords.');
        }
    }

    async clearKeywords()
    {
        if (!confirm('Clear all keywords? This will remove all keyword blocking.')) return;

        try
        {
            await chrome.storage.local.set({ blockedKeywords: [] });
            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess('All keywords cleared!');
        } catch (error)
        {
            this.showError('Failed to clear keywords.');
        }
    }

    // ============ DOMAINS MANAGEMENT ============
    setupDomainsEventListeners()
    {
        document.getElementById('add-domain')?.addEventListener('click', () => this.addDomain());
        document.getElementById('new-domain')?.addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.addDomain();
        });
        document.getElementById('clear-domains')?.addEventListener('click', () => this.clearDomains());
    }

    async loadDomains()
    {
        try
        {
            const data = await chrome.storage.local.get(['customDomains']);
            const domains = data.customDomains || [];
            this.renderDomainsList(domains);
        } catch (error)
        {
            this.showError('Failed to load domains');
        }
    }

    renderDomainsList(domains)
    {
        const container = document.getElementById('domains-list');
        if (!container) return;

        if (domains.length === 0)
        {
            container.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No custom domains blocked</div>';
            return;
        }

        container.innerHTML = domains.map(domain => `
            <div class="list-item">
                <span>${this.escapeHtml(domain)}</span>
                <button class="remove-btn" onclick="optionsManager.removeDomain('${this.escapeHtml(domain)}')">
                    🗑️ Remove
                </button>
            </div>
        `).join('');
    }

    async addDomain()
    {
        const input = document.getElementById('new-domain');
        if (!input) return;

        let domain = input.value.trim().toLowerCase();

        if (!domain)
        {
            this.showError('Please enter a domain.');
            return;
        }

        // Clean up domain input
        domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

        if (!this.isValidDomain(domain))
        {
            this.showError('Please enter a valid domain.');
            return;
        }

        try
        {
            const response = await this.sendMessage({ action: 'addCustomDomain', domain });
            if (response.success)
            {
                input.value = '';
                await this.loadDomains();
                await this.loadStats();
                this.showSuccess('Domain added successfully!');
            }
        } catch (error)
        {
            this.showError('Failed to add domain.');
        }
    }

    async removeDomain(domain)
    {
        if (!confirm(`Remove domain "${domain}"?`)) return;

        try
        {
            const response = await this.sendMessage({ action: 'removeCustomDomain', domain });
            if (response.success)
            {
                await this.loadDomains();
                await this.loadStats();
                this.showSuccess('Domain removed successfully!');
            }
        } catch (error)
        {
            this.showError('Failed to remove domain.');
        }
    }

    async clearDomains()
    {
        if (!confirm('Clear all custom domains?')) return;

        try
        {
            await chrome.storage.local.set({ customDomains: [] });
            await this.loadDomains();
            await this.loadStats();
            this.showSuccess('All custom domains cleared!');
        } catch (error)
        {
            this.showError('Failed to clear domains.');
        }
    }

    // ============ BLOCKLIST MANAGEMENT ============
    setupBlocklistEventListeners()
    {
        document.getElementById('add-blocklist')?.addEventListener('click', () => this.addBlocklistSource());
        document.getElementById('force-update')?.addEventListener('click', () => this.forceUpdateBlocklist());
        document.getElementById('view-blocked-count')?.addEventListener('click', () => this.viewBlockedCount());
        document.getElementById('test-blocklist-url')?.addEventListener('click', () => this.testBlocklistUrl());
    }

    async loadBlocklistSources()
    {
        try
        {
            const response = await this.sendMessage({ action: 'getBlocklistUrls' });
            if (response)
            {
                this.renderBlocklistSources(response.urls, response.results);
                this.updateLastUpdateTime(response.results);
            }
        } catch (error)
        {
            console.error('❌ Failed to load blocklist sources:', error);
            this.showError('Failed to load blocklist sources');
        }
    }

    renderBlocklistSources(sources, results)
    {
        const container = document.getElementById('blocklists-container');
        if (!container) return;

        if (sources.length === 0)
        {
            container.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No blocklist sources configured</div>';
            return;
        }

        container.innerHTML = sources.map(source =>
        {
            const result = results.find(r => r.url === source.url) || {};
            const statusIcon = source.enabled ? (result.success ? '✅' : '❌') : '⏸️';
            const statusText = source.enabled ?
                (result.success ? `${result.domains || 0} domains` : 'Failed to load') :
                'Disabled';
            const lastUpdated = result.lastUpdated ?
                new Date(result.lastUpdated).toLocaleString() : 'Never';

            return `
                <div class="list-item" style="flex-direction: column; align-items: stretch;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="flex: 1;">
                            <strong>${this.escapeHtml(source.name)}</strong>
                            <div style="font-size: 12px; color: #666; margin-top: 2px;">
                                ${this.escapeHtml(source.description || 'No description')}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 12px;">${statusIcon} ${statusText}</span>
                            <label style="display: flex; align-items: center; gap: 5px; margin: 0;">
                                <input type="checkbox" ${source.enabled ? 'checked' : ''} 
                                       onchange="optionsManager.toggleBlocklistSource('${source.id}', this.checked)">
                                <span style="font-size: 12px;">Enable</span>
                            </label>
                            <button class="remove-btn" onclick="optionsManager.removeBlocklistSource('${source.id}')">
                                🗑️ Remove
                            </button>
                        </div>
                    </div>
                    <div style="font-size: 11px; color: #888; word-break: break-all;">
                        <strong>URL:</strong> ${this.escapeHtml(source.url)}
                    </div>
                    <div style="font-size: 11px; color: #888;">
                        <strong>Last Updated:</strong> ${lastUpdated}
                        ${result.error ? `<br><span style="color: #ff6b6b;">Error: ${this.escapeHtml(result.error)}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    updateLastUpdateTime(results)
    {
        const successfulResults = results.filter(r => r.success);
        const lastUpdateEl = document.getElementById('last-update');
        if (lastUpdateEl)
        {
            if (successfulResults.length > 0)
            {
                const latestUpdate = Math.max(...successfulResults.map(r => r.lastUpdated));
                const date = new Date(latestUpdate);
                lastUpdateEl.textContent = date.toLocaleString();
            } else
            {
                lastUpdateEl.textContent = 'Never';
            }
        }
    }

    async addBlocklistSource()
    {
        const name = document.getElementById('blocklist-name')?.value.trim();
        const url = document.getElementById('blocklist-url')?.value.trim();
        const description = document.getElementById('blocklist-description')?.value.trim();

        if (!name || !url)
        {
            this.showError('Please enter both name and URL for the blocklist source.');
            return;
        }

        if (!this.isValidGitHubRawUrl(url))
        {
            this.showError('Please enter a valid GitHub raw URL (e.g., https://raw.githubusercontent.com/...)');
            return;
        }

        const urlConfig = {
            id: 'custom-' + Date.now(),
            name: name,
            url: url,
            description: description,
            enabled: true
        };

        try
        {
            const response = await this.sendMessage({ action: 'addBlocklistUrl', urlConfig });
            if (response.success)
            {
                // Clear form
                ['blocklist-name', 'blocklist-url', 'blocklist-description'].forEach(id =>
                {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });

                await this.loadBlocklistSources();
                this.showSuccess('Blocklist source added successfully!');
            }
        } catch (error)
        {
            this.showError('Failed to add blocklist source.');
        }
    }

    async removeBlocklistSource(id)
    {
        if (!confirm('Remove this blocklist source? This will not trigger an immediate update.')) return;

        try
        {
            const response = await this.sendMessage({ action: 'removeBlocklistUrl', id });
            if (response.success)
            {
                await this.loadBlocklistSources();
                await this.loadStats();
                this.showSuccess('Blocklist source removed successfully!');
            }
        } catch (error)
        {
            this.showError('Failed to remove blocklist source.');
        }
    }

    async toggleBlocklistSource(id, enabled)
    {
        try
        {
            const response = await this.sendMessage({ action: 'toggleBlocklistUrl', id, enabled });
            if (response.success)
            {
                await this.loadBlocklistSources();
                this.showSuccess(`Blocklist source ${enabled ? 'enabled' : 'disabled'} successfully!`);
            }
        } catch (error)
        {
            this.showError('Failed to toggle blocklist source.');
        }
    }

    async addPopularBlocklist(type)
    {
        const popularSources = {
            'stevenblack-porn-only': {
                name: 'StevenBlack - Porn Only',
                url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts',
                description: 'Adult content domains only from StevenBlack'
            },
            'stevenblack-porn-social': {
                name: 'StevenBlack - Porn + Social Media',
                url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-social/hosts',
                description: 'Adult content + social media platforms'
            },
            'energized-porn': {
                name: 'Energized - Porn Pack',
                url: 'https://raw.githubusercontent.com/EnergizedProtection/block/master/porn/formats/hosts',
                description: 'Comprehensive adult content from Energized Protection'
            }
        };

        const sourceConfig = popularSources[type];
        if (!sourceConfig) return;

        const urlConfig = {
            id: type,
            name: sourceConfig.name,
            url: sourceConfig.url,
            description: sourceConfig.description,
            enabled: true
        };

        try
        {
            const response = await this.sendMessage({ action: 'addBlocklistUrl', urlConfig });
            if (response.success)
            {
                await this.loadBlocklistSources();
                this.showSuccess(`${sourceConfig.name} added successfully!`);
            }
        } catch (error)
        {
            this.showError('Failed to add popular blocklist source.');
        }
    }

    testBlocklistUrl()
    {
        const testUrl = document.getElementById('blocklist-url')?.value.trim();
        if (!testUrl)
        {
            alert('Please enter a URL to test.');
            return;
        }

        if (!this.isValidGitHubRawUrl(testUrl))
        {
            alert('❌ Invalid URL format.\n\nExpected format:\nhttps://raw.githubusercontent.com/owner/repo/branch/path/to/file\n\nExample:\nhttps://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts');
            return;
        }

        fetch(testUrl, { method: 'HEAD' })
            .then(response =>
            {
                if (response.ok)
                {
                    alert('✅ URL is valid and accessible!\n\nYou can now add this blocklist source.');
                } else
                {
                    alert(`❌ URL returned error: ${response.status} ${response.statusText}\n\nPlease check the URL and try again.`);
                }
            })
            .catch(error =>
            {
                alert(`❌ Failed to access URL: ${error.message}\n\nPlease check the URL and your internet connection.`);
            });
    }

    async forceUpdateBlocklist()
    {
        const button = document.getElementById('force-update');
        if (!button) return;

        const progressBar = document.getElementById('update-progress');
        const progressFill = document.getElementById('progress-fill');

        button.textContent = '🔄 Updating...';
        button.disabled = true;
        if (progressBar) progressBar.style.display = 'block';

        // Simulate progress
        let progress = 0;
        const progressInterval = setInterval(() =>
        {
            progress += 10;
            if (progressFill) progressFill.style.width = progress + '%';
            if (progress >= 90) clearInterval(progressInterval);
        }, 200);

        try
        {
            const response = await this.sendMessage({ action: 'forceUpdateBlocklist' });
            if// options.js - Complete rewrite with centralized Supabase configuration

class OptionsManager
                {
                    constructor()
                    {
                        this.isInitialized = false;
                        this.currentPin = null;
                        this.defaultKeywords = [
                            'adult', 'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw',
                            'explicit', 'mature', 'erotic', 'lesbian', 'gay', 'anal',
                            'oral', 'bdsm', 'fetish', 'webcam', 'escort', 'dating'
                        ];
                    }

                    async init()
                    {
                        console.log('🚀 Initializing Options Manager...');

                        try
                        {
                            this.setupEventListeners();
                            await this.loadAllSettings();
                            await this.initializeSupabaseFeatures();
                            this.updateBrowserInfo();

                            this.isInitialized = true;
                            console.log('✅ Options Manager initialized successfully');
                        } catch (error)
                        {
                            console.error('❌ Failed to initialize Options Manager:', error);
                            this.showError('Failed to initialize settings. Please refresh the page.');
                        }
                    }

                    setupEventListeners()
                    {
                        // PIN Management
                        this.setupPinEventListeners();

                        // Cloud Sync & Authentication
                        this.setupCloudEventListeners();

                        // Keywords Management
                        this.setupKeywordsEventListeners();

                        // Domains Management
                        this.setupDomainsEventListeners();

                        // Blocklist Management
                        this.setupBlocklistEventListeners();

                        // Backup & Restore
                        this.setupBackupEventListeners();

                        // Extension Status
                        this.setupStatusEventListeners();

                        // Advanced Settings
                        this.setupAdvancedEventListeners();
                    }

                    // ============ PIN MANAGEMENT ============
                    setupPinEventListeners()
                    {
                        // Show/hide PIN
                        document.getElementById('show-pin')?.addEventListener('click', () => this.togglePinVisibility());
                        document.getElementById('copy-pin')?.addEventListener('click', () => this.copyPin());

                        // PIN change
                        document.getElementById('change-pin')?.addEventListener('click', () => this.changePIN());
                        document.getElementById('reset-to-default')?.addEventListener('click', () => this.resetPinToDefault());

                        // Quick PIN buttons
                        document.querySelectorAll('.quick-pin-btn').forEach(btn =>
                        {
                            btn.addEventListener('click', () => this.useQuickPin(btn.dataset.pin));
                        });
                        document.getElementById('generate-random-pin')?.addEventListener('click', () => this.generateRandomPin());

                        // Enter key handlers
                        document.getElementById('confirm-pin')?.addEventListener('keypress', (e) =>
                        {
                            if (e.key === 'Enter') this.changePIN();
                        });
                    }

                    async loadCurrentPin()
                    {
                        try
                        {
                            const data = await chrome.storage.local.get(['pin']);
                            this.currentPin = data.pin || '1234';
                            this.updatePinDisplay();
                        } catch (error)
                        {
                            console.error('❌ Failed to load current PIN:', error);
                            this.currentPin = '1234';
                        }
                    }

                    updatePinDisplay()
                    {
                        const display = document.getElementById('current-pin-display');
                        if (display)
                        {
                            display.textContent = '••••';
                            display.dataset.pin = this.currentPin;
                        }
                    }

                    togglePinVisibility()
                    {
                        const display = document.getElementById('current-pin-display');
                        const btn = document.getElementById('show-pin');

                        if (display.textContent === '••••')
                        {
                            display.textContent = this.currentPin;
                            btn.innerHTML = '🙈 Hide PIN';

                            // Auto-hide after 5 seconds
                            setTimeout(() =>
                            {
                                if (display.textContent === this.currentPin)
                                {
                                    display.textContent = '••••';
                                    btn.innerHTML = '👁️ Show PIN';
                                }
                            }, 5000);
                        } else
                        {
                            display.textContent = '••••';
                            btn.innerHTML = '👁️ Show PIN';
                        }
                    }

                    async copyPin()
                    {
                        try
                        {
                            await navigator.clipboard.writeText(this.currentPin);
                            const btn = document.getElementById('copy-pin');
                            const originalText = btn.innerHTML;
                            btn.innerHTML = '✅ Copied!';
                            setTimeout(() =>
                            {
                                btn.innerHTML = originalText;
                            }, 2000);
                        } catch (error)
                        {
                            console.error('❌ Failed to copy PIN:', error);
                            alert('Failed to copy PIN to clipboard');
                        }
                    }

                    async changePIN()
                    {
                        const currentPin = document.getElementById('current-pin')?.value;
                        const newPin = document.getElementById('new-pin')?.value;
                        const confirmPin = document.getElementById('confirm-pin')?.value;
                        const messageEl = document.getElementById('pin-message');

                        if (!messageEl) return;

                        // Clear previous messages
                        messageEl.innerHTML = '';

                        if (!currentPin || !newPin || !confirmPin)
                        {
                            this.showMessage(messageEl, 'Please fill in all PIN fields.', 'error');
                            return;
                        }

                        if (currentPin !== this.currentPin)
                        {
                            this.showMessage(messageEl, 'Current PIN is incorrect.', 'error');
                            return;
                        }

                        if (newPin !== confirmPin)
                        {
                            this.showMessage(messageEl, 'New PINs do not match.', 'error');
                            return;
                        }

                        if (newPin.length < 4)
                        {
                            this.showMessage(messageEl, 'PIN must be at least 4 characters.', 'error');
                            return;
                        }

                        if (!/^\d+$/.test(newPin))
                        {
                            this.showMessage(messageEl, 'PIN should contain only numbers.', 'error');
                            return;
                        }

                        try
                        {
                            await chrome.storage.local.set({ pin: newPin });
                            this.currentPin = newPin;
                            this.updatePinDisplay();

                            this.showMessage(messageEl, 'PIN changed successfully! 🎉', 'success');

                            // Clear form
                            ['current-pin', 'new-pin', 'confirm-pin'].forEach(id =>
                            {
                                const el = document.getElementById(id);
                                if (el) el.value = '';
                            });

                        } catch (error)
                        {
                            console.error('❌ PIN change error:', error);
                            this.showMessage(messageEl, 'Failed to change PIN. Please try again.', 'error');
                        }
                    }

                    async resetPinToDefault()
                    {
                        if (!confirm('Reset PIN to default (1234)?')) return;

                        try
                        {
                            await chrome.storage.local.set({ pin: '1234' });
                            this.currentPin = '1234';
                            this.updatePinDisplay();

                            const messageEl = document.getElementById('pin-message');
                            if (messageEl)
                            {
                                this.showMessage(messageEl, 'PIN reset to default (1234) successfully!', 'success');
                            }
                        } catch (error)
                        {
                            console.error('❌ PIN reset error:', error);
                            const messageEl = document.getElementById('pin-message');
                            if (messageEl)
                            {
                                this.showMessage(messageEl, 'Failed to reset PIN. Please try again.', 'error');
                            }
                        }
                    }

                    useQuickPin(pin)
                    {
                        const newPinEl = document.getElementById('new-pin');
                        const confirmPinEl = document.getElementById('confirm-pin');

                        if (newPinEl) newPinEl.value = pin;
                        if (confirmPinEl) confirmPinEl.value = pin;

                        // Highlight the selected button temporarily
                        const btn = document.querySelector(`[data-pin="${pin}"]`);
                        if (btn)
                        {
                            const originalStyle = btn.style.background;
                            btn.style.background = '#4CAF50';
                            btn.style.color = 'white';

                            setTimeout(() =>
                            {
                                btn.style.background = originalStyle;
                                btn.style.color = '#4CAF50';
                            }, 1000);
                        }
                    }

                    generateRandomPin()
                    {
                        const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
                        const newPinEl = document.getElementById('new-pin');
                        const confirmPinEl = document.getElementById('confirm-pin');

                        if (newPinEl) newPinEl.value = randomPin;
                        if (confirmPinEl) confirmPinEl.value = randomPin;

                        // Show the generated PIN briefly
                        const btn = document.getElementById('generate-random-pin');
                        if (btn)
                        {
                            const originalText = btn.innerHTML;
                            btn.innerHTML = `🎲 ${randomPin}`;

                            setTimeout(() =>
                            {
                                btn.innerHTML = originalText;
                            }, 3000);
                        }
                    }

                    // ============ CLOUD SYNC & AUTHENTICATION ============
                    setupCloudEventListeners()
                    {
                        // Authentication form switching
                        document.getElementById('show-sign-up')?.addEventListener('click', () => this.showSignUpForm());
                        document.getElementById('show-sign-in')?.addEventListener('click', () => this.showSignInForm());

                        // Authentication actions
                        document.getElementById('sign-up')?.addEventListener('click', () => this.signUp());
                        document.getElementById('sign-in')?.addEventListener('click', () => this.signIn());
                        document.getElementById('sign-out')?.addEventListener('click', () => this.signOut());

                        // Sync operations
                        document.getElementById('sync-to-cloud')?.addEventListener('click', () => this.syncToCloud());
                        document.getElementById('sync-from-cloud')?.addEventListener('click', () => this.syncFromCloud());
                        document.getElementById('force-sync')?.addEventListener('click', () => this.forceSync());

                        // Backup operations
                        document.getElementById('create-backup')?.addEventListener('click', () => this.createBackup());
                        document.getElementById('test-connection')?.addEventListener('click', () => this.testConnection());
                        document.getElementById('export-cloud-data')?.addEventListener('click', () => this.exportCloudData());

                        // Enter key handlers
                        document.getElementById('auth-password')?.addEventListener('keypress', (e) =>
                        {
                            if (e.key === 'Enter') this.signIn();
                        });
                        document.getElementById('signup-confirm')?.addEventListener('keypress', (e) =>
                        {
                            if (e.key === 'Enter') this.signUp();
                        });
                    }

                    async initializeSupabaseFeatures()
                    {
                        try
                        {
                            await this.checkSupabaseStatus();
                        } catch (error)
                        {
                            console.error('❌ Failed to initialize Supabase features:', error);
                        }
                    }

                    async checkSupabaseStatus()
                    {
                        try
                        {
                            console.log('🔍 Checking Supabase connection status...');

                            const response = await this.sendMessage({ action: 'getSupabaseStatus' });

                            if (response.status.connected)
                            {
                                this.updateConnectionStatus('Connected', response.status.project || 'Fokus Database', 'Authenticated');

                                if (response.isAuthenticated && response.user)
                                {
                                    this.showUserDashboard(response.user);
                                } else
                                {
                                    this.showSignInForm();
                                }
                            } else
                            {
                                this.updateConnectionStatus('Not Connected', response.status.reason, 'Not authenticated');
                                this.showSignInForm();
                            }
                        } catch (error)
                        {
                            console.error('❌ Failed to check Supabase status:', error);
                            this.updateConnectionStatus('Error', 'Connection failed', 'Error');
                            this.showSignInForm();
                        }
                    }

                    updateConnectionStatus(status, project, auth)
                    {
                        const elements = {
                            connectionState: document.getElementById('connection-state'),
                            projectName: document.getElementById('project-name'),
                            authState: document.getElementById('auth-state')
                        };

                        if (elements.connectionState)
                        {
                            elements.connectionState.textContent = status;
                            elements.connectionState.style.color = status === 'Connected' ? '#4CAF50' :
                                status === 'Not Connected' ? '#ff9800' : '#f44336';
                        }

                        if (elements.projectName)
                        {
                            elements.projectName.textContent = project;
                        }

                        if (elements.authState)
                        {
                            elements.authState.textContent = auth;
                            elements.authState.style.color = auth === 'Authenticated' ? '#4CAF50' : '#666';
                        }
                    }

                    showSignInForm()
                    {
                        this.hideAllAuthForms();
                        const signInForm = document.getElementById('sign-in-form');
                        if (signInForm)
                        {
                            signInForm.classList.add('active');
                        }
                    }

                    showSignUpForm()
                    {
                        this.hideAllAuthForms();
                        const signUpForm = document.getElementById('sign-up-form');
                        if (signUpForm)
                        {
                            signUpForm.classList.add('active');
                        }
                    }

                    showUserDashboard(user)
                    {
                        this.hideAllAuthForms();
                        const dashboard = document.getElementById('user-dashboard');
                        if (dashboard)
                        {
                            dashboard.classList.add('active');

                            const emailElement = document.getElementById('current-user-email');
                            if (emailElement)
                            {
                                emailElement.textContent = user.email;
                            }

                            this.loadSyncStatus();
                            this.loadCloudBackups();
                            this.loadSyncStatistics();
                        }
                    }

                    hideAllAuthForms()
                    {
                        const forms = ['sign-in-form', 'sign-up-form', 'user-dashboard'];
                        forms.forEach(formId =>
                        {
                            const form = document.getElementById(formId);
                            if (form)
                            {
                                form.classList.remove('active');
                            }
                        });
                    }

                    async signUp()
                    {
                        const email = document.getElementById('signup-email')?.value.trim();
                        const password = document.getElementById('signup-password')?.value;
                        const confirm = document.getElementById('signup-confirm')?.value;
                        const messageEl = document.getElementById('signup-message');

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

                        try
                        {
                            this.showMessage(messageEl, 'Creating account...', 'info');

                            const response = await this.sendMessage({
                                action: 'signUp',
                                email,
                                password
                            });

                            if (response.success)
                            {
                                if (response.needsConfirmation)
                                {
                                    this.showMessage(messageEl, '✅ Account created! Please check your email for confirmation, then sign in.', 'success');
                                    setTimeout(() => this.showSignInForm(), 3000);
                                } else
                                {
                                    this.showMessage(messageEl, '✅ Account created and signed in successfully!', 'success');
                                    setTimeout(() =>
                                    {
                                        this.showUserDashboard(response.user);
                                        this.checkSupabaseStatus();
                                    }, 1500);
                                }
                            }
                        } catch (error)
                        {
                            this.showMessage(messageEl, `❌ Sign up failed: ${error.message}`, 'error');
                        }
                    }

                    async signIn()
                    {
                        const email = document.getElementById('auth-email')?.value.trim();
                        const password = document.getElementById('auth-password')?.value;
                        const messageEl = document.getElementById('auth-message');

                        if (!email || !password)
                        {
                            this.showMessage(messageEl, 'Please enter email and password.', 'error');
                            return;
                        }

                        try
                        {
                            this.showMessage(messageEl, 'Signing in...', 'info');

                            const response = await this.sendMessage({
                                action: 'signIn',
                                email,
                                password
                            });

                            if (response.success)
                            {
                                this.showMessage(messageEl, '✅ Signed in successfully!', 'success');
                                setTimeout(() =>
                                {
                                    this.showUserDashboard(response.user);
                                    this.checkSupabaseStatus();
                                    this.loadAllSettings(); // Reload settings after sign in
                                }, 1500);
                            }
                        } catch (error)
                        {
                            this.showMessage(messageEl, `❌ Sign in failed: ${error.message}`, 'error');
                        }
                    }

                    async signOut()
                    {
                        if (!confirm('Sign out and stop cloud sync?')) return;

                        try
                        {
                            const response = await this.sendMessage({ action: 'signOut' });

                            if (response.success)
                            {
                                this.showSignInForm();
                                this.updateConnectionStatus('Connected', 'Fokus Database', 'Not authenticated');
                                this