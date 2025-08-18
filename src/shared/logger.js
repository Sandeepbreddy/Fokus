// src/shared/logger.js - Centralized logging (Service Worker compatible)
export class Logger
{
    constructor(context = 'App')
    {
        this.context = context;
        this.isDebug = this.detectDebugMode();
    }

    detectDebugMode()
    {
        try
        {
            // Check if we're in a Service Worker environment
            if (typeof importScripts === 'function')
            {
                // Service Worker environment - check extension manifest
                if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
                {
                    const manifest = chrome.runtime.getManifest();
                    return manifest.version?.includes('dev') ||
                        manifest.name?.toLowerCase().includes('dev') ||
                        manifest.name?.toLowerCase().includes('debug');
                }
                return false;
            }

            // Browser environment - existing checks
            const isDev =
                // Extension development mode
                (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version?.includes('dev')) ||
                // Local development (if window exists)
                (typeof window !== 'undefined' && (
                    window.location?.hostname === 'localhost' ||
                    window.location?.hostname === '127.0.0.1' ||
                    // Debug flag in localStorage
                    (window.localStorage && window.localStorage.getItem('debug') === 'true') ||
                    // URL parameter
                    (window.location?.search && new URLSearchParams(window.location.search).has('debug'))
                ));

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
        if (this.isDebug && typeof console.time === 'function')
        {
            console.time(`[${this.context}] ${label}`);
        }
    }

    timeEnd(label)
    {
        if (this.isDebug && typeof console.timeEnd === 'function')
        {
            console.timeEnd(`[${this.context}] ${label}`);
        }
    }

    group(label)
    {
        if (this.isDebug && typeof console.group === 'function')
        {
            console.group(`[${this.context}] ${label}`);
        }
    }

    groupEnd()
    {
        if (this.isDebug && typeof console.groupEnd === 'function')
        {
            console.groupEnd();
        }
    }

    table(data)
    {
        if (this.isDebug && typeof console.table === 'function')
        {
            console.table(data);
        }
    }
}