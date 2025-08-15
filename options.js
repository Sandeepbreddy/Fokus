// options.js - Standalone script file for options page

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () =>
{
    console.log('Options page DOM loaded, initializing...');

    try
    {
        // Check if all required elements exist
        const requiredElements = ['keywords-list', 'domains-list'];
        const missingElements = requiredElements.filter(id => !document.getElementById(id));

        if (missingElements.length > 0)
        {
            console.error('Missing required elements:', missingElements);
            throw new Error(`Missing elements: ${missingElements.join(', ')}`);
        }

        // Initialize options manager
        window.optionsManager = new OptionsManager();

        // Setup event listeners
        setupEventListeners();

        await window.optionsManager.init();

        console.log('Options page initialized successfully');

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
        console.error('Failed to initialize options page:', error);
        showErrorPage(error);
    }
});

function setupEventListeners()
{
    // Blocklist Management
    document.getElementById('add-blocklist-btn')?.addEventListener('click', showAddBlocklistModal);
    document.getElementById('force-update')?.addEventListener('click', forceUpdateBlocklist);
    document.getElementById('view-blocked-count')?.addEventListener('click', viewBlockedCount);
    document.getElementById('test-blocklist-url')?.addEventListener('click', testBlocklistUrl);

    // Modal events
    const modal = document.getElementById('add-blocklist-modal');
    const closeBtn = document.getElementById('close-blocklist-modal');
    const cancelBtn = document.getElementById('cancel-blocklist');
    const submitBtn = document.getElementById('submit-blocklist');

    closeBtn?.addEventListener('click', hideAddBlocklistModal);
    cancelBtn?.addEventListener('click', hideAddBlocklistModal);
    submitBtn?.addEventListener('click', submitBlocklistForm);

    // Test URL button in modal
    document.getElementById('test-modal-url')?.addEventListener('click', testModalUrl);
}

function showAddBlocklistModal()
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
}

function hideAddBlocklistModal()
{
    const modal = document.getElementById('add-blocklist-modal');
    if (modal)
    {
        modal.classList.remove('active');
    }
}

function testModalUrl()
{
    const testUrl = document.getElementById('modal-blocklist-url')?.value.trim();
    if (!testUrl)
    {
        alert('Please enter a URL to test.');
        return;
    }

    if (!isValidGitHubRawUrl(testUrl))
    {
        alert('Invalid URL format.\n\nExpected format:\nhttps://raw.githubusercontent.com/owner/repo/branch/path/to/file\n\nExample:\nhttps://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts');
        return;
    }

    fetch(testUrl, { method: 'HEAD' })
        .then(response =>
        {
            if (response.ok)
            {
                alert('URL is valid and accessible!\n\nYou can now add this blocklist source.');
            } else
            {
                alert(`URL returned error: ${response.status} ${response.statusText}\n\nPlease check the URL and try again.`);
            }
        })
        .catch(error =>
        {
            alert(`Failed to access URL: ${error.message}\n\nPlease check the URL and your internet connection.`);
        });
}

async function submitBlocklistForm()
{
    const name = document.getElementById('modal-blocklist-name')?.value.trim();
    const url = document.getElementById('modal-blocklist-url')?.value.trim();
    const description = document.getElementById('modal-blocklist-description')?.value.trim();

    if (!name || !url)
    {
        alert('Please enter both name and URL for the blocklist source.');
        return;
    }

    if (!isValidGitHubRawUrl(url))
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
        const response = await sendMessage({ action: 'addBlocklistUrl', urlConfig });
        if (response && response.success)
        {
            hideAddBlocklistModal();
            await loadBlocklistSources();
            showSuccess('Blocklist source added successfully!');
        } else
        {
            showError('Failed to add blocklist source.');
        }
    } catch (error)
    {
        showError('Failed to add blocklist source.');
    }
}

async function loadBlocklistSources()
{
    try
    {
        const response = await sendMessage({ action: 'getBlocklistUrls' });
        if (response)
        {
            renderBlocklistSources(response.urls, response.results);
            updateLastUpdateTime(response.results);
        }
    } catch (error)
    {
        console.error('Failed to load blocklist sources:', error);
        showError('Failed to load blocklist sources');
    }
}

function renderBlocklistSources(sources, results)
{
    const container = document.getElementById('blocklists-container');
    if (!container) return;

    if (sources.length === 0)
    {
        container.innerHTML = '<div class="text-center text-muted p-3">No blocklist sources configured</div>';
        return;
    }

    container.innerHTML = sources.map(source =>
    {
        const result = results.find(r => r.url === source.url) || {};
        const statusIcon = source.enabled ? (result.success ? 'ACTIVE' : 'FAILED') : 'DISABLED';
        const statusText = source.enabled ?
            (result.success ? `${result.domains || 0} domains` : 'Failed to load') :
            'Disabled';
        const lastUpdated = result.lastUpdated ?
            new Date(result.lastUpdated).toLocaleString() : 'Never';

        return `
            <div class="list-item">
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <strong>${escapeHtml(source.name)}</strong>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge ${source.enabled ? (result.success ? 'bg-success' : 'bg-danger') : 'bg-secondary'}">${statusIcon}</span>
                            <small>${statusText}</small>
                        </div>
                    </div>
                    <div class="small text-muted mb-1">${escapeHtml(source.description || 'No description')}</div>
                    <div class="small text-muted">${escapeHtml(source.url)}</div>
                    <div class="small text-muted">Last Updated: ${lastUpdated}</div>
                    ${result.error ? `<div class="small text-danger">Error: ${escapeHtml(result.error)}</div>` : ''}
                </div>
                <div class="d-flex flex-column gap-1">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" ${source.enabled ? 'checked' : ''} 
                               onchange="toggleBlocklistSource('${source.id}', this.checked)">
                        <label class="form-check-label small">Enable</label>
                    </div>
                    <button class="btn btn-sm btn-outline-primary" onclick="editBlocklistSource('${source.id}')">EDIT</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="removeBlocklistSource('${source.id}')">DELETE</button>
                </div>
            </div>
        `;
    }).join('');
}

function updateLastUpdateTime(results)
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

async function editBlocklistSource(id)
{
    const newName = prompt('Enter new name for this blocklist source:');
    if (newName && newName.trim())
    {
        try
        {
            const response = await sendMessage({
                action: 'updateBlocklistUrl',
                id,
                updates: { name: newName.trim() }
            });
            if (response && response.success)
            {
                await loadBlocklistSources();
                showSuccess('Blocklist source updated successfully!');
            } else
            {
                showError('Failed to update blocklist source.');
            }
        } catch (error)
        {
            showError('Failed to update blocklist source.');
        }
    }
}

async function removeBlocklistSource(id)
{
    if (!confirm('Remove this blocklist source? This will not trigger an immediate update.')) return;

    try
    {
        const response = await sendMessage({ action: 'removeBlocklistUrl', id });
        if (response && response.success)
        {
            await loadBlocklistSources();
            await window.optionsManager.loadStats();
            showSuccess('Blocklist source removed successfully!');
        } else
        {
            showError('Failed to remove blocklist source.');
        }
    } catch (error)
    {
        showError('Failed to remove blocklist source.');
    }
}

async function toggleBlocklistSource(id, enabled)
{
    try
    {
        const response = await sendMessage({ action: 'toggleBlocklistUrl', id, enabled });
        if (response && response.success)
        {
            await loadBlocklistSources();
            showSuccess(`Blocklist source ${enabled ? 'enabled' : 'disabled'} successfully!`);
        } else
        {
            showError('Failed to toggle blocklist source.');
        }
    } catch (error)
    {
        showError('Failed to toggle blocklist source.');
    }
}

async function forceUpdateBlocklist()
{
    const button = document.getElementById('force-update');
    if (!button) return;

    const progressBar = document.getElementById('update-progress');
    const progressFill = document.getElementById('progress-fill');

    button.textContent = 'UPDATING...';
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
        const response = await sendMessage({ action: 'forceUpdateBlocklist' });
        if (response && response.success)
        {
            button.textContent = 'UPDATED!';
            if (progressFill) progressFill.style.width = '100%';
            await loadBlocklistSources();
            await window.optionsManager.loadStats();
            showSuccess('Blocklist updated successfully!');
        } else
        {
            button.textContent = 'FAILED';
            showError('Failed to update blocklist');
        }
    } catch (error)
    {
        button.textContent = 'FAILED';
        showError(`Update failed: ${error.message}`);
    } finally
    {
        clearInterval(progressInterval);
        setTimeout(() =>
        {
            button.textContent = 'UPDATE ALL';
            button.disabled = false;
            if (progressBar) progressBar.style.display = 'none';
            if (progressFill) progressFill.style.width = '0%';
        }, 2000);
    }
}

async function viewBlockedCount()
{
    try
    {
        const data = await chrome.storage.local.get(['blockedDomains', 'customDomains', 'blockedKeywords']);

        const githubDomains = (data.blockedDomains || []).length;
        const customDomains = (data.customDomains || []).length;
        const keywords = (data.blockedKeywords || []).length;

        const total = githubDomains + customDomains;

        alert(`Blocking Statistics\n\n` +
            `GitHub Blocklist Domains: ${githubDomains.toLocaleString()}\n` +
            `Custom Domains: ${customDomains.toLocaleString()}\n` +
            `Total Domains: ${total.toLocaleString()}\n\n` +
            `Blocked Keywords: ${keywords.toLocaleString()}\n\n` +
            `Last Updated: ${new Date().toLocaleString()}`);
    } catch (error)
    {
        showError('Failed to load blocking statistics.');
    }
}

function testBlocklistUrl()
{
    const testUrl = prompt('Enter a URL to test against current blocklist:');
    if (!testUrl) return;

    try
    {
        const url = new URL(testUrl);
        chrome.storage.local.get(['blockedDomains', 'customDomains'], (data) =>
        {
            const blockedDomains = new Set(data.blockedDomains || []);
            const customDomains = new Set(data.customDomains || []);

            let isBlocked = false;
            let reason = '';

            if (customDomains.has(url.hostname))
            {
                isBlocked = true;
                reason = 'Custom domain block';
            } else if (blockedDomains.has(url.hostname))
            {
                isBlocked = true;
                reason = 'GitHub blocklist';
            } else
            {
                // Check subdomains
                for (const domain of customDomains)
                {
                    if (url.hostname.endsWith('.' + domain))
                    {
                        isBlocked = true;
                        reason = 'Custom domain block (subdomain)';
                        break;
                    }
                }

                if (!isBlocked)
                {
                    for (const domain of blockedDomains)
                    {
                        if (url.hostname.endsWith('.' + domain))
                        {
                            isBlocked = true;
                            reason = 'GitHub blocklist (subdomain)';
                            break;
                        }
                    }
                }
            }

            const result = isBlocked ? 'BLOCKED' : 'ALLOWED';
            const message = `URL Test Result: ${result}\n\nURL: ${testUrl}\nDomain: ${url.hostname}\n${isBlocked ? `Reason: ${reason}` : 'No blocking rules match this domain'}`;

            alert(message);
        });
    } catch (error)
    {
        alert('Invalid URL format. Please enter a valid URL.');
    }
}

// Global functions for HTML onclick handlers
window.toggleBlocklistSource = toggleBlocklistSource;
window.editBlocklistSource = editBlocklistSource;
window.removeBlocklistSource = removeBlocklistSource;

// Utility functions
function isValidGitHubRawUrl(url)
{
    return url.startsWith('https://raw.githubusercontent.com/') && url.split('/').length >= 7;
}

function escapeHtml(text)
{
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sendMessage(message)
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

function showSuccess(message)
{
    console.log('Success:', message);
    showGlobalMessage(message, 'success');
}

function showError(message)
{
    console.error('Error:', message);
    showGlobalMessage(message, 'error');
}

function showGlobalMessage(message, type)
{
    // Create simple toast notification
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type === 'success' ? 'toast-success' : 'toast-error'}`;
    toast.textContent = message;
    toast.style.cssText = `
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
        background: ${type === 'success' ? 'linear-gradient(135deg, #d4edda, #c3e6cb)' : 'linear-gradient(135deg, #f8d7da, #f5c6cb)'};
        color: ${type === 'success' ? '#155724' : '#721c24'};
        border: 2px solid ${type === 'success' ? '#c3e6cb' : '#f5c6cb'};
    `;

    document.body.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() =>
    {
        if (toast.parentNode)
        {
            toast.style.animation = 'slideInRight 0.4s ease-out reverse';
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

function createToastContainer()
{
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = '1100';
    document.body.appendChild(container);
    return container;
}

function showErrorPage(error)
{
    document.body.innerHTML = `
        <div style="padding: 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; color: white; font-family: 'Segoe UI', sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; background: rgba(255, 255, 255, 0.95); color: #333; padding: 40px; border-radius: 20px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);">
                <h1 style="color: #e74c3c; margin-bottom: 20px;">Settings Error</h1>
                <p style="margin-bottom: 20px; line-height: 1.6;">Failed to initialize Fokus settings page. This might be due to:</p>
                <ul style="text-align: left; margin: 20px 0; line-height: 1.8;">
                    <li>Browser extension permissions</li>
                    <li>Corrupted extension files</li>
                    <li>Browser compatibility issues</li>
                    <li>Missing configuration files</li>
                </ul>
                <button onclick="location.reload()" style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 5px; font-size: 14px;">
                    REFRESH PAGE
                </button>
                <details style="text-align: left; margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <summary style="cursor: pointer; font-weight: bold;">Technical Details</summary>
                    <pre style="margin-top: 10px; font-size: 12px; color: #666; white-space: pre-wrap;">${error.message}

Stack: ${error.stack}</pre>
                </details>
            </div>
        </div>
    `;
}

// Handle page unload
window.addEventListener('beforeunload', () =>
{
    console.log('Options page unloading...');
});

// Handle visibility changes
document.addEventListener('visibilitychange', () =>
{
    if (!document.hidden && window.optionsManager && window.optionsManager.isInitialized)
    {
        setTimeout(() =>
        {
            window.optionsManager.loadAllSettings();
        }, 1000);
    }
});