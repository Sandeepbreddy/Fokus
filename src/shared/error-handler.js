// src/shared/error-handler.js - Global error handling
import { STORAGE_KEYS, LIMITS } from './constants.js';
import { Logger } from './logger.js';

export class ErrorHandler
{
    static instance = null;

    constructor()
    {
        if (ErrorHandler.instance)
        {
            return ErrorHandler.instance;
        }

        this.logger = new Logger('ErrorHandler');
        this.errorQueue = [];
        this.setupGlobalHandlers();
        ErrorHandler.instance = this;
    }

    static getInstance()
    {
        if (!ErrorHandler.instance)
        {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    setupGlobalHandlers()
    {
        // Handle uncaught errors
        if (typeof window !== 'undefined')
        {
            window.addEventListener('error', (event) =>
            {
                this.handleError(event.error, 'global', {
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                });
            });

            // Handle unhandled promise rejections
            window.addEventListener('unhandledrejection', (event) =>
            {
                this.handleError(event.reason, 'promise', {
                    promise: event.promise
                });
            });
        }

        // Handle Chrome extension errors
        if (typeof chrome !== 'undefined' && chrome.runtime)
        {
            chrome.runtime.onStartup.addListener(() =>
            {
                this.logger.info('Extension started');
            });
        }
    }

    handleError(error, context = 'unknown', metadata = {})
    {
        const errorInfo = {
            message: error?.message || String(error),
            stack: error?.stack || '',
            context,
            metadata,
            timestamp: new Date().toISOString(),
            url: typeof window !== 'undefined' ? window.location?.href : 'background',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
        };

        this.logger.error('Error occurred:', errorInfo);
        this.storeError(errorInfo);

        return errorInfo;
    }

    async storeError(errorInfo)
    {
        try
        {
            if (typeof chrome !== 'undefined' && chrome.storage)
            {
                const data = await chrome.storage.local.get([STORAGE_KEYS.ERROR_LOG]);
                const errors = data[STORAGE_KEYS.ERROR_LOG] || [];

                errors.push(errorInfo);

                // Keep only the last N errors
                const trimmedErrors = errors.slice(-LIMITS.MAX_ERRORS_STORED);

                await chrome.storage.local.set({
                    [STORAGE_KEYS.ERROR_LOG]: trimmedErrors
                });
            } else
            {
                // Fallback to in-memory storage
                this.errorQueue.push(errorInfo);
                if (this.errorQueue.length > LIMITS.MAX_ERRORS_STORED)
                {
                    this.errorQueue.shift();
                }
            }
        } catch (storageError)
        {
            console.error('Failed to store error:', storageError);
        }
    }

    async getStoredErrors()
    {
        try
        {
            if (typeof chrome !== 'undefined' && chrome.storage)
            {
                const data = await chrome.storage.local.get([STORAGE_KEYS.ERROR_LOG]);
                return data[STORAGE_KEYS.ERROR_LOG] || [];
            }
            return this.errorQueue;
        } catch (error)
        {
            this.logger.error('Failed to retrieve stored errors:', error);
            return [];
        }
    }

    async clearStoredErrors()
    {
        try
        {
            if (typeof chrome !== 'undefined' && chrome.storage)
            {
                await chrome.storage.local.remove([STORAGE_KEYS.ERROR_LOG]);
            }
            this.errorQueue = [];
            this.logger.info('Error log cleared');
        } catch (error)
        {
            this.logger.error('Failed to clear error log:', error);
        }
    }

    createErrorReport()
    {
        return {
            timestamp: new Date().toISOString(),
            errors: this.errorQueue,
            environment: {
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
                url: typeof window !== 'undefined' ? window.location?.href : 'background',
                extensionVersion: chrome?.runtime?.getManifest?.()?.version || 'unknown'
            }
        };
    }

    wrapAsyncFunction(fn, context = 'async')
    {
        return async (...args) =>
        {
            try
            {
                return await fn(...args);
            } catch (error)
            {
                this.handleError(error, context, { args });
                throw error;
            }
        };
    }

    wrapFunction(fn, context = 'sync')
    {
        return (...args) =>
        {
            try
            {
                return fn(...args);
            } catch (error)
            {
                this.handleError(error, context, { args });
                throw error;
            }
        };
    }

    async safeExecute(fn, fallback = null, context = 'safe')
    {
        try
        {
            return await fn();
        } catch (error)
        {
            this.handleError(error, context);
            return fallback;
        }
    }

    isNetworkError(error)
    {
        return error?.message?.includes('fetch') ||
            error?.message?.includes('network') ||
            error?.message?.includes('NETWORK_ERROR') ||
            error?.code === 'NETWORK_ERROR';
    }

    isStorageError(error)
    {
        return error?.message?.includes('storage') ||
            error?.message?.includes('quota') ||
            error?.message?.includes('QUOTA_EXCEEDED');
    }

    isAuthError(error)
    {
        return error?.message?.includes('auth') ||
            error?.message?.includes('unauthorized') ||
            error?.message?.includes('Invalid credentials') ||
            error?.status === 401;
    }

    getCategorizedError(error)
    {
        if (this.isNetworkError(error))
        {
            return {
                category: 'network',
                userMessage: 'Network connection failed. Please check your internet connection.',
                canRetry: true
            };
        }

        if (this.isStorageError(error))
        {
            return {
                category: 'storage',
                userMessage: 'Storage operation failed. Please try again or clear some space.',
                canRetry: true
            };
        }

        if (this.isAuthError(error))
        {
            return {
                category: 'auth',
                userMessage: 'Authentication failed. Please sign in again.',
                canRetry: false
            };
        }

        return {
            category: 'unknown',
            userMessage: 'An unexpected error occurred. Please try again.',
            canRetry: true
        };
    }

    formatErrorForUser(error)
    {
        const categorized = this.getCategorizedError(error);
        return {
            message: categorized.userMessage,
            canRetry: categorized.canRetry,
            category: categorized.category,
            timestamp: new Date().toISOString()
        };
    }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();