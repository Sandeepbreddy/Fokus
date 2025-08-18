// src/shared/utils.js - Utility functions
import { LIMITS } from './constants.js';

export class Utils
{
    static escapeHtml(text)
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

    static isValidDomain(domain)
    {
        const pattern = /^(?!-)(?:[a-zA-Z0-9-]{1,63}(?<!-)\.)*[a-zA-Z]{2,}$/;
        return pattern.test(domain) && domain.length <= 253;
    }

    static isValidEmail(email)
    {
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return pattern.test(email);
    }

    static formatBytes(bytes)
    {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static getBrowserInfo()
    {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        return 'Unknown';
    }

    static generateId()
    {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    static chunkArray(array, size)
    {
        const chunks = [];
        for (let i = 0; i < array.length; i += size)
        {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    static deepClone(obj)
    {
        if (obj === null || typeof obj !== "object") return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
        if (typeof obj === "object")
        {
            const copy = {};
            Object.keys(obj).forEach(key => copy[key] = Utils.deepClone(obj[key]));
            return copy;
        }
    }

    static debounce(func, wait)
    {
        let timeout;
        return function executedFunction(...args)
        {
            const later = () =>
            {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static throttle(func, limit)
    {
        let inThrottle;
        return function ()
        {
            const args = arguments;
            const context = this;
            if (!inThrottle)
            {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    static async sleep(ms)
    {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static async retry(fn, maxRetries = LIMITS.MAX_RETRIES, delay = 1000)
    {
        for (let attempt = 1; attempt <= maxRetries; attempt++)
        {
            try
            {
                return await fn();
            } catch (error)
            {
                if (attempt === maxRetries) throw error;
                await Utils.sleep(delay * Math.pow(2, attempt - 1)); // Exponential backoff
            }
        }
    }

    static parseHostsFile(content)
    {
        const domains = new Set();
        const lines = content.split('\n');

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

        return Array.from(domains);
    }

    static formatTimeAgo(timestamp)
    {
        const now = Date.now();
        const diff = now - new Date(timestamp).getTime();

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'Just now';
    }

    static validatePin(pin)
    {
        return /^\d{4,6}$/.test(pin);
    }

    static sanitizeUrl(url)
    {
        try
        {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch
        {
            return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        }
    }

    static estimateTimeSaved(blockCount)
    {
        const avgMinutesPerBlock = 2;
        const totalMinutes = blockCount * avgMinutesPerBlock;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours > 0)
        {
            return `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`.trim();
        }
        return `${minutes}m`;
    }

    static createAbortSignal(timeoutMs)
    {
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout)
        {
            return AbortSignal.timeout(timeoutMs);
        }

        // Fallback for browsers without AbortSignal.timeout
        const controller = new AbortController();
        setTimeout(() => controller.abort(), timeoutMs);
        return controller.signal;
    }

    static isExtensionUrl(url)
    {
        return url.includes('chrome-extension://') ||
            url.includes('moz-extension://') ||
            url.includes('edge-extension://');
    }

    static createToast(message, type = 'info', duration = 5000)
    {
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        toast.textContent = message;

        const styles = {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: '10000',
            maxWidth: '400px',
            padding: '15px 20px',
            borderRadius: '12px',
            fontWeight: '500',
            boxShadow: '0 8px 25px rgba(0, 0, 0, 0.2)',
            animation: 'slideInRight 0.4s ease-out'
        };

        const typeStyles = {
            success: {
                background: 'linear-gradient(135deg, #d4edda, #c3e6cb)',
                color: '#155724',
                border: '2px solid #c3e6cb'
            },
            error: {
                background: 'linear-gradient(135deg, #f8d7da, #f5c6cb)',
                color: '#721c24',
                border: '2px solid #f5c6cb'
            },
            info: {
                background: 'linear-gradient(135deg, #d1ecf1, #bee5eb)',
                color: '#0c5460',
                border: '2px solid #bee5eb'
            }
        };

        Object.assign(toast.style, styles, typeStyles[type] || typeStyles.info);

        // Add animation keyframes if not present
        if (!document.getElementById('toast-animations'))
        {
            const style = document.createElement('style');
            style.id = 'toast-animations';
            style.textContent = `
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(30px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes slideOutRight {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(30px); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        // Auto remove
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
        }, duration);

        return toast;
    }
}