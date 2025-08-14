// supabase-client.js - Updated without external CDN dependency

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

            // Use a simple HTTP client instead of the full Supabase SDK
            this.supabaseUrl = this.config.supabase.url;
            this.supabaseKey = this.config.supabase.anonKey;
            this.headers = {
                'apikey': this.supabaseKey,
                'Authorization': `Bearer ${this.supabaseKey}`,
                'Content-Type': 'application/json'
            };

            // Check if we have a stored session
            const storedSession = await this.getStoredSession();
            if (storedSession && storedSession.access_token)
            {
                this.currentUser = storedSession.user;
                this.headers['Authorization'] = `Bearer ${storedSession.access_token}`;
            }

            this.isInitialized = true;
            console.log('✅ Supabase client initialized successfully (HTTP-only mode)');
            console.log('🌐 Connected to:', this.config.supabase.projectName);
            return true;
        } catch (error)
        {
            console.error('❌ Failed to initialize Supabase client:', error);
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

    async makeRequest(method, endpoint, body = null)
    {
        const url = `${this.supabaseUrl}/rest/v1/${endpoint}`;
        const options = {
            method,
            headers: { ...this.headers }
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
            console.log('🔐 Creating new user account...');

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
                })
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

                // Create user profile
                await this.createUserProfile(data.user);
            }

            console.log('✅ User account created successfully');
            return {
                success: true,
                user: data.user,
                needsConfirmation: !data.session
            };
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

            const response = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {
                    'apikey': this.supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email,
                    password
                })
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

            // Update last login time
            await this.updateUserProfile(data.user.id, {
                last_login: new Date().toISOString(),
                app_version: this.config.app.version
            });

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

            if (this.currentUser)
            {
                await fetch(`${this.supabaseUrl}/auth/v1/logout`, {
                    method: 'POST',
                    headers: this.headers
                });
            }

            this.currentUser = null;
            this.headers['Authorization'] = `Bearer ${this.supabaseKey}`;
            await this.clearStoredSession();

            console.log('✅ User signed out successfully');
            return { success: true };
        } catch (error)
        {
            console.error('❌ Sign out error:', error);
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

            console.log('✅ User profile created');
        } catch (error)
        {
            // Ignore duplicate key errors
            if (!error.message.includes('duplicate') && !error.message.includes('23505'))
            {
                console.error('❌ Failed to create user profile:', error);
            }
        }
    }

    async updateUserProfile(userId, updates)
    {
        try
        {
            await this.makeRequest('PATCH', `user_profiles?id=eq.${userId}`, updates);
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
            await this.makeRequest('POST', 'user_settings', syncData);

            // Update last sync time locally
            await chrome.storage.local.set({
                lastCloudSync: new Date().toISOString(),
                lastSyncDirection: 'upload'
            });

            console.log('✅ Sync to cloud completed successfully');
            return { success: true, action: 'uploaded', timestamp: new Date().toISOString() };

        } catch (error)
        {
            console.error('❌ Sync to cloud failed:', error);
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

            const data = await this.makeRequest('GET', `user_settings?user_id=eq.${this.currentUser.id}&limit=1`);

            if (!data || data.length === 0)
            {
                // No data found, this is first sync
                console.log('📤 No cloud data found, uploading local settings...');
                const result = await this.syncToCloud();
                return { success: true, action: 'uploaded_first_time', ...result };
            }

            const cloudData = data[0];

            // Get local last sync time
            const localData = await chrome.storage.local.get(['lastCloudSync']);
            const localLastSync = localData.lastCloudSync ? new Date(localData.lastCloudSync) : new Date(0);
            const cloudLastSync = new Date(cloudData.updated_at);

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
                ...cloudData.settings,
                pin: currentSensitive.pin || '1234', // Keep local PIN
                lastCloudSync: new Date().toISOString(),
                lastSyncDirection: 'download'
            };

            // Also sync stats if they're higher in cloud
            if (cloudData.stats)
            {
                const localStats = await chrome.storage.local.get(['blocksToday', 'focusStreak', 'totalBlocks']);
                settingsToUpdate.blocksToday = Math.max(localStats.blocksToday || 0, cloudData.stats.blocksToday || 0);
                settingsToUpdate.focusStreak = Math.max(localStats.focusStreak || 0, cloudData.stats.focusStreak || 0);
                settingsToUpdate.totalBlocks = Math.max(localStats.totalBlocks || 0, cloudData.stats.totalBlocks || 0);
            }

            await chrome.storage.local.set(settingsToUpdate);

            console.log('✅ Sync from cloud completed successfully');
            return { success: true, action: 'downloaded', timestamp: cloudLastSync.toISOString() };

        } catch (error)
        {
            console.error('❌ Sync from cloud failed:', error);
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

            const result = await this.makeRequest('POST', 'user_backups', backupData);

            console.log('✅ Cloud backup created successfully');
            return result[0] || result;
        } catch (error)
        {
            console.error('❌ Failed to create backup:', error);
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

            const data = await this.makeRequest('GET', `user_backups?id=eq.${backupId}&user_id=eq.${this.currentUser.id}&limit=1`);

            if (!data || data.length === 0)
            {
                throw new Error('Backup not found');
            }

            const backup = data[0];

            // Preserve local PIN
            const currentPin = await chrome.storage.local.get(['pin']);

            // Restore settings
            const settingsToRestore = {
                ...backup.settings,
                pin: currentPin.pin || '1234',
                lastCloudSync: new Date().toISOString(),
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

            console.log('✅ Backup restored successfully');
            return { success: true };
        } catch (error)
        {
            console.error('❌ Failed to restore backup:', error);
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
            console.log('✅ Backup deleted successfully');
            return { success: true };
        } catch (error)
        {
            console.error('❌ Failed to delete backup:', error);
            throw error;
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

    // Session management
    async storeSession(session)
    {
        await chrome.storage.local.set({
            supabaseSession: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                user: session.user,
                expires_at: session.expires_at
            }
        });
    }

    async getStoredSession()
    {
        const data = await chrome.storage.local.get(['supabaseSession']);
        return data.supabaseSession;
    }

    async clearStoredSession()
    {
        await chrome.storage.local.remove(['supabaseSession']);
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
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports)
{
    module.exports = SupabaseClient;
} else
{
    window.SupabaseClient = SupabaseClient;
}