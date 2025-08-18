// src/services/supabase-client.js - Supabase cloud sync client
import { Logger } from '../shared/logger.js';
import { Utils } from '../shared/utils.js';
import { STORAGE_KEYS, TIMEOUTS } from '../shared/constants.js';

export class SupabaseClient
{
    constructor()
    {
        this.logger = new Logger('SupabaseClient');
        this.supabaseUrl = null;
        this.supabaseKey = null;
        this.headers = {};
        this.currentUser = null;
        this.isInitialized = false;
        this.syncInProgress = false;
        this.config = null;
        this.syncTimeout = null;
    }

    async init()
    {
        if (this.isInitialized) return true;

        try
        {
            await this.loadConfig();

            if (!this.config || !this.config.supabase.url || !this.config.supabase.anonKey)
            {
                this.logger.warn('Supabase configuration missing');
                return false;
            }

            this.supabaseUrl = this.config.supabase.url;
            this.supabaseKey = this.config.supabase.anonKey;
            this.headers = {
                'apikey': this.supabaseKey,
                'Authorization': `Bearer ${this.supabaseKey}`,
                'Content-Type': 'application/json'
            };

            // Check for stored session
            const storedSession = await this.getStoredSession();
            if (storedSession && storedSession.access_token)
            {
                this.currentUser = storedSession.user;
                this.headers['Authorization'] = `Bearer ${storedSession.access_token}`;
            }

            this.isInitialized = true;
            this.logger.info('Supabase client initialized successfully');
            return true;
        } catch (error)
        {
            this.logger.error('Failed to initialize Supabase client:', error);
            return false;
        }
    }

    async loadConfig()
    {
        try
        {
            const configUrl = chrome.runtime.getURL('config/config.json');
            const response = await fetch(configUrl);

            if (!response.ok)
            {
                throw new Error(`Config file not found: ${response.status}`);
            }

            this.config = await response.json();
            this.logger.debug('Loaded Supabase config');

            if (!this.config.supabase.url || !this.config.supabase.anonKey)
            {
                throw new Error('Invalid config: missing Supabase URL or anon key');
            }

            return this.config;
        } catch (error)
        {
            this.logger.error('Failed to load config:', error);

            // Fallback: check local storage
            try
            {
                const stored = await chrome.storage.local.get(['supabaseConfig']);
                if (stored.supabaseConfig)
                {
                    this.config = stored.supabaseConfig;
                    this.logger.info('Using stored config as fallback');
                    return this.config;
                }
            } catch (fallbackError)
            {
                this.logger.error('Fallback config also failed:', fallbackError);
            }

            throw error;
        }
    }

    async makeRequest(method, endpoint, body = null)
    {
        const url = `${this.supabaseUrl}/rest/v1/${endpoint}`;
        const options = {
            method,
            headers: { ...this.headers },
            signal: Utils.createAbortSignal(TIMEOUTS.FETCH_TIMEOUT)
        };

        if (body)
        {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (!response.ok)
        {
            const error = await response.text();
            throw new Error(`Supabase request failed: ${response.status} - ${error}`);
        }

        return response.json();
    }

    async signUp(email, password)
    {
        if (!this.isInitialized)
        {
            throw new Error('Supabase not initialized');
        }

        try
        {
            this.logger.info('Creating new user account...');

            const response = await fetch(`${this.supabaseUrl}/auth/v1/signup`, {
                method: 'POST',
                headers: {
                    'apikey': this.supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email,
                    password,
                    data: {
                        app_name: this.config.app.name,
                        version: this.config.app.version,
                        registration_source: 'fokus_extension'
                    }
                }),
                signal: Utils.createAbortSignal(TIMEOUTS.FETCH_TIMEOUT)
            });

            const data = await response.json();

            if (!response.ok)
            {
                throw new Error(data.msg || data.message || 'Sign up failed');
            }

            if (data.user)
            {
                this.currentUser = data.user;

                if (data.session)
                {
                    await this.storeSession(data.session);
                    this.headers['Authorization'] = `Bearer ${data.session.access_token}`;
                }

                await this.createUserProfile(data.user);
            }

            this.logger.info('User account created successfully');
            return {
                success: true,
                user: data.user,
                needsConfirmation: !data.session
            };
        } catch (error)
        {
            this.logger.error('Sign up error:', error);
            throw error;
        }
    }

    async signIn(email, password)
    {
        if (!this.isInitialized)
        {
            throw new Error('Supabase not initialized');
        }

        try
        {
            this.logger.info('Signing in user...');

            const response = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {
                    'apikey': this.supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password }),
                signal: Utils.createAbortSignal(TIMEOUTS.FETCH_TIMEOUT)
            });

            const data = await response.json();

            if (!response.ok)
            {
                throw new Error(data.msg || data.message || 'Invalid credentials');
            }

            this.currentUser = data.user;

            if (data.session || data.access_token)
            {
                const session = data.session || data;
                await this.storeSession(session);
                this.headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            await this.updateUserProfile(data.user.id, {
                last_login: new Date().toISOString(),
                app_version: this.config.app.version
            });

            this.logger.info('User signed in successfully');
            return { success: true, user: data.user };
        } catch (error)
        {
            this.logger.error('Sign in error:', error);
            throw error;
        }
    }

    async signOut()
    {
        if (!this.isInitialized) return { success: true };

        try
        {
            this.logger.info('Signing out user...');

            if (this.currentUser)
            {
                await fetch(`${this.supabaseUrl}/auth/v1/logout`, {
                    method: 'POST',
                    headers: this.headers,
                    signal: Utils.createAbortSignal(TIMEOUTS.FETCH_TIMEOUT)
                });
            }

            this.currentUser = null;
            this.headers['Authorization'] = `Bearer ${this.supabaseKey}`;
            await this.clearStoredSession();

            this.logger.info('User signed out successfully');
            return { success: true };
        } catch (error)
        {
            this.logger.error('Sign out error:', error);
            // Don't throw error for sign out - always succeed locally
            this.currentUser = null;
            this.headers['Authorization'] = `Bearer ${this.supabaseKey}`;
            await this.clearStoredSession();
            return { success: true };
        }
    }

    async createUserProfile(user)
    {
        try
        {
            await this.makeRequest('POST', 'user_profiles', {
                id: user.id,
                email: user.email,
                created_at: new Date().toISOString(),
                last_sync: new Date().toISOString(),
                app_version: this.config.app.version,
                registration_source: 'fokus_extension'
            });

            this.logger.info('User profile created');
        } catch (error)
        {
            // Ignore duplicate key errors
            if (!error.message.includes('duplicate') && !error.message.includes('23505'))
            {
                this.logger.error('Failed to create user profile:', error);
            }
        }
    }

    async updateUserProfile(userId, updates)
    {
        try
        {
            await this.makeRequest('PATCH', `user_profiles?id=eq.${userId}`, updates);
            this.logger.debug('User profile updated');
        } catch (error)
        {
            this.logger.error('Failed to update user profile:', error);
        }
    }

    async syncToCloud()
    {
        if (!this.currentUser || this.syncInProgress)
        {
            this.logger.warn('Sync skipped - no user or sync in progress');
            return { success: false, reason: 'No user or sync in progress' };
        }

        this.syncInProgress = true;

        try
        {
            this.logger.info('Starting sync to cloud...');

            // Get all local settings (excluding PIN)
            const localData = await chrome.storage.local.get([
                STORAGE_KEYS.BLOCKED_KEYWORDS,
                STORAGE_KEYS.CUSTOM_DOMAINS,
                STORAGE_KEYS.BLOCKLIST_SOURCES,
                STORAGE_KEYS.IS_ACTIVE,
                STORAGE_KEYS.BLOCKS_TODAY,
                STORAGE_KEYS.FOCUS_STREAK,
                STORAGE_KEYS.TOTAL_BLOCKS,
                'lastGithubUpdate'
            ]);

            // Prepare sync data
            const syncData = {
                user_id: this.currentUser.id,
                settings: {
                    blockedKeywords: localData[STORAGE_KEYS.BLOCKED_KEYWORDS] || [],
                    customDomains: localData[STORAGE_KEYS.CUSTOM_DOMAINS] || [],
                    blocklistSources: localData[STORAGE_KEYS.BLOCKLIST_SOURCES] || [],
                    isActive: localData[STORAGE_KEYS.IS_ACTIVE] !== undefined ? localData[STORAGE_KEYS.IS_ACTIVE] : true,
                    lastGithubUpdate: localData.lastGithubUpdate || 0
                },
                stats: {
                    blocksToday: localData[STORAGE_KEYS.BLOCKS_TODAY] || 0,
                    focusStreak: localData[STORAGE_KEYS.FOCUS_STREAK] || 0,
                    totalBlocks: localData[STORAGE_KEYS.TOTAL_BLOCKS] || 0
                },
                device_info: {
                    browser: Utils.getBrowserInfo(),
                    app_version: this.config.app.version,
                    last_sync: new Date().toISOString(),
                    sync_source: 'manual_upload'
                },
                updated_at: new Date().toISOString()
            };

            // Upsert to cloud
            await this.makeRequest('POST', 'user_settings', syncData);

            // Update last sync time locally
            await chrome.storage.local.set({
                [STORAGE_KEYS.LAST_CLOUD_SYNC]: new Date().toISOString(),
                lastSyncDirection: 'upload'
            });

            this.logger.info('Sync to cloud completed successfully');
            return { success: true, action: 'uploaded', timestamp: new Date().toISOString() };

        } catch (error)
        {
            this.logger.error('Sync to cloud failed:', error);
            throw error;
        } finally
        {
            this.syncInProgress = false;
        }
    }

    async syncFromCloud()
    {
        if (!this.currentUser || this.syncInProgress)
        {
            return { success: false, reason: 'No user or sync in progress' };
        }

        this.syncInProgress = true;

        try
        {
            this.logger.info('Starting sync from cloud...');

            const data = await this.makeRequest('GET', `user_settings?user_id=eq.${this.currentUser.id}&limit=1`);

            if (!data || data.length === 0)
            {
                this.logger.info('No cloud data found, uploading local settings...');
                const result = await this.syncToCloud();
                return { success: true, action: 'uploaded_first_time', ...result };
            }

            const cloudData = data[0];

            // Get local last sync time
            const localData = await chrome.storage.local.get([STORAGE_KEYS.LAST_CLOUD_SYNC]);
            const localLastSync = localData[STORAGE_KEYS.LAST_CLOUD_SYNC] ? new Date(localData[STORAGE_KEYS.LAST_CLOUD_SYNC]) : new Date(0);
            const cloudLastSync = new Date(cloudData.updated_at);

            // Only sync if cloud data is newer
            if (cloudLastSync <= localLastSync)
            {
                this.logger.info('Local data is up to date');
                return { success: true, action: 'up_to_date' };
            }

            // Preserve local PIN and sensitive data
            const currentSensitive = await chrome.storage.local.get([STORAGE_KEYS.PIN]);

            // Apply cloud settings to local storage
            const settingsToUpdate = {
                ...cloudData.settings,
                [STORAGE_KEYS.PIN]: currentSensitive[STORAGE_KEYS.PIN] || '1234',
                [STORAGE_KEYS.LAST_CLOUD_SYNC]: new Date().toISOString(),
                lastSyncDirection: 'download'
            };

            // Also sync stats if they're higher in cloud
            if (cloudData.stats)
            {
                const localStats = await chrome.storage.local.get([
                    STORAGE_KEYS.BLOCKS_TODAY,
                    STORAGE_KEYS.FOCUS_STREAK,
                    STORAGE_KEYS.TOTAL_BLOCKS
                ]);
                settingsToUpdate[STORAGE_KEYS.BLOCKS_TODAY] = Math.max(localStats[STORAGE_KEYS.BLOCKS_TODAY] || 0, cloudData.stats.blocksToday || 0);
                settingsToUpdate[STORAGE_KEYS.FOCUS_STREAK] = Math.max(localStats[STORAGE_KEYS.FOCUS_STREAK] || 0, cloudData.stats.focusStreak || 0);
                settingsToUpdate[STORAGE_KEYS.TOTAL_BLOCKS] = Math.max(localStats[STORAGE_KEYS.TOTAL_BLOCKS] || 0, cloudData.stats.totalBlocks || 0);
            }

            await chrome.storage.local.set(settingsToUpdate);

            this.logger.info('Sync from cloud completed successfully');
            return { success: true, action: 'downloaded', timestamp: cloudLastSync.toISOString() };

        } catch (error)
        {
            this.logger.error('Sync from cloud failed:', error);
            throw error;
        } finally
        {
            this.syncInProgress = false;
        }
    }

    async createBackup(name)
    {
        if (!this.currentUser)
        {
            throw new Error('User not authenticated');
        }

        try
        {
            this.logger.info('Creating cloud backup...');

            // Get current settings (excluding PIN)
            const localData = await chrome.storage.local.get([
                STORAGE_KEYS.BLOCKED_KEYWORDS,
                STORAGE_KEYS.CUSTOM_DOMAINS,
                STORAGE_KEYS.BLOCKLIST_SOURCES,
                STORAGE_KEYS.IS_ACTIVE,
                STORAGE_KEYS.BLOCKS_TODAY,
                STORAGE_KEYS.FOCUS_STREAK,
                STORAGE_KEYS.TOTAL_BLOCKS
            ]);

            const backupData = {
                user_id: this.currentUser.id,
                name: name || `Backup ${new Date().toLocaleDateString()}`,
                settings: {
                    blockedKeywords: localData[STORAGE_KEYS.BLOCKED_KEYWORDS] || [],
                    customDomains: localData[STORAGE_KEYS.CUSTOM_DOMAINS] || [],
                    blocklistSources: localData[STORAGE_KEYS.BLOCKLIST_SOURCES] || [],
                    isActive: localData[STORAGE_KEYS.IS_ACTIVE] !== undefined ? localData[STORAGE_KEYS.IS_ACTIVE] : true
                },
                stats: {
                    blocksToday: localData[STORAGE_KEYS.BLOCKS_TODAY] || 0,
                    focusStreak: localData[STORAGE_KEYS.FOCUS_STREAK] || 0,
                    totalBlocks: localData[STORAGE_KEYS.TOTAL_BLOCKS] || 0
                },
                device_info: {
                    browser: Utils.getBrowserInfo(),
                    app_version: this.config.app.version,
                    backup_source: 'manual'
                },
                created_at: new Date().toISOString()
            };

            const result = await this.makeRequest('POST', 'user_backups', backupData);

            this.logger.info('Cloud backup created successfully');
            return result[0] || result;
        } catch (error)
        {
            this.logger.error('Failed to create backup:', error);
            throw error;
        }
    }

    async getCloudBackups()
    {
        if (!this.currentUser)
        {
            throw new Error('User not authenticated');
        }

        try
        {
            const data = await this.makeRequest('GET',
                `user_backups?user_id=eq.${this.currentUser.id}&order=created_at.desc&limit=${this.config.features.maxBackups || 50}`
            );

            return data || [];
        } catch (error)
        {
            this.logger.error('Failed to get cloud backups:', error);
            throw error;
        }
    }

    async restoreBackup(backupId)
    {
        if (!this.currentUser)
        {
            throw new Error('User not authenticated');
        }

        try
        {
            this.logger.info('Restoring backup...');

            const data = await this.makeRequest('GET', `user_backups?id=eq.${backupId}&user_id=eq.${this.currentUser.id}&limit=1`);

            if (!data || data.length === 0)
            {
                throw new Error('Backup not found');
            }

            const backup = data[0];

            // Preserve local PIN
            const currentPin = await chrome.storage.local.get([STORAGE_KEYS.PIN]);

            // Restore settings
            const settingsToRestore = {
                ...backup.settings,
                [STORAGE_KEYS.PIN]: currentPin[STORAGE_KEYS.PIN] || '1234',
                [STORAGE_KEYS.LAST_CLOUD_SYNC]: new Date().toISOString(),
                lastRestoreDate: new Date().toISOString(),
                restoredFromBackup: backup.name
            };

            // Also restore stats
            if (backup.stats)
            {
                Object.assign(settingsToRestore, backup.stats);
            }

            await chrome.storage.local.set(settingsToRestore);

            // Sync to cloud after restore
            await this.syncToCloud();

            this.logger.info('Backup restored successfully');
            return { success: true };
        } catch (error)
        {
            this.logger.error('Failed to restore backup:', error);
            throw error;
        }
    }

    async deleteBackup(backupId)
    {
        if (!this.currentUser)
        {
            throw new Error('User not authenticated');
        }

        try
        {
            await this.makeRequest('DELETE', `user_backups?id=eq.${backupId}&user_id=eq.${this.currentUser.id}`);
            this.logger.info('Backup deleted successfully');
            return { success: true };
        } catch (error)
        {
            this.logger.error('Failed to delete backup:', error);
            throw error;
        }
    }

    async setupAutoSync()
    {
        if (!this.currentUser || !this.config.features.autoSync) return;

        const syncInterval = this.config.features.defaultSyncInterval || 300000; // 5 minutes

        this.logger.info(`Setting up auto-sync every ${syncInterval / 1000} seconds`);

        // Sync every interval when user is active
        setInterval(async () =>
        {
            try
            {
                if (this.currentUser && !this.syncInProgress)
                {
                    await this.syncToCloud();
                }
            } catch (error)
            {
                this.logger.error('Auto-sync failed:', error);
            }
        }, syncInterval);

        // Sync when settings change
        chrome.storage.onChanged.addListener(async (changes, namespace) =>
        {
            if (namespace === 'local' && this.currentUser && !changes[STORAGE_KEYS.LAST_CLOUD_SYNC])
            {
                // Debounce sync to avoid too frequent syncs
                clearTimeout(this.syncTimeout);
                this.syncTimeout = setTimeout(async () =>
                {
                    try
                    {
                        await this.syncToCloud();
                    } catch (error)
                    {
                        this.logger.error('Change-triggered sync failed:', error);
                    }
                }, TIMEOUTS.SYNC_DEBOUNCE);
            }
        });
    }

    // Session management
    async storeSession(session)
    {
        await chrome.storage.local.set({
            [STORAGE_KEYS.SUPABASE_SESSION]: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                user: session.user,
                expires_at: session.expires_at
            }
        });
    }

    async getStoredSession()
    {
        const data = await chrome.storage.local.get([STORAGE_KEYS.SUPABASE_SESSION]);
        return data[STORAGE_KEYS.SUPABASE_SESSION];
    }

    async clearStoredSession()
    {
        await chrome.storage.local.remove([STORAGE_KEYS.SUPABASE_SESSION]);
    }

    isAuthenticated()
    {
        return !!this.currentUser;
    }

    getCurrentUser()
    {
        return this.currentUser;
    }

    getConfig()
    {
        return this.config;
    }

    async getConnectionStatus()
    {
        if (!this.isInitialized)
        {
            return { connected: false, reason: 'Not initialized' };
        }

        if (!this.currentUser)
        {
            return { connected: false, reason: 'Not authenticated' };
        }

        try
        {
            // Test connection with a simple query
            await this.makeRequest('GET', `user_profiles?id=eq.${this.currentUser.id}&limit=1`);

            return {
                connected: true,
                project: this.config.supabase.projectName,
                region: this.config.supabase.region
            };
        } catch (error)
        {
            return { connected: false, reason: error.message };
        }
    }

    // Cleanup method
    destroy()
    {
        if (this.syncTimeout)
        {
            clearTimeout(this.syncTimeout);
            this.syncTimeout = null;
        }

        this.currentUser = null;
        this.isInitialized = false;
        this.syncInProgress = false;
        this.logger.info('SupabaseClient destroyed');
    }
}

// Export for use in other scripts
export default SupabaseClient;