// src/background/main.js - Main background script entry point (Fixed)
import { Logger } from '../shared/logger.js';
import { errorHandler } from '../shared/error-handler.js';
import { ContentBlocker } from './content-blocker.js';
import { AuthManager, authManager } from './auth-manager.js';
import { MessageHandler } from './message-handler.js';
import { blocklistManager } from '../services/blocklist-manager.js';

class FokusBackground
{
    constructor()
    {
        this.logger = new Logger('Background');
        this.contentBlocker = null;
        this.messageHandler = null;
        this.isInitialized = false;

        // Start initialization
        this.init().catch(error =>
        {
            this.logger.error('Critical initialization error:', error);
            this.createFallbackServices();
        });
    }

    async init()
    {
        const startTime = performance.now();
        this.logger.info('Fokus Extension - Background Script Starting...');

        try
        {
            // Setup polyfills for older browsers
            this.setupPolyfills();

            // Initialize core services
            await this.initializeServices();

            // Setup global error handling
            this.setupErrorHandling();

            // Initialize message handling
            this.setupMessageHandling();

            const initTime = performance.now() - startTime;
            this.logger.info(`Background script initialized in ${initTime.toFixed(2)}ms`);
            this.isInitialized = true;

        } catch (error)
        {
            this.logger.error('Failed to initialize background script:', error);
            errorHandler.handleError(error, 'background-init');

            // Create fallback services
            this.createFallbackServices();
        }
    }

    setupPolyfills()
    {
        // AbortSignal.timeout polyfill
        if (!globalThis.AbortSignal?.timeout)
        {
            AbortSignal.timeout = function (delay)
            {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), delay);
                return controller.signal;
            };
        }
    }

    async initializeServices()
    {
        this.logger.info('Initializing core services...');

        try
        {
            // Initialize services in sequence to avoid race conditions
            await authManager.init();
            this.logger.info('Auth manager initialized');

            await this.initializeContentBlocker();
            this.logger.info('Content blocker initialized');

            this.logger.info('Core services initialized');
        } catch (error)
        {
            this.logger.error('Service initialization failed:', error);
            throw error;
        }
    }

    async initializeContentBlocker()
    {
        try
        {
            this.contentBlocker = new ContentBlocker();
            this.logger.info('Content Blocker initialized');
        } catch (error)
        {
            this.logger.error('Failed to initialize Content Blocker:', error);
            throw error;
        }
    }

    setupErrorHandling()
    {
        // Global error tracking is already set up in error-handler.js
        // Just log that it's active
        this.logger.info('Global error handling active');
    }

    setupMessageHandling()
    {
        try
        {
            this.messageHandler = new MessageHandler(
                this.contentBlocker,
                authManager,
                blocklistManager
            );
            this.logger.info('Message handling initialized');
        } catch (error)
        {
            this.logger.error('Failed to setup message handling:', error);
            errorHandler.handleError(error, 'message-handler-setup');
        }
    }

    createFallbackServices()
    {
        this.logger.warn('Creating fallback services due to initialization failure');

        // Create minimal fallback content blocker
        this.contentBlocker = {
            addCustomDomain: async () => ({ success: false, error: 'Service unavailable' }),
            removeCustomDomain: async () => ({ success: false, error: 'Service unavailable' }),
            setActive: async () => ({ success: false, error: 'Service unavailable' }),
            getCurrentTab: async () => ({ url: null }),
            addDomainFromTab: async () => ({ success: false, error: 'Service unavailable' })
        };

        // Setup fallback message handler
        if (chrome.runtime && chrome.runtime.onMessage)
        {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
            {
                sendResponse({
                    success: false,
                    error: 'Extension not properly initialized',
                    canRetry: true
                });
                return true;
            });
        }
    }

    // Lifecycle event handlers
    handleInstall(details)
    {
        this.logger.info('Extension installed:', details.reason);

        if (details.reason === 'install')
        {
            this.logger.info('First time install - welcome!');
        } else if (details.reason === 'update')
        {
            this.logger.info('Extension updated to version:', chrome.runtime.getManifest().version);
        }
    }

    handleStartup()
    {
        this.logger.info('Browser startup detected');

        // Clear caches on startup
        if (this.contentBlocker && typeof this.contentBlocker.tabCache?.clear === 'function')
        {
            this.contentBlocker.tabCache.clear();
        }

        if (blocklistManager && typeof blocklistManager.clearCache === 'function')
        {
            blocklistManager.clearCache();
        }
    }

    handleSuspend()
    {
        this.logger.info('Extension suspending - cleaning up...');
        this.cleanup();
    }

    cleanup()
    {
        try
        {
            // Cleanup content blocker
            if (this.contentBlocker && typeof this.contentBlocker.destroy === 'function')
            {
                this.contentBlocker.destroy();
            }

            // Cleanup auth manager
            if (authManager && typeof authManager.destroy === 'function')
            {
                authManager.destroy();
            }

            // Cleanup blocklist manager
            if (blocklistManager && typeof blocklistManager.destroy === 'function')
            {
                blocklistManager.destroy();
            }

            this.logger.info('Cleanup completed');
        } catch (error)
        {
            this.logger.error('Error during cleanup:', error);
        }
    }

    // Public API for debugging
    getStatus()
    {
        return {
            initialized: this.isInitialized,
            contentBlocker: !!this.contentBlocker,
            authManager: !!authManager,
            messageHandler: !!this.messageHandler,
            version: chrome.runtime.getManifest().version
        };
    }
}

// Initialize the background script
const fokusBackground = new FokusBackground();

// Handle extension lifecycle events
if (chrome.runtime.onInstalled)
{
    chrome.runtime.onInstalled.addListener((details) =>
    {
        fokusBackground.handleInstall(details);
    });
}

if (chrome.runtime.onStartup)
{
    chrome.runtime.onStartup.addListener(() =>
    {
        fokusBackground.handleStartup();
    });
}

if (chrome.runtime.onSuspend)
{
    chrome.runtime.onSuspend.addListener(() =>
    {
        fokusBackground.handleSuspend();
    });
}

// Export for debugging (available in background script console)
globalThis.fokusBackground = fokusBackground;

console.log('Background script loaded successfully with optimizations');