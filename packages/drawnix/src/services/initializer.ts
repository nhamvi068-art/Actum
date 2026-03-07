import { db, TaskData } from './db/app-database';
import { swRegister } from './sw-register';
import { storageMonitorService } from './db/storage-monitor-service';
import { migrationService } from './db/migration-service';

/**
 * Drawnix 服务初始化
 * 提供一键初始化所有后端服务的入口
 */
export class DrawnixServiceInitializer {
  private initialized = false;

  /**
   * 初始化所有服务
   */
  async init(): Promise<void> {
    if (this.initialized) {
      console.log('[Drawnix] Services already initialized');
      return;
    }

    console.log('[Drawnix] Initializing services...');

    try {
      // 初始化数据库连接
      await this.initDatabase();

      // 执行数据迁移（如果需要）
      await this.runMigration();

      // 请求持久化存储权限
      await this.initPersistentStorage();

      // 启动存储监控
      this.initStorageMonitor();

      // 尝试注册 Service Worker（非阻塞）
      this.initServiceWorker();

      this.initialized = true;
      console.log('[Drawnix] Services initialized successfully');
    } catch (error) {
      console.error('[Drawnix] Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * 初始化数据库
   */
  private async initDatabase(): Promise<void> {
    // 打开数据库连接
    await db.open();
    console.log('[Drawnix] Database connected');
  }

  /**
   * 请求持久化存储权限
   */
  private async initPersistentStorage(): Promise<void> {
    try {
      const isPersisted = await storageMonitorService.requestPersistentStorage();
      if (isPersisted) {
        console.log('[Drawnix] Persistent storage enabled');
      } else {
        console.log('[Drawnix] Persistent storage not available, data may be cleared by browser');
      }
    } catch (error) {
      console.warn('[Drawnix] Failed to request persistent storage:', error);
    }
  }

  /**
   * 启动存储监控
   */
  private initStorageMonitor(): void {
    try {
      storageMonitorService.startMonitoring(60000); // 每分钟检查一次
      console.log('[Drawnix] Storage monitoring started');
    } catch (error) {
      console.warn('[Drawnix] Failed to start storage monitor:', error);
    }
  }

  /**
   * 执行数据迁移
   */
  private async runMigration(): Promise<void> {
    try {
      const needsMigration = await migrationService.needsMigration();
      if (needsMigration) {
        console.log('[Drawnix] Running data migration...');
        const result = await migrationService.migrate();
        console.log('[Drawnix] Migration result:', result);
      } else {
        console.log('[Drawnix] No migration needed');
      }
    } catch (error) {
      console.warn('[Drawnix] Migration failed (non-critical):', error);
    }
  }

  /**
   * 初始化 Service Worker（非阻塞）
   */
  private async initServiceWorker(): Promise<void> {
    // 不阻塞主流程，在后台尝试注册
    setTimeout(async () => {
      try {
        await swRegister.register();
      } catch (error) {
        console.warn('[Drawnix] Service Worker registration skipped:', error);
      }
    }, 1000);
  }

  /**
   * 获取服务就绪状态
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    storageMonitorService.stopMonitoring();
    await swRegister.unregister();
    await db.close();
    this.initialized = false;
    console.log('[Drawnix] Services cleaned up');
  }
}

export const drawnixServices = new DrawnixServiceInitializer();
