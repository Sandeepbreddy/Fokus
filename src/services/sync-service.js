// src/services/sync-service.js - Data synchronization service
import { Logger } from '../shared/logger.js';
import { Utils } from '../shared/utils.js';
import { STORAGE_KEYS, TIMEOUTS } from '../shared/constants.js';
import { errorHandler } from '../shared/error-handler.js';

export class SyncService
{
    constructor(supabaseClient)
    {
        this.logger = new Logger('SyncService');
        this.supabaseClient = supabaseClient;
        this.syncQueue = [];
        this.isProcessing = false;
        this.lastSyncTime = 0;
        this.syncTimer = null;
        this.conflictResolver = new ConflictResolver();
    }

    async init()
    {
        try
        {
            await this.loadSyncState();
            this.setupAutoSync();
            this.logger.info('Sync service initialized');
        } catch (error)
        {
            this.logger.error('Failed to initialize sync service:', error);
            throw error;
        }
    }

    async loadSyncState()
    {
        try
        {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.LAST_CLOUD_SYNC,
                'syncConflicts',
                'pendingSyncs'
            ]);

            this.lastSyncTime = data[STORAGE_KEYS.LAST_CLOUD_SYNC] || 0;
            this.syncQueue = data.pendingSyncs || [];

            this.logger.debug(`Loaded sync state: last sync ${this.lastSyncTime}, ${this.syncQueue.length} pending`);
        } catch (error)
        {
            this.logger.error('Failed to load sync state:', error);
        }
    }

    setupAutoSync()
    {
        // Setup periodic sync
        this.syncTimer = setInterval(async () =>
        {
            if (this.supabaseClient?.isAuthenticated() && !this.isProcessing)
            {
                await this.performSync();
            }
        }, TIMEOUTS.SYNC_DEBOUNCE);

        // Setup storage change listener
        chrome.storage.onChanged.addListener(async (changes, namespace) =>
        {
            if (namespace === 'local' && this.shouldTriggerSync(changes))
            {
                await this.queueSync('storage_change', changes);
            }
        });

        this.logger.debug('Auto-sync configured');
    }

    shouldTriggerSync(changes)
    {
        const syncTriggers = [
            STORAGE_KEYS.BLOCKED_KEYWORDS,
            STORAGE_KEYS.CUSTOM_DOMAINS,
            STORAGE_KEYS.BLOCKLIST_SOURCES,
            STORAGE_KEYS.IS_ACTIVE
        ];

        return Object.keys(changes).some(key =>
            syncTriggers.includes(key) && !key.includes('lastSync')
        );
    }

    async queueSync(reason, data = {})
    {
        const syncItem = {
            id: Utils.generateId(),
            reason,
            data,
            timestamp: Date.now(),
            retries: 0
        };

        this.syncQueue.push(syncItem);

        // Save queue to storage
        await this.saveSyncQueue();

        // Process queue if not already processing
        if (!this.isProcessing)
        {
            setTimeout(() => this.processQueue(), 1000);
        }

        this.logger.debug(`Queued sync: ${reason}`);
    }

    async processQueue()
    {
        if (this.isProcessing || this.syncQueue.length === 0) return;

        this.isProcessing = true;

        try
        {
            while (this.syncQueue.length > 0)
            {
                const syncItem = this.syncQueue.shift();

                try
                {
                    await this.processSyncItem(syncItem);
                    this.logger.debug(`Processed sync: ${syncItem.reason}`);
                } catch (error)
                {
                    await this.handleSyncError(syncItem, error);
                }
            }

            await this.saveSyncQueue();
        } finally
        {
            this.isProcessing = false;
        }
    }

    async processSyncItem(syncItem)
    {
        if (!this.supabaseClient?.isAuthenticated())
        {
            throw new Error('Not authenticated');
        }

        switch (syncItem.reason)
        {
            case 'storage_change':
                await this.syncChangesToCloud(syncItem.data);
                break;
            case 'manual_sync':
                await this.performFullSync();
                break;
            case 'conflict_resolution':
                await this.resolveConflict(syncItem.data);
                break;
            default:
                this.logger.warn(`Unknown sync reason: ${syncItem.reason}`);
        }
    }

    async syncChangesToCloud(changes)
    {
        const changedKeys = Object.keys(changes);
        const localData = await chrome.storage.local.get(changedKeys);

        // Prepare sync data
        const syncData = {
            user_id: this.supabaseClient.getCurrentUser().id,
            settings: {},
            updated_at: new Date().toISOString(),
            sync_source: 'auto_change'
        };

        // Map local storage keys to sync data
        changedKeys.forEach(key =>
        {
            switch (key)
            {
                case STORAGE_KEYS.BLOCKED_KEYWORDS:
                    syncData.settings.blockedKeywords = localData[key] || [];
                    break;
                case STORAGE_KEYS.CUSTOM_DOMAINS:
                    syncData.settings.customDomains = localData[key] || [];
                    break;
                case STORAGE_KEYS.BLOCKLIST_SOURCES:
                    syncData.settings.blocklistSources = localData[key] || [];
                    break;
                case STORAGE_KEYS.IS_ACTIVE:
                    syncData.settings.isActive = localData[key];
                    break;
            }
        });

        await this.supabaseClient.makeRequest('POST', 'user_settings', syncData);
        await this.updateLastSyncTime();
    }

    async performFullSync()
    {
        try
        {
            // First, sync local changes to cloud
            await this.supabaseClient.syncToCloud();

            // Then, get any updates from cloud
            await this.supabaseClient.syncFromCloud();

            await this.updateLastSyncTime();

            this.logger.info('Full sync completed');
        } catch (error)
        {
            this.logger.error('Full sync failed:', error);
            throw error;
        }
    }

    async performSync()
    {
        try
        {
            if (this.syncQueue.length > 0)
            {
                await this.processQueue();
            } else
            {
                // Perform periodic sync check
                await this.checkForCloudUpdates();
            }
        } catch (error)
        {
            this.logger.error('Sync failed:', error);
            errorHandler.handleError(error, 'sync-service');
        }
    }

    async checkForCloudUpdates()
    {
        if (!this.supabaseClient?.isAuthenticated()) return;

        try
        {
            const cloudData = await this.supabaseClient.makeRequest(
                'GET',
                `user_settings?user_id=eq.${this.supabaseClient.getCurrentUser().id}&limit=1`
            );

            if (cloudData && cloudData.length > 0)
            {
                const cloudTimestamp = new Date(cloudData[0].updated_at).getTime();

                if (cloudTimestamp > this.lastSyncTime)
                {
                    this.logger.info('Cloud updates detected, syncing...');
                    await this.handleCloudUpdates(cloudData[0]);
                }
            }
        } catch (error)
        {
            this.logger.error('Failed to check for cloud updates:', error);
        }
    }

    async handleCloudUpdates(cloudData)
    {
        // Get current local data
        const localData = await chrome.storage.local.get([
            STORAGE_KEYS.BLOCKED_KEYWORDS,
            STORAGE_KEYS.CUSTOM_DOMAINS,
            STORAGE_KEYS.BLOCKLIST_SOURCES,
            STORAGE_KEYS.IS_ACTIVE
        ]);

        // Check for conflicts
        const conflicts = this.conflictResolver.detectConflicts(localData, cloudData.settings);

        if (conflicts.length > 0)
        {
            await this.handleConflicts(conflicts, localData, cloudData.settings);
        } else
        {
            // No conflicts, apply cloud data
            await this.applyCloudData(cloudData.settings);
        }

        await this.updateLastSyncTime();
    }

    async handleConflicts(conflicts, localData, cloudData)
    {
        this.logger.warn(`Detected ${conflicts.length} sync conflicts`);

        // Store conflicts for user resolution
        await chrome.storage.local.set({
            syncConflicts: conflicts,
            conflictLocalData: localData,
            conflictCloudData: cloudData,
            conflictTimestamp: Date.now()
        });

        // For now, prefer cloud data (can be made configurable)
        await this.applyCloudData(cloudData);

        // Notify user about conflicts (if UI is available)
        this.notifyConflicts(conflicts);
    }

    async applyCloudData(cloudSettings)
    {
        const settingsToUpdate = {};

        // Preserve local PIN
        const currentPin = await chrome.storage.local.get([STORAGE_KEYS.PIN]);
        settingsToUpdate[STORAGE_KEYS.PIN] = currentPin[STORAGE_KEYS.PIN] || '1234';

        // Apply cloud settings
        if (cloudSettings.blockedKeywords)
        {
            settingsToUpdate[STORAGE_KEYS.BLOCKED_KEYWORDS] = cloudSettings.blockedKeywords;
        }
        if (cloudSettings.customDomains)
        {
            settingsToUpdate[STORAGE_KEYS.CUSTOM_DOMAINS] = cloudSettings.customDomains;
        }
        if (cloudSettings.blocklistSources)
        {
            settingsToUpdate[STORAGE_KEYS.BLOCKLIST_SOURCES] = cloudSettings.blocklistSources;
        }
        if (cloudSettings.isActive !== undefined)
        {
            settingsToUpdate[STORAGE_KEYS.IS_ACTIVE] = cloudSettings.isActive;
        }

        await chrome.storage.local.set(settingsToUpdate);
        this.logger.info('Applied cloud data to local storage');
    }

    async handleSyncError(syncItem, error)
    {
        syncItem.retries++;
        syncItem.lastError = error.message;

        if (syncItem.retries < 3)
        {
            // Re-queue with exponential backoff
            const delay = Math.pow(2, syncItem.retries) * 1000;
            setTimeout(() =>
            {
                this.syncQueue.unshift(syncItem);
            }, delay);

            this.logger.warn(`Sync failed, retrying in ${delay}ms: ${error.message}`);
        } else
        {
            this.logger.error(`Sync failed permanently after ${syncItem.retries} retries: ${error.message}`);

            // Store failed sync for manual resolution
            await this.storeFailedSync(syncItem);
        }
    }

    async storeFailedSync(syncItem)
    {
        const data = await chrome.storage.local.get(['failedSyncs']);
        const failedSyncs = data.failedSyncs || [];

        failedSyncs.push({
            ...syncItem,
            failedAt: Date.now()
        });

        // Keep only last 10 failed syncs
        await chrome.storage.local.set({
            failedSyncs: failedSyncs.slice(-10)
        });
    }

    async updateLastSyncTime()
    {
        this.lastSyncTime = Date.now();
        await chrome.storage.local.set({
            [STORAGE_KEYS.LAST_CLOUD_SYNC]: this.lastSyncTime
        });
    }

    async saveSyncQueue()
    {
        await chrome.storage.local.set({
            pendingSyncs: this.syncQueue
        });
    }

    notifyConflicts(conflicts)
    {
        // This could trigger a notification or UI update
        // For now, just log
        this.logger.info(`Sync conflicts detected: ${conflicts.map(c => c.key).join(', ')}`);
    }

    // Public API
    async manualSync()
    {
        await this.queueSync('manual_sync');
    }

    async getStatus()
    {
        return {
            isProcessing: this.isProcessing,
            queueLength: this.syncQueue.length,
            lastSyncTime: this.lastSyncTime,
            authenticated: this.supabaseClient?.isAuthenticated() || false
        };
    }

    async clearQueue()
    {
        this.syncQueue = [];
        await this.saveSyncQueue();
        this.logger.info('Sync queue cleared');
    }

    async getFailedSyncs()
    {
        const data = await chrome.storage.local.get(['failedSyncs']);
        return data.failedSyncs || [];
    }

    async retryFailedSync(syncId)
    {
        const failedSyncs = await this.getFailedSyncs();
        const syncItem = failedSyncs.find(s => s.id === syncId);

        if (syncItem)
        {
            syncItem.retries = 0;
            delete syncItem.lastError;
            await this.queueSync(syncItem.reason, syncItem.data);
        }
    }

    destroy()
    {
        if (this.syncTimer)
        {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }

        this.syncQueue = [];
        this.isProcessing = false;
        this.logger.info('SyncService destroyed');
    }
}

class ConflictResolver
{
    constructor()
    {
        this.logger = new Logger('ConflictResolver');
    }

    detectConflicts(localData, cloudData)
    {
        const conflicts = [];

        // Check each synced field for conflicts
        const fieldsToCheck = [
            { local: STORAGE_KEYS.BLOCKED_KEYWORDS, cloud: 'blockedKeywords' },
            { local: STORAGE_KEYS.CUSTOM_DOMAINS, cloud: 'customDomains' },
            { local: STORAGE_KEYS.BLOCKLIST_SOURCES, cloud: 'blocklistSources' },
            { local: STORAGE_KEYS.IS_ACTIVE, cloud: 'isActive' }
        ];

        fieldsToCheck.forEach(field =>
        {
            if (this.hasConflict(localData[field.local], cloudData[field.cloud]))
            {
                conflicts.push({
                    key: field.local,
                    localValue: localData[field.local],
                    cloudValue: cloudData[field.cloud],
                    type: this.getConflictType(localData[field.local], cloudData[field.cloud])
                });
            }
        });

        return conflicts;
    }

    hasConflict(localValue, cloudValue)
    {
        // Deep comparison for arrays and objects
        if (Array.isArray(localValue) && Array.isArray(cloudValue))
        {
            return !this.arraysEqual(localValue, cloudValue);
        }

        if (typeof localValue === 'object' && typeof cloudValue === 'object')
        {
            return !this.objectsEqual(localValue, cloudValue);
        }

        return localValue !== cloudValue;
    }

    getConflictType(localValue, cloudValue)
    {
        if (Array.isArray(localValue) && Array.isArray(cloudValue))
        {
            if (localValue.length !== cloudValue.length)
            {
                return 'array_length_diff';
            }
            return 'array_content_diff';
        }

        if (typeof localValue !== typeof cloudValue)
        {
            return 'type_diff';
        }

        return 'value_diff';
    }

    arraysEqual(a, b)
    {
        if (a.length !== b.length) return false;

        const sortedA = [...a].sort();
        const sortedB = [...b].sort();

        return sortedA.every((val, index) => val === sortedB[index]);
    }

    objectsEqual(a, b)
    {
        const keysA = Object.keys(a || {}).sort();
        const keysB = Object.keys(b || {}).sort();

        if (keysA.length !== keysB.length) return false;
        if (!keysA.every((key, index) => key === keysB[index])) return false;

        return keysA.every(key => a[key] === b[key]);
    }

    resolveConflicts(conflicts, strategy = 'prefer_cloud')
    {
        const resolutions = [];

        conflicts.forEach(conflict =>
        {
            let resolvedValue;

            switch (strategy)
            {
                case 'prefer_cloud':
                    resolvedValue = conflict.cloudValue;
                    break;
                case 'prefer_local':
                    resolvedValue = conflict.localValue;
                    break;
                case 'merge_arrays':
                    if (Array.isArray(conflict.localValue) && Array.isArray(conflict.cloudValue))
                    {
                        resolvedValue = [...new Set([...conflict.localValue, ...conflict.cloudValue])];
                    } else
                    {
                        resolvedValue = conflict.cloudValue; // Fallback
                    }
                    break;
                case 'prefer_newer':
                    // This would require timestamps, fallback to cloud
                    resolvedValue = conflict.cloudValue;
                    break;
                default:
                    resolvedValue = conflict.cloudValue;
            }

            resolutions.push({
                key: conflict.key,
                resolvedValue,
                strategy,
                originalConflict: conflict
            });
        });

        return resolutions;
    }
}

export default SyncService;