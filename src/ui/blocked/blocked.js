// src/ui/blocked/blocked.js - Blocked page functionality
import { Utils } from '../../shared/utils.js';
import { Logger } from '../../shared/logger.js';
import { STORAGE_KEYS } from '../../shared/constants.js';

class BlockedPage
{
    constructor()
    {
        this.logger = new Logger('BlockedPage');
        this.urlParams = new URLSearchParams(window.location.search);
        this.motivationalQuotes = [
            "The successful warrior is the average person with laser-like focus. - Bruce Lee",
            "Concentration is the secret of strength. - Ralph Waldo Emerson",
            "Where attention goes, energy flows and results show. - T. Harv Eker",
            "The art of being wise is knowing what to overlook. - William James",
            "Focus on being productive instead of busy. - Tim Ferriss",
            "You are what you choose to focus on. - Unknown",
            "Discipline is choosing between what you want now and what you want most. - Abraham Lincoln"
        ];

        this.init();
    }

    async init()
    {
        try
        {
            this.updateBlockedInfo();
            await this.loadStats();
            this.setupQuoteRotation();
            this.setupEventListeners();

            this.logger.info('Blocked page initialized');
        } catch (error)
        {
            this.logger.error('Failed to initialize blocked page:', error);
        }
    }

    updateBlockedInfo()
    {
        const blockedInfo = document.getElementById('blocked-info');
        if (!blockedInfo) return;

        const domain = this.urlParams.get('domain');
        const reason = this.urlParams.get('reason');
        const keyword = this.urlParams.get('keyword');
        const query = this.urlParams.get('query');

        if (domain)
        {
            blockedInfo.innerHTML = `
                <p><strong>Domain Blocked:</strong> ${Utils.escapeHtml(domain)}</p>
                <p>This website has been blocked to help maintain your focus and productivity.</p>
            `;
        } else if (reason === 'search' && keyword)
        {
            blockedInfo.innerHTML = `
                <p><strong>Search Blocked:</strong> Contains keyword "${Utils.escapeHtml(keyword)}"</p>
                <p>Your search: "${Utils.escapeHtml(query || 'N/A')}"</p>
                <p>This search was blocked because it contains content that could be distracting.</p>
            `;
        } else if (reason === 'keyword')
        {
            blockedInfo.innerHTML = `
                <p><strong>Content Blocked:</strong> Contains blocked keywords</p>
                <p>This page was blocked because it contains content that could be distracting.</p>
            `;
        } else
        {
            blockedInfo.innerHTML = `
                <p><strong>Content Blocked:</strong> This content has been filtered</p>
                <p>Focus Guard has blocked this content to help you stay productive.</p>
            `;
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
                STORAGE_KEYS.LAST_BLOCK_DATE
            ]);

            const today = new Date().toDateString();
            const lastBlockDate = data[STORAGE_KEYS.LAST_BLOCK_DATE] || '';

            // Update blocks today
            let blocksToday = data[STORAGE_KEYS.BLOCKS_TODAY] || 0;
            if (lastBlockDate !== today)
            {
                blocksToday = 1;
                await chrome.storage.local.set({
                    [STORAGE_KEYS.BLOCKS_TODAY]: 1,
                    [STORAGE_KEYS.LAST_BLOCK_DATE]: today
                });
            } else
            {
                blocksToday++;
                await chrome.storage.local.set({
                    [STORAGE_KEYS.BLOCKS_TODAY]: blocksToday
                });
            }

            // Update total blocks
            const totalBlocks = (data[STORAGE_KEYS.TOTAL_BLOCKS] || 0) + 1;
            await chrome.storage.local.set({
                [STORAGE_KEYS.TOTAL_BLOCKS]: totalBlocks
            });

            // Calculate focus streak
            const focusStreak = data[STORAGE_KEYS.FOCUS_STREAK] || 1;
            const timeSaved = Math.round((totalBlocks * 2) / 60) || Math.floor(blocksToday * 0.5);

            // Update display
            this.updateStatDisplay('blocks-today', blocksToday);
            this.updateStatDisplay('focus-streak', focusStreak);
            this.updateStatDisplay('time-saved', timeSaved);

        } catch (error)
        {
            this.logger.warn('Could not load stats:', error);
            // Fallback for demo purposes
            this.updateStatDisplay('blocks-today', Math.floor(Math.random() * 10) + 1);
            this.updateStatDisplay('focus-streak', Math.floor(Math.random() * 30) + 1);
            this.updateStatDisplay('time-saved', Math.floor(Math.random() * 20) + 1);
        }
    }

    updateStatDisplay(elementId, value)
    {
        const element = document.getElementById(elementId);
        if (element)
        {
            // Add animation effect
            element.style.opacity = '0';
            setTimeout(() =>
            {
                element.textContent = value;
                element.style.opacity = '1';
            }, 100);
        }
    }

    setupQuoteRotation()
    {
        const quoteElement = document.querySelector('.quote');
        if (!quoteElement) return;

        let quoteIndex = 0;
        quoteElement.style.transition = 'opacity 0.3s ease';

        // Rotate quotes every 8 seconds
        setInterval(() =>
        {
            quoteIndex = (quoteIndex + 1) % this.motivationalQuotes.length;
            quoteElement.style.opacity = '0';

            setTimeout(() =>
            {
                quoteElement.textContent = this.motivationalQuotes[quoteIndex];
                quoteElement.style.opacity = '1';
            }, 300);
        }, 8000);
    }

    setupEventListeners()
    {
        const goHomeBtn = document.getElementById('go-home');
        const showSettingsBtn = document.getElementById('show-settings');

        if (goHomeBtn)
        {
            goHomeBtn.addEventListener('click', (e) =>
            {
                e.preventDefault();
                this.goHome();
            });
        }

        if (showSettingsBtn)
        {
            showSettingsBtn.addEventListener('click', (e) =>
            {
                e.preventDefault();
                this.showSettings();
            });
        }

        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) =>
        {
            switch (e.key)
            {
                case 'h':
                case 'H':
                    if (!e.ctrlKey && !e.metaKey)
                    {
                        this.goHome();
                    }
                    break;
                case 's':
                case 'S':
                    if (!e.ctrlKey && !e.metaKey)
                    {
                        this.showSettings();
                    }
                    break;
                case 'Escape':
                    this.goHome();
                    break;
            }
        });

        // Add click tracking for analytics
        document.addEventListener('click', (e) =>
        {
            const target = e.target;
            if (target.classList.contains('btn'))
            {
                this.logger.debug('Button clicked:', target.textContent);
            }
        });
    }

    goHome()
    {
        // Safe homepage options
        const safeHomepages = [
            'https://www.google.com',
            'https://duckduckgo.com',
            'https://www.bing.com',
            'https://start.duckduckgo.com'
        ];

        // Use Google as default
        window.location.href = safeHomepages[0];
    }

    showSettings()
    {
        try
        {
            if (chrome && chrome.runtime && chrome.runtime.openOptionsPage)
            {
                chrome.runtime.openOptionsPage();
            } else if (chrome && chrome.tabs)
            {
                chrome.tabs.create({
                    url: chrome.runtime.getURL('src/ui/options/options.html')
                });
            } else
            {
                // Fallback for direct access
                window.open('/src/ui/options/options.html', '_blank');
            }
        } catch (error)
        {
            this.logger.error('Failed to open settings:', error);
            alert('Please access settings through the extension popup in your browser toolbar.');
        }
    }

    // Add visual feedback for user interactions
    addRippleEffect(element, event)
    {
        const ripple = document.createElement('span');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        ripple.style.cssText = `
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.6);
            transform: scale(0);
            animation: ripple 0.6s linear;
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            pointer-events: none;
        `;

        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);

        setTimeout(() =>
        {
            ripple.remove();
        }, 600);
    }

    // Get blocking statistics for display
    async getBlockingStats()
    {
        try
        {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.TOTAL_BLOCKS,
                STORAGE_KEYS.BLOCKS_TODAY,
                STORAGE_KEYS.CUSTOM_DOMAINS,
                STORAGE_KEYS.BLOCKED_DOMAINS,
                STORAGE_KEYS.BLOCKED_KEYWORDS
            ]);

            return {
                totalBlocks: data[STORAGE_KEYS.TOTAL_BLOCKS] || 0,
                blocksToday: data[STORAGE_KEYS.BLOCKS_TODAY] || 0,
                totalDomains: (data[STORAGE_KEYS.CUSTOM_DOMAINS]?.length || 0) +
                    (data[STORAGE_KEYS.BLOCKED_DOMAINS]?.length || 0),
                totalKeywords: data[STORAGE_KEYS.BLOCKED_KEYWORDS]?.length || 0
            };
        } catch (error)
        {
            this.logger.error('Failed to get blocking stats:', error);
            return {
                totalBlocks: 0,
                blocksToday: 0,
                totalDomains: 0,
                totalKeywords: 0
            };
        }
    }

    // Show encouraging message based on blocking reason
    getEncouragingMessage()
    {
        const reason = this.urlParams.get('reason');
        const messages = {
            domain: "Great choice! You're avoiding a potentially distracting website.",
            search: "Smart move! You're keeping your searches focused and productive.",
            keyword: "Well done! You're maintaining your focus on what matters most.",
            default: "Excellent! You're building stronger focus habits every day."
        };

        return messages[reason] || messages.default;
    }

    // Update page title based on blocking type
    updatePageTitle()
    {
        const reason = this.urlParams.get('reason');
        const domain = this.urlParams.get('domain');

        if (reason === 'domain' && domain)
        {
            document.title = `Blocked: ${domain} - Focus Guard`;
        } else if (reason === 'search')
        {
            document.title = 'Search Blocked - Focus Guard';
        } else
        {
            document.title = 'Content Blocked - Focus Guard';
        }
    }

    // Method to be called when page becomes visible
    onPageVisible()
    {
        // Refresh stats when page becomes visible
        this.loadStats();

        // Log the block event for analytics
        this.logBlockEvent();
    }

    logBlockEvent()
    {
        const eventData = {
            reason: this.urlParams.get('reason') || 'unknown',
            domain: this.urlParams.get('domain'),
            keyword: this.urlParams.get('keyword'),
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };

        this.logger.info('Block event:', eventData);
    }

    destroy()
    {
        // Cleanup method for memory management
        this.motivationalQuotes = null;
        this.urlParams = null;
        this.logger.info('BlockedPage destroyed');
    }
}

// Add CSS animations if not already present
function addAnimations()
{
    if (!document.getElementById('blocked-animations'))
    {
        const style = document.createElement('style');
        style.id = 'blocked-animations';
        style.textContent = `
            @keyframes ripple {
                to {
                    transform: scale(2);
                    opacity: 0;
                }
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .stat {
                animation: slideIn 0.6s ease-out;
            }
            
            .stat:nth-child(2) {
                animation-delay: 0.1s;
            }
            
            .stat:nth-child(3) {
                animation-delay: 0.2s;
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () =>
{
    const blockedPage = new BlockedPage();
    addAnimations();

    // Make available globally for debugging
    window.blockedPage = blockedPage;
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () =>
{
    if (!document.hidden && window.blockedPage)
    {
        window.blockedPage.onPageVisible();
    }
});

// Cleanup on unload
window.addEventListener('unload', () =>
{
    if (window.blockedPage)
    {
        window.blockedPage.destroy();
        window.blockedPage = null;
    }
});