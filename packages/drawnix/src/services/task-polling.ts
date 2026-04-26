/**
 * 任务后台轮询服务 (Task Polling Service)
 *
 * 使用 setInterval 实现非阻塞后台轮询，支持：
 * - 可配置的轮询间隔和超时时间
 * - 主动取消轮询
 * - 自动清理
 * - 与 Task Store 集成
 */

import {
  ImageGenerationAdapter,
  TaskStatusResult,
} from './image-generation-adapter';
import {
  updateTaskProgressMemory,
  updateTaskStatusMemory,
  completeTaskMemory,
  failTaskMemory,
  updateTaskMemory,
} from './task-store';

export interface PollingOptions {
  /** 轮询间隔（毫秒），默认 3000ms */
  pollIntervalMs?: number;
  /** 超时时间（毫秒），默认 300000ms (5分钟) */
  timeoutMs?: number;
  /** 进度回调 */
  onProgress?: (progress: number) => void;
  /** 成功回调 */
  onSuccess?: (imageUrl: string) => void;
  /** 失败回调 */
  onFailure?: (error: string) => void;
}

export interface PollingController {
  /** 停止轮询 */
  stop: () => void;
  /** 是否正在运行 */
  isRunning: () => boolean;
}

// 活跃的轮询任务 Map
const activePollings = new Map<string, ReturnType<typeof setInterval>>();

/**
 * 清理指定 ID 的轮询任务
 */
function clearPolling(taskId: string): void {
  const intervalId = activePollings.get(taskId);
  if (intervalId) {
    clearInterval(intervalId);
    activePollings.delete(taskId);
  }
}

/**
 * 启动任务轮询
 *
 * @param localTaskId 本地任务 ID（Task Store 中的 ID）
 * @param remoteTaskId 远端任务 ID（API 返回的 task_id）
 * @param adapter 图片生成适配器
 * @param options 轮询选项
 * @returns PollingController 控制对象
 */
export function startTaskPolling(
  localTaskId: string,
  remoteTaskId: string,
  adapter: ImageGenerationAdapter,
  options: PollingOptions = {}
): PollingController {
  const {
    pollIntervalMs = 3000,
    timeoutMs = 300000,
    onProgress,
    onSuccess,
    onFailure,
  } = options;

  // 检查是否已有相同 ID 的轮询任务在运行
  if (activePollings.has(localTaskId)) {
    console.warn(`[TaskPolling] Polling already running for task: ${localTaskId}`);
    return {
      stop: () => clearPolling(localTaskId),
      isRunning: () => activePollings.has(localTaskId),
    };
  }

  const startTime = Date.now();
  let isActive = true;

  console.log(`[TaskPolling] Starting polling for task: ${localTaskId}, remoteId: ${remoteTaskId}`);

  const intervalId = setInterval(async () => {
    if (!isActive) {
      clearPolling(localTaskId);
      return;
    }

    // 检查超时
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      console.warn(`[TaskPolling] Task timeout: ${localTaskId}, elapsed: ${elapsed}ms`);
      handleFailure('Task generation timeout');
      return;
    }

    try {
      const t0 = Date.now();
      const result: TaskStatusResult = await adapter.checkStatus(remoteTaskId);
      console.warn(`[TaskPolling] checkStatus took ${Date.now() - t0}ms, status=${result.status}, progress=${result.progress}`);

      // 更新进度
      updateTaskProgressMemory(localTaskId, result.progress);
      onProgress?.(result.progress);

      // 处理不同状态
      switch (result.status) {
        case 'SUCCESS':
          handleSuccess(result.imageUrl || result.b64Json || '');
          break;

        case 'FAILURE':
          handleFailure(result.error || 'Generation failed');
          break;

        case 'IN_PROGRESS':
          // 继续轮询（已在上面更新进度）
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[TaskPolling] Check status error for ${localTaskId}:`, message);
      // 网络错误时继续轮询，不立即失败
      // 可以根据业务需求调整：是否重试 N 次后失败
    }
  }, pollIntervalMs);

  // 保存轮询任务引用
  activePollings.set(localTaskId, intervalId);

  function handleSuccess(imageUrl: string) {
    if (!isActive) return;
    isActive = false;
    clearPolling(localTaskId);

    console.log(`[TaskPolling] Task completed: ${localTaskId}, imageUrl: ${imageUrl}`);

    // 标记任务完成
    completeTaskMemory(localTaskId, imageUrl);

    // 调用 onSuccess 回调，捕获错误防止中断状态同步
    try {
      onSuccess?.(imageUrl);
    } catch (err) {
      console.error('[TaskPolling] onSuccess callback failed:', err);
    }
  }

  function handleFailure(error: string) {
    if (!isActive) return;
    isActive = false;
    clearPolling(localTaskId);

    console.error(`[TaskPolling] Task failed: ${localTaskId}, error: ${error}`);

    // 标记任务失败
    failTaskMemory(localTaskId, error);

    // 调用 onFailure 回调，捕获错误
    try {
      onFailure?.(error);
    } catch (err) {
      console.error('[TaskPolling] onFailure callback failed:', err);
    }
  }

  return {
    stop: () => {
      isActive = false;
      clearPolling(localTaskId);
      console.log(`[TaskPolling] Polling stopped for task: ${localTaskId}`);
    },
    isRunning: () => isActive && activePollings.has(localTaskId),
  };
}

/**
 * 停止指定任务的轮询
 */
export function stopTaskPolling(localTaskId: string): void {
  const controller = activePollings.get(localTaskId);
  if (controller) {
    clearInterval(controller);
    activePollings.delete(localTaskId);
    console.log(`[TaskPolling] Polling stopped for task: ${localTaskId}`);
  }
}

/**
 * 停止所有轮询任务
 */
export function stopAllPolling(): void {
  activePollings.forEach((intervalId, taskId) => {
    clearInterval(intervalId);
    console.log(`[TaskPolling] Stopped polling for task: ${taskId}`);
  });
  activePollings.clear();
}

/**
 * 获取正在轮询的任务数量
 */
export function getActivePollingCount(): number {
  return activePollings.size;
}

/**
 * 检查指定任务是否正在轮询
 */
export function isTaskPolling(localTaskId: string): boolean {
  return activePollings.has(localTaskId);
}

/**
 * 便捷函数：快速启动一个完整的生图轮询流程
 * 将适配器调用和轮询服务组合在一起
 */
export async function startGenerationWithPolling(
  localTaskId: string,
  adapter: ImageGenerationAdapter,
  params: {
    prompt: string;
    model?: string;
    aspect_ratio?: string;
    image_size?: string;
    image?: string[];
  },
  options: PollingOptions = {}
): Promise<string> {
  // 1. 发起生成请求
  const remoteTaskId = await adapter.generate(params);

  console.log(`[TaskPolling] Generation submitted: localId=${localTaskId}, remoteId=${remoteTaskId}`);

  // 2. 更新任务为 generating 状态，保存 remoteTaskId
  updateTaskMemory(localTaskId, { remoteTaskId, status: 'generating' });

  // 3. 启动轮询
  startTaskPolling(localTaskId, remoteTaskId, adapter, options);

  // 4. 返回 remoteTaskId
  return remoteTaskId;
}
