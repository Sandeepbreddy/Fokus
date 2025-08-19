// src/background/message-handler.js - Fixed message handling for blocklists
import { Logger } from '../shared/logger.js';
import { MESSAGE_TYPES, STORAGE_KEYS, DEFAULT_BLOCKLISTS } from '../shared/constants.js';
import { errorHandler } from '../shared/error-handler.js';
import { Utils } from '../shared/utils.js';

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

                // Blocklist actions - FIXED
                case MESSAGE_TYPES.FETCH_BLOCKLIST:
                    result = await this.handleFetchBlocklist(message.url);
                    break;

                case 'updateBlocklists':
                    result = await this.handleUpdateBlocklists();
                    break;

                case 'forceUpdateBlocklist':
                    result = await this.handleForceUpdateBlocklists();
                    break;

                // Utility actions
                case MESSAGE_TYPES.GET_BLOCKED_PAGE_URL:
                    result = this.getBlockedPageUrl(message);
                    break;

                // Keyword management
                case MESSAGE_TYPES.ADD_KEYWORD:
                case MESSAGE_TYPES.REMOVE_KEYWORD:
                    result = await this.handleKeywordAction(message);
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
            this.logger.info(`Fetching blocklist from: ${url}`);

            // Validate URL
            if (!url || typeof url !== 'string')
            {
                throw new Error('Invalid URL provided');
            }

            // Create abort controller for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            try
            {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/plain, */*',
                        'Cache-Control': 'no-cache',
                        'User-Agent': 'Mozilla/5.0 (compatible; Fokus-Extension/1.0.0)'
                    },
                    mode: 'cors',
                    credentials: 'omit',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                this.logger.debug(`Fetch response status: ${response.status} ${response.statusText}`);

                if (!response.ok)
                {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const content = await response.text();

                if (!content)
                {
                    throw new Error('Empty response received');
                }

                if (content.length < 50)
                {
                    throw new Error(`Response too short: ${content.length} characters`);
                }

                this.logger.debug(`Received content: ${content.length} characters`);

                // Parse the content to extract domains
                const domains = this.parseHostsFile(content);

                if (domains.length === 0)
                {
                    throw new Error('No valid domains found in blocklist');
                }

                this.logger.info(`Successfully parsed ${domains.length} domains from ${url}`);

                return {
                    success: true,
                    content: content,
                    domains: domains,
                    domainCount: domains.length,
                    size: content.length,
                    url: url
                };

            } catch (fetchError)
            {
                clearTimeout(timeoutId);

                if (fetchError.name === 'AbortError')
                {
                    throw new Error('Request timed out after 30 seconds');
                }

                throw fetchError;
            }

        } catch (error)
        {
            this.logger.error(`Failed to fetch blocklist from ${url}:`, error);

            return {
                success: false,
                error: error.message || 'Unknown fetch error',
                url: url
            };
        }
    }

    async handleUpdateBlocklists()
    {
        try
        {
            this.logger.info('Starting blocklist update...');

            // Get current blocklist sources - FIX: Use STORAGE_KEYS constant
            const data = await chrome.storage.local.get([STORAGE_KEYS.BLOCKLIST_SOURCES, 'blocklistInitialized']);

            // FIX: Initialize with default blocklists if not configured
            let sources = data[STORAGE_KEYS.BLOCKLIST_SOURCES];

            if (!sources || sources.length === 0)
            {
                // Initialize with default blocklists
                this.logger.info('No blocklist sources found, initializing with defaults...');
                sources = DEFAULT_BLOCKLISTS;

                // Save the default blocklists
                await chrome.storage.local.set({
                    [STORAGE_KEYS.BLOCKLIST_SOURCES]: sources,
                    blocklistInitialized: true
                });
            }

            this.logger.debug('Found blocklist sources:', sources.length);

            const enabledSources = sources.filter(s => s.enabled);
            this.logger.info(`Processing ${enabledSources.length} enabled sources out of ${sources.length} total`);

            if (enabledSources.length === 0)
            {
                this.logger.warn('No enabled blocklist sources found');
                return {
                    success: false,
                    error: 'No enabled blocklist sources found. Enable at least one blocklist in settings.'
                };
            }

            const results = [];
            const allDomains = new Set();

            // Process each enabled source with individual error handling
            for (const source of enabledSources)
            {
                this.logger.info(`Processing source: ${source.name} (${source.url})`);

                try
                {
                    const result = await this.handleFetchBlocklist(source.url);

                    const sourceResult = {
                        id: source.id,
                        name: source.name,
                        success: result.success,
                        lastUpdated: new Date().toISOString()
                    };

                    if (result.success)
                    {
                        sourceResult.domainCount = result.domainCount;
                        sourceResult.domains = result.domains;

                        // Add domains to master set
                        result.domains.forEach(domain => allDomains.add(domain));

                        this.logger.info(`Successfully processed ${source.name}: ${result.domainCount} domains`);
                    } else
                    {
                        sourceResult.error = result.error;
                        this.logger.warn(`Failed to process ${source.name}: ${result.error}`);
                    }

                    results.push(sourceResult);
                } catch (error)
                {
                    this.logger.error(`Error processing source ${source.name}:`, error);

                    results.push({
                        id: source.id,
                        name: source.name,
                        success: false,
                        error: error.message || 'Unknown error',
                        lastUpdated: new Date().toISOString()
                    });
                }
            }

            // Store results and consolidated domains
            const consolidatedDomains = Array.from(allDomains);

            this.logger.info(`Storing ${consolidatedDomains.length} total domains from ${results.length} sources`);

            await chrome.storage.local.set({
                [STORAGE_KEYS.BLOCKLIST_RESULTS]: results,
                [STORAGE_KEYS.BLOCKED_DOMAINS]: consolidatedDomains,
                lastBlocklistUpdate: Date.now()
            });

            // Reload content blocker settings
            if (this.contentBlocker && typeof this.contentBlocker.loadSettings === 'function')
            {
                try
                {
                    await this.contentBlocker.loadSettings();
                    this.logger.debug('Content blocker settings reloaded');
                } catch (error)
                {
                    this.logger.warn('Failed to reload content blocker settings:', error);
                }
            }

            const successCount = results.filter(r => r.success).length;
            const totalDomains = consolidatedDomains.length;

            this.logger.info(`Blocklist update completed: ${successCount}/${results.length} sources, ${totalDomains} total domains`);

            return {
                success: true,
                results: results,
                totalDomains: totalDomains,
                successfulSources: successCount,
                totalSources: results.length,
                message: `Updated ${successCount}/${results.length} blocklists with ${totalDomains.toLocaleString()} domains`
            };

        } catch (error)
        {
            this.logger.error('Blocklist update failed with error:', error);

            return {
                success: false,
                error: error.message || 'Unknown error during blocklist update'
            };
        }
    }

    async handleForceUpdateBlocklists()
    {
        try
        {
            // Clear any cached data
            if (this.blocklistManager && typeof this.blocklistManager.clearCache === 'function')
            {
                this.blocklistManager.clearCache();
            }

            // Perform the update
            return await this.handleUpdateBlocklists();
        } catch (error)
        {
            this.logger.error('Force update failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    parseHostsFile(content)
    {
        const domains = new Set();
        const lines = content.split('\n');

        this.logger.debug(`Parsing ${lines.length} lines from hosts file`);

        let validDomains = 0;
        let skippedLines = 0;

        for (const line of lines)
        {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!'))
            {
                skippedLines++;
                continue;
            }

            // Handle different formats:
            // 1. Standard hosts format: "0.0.0.0 domain.com"
            // 2. Plain domain list: "domain.com"

            let domain = null;

            // Try hosts format first (IP domain)
            const hostsParts = trimmed.split(/\s+/);
            if (hostsParts.length >= 2 && this.isValidIP(hostsParts[0]))
            {
                domain = hostsParts[1].toLowerCase();
            }
            // Try plain domain format
            else if (hostsParts.length === 1)
            {
                domain = trimmed.toLowerCase();
            }

            // Validate and add domain
            if (domain && this.isValidDomain(domain))
            {
                domains.add(domain);
                validDomains++;
            }
        }

        this.logger.debug(`Parsed results: ${validDomains} valid domains, ${skippedLines} skipped lines`);

        return Array.from(domains);
    }

    isValidIP(ip)
    {
        // Check for common blocking IPs
        const blockingIPs = ['0.0.0.0', '127.0.0.1', '::1', '::'];
        return blockingIPs.includes(ip);
    }


    isValidDomain(domain)
    {
        if (!domain || typeof domain !== 'string')
        {
            return false;
        }

        // Basic domain validation
        if (domain.length < 4 || domain.length > 253)
        {
            return false;
        }

        // Must contain at least one dot
        if (!domain.includes('.'))
        {
            return false;
        }

        // Must not start or end with dot, dash, or contain invalid characters
        if (domain.startsWith('.') || domain.endsWith('.') ||
            domain.startsWith('-') || domain.endsWith('-') ||
            domain.includes('//') || domain.includes(' '))
        {
            return false;
        }

        // Exclude localhost and common test domains
        const excludeDomains = [
            'localhost', 'local', 'test', 'example.com', 'example.org',
            '0.0.0.0', '127.0.0.1', 'broadcasthost'
        ];

        if (excludeDomains.includes(domain))
        {
            return false;
        }

        // Basic regex validation
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,}|[a-zA-Z0-9-]*[a-zA-Z0-9])$/;
        return domainRegex.test(domain);
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
        return {
            success: false,
            error: 'Keyword management not yet implemented in this refactor',
            canRetry: false
        };
    }

    isValidMessage(message)
    {
        return message &&
            typeof message === 'object' &&
            typeof message.action === 'string';
    }

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