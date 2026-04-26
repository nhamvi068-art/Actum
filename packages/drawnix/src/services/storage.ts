import localforage from 'localforage';

// Storage keys
export const MAIN_BOARD_CONTENT_KEY = 'main_board_content';
export const PROJECTS_KEY = 'projects_list';
export const API_CONFIG_KEY = 'api_config';
export const THUMBNAIL_KEY_PREFIX = 'thumbnail_';

// Cache level enum
export enum CacheLevel {
  CORE = 'core',      // Canvas data (never delete)
  CACHE = 'cache',    // AI generation cache (can delete)
  THUMBNAIL = 'thumb' // Thumbnails (delete first)
}

// Storage quota status
export interface StorageQuota {
  used: number;
  quota: number;
  percentage: number;
}

/**
 * Check browser storage quota
 * Uses navigator.storage.estimate() API
 */
export async function checkStorageQuota(): Promise<StorageQuota> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (used / quota) * 100 : 0;

      return {
        used,
        quota,
        percentage
      };
    }
    // Return default values if API is not available
    return {
      used: 0,
      quota: 5 * 1024 * 1024, // Assume 5MB
      percentage: 0
    };
  } catch (error) {
    console.warn('Failed to check storage quota:', error);
    return {
      used: 0,
      quota: 5 * 1024 * 1024,
      percentage: 0
    };
  }
}

/**
 * Check if storage is near full (usage > 80%)
 */
export async function isStorageNearFull(): Promise<boolean> {
  const quota = await checkStorageQuota();
  return quota.percentage > 80;
}

/**
 * Check if storage is full (usage > 95%)
 */
export async function isStorageFull(): Promise<boolean> {
  const quota = await checkStorageQuota();
  return quota.percentage > 95;
}

/**
 * Get storage status text
 */
export async function getStorageStatusText(): Promise<string> {
  const quota = await checkStorageQuota();
  const usedMB = (quota.used / (1024 * 1024)).toFixed(2);
  const quotaMB = (quota.quota / (1024 * 1024)).toFixed(0);

  if (quota.percentage > 95) {
    return `Storage full (${usedMB}/${quotaMB} MB) - Please clear cache`;
  } else if (quota.percentage > 80) {
    return `Storage low (${usedMB}/${quotaMB} MB) - Recommend clearing cache`;
  } else if (quota.percentage > 50) {
    return `Storage used: ${quota.percentage.toFixed(1)}% (${usedMB}/${quotaMB} MB)`;
  } else {
    return `Storage available (${usedMB}/${quotaMB} MB)`;
  }
}

/**
 * Format bytes to readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Clear all thumbnails from localforage
 */
export async function clearThumbnails(): Promise<void> {
  const keys = await localforage.keys();
  const thumbnailKeys = keys.filter(key => key.startsWith(THUMBNAIL_KEY_PREFIX));

  for (const key of thumbnailKeys) {
    await localforage.removeItem(key);
  }
  console.log(`[Storage] Cleared ${thumbnailKeys.length} thumbnails`);
}

/**
 * Clean old board content (older than specified days)
 */
export async function cleanOldBoardContent(daysOld: number = 30): Promise<number> {
  const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

  try {
    const keys = await localforage.keys();
    let deletedCount = 0;

    for (const key of keys) {
      if (key.startsWith('board_') || key.startsWith('workspace_')) {
        const data = await localforage.getItem<{ updatedAt?: number }>(key);
        if (data && data.updatedAt && data.updatedAt < cutoffTime) {
          await localforage.removeItem(key);
          deletedCount++;
        }
      }
    }

    console.log(`[Storage] Cleaned ${deletedCount} old board content items`);
    return deletedCount;
  } catch (error) {
    console.error('[Storage] Failed to clean old board content:', error);
    return 0;
  }
}

/**
 * Request persistent storage (prevent browser auto-cleanup)
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (!isPersisted) {
      const persisted = await navigator.storage.persist();
      console.log('Storage persistence:', persisted ? 'granted' : 'denied');
      return persisted;
    }
    return true;
  }
  return false;
}

/**
 * Check if persistent storage is granted
 */
export async function isStoragePersisted(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    return await navigator.storage.persisted();
  }
  return false;
}
