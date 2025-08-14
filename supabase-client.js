// supabase-client.js - Updated with centralized config

class SupabaseClient
{
    constructor()
    {
        this.supabase = null;
        this.currentUser = null;
        this.isInitialized = false;
        this.syncInProgress = false;
        this.config = null;
    }

    async init()
    {
        if (this.isInitialized) return true;

        try
        {
            // Load configuration from config file
            await this.loadConfig();

            if (!this.config || !this.config.supabase.url || !this.config.supabase.anonKey)
            {
                console.error('❌ Supabase configuration missing in config file');
                return false;
            }

            // Import Supabase client from CDN
            await this.loadSupabaseSDK();

            this.supabase = window.supabase.createClient(
                this.config.supabase.url,
                this.config.supabase.anonKey
            );

            // Check current session
            const { data: { session } } = await this.supabase.auth.getSession();
            this.currentUser = session?.user || null;

            this.isInitialized = true;
            console.log('✅ Supabase initialized successfully with centralized config');
            console.log('🌐 Connected to:', this.config.supabase.projectName);
            return true;
        } catch (error)
        {
            console.error('❌ Failed to initialize Supabase:', error);
            return false;
        }
    }

    async loadConfig()
    {
        try
        {
            // Try to fetch from extension directory
            const configUrl = chrome.runtime.getURL('config.json');
            const response = await fetch(configUrl);

            if (!response.ok)
            {
                throw new Error(`Config file not found: ${response.status}`);
            }

            this.config = await response.json();
            console.log('📋 Loaded Supabase config:', this.config.supabase.projectName);

            // Validate required fields
            if (!this.config.supabase.url || !this.config.supabase.anonKey)
            {
                throw new Error('Invalid config: missing Supabase URL or anon key');
            }

            return this.config;
        } catch (error)
        {
            console.error('❌ Failed to load config:', error);

            // Fallback: check if config is stored in local storage (for development)
            try
            {
                const stored = await chrome.storage.local.get(['supabaseConfig']);
                if (stored.supabaseConfig)
                {
                    this.config = stored.supabaseConfig;
                    console.log('📋 Using stored config as fallback');
                    return this.config;
                }
            } catch (fallbackError)
            {
                console.error('❌ Fallback config also failed:', fallbackError);
            }

            throw error;
        }
    }

    async loadSupabaseSDK()
    {
        return new Promise((resolve, reject) =>
        {
            if (window.supabase)
            {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/supabase/2.38.0/umd/supabase.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async signUp(email, password)
    {
        if (!this.isInitialized)
        {
            throw new Error('Supabase not initialized');
        }

        try
        {
            console.log('🔐 Creating new user account...');

            const { data, error } = await this.supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        app_name: this.config.app.name,
                        version: this.config.app.version,
                        registration_source: 'fokus_extension'
                    }
                }
            });

            if (error) throw error;

            this.currentUser = data.user;

            // Create user profile with app metadata
            if (data.user)
            {
                await this.createUserProfile(data.user);
            }

            console.log('✅ User account created successfully');
            return { success: true, user: data.user, needsConfirmation: !data.session };
        } catch (error)
        {
            console.error('❌ Sign up error:', error);
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
            console.log('🔐 Signing in user...');

            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            this.currentUser = data.user;

            // Update last login time
            await this.updateUserProfile(data.user.id, {
                last_login: new Date().toISOString(),
                app_version: this.config.app.version
            });

            // Sync settings after login
            console.log('📥 Syncing settings from cloud...');
            await this.syncFromCloud();

            console.log('✅ User signed in successfully');
            return { success: true, user: data.user };
        } catch (error)
        {
            console.error('❌ Sign in error:', error);
            throw error;
        }
    }

    async signOut()
    {
        if (!this.isInitialized) return { success: true };

        try
        {
            console.log('🚪 Signing out user...');

            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;

            this.currentUser = null;
            console.log('✅ User signed out successfully');
            return { success: true };
        } catch (error)
        {
            console.error('❌ Sign out error:', error);
            throw error;
        }
    }

    async createUserProfile(user)
    {
        try
        {
            const { error } = await this.supabase
                .from('user_profiles')
                .insert({
                    id: user.id,
                    email: user.email,
                    created_at: new Date().toISOString(),
                    last_sync: new Date().toISOString(),
                    app_version: this.config.app.version,
                    registration_source: 'fokus_extension'
                });

            if (error && error.code !== '23505')
            { // Ignore duplicate key error
                throw error;
            }

            console.log('✅ User profile created');
        } catch (error)
        {
            console.error('❌ Failed to create user profile:', error);
        }
    }

    async updateUserProfile(userId, updates)
    {
        try
        {
            const { error } = await this.supabase
                .from('user_profiles')
                .update(updates)
                .eq('id', userId);

            if (error) throw error;

            console.log('✅ User profile updated');
        } catch (error)
        {
            console.error('❌ Failed to update user profile:', error);
        }
    }

    async syncToCloud()
    {
        if (!this.currentUser || this.syncInProgress)
        {
            console.log('⏸️ Sync skipped - no user or sync in progress');
            return { success: false, reason: 'No user or sync in progress' };
        }

        this.syncInProgress = true;

        try
        {
            console.log('📤 Starting sync to cloud...');

            // Get all local settings (excluding PIN)
            const localData = await chrome.storage.local.get([
                'blockedKeywords',
                'customDomains',
                'blocklistUrls',
                'isActive',
                'blocksToday',
                'focusStreak',
                'totalBlocks',
                'lastGithubUpdate'
            ]);

            // Prepare sync data
            const syncData = {
                user_id: this.currentUser.id,
                settings: {
                    blockedKeywords: localData.blockedKeywords || [],
                    customDomains: localData.customDomains || [],
                    blocklistUrls: localData.blocklistUrls || [],
                    isActive: localData.isActive !== undefined ? localData.isActive : true,
                    lastGithubUpdate: localData.lastGithubUpdate || 0
                },
                stats: {
                    blocksToday: localData.blocksToday || 0,
                    focusStreak: localData.focusStreak || 0,
                    totalBlocks: localData.totalBlocks || 0
                },
                device_info: {
                    browser: this.getBrowserInfo(),
                    app_version: this.config.app.version,
                    last_sync: new Date().toISOString(),
                    sync_source: 'manual_upload'
                },
                updated_at: new Date().toISOString()
            };

            // Upsert to cloud
            const { error } = await this.supabase
                .from('user_settings')
                .upsert(syncData, {
                    onConflict: 'user_id',
                    ignoreDuplicates: false
                });

            if (error) throw error;

            // Update last sync time locally
            await chrome.storage.local.set({
                lastCloudSync: new Date().toISOString(),
                lastSyncDirection: 'upload'
            });

            // Log sync activity
            await this.logSyncActivity('upload', 'success', {
                settings_count: Object.keys(syncData.settings).length,
                data_size: JSON.stringify(syncData).length
            });

            console.log('✅ Sync to cloud completed successfully');
            return { success: true, action: 'uploaded', timestamp: new Date().toISOString() };

        } catch (error)
        {
            console.error('❌ Sync to cloud failed:', error);

            // Log failed sync
            await this.logSyncActivity('upload', 'error', {
                error_message: error.message
            });

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
            console.log('📥 Starting sync from cloud...');

            const { data, error } = await this.supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .single();

            if (error)
            {
                if (error.code === 'PGRST116')
                {
                    // No data found, this is first sync
                    console.log('📤 No cloud data found, uploading local settings...');
                    const result = await this.syncToCloud();
                    return { success: true, action: 'uploaded_first_time', ...result };
                }
                throw error;
            }

            if (!data)
            {
                console.log('📭 No cloud settings found');
                return { success: true, action: 'no_data' };
            }

            // Get local last sync time
            const localData = await chrome.storage.local.get(['lastCloudSync']);
            const localLastSync = localData.lastCloudSync ? new Date(localData.lastCloudSync) : new Date(0);
            const cloudLastSync = new Date(data.updated_at);

            // Only sync if cloud data is newer
            if (cloudLastSync <= localLastSync)
            {
                console.log('✅ Local data is up to date');
                return { success: true, action: 'up_to_date' };
            }

            // Preserve local PIN and sensitive data
            const currentSensitive = await chrome.storage.local.get(['pin']);

            // Apply cloud settings to local storage
            const settingsToUpdate = {
                ...data.settings,
                pin: currentSensitive.pin || '1234', // Keep local PIN
                lastCloudSync: new Date().toISOString(),
                lastSyncDirection: 'download'
            };

            // Also sync stats if they're higher in cloud
            if (data.stats)
            {
                const localStats = await chrome.storage.local.get(['blocksToday', 'focusStreak', 'totalBlocks']);
                settingsToUpdate.blocksToday = Math.max(localStats.blocksToday || 0, data.stats.blocksToday || 0);
                settingsToUpdate.focusStreak = Math.max(localStats.focusStreak || 0, data.stats.focusStreak || 0);
                settingsToUpdate.totalBlocks = Math.max(localStats.totalBlocks || 0, data.stats.totalBlocks || 0);
            }

            await chrome.storage.local.set(settingsToUpdate);

            // Log sync activity
            await this.logSyncActivity('download', 'success', {
                settings_count: Object.keys(data.settings).length,
                cloud_updated: cloudLastSync.toISOString()
            });

            console.log('✅ Sync from cloud completed successfully');
            return { success: true, action: 'downloaded', timestamp: cloudLastSync.toISOString() };

        } catch (error)
        {
            console.error('❌ Sync from cloud failed:', error);

            // Log failed sync
            await this.logSyncActivity('download', 'error', {
                error_message: error.message
            });

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
            console.log('💾 Creating cloud backup...');

            // Get current settings (excluding PIN)
            const localData = await chrome.storage.local.get([
                'blockedKeywords',
                'customDomains',
                'blocklistUrls',
                'isActive',
                'blocksToday',
                'focusStreak',
                'totalBlocks'
            ]);

            const backupData = {
                user_id: this.currentUser.id,
                name: name || `Backup ${new Date().toLocaleDateString()}`,
                settings: {
                    blockedKeywords: localData.blockedKeywords || [],
                    customDomains: localData.customDomains || [],
                    blocklistUrls: localData.blocklistUrls || [],
                    isActive: localData.isActive !== undefined ? localData.isActive : true
                },
                stats: {
                    blocksToday: localData.blocksToday || 0,
                    focusStreak: localData.focusStreak || 0,
                    totalBlocks: localData.totalBlocks || 0
                },
                device_info: {
                    browser: this.getBrowserInfo(),
                    app_version: this.config.app.version,
                    backup_source: 'manual'
                },
                created_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('user_backups')
                .insert(backupData)
                .select()
                .single();

            if (error) throw error;

            // Log backup creation
            await this.logSyncActivity('backup', 'success', {
                backup_id: data.id,
                backup_name: name,
                settings_count: Object.keys(backupData.settings).length
            });

            console.log('✅ Cloud backup created successfully');
            return data;
        } catch (error)
        {
            console.error('❌ Failed to create backup:', error);

            // Log failed backup
            await this.logSyncActivity('backup', 'error', {
                backup_name: name,
                error_message: error.message
            });

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
            const { data, error } = await this.supabase
                .from('user_backups')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false })
                .limit(this.config.features.maxBackups || 50);

            if (error) throw error;

            return data || [];
        } catch (error)
        {
            console.error('❌ Failed to get cloud backups:', error);
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
            console.log('♻️ Restoring backup...');

            const { data, error } = await this.supabase
                .from('user_backups')
                .select('*')
                .eq('id', backupId)
                .eq('user_id', this.currentUser.id)
                .single();

            if (error) throw error;

            if (!data)
            {
                throw new Error('Backup not found');
            }

            // Preserve local PIN
            const currentPin = await chrome.storage.local.get(['pin']);

            // Restore settings
            const settingsToRestore = {
                ...data.settings,
                pin: currentPin.pin || '1234',
                lastCloudSync: new Date().toISOString(),
                lastRestoreDate: new Date().toISOString(),
                restoredFromBackup: data.name
            };

            // Also restore stats
            if (data.stats)
            {
                Object.assign(settingsToRestore, data.stats);
            }

            await chrome.storage.local.set(settingsToRestore);

            // Sync to cloud after restore
            await this.syncToCloud();

            // Log restore activity
            await this.logSyncActivity('restore', 'success', {
                backup_id: backupId,
                backup_name: data.name,
                backup_date: data.created_at
            });

            console.log('✅ Backup restored successfully');
            return { success: true };
        } catch (error)
        {
            console.error('❌ Failed to restore backup:', error);

            // Log failed restore
            await this.logSyncActivity('restore', 'error', {
                backup_id: backupId,
                error_message: error.message
            });

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
            const { error } = await this.supabase
                .from('user_backups')
                .delete()
                .eq('id', backupId)
                .eq('user_id', this.currentUser.id);

            if (error) throw error;

            console.log('✅ Backup deleted successfully');
            return { success: true };
        } catch (error)
        {
            console.error('❌ Failed to delete backup:', error);
            throw error;
        }
    }

    async logSyncActivity(action, status, details = {})
    {
        if (!this.currentUser) return;

        try
        {
            await this.supabase
                .from('sync_logs')
                .insert({
                    user_id: this.currentUser.id,
                    action,
                    status,
                    details: {
                        ...details,
                        app_version: this.config.app.version,
                        browser: this.getBrowserInfo(),
                        timestamp: new Date().toISOString()
                    },
                    created_at: new Date().toISOString()
                });
        } catch (error)
        {
            console.error('❌ Failed to log sync activity:', error);
        }
    }

    async setupAutoSync()
    {
        if (!this.currentUser || !this.config.features.autoSync) return;

        const syncInterval = this.config.features.defaultSyncInterval || 300000; // 5 minutes

        console.log(`🔄 Setting up auto-sync every ${syncInterval / 1000} seconds`);

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
                console.error('❌ Auto-sync failed:', error);
            }
        }, syncInterval);

        // Sync when settings change
        chrome.storage.onChanged.addListener(async (changes, namespace) =>
        {
            if (namespace === 'local' && this.currentUser && !changes.lastCloudSync)
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
                        console.error('❌ Change-triggered sync failed:', error);
                    }
                }, 2000); // 2 second delay
            }
        });
    }

    getBrowserInfo()
    {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        return 'Unknown';
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
            const { error } = await this.supabase
                .from('user_profiles')
                .select('id')
                .eq('id', this.currentUser.id)
                .limit(1);

            if (error)
            {
                return { connected: false, reason: error.message };
            }

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
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports)
{
    module.exports = SupabaseClient;
} else
{
    window.SupabaseClient = SupabaseClient;
}