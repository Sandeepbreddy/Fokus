// src/background/message-handler.js - Central message handling
import { Logger } from '../shared/logger.js';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { errorHandler } from '../shared/error-handler.js';

export class MessageHandler
{
    constructor(contentBlocker, authManager, blocklistManager)
    {
        this.logger = new Logger('MessageHandler');
        this.contentBlocker = contentBlocker;
        this.authManager = authManager;
        this.blocklistManager = blocklistManager;
        this.setupListener();
    }

    setupListener()
    {
        if (chrome.runtime && chrome.runtime.onMessage)
        {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
            {
                this.handleMessage(message, sender, sendResponse);
                return true; // Keep message channel open for async responses
            });
        }
    }

    async handleMessage(message, sender, sendResponse)
    {
        const startTime = performance.now();
        this.logger.debug('Message received:', message.action);

        try
        {
            let result;

            switch (message.action)
            {
                // Auth actions
                case MESSAGE_TYPES.GET_AUTH_STATUS:
                    result = await this.authManager.getAuthStatus();
                    break;

                case MESSAGE_TYPES.SIGN_IN:
                    result = await this.authManager.signIn(message.email, message.password);
                    break;

                case MESSAGE_TYPES.SIGN_UP:
                    result = await this.authManager.signUp(message.email, message.password);
                    break;

                case MESSAGE_TYPES.SIGN_OUT:
                    result = await this.authManager.signOut();
                    break;

                case MESSAGE_TYPES.SYNC_TO_CLOUD:
                    result = await this.authManager.syncToCloud();
                    break;

                case MESSAGE_TYPES.SYNC_FROM_CLOUD:
                    result = await this.authManager.syncFromCloud();
                    break;

                // Content blocking actions
                case MESSAGE_TYPES.ADD_CUSTOM_DOMAIN:
                    result = await this.contentBlocker.addCustomDomain(message.domain);
                    break;

                case MESSAGE_TYPES.REMOVE_CUSTOM_DOMAIN:
                    result = await this.contentBlocker.removeCustomDomain(message.domain);
                    break;

                case MESSAGE_TYPES.ADD_DOMAIN_FROM_TAB:
                    result = await this.contentBlocker.addDomainFromTab();
                    break;

                case MESSAGE_TYPES.SET_ACTIVE:
                    result = await this.contentBlocker.setActive(message.active);
                    break;

                case MESSAGE_TYPES.GET_CURRENT_TAB:
                    result = await this.contentBlocker.getCurrentTab();
                    break;

                // Blocklist actions
                case MESSAGE_TYPES.FETCH_BLOCKLIST:
                    result = await this.handleFetchBlocklist(message.url);
                    break;

                // Utility actions
                case MESSAGE_TYPES.GET_BLOCKED_PAGE_URL:
                    result = this.getBlockedPageUrl(message);
                    break;

                // Keyword management (handled by contentBlocker)
                case MESSAGE_TYPES.ADD_KEYWORD:
                case MESSAGE_TYPES.REMOVE_KEYWORD:
                    result = await this.handleKeywordAction(message);
                    break;

                // Future blocklist features
                case 'addBlocklistUrl':
                case 'removeBlocklistUrl':
                case 'toggleBlocklistUrl':
                case 'getBlocklistUrls':
                case 'forceUpdateBlocklist':
                    result = {
                        success: false,
                        error: 'Blocklist features coming soon',
                        canRetry: false
                    };
                    break;

                default:
                    result = {
                        success: false,
                        error: 'Unknown action: ' + message.action,
                        canRetry: false
                    };
            }

            const processingTime = performance.now() - startTime;
            this.logger.debug(`Message processed in ${processingTime.toFixed(2)}ms:`, result);

            sendResponse(result);
        } catch (error)
        {
            this.logger.error('Message handler error:', error);

            const errorResponse = {
                success: false,
                error: error.message,
                canRetry: !errorHandler.isNetworkError(error),
                isCloudError: errorHandler.isNetworkError(error),
                suggestOfflineMode: errorHandler.isNetworkError(error),
                category: errorHandler.getCategorizedError(error).category
            };

            sendResponse(errorResponse);
        }
    }

    async handleFetchBlocklist(url)
    {
        try
        {
            this.logger.info('Fetching blocklist:', url);
            const content = await this.blocklistManager.fetchBlocklist(url);

            return {
                success: true,
                content: content,
                size: content.length,
                url: url
            };
        } catch (error)
        {
            this.logger.error('Failed to fetch blocklist:', error);
            return {
                success: false,
                error: error.message,
                url: url
            };
        }
    }

    getBlockedPageUrl(message)
    {
        let blockedUrl = chrome.runtime.getURL('src/ui/blocked/blocked.html') +
            '?reason=' + (message.reason || 'unknown');

        if (message.domain)
        {
            blockedUrl += '&domain=' + encodeURIComponent(message.domain);
        }
        if (message.url)
        {
            blockedUrl += '&url=' + encodeURIComponent(message.url);
        }
        if (message.keyword)
        {
            blockedUrl += '&keyword=' + encodeURIComponent(message.keyword);
        }

        return { blockedUrl: blockedUrl };
    }

    async handleKeywordAction(message)
    {
        // These would be implemented in a KeywordManager service
        // For now, return placeholder responses
        return {
            success: false,
            error: 'Keyword management not yet implemented in this refactor',
            canRetry: false
        };
    }

    // Helper method to validate message structure
    isValidMessage(message)
    {
        return message &&
            typeof message === 'object' &&
            typeof message.action === 'string';
    }

    // Get handler statistics
    getStats()
    {
        return {
            handlersRegistered: Object.keys(MESSAGE_TYPES).length,
            authAvailable: !!this.authManager,
            contentBlockerAvailable: !!this.contentBlocker,
            blocklistManagerAvailable: !!this.blocklistManager
        };
    }
}

export default MessageHandler;