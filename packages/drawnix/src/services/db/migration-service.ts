import localforage from 'localforage';
import { db, WorkspaceData, AssetData, TaskData } from './app-database';
import { assetStorageService } from './asset-storage-service';
import { canvasService } from './canvas-service';

export interface MigrationResult {
  workspacesMigrated: number;
  assetsMigrated: number;
  tasksMigrated: number;
  errors: string[];
}

/**
 * 数据迁移服务
 * 将 localforage 中的数据迁移到 Dexie IndexedDB
 */
class MigrationService {
  private migrationKey = 'drawnix_migration_version';
  private currentVersion = 2;

  /**
   * 检查是否需要迁移
   */
  async needsMigration(): Promise<boolean> {
    try {
      const lastVersion = await localforage.getItem<number>(this.migrationKey);
      return !lastVersion || lastVersion < this.currentVersion;
    } catch (e) {
      return false;
    }
  }

  /**
   * 执行数据迁移
   */
  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      workspacesMigrated: 0,
      assetsMigrated: 0,
      tasksMigrated: 0,
      errors: []
    };

    console.log('[Migration] Starting migration...');

    try {
      // 1. 迁移画布数据
      result.workspacesMigrated = await this.migrateWorkspaces();

      // 2. 迁移任务数据
      result.tasksMigrated = await this.migrateTasks();

      // 标记迁移完成
      await localforage.setItem(this.migrationKey, this.currentVersion);

      console.log('[Migration] Migration completed:', result);
    } catch (error: any) {
      console.error('[Migration] Failed:', error);
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * 迁移画布数据
   * 从 localforage 的 main_board_content_* 键迁移到 Dexie
   */
  private async migrateWorkspaces(): Promise<number> {
    const projects = await localforage.getItem<any[]>('projects_list');
    if (!projects || !Array.isArray(projects)) {
      return 0;
    }

    let migrated = 0;

    for (const project of projects) {
      try {
        // 读取画布内容
        const boardKey = `main_board_content_${project.id}`;
        const boardData = await localforage.getItem<any>(boardKey);

        if (boardData) {
          // 解压数据（如果是压缩的）
          let elements = boardData;
          if (typeof boardData === 'string') {
            try {
              const decompressed = await this.decompress(boardData);
              elements = decompressed;
            } catch (e) {
              console.warn(`[Migration] Failed to decompress board ${project.id}:`, e);
            }
          }

          // 保存到 Dexie
          await canvasService.saveFull(project.id, elements?.children || []);
          migrated++;
        }
      } catch (error: any) {
        console.warn(`[Migration] Failed to migrate workspace ${project.id}:`, error);
      }
    }

    return migrated;
  }

  /**
   * 迁移任务数据
   */
  private async migrateTasks(): Promise<number> {
    const tasks = await localforage.getItem<any[]>('image_generation_tasks');
    if (!tasks || !Array.isArray(tasks)) {
      return 0;
    }

    let migrated = 0;

    for (const task of tasks) {
      try {
        const taskData: TaskData = {
          id: task.id,
          type: 'image_generation',
          status: task.status,
          prompt: task.prompt,
          model: task.model,
          result: task.resultImageUrl ? {
            assetId: undefined,
            remoteUrl: task.resultImageUrl,
            type: 'image'
          } : undefined,
          error: task.error,
          retryCount: task.retryCount || 0,
          createdAt: new Date(task.createdAt).getTime(),
          updatedAt: new Date(task.updatedAt).getTime(),
          workspaceId: task.projectId
        };

        await db.tasks.put(taskData);

        // 如果有图片结果，尝试缓存到本地
        if (task.resultImageUrl && task.projectId) {
          await this.cacheTaskAsset(task);
        }

        migrated++;
      } catch (error: any) {
        console.warn(`[Migration] Failed to migrate task ${task.id}:`, error);
      }
    }

    return migrated;
  }

  /**
   * 缓存任务生成的图片资产
   */
  private async cacheTaskAsset(task: any): Promise<void> {
    try {
      const imageData = task.resultImageUrl;

      // 如果是 URL，下载并缓存
      if (imageData.startsWith('http')) {
        const response = await fetch(imageData);
        const blob = await response.blob();

        const assetId = `task_${task.id}_asset`;
        await assetStorageService.saveAsset({
          id: assetId,
          type: 'image',
          mimeType: blob.type || 'image/png',
          blob,
          size: blob.size,
          width: task.placeholderInfo?.width,
          height: task.placeholderInfo?.height
        });

        // 更新任务结果中的 assetId
        await db.tasks.update(task.id, {
          result: {
            assetId,
            remoteUrl: imageData,
            type: 'image'
          }
        });
      } else if (imageData.startsWith('data:')) {
        // 已经是 base64，转换为 Blob 并保存
        const base64Data = imageData.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/png' });

        const assetId = `task_${task.id}_asset`;
        await assetStorageService.saveAsset({
          id: assetId,
          type: 'image',
          mimeType: 'image/png',
          blob,
          size: blob.size,
          width: task.placeholderInfo?.width,
          height: task.placeholderInfo?.height
        });

        // 更新任务结果
        await db.tasks.update(task.id, {
          result: {
            assetId,
            type: 'image'
          }
        });
      }
    } catch (error) {
      console.warn(`[Migration] Failed to cache asset for task ${task.id}:`, error);
    }
  }

  /**
   * 解压缩数据
   */
  private decompress(data: string): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        // 尝试 LZString 解压
        const LZString = require('lz-string');
        const decompressed = LZString.decompressFromUTF16(data);
        if (decompressed) {
          resolve(JSON.parse(decompressed));
        } else {
          // 尝试直接 JSON 解析
          resolve(JSON.parse(data));
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * 获取迁移状态
   */
  async getMigrationStatus(): Promise<{ version: number; needsMigration: boolean }> {
    const lastVersion = await localforage.getItem<number>(this.migrationKey);
    return {
      version: lastVersion || 0,
      needsMigration: await this.needsMigration()
    };
  }
}

export const migrationService = new MigrationService();
