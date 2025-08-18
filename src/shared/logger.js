// src/shared/logger.js - Centralized logging (Browser-compatible)
export class Logger
{
    constructor(context = 'App')
    {
        this.context = context;
        // Fix: Remove Node.js process reference and use browser-compatible detection
        this.isDebug = this.detectDebugMode();
    }

    detectDebugMode()
    {
        try
        {
            // Check if we're in development mode via various indicators
            const isDev =
                // Extension development mode
                (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version?.includes('dev')) ||
                // Local development
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                // Debug flag in localStorage
                localStorage.getItem('debug') === 'true' ||
                // URL parameter
                new URLSearchParams(window.location.search).has('debug');

            return isDev;
        } catch (error)
        {
            // Default to false if we can't determine
            return false;
        }
    }

    formatMessage(level, message, ...args)
    {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.context}]`;

        if (typeof message === 'object')
        {
            return [prefix, message, ...args];
        }

        return [`${prefix} ${message}`, ...args];
    }

    debug(message, ...args)
    {
        if (this.isDebug)
        {
            console.debug(...this.formatMessage('debug', message, ...args));
        }
    }

    info(message, ...args)
    {
        console.info(...this.formatMessage('info', message, ...args));
    }

    warn(message, ...args)
    {
        console.warn(...this.formatMessage('warn', message, ...args));
    }

    error(message, ...args)
    {
        console.error(...this.formatMessage('error', message, ...args));
    }

    performance(label, fn)
    {
        if (!this.isDebug) return fn;

        return async (...args) =>
        {
            const start = performance.now();
            this.debug(`Starting ${label}`);

            try
            {
                const result = await fn(...args);
                const duration = performance.now() - start;
                this.debug(`${label} completed in ${duration.toFixed(2)}ms`);
                return result;
            } catch (error)
            {
                const duration = performance.now() - start;
                this.error(`${label} failed after ${duration.toFixed(2)}ms:`, error);
                throw error;
            }
        };
    }

    time(label)
    {
        if (this.isDebug)
        {
            console.time(`[${this.context}] ${label}`);
        }
    }

    timeEnd(label)
    {
        if (this.isDebug)
        {
            console.timeEnd(`[${this.context}] ${label}`);
        }
    }

    group(label)
    {
        if (this.isDebug)
        {
            console.group(`[${this.context}] ${label}`);
        }
    }

    groupEnd()
    {
        if (this.isDebug)
        {
            console.groupEnd();
        }
    }

    table(data)
    {
        if (this.isDebug && console.table)
        {
            console.table(data);
        }
    }
}