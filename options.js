// Options page script for Focus Guard extension

class OptionsManager
{
    constructor()
    {
        console.log('OptionsManager constructor called');

        // Check if Chrome extension APIs are available
        if (!chrome || !chrome.storage)
        {
            throw new Error('Chrome extension APIs not available');
        }

        this.init();
    }

    async init()
    {
        console.log('Initializing OptionsManager...');

        try
        {
            await this.loadAllSettings();
            this.setupEventListeners();
            this.updateBrowserInfo();
            console.log('OptionsManager initialization complete');
        } catch (error)
        {
            console.error('OptionsManager initialization failed:', error);
            throw error;
        }
    }

    async loadAllSettings()
    {
        console.log('Loading all settings...');

        try
        {
            await Promise.all([
                this.loadStats().catch(e => console.error('Failed to load stats:', e)),
                this.loadKeywords().catch(e => console.error('Failed to load keywords:', e)),
                this.loadDomains().catch(e => console.error('Failed to load domains:', e)),
                this.loadBlocklistSources().catch(e => console.error('Failed to load blocklist sources:', e)),
                this.loadProtectionStatus().catch(e => console.error('Failed to load protection status:', e))
            ]);

            console.log('All settings loaded successfully');
        } catch (error)
        {
            console.error('Failed to load some settings:', error);
            this.showError('Some settings failed to load. Please refresh the page.');
        }
    }

    async loadStats()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blocksToday', 'totalBlocks', 'customDomains', 'blockedDomains', 'blockedKeywords'
            ]);

            document.getElementById('total-blocks').textContent = data.totalBlocks || data.blocksToday || 0;
            document.getElementById('domains-blocked').textContent = (data.blockedDomains || []).length;
            document.getElementById('keywords-blocked').textContent = (data.blockedKeywords || []).length;
            document.getElementById('time-saved').textContent = Math.floor(((data.totalBlocks || 0) * 5) / 60) + 'h';
        } catch (error)
        {
            console.error('Failed to load stats:', error);
        }
    }

    async loadKeywords()
    {
        try
        {
            console.log('Loading keywords...');
            const data = await chrome.storage.local.get(['blockedKeywords']);
            const keywords = data.blockedKeywords || this.getDefaultKeywords();
            console.log('Loaded keywords:', keywords.length);
            this.renderKeywordsList(keywords);
        } catch (error)
        {
            console.error('Failed to load keywords:', error);
            // Fallback to default keywords
            const defaultKeywords = this.getDefaultKeywords();
            this.renderKeywordsList(defaultKeywords);
            this.showError('Failed to load keywords, showing defaults');
        }
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
            console.error('Failed to load blocklist sources:', error);
            this.showError('Failed to load blocklist sources');
        }
    }

    renderBlocklistSources(sources, results)
    {
        const container = document.getElementById('blocklists-container');

        if (sources.length === 0)
        {
            container.innerHTML = '<div style="text-align: center; color: #666;">No blocklist sources configured</div>';
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
              <button class="remove-btn" onclick="optionsManager.removeBlocklistSource('${source.id}')">Remove</button>
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
        if (successfulResults.length > 0)
        {
            const latestUpdate = Math.max(...successfulResults.map(r => r.lastUpdated));
            const date = new Date(latestUpdate);
            document.getElementById('last-update').textContent = date.toLocaleString();
        } else
        {
            document.getElementById('last-update').textContent = 'Never';
        }
    }

    async loadProtectionStatus()
    {
        try
        {
            const data = await chrome.storage.local.get(['isActive']);
            const isActive = data.isActive !== undefined ? data.isActive : true;
            document.getElementById('protection-status').textContent = isActive ? 'Active' : 'Paused';
            document.getElementById('protection-status').style.color = isActive ? '#4CAF50' : '#ff6b6b';
        } catch (error)
        {
            console.error('Failed to load protection status:', error);
        }
    }

    renderKeywordsList(keywords)
    {
        const container = document.getElementById('keywords-list');

        if (keywords.length === 0)
        {
            container.innerHTML = '<div style="text-align: center; color: #666;">No keywords blocked</div>';
            return;
        }

        container.innerHTML = keywords.map(keyword => `
      <div class="list-item">
        <span>${this.escapeHtml(keyword)}</span>
        <button class="remove-btn" onclick="optionsManager.removeKeyword('${this.escapeHtml(keyword)}')">Remove</button>
      </div>
    `).join('');
    }

    renderDomainsList(domains)
    {
        const container = document.getElementById('domains-list');

        if (domains.length === 0)
        {
            container.innerHTML = '<div style="text-align: center; color: #666;">No custom domains blocked</div>';
            return;
        }

        container.innerHTML = domains.map(domain => `
      <div class="list-item">
        <span>${this.escapeHtml(domain)}</span>
        <button class="remove-btn" onclick="optionsManager.removeDomain('${this.escapeHtml(domain)}')">Remove</button>
      </div>
    `).join('');
    }

    setupEventListeners()
    {
        // PIN management
        document.getElementById('change-pin').addEventListener('click', () => this.changePIN());

        // Keywords management
        document.getElementById('add-keyword').addEventListener('click', () => this.addKeyword());
        document.getElementById('new-keyword').addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.addKeyword();
        });
        document.getElementById('reset-keywords').addEventListener('click', () => this.resetKeywords());
        document.getElementById('clear-keywords').addEventListener('click', () => this.clearKeywords());

        // Domains management
        document.getElementById('add-domain').addEventListener('click', () => this.addDomain());
        document.getElementById('new-domain').addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter') this.addDomain();
        });
        document.getElementById('clear-domains').addEventListener('click', () => this.clearDomains());

        // Blocklist management
        document.getElementById('add-blocklist').addEventListener('click', () => this.addBlocklistSource());
        document.getElementById('force-update').addEventListener('click', () => this.forceUpdateBlocklist());
        document.getElementById('view-blocked-count').addEventListener('click', () => this.viewBlockedCount());
        document.getElementById('test-blocklist-url').addEventListener('click', () => this.testBlocklistUrl());

        // Import/Export
        document.getElementById('export-settings').addEventListener('click', () => this.exportSettings());
        document.getElementById('import-btn').addEventListener('click', () =>
        {
            document.getElementById('import-file').click();
        });
        document.getElementById('import-file').addEventListener('change', (e) => this.importSettings(e));
        document.getElementById('reset-all').addEventListener('click', () => this.resetAllSettings());

        // Testing and logs
        document.getElementById('test-blocking').addEventListener('click', () => this.testBlocking());
        document.getElementById('view-logs').addEventListener('click', () => this.viewLogs());
    }

    async changePIN()
    {
        const currentPIN = document.getElementById('current-pin').value;
        const newPIN = document.getElementById('new-pin').value;
        const confirmPIN = document.getElementById('confirm-pin').value;
        const messageEl = document.getElementById('pin-message');

        // Clear previous messages
        messageEl.innerHTML = '';

        if (!currentPIN || !newPIN || !confirmPIN)
        {
            this.showMessage(messageEl, 'Please fill in all PIN fields.', 'error');
            return;
        }

        if (newPIN !== confirmPIN)
        {
            this.showMessage(messageEl, 'New PINs do not match.', 'error');
            return;
        }

        if (newPIN.length < 4)
        {
            this.showMessage(messageEl, 'PIN must be at least 4 characters.', 'error');
            return;
        }

        try
        {
            const data = await chrome.storage.local.get(['pin']);
            const storedPIN = data.pin || '1234';

            if (currentPIN !== storedPIN)
            {
                this.showMessage(messageEl, 'Current PIN is incorrect.', 'error');
                return;
            }

            await chrome.storage.local.set({ pin: newPIN });
            this.showMessage(messageEl, 'PIN changed successfully!', 'success');

            // Clear form
            document.getElementById('current-pin').value = '';
            document.getElementById('new-pin').value = '';
            document.getElementById('confirm-pin').value = '';

            console.log('PIN changed successfully');
        } catch (error)
        {
            console.error('PIN change error:', error);
            this.showMessage(messageEl, 'Failed to change PIN. Please try again.', 'error');
        }
    }

    async addKeyword()
    {
        const input = document.getElementById('new-keyword');
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
            // First check if keyword already exists
            const data = await chrome.storage.local.get(['blockedKeywords']);
            const currentKeywords = data.blockedKeywords || this.getDefaultKeywords();

            if (currentKeywords.includes(keyword))
            {
                this.showError('This keyword is already blocked.');
                return;
            }

            // Add keyword directly to storage
            const updatedKeywords = [...currentKeywords, keyword];
            await chrome.storage.local.set({ blockedKeywords: updatedKeywords });

            // Also notify background script
            try
            {
                const response = await this.sendMessage({ action: 'addKeyword', keyword });
                console.log('Background script response:', response);
            } catch (bgError)
            {
                console.log('Background script not responding, but keyword was saved to storage');
            }

            input.value = '';
            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess('Keyword added successfully!');

            console.log('Keyword added:', keyword);
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
            // Remove directly from storage
            const data = await chrome.storage.local.get(['blockedKeywords']);
            const currentKeywords = data.blockedKeywords || this.getDefaultKeywords();
            const updatedKeywords = currentKeywords.filter(k => k !== keyword);

            await chrome.storage.local.set({ blockedKeywords: updatedKeywords });

            // Also notify background script
            try
            {
                const response = await this.sendMessage({ action: 'removeKeyword', keyword });
                console.log('Background script response:', response);
            } catch (bgError)
            {
                console.log('Background script not responding, but keyword was removed from storage');
            }

            await this.loadKeywords();
            await this.loadStats();
            this.showSuccess('Keyword removed successfully!');

            console.log('Keyword removed:', keyword);
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
            const defaultKeywords = this.getDefaultKeywords();
            await chrome.storage.local.set({ blockedKeywords: defaultKeywords });
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

    async addDomain()
    {
        const input = document.getElementById('new-domain');
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

    async addBlocklistSource()
    {
        const name = document.getElementById('blocklist-name').value.trim();
        const url = document.getElementById('blocklist-url').value.trim();
        const description = document.getElementById('blocklist-description').value.trim();

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
                document.getElementById('blocklist-name').value = '';
                document.getElementById('blocklist-url').value = '';
                document.getElementById('blocklist-description').value = '';

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
        const testUrl = document.getElementById('blocklist-url').value.trim();
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

        // Test if URL is accessible
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
        const progressBar = document.getElementById('update-progress');
        const progressFill = document.getElementById('progress-fill');

        button.textContent = '🔄 Updating...';
        button.disabled = true;
        progressBar.style.display = 'block';

        // Simulate progress
        let progress = 0;
        const progressInterval = setInterval(() =>
        {
            progress += 10;
            progressFill.style.width = progress + '%';
            if (progress >= 90) clearInterval(progressInterval);
        }, 200);

        try
        {
            const response = await this.sendMessage({ action: 'forceUpdateBlocklist' });
            if (response.success)
            {
                progressFill.style.width = '100%';
                button.textContent = '✅ Updated!';
                await this.loadBlocklistSources();
                await this.loadStats();
                this.showSuccess('All blocklist sources updated successfully!');
            }
        } catch (error)
        {
            button.textContent = '❌ Failed';
            this.showError('Failed to update blocklist.');
        } finally
        {
            setTimeout(() =>
            {
                button.textContent = '🔄 Update All Sources';
                button.disabled = false;
                progressBar.style.display = 'none';
                progressFill.style.width = '0%';
                clearInterval(progressInterval);
            }, 2000);
        }
    }

    async viewBlockedCount()
    {
        try
        {
            const response = await this.sendMessage({ action: 'getBlocklistUrls' });
            const data = await chrome.storage.local.get(['blockedDomains', 'customDomains']);

            const githubDomains = (data.blockedDomains || []).length;
            const customDomains = (data.customDomains || []).length;
            const totalSources = response.urls ? response.urls.filter(u => u.enabled).length : 0;

            const sourceDetails = response.results ? response.results
                .filter(r => r.success)
                .map(r => `• ${r.name}: ${r.domains.toLocaleString()} domains`)
                .join('\n') : '';

            alert(`📊 Blocking Statistics:\n\n` +
                `Active Blocklist Sources: ${totalSources}\n` +
                `Total GitHub Domains: ${githubDomains.toLocaleString()}\n` +
                `Custom Domains: ${customDomains}\n` +
                `Total Blocked: ${(githubDomains + customDomains).toLocaleString()} domains\n\n` +
                `Source Breakdown:\n${sourceDetails || 'No successful updates yet'}`);
        } catch (error)
        {
            this.showError('Failed to get blocked count.');
        }
    }

    exportSettings()
    {
        chrome.storage.local.get(null, (data) =>
        {
            // Don't export sensitive data
            delete data.pin;

            const exportData = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                settings: data
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `focus-guard-settings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showSuccess('Settings exported successfully!');
        });
    }

    importSettings(event)
    {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) =>
        {
            try
            {
                const importData = JSON.parse(e.target.result);

                if (!importData.settings)
                {
                    throw new Error('Invalid settings file format');
                }

                if (confirm('Import settings? This will overwrite your current configuration.'))
                {
                    // Keep current PIN
                    const currentData = await chrome.storage.local.get(['pin']);
                    importData.settings.pin = currentData.pin;

                    await chrome.storage.local.set(importData.settings);
                    await this.loadAllSettings();
                    this.showSuccess('Settings imported successfully!');
                }
            } catch (error)
            {
                this.showError('Failed to import settings. Please check the file format.');
            }
        };

        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    }

    async resetAllSettings()
    {
        const confirmation = prompt('Type "RESET" to confirm you want to reset all settings to defaults:');
        if (confirmation !== 'RESET') return;

        try
        {
            await chrome.storage.local.clear();
            await chrome.storage.local.set({
                pin: '1234',
                isActive: true,
                blockedKeywords: this.getDefaultKeywords(),
                customDomains: [],
                blocksToday: 0,
                focusStreak: 0
            });

            await this.loadAllSettings();
            this.showSuccess('All settings reset to defaults!');
        } catch (error)
        {
            this.showError('Failed to reset settings.');
        }
    }

    testBlocking()
    {
        const testUrl = chrome.runtime.getURL('blocked.html') + '?reason=test';
        window.open(testUrl, '_blank');
    }

    viewLogs()
    {
        // This would typically show extension activity logs
        alert('Activity logs feature coming soon!\n\nFor now, you can:\n• Check browser console for extension logs\n• View blocked statistics above\n• Test blocking functionality');
    }

    updateBrowserInfo()
    {
        const userAgent = navigator.userAgent;
        let browser = 'Unknown';

        if (userAgent.includes('Chrome')) browser = 'Chrome/Chromium';
        else if (userAgent.includes('Firefox')) browser = 'Firefox';
        else if (userAgent.includes('Safari')) browser = 'Safari';
        else if (userAgent.includes('Edge')) browser = 'Edge';

        document.getElementById('browser-info').textContent = browser + ' (Compatible)';
    }

    // Utility methods
    isValidGitHubRawUrl(url)
    {
        const githubRawRegex = /^https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/.+/;
        return githubRawRegex.test(url);
    }

    getDefaultKeywords()
    {
        return [
            'adult', 'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw',
            'explicit', 'mature', 'erotic', 'lesbian', 'gay', 'anal',
            'oral', 'bdsm', 'fetish', 'webcam', 'escort', 'dating'
        ];
    }

    isValidDomain(domain)
    {
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
        return domainRegex.test(domain);
    }

    escapeHtml(text)
    {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showMessage(element, message, type)
    {
        const messageClass = type === 'success' ? 'success-message' : 'error-message';
        element.innerHTML = `<div class="${messageClass}">${message}</div>`;

        // Auto-clear message after 5 seconds
        setTimeout(() =>
        {
            if (element.innerHTML.includes(message))
            {
                element.innerHTML = '';
            }
        }, 5000);
    }

    showSuccess(message)
    {
        console.log('Success:', message);
        const messageEl = document.getElementById('backup-message') || this.createTempMessageElement();
        this.showMessage(messageEl, message, 'success');
    }

    showError(message)
    {
        console.error('Error:', message);
        const messageEl = document.getElementById('backup-message') || this.createTempMessageElement();
        this.showMessage(messageEl, message, 'error');
    }

    createTempMessageElement()
    {
        // Create a temporary message element if backup-message doesn't exist
        let messageEl = document.getElementById('temp-message');
        if (!messageEl)
        {
            messageEl = document.createElement('div');
            messageEl.id = 'temp-message';
            messageEl.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 300px;';
            document.body.appendChild(messageEl);
        }
        return messageEl;
    }

    sendMessage(message)
    {
        console.log('Options sending message:', message);

        return new Promise((resolve, reject) =>
        {
            try
            {
                if (!chrome.runtime || !chrome.runtime.sendMessage)
                {
                    throw new Error('Chrome runtime not available');
                }

                chrome.runtime.sendMessage(message, (response) =>
                {
                    if (chrome.runtime.lastError)
                    {
                        console.error('Runtime error:', chrome.runtime.lastError.message);
                        reject(new Error(chrome.runtime.lastError.message));
                    } else
                    {
                        console.log('Message response:', response);
                        resolve(response || { success: true });
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

// Initialize options manager when DOM is ready
let optionsManager;
document.addEventListener('DOMContentLoaded', () =>
{
    console.log('Options page DOM loaded, initializing...');

    try
    {
        optionsManager = new OptionsManager();
        console.log('Options manager initialized successfully');
    } catch (error)
    {
        console.error('Failed to initialize options manager:', error);

        // Show error message to user
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
      position: fixed; top: 20px; left: 20px; right: 20px;
      background: #f8d7da; color: #721c24; padding: 15px;
      border: 1px solid #f5c6cb; border-radius: 8px;
      z-index: 10000; font-family: Arial, sans-serif;
    `;
        errorDiv.innerHTML = `
      <strong>⚠️ Settings Error:</strong><br>
      Failed to initialize settings page. Please try refreshing the page or reopening the extension settings.
      <br><br>
      <small>Error: ${error.message}</small>
    `;
        document.body.appendChild(errorDiv);
    }
});