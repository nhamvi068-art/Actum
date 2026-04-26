/**
 * 全局任务状态管理 (Global Task Store)
 *
 * 使用模块级状态 + 事件派发机制，支持：
 * 1. 在 React 组件外部（如轮询服务）直接更新状态
 * 2. 在 React 组件内通过 useTaskStore hook 响应式订阅
 */

import { EventEmitter } from '../utils/event-emitter';

export type TaskStatus = 'pending' | 'submitting' | 'generating' | 'success' | 'failure';

export interface GenerationTask {
  id: string;
  status: TaskStatus;
  progress: number;
  prompt: string;
  model?: string;
  aspectRatio?: string;
  imageSize?: string;
  referenceImages?: string[];
  resultUrl?: string;
  originalUrl?: string;
  localAssetId?: string;
  error?: string;
  remoteTaskId?: string;
  placeholderId?: string;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  workspaceId?: string;
}

interface TaskStoreState {
  tasks: Map<string, GenerationTask>;
}

// 模块级单例状态
let storeState: TaskStoreState = {
  tasks: new Map(),
};

// 事件派发器，用于通知状态变化
const eventEmitter = new EventEmitter();

const STORE_EVENTS = {
  TASK_ADDED: 'task:added',
  TASK_UPDATED: 'task:updated',
  TASK_REMOVED: 'task:removed',
  STORE_RESET: 'store:reset',
} as const;

/**
 * 派发任务添加事件
 */
function emitTaskAdded(task: GenerationTask) {
  eventEmitter.emit(STORE_EVENTS.TASK_ADDED, task);
}

/**
 * 派发任务更新事件
 */
function emitTaskUpdated(task: GenerationTask, prevTask?: GenerationTask) {
  eventEmitter.emit(STORE_EVENTS.TASK_UPDATED, task, prevTask);
}

/**
 * 派发任务移除事件
 */
function emitTaskRemoved(taskId: string) {
  eventEmitter.emit(STORE_EVENTS.TASK_REMOVED, taskId);
}

// ============ 核心 CRUD 操作 ============

/**
 * 添加新任务
 */
export function addTask(task: GenerationTask): void {
  const now = Date.now();
  const newTask: GenerationTask = {
    ...task,
    status: task.status || 'pending',
    progress: task.progress ?? 0,
    retryCount: task.retryCount ?? 0,
    createdAt: task.createdAt ?? now,
    updatedAt: now,
  };

  storeState.tasks.set(newTask.id, newTask);
  emitTaskAdded(newTask);
}

/**
 * 更新任务（部分更新）
 */
export function updateTaskMemory(id: string, updates: Partial<GenerationTask>): GenerationTask | undefined {
  const prevTask = storeState.tasks.get(id);
  if (!prevTask) {
    console.warn(`[TaskStore] Task not found: ${id}`);
    return undefined;
  }

  const updatedTask: GenerationTask = {
    ...prevTask,
    ...updates,
    // 确保 progress 不超出 0-100 范围
    progress: updates.progress !== undefined
      ? Math.min(100, Math.max(0, updates.progress))
      : prevTask.progress,
    updatedAt: Date.now(),
  };

  storeState.tasks.set(id, updatedTask);
  emitTaskUpdated(updatedTask, prevTask);
  return updatedTask;
}

/**
 * 更新任务进度
 */
export function updateTaskProgressMemory(id: string, progress: number): GenerationTask | undefined {
  return updateTaskMemory(id, {
    progress: Math.min(100, Math.max(0, progress)),
  });
}

/**
 * 更新任务状态（快捷方法）
 */
export function updateTaskStatusMemory(id: string, status: TaskStatus): GenerationTask | undefined {
  return updateTaskMemory(id, { status });
}

/**
 * 标记任务完成
 */
export function completeTaskMemory(id: string, resultUrl: string, originalUrl?: string): GenerationTask | undefined {
  return updateTaskMemory(id, {
    status: 'success',
    progress: 100,
    resultUrl,
    originalUrl,
  });
}

/**
 * 标记任务失败
 */
export function failTaskMemory(id: string, error: string): GenerationTask | undefined {
  return updateTaskMemory(id, {
    status: 'failure',
    error,
  });
}

/**
 * 移除任务
 */
export function removeTaskMemory(id: string): void {
  if (storeState.tasks.has(id)) {
    storeState.tasks.delete(id);
    emitTaskRemoved(id);
  }
}

/**
 * 获取单个任务
 */
export function getTask(id: string): GenerationTask | undefined {
  return storeState.tasks.get(id);
}

/**
 * 通过 placeholderId 获取关联的任务
 */
export function getTaskByPlaceholderId(placeholderId: string): GenerationTask | undefined {
  for (const task of storeState.tasks.values()) {
    if (task.placeholderId === placeholderId) {
      return task;
    }
  }
  return undefined;
}

/**
 * 获取所有任务（按创建时间倒序）
 */
export function getAllTasksMemory(): GenerationTask[] {
  return Array.from(storeState.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 获取活跃任务（pending/submitting/generating）
 */
export function getActiveTasksMemory(): GenerationTask[] {
  return getAllTasksMemory().filter(t =>
    t.status === 'pending' || t.status === 'submitting' || t.status === 'generating'
  );
}

/**
 * 获取已完成任务
 */
export function getCompletedTasksMemory(): GenerationTask[] {
  return getAllTasksMemory().filter(t => t.status === 'success');
}

/**
 * 获取失败任务
 */
export function getFailedTasksMemory(): GenerationTask[] {
  return getAllTasksMemory().filter(t => t.status === 'failure');
}

/**
 * 清除所有任务
 */
export function clearAllTasksMemory(): void {
  storeState.tasks.clear();
  eventEmitter.emit(STORE_EVENTS.STORE_RESET);
}

/**
 * 清除已完成和失败的任务
 */
export function clearFinishedTasksMemory(): void {
  const finishedIds: string[] = [];
  storeState.tasks.forEach((task, id) => {
    if (task.status === 'success' || task.status === 'failure') {
      finishedIds.push(id);
    }
  });
  finishedIds.forEach(id => removeTaskMemory(id));
}

// ============ 订阅机制 ============

export type TaskEventType =
  | typeof STORE_EVENTS.TASK_ADDED
  | typeof STORE_EVENTS.TASK_UPDATED
  | typeof STORE_EVENTS.TASK_REMOVED
  | typeof STORE_EVENTS.STORE_RESET;

export type TaskEventListener<T = GenerationTask> = (task?: T, prevTask?: GenerationTask) => void;

/**
 * 订阅任务添加事件
 */
export function onTaskAdded(listener: TaskEventListener): () => void {
  eventEmitter.on(STORE_EVENTS.TASK_ADDED, listener);
  return () => eventEmitter.off(STORE_EVENTS.TASK_ADDED, listener);
}

/**
 * 订阅任务更新事件
 */
export function onTaskUpdated(listener: TaskEventListener): () => void {
  eventEmitter.on(STORE_EVENTS.TASK_UPDATED, listener);
  return () => eventEmitter.off(STORE_EVENTS.TASK_UPDATED, listener);
}

/**
 * 订阅任务移除事件
 */
export function onTaskRemoved(listener: (taskId: string) => void): () => void {
  eventEmitter.on(STORE_EVENTS.TASK_REMOVED, listener);
  return () => eventEmitter.off(STORE_EVENTS.TASK_REMOVED, listener);
}

/**
 * 订阅所有任务变化（综合事件）
 */
export function onAnyTaskChange(listener: TaskEventListener): () => void {
  const addedUnsub = onTaskAdded(listener);
  const updatedUnsub = onTaskUpdated(listener);

  return () => {
    addedUnsub();
    updatedUnsub();
  };
}

// ============ 工具函数 ============

/**
 * 生成唯一任务 ID
 */
export function generateTaskIdMemory(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 创建新任务参数
 */
export interface CreateTaskParams {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  imageSize?: string;
  referenceImages?: string[];
  placeholderId?: string;
  workspaceId?: string;
}

/**
 * 快速创建并添加新任务
 */
export function createTaskMemory(params: CreateTaskParams): GenerationTask {
  const task: GenerationTask = {
    id: generateTaskIdMemory(),
    status: 'pending',
    progress: 0,
    prompt: params.prompt,
    model: params.model,
    aspectRatio: params.aspectRatio,
    imageSize: params.imageSize,
    referenceImages: params.referenceImages,
    placeholderId: params.placeholderId,
    workspaceId: params.workspaceId,
    retryCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  addTask(task);
  return task;
}
