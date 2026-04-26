import { db, TaskData, AssetData } from './app-database';
import { nanoid } from 'nanoid';

export interface TaskResult {
  assetId?: string;
  remoteUrl?: string;
  type: string;
  metadata?: any;
}

/**
 * 任务存储服务
 * 负责在 IndexedDB 中存储和管理任务数据
 */
export class TaskStorageService {
  /**
   * 保存任务到 IndexedDB
   */
  async saveTask(task: Partial<TaskData> & Pick<TaskData, 'id' | 'type' | 'status'>): Promise<string> {
    const now = Date.now();
    const taskData: TaskData = {
      id: task.id,
      type: task.type,
      status: task.status,
      prompt: task.prompt,
      model: task.model,
      result: task.result,
      error: task.error,
      retryCount: task.retryCount || 0,
      createdAt: task.createdAt || now,
      updatedAt: now,
      workspaceId: task.workspaceId
    };

    await db.tasks.put(taskData);
    return taskData.id;
  }

  /**
   * 根据 ID 获取任务
   */
  async getTask(id: string): Promise<TaskData | undefined> {
    return await db.tasks.get(id);
  }

  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<TaskData[]> {
    return await db.tasks.orderBy('updatedAt').reverse().toArray();
  }

  /**
   * 获取工作区关联的任务
   */
  async getTasksByWorkspace(workspaceId: string): Promise<TaskData[]> {
    return await db.tasks
      .where('workspaceId')
      .equals(workspaceId)
      .reverse()
      .sortBy('updatedAt');
  }

  /**
   * 根据状态获取任务
   */
  async getTasksByStatus(status: TaskData['status']): Promise<TaskData[]> {
    return await db.tasks
      .where('status')
      .equals(status)
      .toArray();
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(id: string, status: TaskData['status'], result?: TaskResult, error?: string): Promise<void> {
    await db.tasks.update(id, {
      status,
      result,
      error,
      updatedAt: Date.now()
    });
  }

  /**
   * 更新任务进度
   */
  async updateTaskProgress(id: string, progress: number): Promise<void> {
    await db.tasks.update(id, {
      progress: Math.min(100, Math.max(0, progress)),
      updatedAt: Date.now()
    });
  }

  /**
   * 批量更新任务进度（用于多个任务同时生成）
   */
  async updateTaskProgressBatch(updates: { id: string; progress: number }[]): Promise<void> {
    const updatesArray = updates.map(u => ({
      key: u.id,
      changes: {
        progress: Math.min(100, Math.max(0, u.progress)),
        updatedAt: Date.now()
      }
    }));
    for (const update of updatesArray) {
      await db.tasks.update(update.key, update.changes);
    }
  }

  /**
   * 删除任务
   */
  async deleteTask(id: string): Promise<void> {
    await db.tasks.delete(id);
  }

  /**
   * 批量删除任务
   */
  async deleteTasks(ids: string[]): Promise<void> {
    await db.tasks.bulkDelete(ids);
  }

  /**
   * 获取活跃任务（pending, submitting, generating）
   */
  async getActiveTasks(): Promise<TaskData[]> {
    return await db.tasks
      .where('status')
      .anyOf(['pending', 'submitting', 'generating'])
      .toArray();
  }

  /**
   * 清理旧任务
   */
  async cleanOldTasks(daysOld: number = 30): Promise<number> {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const oldTasks = await db.tasks
      .where('updatedAt')
      .below(cutoffTime)
      .and(t => t.status === 'completed' || t.status === 'failed')
      .toArray();

    const ids = oldTasks.map(t => t.id);
    if (ids.length > 0) {
      await db.tasks.bulkDelete(ids);
    }

    return ids.length;
  }
}

export const taskStorageService = new TaskStorageService();
