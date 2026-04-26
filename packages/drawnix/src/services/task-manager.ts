import { db, TaskData } from '../services/db/app-database';
import { liveQuery } from 'dexie';

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
  status?: 'pending' | 'submitting' | 'generating' | 'completed' | 'failed' | 'loading';
}

// Image task interface - extended for app usage
export interface ImageTask {
  id: string;
  status: TaskStatus;
  prompt: string;
  model: string;
  aspectRatio: string;
  imageSize?: string;
  referenceImages?: string[];
  placeholderInfo: PlaceholderInfo;
  resultImageUrl?: string; // Base64 format (for canvas display)
  originalUrl?: string;   // Original URL (for download)
  localAssetId?: string;  // Local cached asset ID
  error?: string;
  retryCount: number;
  createdAt: string;  // ISO string for compatibility
  updatedAt: string;  // ISO string for compatibility
  projectId: string;
  workspaceId?: string;  // Alias for projectId (for TaskListButton compatibility)
  cancelled?: boolean; // Mark if task is cancelled
  progress?: number; // Progress 0-100
}

// Generate unique task ID
export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Convert ImageTask to storable format (with workspaceId and numeric timestamps)
function toStoredTask(task: ImageTask): any {
  const safeTime = (val: any): number => {
    const ms = new Date(val).getTime();
    return Number.isNaN(ms) ? Date.now() : ms;
  };
  return {
    ...task,
    workspaceId: task.projectId,  // For TaskListButton filtering
    createdAt: safeTime(task.createdAt),
    updatedAt: safeTime(task.updatedAt),
  };
}

// Convert stored task back to ImageTask format
function fromStoredTask(task: any): ImageTask {
  const safeDate = (val: any): string => {
    if (!val || Number.isNaN(new Date(val).getTime())) {
      return new Date().toISOString(); // fallback to now
    }
    return new Date(val).toISOString();
  };
  return {
    ...task,
    createdAt: safeDate(task.createdAt),
    updatedAt: safeDate(task.updatedAt),
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
  } as any);

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
    error: 'Task cancelled',
    updatedAt: Date.now(),
  } as any);

  return fromStoredTask({ ...task, cancelled: true, status: 'failed', error: 'Task cancelled' });
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

// Mark task as confirmed (inserted to canvas) to prevent duplicate restore on page reload
export async function markTaskConfirmed(taskId: string): Promise<void> {
  try {
    await db.tasks.update(taskId, {
      confirmed: true,
      updatedAt: Date.now(),
    });
    console.log('[TaskManager] Task marked as confirmed:', taskId);
  } catch (error) {
    console.error('[TaskManager] Failed to mark task as confirmed:', taskId, error);
  }
}

// Subscribe to task changes using Dexie liveQuery
export function subscribeToTasks(
  callback: (tasks: ImageTask[]) => void,
  interval: number = 1000
): () => void {
  let subscription: any = null;

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
