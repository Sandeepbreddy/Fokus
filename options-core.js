// options-core.js - Core functionality for Fokus Extension Settings

class OptionsManager
{
    constructor()
    {
        this.isInitialized = false;
        this.currentPin = null;
        /*
         * Top 50+ Keywords for Adult Content Blocking
         * 
         * Strategy: Use partial matching with root words to catch variations
         * Examples of what gets blocked:
         * 
         * 'porn' blocks: japanporn, indianporn, pornhub, freeporn, pornstar
         * 'sex' blocks: sexcam, cybersex, sexvideo, bisexual, unisex  
         * 'masturbat' blocks: masturbation, masturbating, masturbator
         * 'fuck' blocks: fucking, fucked, motherfucker
         * 'escort' blocks: escorts, escorting, escortservice
         * 
         * This approach is more effective than exact matching and catches
         * new variations automatically without manual updates.
         */
        this.defaultKeywords = [
            // Core adult terms
            'porn', 'sex', 'xxx', 'adult', 'nude', 'naked', 'nsfw',
            'explicit', 'mature', 'erotic', 'hardcore', 'softcore',

            // Action-based terms  
            'fuck', 'fucking', 'fucked', 'anal', 'oral', 'blowjob',
            'handjob', 'masturbat', 'orgasm', 'climax', 'cumshot',

            // Body parts
            'penis', 'vagina', 'breast', 'boob', 'tit', 'ass', 'butt',
            'cock', 'dick', 'pussy', 'clit', 'nipple',

            // Fetish and BDSM
            'bdsm', 'bondage', 'fetish', 'kink', 'domination', 'submission',
            'slave', 'master', 'mistress', 'torture', 'whip',

            // Adult categories and orientations
            'lesbian', 'gay', 'homo', 'bisexual', 'trans', 'shemale',
            'milf', 'teen', 'young', 'old', 'mature',

            // Adult industry terms
            'escort', 'prostitut', 'hooker', 'stripper', 'webcam',
            'camgirl', 'camboy', 'livecam', 'chaturbate'
        ];

        // Default blocklist sources - Back to using StevenBlack
        this.defaultBlocklists = [
            {
                id: 'stevenblack-porn',
                name: 'StevenBlack Adult Content',
                url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts',
                description: 'Community-maintained adult content blocklist (12,000+ domains)',
                enabled: true,
                isDefault: true
            },
            {
                id: 'stevenblack-gambling',
                name: 'StevenBlack Gambling',
                url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts',
                description: 'Community-maintained gambling sites blocklist',
                enabled: false,
                isDefault: true
            },
            {
                id: 'stevenblack-social',
                name: 'StevenBlack Social Media',
                url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/social-only/hosts',
                description: 'Community-maintained social media blocklist',
                enabled: false,
                isDefault: true
            }
        ];
    }

    async init()
    {
        console.log('Initializing Options Manager...');

        try
        {
            this.setupEventListeners();
            await this.loadAllSettings();
            await this.initializeDefaultBlocklists();
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

        // Blocklist Management
        this.setupBlocklistEventListeners();
    }

    // PIN MANAGEMENT WITH VALIDATION
    setupPinEventListeners()
    {
        const changeButton = document.getElementById('change-pin');
        const currentPinInput = document.getElementById('current-pin');
        const newPinInput = document.getElementById('new-pin');
        const confirmPinInput = document.getElementById('confirm-pin');

        // Initially disable button
        if (changeButton) changeButton.disabled = true;

        // Real-time validation
        const validatePinForm = () =>
        {
            const currentPin = currentPinInput?.value || '';
            const newPin = newPinInput?.value || '';
            const confirmPin = confirmPinInput?.value || '';

            const isValid = currentPin.length >= 4 &&
                newPin.length >= 4 &&
                confirmPin.length >= 4 &&
                /^\d+$/.test(newPin) &&
                newPin === confirmPin;

            if (changeButton)
            {
                changeButton.disabled = !isValid;
                if (!isValid)
                {
                    if (currentPin.length < 4) changeButton.textContent = 'ENTER CURRENT PIN';
                    else if (newPin.length < 4) changeButton.textContent = 'ENTER NEW PIN';
                    else if (confirmPin.length < 4) changeButton.textContent = 'CONFIRM PIN';
                    else if (!/^\d+$/.test(newPin)) changeButton.textContent = 'NUMBERS ONLY';
                    else if (newPin !== confirmPin) changeButton.textContent = 'PINS DON\'T MATCH';
                    else changeButton.textContent = 'ENTER ALL FIELDS';
                } else
                {
                    changeButton.textContent = 'CHANGE PIN';
                }
            }
        };

        currentPinInput?.addEventListener('input', validatePinForm);
        newPinInput?.addEventListener('input', validatePinForm);
        confirmPinInput?.addEventListener('input', validatePinForm);

        changeButton?.addEventListener('click', () => this.changePIN());
        document.getElementById('reset-to-default')?.addEventListener('click', () => this.resetPinToDefault());

        confirmPinInput?.addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter' && !changeButton.disabled) this.changePIN();
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
        const changeButton = document.getElementById('change-pin');

        if (!messageEl) return;

        messageEl.innerHTML = '';

        // Validation is now handled by button state, but double-check
        if (!currentPin || !newPin || !confirmPin)
        {
            return; // Button should be disabled
        }

        if (currentPin !== this.currentPin)
        {
            this.showMessage(messageEl, 'Current PIN is incorrect.', 'error');
            return;
        }

        // Disable button during operation
        if (changeButton)
        {
            changeButton.disabled = true;
            changeButton.textContent = 'CHANGING...';
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
        } finally
        {
            // Re-enable validation
            if (changeButton)
            {
                changeButton.disabled = true; // Will be re-enabled by input events
                changeButton.textContent = 'ENTER ALL FIELDS';
            }
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

    // KEYWORDS MANAGEMENT - TAG DISPLAY WITH VALIDATION
    setupKeywordsEventListeners()
    {
        const addButton = document.getElementById('add-keyword');
        const keywordInput = document.getElementById('new-keyword');

        // Initially disable button
        if (addButton) addButton.disabled = true;

        // Real-time validation
        keywordInput?.addEventListener('input', (e) =>
        {
            const value = e.target.value.trim();
            if (addButton)
            {
                addButton.disabled = value.length < 2;
                addButton.textContent = value.length < 2 ? 'ENTER KEYWORD' : 'ADD KEYWORD';
            }
        });

        addButton?.addEventListener('click', () => this.addKeyword());
        keywordInput?.addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter' && !addButton.disabled) this.addKeyword();
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
            let keywords = data.blockedKeywords;

            if (!keywords || keywords.length === 0)
            {
                console.log('No keywords found, using defaults');
                keywords = [...this.defaultKeywords];
                await chrome.storage.local.set({ blockedKeywords: keywords });
            }

            this.renderKeywordsTags(keywords);

        } catch (error)
        {
            console.error('Failed to load keywords:', error);
            this.renderKeywordsTags(this.defaultKeywords);
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

    renderKeywordsTags(keywords)
    {
        const container = document.getElementById('keywords-container');
        if (!container)
        {
            console.warn('Keywords container not found');
            return;
        }

        if (keywords.length === 0)
        {
            container.innerHTML = '<div class="keywords-empty">No keywords blocked</div>';
            return;
        }

        const tagsHtml = keywords.map(keyword => `
            <div class="keyword-tag" data-keyword="${this.escapeHtml(keyword)}">
                <span class="keyword-text">${this.escapeHtml(keyword)}</span>
                <button class="remove-keyword" title="Remove keyword">
                    ×
                </button>
            </div>
        `).join('');

        container.innerHTML = `<div class="keywords-tags">${tagsHtml}</div>`;

        // Add event listeners for remove buttons
        container.querySelectorAll('.remove-keyword').forEach(button =>
        {
            button.addEventListener('click', (e) =>
            {
                const keyword = e.target.closest('.keyword-tag').dataset.keyword;
                this.removeKeyword(keyword);
            });
        });
    }

    async addKeyword()
    {
        const input = document.getElementById('new-keyword');
        const addButton = document.getElementById('add-keyword');
        if (!input) return;

        const keyword = input.value.trim().toLowerCase();

        // Validation is now handled by button state, but double-check
        if (!keyword || keyword.length < 2)
        {
            return; // Button should be disabled, so this shouldn't happen
        }

        // Disable button during operation
        if (addButton)
        {
            addButton.disabled = true;
            addButton.textContent = 'ADDING...';
        }

        try
        {
            const data = await chrome.storage.local.get(['blockedKeywords']);
            const currentKeywords = data.blockedKeywords || [];

            if (currentKeywords.length === 0)
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
        } finally
        {
            // Re-enable button and reset text
            if (addButton)
            {
                addButton.disabled = true; // Will be re-enabled by input event
                addButton.textContent = 'ENTER KEYWORD';
            }
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

    // DOMAINS MANAGEMENT WITH VALIDATION
    setupDomainsEventListeners()
    {
        const addButton = document.getElementById('add-domain');
        const domainInput = document.getElementById('new-domain');

        // Initially disable button
        if (addButton) addButton.disabled = true;

        // Real-time validation
        domainInput?.addEventListener('input', (e) =>
        {
            let value = e.target.value.trim().toLowerCase();
            // Clean the input
            value = value.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

            const isValid = value.length > 3 && this.isValidDomain(value);
            if (addButton)
            {
                addButton.disabled = !isValid;
                addButton.textContent = !isValid ? 'ENTER DOMAIN' : 'ADD DOMAIN';
            }
        });

        addButton?.addEventListener('click', () => this.addDomain());
        domainInput?.addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter' && !addButton.disabled) this.addDomain();
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
            container.innerHTML = '<div class="keywords-empty">No custom domains blocked</div>';
            return;
        }

        container.innerHTML = domains.map(domain => `
            <div class="list-item" data-domain="${this.escapeHtml(domain)}">
                <span>${this.escapeHtml(domain)}</span>
                <button class="btn btn-sm btn-danger remove-domain">
                    DELETE
                </button>
            </div>
        `).join('');

        // Add event listeners for remove buttons
        container.querySelectorAll('.remove-domain').forEach(button =>
        {
            button.addEventListener('click', (e) =>
            {
                const domain = e.target.closest('.list-item').dataset.domain;
                this.removeDomain(domain);
            });
        });
    }

    async addDomain()
    {
        const input = document.getElementById('new-domain');
        const addButton = document.getElementById('add-domain');
        if (!input) return;

        let domain = input.value.trim().toLowerCase();
        domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

        // Validation is now handled by button state
        if (!domain || !this.isValidDomain(domain))
        {
            return; // Button should be disabled
        }

        // Disable button during operation
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
            // Re-enable button and reset text
            if (addButton)
            {
                addButton.disabled = true; // Will be re-enabled by input event
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
            await chrome.storage.local.set({ customDomains: [] });
            await this.loadDomains();
            await this.loadStats();
            this.showSuccess('All custom domains cleared!');
        } catch (error)
        {
            this.showError('Failed to clear domains.');
        }
    }

    // BLOCKLIST MANAGEMENT
    setupBlocklistEventListeners()
    {
        document.getElementById('force-update')?.addEventListener('click', () => this.forceUpdateBlocklists());
        document.getElementById('view-blocked-count')?.addEventListener('click', () => this.viewBlockedCount());
    }

    async initializeDefaultBlocklists()
    {
        try
        {
            const data = await chrome.storage.local.get(['blocklistSources', 'blocklistInitialized']);

            if (!data.blocklistInitialized)
            {
                await chrome.storage.local.set({
                    blocklistSources: this.defaultBlocklists,
                    blocklistInitialized: true,
                    lastBlocklistUpdate: 0
                });
                console.log('Default blocklists initialized');
            }

            await this.loadBlocklistSources();
        } catch (error)
        {
            console.error('Failed to initialize blocklists:', error);
        }
    }

    async loadBlocklistSources()
    {
        try
        {
            const data = await chrome.storage.local.get(['blocklistSources', 'blocklistResults', 'lastBlocklistUpdate']);
            const sources = data.blocklistSources || this.defaultBlocklists;
            const results = data.blocklistResults || [];
            const lastUpdate = data.lastBlocklistUpdate || 0;

            this.renderBlocklistSources(sources, results, lastUpdate);
        } catch (error)
        {
            console.error('Failed to load blocklist sources:', error);
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

        container.innerHTML = sources.map(source =>
        {
            const result = results.find(r => r.id === source.id) || {};
            const isActive = source.enabled && result.success;
            const domainCount = result.domainCount || 0;
            const lastUpdated = result.lastUpdated ?
                new Date(result.lastUpdated).toLocaleDateString() : 'Never';

            return `
                <div class="blocklist-item" data-source-id="${source.id}">
                    <div class="blocklist-header">
                        <div class="blocklist-name">${this.escapeHtml(source.name)}</div>
                        <div class="blocklist-status">
                            <span class="status-badge ${isActive ? 'active' : 'inactive'}">
                                ${isActive ? 'ACTIVE' : (source.enabled ? 'FAILED' : 'DISABLED')}
                            </span>
                            ${isActive ? `<span>${domainCount.toLocaleString()} domains</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="blocklist-info">
                        ${this.escapeHtml(source.description || 'Community blocklist')}
                    </div>
                    
                    <div class="blocklist-url">${this.escapeHtml(source.url)}</div>
                    
                    <div class="blocklist-actions">
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 13px;">
                            <input type="checkbox" class="blocklist-toggle" ${source.enabled ? 'checked' : ''}>
                            Enable
                        </label>
                        <span style="font-size: 12px; color: #666;">Last updated: ${lastUpdated}</span>
                    </div>
                    
                    ${result.error ? `<div style="color: #d32f2f; font-size: 12px; margin-top: 8px;">Error: ${this.escapeHtml(result.error)}</div>` : ''}
                </div>
            `;
        }).join('');

        // Add event listeners for toggles
        container.querySelectorAll('.blocklist-toggle').forEach(toggle =>
        {
            toggle.addEventListener('change', (e) =>
            {
                const sourceId = e.target.closest('.blocklist-item').dataset.sourceId;
                this.toggleBlocklistSource(sourceId, e.target.checked);
            });
        });
    }

    async toggleBlocklistSource(id, enabled)
    {
        try
        {
            const data = await chrome.storage.local.get(['blocklistSources']);
            const sources = data.blocklistSources || [];

            const sourceIndex = sources.findIndex(s => s.id === id);
            if (sourceIndex !== -1)
            {
                sources[sourceIndex].enabled = enabled;
                await chrome.storage.local.set({ blocklistSources: sources });

                await this.loadBlocklistSources();
                await this.loadStats();

                this.showSuccess(`Blocklist ${enabled ? 'enabled' : 'disabled'} successfully!`);
            }
        } catch (error)
        {
            console.error('Failed to toggle blocklist:', error);
            this.showError('Failed to update blocklist setting');
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
            const data = await chrome.storage.local.get(['blocklistSources']);
            const sources = data.blocklistSources || this.defaultBlocklists;
            const results = [];
            let totalDomains = 0;

            console.log('Starting blocklist update for', sources.length, 'sources');

            for (const source of sources.filter(s => s.enabled))
            {
                try
                {
                    console.log(`Fetching blocklist: ${source.name} from ${source.url}`);

                    // Always use background script for GitHub URLs
                    console.log('Using background script to fetch blocklist...');

                    const bgResponse = await this.sendMessage({
                        action: 'fetchBlocklist',
                        url: source.url
                    });

                    if (!bgResponse || !bgResponse.success)
                    {
                        throw new Error(bgResponse?.error || 'Background fetch failed');
                    }

                    const content = bgResponse.content;
                    console.log(`Fetched ${content.length} bytes from ${source.name}`);

                    const domains = this.parseHostsFile(content);

                    if (domains.length === 0)
                    {
                        throw new Error('No valid domains found in hosts file');
                    }

                    results.push({
                        id: source.id,
                        success: true,
                        domainCount: domains.length,
                        lastUpdated: new Date().toISOString(),
                        domains: domains
                    });

                    totalDomains += domains.length;
                    console.log(`✅ ${source.name}: ${domains.length} domains loaded`);

                } catch (error)
                {
                    console.error(`❌ Failed to update ${source.name}:`, error);

                    results.push({
                        id: source.id,
                        success: false,
                        error: error.message,
                        lastUpdated: new Date().toISOString(),
                        domains: []
                    });
                }
            }

            // Combine all domains from successful sources
            const allDomains = results
                .filter(r => r.success)
                .flatMap(r => r.domains);

            const uniqueDomains = [...new Set(allDomains)];

            // Store results
            await chrome.storage.local.set({
                blocklistResults: results,
                blockedDomains: uniqueDomains,
                lastBlocklistUpdate: new Date().toISOString()
            });

            await this.loadBlocklistSources();
            await this.loadStats();

            button.textContent = 'UPDATED!';

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            if (successCount > 0)
            {
                this.showSuccess(`✅ Updated! ${uniqueDomains.length} domains from ${successCount} source(s)`);
            }

            if (failCount > 0)
            {
                if (successCount === 0)
                {
                    this.showError(`❌ All ${failCount} source(s) failed to update`);
                } else
                {
                    this.showError(`⚠️ ${failCount} source(s) failed, ${successCount} succeeded`);
                }
            }

        } catch (error)
        {
            console.error('Update failed:', error);
            button.textContent = 'UPDATE FAILED';
            this.showError(`Update failed: ${error.message}`);
        } finally
        {
            setTimeout(() =>
            {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);
        }
    }

    parseHostsFile(content)
    {
        const domains = new Set();
        const lines = content.split('\n');

        console.log(`Parsing hosts file with ${lines.length} lines`);

        for (const line of lines)
        {
            const trimmed = line.trim();

            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!'))
            {
                continue;
            }

            // Parse hosts file format: "0.0.0.0 domain.com" or "127.0.0.1 domain.com"
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2)
            {
                const domain = parts[1].toLowerCase();

                // Basic domain validation - more permissive
                if (domain.includes('.') &&
                    !domain.startsWith('.') &&
                    !domain.includes('/') &&
                    domain.length > 3 &&
                    !domain.includes('localhost') &&
                    !domain.includes('0.0.0.0') &&
                    !domain.includes('127.0.0.1'))
                {
                    domains.add(domain);
                }
            }
        }

        console.log(`Parsed ${domains.size} valid domains from hosts file`);
        return Array.from(domains);
    }

    async viewBlockedCount()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blockedDomains', 'customDomains', 'blockedKeywords',
                'blocklistResults', 'lastBlocklistUpdate'
            ]);

            const githubDomains = (data.blockedDomains || []).length;
            const customDomains = (data.customDomains || []).length;
            const keywords = (data.blockedKeywords || []).length;
            const results = data.blocklistResults || [];
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
                    const source = data.blocklistSources?.find(s => s.id === result.id);
                    message += `• ${source?.name || result.id}: ${result.domainCount.toLocaleString()} domains\n`;
                });
                message += `\n`;
            }

            if (failedResults.length > 0)
            {
                message += `❌ Failed Blocklists:\n`;
                failedResults.forEach(result =>
                {
                    const source = data.blocklistSources?.find(s => s.id === result.id);
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
                'lastImportDate', 'lastResetDate', 'lastBlocklistUpdate'
            ]);

            let logText = 'Fokus Extension Activity Log\n';
            logText += '='.repeat(40) + '\n\n';

            logText += `Current Statistics:\n`;
            logText += `- Blocks Today: ${data.blocksToday || 0}\n`;
            logText += `- Focus Streak: ${data.focusStreak || 0} days\n`;
            logText += `- Total Blocks: ${data.totalBlocks || 0}\n\n`;

            logText += `Important Dates:\n`;
            if (data.lastBlockDate)
            {
                logText += `- Last Block: ${data.lastBlockDate}\n`;
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
                'blockedKeywords', 'customDomains', 'blocklistSources', 'isActive',
                'blocksToday', 'focusStreak', 'totalBlocks', 'lastBlocklistUpdate'
            ]);

            const exportData = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                settings: {
                    blockedKeywords: data.blockedKeywords || [],
                    customDomains: data.customDomains || [],
                    blocklistSources: data.blocklistSources || [],
                    isActive: data.isActive !== undefined ? data.isActive : true,
                    lastBlocklistUpdate: data.lastBlocklistUpdate || 0
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
                pin: '1234',
                blockedKeywords: this.defaultKeywords,
                customDomains: [],
                blocklistSources: this.defaultBlocklists,
                isActive: true,
                blocksToday: 0,
                focusStreak: 0,
                totalBlocks: 0,
                blocklistInitialized: true,
                lastResetDate: new Date().toISOString()
            });

            await this.loadAllSettings();
            this.showSuccess('All settings reset to defaults!');

        } catch (error)
        {
            this.showError(`Failed to reset settings: ${error.message}`);
        }
    }
    // Helper method for keyword matching (used in content scripts too)
    containsBlockedKeywords(text)
    {
        if (!text || typeof text !== 'string') return false;

        const lowerText = text.toLowerCase();

        for (const keyword of this.blockedKeywords)
        {
            const lowerKeyword = keyword.toLowerCase();

            // Partial matching - catches variations like:
            // 'porn' → 'japanporn', 'pornhub', 'freeporn'
            // 'sex' → 'sexcam', 'cybersex', 'sexvideo' 
            // 'masturbat' → 'masturbation', 'masturbating'
            if (lowerText.includes(lowerKeyword))
            {
                return { found: true, keyword: lowerKeyword, originalText: text };
            }
        }
        return { found: false };
    }
    async loadAllSettings()
    {
        console.log('Loading all settings...');

        try
        {
            await this.loadCurrentPin();
            await this.loadStats();
            await this.loadKeywords();
            await this.loadDomains();
            await this.loadBlocklistSources();

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
        // Create simple toast notification
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type === 'success' ? 'toast-success' : 'toast-error'}`;
        toast.textContent = message;

        // Style the toast
        const baseStyles = `
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

        const successStyles = `
            background: linear-gradient(135deg, #d4edda, #c3e6cb);
            color: #155724;
            border: 2px solid #c3e6cb;
        `;

        const errorStyles = `
            background: linear-gradient(135deg, #f8d7da, #f5c6cb);
            color: #721c24;
            border: 2px solid #f5c6cb;
        `;

        toast.style.cssText = baseStyles + (type === 'success' ? successStyles : errorStyles);

        // Add animation keyframes if not already present
        if (!document.getElementById('toast-animations'))
        {
            const style = document.createElement('style');
            style.id = 'toast-animations';
            style.textContent = `
                @keyframes slideInRight {
                    from {
                        opacity: 0;
                        transform: translateX(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                @keyframes slideOutRight {
                    from {
                        opacity: 1;
                        transform: translateX(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateX(30px);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() =>
        {
            if (toast.parentNode)
            {
                toast.style.animation = 'slideOutRight 0.4s ease-out';
                setTimeout(() =>
                {
                    if (toast.parentNode)
                    {
                        toast.parentNode.removeChild(toast);
                    }
                }, 400);
            }
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
}