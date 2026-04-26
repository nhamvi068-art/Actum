/**
 * 任务同步服务 (Task Sync Service)
 *
 * 在内存任务（task-store）与 IndexedDB（via db/Dexie）之间搭建同步通道，解决：
 * 1. 内存任务创建后从未写入 IndexedDB，导致 TaskListButton/useTaskQueue 看不到任务
 * 2. 状态枚举不一致：内存用 'success'/'failure'，IndexedDB 用 'completed'/'failed'
 * 3. 图片 URL 丢失：completeTaskMemory 设置 resultUrl，但 IndexedDB 需要 resultImageUrl
 *
 * 注意：直接使用 db（Dexie 实例）而非 task-manager 导出函数，
 * 因为需要灵活地增量写入/创建（task-manager 的 createTask 有固定签名）。
 */

import { db } from './db/app-database';
import { GenerationTask, onTaskAdded, onTaskUpdated } from './task-store';
import { assetStorageService } from './db/asset-storage-service';
import { nanoid } from 'nanoid';

export type SyncTaskStatus = 'pending' | 'submitting' | 'generating' | 'completed' | 'failed';

let isInitialized = false;

/**
 * 初始化同步服务
 * 监听 task-store 的事件，自动将内存任务同步到 IndexedDB
 */
export function initTaskSyncService(): void {
  if (isInitialized) return;
  isInitialized = true;

  // 监听任务添加事件：当 handleGenerateImage 创建内存任务时，同步到 IndexedDB
  onTaskAdded((task: GenerationTask) => {
    syncTaskToIndexedDB(task).catch(err => {
      console.error('[TaskSync] Failed to sync new task to IndexedDB:', err);
    });
  });

  // 监听任务更新事件：进度/状态/结果变化时同步到 IndexedDB
  onTaskUpdated((task: GenerationTask) => {
    syncTaskToIndexedDB(task).catch(err => {
      console.error('[TaskSync] Failed to sync task update to IndexedDB:', err);
    });
  });

  console.log('[TaskSync] Task sync service initialized');
}

/** 将内存 TaskStatus 映射到 IndexedDB 状态 */
function mapStatus(status: GenerationTask['status']): SyncTaskStatus {
  if (status === 'success') return 'completed';
  if (status === 'failure') return 'failed';
  return status as SyncTaskStatus;
}

/** 将 ImageTask 格式写入 IndexedDB（兼容 task-manager 的存储格式） */
async function writeTaskRecord(taskId: string, data: Record<string, any>): Promise<void> {
  const existing = await db.tasks.get(taskId);
  if (existing) {
    await db.tasks.update(taskId, { ...data, updatedAt: Date.now() });
  } else {
    await db.tasks.add({ id: taskId, ...data } as any);
  }
}

/**
 * 将内存任务同步到 IndexedDB
 * 通过 db.tasks（兼容 task-manager 的 toStoredTask 格式）写入
 */
async function syncTaskToIndexedDB(task: GenerationTask): Promise<void> {
  try {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const indexedStatus = mapStatus(task.status);

    const existing = await db.tasks.get(task.id);

    if (existing) {
      // 增量更新：只写变化的字段，避免覆盖外部已设置的 placeholderInfo 等字段
      const updates: Record<string, any> = {
        status: indexedStatus,
        updatedAt: now,
      };

      if (task.progress !== undefined) {
        updates.progress = task.progress;
      }
      if (task.resultUrl) {
        updates.resultImageUrl = task.resultUrl;
      }
      if (task.originalUrl) {
        updates.originalUrl = task.originalUrl;
      }
      if (task.localAssetId) {
        updates.localAssetId = task.localAssetId;
      }
      if (task.error) {
        updates.error = task.error;
      }
      if (task.model) {
        updates.model = task.model;
      }
      if (task.aspectRatio) {
        updates.aspectRatio = task.aspectRatio;
      }
      if (task.imageSize) {
        updates.imageSize = task.imageSize;
      }
      if (task.referenceImages) {
        updates.referenceImages = task.referenceImages;
      }
      if (task.workspaceId) {
        updates.workspaceId = task.workspaceId;
        updates.projectId = task.workspaceId; // 确保两个字段都同步
      }
      if (task.prompt) {
        updates.prompt = task.prompt;
      }
      if (task.remoteTaskId) {
        updates.remoteTaskId = task.remoteTaskId;
      }

      console.log('[TaskSync] Updating task in IndexedDB:', task.id, {
        status: indexedStatus,
        workspaceId: task.workspaceId,
        hasExisting: true
      });
      await db.tasks.update(task.id, updates);
    } else {
      // 新建任务：完整的 TaskData 格式
      const storedTask: any = {
        id: task.id,
        type: 'image_generation' as const,
        status: indexedStatus,
        prompt: task.prompt,
        model: task.model || '',
        progress: task.progress ?? 0,
        params: {
          aspect_ratio: task.aspectRatio,
          image_size: task.imageSize,
          images: task.referenceImages,
        },
        result: task.resultUrl ? {
          remoteUrl: task.resultUrl,
          type: 'image',
        } : undefined,
        error: task.error,
        retryCount: task.retryCount ?? 0,
        createdAt: typeof task.createdAt === 'number' ? task.createdAt : new Date(task.createdAt).getTime(),
        updatedAt: now,
        workspaceId: task.workspaceId,
        // 扩展字段（供 app.tsx 使用）
        resultImageUrl: task.resultUrl,
        originalUrl: task.originalUrl,
        localAssetId: task.localAssetId,
        aspectRatio: task.aspectRatio || '1:1',
        imageSize: task.imageSize,
        referenceImages: task.referenceImages,
        placeholderInfo: task.placeholderId ? {
          id: task.placeholderId,
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          aspectRatio: task.aspectRatio || '1:1',
          status: indexedStatus,
        } : undefined,
        projectId: task.workspaceId || '',
        createdAt2: nowIso,
        updatedAt2: nowIso,
      };

      console.log('[TaskSync] Creating new task in IndexedDB:', task.id, {
        status: indexedStatus,
        workspaceId: task.workspaceId,
        prompt: task.prompt
      });

      // 清除重复的 createdAt/updatedAt（上面已有 number 版本）
      delete (storedTask as any).createdAt2;
      delete (storedTask as any).updatedAt2;

      await db.tasks.add(storedTask);
    }
  } catch (err) {
    console.error('[TaskSync] Error syncing task to IndexedDB:', task.id, err);
  }
}

/**
 * 同步任务完成状态（图片 URL + 可选本地 assetId）
 * 由 startTaskPolling 的 onSuccess 回调调用
 */
export async function syncTaskComplete(
  taskId: string,
  imageUrl: string,
  options: { originalUrl?: string; localAssetId?: string; placeholderInfo?: any; projectId?: string } = {}
): Promise<void> {
  try {
    const now = Date.now();

    // 【防护】只将 defined 的字段写入 IndexedDB，避免 undefined 覆盖已有值
    const updates: Record<string, any> = {
      type: 'image_generation',
      status: 'completed',
      resultImageUrl: imageUrl,
      originalUrl: options.originalUrl || imageUrl,
      progress: 100,
      result: { remoteUrl: imageUrl, type: 'image' },
      placeholderInfo: options.placeholderInfo,
      projectId: options.projectId || '',
      workspaceId: options.projectId,
      updatedAt: now,
    };

    // localAssetId 可能是 undefined，展开时只加入 defined 的值
    if (options.localAssetId !== undefined) {
      updates.localAssetId = options.localAssetId;
    }

    await writeTaskRecord(taskId, updates);
    console.log('[TaskSync] Task completed sync done:', taskId, 'localAssetId:', options.localAssetId);
  } catch (err) {
    console.error('[TaskSync] Failed to sync task complete:', taskId, err);
  }
}

/**
 * 同步任务失败状态
 */
export async function syncTaskFailure(taskId: string, error: string): Promise<void> {
  try {
    await writeTaskRecord(taskId, {
      type: 'image_generation',
      status: 'failed',
      error,
      progress: 0,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[TaskSync] Failed to sync task failure:', taskId, err);
  }
}

/**
 * 同步任务进度
 */
export async function syncTaskProgress(taskId: string, progress: number): Promise<void> {
  try {
    const existing = await db.tasks.get(taskId);
    if (existing) {
      await db.tasks.update(taskId, {
        progress: Math.min(100, Math.max(0, progress)),
        updatedAt: Date.now(),
      });
    }
  } catch (err) {
    // 进度同步失败不影响主流程，静默处理
  }
}

/**
 * 同步任务完成时的占位符信息（canvas 实际尺寸）
 *
 * 问题：app.tsx 中 handleGenerateImage 创建任务时写入的 placeholderInfo 是 Card 尺寸，
 * drawnix.tsx 中计算出的实际 canvas 尺寸从未同步到 IndexedDB。
 * 导致 handleConfirmInsert / handleSendTaskToCanvas 使用错误的尺寸。
 *
 * 解决：在 handleImageGenerated 成功插入图片后，同步 canvas 实际尺寸到 IndexedDB。
 */
export async function syncTaskPlaceholder(
  taskId: string,
  canvasInfo: {
    x: number;
    y: number;
    width: number;
    height: number;
    imageUrl?: string;
    prompt?: string;
    model?: string;
    aspect_ratio?: string;
    image_size?: string;
    referenceImages?: string[];
  }
): Promise<void> {
  try {
    const existing = await db.tasks.get(taskId);
    if (existing) {
      const placeholderInfo = {
        id: taskId,
        x: canvasInfo.x,
        y: canvasInfo.y,
        width: canvasInfo.width,
        height: canvasInfo.height,
        aspectRatio: canvasInfo.aspect_ratio || '1:1',
        imageUrl: canvasInfo.imageUrl,
        status: 'completed' as const,
        prompt: canvasInfo.prompt,
        model: canvasInfo.model,
        aspect_ratio: canvasInfo.aspect_ratio,
        image_size: canvasInfo.image_size,
        referenceImages: canvasInfo.referenceImages,
      };
      await db.tasks.update(taskId, {
        placeholderInfo,
        updatedAt: Date.now(),
      });
      console.log('[TaskSync] Synced canvas placeholder info to IndexedDB:', taskId);
    }
  } catch (err) {
    console.error('[TaskSync] Failed to sync placeholder info:', taskId, err);
  }
}

/**
 * 同步新任务创建（主动调用，用于 handleGenerateImage 之后）
 */
export async function syncNewTask(task: GenerationTask): Promise<void> {
  await syncTaskToIndexedDB(task);
}

/**
 * 保存图片到本地缓存，返回 assetId
 * 将 resultUrl (Base64/远程 URL) 存储为 IndexedDB Asset，
 * 这样即使远程 URL 失效，图片仍可通过 localAssetId 从本地读取
 */
export async function cacheImageAsset(
  imageUrl: string,
  taskId: string
): Promise<string | undefined> {
  try {
    let blob: Blob;
    let mimeType: string;

    // 策略1：Base64 格式
    if (imageUrl.startsWith('data:')) {
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return undefined;

      mimeType = matches[1];
      const base64Data = matches[2];

      const byteString = atob(base64Data);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([ab], { type: mimeType });

      void base64Data;
      void byteString;
      void ab;
      void ia;
    }
    // 策略2：远程 HTTPS URL（即使有 CORS 限制也尝试缓存）
    else if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
      console.log('[TaskSync] cacheImageAsset: attempting to fetch remote URL:', imageUrl);
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.warn('[TaskSync] cacheImageAsset: failed to fetch remote URL, status:', response.status);
        return undefined;
      }
      blob = await response.blob();
      mimeType = response.headers.get('Content-Type') || 'image/png';
      console.log('[TaskSync] cacheImageAsset: remote URL fetched, size:', (blob.size / 1024).toFixed(1) + 'KB');
    } else {
      return undefined;
    }

    const assetId = `asset_${taskId}_${nanoid(8)}`;

    // 保存到 IndexedDB（只存 blob，不存 dataUrl，节省内存）
    await assetStorageService.saveAsset({
      id: assetId,
      type: 'image',
      mimeType,
      blob,
      size: blob.size,
    });

    console.log('[TaskSync] Image cached to IndexedDB asset:', assetId, 'size:', (blob.size / 1024).toFixed(1) + 'KB');
    return assetId;
  } catch (err) {
    console.error('[TaskSync] Failed to cache image asset:', taskId, err);
    return undefined;
  }
}
