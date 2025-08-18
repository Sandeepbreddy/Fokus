// src/ui/options/options.js - Options page main script
import { OptionsController } from './options-controller.js';
import { Logger } from '../../shared/logger.js';
import { Utils } from '../../shared/utils.js';

class OptionsPage
{
    constructor()
    {
        this.logger = new Logger('OptionsPage');
        this.controller = null;
        this.isInitialized = false;
    }

    async init()
    {
        this.logger.info('Initializing options page...');
        const startTime = performance.now();

        try
        {
            // Check if all required elements exist
            const requiredElements = ['keywords-container', 'domains-list'];
            const missingElements = requiredElements.filter(id => !document.getElementById(id));

            if (missingElements.length > 0)
            {
                throw new Error(`Missing required elements: ${missingElements.join(', ')}`);
            }

            // Initialize controller
            this.controller = new OptionsController();
            await this.controller.init();

            // Setup global event handlers
            this.setupGlobalEventHandlers();

            // Handle URL hash for direct navigation
            this.handleUrlHash();

            this.isInitialized = true;
            const initTime = performance.now() - startTime;
            this.logger.info(`Options page initialized in ${initTime.toFixed(2)}ms`);

        } catch (error)
        {
            this.logger.error('Failed to initialize options page:', error);
            this.showErrorPage(error);
        }
    }

    setupGlobalEventHandlers()
    {
        // Handle visibility changes to refresh data
        document.addEventListener('visibilitychange', () =>
        {
            if (!document.hidden && this.controller && this.isInitialized)
            {
                setTimeout(() =>
                {
                    this.controller.refreshAllData();
                }, 1000);
            }
        });

        // Handle window beforeunload
        window.addEventListener('beforeunload', () =>
        {
            this.logger.info('Options page unloading...');
            this.cleanup();
        });

        // Handle global keyboard shortcuts
        document.addEventListener('keydown', (e) =>
        {
            // Ctrl/Cmd + S to export settings
            if ((e.ctrlKey || e.metaKey) && e.key === 's')
            {
                e.preventDefault();
                if (this.controller)
                {
                    this.controller.handleExportSettings();
                }
            }

            // Escape to close modals or clear focus
            if (e.key === 'Escape')
            {
                const activeElement = document.activeElement;
                if (activeElement && activeElement.blur)
                {
                    activeElement.blur();
                }
            }
        });

        // Handle global click events for analytics/tracking
        document.addEventListener('click', (e) =>
        {
            const target = e.target;

            // Track button clicks for analytics (if implemented)
            if (target.classList.contains('btn'))
            {
                this.logger.debug('Button clicked:', target.id || target.textContent);
            }
        });
    }

    handleUrlHash()
    {
        const hash = window.location.hash;
        if (hash)
        {
            setTimeout(() =>
            {
                const element = document.querySelector(hash);
                if (element)
                {
                    element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });

                    // Add highlight effect
                    element.classList.add('highlight');
                    setTimeout(() =>
                    {
                        element.classList.remove('highlight');
                    }, 2000);
                }
            }, 500);
        }
    }

    showErrorPage(error)
    {
        const errorHtml = `
            <div class="error-page">
                <div class="error-container">
                    <h1>Settings Error</h1>
                    <p>Failed to initialize Fokus settings page. This might be due to:</p>
                    <ul>
                        <li>Browser extension permissions</li>
                        <li>Corrupted extension files</li>
                        <li>Browser compatibility issues</li>
                        <li>Missing configuration files</li>
                    </ul>
                    <div class="error-actions">
                        <button id="refresh-page-btn" class="btn btn-primary">
                            REFRESH PAGE
                        </button>
                        <button id="reset-extension-btn" class="btn btn-secondary">
                            RESET EXTENSION
                        </button>
                    </div>
                    <details class="error-details">
                        <summary>Technical Details</summary>
                        <pre>${error.message}\n\nStack: ${error.stack}</pre>
                    </details>
                </div>
            </div>
        `;

        document.body.innerHTML = errorHtml;

        // Add styles for error page
        this.addErrorPageStyles();

        // Add event listeners for error page buttons
        document.getElementById('refresh-page-btn')?.addEventListener('click', () =>
        {
            location.reload();
        });

        document.getElementById('reset-extension-btn')?.addEventListener('click', async () =>
        {
            if (confirm('This will reset all extension settings. Are you sure?'))
            {
                try
                {
                    await chrome.storage.local.clear();
                    Utils.createToast('Extension reset successfully. Refreshing page...', 'success');
                    setTimeout(() => location.reload(), 2000);
                } catch (resetError)
                {
                    Utils.createToast('Failed to reset extension: ' + resetError.message, 'error');
                }
            }
        });
    }

    addErrorPageStyles()
    {
        const style = document.createElement('style');
        style.textContent = `
            .error-page {
                padding: 40px;
                text-align: center;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                color: white;
                font-family: 'Segoe UI', sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .error-container {
                max-width: 600px;
                background: rgba(255, 255, 255, 0.95);
                color: #333;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            }
            .error-container h1 {
                color: #e74c3c;
                margin-bottom: 20px;
            }
            .error-container ul {
                text-align: left;
                margin: 20px 0;
                line-height: 1.8;
            }
            .error-actions {
                margin: 30px 0;
            }
            .error-actions .btn {
                margin: 5px;
                padding: 12px 24px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
            }
            .btn-primary {
                background: #4CAF50;
                color: white;
            }
            .btn-secondary {
                background: #6c757d;
                color: white;
            }
            .error-details {
                text-align: left;
                margin-top: 20px;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 8px;
            }
            .error-details pre {
                font-size: 12px;
                color: #666;
                white-space: pre-wrap;
                margin-top: 10px;
            }
            .highlight {
                animation: highlight 2s ease-out;
            }
            @keyframes highlight {
                0% { background-color: rgba(76, 175, 80, 0.3); }
                100% { background-color: transparent; }
            }
        `;
        document.head.appendChild(style);
    }

    cleanup()
    {
        if (this.controller)
        {
            this.controller.destroy();
            this.controller = null;
        }
        this.isInitialized = false;
    }

    getStatus()
    {
        return {
            initialized: this.isInitialized,
            controller: !!this.controller,
            timestamp: new Date().toISOString()
        };
    }
}

// Global error handler for the options page
window.addEventListener('error', (event) =>
{
    console.error('Options page error:', event.error);

    // Store error for debugging
    if (typeof chrome !== 'undefined' && chrome.storage)
    {
        chrome.storage.local.get(['errorLog'], (data) =>
        {
            const errors = data.errorLog || [];
            errors.push({
                message: event.error.message,
                stack: event.error.stack,
                timestamp: new Date().toISOString(),
                context: 'options-page',
                url: window.location.href
            });
            chrome.storage.local.set({
                errorLog: errors.slice(-50)
            });
        });
    }
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () =>
{
    const optionsPage = new OptionsPage();
    await optionsPage.init();

    // Make available globally for debugging
    window.optionsPage = optionsPage;
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) =>
{
    console.error('Unhandled promise rejection in options page:', event.reason);

    // Prevent default browser behavior
    event.preventDefault();

    // Show user-friendly error
    Utils.createToast('An unexpected error occurred. Please refresh the page.', 'error', 5000);
});