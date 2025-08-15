// options-core.js - Core functionality for Fokus Extension Settings

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
        console.log('Initializing Options Manager...');

        try
        {
            this.setupEventListeners();
            await this.loadAllSettings();
            this.updateBrowserInfo();

            this.isInitialized = true;
            console.log('Options Manager initialized successfully');
        } catch (error)
        {
            console.error('Failed to initialize Options Manager:', error);
            this.showError('Failed to initialize settings. Please refresh the page.');
        }
    }

    setupEventListeners()
    {
        // PIN Management
        this.setupPinEventListeners();

        // Keywords Management
        this.setupKeywordsEventListeners();

        // Domains Management
        this.setupDomainsEventListeners();

        // Extension Status
        this.setupStatusEventListeners();

        // Advanced Settings
        this.setupAdvancedEventListeners();
    }

    // PIN MANAGEMENT
    setupPinEventListeners()
    {
        document.getElementById('change-pin')?.addEventListener('click', () => this.changePIN());
        document.getElementById('reset-to-default')?.addEventListener('click', () => this.resetPinToDefault());

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
        } catch (error)
        {
            console.error('Failed to load current PIN:', error);
            this.currentPin = '1234';
        }
    }

    async changePIN()
    {
        const currentPin = document.getElementById('current-pin')?.value;
        const newPin = document.getElementById('new-pin')?.value;
        const confirmPin = document.getElementById('confirm-pin')?.value;
        const messageEl = document.getElementById('pin-message');

        if (!messageEl) return;

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

            this.showMessage(messageEl, 'PIN changed successfully!', 'success');

            ['current-pin', 'new-pin', 'confirm-pin'].forEach(id =>
            {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });

        } catch (error)
        {
            console.error('PIN change error:', error);
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

            const messageEl = document.getElementById('pin-message');
            if (messageEl)
            {
                this.showMessage(messageEl, 'PIN reset to default (1234) successfully!', 'success');
            }
        } catch (error)
        {
            console.error('PIN reset error:', error);
            const messageEl = document.getElementById('pin-message');
            if (messageEl)
            {
                this.showMessage(messageEl, 'Failed to reset PIN. Please try again.', 'error');
            }
        }
    }

    // KEYWORDS MANAGEMENT
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
            console.log('Loading keywords...');

            const data = await chrome.storage.local.get(['blockedKeywords']);
            console.log('Storage data:', data);

            let keywords = data.blockedKeywords;

            if (!keywords || keywords.length === 0)
            {
                console.log('No keywords found, using defaults');
                keywords = [...this.defaultKeywords];

                await chrome.storage.local.set({ blockedKeywords: keywords });
                console.log('Default keywords saved to storage');
            }

            console.log('Keywords loaded:', keywords.length, 'keywords');
            this.renderKeywordsList(keywords);

        } catch (error)
        {
            console.error('Failed to load keywords:', error);

            console.log('Using fallback defaults');
            this.renderKeywordsList(this.defaultKeywords);
            this.showError('Failed to load keywords, showing defaults');

            try
            {
                await chrome.storage.local.set({ blockedKeywords: this.defaultKeywords });
            } catch (saveError)
            {
                console.error('Failed to save fallback keywords:', saveError);
            }
        }
    }

    renderKeywordsList(keywords)
    {
        const container = document.getElementById('keywords-list');
        if (!container)
        {
            console.warn('Keywords list container not found');
            return;
        }

        console.log('Rendering', keywords.length, 'keywords');

        if (keywords.length === 0)
        {
            container.innerHTML = '<div class="text-center text-muted p-3">No keywords blocked</div>';
            return;
        }

        container.innerHTML = keywords.map(keyword => `
            <div class="list-item">
                <span>${this.escapeHtml(keyword)}</span>
                <button class="btn btn-sm btn-outline-danger" onclick="optionsManager.removeKeyword('${this.escapeHtml(keyword)}')">
                    DELETE
                </button>
            </div>
        `).join('');

        console.log('Keywords list rendered successfully');
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
            const currentKeywords = data.blockedKeywords || [];

            if (currentKeywords.length === 0 && !data.blockedKeywords)
            {
                await chrome.storage.local.set({ blockedKeywords: this.defaultKeywords });
                currentKeywords.push(...this.defaultKeywords);
            }

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

            input.value = '';
            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess(`Keyword "${keyword}" added successfully!`);

        } catch (error)
        {
            console.error('Add keyword error:', error);
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

            const updatedKeywords = currentKeywords.filter(k =>
                k.toLowerCase() !== keyword.toLowerCase()
            );

            await chrome.storage.local.set({ blockedKeywords: updatedKeywords });

            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess(`Keyword "${keyword}" removed successfully!`);

        } catch (error)
        {
            console.error('Remove keyword error:', error);
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

    // DOMAINS MANAGEMENT
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
            container.innerHTML = '<div class="text-center text-muted p-3">No custom domains blocked</div>';
            return;
        }

        container.innerHTML = domains.map(domain => `
            <div class="list-item">
                <span>${this.escapeHtml(domain)}</span>
                <button class="btn btn-sm btn-outline-danger" onclick="optionsManager.removeDomain('${this.escapeHtml(domain)}')">
                    DELETE
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

    // EXTENSION STATUS
    setupStatusEventListeners()
    {
        document.getElementById('test-blocking')?.addEventListener('click', () => this.testBlocking());
        document.getElementById('view-logs')?.addEventListener('click', () => this.viewLogs());
    }

    async testBlocking()
    {
        const debugUrl = chrome.runtime.getURL('debug-test.html');
        chrome.tabs.create({ url: debugUrl });
    }

    async viewLogs()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blocksToday', 'focusStreak', 'totalBlocks', 'lastBlockDate',
                'lastImportDate', 'lastResetDate'
            ]);

            let logText = 'Focus Guard Activity Log\n\n';
            logText += `Current Statistics:\n`;
            logText += `- Blocks Today: ${data.blocksToday || 0}\n`;
            logText += `- Focus Streak: ${data.focusStreak || 0} days\n`;
            logText += `- Total Blocks: ${data.totalBlocks || 0}\n\n`;

            logText += `Important Dates:\n`;
            if (data.lastBlockDate)
            {
                logText += `- Last Block: ${data.lastBlockDate}\n`;
            }
            if (data.lastImportDate)
            {
                logText += `- Last Settings Import: ${new Date(data.lastImportDate).toLocaleString()}\n`;
            }
            if (data.lastResetDate)
            {
                logText += `- Last Settings Reset: ${new Date(data.lastResetDate).toLocaleString()}\n`;
            }

            const blob = new Blob([logText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `fokus-activity-log-${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showSuccess('Activity log exported!');

        } catch (error)
        {
            this.showError(`Failed to generate activity log: ${error.message}`);
        }
    }

    // ADVANCED SETTINGS
    setupAdvancedEventListeners()
    {
        // Backup & Restore
        document.getElementById('export-settings')?.addEventListener('click', () => this.exportSettings());
        document.getElementById('import-btn')?.addEventListener('click', () => this.importSettings());
        document.getElementById('reset-all')?.addEventListener('click', () => this.resetAllSettings());
        document.getElementById('import-file')?.addEventListener('change', (e) => this.handleImportFile(e));
    }

    // BACKUP & RESTORE
    async exportSettings()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blockedKeywords', 'customDomains', 'blocklistUrls', 'isActive',
                'blocksToday', 'focusStreak', 'totalBlocks', 'lastGithubUpdate'
            ]);

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

            this.showSuccess('Settings exported successfully!');
        } catch (error)
        {
            this.showError(`Failed to export settings: ${error.message}`);
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

            if (!importData.settings || !importData.version)
            {
                throw new Error('Invalid settings file format');
            }

            if (!confirm('Import these settings? This will overwrite your current configuration.'))
            {
                return;
            }

            const currentPin = await chrome.storage.local.get(['pin']);

            const settingsToImport = {
                ...importData.settings,
                pin: currentPin.pin || '1234',
                lastImportDate: new Date().toISOString()
            };

            if (importData.stats)
            {
                Object.assign(settingsToImport, importData.stats);
            }

            await chrome.storage.local.set(settingsToImport);
            await this.loadAllSettings();

            this.showMessage(messageEl, 'Settings imported successfully!', 'success');

        } catch (error)
        {
            console.error('Import error:', error);
            this.showMessage(messageEl, `Failed to import settings: ${error.message}`, 'error');
        } finally
        {
            event.target.value = '';
        }
    }

    async resetAllSettings()
    {
        if (!confirm('Reset ALL settings to defaults?\n\nThis will:\n- Clear all custom domains and keywords\n- Reset PIN to 1234\n- Clear all statistics\n- Remove all blocklist sources\n\nThis action cannot be undone!'))
        {
            return;
        }

        if (!confirm('Are you absolutely sure? This will permanently delete all your settings.'))
        {
            return;
        }

        try
        {
            await chrome.storage.local.clear();

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

            await this.loadAllSettings();
            this.showSuccess('All settings reset to defaults!');

        } catch (error)
        {
            this.showError(`Failed to reset settings: ${error.message}`);
        }
    }

    // UTILITY METHODS
    async loadAllSettings()
    {
        console.log('Loading all settings...');

        try
        {
            await this.loadCurrentPin();
            await this.loadStats();
            await this.loadKeywords();
            await this.loadDomains();

            console.log('All settings loaded successfully');
        } catch (error)
        {
            console.error('Failed to load some settings:', error);
        }
    }

    async loadStats()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blocksToday', 'focusStreak', 'totalBlocks', 'customDomains', 'blockedKeywords', 'blockedDomains'
            ]);

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
                const estimatedMinutes = (data.totalBlocks || 0) * 2;
                const hours = Math.floor(estimatedMinutes / 60);
                elements.timeSaved.textContent = hours > 0 ? `${hours}h` : `${estimatedMinutes}m`;
            }

        } catch (error)
        {
            console.error('Failed to load stats:', error);
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

    // HELPER METHODS
    showMessage(element, message, type)
    {
        if (!element) return;

        const messageClass = type === 'success' ? 'success-message' :
            type === 'info' ? 'info-message' : 'error-message';

        element.innerHTML = `<div class="${messageClass}">${message}</div>`;

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
        console.log('Success:', message);
        this.showGlobalMessage(message, 'success');
    }

    showError(message)
    {
        console.error('Error:', message);
        this.showGlobalMessage(message, 'error');
    }

    showGlobalMessage(message, type)
    {
        // Create Bootstrap toast
        const toastContainer = document.getElementById('toast-container') || this.createToastContainer();

        const toastId = 'toast-' + Date.now();
        const toastClass = type === 'success' ? 'bg-success' : 'bg-danger';

        const toastHtml = `
            <div id="${toastId}" class="toast ${toastClass} text-white" role="alert">
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;

        toastContainer.insertAdjacentHTML('beforeend', toastHtml);

        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { delay: 5000 });
        toast.show();

        // Remove toast element after it's hidden
        toastElement.addEventListener('hidden.bs.toast', () =>
        {
            toastElement.remove();
        });
    }

    createToastContainer()
    {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1100';
        document.body.appendChild(container);
        return container;
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
}