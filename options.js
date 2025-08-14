// options.js - Complete implementation for Fokus Extension Settings

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

            if (response && response.status && response.status.connected)
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
                this.updateConnectionStatus('Not Connected', response?.status?.reason || 'Unknown error', 'Not authenticated');
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

            if (response && response.success)
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
            } else
            {
                this.showMessage(messageEl, '❌ Sign up failed: ' + (response?.error || 'Unknown error'), 'error');
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

            if (response && response.success)
            {
                this.showMessage(messageEl, '✅ Signed in successfully!', 'success');
                setTimeout(() =>
                {
                    this.showUserDashboard(response.user);
                    this.checkSupabaseStatus();
                    this.loadAllSettings(); // Reload settings after sign in
                }, 1500);
            } else
            {
                this.showMessage(messageEl, '❌ Sign in failed: ' + (response?.error || 'Invalid credentials'), 'error');
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

            if (response && response.success)
            {
                this.showSignInForm();
                this.updateConnectionStatus('Connected', 'Fokus Database', 'Not authenticated');
                this.showSuccess('✅ Signed out successfully!');
            } else
            {
                this.showError('❌ Sign out failed');
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

            if (response && response.success)
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

            if (response && response.success)
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
            const backups = response?.backups || [];

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

            if (response && response.success)
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

            if (response && response.success)
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

            if (response && response.status && response.status.connected)
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
                alert(`❌ Connection Test Failed!\n\nReason: ${response?.status?.reason || 'Unknown error'}`);
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
                user: statusResponse?.user,
                backups: response?.backups || [],
                syncStatus: statusResponse?.status
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
                    totalBackupsEl.textContent = (response?.backups || []).length;
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

            // If no keywords are stored, initialize with defaults
            let keywords = data.blockedKeywords;
            if (!keywords || keywords.length === 0)
            {
                keywords = this.defaultKeywords;
                // Save defaults to storage for future use
                await chrome.storage.local.set({ blockedKeywords: this.defaultKeywords });
            }

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

            // Check if blockedKeywords exists, if not use empty array (not defaultKeywords)
            const currentKeywords = data.blockedKeywords || [];

            // If no keywords exist yet, initialize with defaults
            if (currentKeywords.length === 0 && !data.blockedKeywords)
            {
                await chrome.storage.local.set({ blockedKeywords: this.defaultKeywords });
                // Reload with the newly set defaults
                const updatedData = await chrome.storage.local.get(['blockedKeywords']);
                currentKeywords.push(...updatedData.blockedKeywords);
            }

            // Check for duplicates (case-insensitive)
            const keywordExists = currentKeywords.some(existingKeyword =>
                existingKeyword.toLowerCase() === keyword.toLowerCase()
            );

            if (keywordExists)
            {
                this.showError('This keyword is already blocked.');
                input.value = '';
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
            this.showSuccess(`Keyword "${keyword}" added successfully!`);

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
            const currentKeywords = data.blockedKeywords || [];

            // Filter out the keyword (case-insensitive)
            const updatedKeywords = currentKeywords.filter(k =>
                k.toLowerCase() !== keyword.toLowerCase()
            );

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
            this.showSuccess(`Keyword "${keyword}" removed successfully!`);

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
            if (response && response.success)
            {
                input.value = '';
                await this.loadDomains();
                await this.loadStats();
                this.showSuccess('Domain added successfully!');
            } else
            {
                this.showError('Failed to add domain.');
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
            if (response && response.success)
            {
                await this.loadDomains();
                await this.loadStats();
                this.showSuccess('Domain removed successfully!');
            } else
            {
                this.showError('Failed to remove domain.');
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
            if (response && response.success)
            {
                // Clear form
                ['blocklist-name', 'blocklist-url', 'blocklist-description'].forEach(id =>
                {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });

                await this.loadBlocklistSources();
                this.showSuccess('Blocklist source added successfully!');
            } else
            {
                this.showError('Failed to add blocklist source.');
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
            if (response && response.success)
            {
                await this.loadBlocklistSources();
                await this.loadStats();
                this.showSuccess('Blocklist source removed successfully!');
            } else
            {
                this.showError('Failed to remove blocklist source.');
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
            if (response && response.success)
            {
                await this.loadBlocklistSources();
                this.showSuccess(`Blocklist source ${enabled ? 'enabled' : 'disabled'} successfully!`);
            } else
            {
                this.showError('Failed to toggle blocklist source.');
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
            if (response && response.success)
            {
                await this.loadBlocklistSources();
                this.showSuccess(`${sourceConfig.name} added successfully!`);
            } else
            {
                this.showError('Failed to add popular blocklist source.');
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
            if (response && response.success)
            {
                button.textContent = '✅ Updated!';
                if (progressFill) progressFill.style.width = '100%';
                await this.loadBlocklistSources();
                await this.loadStats();
                this.showSuccess('✅ Blocklist updated successfully!');
            } else
            {
                button.textContent = '❌ Failed';
                this.showError('❌ Failed to update blocklist');
            }
        } catch (error)
        {
            button.textContent = '❌ Failed';
            this.showError(`❌ Update failed: ${error.message}`);
        } finally
        {
            clearInterval(progressInterval);
            setTimeout(() =>
            {
                button.textContent = '🔄 Update All Sources';
                button.disabled = false;
                if (progressBar) progressBar.style.display = 'none';
                if (progressFill) progressFill.style.width = '0%';
            }, 2000);
        }
    }

    async viewBlockedCount()
    {
        try
        {
            const data = await chrome.storage.local.get(['blockedDomains', 'customDomains', 'blockedKeywords']);

            const githubDomains = (data.blockedDomains || []).length;
            const customDomains = (data.customDomains || []).length;
            const keywords = (data.blockedKeywords || []).length;

            const total = githubDomains + customDomains;

            alert(`📊 Blocking Statistics\n\n` +
                `GitHub Blocklist Domains: ${githubDomains.toLocaleString()}\n` +
                `Custom Domains: ${customDomains.toLocaleString()}\n` +
                `Total Domains: ${total.toLocaleString()}\n\n` +
                `Blocked Keywords: ${keywords.toLocaleString()}\n\n` +
                `Last Updated: ${new Date().toLocaleString()}`);
        } catch (error)
        {
            this.showError('Failed to load blocking statistics.');
        }
    }

    // ============ BACKUP & RESTORE ============
    setupBackupEventListeners()
    {
        document.getElementById('export-settings')?.addEventListener('click', () => this.exportSettings());
        document.getElementById('import-btn')?.addEventListener('click', () => this.importSettings());
        document.getElementById('reset-all')?.addEventListener('click', () => this.resetAllSettings());

        // Import file handler
        document.getElementById('import-file')?.addEventListener('change', (e) => this.handleImportFile(e));
    }

    async exportSettings()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blockedKeywords', 'customDomains', 'blocklistUrls', 'isActive',
                'blocksToday', 'focusStreak', 'totalBlocks', 'lastGithubUpdate'
            ]);

            // Exclude PIN for security
            const exportData = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                settings: {
                    blockedKeywords: data.blockedKeywords || [],
                    customDomains: data.customDomains || [],
                    blocklistUrls: data.blocklistUrls || [],
                    isActive: data.isActive !== undefined ? data.isActive : true,
                    lastGithubUpdate: data.lastGithubUpdate || 0
                },
                stats: {
                    blocksToday: data.blocksToday || 0,
                    focusStreak: data.focusStreak || 0,
                    totalBlocks: data.totalBlocks || 0
                }
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `fokus-settings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showSuccess('✅ Settings exported successfully!');
        } catch (error)
        {
            this.showError(`❌ Failed to export settings: ${error.message}`);
        }
    }

    importSettings()
    {
        const fileInput = document.getElementById('import-file');
        if (fileInput)
        {
            fileInput.click();
        }
    }

    async handleImportFile(event)
    {
        const file = event.target.files[0];
        if (!file) return;

        const messageEl = document.getElementById('backup-message');

        try
        {
            const text = await file.text();
            const importData = JSON.parse(text);

            // Validate import data
            if (!importData.settings || !importData.version)
            {
                throw new Error('Invalid settings file format');
            }

            if (!confirm('Import these settings? This will overwrite your current configuration.'))
            {
                return;
            }

            // Preserve current PIN
            const currentPin = await chrome.storage.local.get(['pin']);

            // Import settings
            const settingsToImport = {
                ...importData.settings,
                pin: currentPin.pin || '1234', // Keep current PIN
                lastImportDate: new Date().toISOString()
            };

            // Also import stats if available
            if (importData.stats)
            {
                Object.assign(settingsToImport, importData.stats);
            }

            await chrome.storage.local.set(settingsToImport);

            // Reload all settings in UI
            await this.loadAllSettings();

            this.showMessage(messageEl, '✅ Settings imported successfully!', 'success');

        } catch (error)
        {
            console.error('❌ Import error:', error);
            this.showMessage(messageEl, `❌ Failed to import settings: ${error.message}`, 'error');
        } finally
        {
            // Clear file input
            event.target.value = '';
        }
    }

    async resetAllSettings()
    {
        if (!confirm('⚠️ Reset ALL settings to defaults?\n\nThis will:\n- Clear all custom domains and keywords\n- Reset PIN to 1234\n- Clear all statistics\n- Remove all blocklist sources\n\nThis action cannot be undone!'))
        {
            return;
        }

        if (!confirm('Are you absolutely sure? This will permanently delete all your settings.'))
        {
            return;
        }

        try
        {
            // Clear all storage except essential defaults
            await chrome.storage.local.clear();

            // Set default values
            await chrome.storage.local.set({
                pin: '1234',
                blockedKeywords: this.defaultKeywords,
                customDomains: [],
                blocklistUrls: [],
                isActive: true,
                blocksToday: 0,
                focusStreak: 0,
                totalBlocks: 0,
                lastResetDate: new Date().toISOString()
            });

            // Reload all settings in UI
            await this.loadAllSettings();

            this.showSuccess('✅ All settings reset to defaults!');

        } catch (error)
        {
            this.showError(`❌ Failed to reset settings: ${error.message}`);
        }
    }

    // ============ EXTENSION STATUS ============
    setupStatusEventListeners()
    {
        document.getElementById('test-blocking')?.addEventListener('click', () => this.testBlocking());
        document.getElementById('view-logs')?.addEventListener('click', () => this.viewLogs());
    }

    async testBlocking()
    {
        // Open debug test page
        const debugUrl = chrome.runtime.getURL('debug-test.html');
        chrome.tabs.create({ url: debugUrl });
    }

    async viewLogs()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blocksToday', 'focusStreak', 'totalBlocks', 'lastBlockDate',
                'lastCloudSync', 'lastSyncDirection', 'lastImportDate', 'lastResetDate'
            ]);

            let logText = '📋 Focus Guard Activity Log\n\n';
            logText += `📊 Current Statistics:\n`;
            logText += `- Blocks Today: ${data.blocksToday || 0}\n`;
            logText += `- Focus Streak: ${data.focusStreak || 0} days\n`;
            logText += `- Total Blocks: ${data.totalBlocks || 0}\n\n`;

            logText += `📅 Important Dates:\n`;
            if (data.lastBlockDate)
            {
                logText += `- Last Block: ${data.lastBlockDate}\n`;
            }
            if (data.lastCloudSync)
            {
                logText += `- Last Cloud Sync: ${new Date(data.lastCloudSync).toLocaleString()} (${data.lastSyncDirection || 'unknown'})\n`;
            }
            if (data.lastImportDate)
            {
                logText += `- Last Settings Import: ${new Date(data.lastImportDate).toLocaleString()}\n`;
            }
            if (data.lastResetDate)
            {
                logText += `- Last Settings Reset: ${new Date(data.lastResetDate).toLocaleString()}\n`;
            }

            // Create and download log file
            const blob = new Blob([logText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `fokus-activity-log-${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showSuccess('✅ Activity log exported!');

        } catch (error)
        {
            this.showError(`❌ Failed to generate activity log: ${error.message}`);
        }
    }

    // ============ ADVANCED SETTINGS ============
    setupAdvancedEventListeners()
    {
        document.getElementById('auto-sync-enabled')?.addEventListener('change', (e) => this.toggleAutoSync(e.target.checked));
        document.getElementById('sync-frequency')?.addEventListener('change', (e) => this.updateSyncFrequency(e.target.value));
        document.getElementById('backup-retention')?.addEventListener('change', (e) => this.updateBackupRetention(e.target.value));
        document.getElementById('cleanup-backups')?.addEventListener('click', () => this.cleanupBackups());
    }

    async toggleAutoSync(enabled)
    {
        try
        {
            await chrome.storage.local.set({ autoSyncEnabled: enabled });
            await this.sendMessage({ action: 'setAutoSync', enabled });
            this.showSuccess(`Auto-sync ${enabled ? 'enabled' : 'disabled'}!`);
        } catch (error)
        {
            this.showError('Failed to update auto-sync setting.');
        }
    }

    async updateSyncFrequency(frequency)
    {
        try
        {
            await chrome.storage.local.set({ syncFrequency: parseInt(frequency) });
            await this.sendMessage({ action: 'setSyncFrequency', frequency: parseInt(frequency) });
            this.showSuccess(`Sync frequency updated to ${frequency} minutes!`);
        } catch (error)
        {
            this.showError('Failed to update sync frequency.');
        }
    }

    async updateBackupRetention(retention)
    {
        try
        {
            await chrome.storage.local.set({ backupRetention: parseInt(retention) });
            this.showSuccess(`Backup retention updated to ${retention} backups!`);
        } catch (error)
        {
            this.showError('Failed to update backup retention.');
        }
    }

    async cleanupBackups()
    {
        if (!confirm('Cleanup old backups? This will remove backups beyond the retention limit.')) return;

        try
        {
            const response = await this.sendMessage({ action: 'cleanupBackups' });
            if (response && response.success)
            {
                this.loadCloudBackups();
                this.showSuccess(`✅ Cleaned up ${response.deletedCount || 0} old backups!`);
            } else
            {
                this.showError('Failed to cleanup backups.');
            }
        } catch (error)
        {
            this.showError(`❌ Cleanup failed: ${error.message}`);
        }
    }

    // ============ UTILITY METHODS ============
    async loadAllSettings()
    {
        console.log('🔄 Loading all settings...');

        try
        {
            await this.loadCurrentPin();
            await this.loadStats();
            await this.loadKeywords();
            await this.loadDomains();
            await this.loadBlocklistSources();
            await this.loadAdvancedSettings();

            console.log('✅ All settings loaded successfully');
        } catch (error)
        {
            console.error('❌ Failed to load some settings:', error);
        }
    }

    async loadStats()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blocksToday', 'focusStreak', 'totalBlocks', 'customDomains', 'blockedKeywords', 'blockedDomains'
            ]);

            // Update statistics display
            const elements = {
                totalBlocks: document.getElementById('total-blocks'),
                domainsBlocked: document.getElementById('domains-blocked'),
                keywordsBlocked: document.getElementById('keywords-blocked'),
                timeSaved: document.getElementById('time-saved')
            };

            if (elements.totalBlocks)
            {
                elements.totalBlocks.textContent = (data.totalBlocks || 0).toLocaleString();
            }

            if (elements.domainsBlocked)
            {
                const customDomains = (data.customDomains || []).length;
                const githubDomains = (data.blockedDomains || []).length;
                elements.domainsBlocked.textContent = (customDomains + githubDomains).toLocaleString();
            }

            if (elements.keywordsBlocked)
            {
                elements.keywordsBlocked.textContent = (data.blockedKeywords || []).length.toLocaleString();
            }

            if (elements.timeSaved)
            {
                // Estimate time saved: assuming each block saves ~2 minutes
                const estimatedMinutes = (data.totalBlocks || 0) * 2;
                const hours = Math.floor(estimatedMinutes / 60);
                elements.timeSaved.textContent = hours > 0 ? `${hours}h` : `${estimatedMinutes}m`;
            }

        } catch (error)
        {
            console.error('❌ Failed to load stats:', error);
        }
    }

    async loadAdvancedSettings()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'autoSyncEnabled', 'syncFrequency', 'backupRetention'
            ]);

            // Update auto-sync checkbox
            const autoSyncEl = document.getElementById('auto-sync-enabled');
            if (autoSyncEl)
            {
                autoSyncEl.checked = data.autoSyncEnabled !== false;
            }

            // Update sync frequency dropdown
            const syncFreqEl = document.getElementById('sync-frequency');
            if (syncFreqEl)
            {
                syncFreqEl.value = data.syncFrequency || 5;
            }

            // Update backup retention dropdown
            const backupRetentionEl = document.getElementById('backup-retention');
            if (backupRetentionEl)
            {
                backupRetentionEl.value = data.backupRetention || 10;
            }

        } catch (error)
        {
            console.error('❌ Failed to load advanced settings:', error);
        }
    }

    updateBrowserInfo()
    {
        const browserInfoEl = document.getElementById('browser-info');
        if (browserInfoEl)
        {
            const userAgent = navigator.userAgent;
            let browserName = 'Unknown';

            if (userAgent.includes('Chrome')) browserName = 'Chrome';
            else if (userAgent.includes('Firefox')) browserName = 'Firefox';
            else if (userAgent.includes('Safari')) browserName = 'Safari';
            else if (userAgent.includes('Edge')) browserName = 'Edge';

            browserInfoEl.textContent = browserName;
        }
    }

    // ============ HELPER METHODS ============
    showMessage(element, message, type)
    {
        if (!element) return;

        const messageClass = type === 'success' ? 'success-message' :
            type === 'info' ? 'info-message' : 'error-message';

        element.innerHTML = `<div class="${messageClass}">${message}</div>`;

        // Auto-clear messages after 8 seconds
        setTimeout(() =>
        {
            if (element.innerHTML.includes(message))
            {
                element.innerHTML = '';
            }
        }, 8000);
    }

    showSuccess(message)
    {
        console.log('✅', message);
        this.showGlobalMessage(message, 'success');
    }

    showError(message)
    {
        console.error('❌', message);
        this.showGlobalMessage(message, 'error');
    }

    showGlobalMessage(message, type)
    {
        // Create temporary message element
        const messageEl = document.createElement('div');
        messageEl.className = type === 'success' ? 'success-message' : 'error-message';
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
            padding: 15px 20px;
            border-radius: 12px;
            font-weight: 500;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
            animation: slideInRight 0.4s ease-out;
        `;
        messageEl.textContent = message;

        document.body.appendChild(messageEl);

        // Remove after 5 seconds
        setTimeout(() =>
        {
            messageEl.style.animation = 'slideInRight 0.4s ease-out reverse';
            setTimeout(() =>
            {
                if (messageEl.parentNode)
                {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 400);
        }, 5000);
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

    escapeHtml(text)
    {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    isValidDomain(domain)
    {
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
        return domainRegex.test(domain) && domain.includes('.');
    }

    isValidGitHubRawUrl(url)
    {
        return url.startsWith('https://raw.githubusercontent.com/') && url.split('/').length >= 7;
    }

    estimateDataSize()
    {
        // Rough estimate of current settings size
        try
        {
            const sampleData = {
                blockedKeywords: this.defaultKeywords,
                customDomains: ['example.com'],
                blocklistUrls: [],
                isActive: true
            };
            return JSON.stringify(sampleData).length * 2; // Conservative estimate
        } catch (error)
        {
            return 1024; // 1KB fallback
        }
    }

    // Global functions for HTML onclick handlers
    window.testKeyword = function ()
    {
        if (optionsManager) optionsManager.testKeyword();
    };

    window.testGoogleSearch = function ()
    {
        if (optionsManager) optionsManager.testGoogleSearch();
    };

    window.testDirectURL = function ()
    {
        if (optionsManager) optionsManager.testDirectURL();
    };

    window.clearConsole = function ()
    {
        if (optionsManager) optionsManager.clearConsole();
    };

    testKeyword()
    {
        const input = document.getElementById('test-input');
        const result = document.getElementById('keyword-result');
        const value = input.value.toLowerCase();

        console.log('🔧 Testing keyword:', value);

        // Test against common blocked keywords
        const testKeywords = ['porn', 'xxx', 'sex', 'adult', 'nude', 'naked'];
        const found = testKeywords.find(k => value.includes(k));

        if (found)
        {
            result.innerHTML = `<div class="result error">⚠️ Keyword "${found}" detected in "${value}"</div>`;
            console.log('🚫 Keyword detected:', found);
        } else
        {
            result.innerHTML = `<div class="result success">✅ No blocked keywords found in "${value}"</div>`;
            console.log('✅ No keywords detected');
        }
    }

    testGoogleSearch()
    {
        console.log('🔧 Testing Google search navigation...');
        const result = document.getElementById('url-result');
        result.innerHTML = '<div class="result info">🔄 Testing Google search URL...</div>';

        // Try to navigate to Google search
        const searchURL = 'https://www.google.com/search?q=porn&uact=5';
        console.log('🔧 Navigating to:', searchURL);

        setTimeout(() =>
        {
            window.location.href = searchURL;
        }, 1000);
    }

    testDirectURL()
    {
        console.log('🔧 Testing direct URL navigation...');
        const result = document.getElementById('url-result');
        result.innerHTML = '<div class="result info">🔄 Testing direct navigation...</div>';

        // Test URL that should be blocked
        window.location.href = 'https://www.google.com/search?q=adult+content&uact=5';
    }

    clearConsole()
    {
        console.clear();
        console.log('🔧 Console cleared - Debug test page ready');
    }

    formatBytes(bytes)
    {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}
}

// Global instance for HTML onclick handlers
let optionsManager;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () =>
{
    console.log('🚀 Options page DOM loaded, initializing...');

    try
    {
        // Check if all required elements exist
        const requiredElements = [
            'current-pin-display', 'keywords-list', 'domains-list'
        ];

        const missingElements = requiredElements.filter(id => !document.getElementById(id));

        if (missingElements.length > 0)
        {
            console.error('Missing required elements:', missingElements);
            throw new Error(`Missing elements: ${missingElements.join(', ')}`);
        }

        // Initialize options manager
        optionsManager = new OptionsManager();
        optionsManager.setupGlobalEventHandlers(); // Make available globally
        await optionsManager.init();

        console.log('✅ Options page initialized successfully');

        // Handle URL hash for direct navigation
        const hash = window.location.hash;
        if (hash)
        {
            setTimeout(() =>
            {
                const element = document.querySelector(hash);
                if (element)
                {
                    element.scrollIntoView({ behavior: 'smooth' });
                }
            }, 500);
        }

    } catch (error)
    {
        console.error('❌ Failed to initialize options page:', error);

        // Show error message to user
        document.body.innerHTML = `
            <div style="padding: 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; color: white; font-family: 'Segoe UI', sans-serif;">
                <div style="max-width: 600px; margin: 0 auto; background: rgba(255, 255, 255, 0.95); color: #333; padding: 40px; border-radius: 20px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);">
                    <h1 style="color: #e74c3c; margin-bottom: 20px;">⚠️ Settings Error</h1>
                    <p style="margin-bottom: 20px; line-height: 1.6;">Failed to initialize Fokus settings page. This might be due to:</p>
                    <ul style="text-align: left; margin: 20px 0; line-height: 1.8;">
                        <li>Browser extension permissions</li>
                        <li>Corrupted extension files</li>
                        <li>Browser compatibility issues</li>
                        <li>Missing configuration files</li>
                    </ul>
                    <div style="margin: 30px 0;">
                        <button onclick="location.reload()" style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 5px; font-size: 14px;">
                            🔄 Refresh Page
                        </button>
                        <button onclick="chrome.management.uninstall(chrome.runtime.id)" style="background: #e74c3c; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 5px; font-size: 14px;">
                            🗑️ Reinstall Extension
                        </button>
                    </div>
                    <details style="text-align: left; margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <summary style="cursor: pointer; font-weight: bold;">Technical Details</summary>
                        <pre style="margin-top: 10px; font-size: 12px; color: #666; white-space: pre-wrap;">${error.message}\n\nStack: ${error.stack}</pre>
                    </details>
                </div>
            </div>
        `;
    }
});

// Handle page unload
window.addEventListener('beforeunload', () =>
{
    console.log('👋 Options page unloading...');
});

// Handle visibility changes
document.addEventListener('visibilitychange', () =>
{
    if (!document.hidden && optionsManager && optionsManager.isInitialized)
    {
        // Refresh data when page becomes visible
        setTimeout(() =>
        {
            optionsManager.loadAllSettings();
        }, 1000);
    }
});

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports)
{
    module.exports = OptionsManager;
} else
{
    window.OptionsManager = OptionsManager;
}