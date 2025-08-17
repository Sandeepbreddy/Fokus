// options-core.js - Optimized Core functionality for Fokus Extension Settings

// Virtual List for large data sets
class VirtualList
{
    constructor(container, items, itemHeight = 30, renderFn)
    {
        this.container = container;
        this.items = items;
        this.itemHeight = itemHeight;
        this.renderFn = renderFn;
        this.visibleItems = Math.ceil(container.clientHeight / itemHeight) + 2; // Extra buffer
        this.scrollTop = 0;
        this.startIndex = 0;
        this.endIndex = this.visibleItems;

        this.setupContainer();
        this.render();
        this.setupScrollListener();
    }

    setupContainer()
    {
        // Create viewport and content containers
        this.container.style.position = 'relative';
        this.container.style.overflow = 'auto';

        this.content = document.createElement('div');
        this.content.style.position = 'relative';
        this.content.style.height = `${this.items.length * this.itemHeight}px`;

        this.viewport = document.createElement('div');
        this.viewport.style.position = 'absolute';
        this.viewport.style.top = '0';
        this.viewport.style.left = '0';
        this.viewport.style.right = '0';

        this.container.innerHTML = '';
        this.content.appendChild(this.viewport);
        this.container.appendChild(this.content);
    }

    setupScrollListener()
    {
        let scrollTimeout;
        this.container.addEventListener('scroll', () =>
        {
            this.scrollTop = this.container.scrollTop;

            // Debounce scroll events
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() =>
            {
                this.updateVisibleRange();
                this.render();
            }, 10);
        });
    }

    updateVisibleRange()
    {
        this.startIndex = Math.floor(this.scrollTop / this.itemHeight);
        this.endIndex = Math.min(
            this.startIndex + this.visibleItems,
            this.items.length
        );
    }

    render()
    {
        const fragment = document.createDocumentFragment();

        for (let i = this.startIndex; i < this.endIndex; i++)
        {
            const itemEl = this.renderFn(this.items[i], i);
            itemEl.style.position = 'absolute';
            itemEl.style.top = `${i * this.itemHeight}px`;
            itemEl.style.left = '0';
            itemEl.style.right = '0';
            itemEl.style.height = `${this.itemHeight}px`;
            fragment.appendChild(itemEl);
        }

        this.viewport.innerHTML = '';
        this.viewport.appendChild(fragment);
    }

    updateItems(newItems)
    {
        this.items = newItems;
        this.content.style.height = `${this.items.length * this.itemHeight}px`;
        this.updateVisibleRange();
        this.render();
    }

    destroy()
    {
        this.container.innerHTML = '';
        this.items = null;
        this.renderFn = null;
    }
}

// Optimized Options Manager
class OptionsManager
{
    constructor()
    {
        this.isInitialized = false;
        this.currentPin = null;
        this.virtualLists = new Map();
        this.debounceTimers = new Map();
        this.cache = new Map();
        this.listeners = new Map();

        // Default data
        this.defaultKeywords = [
            'adult', 'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw',
            'explicit', 'mature', 'erotic', 'hardcore', 'softcore',
            'fuck', 'fucking', 'fucked', 'anal', 'oral', 'blowjob',
            'handjob', 'masturbat', 'orgasm', 'climax', 'cumshot',
            'penis', 'vagina', 'breast', 'boob', 'tit', 'ass', 'butt',
            'cock', 'dick', 'pussy', 'clit', 'nipple',
            'bdsm', 'bondage', 'fetish', 'kink', 'domination', 'submission',
            'slave', 'master', 'mistress', 'torture', 'whip',
            'lesbian', 'gay', 'homo', 'bisexual', 'trans', 'shemale',
            'milf', 'teen', 'young', 'old', 'mature',
            'escort', 'prostitut', 'hooker', 'stripper', 'webcam',
            'camgirl', 'camboy', 'livecam', 'chaturbate'
        ];

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
        const startTime = performance.now();

        try
        {
            // Setup event listeners first
            this.setupEventListeners();

            // Load settings in parallel
            await Promise.all([
                this.loadAllSettings(),
                this.initializeDefaultBlocklists()
            ]);

            // Update UI
            this.updateBrowserInfo();

            this.isInitialized = true;

            const initTime = performance.now() - startTime;
            console.log(`Options Manager initialized in ${initTime.toFixed(2)}ms`);
        } catch (error)
        {
            console.error('Failed to initialize Options Manager:', error);
            this.showError('Failed to initialize settings. Please refresh the page.');
        }
    }

    setupEventListeners()
    {
        // Use event delegation for better performance
        document.addEventListener('click', this.handleClick.bind(this));
        document.addEventListener('input', this.handleInput.bind(this));
        document.addEventListener('keypress', this.handleKeypress.bind(this));
        document.addEventListener('change', this.handleChange.bind(this));

        // Store specific handlers that need removal later
        this.setupPinEventListeners();
        this.setupKeywordsEventListeners();
        this.setupDomainsEventListeners();
        this.setupBlocklistEventListeners();
        this.setupAdvancedEventListeners();
    }

    handleClick(e)
    {
        const target = e.target;
        const action = target.dataset.action || target.id;

        switch (action)
        {
            case 'change-pin':
                this.changePIN();
                break;
            case 'reset-to-default':
                this.resetPinToDefault();
                break;
            case 'add-keyword':
                this.addKeyword();
                break;
            case 'reset-keywords':
                this.resetKeywords();
                break;
            case 'clear-keywords':
                this.clearKeywords();
                break;
            case 'add-domain':
                this.addDomain();
                break;
            case 'clear-domains':
                this.clearDomains();
                break;
            case 'force-update':
                this.forceUpdateBlocklists();
                break;
            case 'view-blocked-count':
                this.viewBlockedCount();
                break;
            case 'test-blocking':
                this.testBlocking();
                break;
            case 'view-logs':
                this.viewLogs();
                break;
            case 'export-settings':
                this.exportSettings();
                break;
            case 'import-btn':
                this.importSettings();
                break;
            case 'reset-all':
                this.resetAllSettings();
                break;
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

        // Debounce input validation
        this.debounce(() =>
        {
            switch (id)
            {
                case 'current-pin':
                case 'new-pin':
                case 'confirm-pin':
                    this.validatePinForm();
                    break;
                case 'new-keyword':
                    this.validateKeywordInput();
                    break;
                case 'new-domain':
                    this.validateDomainInput();
                    break;
            }
        }, 150)();
    }

    handleKeypress(e)
    {
        if (e.key !== 'Enter') return;

        const target = e.target;
        const id = target.id;

        switch (id)
        {
            case 'confirm-pin':
                if (!document.getElementById('change-pin').disabled)
                {
                    this.changePIN();
                }
                break;
            case 'new-keyword':
                if (!document.getElementById('add-keyword').disabled)
                {
                    this.addKeyword();
                }
                break;
            case 'new-domain':
                if (!document.getElementById('add-domain').disabled)
                {
                    this.addDomain();
                }
                break;
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

    // PIN MANAGEMENT
    setupPinEventListeners()
    {
        const changeButton = document.getElementById('change-pin');
        if (changeButton) changeButton.disabled = true;
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
    }

    async loadCurrentPin()
    {
        try
        {
            // Check cache first
            const cached = this.cache.get('pin');
            if (cached)
            {
                this.currentPin = cached;
                return;
            }

            const data = await chrome.storage.local.get(['pin']);
            this.currentPin = data.pin || '1234';
            this.cache.set('pin', this.currentPin);
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
            await chrome.storage.local.set({ pin: newPin });
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
            console.error('PIN change error:', error);
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
            await chrome.storage.local.set({ pin: '1234' });
            this.currentPin = '1234';
            this.cache.set('pin', '1234');

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
        const addButton = document.getElementById('add-keyword');
        if (addButton) addButton.disabled = true;
    }

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
            console.log('Loading keywords...');

            const data = await chrome.storage.local.get(['blockedKeywords']);
            let keywords = data.blockedKeywords;

            if (!keywords || keywords.length === 0)
            {
                console.log('No keywords found, using defaults');
                keywords = [...this.defaultKeywords];
                await chrome.storage.local.set({ blockedKeywords: keywords });
            }

            // Use virtual scrolling for large keyword lists
            if (keywords.length > 100)
            {
                this.renderKeywordsVirtual(keywords);
            } else
            {
                this.renderKeywordsTags(keywords);
            }

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

    renderKeywordsVirtual(keywords)
    {
        const container = document.getElementById('keywords-container');
        if (!container) return;

        // Destroy existing virtual list if any
        const existing = this.virtualLists.get('keywords');
        if (existing) existing.destroy();

        // Create virtual list
        const virtualList = new VirtualList(
            container,
            keywords,
            35, // item height
            (keyword, index) =>
            {
                const div = document.createElement('div');
                div.className = 'keyword-tag';
                div.dataset.keyword = this.escapeHtml(keyword);
                div.innerHTML = `
                    <span class="keyword-text">${this.escapeHtml(keyword)}</span>
                    <button class="remove-keyword" title="Remove keyword">×</button>
                `;
                return div;
            }
        );

        this.virtualLists.set('keywords', virtualList);
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

        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();
        const wrapper = document.createElement('div');
        wrapper.className = 'keywords-tags';

        keywords.forEach(keyword =>
        {
            const tag = document.createElement('div');
            tag.className = 'keyword-tag';
            tag.dataset.keyword = this.escapeHtml(keyword);
            tag.innerHTML = `
                <span class="keyword-text">${this.escapeHtml(keyword)}</span>
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
        const addButton = document.getElementById('add-domain');
        if (addButton) addButton.disabled = true;
    }

    validateDomainInput()
    {
        const domainInput = document.getElementById('new-domain');
        const addButton = document.getElementById('add-domain');

        if (!domainInput || !addButton) return;

        let value = domainInput.value.trim().toLowerCase();
        value = value.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

        const isValid = value.length > 3 && this.isValidDomain(value);
        addButton.disabled = !isValid;
        addButton.textContent = !isValid ? 'ENTER DOMAIN' : 'ADD DOMAIN';
    }

    async loadDomains()
    {
        try
        {
            const data = await chrome.storage.local.get(['customDomains']);
            const domains = data.customDomains || [];

            // Use virtual scrolling for large domain lists
            if (domains.length > 100)
            {
                this.renderDomainsVirtual(domains);
            } else
            {
                this.renderDomainsList(domains);
            }
        } catch (error)
        {
            this.showError('Failed to load domains');
        }
    }

    renderDomainsVirtual(domains)
    {
        const container = document.getElementById('domains-list');
        if (!container) return;

        // Destroy existing virtual list if any
        const existing = this.virtualLists.get('domains');
        if (existing) existing.destroy();

        // Create virtual list
        const virtualList = new VirtualList(
            container,
            domains,
            40, // item height
            (domain, index) =>
            {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.dataset.domain = this.escapeHtml(domain);
                div.innerHTML = `
                    <span>${this.escapeHtml(domain)}</span>
                    <button class="btn btn-sm btn-danger remove-domain">DELETE</button>
                `;
                return div;
            }
        );

        this.virtualLists.set('domains', virtualList);
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

        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();

        domains.forEach(domain =>
        {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.dataset.domain = this.escapeHtml(domain);
            item.innerHTML = `
                <span>${this.escapeHtml(domain)}</span>
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

        let domain = input.value.trim().toLowerCase();
        domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

        if (!domain || !this.isValidDomain(domain)) return;

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
        // Event listeners handled by delegation
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

        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();

        sources.forEach(source =>
        {
            const result = results.find(r => r.id === source.id) || {};
            const isActive = source.enabled && result.success;
            const domainCount = result.domainCount || 0;
            const lastUpdated = result.lastUpdated ?
                new Date(result.lastUpdated).toLocaleDateString() : 'Never';

            const item = document.createElement('div');
            item.className = 'blocklist-item';
            item.dataset.sourceId = source.id;
            item.innerHTML = `
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
            `;
            fragment.appendChild(item);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
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

            // Process sources in parallel with limit
            const enabledSources = sources.filter(s => s.enabled);
            const chunks = this.chunkArray(enabledSources, 2); // Process 2 at a time

            for (const chunk of chunks)
            {
                const chunkResults = await Promise.all(
                    chunk.map(async source =>
                    {
                        try
                        {
                            console.log(`Fetching blocklist: ${source.name}`);

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

                            return {
                                id: source.id,
                                success: true,
                                domainCount: domains.length,
                                lastUpdated: new Date().toISOString(),
                                domains: domains
                            };
                        } catch (error)
                        {
                            console.error(`Failed to update ${source.name}:`, error);
                            return {
                                id: source.id,
                                success: false,
                                error: error.message,
                                lastUpdated: new Date().toISOString(),
                                domains: []
                            };
                        }
                    })
                );

                results.push(...chunkResults);
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

            // Parse hosts file format
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2)
            {
                const domain = parts[1].toLowerCase();

                // Basic domain validation
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
                'lastImportDate', 'lastResetDate', 'lastBlocklistUpdate', 'errorLog'
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

            if (data.errorLog && data.errorLog.length > 0)
            {
                logText += `\nRecent Errors (last ${data.errorLog.length}):\n`;
                data.errorLog.forEach(error =>
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

    // ADVANCED SETTINGS
    setupAdvancedEventListeners()
    {
        // Event listeners handled by delegation
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

            // Clear cache
            this.cache.clear();

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

            // Clear cache
            this.cache.clear();

            await this.loadAllSettings();
            this.showSuccess('All settings reset to defaults!');

        } catch (error)
        {
            this.showError(`Failed to reset settings: ${error.message}`);
        }
    }

    // HELPER METHODS
    async loadAllSettings()
    {
        console.log('Loading all settings...');

        try
        {
            // Load in parallel for better performance
            await Promise.all([
                this.loadCurrentPin(),
                this.loadStats(),
                this.loadKeywords(),
                this.loadDomains(),
                this.loadBlocklistSources()
            ]);

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

            // Update UI in animation frame
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
            });

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

    // Message handling
    showMessage(element, message, type)
    {
        if (!element) return;

        const messageClass = type === 'success' ? 'success-message' :
            type === 'info' ? 'info-message' : 'error-message';

        requestAnimationFrame(() =>
        {
            element.innerHTML = `<div class="${messageClass}">${message}</div>`;
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
        // Remove existing toast if any
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast-notification ${type === 'success' ? 'toast-success' : 'toast-error'}`;
        toast.textContent = message;

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

    // Optimized message sending with queue
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

    // Utility functions
    escapeHtml(text)
    {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        };
        return String(text).replace(/[&<>"'`=\/]/g, s => map[s]);
    }

    isValidDomain(domain)
    {
        const pattern = /^(?!-)(?:[a-zA-Z0-9-]{1,63}(?<!-)\.)*[a-zA-Z]{2,}$/;
        return pattern.test(domain) && domain.length <= 253;
    }

    debounce(func, wait)
    {
        const key = func.toString();
        return (...args) =>
        {
            clearTimeout(this.debounceTimers.get(key));
            const timeout = setTimeout(() =>
            {
                this.debounceTimers.delete(key);
                func.apply(this, args);
            }, wait);
            this.debounceTimers.set(key, timeout);
        };
    }

    chunkArray(array, size)
    {
        const chunks = [];
        for (let i = 0; i < array.length; i += size)
        {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    // Cleanup method to prevent memory leaks
    destroy()
    {
        // Clear all virtual lists
        for (const virtualList of this.virtualLists.values())
        {
            virtualList.destroy();
        }
        this.virtualLists.clear();

        // Clear all timers
        for (const timer of this.debounceTimers.values())
        {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        // Clear cache
        this.cache.clear();

        // Remove event listeners
        document.removeEventListener('click', this.handleClick);
        document.removeEventListener('input', this.handleInput);
        document.removeEventListener('keypress', this.handleKeypress);
        document.removeEventListener('change', this.handleChange);

        // Clear references
        this.currentPin = null;
        this.defaultKeywords = null;
        this.defaultBlocklists = null;
    }
}