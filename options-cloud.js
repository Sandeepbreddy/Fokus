// options-cloud.js - Cloud sync and blocklist management for Fokus Extension

// Extend OptionsManager with cloud and blocklist functionality
Object.assign(OptionsManager.prototype, {

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
    },

    async initializeSupabaseFeatures()
    {
        try
        {
            await this.checkSupabaseStatus();
        } catch (error)
        {
            console.error('❌ Failed to initialize Supabase features:', error);
        }
    },

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
    },

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
    },

    showSignInForm()
    {
        this.hideAllAuthForms();
        const signInForm = document.getElementById('sign-in-form');
        if (signInForm)
        {
            signInForm.classList.add('active');
        }
    },

    showSignUpForm()
    {
        this.hideAllAuthForms();
        const signUpForm = document.getElementById('sign-up-form');
        if (signUpForm)
        {
            signUpForm.classList.add('active');
        }
    },

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
    },

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
    },

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
    },

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
                    this.loadAllSettings();
                }, 1500);
            } else
            {
                this.showMessage(messageEl, '❌ Sign in failed: ' + (response?.error || 'Invalid credentials'), 'error');
            }
        } catch (error)
        {
            this.showMessage(messageEl, `❌ Sign in failed: ${error.message}`, 'error');
        }
    },

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
    },

    // ============ SYNC OPERATIONS ============
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
    },

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
                    this.loadAllSettings();
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
    },

    async forceSync()
    {
        const button = document.getElementById('force-sync');
        if (!button) return;

        const originalHTML = button.innerHTML;
        button.innerHTML = '<span>⏳</span><span>Syncing...</span>';
        button.disabled = true;

        try
        {
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    async loadSyncStatistics()
    {
        try
        {
            const data = await chrome.storage.local.get(['totalSyncs']);

            const statsSection = document.getElementById('sync-statistics');
            if (statsSection)
            {
                statsSection.style.display = 'block';
            }

            const totalSyncsEl = document.getElementById('total-syncs');
            if (totalSyncsEl)
            {
                totalSyncsEl.textContent = data.totalSyncs || 0;
            }

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
    },

    // ============ BLOCKLIST MANAGEMENT ============
    setupBlocklistEventListeners()
    {
        document.getElementById('add-blocklist-btn')?.addEventListener('click', () => this.showAddBlocklistModal());
        document.getElementById('force-update')?.addEventListener('click', () => this.forceUpdateBlocklist());
        document.getElementById('view-blocked-count')?.addEventListener('click', () => this.viewBlockedCount());
        document.getElementById('test-blocklist-url')?.addEventListener('click', () => this.testBlocklistUrl());

        // Popular blocklist buttons
        document.querySelectorAll('[data-popular-blocklist]').forEach(btn =>
        {
            btn.addEventListener('click', (e) =>
            {
                const type = e.target.getAttribute('data-popular-blocklist');
                this.addPopularBlocklist(type);
            });
        });

        // Modal events
        this.setupBlocklistModal();
    },

    setupBlocklistModal()
    {
        const modal = document.getElementById('add-blocklist-modal');
        const closeBtn = document.getElementById('close-blocklist-modal');
        const cancelBtn = document.getElementById('cancel-blocklist');
        const submitBtn = document.getElementById('submit-blocklist');

        closeBtn?.addEventListener('click', () => this.hideAddBlocklistModal());
        cancelBtn?.addEventListener('click', () => this.hideAddBlocklistModal());
        submitBtn?.addEventListener('click', () => this.submitBlocklistForm());

        // Close on overlay click
        modal?.addEventListener('click', (e) =>
        {
            if (e.target === modal)
            {
                this.hideAddBlocklistModal();
            }
        });

        // Test URL button in modal
        document.getElementById('test-modal-url')?.addEventListener('click', () => this.testModalUrl());
    },

    showAddBlocklistModal()
    {
        const modal = document.getElementById('add-blocklist-modal');
        if (modal)
        {
            modal.classList.add('active');
            // Clear form
            document.getElementById('modal-blocklist-name').value = '';
            document.getElementById('modal-blocklist-url').value = '';
            document.getElementById('modal-blocklist-description').value = '';
            document.getElementById('modal-blocklist-name').focus();
        }
    },

    hideAddBlocklistModal()
    {
        const modal = document.getElementById('add-blocklist-modal');
        if (modal)
        {
            modal.classList.remove('active');
        }
    },

    testModalUrl()
    {
        const testUrl = document.getElementById('modal-blocklist-url')?.value.trim();
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
    },

    async submitBlocklistForm()
    {
        const name = document.getElementById('modal-blocklist-name')?.value.trim();
        const url = document.getElementById('modal-blocklist-url')?.value.trim();
        const description = document.getElementById('modal-blocklist-description')?.value.trim();

        if (!name || !url)
        {
            alert('Please enter both name and URL for the blocklist source.');
            return;
        }

        if (!this.isValidGitHubRawUrl(url))
        {
            alert('Please enter a valid GitHub raw URL (e.g., https://raw.githubusercontent.com/...)');
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
                this.hideAddBlocklistModal();
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
    },

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
    },

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
                            <button class="edit-btn" onclick="optionsManager.editBlocklistSource('${source.id}')">
                                ✏️ Edit
                            </button>
                            <button class="remove-btn" onclick="optionsManager.removeBlocklistSource('${source.id}')">
                                🗑️ Delete
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
    },

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
    },

    async editBlocklistSource(id)
    {
        // For now, show a simple prompt - can be enhanced to use a modal
        const newName = prompt('Enter new name for this blocklist source:');
        if (newName && newName.trim())
        {
            try
            {
                const response = await this.sendMessage({
                    action: 'updateBlocklistUrl',
                    id,
                    updates: { name: newName.trim() }
                });
                if (response && response.success)
                {
                    await this.loadBlocklistSources();
                    this.showSuccess('Blocklist source updated successfully!');
                } else
                {
                    this.showError('Failed to update blocklist source.');
                }
            } catch (error)
            {
                this.showError('Failed to update blocklist source.');
            }
        }
    },

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
    },

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
    },

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
    },

    async forceUpdateBlocklist()
    {
        const button = document.getElementById('force-update');
        if (!button) return;

        const progressBar = document.getElementById('update-progress');
        const progressFill = document.getElementById('progress-fill');

        button.textContent = '🔄 Updating...';
        button.disabled = true;
        if (progressBar) progressBar.style.display = 'block';

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
    },

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
    },

    // ============ UTILITY METHODS ============
    isValidGitHubRawUrl(url)
    {
        return url.startsWith('https://raw.githubusercontent.com/') && url.split('/').length >= 7;
    },

    estimateDataSize()
    {
        try
        {
            const sampleData = {
                blockedKeywords: this.defaultKeywords,
                customDomains: ['example.com'],
                blocklistUrls: [],
                isActive: true
            };
            return JSON.stringify(sampleData).length * 2;
        } catch (error)
        {
            return 1024;
        }
    },

    formatBytes(bytes)
    {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
});