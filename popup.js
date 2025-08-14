// Popup script for Focus Guard extension

class PopupManager
{
    constructor()
    {
        this.init();
    }

    async init()
    {
        await this.loadStats();
        await this.loadCurrentTab();
        this.setupEventListeners();
        await this.updateToggleState();
    }

    async loadStats()
    {
        try
        {
            const data = await chrome.storage.local.get([
                'blocksToday', 'focusStreak', 'customDomains', 'blockedDomains'
            ]);

            document.getElementById('blocks-today').textContent = data.blocksToday || 0;
            document.getElementById('focus-streak').textContent = (data.focusStreak || 0) + ' days';

            const totalDomains = (data.customDomains || []).length + (data.blockedDomains || []).length;
            document.getElementById('total-domains').textContent = totalDomains.toLocaleString();
        } catch (error)
        {
            console.error('Failed to load stats:', error);
        }
    }

    async loadCurrentTab()
    {
        try
        {
            const response = await this.sendMessage({ action: 'getCurrentTab' });
            if (response && response.url)
            {
                const url = new URL(response.url);
                document.getElementById('current-url').textContent = url.hostname;
            }
        } catch (error)
        {
            document.getElementById('current-url').textContent = 'Unable to detect';
        }
    }

    async updateToggleState()
    {
        try
        {
            const data = await chrome.storage.local.get(['isActive']);
            const isActive = data.isActive !== undefined ? data.isActive : true;

            const toggle = document.getElementById('toggle');
            const statusText = document.getElementById('status-text');

            if (isActive)
            {
                toggle.classList.add('active');
                statusText.textContent = 'Protection Active';
            } else
            {
                toggle.classList.remove('active');
                statusText.textContent = 'Protection Paused';
            }
        } catch (error)
        {
            console.error('Failed to update toggle state:', error);
        }
    }

    setupEventListeners()
    {
        // Toggle protection
        document.getElementById('toggle').addEventListener('click', () =>
        {
            this.requestPIN('toggle', 'Toggle protection status');
        });

        // Block current site
        document.getElementById('block-current-site').addEventListener('click', () =>
        {
            this.blockCurrentSite();
        });

        // Open settings
        document.getElementById('open-settings').addEventListener('click', () =>
        {
            this.requestPIN('settings', 'Access extension settings');
        });

        // Update blocklist
        document.getElementById('update-blocklist').addEventListener('click', () =>
        {
            this.updateBlocklist();
        });

        // Pause blocking
        document.getElementById('pause-blocking').addEventListener('click', () =>
        {
            this.requestPIN('pause', 'Pause blocking for 1 hour');
        });

        // Settings help
        document.getElementById('settings-help').addEventListener('click', () =>
        {
            alert('📋 How to Access Settings:\n\n' +
                '1. Enter your PIN when prompted (default: 1234)\n' +
                '2. Or right-click the extension icon in toolbar\n' +
                '3. Select "Options" from the menu\n' +
                '4. Or go to browser Extensions page and click "Details" → "Extension options"\n\n' +
                '💡 Tip: PIN protects your settings from unauthorized changes.');
        });

        // Test settings (no PIN required)
        document.getElementById('test-settings').addEventListener('click', () =>
        {
            console.log('Testing settings without PIN...');
            this.testSettingsOpening();
        });

        // Direct settings link
        document.getElementById('direct-settings').addEventListener('click', () =>
        {
            const extensionId = chrome.runtime.id;
            const settingsUrl = `chrome-extension://${extensionId}/options.html`;

            // Try to copy to clipboard
            navigator.clipboard.writeText(settingsUrl).then(() =>
            {
                alert(`🔗 Settings URL copied to clipboard!\n\nPaste this in your address bar:\n${settingsUrl}\n\nOr right-click the extension icon → Options`);
            }).catch(() =>
            {
                alert(`🔗 Manual Settings URL:\n\n${settingsUrl}\n\nCopy this URL and paste it in your address bar.\n\nOr right-click the extension icon → Options`);
            });
        });

        // PIN modal events
        document.getElementById('pin-cancel').addEventListener('click', () =>
        {
            this.hidePINModal();
        });

        document.getElementById('pin-confirm').addEventListener('click', () =>
        {
            this.verifyPIN();
        });

        document.getElementById('pin-input').addEventListener('keypress', (e) =>
        {
            if (e.key === 'Enter')
            {
                this.verifyPIN();
            }
        });

        // Close modal when clicking outside
        document.getElementById('pin-modal').addEventListener('click', (e) =>
        {
            if (e.target.id === 'pin-modal')
            {
                this.hidePINModal();
            }
        });
    }

    async blockCurrentSite()
    {
        try
        {
            const response = await this.sendMessage({ action: 'addDomainFromTab' });
            if (response && response.success)
            {
                alert(`Successfully blocked domain: ${response.domain}`);
                await this.loadStats();
            }
        } catch (error)
        {
            alert('Failed to block current site. Please try again.');
        }
    }

    async updateBlocklist()
    {
        const button = document.getElementById('update-blocklist');
        const originalText = button.textContent;

        button.textContent = '🔄 Updating...';
        button.disabled = true;

        try
        {
            await this.sendMessage({ action: 'forceUpdateBlocklist' });
            button.textContent = '✅ Updated!';
            setTimeout(() =>
            {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);

            await this.loadStats();
        } catch (error)
        {
            button.textContent = '❌ Failed';
            setTimeout(() =>
            {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);
        }
    }

    requestPIN(action, message)
    {
        this.currentAction = action;
        document.getElementById('pin-message').textContent = message;
        document.getElementById('pin-input').value = '';
        document.getElementById('pin-error').textContent = '';
        document.getElementById('pin-modal').style.display = 'flex';
        document.getElementById('pin-input').focus();
    }

    hidePINModal()
    {
        document.getElementById('pin-modal').style.display = 'none';
        this.currentAction = null;
    }

    async verifyPIN()
    {
        const enteredPIN = document.getElementById('pin-input').value;
        const errorElement = document.getElementById('pin-error');

        console.log('Verifying PIN...');

        try
        {
            const data = await chrome.storage.local.get(['pin']);
            const storedPIN = data.pin || '1234';

            console.log('PIN verification - entered length:', enteredPIN.length, 'stored PIN exists:', !!storedPIN);

            if (enteredPIN === storedPIN)
            {
                console.log('PIN verified successfully');

                if (this.currentAction === 'settings')
                {
                    console.log('Opening settings after PIN verification');

                    // Hide the modal first
                    this.hidePINModal();

                    // Simple, direct approach
                    const optionsUrl = chrome.runtime.getURL('options.html');
                    console.log('Opening options URL:', optionsUrl);

                    // Try the most reliable method first
                    chrome.tabs.create({
                        url: optionsUrl,
                        active: true
                    }, (tab) =>
                    {
                        if (chrome.runtime.lastError)
                        {
                            console.error('Failed to open settings:', chrome.runtime.lastError.message);
                            // Show fallback instructions
                            alert(`PIN Verified! ✅\n\nSettings couldn't open automatically.\n\nPlease right-click the Focus Guard icon and select "Options"\n\nOr paste this URL in your address bar:\n${optionsUrl}`);
                        } else
                        {
                            console.log('Settings opened successfully in tab:', tab.id);
                            // Close popup after successful opening
                            setTimeout(() => window.close(), 100);
                        }
                    });

                } else
                {
                    // Handle other actions normally
                    this.hidePINModal();
                    await this.executeAction(this.currentAction);
                }
            } else
            {
                console.log('PIN verification failed');
                errorElement.textContent = 'Incorrect PIN. Try again.';
                document.getElementById('pin-input').value = '';
                document.getElementById('pin-input').focus();
            }
        } catch (error)
        {
            console.error('PIN verification error:', error);
            errorElement.textContent = 'Error verifying PIN. Please try again.';
        }
    }

    async executeAction(action)
    {
        console.log('Executing action:', action);

        try
        {
            switch (action)
            {
                case 'toggle':
                    await this.toggleProtection();
                    break;
                case 'pause':
                    await this.pauseBlocking();
                    break;
                default:
                    console.log('Unknown action:', action);
            }
        } catch (error)
        {
            console.error('Failed to execute action:', action, error);
        }
    }

    async toggleProtection()
    {
        try
        {
            const data = await chrome.storage.local.get(['isActive']);
            const currentState = data.isActive !== undefined ? data.isActive : true;
            const newState = !currentState;

            await this.sendMessage({ action: 'setActive', active: newState });
            await this.updateToggleState();
        } catch (error)
        {
            console.error('Failed to toggle protection:', error);
        }
    }

    async pauseBlocking()
    {
        try
        {
            await this.sendMessage({ action: 'setActive', active: false });
            await this.updateToggleState();

            // Set timer to re-enable after 1 hour
            setTimeout(async () =>
            {
                await this.sendMessage({ action: 'setActive', active: true });
            }, 60 * 60 * 1000); // 1 hour

            alert('Blocking paused for 1 hour');
        } catch (error)
        {
            alert('Failed to pause blocking. Please try again.');
        }
    }

    testSettingsOpening()
    {
        console.log('🧪 Testing settings opening...');

        const optionsUrl = chrome.runtime.getURL('options.html');
        console.log('🧪 Options URL:', optionsUrl);

        chrome.tabs.create({
            url: optionsUrl,
            active: true
        }, (tab) =>
        {
            if (chrome.runtime.lastError)
            {
                console.error('🧪 Test failed:', chrome.runtime.lastError.message);
                alert(`🧪 Test Failed!\n\nError: ${chrome.runtime.lastError.message}\n\nBrowser is blocking the opening. Use manual method:\nRight-click Focus Guard icon → Options`);
            } else
            {
                console.log('🧪 Test succeeded! Tab created:', tab.id);
                alert('🧪 Test Successful!\n\nSettings opened in new tab. The extension is working correctly.');
                setTimeout(() => window.close(), 1000);
            }
        });
    }

    sendMessage(message)
    {
        console.log('Sending message:', message);

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
                        console.log('Message response:', response);
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
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () =>
{
    console.log('Popup DOM loaded, initializing...');

    try
    {
        // Check if all required elements exist
        const requiredElements = [
            'toggle', 'open-settings', 'block-current-site',
            'update-blocklist', 'pause-blocking', 'settings-help', 'direct-settings', 'test-settings',
            'pin-modal', 'pin-input', 'pin-confirm', 'pin-cancel'
        ];

        const missingElements = requiredElements.filter(id => !document.getElementById(id));

        if (missingElements.length > 0)
        {
            console.error('Missing required elements:', missingElements);
            throw new Error(`Missing elements: ${missingElements.join(', ')}`);
        }

        // Initialize popup manager
        new PopupManager();
        console.log('Popup manager initialized successfully');

    } catch (error)
    {
        console.error('Failed to initialize popup:', error);

        // Show error message to user
        document.body.innerHTML = `
      <div style="padding: 20px; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; margin: 10px; font-family: Arial, sans-serif;">
        <strong>⚠️ Popup Error:</strong><br>
        Failed to initialize extension popup. Please try:
        <ul style="margin: 10px 0;">
          <li>Refreshing the page</li>
          <li>Reloading the extension</li>
          <li>Checking browser console for errors</li>
        </ul>
        <small>Error: ${error.message}</small>
      </div>
    `;
    }
});