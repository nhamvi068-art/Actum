import { db } from '@drawnix/drawnix';
import { taskAssetManager } from '@drawnix/drawnix';
import { liveQuery, Subscription } from 'dexie';

// Task status enum
export type TaskStatus = 'pending' | 'submitting' | 'generating' | 'completed' | 'failed';

// Placeholder info for task persistence
export interface PlaceholderInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: string;
  imageUrl?: string;
}

// Image task interface - extended for app usage
// Note: This extends the basic TaskData in IndexedDB with additional fields
export interface ImageTask {
  id: string;
  status: TaskStatus;
  prompt: string;
  model: string;
  aspectRatio: string;
  imageSize?: string;
  referenceImages?: string[];
  placeholderInfo: PlaceholderInfo;
  resultImageUrl?: string; // Base64格式（用于画布显示）
  originalUrl?: string;   // 原始URL（用于下载）
  localAssetId?: string;  // 本地缓存的资产 ID
  error?: string;
  retryCount: number;
  createdAt: string;  // ISO string for compatibility
  updatedAt: string;  // ISO string for compatibility
  projectId: string;
  workspaceId?: string;  // Alias for projectId (for TaskListButton compatibility)
  cancelled?: boolean; // 标记任务是否被取消
  progress?: number; // 进度 0-100
  insertedToCanvas?: boolean; // 标记任务是否已插入画布
}

// Generate unique task ID
export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Convert ImageTask to storable format (with workspaceId and numeric timestamps)
function toStoredTask(task: ImageTask): any {
  return {
    ...task,
    workspaceId: task.projectId,  // For TaskListButton filtering
    createdAt: new Date(task.createdAt).getTime(),
    updatedAt: new Date(task.updatedAt).getTime(),
  };
}

// Convert stored task back to ImageTask format
function fromStoredTask(task: any): ImageTask {
  return {
    ...task,
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.updatedAt).toISOString(),
    projectId: task.projectId || task.workspaceId,
  };
}

// Get all tasks from IndexedDB
export async function getAllTasks(): Promise<ImageTask[]> {
  try {
    const tasks = await db.tasks.orderBy('updatedAt').reverse().toArray();
    return tasks.map(fromStoredTask);
  } catch (error) {
    console.error('Failed to get tasks:', error);
    return [];
  }
}

// Get task by ID
export async function getTaskById(taskId: string): Promise<ImageTask | null> {
  try {
    const task = await db.tasks.get(taskId);
    return task ? fromStoredTask(task) : null;
  } catch (error) {
    console.error('Failed to get task by ID:', error);
    return null;
  }
}

// Get tasks by project ID
export async function getTasksByProjectId(projectId: string): Promise<ImageTask[]> {
  const tasks = await getAllTasks();
  return tasks.filter(t => t.projectId === projectId);
}

// Get tasks by status
export async function getTasksByStatus(status: TaskStatus): Promise<ImageTask[]> {
  const tasks = await getAllTasks();
  return tasks.filter(t => t.status === status);
}

// Create a new task
export async function createTask(
  prompt: string,
  model: string,
  aspectRatio: string,
  imageSize: string | undefined,
  placeholderInfo: PlaceholderInfo,
  projectId: string,
  referenceImages?: string[]
): Promise<ImageTask> {
  const now = new Date().toISOString();
  const newTask: ImageTask = {
    id: generateTaskId(),
    status: 'pending',
    prompt,
    model,
    aspectRatio,
    imageSize,
    referenceImages,
    placeholderInfo,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    projectId,
    workspaceId: projectId,
  };

  await db.tasks.add(toStoredTask(newTask));
  return newTask;
}

// Update task status
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  resultImageUrl?: string,
  error?: string,
  originalUrl?: string
): Promise<ImageTask | null> {
  const task = await db.tasks.get(taskId);
  if (!task) {
    return null;
  }

  const updatedData: any = {
    status,
    updatedAt: Date.now(),
  };

  if (resultImageUrl) {
    updatedData.resultImageUrl = resultImageUrl;
    // Note: placeholderInfo update needs special handling

    // Auto-cache image to IndexedDB (solve 404 issue)
    try {
      const assetId = await taskAssetManager.cacheTaskImage(
        resultImageUrl,
        task.projectId || task.workspaceId,
        {
          width: task.placeholderInfo?.width,
          height: task.placeholderInfo?.height,
          aspectRatio: task.placeholderInfo?.aspectRatio
        }
      );
      if (assetId) {
        updatedData.localAssetId = assetId;
        console.log('[TaskManager] Image cached, assetId:', assetId);
      }
    } catch (cacheError) {
      console.warn('[TaskManager] Failed to cache image:', cacheError);
    }
  }

  if (originalUrl) {
    updatedData.originalUrl = originalUrl;
  }

  if (error) {
    updatedData.error = error;
  }

  await db.tasks.update(taskId, updatedData);
  return fromStoredTask({ ...task, ...updatedData });
}

// Update task placeholder info
export async function updateTaskPlaceholder(
  taskId: string,
  placeholderInfo: PlaceholderInfo
): Promise<ImageTask | null> {
  const task = await db.tasks.get(taskId);
  if (!task) {
    return null;
  }

  await db.tasks.update(taskId, {
    placeholderInfo,
    updatedAt: Date.now(),
  });

  return fromStoredTask({ ...task, placeholderInfo });
}

// Increment retry count
export async function incrementRetryCount(taskId: string): Promise<ImageTask | null> {
  const task = await db.tasks.get(taskId);
  if (!task) {
    return null;
  }

  const newRetryCount = (task.retryCount || 0) + 1;
  await db.tasks.update(taskId, {
    retryCount: newRetryCount,
    updatedAt: Date.now(),
  });

  return fromStoredTask({ ...task, retryCount: newRetryCount });
}

// Cancel a task
export async function cancelTask(taskId: string): Promise<ImageTask | null> {
  const task = await db.tasks.get(taskId);
  if (!task) {
    return null;
  }

  await db.tasks.update(taskId, {
    cancelled: true,
    status: 'failed',
    error: '任务已取消',
    updatedAt: Date.now(),
  });

  return fromStoredTask({ ...task, cancelled: true, status: 'failed', error: '任务已取消' });
}

// Check if task is cancelled
export async function isTaskCancelled(taskId: string): Promise<boolean> {
  const task = await getTaskById(taskId);
  return task?.cancelled || false;
}

// Delete task
export async function deleteTask(taskId: string): Promise<boolean> {
  try {
    await db.tasks.delete(taskId);
    return true;
  } catch (error) {
    console.error('Failed to delete task:', error);
    return false;
  }
}

// Clear completed and failed tasks
export async function clearFinishedTasks(projectId?: string): Promise<number> {
  const allTasks = await getAllTasks();
  const tasksToDelete = allTasks.filter(t => {
    if (projectId && t.projectId !== projectId) {
      return false;
    }
    return t.status === 'completed' || t.status === 'failed';
  });

  if (tasksToDelete.length > 0) {
    const ids = tasksToDelete.map(t => t.id);
    await db.tasks.bulkDelete(ids);
  }

  return tasksToDelete.length;
}

// Clear all tasks
export async function clearAllTasks(): Promise<void> {
  await db.tasks.clear();
}

// Get pending/generating tasks (for recovery)
export async function getActiveTasks(projectId?: string): Promise<ImageTask[]> {
  const tasks = await getAllTasks();
  return tasks.filter(t => {
    if (projectId && t.projectId !== projectId) {
      return false;
    }
    return t.status === 'pending' || t.status === 'generating';
  });
}

// Update task progress
export async function updateTaskProgress(taskId: string, progress: number): Promise<void> {
  await db.tasks.update(taskId, {
    progress: Math.min(100, Math.max(0, progress)),
    updatedAt: Date.now(),
  });
}

// Mark task as inserted to canvas
export async function markTaskAsInserted(taskId: string): Promise<void> {
  console.log('[TaskManager] markTaskAsInserted called:', taskId);
  await db.tasks.update(taskId, {
    insertedToCanvas: true,
    updatedAt: Date.now(),
  });
  console.log('[TaskManager] markTaskAsInserted updated, now checking...');
  const updated = await db.tasks.get(taskId);
  console.log('[TaskManager] Task after update:', updated);
}

// Subscribe to task changes using Dexie liveQuery
export function subscribeToTasks(
  callback: (tasks: ImageTask[]) => void,
  interval: number = 1000
): () => void {
  let subscription: Subscription | null = null;

  // Use liveQuery for reactive updates
  try {
    const observable = liveQuery(() =>
      db.tasks.orderBy('updatedAt').reverse().toArray()
    );

    subscription = observable.subscribe({
      next: (tasks: any[]) => {
        const imageTasks = tasks.map(fromStoredTask);
        callback(imageTasks);
      },
      error: (error: Error) => {
        console.error('[subscribeToTasks] Error:', error);
      },
    });
  } catch (error) {
    console.error('[subscribeToTasks] Failed to subscribe:', error);
    // Fallback to polling if liveQuery fails
    const poll = async () => {
      const tasks = await getAllTasks();
      callback(tasks);
    };
    poll();
    const intervalId = setInterval(poll, interval);
    return () => clearInterval(intervalId);
  }

  // Return cleanup function
  return () => {
    if (subscription) {
      subscription.unsubscribe();
    }
  };
}

// Migration function: import tasks from localforage to IndexedDB
// Returns number of tasks migrated
export async function migrateFromLocalforage(): Promise<number> {
  const localforage = await import('localforage');
  try {
    const oldTasks = await localforage.getItem<ImageTask[]>('image_generation_tasks');
    if (oldTasks && oldTasks.length > 0) {
      console.log(`[TaskManager] Migrating ${oldTasks.length} tasks from localforage to IndexedDB`);

      const tasksToAdd = oldTasks.map(t => ({
        ...t,
        workspaceId: t.projectId,
        createdAt: new Date(t.createdAt).getTime(),
        updatedAt: new Date(t.updatedAt).getTime(),
      }));

      await db.tasks.bulkPut(tasksToAdd);

      // Verify migration
      const count = await db.tasks.count();
      console.log(`[TaskManager] Migration complete. Total tasks in IndexedDB: ${count}`);

      // Optionally clear old localforage data
      // await localforage.removeItem('image_generation_tasks');

      return oldTasks.length;
    }
  } catch (error) {
    console.error('[TaskManager] Migration failed:', error);
  }
  return 0;
}
