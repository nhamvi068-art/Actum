import { db } from './app-database';

export interface StorageAlert {
  level: 'warning' | 'critical';
  message: string;
  used: number;
  total: number;
  percentage: number;
}

/**
 * 存储监控服务
 * 监控 IndexedDB 存储使用情况，提供告警功能
 */
class StorageMonitorService {
  private WARNING_THRESHOLD = 0.8;  // 80%
  private CRITICAL_THRESHOLD = 0.95; // 95%
  private channel: BroadcastChannel | null = null;
  private monitoringInterval: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.channel = new BroadcastChannel('drawnix_storage_alert');
    }
  }

  /**
   * 获取存储使用情况
   */
  async getStorageUsage(): Promise<{ used: number; total: number; percentage: number }> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return { used: 0, total: 0, percentage: 0 };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const total = estimate.quota || 0;

      return {
        used,
        total,
        percentage: total > 0 ? used / total : 0
      };
    } catch (e) {
      console.warn('[StorageMonitor] Failed to get storage estimate:', e);
      return { used: 0, total: 0, percentage: 0 };
    }
  }

  /**
   * 获取应用数据大小（仅 DrawnixDB）
   */
  async getAppStorageUsage(): Promise<{ workspaces: number; assets: number; tasks: number; total: number }> {
    try {
      const workspaces = await db.workspaces.count();
      const assets = await db.assets.count();
      const tasks = await db.tasks.count();

      // 估算资产大小
      const assetList = await db.assets.toArray();
      const assetSize = assetList.reduce((sum, a) => sum + (a.size || 0), 0);

      return {
        workspaces,
        assets,
        tasks,
        total: assetSize
      };
    } catch (e) {
      console.warn('[StorageMonitor] Failed to get app storage usage:', e);
      return { workspaces: 0, assets: 0, tasks: 0, total: 0 };
    }
  }

  /**
   * 检查存储状态并返回告警（如果有）
   */
  async checkAndAlert(): Promise<StorageAlert | null> {
    const usage = await this.getStorageUsage();

    if (usage.percentage >= this.CRITICAL_THRESHOLD) {
      return {
        level: 'critical',
        message: '存储空间即将用尽！请清理不需要的任务或导出备份。',
        used: usage.used,
        total: usage.total,
        percentage: usage.percentage
      };
    }

    if (usage.percentage >= this.WARNING_THRESHOLD) {
      return {
        level: 'warning',
        message: '存储空间使用较高，建议清理已完成的任务。',
        used: usage.used,
        total: usage.total,
        percentage: usage.percentage
      };
    }

    return null;
  }

  /**
   * 通知存储告警（通过 BroadcastChannel）
   */
  notifyAlert(alert: StorageAlert): void {
    if (this.channel) {
      this.channel.postMessage({ type: 'STORAGE_ALERT', alert });
    }
  }

  /**
   * 启动定期监控
   * @param intervalMs 检查间隔（默认 60 秒）
   */
  startMonitoring(intervalMs = 60000): void {
    if (this.monitoringInterval) return;

    this.monitoringInterval = window.setInterval(async () => {
      const alert = await this.checkAndAlert();
      if (alert) {
        this.notifyAlert(alert);
      }
    }, intervalMs);
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * 请求持久化存储权限
   */
  async requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      console.warn('[StorageMonitor] Browser does not support persistent storage');
      return false;
    }

    try {
      const isPersisted = await navigator.storage.persist();

      if (isPersisted) {
        console.log('[StorageMonitor] Persistent storage granted');
      } else {
        console.warn('[StorageMonitor] Persistent storage request denied');
      }

      return isPersisted;
    } catch (e) {
      console.warn('[StorageMonitor] Failed to request persistent storage:', e);
      return false;
    }
  }

  /**
   * 检查是否已获得持久化存储
   */
  async isStoragePersisted(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
      return false;
    }

    try {
      return await navigator.storage.persisted();
    } catch (e) {
      return false;
    }
  }
}

export const storageMonitorService = new StorageMonitorService();
