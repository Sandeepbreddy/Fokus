// src/background/auth-manager.js - Authentication management (Fixed)
import { Logger } from '../shared/logger.js';
import { STORAGE_KEYS } from '../shared/constants.js';
import { storageManager } from './storage-manager.js';
import { errorHandler } from '../shared/error-handler.js';
import { SupabaseClient } from '../services/supabase-client.js'; // Static import

export class AuthManager
{
    constructor()
    {
        this.logger = new Logger('AuthManager');
        this.supabaseClient = null;
        this.isInitialized = false;
    }

    async init()
    {
        if (this.isInitialized) return true;

        try
        {
            // Create Supabase client directly without dynamic import
            this.supabaseClient = new SupabaseClient();
            const initialized = await this.supabaseClient.init();

            if (initialized)
            {
                this.logger.info('Supabase client initialized');
                if (this.supabaseClient.isAuthenticated())
                {
                    await this.supabaseClient.setupAutoSync();
                }
            } else
            {
                this.supabaseClient = null;
                this.logger.warn('Supabase client not available, running in local mode');
            }

            this.isInitialized = true;
            return true;
        } catch (error)
        {
            this.logger.error('Failed to initialize Supabase:', error);
            this.supabaseClient = null;
            this.isInitialized = true;
            return false;
        }
    }

    // ... rest of the methods remain the same
    async getAuthStatus()
    {
        try
        {
            await this.init();

            if (this.supabaseClient && this.supabaseClient.isAuthenticated())
            {
                return {
                    isAuthenticated: true,
                    user: this.supabaseClient.getCurrentUser(),
                    cloudAvailable: true
                };
            }

            // Check offline mode
            const offlineData = await storageManager.get([
                STORAGE_KEYS.OFFLINE_MODE,
                STORAGE_KEYS.OFFLINE_EXPIRY
            ]);

            if (offlineData[STORAGE_KEYS.OFFLINE_MODE] &&
                offlineData[STORAGE_KEYS.OFFLINE_EXPIRY] > Date.now())
            {
                return {
                    isAuthenticated: true,
                    isOfflineMode: true,
                    user: { email: 'offline@mode.local' },
                    cloudAvailable: !!this.supabaseClient
                };
            }

            return {
                isAuthenticated: false,
                cloudAvailable: !!this.supabaseClient
            };
        } catch (error)
        {
            errorHandler.handleError(error, 'get-auth-status');
            return {
                isAuthenticated: false,
                cloudAvailable: false,
                error: error.message
            };
        }
    }

    async signIn(email, password)
    {
        try
        {
            await this.init();

            if (!this.supabaseClient)
            {
                return await this.enableOfflineMode(email);
            }

            const result = await this.supabaseClient.signIn(email, password);
            if (result.success)
            {
                try
                {
                    await this.supabaseClient.syncFromCloud();
                } catch (syncError)
                {
                    this.logger.warn('Failed to sync after sign in:', syncError);
                }
            }
            return result;
        } catch (error)
        {
            // Fallback to offline mode on network errors
            if (errorHandler.isNetworkError(error))
            {
                this.logger.info('Network error, falling back to offline mode');
                return await this.enableOfflineMode(email);
            }

            errorHandler.handleError(error, 'sign-in');
            throw error;
        }
    }

    async signUp(email, password)
    {
        try
        {
            await this.init();

            if (!this.supabaseClient)
            {
                return await this.createOfflineAccount(email);
            }

            return await this.supabaseClient.signUp(email, password);
        } catch (error)
        {
            // Fallback to offline mode on network errors
            if (errorHandler.isNetworkError(error))
            {
                this.logger.info('Network error, creating offline account');
                return await this.createOfflineAccount(email);
            }

            errorHandler.handleError(error, 'sign-up');
            throw error;
        }
    }

    async signOut()
    {
        try
        {
            if (this.supabaseClient)
            {
                await this.supabaseClient.signOut();
            }

            await storageManager.remove([
                STORAGE_KEYS.OFFLINE_MODE,
                STORAGE_KEYS.OFFLINE_EXPIRY,
                STORAGE_KEYS.OFFLINE_EMAIL
            ]);

            return { success: true };
        } catch (error)
        {
            errorHandler.handleError(error, 'sign-out');
            // Always succeed locally for sign out
            await storageManager.remove([
                STORAGE_KEYS.OFFLINE_MODE,
                STORAGE_KEYS.OFFLINE_EXPIRY,
                STORAGE_KEYS.OFFLINE_EMAIL
            ]);
            return { success: true };
        }
    }

    async syncToCloud()
    {
        try
        {
            if (!this.supabaseClient || !this.supabaseClient.isAuthenticated())
            {
                throw new Error('Cloud sync not available - sign in required');
            }
            return await this.supabaseClient.syncToCloud();
        } catch (error)
        {
            errorHandler.handleError(error, 'sync-to-cloud');
            throw error;
        }
    }

    async syncFromCloud()
    {
        try
        {
            if (!this.supabaseClient || !this.supabaseClient.isAuthenticated())
            {
                throw new Error('Cloud sync not available - sign in required');
            }
            return await this.supabaseClient.syncFromCloud();
        } catch (error)
        {
            errorHandler.handleError(error, 'sync-from-cloud');
            throw error;
        }
    }

    async enableOfflineMode(email)
    {
        try
        {
            const duration = 24 * 60 * 60 * 1000; // 24 hours
            const expiry = Date.now() + duration;

            await storageManager.set({
                [STORAGE_KEYS.OFFLINE_MODE]: true,
                [STORAGE_KEYS.OFFLINE_EXPIRY]: expiry,
                [STORAGE_KEYS.OFFLINE_EMAIL]: email
            });

            return {
                success: true,
                user: { email: email },
                isOfflineMode: true,
                message: 'Working in offline mode - your settings are saved locally'
            };
        } catch (error)
        {
            errorHandler.handleError(error, 'enable-offline-mode');
            throw error;
        }
    }

    async createOfflineAccount(email)
    {
        try
        {
            const duration = 24 * 60 * 60 * 1000; // 24 hours
            const expiry = Date.now() + duration;

            await storageManager.set({
                [STORAGE_KEYS.OFFLINE_MODE]: true,
                [STORAGE_KEYS.OFFLINE_EXPIRY]: expiry,
                [STORAGE_KEYS.OFFLINE_EMAIL]: email,
                accountCreated: new Date().toISOString()
            });

            return {
                success: true,
                user: { email: email },
                isOfflineMode: true,
                message: 'Account created locally - cloud sync will be available when connection is restored'
            };
        } catch (error)
        {
            errorHandler.handleError(error, 'create-offline-account');
            throw error;
        }
    }

    isCloudAvailable()
    {
        return !!this.supabaseClient;
    }

    getSupabaseClient()
    {
        return this.supabaseClient;
    }

    // Cleanup method
    destroy()
    {
        this.supabaseClient = null;
        this.isInitialized = false;
        this.logger.info('AuthManager destroyed');
    }
}

// Export singleton instance
export const authManager = new AuthManager();