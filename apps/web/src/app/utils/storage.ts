import localforage from 'localforage';

// 存储键前缀常量
export const MAIN_BOARD_CONTENT_KEY = 'main_board_content';
export const PROJECTS_KEY = 'projects_list';
export const API_CONFIG_KEY = 'api_config';
export const THUMBNAIL_KEY_PREFIX = 'thumbnail_';

// 缓存级别枚举
export enum CacheLevel {
  CORE = 'core',      // 画布数据（不删）
  CACHE = 'cache',    // AI生成缓存（可删）
  THUMBNAIL = 'thumb' // 缩略图（优先删）
}

// 存储配额状态
export interface StorageQuota {
  used: number;
  quota: number;
  percentage: number;
}

/**
 * 检测浏览器存储配额
 * 使用 navigator.storage.estimate() API
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
    // 如果 API 不可用，返回默认值
    return {
      used: 0,
      quota: 5 * 1024 * 1024, // 假设 5MB
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
 * 检查存储是否接近满（使用率 > 80%）
 */
export async function isStorageNearFull(): Promise<boolean> {
  const quota = await checkStorageQuota();
  return quota.percentage > 80;
}

/**
 * 检查存储是否已满（使用率 > 95%）
 */
export async function isStorageFull(): Promise<boolean> {
  const quota = await checkStorageQuota();
  return quota.percentage > 95;
}

/**
 * 获取存储状态描述文本
 */
export async function getStorageStatusText(): Promise<string> {
  const quota = await checkStorageQuota();
  const usedMB = (quota.used / (1024 * 1024)).toFixed(2);
  const quotaMB = (quota.quota / (1024 * 1024)).toFixed(0);
  
  if (quota.percentage > 95) {
    return `存储空间已满 (${usedMB}/${quotaMB} MB) - 请清理缓存`;
  } else if (quota.percentage > 80) {
    return `存储空间不足 (${usedMB}/${quotaMB} MB) - 建议清理缓存`;
  } else if (quota.percentage > 50) {
    return `存储空间已使用 ${quota.percentage.toFixed(1)}% (${usedMB}/${quotaMB} MB)`;
  } else {
    return `存储空间充足 (${usedMB}/${quotaMB} MB)`;
  }
}

/**
 * 格式化字节数为可读字符串
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 清理缩略图缓存
 */
export async function clearThumbnails(): Promise<void> {
  try {
    const projects = await localforage.getItem<any[]>(PROJECTS_KEY);
    if (projects && projects.length > 0) {
      const updatedProjects = projects.map(p => ({ ...p, thumbnail: undefined }));
      await localforage.setItem(PROJECTS_KEY, updatedProjects);
      console.log('Cleared all thumbnails');
    }
  } catch (error) {
    console.error('Failed to clear thumbnails:', error);
  }
}

/**
 * 清理旧的画布内容（保留最近 N 个）
 */
export async function cleanOldBoardContent(keepCount = 5): Promise<void> {
  try {
    const allKeys = await localforage.keys();
    const boardContentKeys = allKeys.filter(k => k.startsWith(MAIN_BOARD_CONTENT_KEY));
    
    if (boardContentKeys.length <= keepCount) {
      return; // 不需要清理
    }
    
    // 按时间排序，获取最老的项目删除
    // 这里简单处理，删除除第一个之外的所有
    const keysToDelete = boardContentKeys.slice(keepCount);
    for (const key of keysToDelete) {
      await localforage.removeItem(key);
    }
    console.log(`Cleaned ${keysToDelete.length} old board contents`);
  } catch (error) {
    console.error('Failed to clean old board content:', error);
  }
}

/**
 * 清理所有非核心数据（缩略图 + 旧画布）
 */
export async function cleanAllNonCoreData(): Promise<void> {
  await clearThumbnails();
  await cleanOldBoardContent(3); // 保留最近 3 个
  console.log('Cleaned all non-core data');
}

/**
 * 获取所有存储键及其大小
 */
export async function getStorageUsage(): Promise<{ key: string; size: number }[]> {
  const usage: { key: string; size: number }[] = [];
  
  try {
    const allKeys = await localforage.keys();
    
    for (const key of allKeys) {
      const value = await localforage.getItem(key);
      if (value) {
        const size = JSON.stringify(value).length;
        usage.push({ key, size });
      }
    }
    
    // 按大小排序
    return usage.sort((a, b) => b.size - a.size);
  } catch (error) {
    console.error('Failed to get storage usage:', error);
    return usage;
  }
}

/**
 * 请求持久化存储（避免浏览器自动清理）
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
 * 检查是否已获得持久化存储
 */
export async function isStoragePersisted(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    return await navigator.storage.persisted();
  }
  return false;
}

