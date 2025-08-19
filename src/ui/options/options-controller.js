// src/ui/options/options-controller.js - Complete options page controller
import { Logger } from '../../shared/logger.js';
import { Utils } from '../../shared/utils.js';
import { DEFAULT_KEYWORDS, DEFAULT_BLOCKLISTS, STORAGE_KEYS } from '../../shared/constants.js';

export class OptionsController
{
    constructor()
    {
        this.logger = new Logger('OptionsController');
        this.currentPin = null;
        this.debounceTimers = new Map();
        this.cache = new Map();
        this.isInitialized = false;
    }

    async init()
    {
        this.logger.info('Initializing options controller...');

        try
        {
            this.setupEventListeners();
            await this.loadAllSettings();
            await this.initializeDefaultBlocklists();
            this.updateBrowserInfo();

            this.isInitialized = true;
            this.logger.info('Options controller initialized successfully');
        } catch (error)
        {
            this.logger.error('Failed to initialize options controller:', error);
            throw error;
        }
    }

    setupEventListeners()
    {
        // Use event delegation for better performance
        document.addEventListener('click', this.handleClick.bind(this));
        document.addEventListener('input', this.handleInput.bind(this));
        document.addEventListener('keypress', this.handleKeypress.bind(this));
        document.addEventListener('change', this.handleChange.bind(this));
    }

    handleClick(e)
    {
        const target = e.target;
        const action = target.dataset.action || target.id;

        const handlers = {
            'change-pin': () => this.changePIN(),
            'reset-to-default': () => this.resetPinToDefault(),
            'add-keyword': () => this.addKeyword(),
            'reset-keywords': () => this.resetKeywords(),
            'clear-keywords': () => this.clearKeywords(),
            'add-domain': () => this.addDomain(),
            'clear-domains': () => this.clearDomains(),
            'force-update': () => this.forceUpdateBlocklists(),
            'view-blocked-count': () => this.viewBlockedCount(),
            'test-blocking': () => this.testBlocking(),
            'view-logs': () => this.viewLogs(),
            'export-settings': () => this.exportSettings(),
            'import-btn': () => this.importSettings(),
            'reset-all': () => this.resetAllSettings()
        };

        if (handlers[action])
        {
            handlers[action]();
        }

        // Handle remove actions
        if (target.classList.contains('remove-keyword'))
        {
            const keyword = target.closest('.keyword-tag').dataset.keyword;
            this.removeKeyword(keyword);
        } else if (target.classList.contains('remove-domain'))
        {
            const domain = target.closest('.list-item').dataset.domain;
            this.removeDomain(domain);
        }
    }

    handleInput(e)
    {
        const target = e.target;
        const id = target.id;

        const validators = {
            'current-pin': () => this.validatePinForm(),
            'new-pin': () => this.validatePinForm(),
            'confirm-pin': () => this.validatePinForm(),
            'new-keyword': () => this.validateKeywordInput(),
            'new-domain': () => this.validateDomainInput()
        };

        if (validators[id])
        {
            this.debounce(validators[id], 150)();
        }
    }

    handleKeypress(e)
    {
        if (e.key !== 'Enter') return;

        const target = e.target;
        const id = target.id;

        const enterHandlers = {
            'confirm-pin': () =>
            {
                const btn = document.getElementById('change-pin');
                if (btn && !btn.disabled) this.changePIN();
            },
            'new-keyword': () =>
            {
                const btn = document.getElementById('add-keyword');
                if (btn && !btn.disabled) this.addKeyword();
            },
            'new-domain': () =>
            {
                const btn = document.getElementById('add-domain');
                if (btn && !btn.disabled) this.addDomain();
            }
        };

        if (enterHandlers[id])
        {
            enterHandlers[id]();
        }
    }

    handleChange(e)
    {
        const target = e.target;

        if (target.classList.contains('blocklist-toggle'))
        {
            const sourceId = target.closest('.blocklist-item').dataset.sourceId;
            this.toggleBlocklistSource(sourceId, target.checked);
        } else if (target.id === 'import-file')
        {
            this.handleImportFile(e);
        }
    }

    // PIN Management
    async loadCurrentPin()
    {
        try
        {
            const cached = this.cache.get('pin');
            if (cached)
            {
                this.currentPin = cached;
                return;
            }

            const data = await chrome.storage.local.get([STORAGE_KEYS.PIN]);
            this.currentPin = data[STORAGE_KEYS.PIN] || '1234';
            this.cache.set('pin', this.currentPin);
        } catch (error)
        {
            this.logger.error('Failed to load current PIN:', error);
            this.currentPin = '1234';
        }
    }

    validatePinForm()
    {
        const currentPin = document.getElementById('current-pin')?.value || '';
        const newPin = document.getElementById('new-pin')?.value || '';
        const confirmPin = document.getElementById('confirm-pin')?.value || '';
        const changeButton = document.getElementById('change-pin');

        const isValid = currentPin.length >= 4 &&
            newPin.length >= 4 &&
            confirmPin.length >= 4 &&
            Utils.validatePin(newPin) &&
            newPin === confirmPin;

        if (changeButton)
        {
            changeButton.disabled = !isValid;
            changeButton.textContent = this.getPinButtonText(currentPin, newPin, confirmPin, isValid);
        }
    }

    getPinButtonText(currentPin, newPin, confirmPin, isValid)
    {
        if (!isValid)
        {
            if (currentPin.length < 4) return 'ENTER CURRENT PIN';
            if (newPin.length < 4) return 'ENTER NEW PIN';
            if (confirmPin.length < 4) return 'CONFIRM PIN';
            if (!Utils.validatePin(newPin)) return 'NUMBERS ONLY';
            if (newPin !== confirmPin) return 'PINS DON\'T MATCH';
            return 'ENTER ALL FIELDS';
        }
        return 'CHANGE PIN';
    }
    async toggleBlocklistSource(id, enabled)
    {
        try
        {
            const data = await chrome.storage.local.get([STORAGE_KEYS.BLOCKLIST_SOURCES]);
            const sources = data[STORAGE_KEYS.BLOCKLIST_SOURCES] || [];

            const sourceIndex = sources.findIndex(s => s.id === id);
            if (sourceIndex !== -1)
            {
                sources[sourceIndex].enabled = enabled;
                await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKLIST_SOURCES]: sources });

                // If enabling a source, trigger an update
                if (enabled)
                {
                    this.logger.info(`Enabled blocklist: ${sources[sourceIndex].name}, triggering update...`);

                    // Show immediate feedback
                    this.showSuccess(`Blocklist enabled: ${sources[sourceIndex].name}. Updating...`);

                    // Update in background
                    this.sendMessage({ action: 'updateBlocklists' }).then(response =>
                    {
                        if (response && response.success)
                        {
                            this.loadBlocklistSources();
                            this.loadStats();
                            this.showSuccess('Blocklist updated successfully!');
                        } else
                        {
                            this.showError('Failed to update blocklist after enabling');
                        }
                    }).catch(error =>
                    {
                        this.logger.error('Background update failed:', error);
                        this.showError('Failed to update blocklist after enabling');
                    });
                } else
                {
                    // If disabling, just reload the display
                    await this.loadBlocklistSources();
                    await this.loadStats();
                    this.showSuccess('Blocklist disabled successfully!');
                }
            }
        } catch (error)
        {
            this.logger.error('Failed to toggle blocklist:', error);
            this.showError('Failed to update blocklist setting');
        }
    }


    async changePIN()
    {
        const currentPin = document.getElementById('current-pin')?.value;
        const newPin = document.getElementById('new-pin')?.value;
        const messageEl = document.getElementById('pin-message');
        const changeButton = document.getElementById('change-pin');

        if (!messageEl) return;

        messageEl.innerHTML = '';

        if (currentPin !== this.currentPin)
        {
            this.showMessage(messageEl, 'Current PIN is incorrect.', 'error');
            return;
        }

        if (changeButton)
        {
            changeButton.disabled = true;
            changeButton.textContent = 'CHANGING...';
        }

        try
        {
            await chrome.storage.local.set({ [STORAGE_KEYS.PIN]: newPin });
            this.currentPin = newPin;
            this.cache.set('pin', newPin);

            this.showMessage(messageEl, 'PIN changed successfully!', 'success');

            ['current-pin', 'new-pin', 'confirm-pin'].forEach(id =>
            {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });

        } catch (error)
        {
            this.logger.error('PIN change error:', error);
            this.showMessage(messageEl, 'Failed to change PIN. Please try again.', 'error');
        } finally
        {
            if (changeButton)
            {
                changeButton.disabled = true;
                changeButton.textContent = 'ENTER ALL FIELDS';
            }
        }
    }

    async resetPinToDefault()
    {
        if (!confirm('Reset PIN to default (1234)?')) return;

        try
        {
            await chrome.storage.local.set({ [STORAGE_KEYS.PIN]: '1234' });
            this.currentPin = '1234';
            this.cache.set('pin', '1234');

            const messageEl = document.getElementById('pin-message');
            if (messageEl)
            {
                this.showMessage(messageEl, 'PIN reset to default (1234) successfully!', 'success');
            }
        } catch (error)
        {
            this.logger.error('PIN reset error:', error);
            const messageEl = document.getElementById('pin-message');
            if (messageEl)
            {
                this.showMessage(messageEl, 'Failed to reset PIN. Please try again.', 'error');
            }
        }
    }

    // Keywords Management
    validateKeywordInput()
    {
        const keywordInput = document.getElementById('new-keyword');
        const addButton = document.getElementById('add-keyword');

        if (!keywordInput || !addButton) return;

        const value = keywordInput.value.trim();
        addButton.disabled = value.length < 2;
        addButton.textContent = value.length < 2 ? 'ENTER KEYWORD' : 'ADD KEYWORD';
    }

    async loadKeywords()
    {
        try
        {
            const data = await chrome.storage.local.get([STORAGE_KEYS.BLOCKED_KEYWORDS]);
            let keywords = data[STORAGE_KEYS.BLOCKED_KEYWORDS];

            if (!keywords || keywords.length === 0)
            {
                keywords = [...DEFAULT_KEYWORDS];
                await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKED_KEYWORDS]: keywords });
            }

            this.renderKeywords(keywords);
        } catch (error)
        {
            this.logger.error('Failed to load keywords:', error);
            this.renderKeywords(DEFAULT_KEYWORDS);
        }
    }

    renderKeywords(keywords)
    {
        const container = document.getElementById('keywords-container');
        if (!container) return;

        if (keywords.length === 0)
        {
            container.innerHTML = '<div class="keywords-empty">No keywords blocked</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        const wrapper = document.createElement('div');
        wrapper.className = 'keywords-tags';

        keywords.forEach(keyword =>
        {
            const tag = document.createElement('div');
            tag.className = 'keyword-tag';
            tag.dataset.keyword = Utils.escapeHtml(keyword);
            tag.innerHTML = `
                <span class="keyword-text">${Utils.escapeHtml(keyword)}</span>
                <button class="remove-keyword" title="Remove keyword">×</button>
            `;
            wrapper.appendChild(tag);
        });

        fragment.appendChild(wrapper);
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    async addKeyword()
    {
        const input = document.getElementById('new-keyword');
        const addButton = document.getElementById('add-keyword');
        if (!input) return;

        const keyword = input.value.trim().toLowerCase();

        if (!keyword || keyword.length < 2) return;

        if (addButton)
        {
            addButton.disabled = true;
            addButton.textContent = 'ADDING...';
        }

        try
        {
            const data = await chrome.storage.local.get([STORAGE_KEYS.BLOCKED_KEYWORDS]);
            const currentKeywords = data[STORAGE_KEYS.BLOCKED_KEYWORDS] || [];

            if (currentKeywords.length === 0)
            {
                await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKED_KEYWORDS]: DEFAULT_KEYWORDS });
                currentKeywords.push(...DEFAULT_KEYWORDS);
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
            await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKED_KEYWORDS]: updatedKeywords });

            input.value = '';
            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess(`Keyword "${keyword}" added successfully!`);

        } catch (error)
        {
            this.logger.error('Add keyword error:', error);
            this.showError('Failed to add keyword. Please try again.');
        } finally
        {
            if (addButton)
            {
                addButton.disabled = true;
                addButton.textContent = 'ENTER KEYWORD';
            }
        }
    }

    async removeKeyword(keyword)
    {
        if (!confirm(`Remove keyword "${keyword}"?`)) return;

        try
        {
            const data = await chrome.storage.local.get([STORAGE_KEYS.BLOCKED_KEYWORDS]);
            const currentKeywords = data[STORAGE_KEYS.BLOCKED_KEYWORDS] || [];

            const updatedKeywords = currentKeywords.filter(k =>
                k.toLowerCase() !== keyword.toLowerCase()
            );

            await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKED_KEYWORDS]: updatedKeywords });

            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess(`Keyword "${keyword}" removed successfully!`);

        } catch (error)
        {
            this.logger.error('Remove keyword error:', error);
            this.showError('Failed to remove keyword. Please try again.');
        }
    }

    async resetKeywords()
    {
        if (!confirm('Reset to default keywords? This will replace all current keywords.')) return;

        try
        {
            await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKED_KEYWORDS]: DEFAULT_KEYWORDS });
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
            await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKED_KEYWORDS]: [] });
            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess('All keywords cleared!');
        } catch (error)
        {
            this.showError('Failed to clear keywords.');
        }
    }

    // Domains Management
    validateDomainInput()
    {
        const domainInput = document.getElementById('new-domain');
        const addButton = document.getElementById('add-domain');

        if (!domainInput || !addButton) return;

        let value = domainInput.value.trim().toLowerCase();
        value = Utils.sanitizeUrl(value);

        const isValid = value.length > 3 && Utils.isValidDomain(value);
        addButton.disabled = !isValid;
        addButton.textContent = !isValid ? 'ENTER DOMAIN' : 'ADD DOMAIN';
    }

    async loadDomains()
    {
        try
        {
            const data = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_DOMAINS]);
            const domains = data[STORAGE_KEYS.CUSTOM_DOMAINS] || [];
            this.renderDomains(domains);
        } catch (error)
        {
            this.showError('Failed to load domains');
        }
    }

    renderDomains(domains)
    {
        const container = document.getElementById('domains-list');
        if (!container) return;

        if (domains.length === 0)
        {
            container.innerHTML = '<div class="keywords-empty">No custom domains blocked</div>';
            return;
        }

        const fragment = document.createDocumentFragment();

        domains.forEach(domain =>
        {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.dataset.domain = Utils.escapeHtml(domain);
            item.innerHTML = `
                <span>${Utils.escapeHtml(domain)}</span>
                <button class="btn btn-sm btn-danger remove-domain">DELETE</button>
            `;
            fragment.appendChild(item);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    async addDomain()
    {
        const input = document.getElementById('new-domain');
        const addButton = document.getElementById('add-domain');
        if (!input) return;

        let domain = Utils.sanitizeUrl(input.value.trim().toLowerCase());

        if (!domain || !Utils.isValidDomain(domain)) return;

        if (addButton)
        {
            addButton.disabled = true;
            addButton.textContent = 'ADDING...';
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
        } finally
        {
            if (addButton)
            {
                addButton.disabled = true;
                addButton.textContent = 'ENTER DOMAIN';
            }
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
            await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_DOMAINS]: [] });
            await this.loadDomains();
            await this.loadStats();
            this.showSuccess('All custom domains cleared!');
        } catch (error)
        {
            this.showError('Failed to clear domains.');
        }
    }

    // Blocklist Management
    async initializeDefaultBlocklists()
    {
        try
        {
            const data = await chrome.storage.local.get([STORAGE_KEYS.BLOCKLIST_SOURCES, 'blocklistInitialized']);

            if (!data.blocklistInitialized)
            {
                await chrome.storage.local.set({
                    [STORAGE_KEYS.BLOCKLIST_SOURCES]: DEFAULT_BLOCKLISTS,
                    blocklistInitialized: true,
                    lastBlocklistUpdate: 0
                });
            }

            await this.loadBlocklistSources();
        } catch (error)
        {
            this.logger.error('Failed to initialize blocklists:', error);
        }
    }

    async loadBlocklistSources()
    {
        try
        {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.BLOCKLIST_SOURCES,
                STORAGE_KEYS.BLOCKLIST_RESULTS,
                'lastBlocklistUpdate'
            ]);

            const sources = data[STORAGE_KEYS.BLOCKLIST_SOURCES] || DEFAULT_BLOCKLISTS;
            const results = data[STORAGE_KEYS.BLOCKLIST_RESULTS] || [];
            const lastUpdate = data.lastBlocklistUpdate || 0;

            // If no results exist yet, try to trigger an initial update
            if (results.length === 0 && sources.some(s => s.enabled))
            {
                this.logger.info('No blocklist results found, triggering initial update...');
                // Don't await this - let it run in background
                this.triggerInitialBlocklistUpdate();
            }

            this.renderBlocklistSources(sources, results, lastUpdate);
        } catch (error)
        {
            this.logger.error('Failed to load blocklist sources:', error);
            this.showError('Failed to load blocklist sources');
        }
    }

    renderBlocklistSources(sources, results, lastUpdate)
    {
        const container = document.getElementById('blocklists-container');
        if (!container) return;

        if (sources.length === 0)
        {
            container.innerHTML = '<div class="keywords-empty">No blocklist sources configured</div>';
            return;
        }

        const fragment = document.createDocumentFragment();

        sources.forEach(source =>
        {
            const result = results.find(r => r.id === source.id) || {};
            const isActive = source.enabled && result.success;
            const domainCount = result.domainCount || 0;
            const lastUpdated = result.lastUpdated ?
                new Date(result.lastUpdated).toLocaleDateString() : 'Never';

            // Determine status
            let statusText = 'DISABLED';
            let statusClass = 'inactive';

            if (source.enabled)
            {
                if (result.success)
                {
                    statusText = 'ACTIVE';
                    statusClass = 'active';
                } else if (result.error)
                {
                    statusText = 'FAILED';
                    statusClass = 'inactive';
                } else
                {
                    statusText = 'PENDING';
                    statusClass = 'inactive';
                }
            }

            const item = document.createElement('div');
            item.className = 'blocklist-item';
            item.dataset.sourceId = source.id;
            item.innerHTML = `
            <div class="blocklist-header">
                <div class="blocklist-name">${Utils.escapeHtml(source.name)}</div>
                <div class="blocklist-status">
                    <span class="status-badge ${statusClass}">
                        ${statusText}
                    </span>
                    ${isActive ? `<span>${domainCount.toLocaleString()} domains</span>` : ''}
                </div>
            </div>
            
            <div class="blocklist-info">
                ${Utils.escapeHtml(source.description || 'Community blocklist')}
            </div>
            
            <div class="blocklist-url">${Utils.escapeHtml(source.url)}</div>
            
            <div class="blocklist-actions">
                <label style="display: flex; align-items: center; gap: 5px; font-size: 13px;">
                    <input type="checkbox" class="blocklist-toggle" ${source.enabled ? 'checked' : ''}>
                    Enable
                </label>
                <span style="font-size: 12px; color: #666;">Last updated: ${lastUpdated}</span>
            </div>
            
            ${result.error ? `<div style="color: #d32f2f; font-size: 12px; margin-top: 8px;">Error: ${Utils.escapeHtml(result.error)}</div>` : ''}
        `;
            fragment.appendChild(item);
        });

        container.innerHTML = '';
        container.appendChild(fragment);

        // Show last update time if available
        if (lastUpdate > 0)
        {
            const updateInfo = document.createElement('div');
            updateInfo.style.cssText = 'text-align: center; margin-top: 15px; font-size: 12px; color: #666;';
            updateInfo.textContent = `Last successful update: ${new Date(lastUpdate).toLocaleString()}`;
            container.appendChild(updateInfo);
        }
    }

    async viewBlockedCount()
    {
        try
        {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.BLOCKED_DOMAINS,
                STORAGE_KEYS.CUSTOM_DOMAINS,
                STORAGE_KEYS.BLOCKED_KEYWORDS,
                STORAGE_KEYS.BLOCKLIST_RESULTS,
                STORAGE_KEYS.BLOCKLIST_SOURCES,
                'lastBlocklistUpdate'
            ]);

            const githubDomains = (data[STORAGE_KEYS.BLOCKED_DOMAINS] || []).length;
            const customDomains = (data[STORAGE_KEYS.CUSTOM_DOMAINS] || []).length;
            const keywords = (data[STORAGE_KEYS.BLOCKED_KEYWORDS] || []).length;
            const results = data[STORAGE_KEYS.BLOCKLIST_RESULTS] || [];
            const sources = data[STORAGE_KEYS.BLOCKLIST_SOURCES] || [];
            const lastUpdate = data.lastBlocklistUpdate ?
                new Date(data.lastBlocklistUpdate).toLocaleString() : 'Never';

            const activeResults = results.filter(r => r.success);
            const failedResults = results.filter(r => !r.success);
            const enabledSources = sources.filter(s => s.enabled);

            let message = `📊 Blocking Statistics\n\n`;
            message += `🛡️ Total Protection:\n`;
            message += `• Blocklist Domains: ${githubDomains.toLocaleString()}\n`;
            message += `• Custom Domains: ${customDomains.toLocaleString()}\n`;
            message += `• Total Domains: ${(githubDomains + customDomains).toLocaleString()}\n`;
            message += `• Blocked Keywords: ${keywords.toLocaleString()}\n\n`;

            message += `📋 Blocklist Sources:\n`;
            message += `• Total Sources: ${sources.length}\n`;
            message += `• Enabled Sources: ${enabledSources.length}\n`;
            message += `• Active Sources: ${activeResults.length}\n`;
            message += `• Failed Sources: ${failedResults.length}\n\n`;

            if (activeResults.length > 0)
            {
                message += `✅ Active Blocklists:\n`;
                activeResults.forEach(result =>
                {
                    const source = sources.find(s => s.id === result.id);
                    message += `• ${source?.name || result.id}: ${result.domainCount.toLocaleString()} domains\n`;
                });
                message += `\n`;
            }

            if (failedResults.length > 0)
            {
                message += `❌ Failed Blocklists:\n`;
                failedResults.forEach(result =>
                {
                    const source = sources.find(s => s.id === result.id);
                    message += `• ${source?.name || result.id}: ${result.error}\n`;
                });
                message += `\n`;
            }

            message += `🕒 Last Updated: ${lastUpdate}`;

            alert(message);
        } catch (error)
        {
            this.showError('Failed to load blocking statistics.');
        }
    }

    async triggerInitialBlocklistUpdate()
    {
        try
        {
            // Show loading state
            const container = document.getElementById('blocklists-container');
            if (container)
            {
                container.innerHTML = '<div class="loading">Updating blocklists for the first time...</div>';
            }

            this.logger.info('Triggering initial blocklist update...');

            const response = await this.sendMessage({ action: 'updateBlocklists' });

            this.logger.debug('Initial update response:', response);

            if (response && response.success)
            {
                this.logger.info('Initial blocklist update completed successfully');
                // Reload the display
                await this.loadBlocklistSources();
                this.showSuccess('Blocklists updated successfully!');
            } else
            {
                let errorMsg = 'Unknown error occurred';

                if (response && response.error)
                {
                    errorMsg = response.error;
                } else if (response && typeof response === 'object')
                {
                    errorMsg = JSON.stringify(response);
                }

                this.logger.error('Initial blocklist update failed:', errorMsg);

                // Show error but still display the interface
                this.showError(`Blocklist update failed: ${errorMsg}`);
                await this.loadBlocklistSources();
            }
        } catch (error)
        {
            this.logger.error('Initial blocklist update error:', error);

            // Determine error message
            let errorMsg = 'Unknown error';
            if (error instanceof Error)
            {
                errorMsg = error.message;
            } else if (typeof error === 'string')
            {
                errorMsg = error;
            } else if (error && typeof error === 'object')
            {
                errorMsg = error.error || error.message || JSON.stringify(error);
            }

            this.showError(`Failed to update blocklists: ${errorMsg}`);

            // Still show the interface even if update failed
            await this.loadBlocklistSources();
        }
    }

    async forceUpdateBlocklists()
    {
        const button = document.getElementById('force-update');
        if (!button) return;

        const originalText = button.textContent;
        button.textContent = 'UPDATING...';
        button.disabled = true;

        try
        {
            this.logger.info('Starting forced blocklist update...');

            // Send message to background script to update blocklists
            const response = await this.sendMessage({
                action: 'updateBlocklists'
            });

            if (response && response.success)
            {
                button.textContent = 'UPDATE COMPLETE!';

                // Show detailed success message
                const message = response.message ||
                    `Updated ${response.successfulSources || 0}/${response.totalSources || 0} blocklists with ${(response.totalDomains || 0).toLocaleString()} domains`;

                this.showSuccess(message);

                // Reload the blocklist display
                await this.loadBlocklistSources();
                await this.loadStats();

            } else
            {
                button.textContent = 'UPDATE FAILED';
                const errorMsg = response?.error || 'Failed to update blocklists';
                this.showError(`Update failed: ${errorMsg}`);
                this.logger.error('Blocklist update failed:', response);
            }
        } catch (error)
        {
            this.logger.error('Update failed:', error);
            button.textContent = 'UPDATE FAILED';
            this.showError(`Update failed: ${error.message}`);
        } finally
        {
            setTimeout(() =>
            {
                button.textContent = originalText;
                button.disabled = false;
            }, 3000);
        }
    }

    async viewBlockedCount()
    {
        try
        {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.BLOCKED_DOMAINS,
                STORAGE_KEYS.CUSTOM_DOMAINS,
                STORAGE_KEYS.BLOCKED_KEYWORDS,
                STORAGE_KEYS.BLOCKLIST_RESULTS,
                'lastBlocklistUpdate'
            ]);

            const githubDomains = (data[STORAGE_KEYS.BLOCKED_DOMAINS] || []).length;
            const customDomains = (data[STORAGE_KEYS.CUSTOM_DOMAINS] || []).length;
            const keywords = (data[STORAGE_KEYS.BLOCKED_KEYWORDS] || []).length;
            const results = data[STORAGE_KEYS.BLOCKLIST_RESULTS] || [];
            const lastUpdate = data.lastBlocklistUpdate ?
                new Date(data.lastBlocklistUpdate).toLocaleString() : 'Never';

            const activeResults = results.filter(r => r.success);
            const failedResults = results.filter(r => !r.success);

            let message = `📊 Blocking Statistics\n\n`;
            message += `🛡️ Total Protection:\n`;
            message += `• Blocklist Domains: ${githubDomains.toLocaleString()}\n`;
            message += `• Custom Domains: ${customDomains.toLocaleString()}\n`;
            message += `• Total Domains: ${(githubDomains + customDomains).toLocaleString()}\n`;
            message += `• Blocked Keywords: ${keywords.toLocaleString()}\n\n`;

            if (activeResults.length > 0)
            {
                message += `✅ Active Blocklists:\n`;
                activeResults.forEach(result =>
                {
                    const source = data[STORAGE_KEYS.BLOCKLIST_SOURCES]?.find(s => s.id === result.id);
                    message += `• ${source?.name || result.id}: ${result.domainCount.toLocaleString()} domains\n`;
                });
                message += `\n`;
            }

            if (failedResults.length > 0)
            {
                message += `❌ Failed Blocklists:\n`;
                failedResults.forEach(result =>
                {
                    const source = data[STORAGE_KEYS.BLOCKLIST_SOURCES]?.find(s => s.id === result.id);
                    message += `• ${source?.name || result.id}: ${result.error}\n`;
                });
                message += `\n`;
            }

            message += `🕒 Last Updated: ${lastUpdate}`;

            alert(message);
        } catch (error)
        {
            this.showError('Failed to load blocking statistics.');
        }
    }

    // Settings Management
    async loadAllSettings()
    {
        try
        {
            await Promise.all([
                this.loadCurrentPin(),
                this.loadStats(),
                this.loadKeywords(),
                this.loadDomains(),
                this.loadBlocklistSources()
            ]);
        } catch (error)
        {
            this.logger.error('Failed to load some settings:', error);
        }
    }

    async loadStats()
    {
        try
        {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.BLOCKS_TODAY,
                STORAGE_KEYS.FOCUS_STREAK,
                STORAGE_KEYS.TOTAL_BLOCKS,
                STORAGE_KEYS.CUSTOM_DOMAINS,
                STORAGE_KEYS.BLOCKED_KEYWORDS,
                STORAGE_KEYS.BLOCKED_DOMAINS
            ]);

            requestAnimationFrame(() =>
            {
                const elements = {
                    totalBlocks: document.getElementById('total-blocks'),
                    domainsBlocked: document.getElementById('domains-blocked'),
                    keywordsBlocked: document.getElementById('keywords-blocked'),
                    timeSaved: document.getElementById('time-saved')
                };

                if (elements.totalBlocks)
                {
                    elements.totalBlocks.textContent = (data[STORAGE_KEYS.TOTAL_BLOCKS] || 0).toLocaleString();
                }

                if (elements.domainsBlocked)
                {
                    const customDomains = (data[STORAGE_KEYS.CUSTOM_DOMAINS] || []).length;
                    const githubDomains = (data[STORAGE_KEYS.BLOCKED_DOMAINS] || []).length;
                    elements.domainsBlocked.textContent = (customDomains + githubDomains).toLocaleString();
                }

                if (elements.keywordsBlocked)
                {
                    elements.keywordsBlocked.textContent = (data[STORAGE_KEYS.BLOCKED_KEYWORDS] || []).length.toLocaleString();
                }

                if (elements.timeSaved)
                {
                    const timeSaved = Utils.estimateTimeSaved(data[STORAGE_KEYS.TOTAL_BLOCKS] || 0);
                    elements.timeSaved.textContent = timeSaved;
                }
            });

        } catch (error)
        {
            this.logger.error('Failed to load stats:', error);
        }
    }

    updateBrowserInfo()
    {
        const browserInfoEl = document.getElementById('browser-info');
        if (browserInfoEl)
        {
            browserInfoEl.textContent = Utils.getBrowserInfo();
        }
    }

    // Import/Export
    async exportSettings()
    {
        try
        {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.BLOCKED_KEYWORDS,
                STORAGE_KEYS.CUSTOM_DOMAINS,
                STORAGE_KEYS.BLOCKLIST_SOURCES,
                STORAGE_KEYS.IS_ACTIVE,
                STORAGE_KEYS.BLOCKS_TODAY,
                STORAGE_KEYS.FOCUS_STREAK,
                STORAGE_KEYS.TOTAL_BLOCKS,
                'lastBlocklistUpdate'
            ]);

            const exportData = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                settings: {
                    blockedKeywords: data[STORAGE_KEYS.BLOCKED_KEYWORDS] || [],
                    customDomains: data[STORAGE_KEYS.CUSTOM_DOMAINS] || [],
                    blocklistSources: data[STORAGE_KEYS.BLOCKLIST_SOURCES] || [],
                    isActive: data[STORAGE_KEYS.IS_ACTIVE] !== undefined ? data[STORAGE_KEYS.IS_ACTIVE] : true,
                    lastBlocklistUpdate: data.lastBlocklistUpdate || 0
                },
                stats: {
                    blocksToday: data[STORAGE_KEYS.BLOCKS_TODAY] || 0,
                    focusStreak: data[STORAGE_KEYS.FOCUS_STREAK] || 0,
                    totalBlocks: data[STORAGE_KEYS.TOTAL_BLOCKS] || 0
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

            const currentPin = await chrome.storage.local.get([STORAGE_KEYS.PIN]);

            const settingsToImport = {
                ...importData.settings,
                [STORAGE_KEYS.PIN]: currentPin[STORAGE_KEYS.PIN] || '1234',
                lastImportDate: new Date().toISOString()
            };

            if (importData.stats)
            {
                Object.assign(settingsToImport, importData.stats);
            }

            await chrome.storage.local.set(settingsToImport);

            // Clear cache
            this.cache.clear();

            await this.loadAllSettings();

            this.showMessage(messageEl, 'Settings imported successfully!', 'success');

        } catch (error)
        {
            this.logger.error('Import error:', error);
            this.showMessage(messageEl, `Failed to import settings: ${error.message}`, 'error');
        } finally
        {
            event.target.value = '';
        }
    }

    async refreshAllData()
    {
        try
        {
            this.logger.info('Refreshing all data...');
            await this.loadAllSettings();
            this.logger.debug('All data refreshed');
        } catch (error)
        {
            this.logger.error('Failed to refresh data:', error);
        }
    }

    async resetAllSettings()
    {
        if (!confirm('Reset ALL settings to defaults?\n\nThis will:\n- Clear all custom domains and keywords\n- Reset PIN to 1234\n- Clear all statistics\n- Reset blocklist sources\n\nThis action cannot be undone!'))
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
                [STORAGE_KEYS.PIN]: '1234',
                [STORAGE_KEYS.BLOCKED_KEYWORDS]: DEFAULT_KEYWORDS,
                [STORAGE_KEYS.CUSTOM_DOMAINS]: [],
                [STORAGE_KEYS.BLOCKLIST_SOURCES]: DEFAULT_BLOCKLISTS,
                [STORAGE_KEYS.IS_ACTIVE]: true,
                [STORAGE_KEYS.BLOCKS_TODAY]: 0,
                [STORAGE_KEYS.FOCUS_STREAK]: 0,
                [STORAGE_KEYS.TOTAL_BLOCKS]: 0,
                blocklistInitialized: true,
                lastResetDate: new Date().toISOString()
            });

            // Clear cache
            this.cache.clear();

            await this.loadAllSettings();
            this.showSuccess('All settings reset to defaults!');

        } catch (error)
        {
            this.showError(`Failed to reset settings: ${error.message}`);
        }
    }

    // Debug and Testing
    testBlocking()
    {
        const debugUrl = chrome.runtime.getURL('debug-test.html');
        chrome.tabs.create({ url: debugUrl });
    }

    async viewLogs()
    {
        try
        {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.BLOCKS_TODAY,
                STORAGE_KEYS.FOCUS_STREAK,
                STORAGE_KEYS.TOTAL_BLOCKS,
                STORAGE_KEYS.LAST_BLOCK_DATE,
                'lastImportDate',
                'lastResetDate',
                'lastBlocklistUpdate',
                STORAGE_KEYS.ERROR_LOG
            ]);

            let logText = 'Fokus Extension Activity Log\n';
            logText += '='.repeat(40) + '\n\n';

            logText += `Current Statistics:\n`;
            logText += `- Blocks Today: ${data[STORAGE_KEYS.BLOCKS_TODAY] || 0}\n`;
            logText += `- Focus Streak: ${data[STORAGE_KEYS.FOCUS_STREAK] || 0} days\n`;
            logText += `- Total Blocks: ${data[STORAGE_KEYS.TOTAL_BLOCKS] || 0}\n\n`;

            logText += `Important Dates:\n`;
            if (data[STORAGE_KEYS.LAST_BLOCK_DATE])
            {
                logText += `- Last Block: ${data[STORAGE_KEYS.LAST_BLOCK_DATE]}\n`;
            }
            if (data.lastBlocklistUpdate)
            {
                logText += `- Last Blocklist Update: ${new Date(data.lastBlocklistUpdate).toLocaleString()}\n`;
            }
            if (data.lastImportDate)
            {
                logText += `- Last Settings Import: ${new Date(data.lastImportDate).toLocaleString()}\n`;
            }
            if (data.lastResetDate)
            {
                logText += `- Last Settings Reset: ${new Date(data.lastResetDate).toLocaleString()}\n`;
            }

            if (data[STORAGE_KEYS.ERROR_LOG] && data[STORAGE_KEYS.ERROR_LOG].length > 0)
            {
                logText += `\nRecent Errors (last ${data[STORAGE_KEYS.ERROR_LOG].length}):\n`;
                data[STORAGE_KEYS.ERROR_LOG].forEach(error =>
                {
                    logText += `- [${error.timestamp}] ${error.context}: ${error.message}\n`;
                });
            }

            logText += `\nGenerated: ${new Date().toLocaleString()}\n`;

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

    // Utility Methods
    showMessage(element, message, type)
    {
        if (!element) return;

        const messageClass = type === 'success' ? 'success-message' :
            type === 'info' ? 'info-message' : 'error-message';

        requestAnimationFrame(() =>
        {
            element.innerHTML = `<div class="${messageClass}">${Utils.escapeHtml(message)}</div>`;
        });

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
        this.logger.info('Success:', message);
        Utils.createToast(message, 'success');
    }

    showError(message)
    {
        this.logger.error('Error:', message);
        Utils.createToast(message, 'error');
    }

    sendMessage(message)
    {
        return new Promise((resolve, reject) =>
        {
            try
            {
                this.logger.debug('Sending message:', message);

                chrome.runtime.sendMessage(message, (response) =>
                {
                    if (chrome.runtime.lastError)
                    {
                        const error = new Error(chrome.runtime.lastError.message);
                        this.logger.error('Chrome runtime error:', error);
                        reject(error);
                    } else
                    {
                        this.logger.debug('Received response:', response);
                        resolve(response);
                    }
                });
            } catch (error)
            {
                this.logger.error('Failed to send message:', error);
                reject(error);
            }
        });
    }
    destroy()
    {
        // Clear all timers
        for (const timer of this.debounceTimers.values())
        {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        // Clear cache
        this.cache.clear();

        // Clear references
        this.currentPin = null;

        // Remove event listeners
        document.removeEventListener('click', this.handleClick);
        document.removeEventListener('input', this.handleInput);
        document.removeEventListener('keypress', this.handleKeypress);
        document.removeEventListener('change', this.handleChange);

        this.logger.info('OptionsController destroyed');
    }
}

export default OptionsController;