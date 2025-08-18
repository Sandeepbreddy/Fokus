// src/content/keyword-detector.js - Keyword detection and blocking
import { Logger } from '../shared/logger.js';
import { DEFAULT_KEYWORDS } from '../shared/constants.js';

export class KeywordDetector
{
    constructor()
    {
        this.logger = new Logger('KeywordDetector');
        this.blockedKeywords = new Set();
        this.keywordCache = new Map();
        this.cacheExpiry = 300000; // 5 minutes
        this.initKeywords();
    }

    async initKeywords()
    {
        try
        {
            const data = await chrome.storage.local.get(['blockedKeywords']);
            this.blockedKeywords = new Set(data.blockedKeywords || DEFAULT_KEYWORDS);
            this.logger.debug(`Loaded ${this.blockedKeywords.size} blocked keywords`);
        } catch (error)
        {
            this.logger.error('Failed to load keywords:', error);
            this.blockedKeywords = new Set(DEFAULT_KEYWORDS);
        }
    }

    containsBlockedKeywords(text)
    {
        if (!text || typeof text !== 'string') return null;

        // Check cache first
        const textHash = this.hashText(text);
        const cached = this.keywordCache.get(textHash);

        if (cached && Date.now() - cached.timestamp < this.cacheExpiry)
        {
            return cached.result;
        }

        // Perform keyword detection
        const result = this.detectKeywords(text);

        // Cache result
        this.cacheResult(textHash, result);

        return result;
    }

    detectKeywords(text)
    {
        const lowerText = text.toLowerCase();

        // Quick scan for exact matches
        for (const keyword of this.blockedKeywords)
        {
            const lowerKeyword = keyword.toLowerCase();
            if (lowerText.includes(lowerKeyword))
            {
                // Verify it's not a partial word match
                if (this.isWordBoundaryMatch(lowerText, lowerKeyword))
                {
                    this.logger.debug(`Blocked keyword detected: "${keyword}"`);
                    return keyword;
                }
            }
        }

        return null;
    }

    isWordBoundaryMatch(text, keyword)
    {
        // Create regex with word boundaries
        const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
        return regex.test(text);
    }

    escapeRegex(string)
    {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    hashText(text)
    {
        // Simple hash function for caching
        let hash = 0;
        if (text.length === 0) return hash;

        for (let i = 0; i < text.length; i++)
        {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return hash.toString();
    }

    cacheResult(textHash, result)
    {
        this.keywordCache.set(textHash, {
            result,
            timestamp: Date.now()
        });

        // Cleanup old cache entries
        if (this.keywordCache.size > 500)
        {
            const entries = Array.from(this.keywordCache.entries());
            const validEntries = entries.filter(([, value]) =>
                Date.now() - value.timestamp < this.cacheExpiry
            );
            this.keywordCache = new Map(validEntries.slice(-250));
        }
    }

    checkSearchQuery(query)
    {
        if (!query) return null;

        // Search queries need more sensitive detection
        return this.detectKeywords(query);
    }

    checkUrl(url)
    {
        if (!url) return null;

        try
        {
            const urlObj = new URL(url);

            // Check pathname and search params
            const pathToCheck = urlObj.pathname + urlObj.search;
            return this.detectKeywords(decodeURIComponent(pathToCheck));
        } catch (error)
        {
            // Fallback for invalid URLs
            return this.detectKeywords(url);
        }
    }

    checkPageContent(content)
    {
        if (!content || content.length > 10000)
        {
            // Don't check very large content for performance
            return null;
        }

        return this.detectKeywords(content);
    }

    addKeyword(keyword)
    {
        if (keyword && keyword.trim().length > 1)
        {
            const trimmedKeyword = keyword.trim().toLowerCase();
            this.blockedKeywords.add(trimmedKeyword);
            this.keywordCache.clear(); // Clear cache when rules change
            return true;
        }
        return false;
    }

    removeKeyword(keyword)
    {
        const removed = this.blockedKeywords.delete(keyword.toLowerCase());
        if (removed)
        {
            this.keywordCache.clear();
        }
        return removed;
    }

    getBlockedKeywordsArray()
    {
        return Array.from(this.blockedKeywords);
    }

    getKeywordCount()
    {
        return this.blockedKeywords.size;
    }

    // Advanced detection methods
    checkMetaTags()
    {
        const metaTags = document.querySelectorAll('meta[name="keywords"], meta[name="description"], title');

        for (const tag of metaTags)
        {
            const content = tag.textContent || tag.getAttribute('content') || '';
            const detected = this.detectKeywords(content);
            if (detected)
            {
                this.logger.debug(`Blocked keyword in meta tag: "${detected}"`);
                return detected;
            }
        }

        return null;
    }

    checkPageTitle()
    {
        const title = document.title;
        return this.detectKeywords(title);
    }

    checkVisibleText()
    {
        // Check only visible text for performance
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) =>
                {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;

                    const style = window.getComputedStyle(parent);
                    if (style.display === 'none' || style.visibility === 'hidden')
                    {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let textContent = '';
        let node;

        while (node = walker.nextNode())
        {
            textContent += node.textContent + ' ';

            // Limit text length for performance
            if (textContent.length > 5000) break;
        }

        return this.detectKeywords(textContent);
    }

    // Utility methods
    sanitizeKeyword(keyword)
    {
        return keyword.trim().toLowerCase().replace(/[^\w\s]/g, '');
    }

    isValidKeyword(keyword)
    {
        const sanitized = this.sanitizeKeyword(keyword);
        return sanitized.length >= 2 && sanitized.length <= 50;
    }

    clearCache()
    {
        this.keywordCache.clear();
        this.logger.debug('Keyword cache cleared');
    }

    updateKeywords(newKeywords)
    {
        this.blockedKeywords = new Set(newKeywords.map(k => k.toLowerCase()));
        this.keywordCache.clear();
        this.logger.debug(`Updated keywords: ${this.blockedKeywords.size} total`);
    }

    getStats()
    {
        return {
            keywordCount: this.blockedKeywords.size,
            cacheSize: this.keywordCache.size,
            cacheHitRate: this.calculateCacheHitRate()
        };
    }

    calculateCacheHitRate()
    {
        // This would need to be implemented with hit/miss counters
        return 0;
    }

    destroy()
    {
        this.keywordCache.clear();
        this.blockedKeywords.clear();
        this.logger.info('KeywordDetector destroyed');
    }
}

export default KeywordDetector;