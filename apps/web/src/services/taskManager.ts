import localforage from 'localforage';

// Task status enum
export type TaskStatus = 'pending' | 'generating' | 'completed' | 'failed';

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

// Image task interface
export interface ImageTask {
  id: string;
  status: TaskStatus;
  prompt: string;
  model: string;
  aspectRatio: string;
  imageSize?: string;
  referenceImages?: string[];
  placeholderInfo: PlaceholderInfo;
  resultImageUrl?: string;
  error?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  projectId: string;
}

// Storage key
const TASKS_KEY = 'image_generation_tasks';

// Configure localforage
localforage.config({
  name: 'Drawnix',
  storeName: 'drawnix_store',
});

// Generate unique task ID
export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get all tasks
export async function getAllTasks(): Promise<ImageTask[]> {
  try {
    const tasks = await localforage.getItem<ImageTask[]>(TASKS_KEY);
    return tasks || [];
  } catch (error) {
    console.error('Failed to get tasks:', error);
    return [];
  }
}

// Get task by ID
export async function getTaskById(taskId: string): Promise<ImageTask | null> {
  const tasks = await getAllTasks();
  return tasks.find(t => t.id === taskId) || null;
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

// Save all tasks
async function saveTasks(tasks: ImageTask[]): Promise<void> {
  try {
    await localforage.setItem(TASKS_KEY, tasks);
  } catch (error) {
    console.error('Failed to save tasks:', error);
  }
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
  const tasks = await getAllTasks();
  
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectId,
  };
  
  tasks.push(newTask);
  await saveTasks(tasks);
  
  return newTask;
}

// Update task status
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  resultImageUrl?: string,
  error?: string
): Promise<ImageTask | null> {
  const tasks = await getAllTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex === -1) {
    return null;
  }
  
  const task = tasks[taskIndex];
  task.status = status;
  task.updatedAt = new Date().toISOString();
  
  if (resultImageUrl) {
    task.resultImageUrl = resultImageUrl;
    task.placeholderInfo.imageUrl = resultImageUrl;
  }
  
  if (error) {
    task.error = error;
  }
  
  tasks[taskIndex] = task;
  await saveTasks(tasks);
  
  return task;
}

// Update task placeholder info
export async function updateTaskPlaceholder(
  taskId: string,
  placeholderInfo: PlaceholderInfo
): Promise<ImageTask | null> {
  const tasks = await getAllTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex === -1) {
    return null;
  }
  
  const task = tasks[taskIndex];
  task.placeholderInfo = placeholderInfo;
  task.updatedAt = new Date().toISOString();
  
  tasks[taskIndex] = task;
  await saveTasks(tasks);
  
  return task;
}

// Increment retry count
export async function incrementRetryCount(taskId: string): Promise<ImageTask | null> {
  const tasks = await getAllTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex === -1) {
    return null;
  }
  
  const task = tasks[taskIndex];
  task.retryCount += 1;
  task.updatedAt = new Date().toISOString();
  
  tasks[taskIndex] = task;
  await saveTasks(tasks);
  
  return task;
}

// Delete task
export async function deleteTask(taskId: string): Promise<boolean> {
  const tasks = await getAllTasks();
  const filteredTasks = tasks.filter(t => t.id !== taskId);
  
  if (filteredTasks.length === tasks.length) {
    return false;
  }
  
  await saveTasks(filteredTasks);
  return true;
}

// Clear completed and failed tasks
export async function clearFinishedTasks(projectId?: string): Promise<number> {
  const tasks = await getAllTasks();
  const tasksToKeep = tasks.filter(t => {
    if (projectId && t.projectId !== projectId) {
      return true;
    }
    return t.status === 'pending' || t.status === 'generating';
  });
  
  const clearedCount = tasks.length - tasksToKeep.length;
  await saveTasks(tasksToKeep);
  
  return clearedCount;
}

// Clear all tasks
export async function clearAllTasks(): Promise<void> {
  await saveTasks([]);
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

// Subscribe to task changes (simple implementation using polling)
export function subscribeToTasks(
  callback: (tasks: ImageTask[]) => void,
  interval: number = 1000
): () => void {
  let isActive = true;
  
  const poll = async () => {
    if (!isActive) return;
    const tasks = await getAllTasks();
    callback(tasks);
  };
  
  // Initial call
  poll();
  
  // Set up interval
  const intervalId = setInterval(poll, interval);
  
  // Return cleanup function
  return () => {
    isActive = false;
    clearInterval(intervalId);
  };
}
