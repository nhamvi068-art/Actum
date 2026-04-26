/**
 * Photo Wall Transforms
 * 照片墙合并的撤销/重做支持
 */

import { PlaitBoard, PlaitElement, Transforms } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { assetStorageService } from '../services/db/asset-storage-service';
import { unifiedCacheService } from '../services/unified-cache-service';
import { insertImageElementWithAssetId } from '../services/image-element-factory';

export interface PhotoWallOperation {
  type: 'merge';
  timestamp: number;
  /** 被合并的原始元素快照 */
  originalElements: PlaitElement[];
  /** 合并后生成的新元素 ID */
  mergedElementId: string;
  /** 新图片的 assetId */
  mergedAssetId: string;
  /** 新图片的尺寸 */
  mergedWidth: number;
  mergedHeight: number;
  /** 新图片的插入位置 */
  insertPosition: [number, number];
}

/**
 * 记录照片墙合并操作（用于撤销）
 */
export function recordPhotoWallMerge(
  board: PlaitBoard,
  operation: Omit<PhotoWallOperation, 'type' | 'timestamp'>
): void {
  const fullOperation: PhotoWallOperation = {
    ...operation,
    type: 'merge',
    timestamp: Date.now(),
  };

  // 存储操作记录（可以使用 board 的属性或全局存储）
  (board as any).__photoWallHistory = (board as any).__photoWallHistory || [];
  (board as any).__photoWallHistory.push(fullOperation);

  console.log('[PhotoWall] Operation recorded:', fullOperation);
}

/**
 * 获取上一次的合并操作
 */
export function getLastPhotoWallOperation(board: PlaitBoard): PhotoWallOperation | null {
  const history = (board as any).__photoWallHistory as PhotoWallOperation[] | undefined;
  if (!history || history.length === 0) {
    return null;
  }
  return history[history.length - 1];
}

/**
 * 撤销照片墙合并
 * 删除合并后的图片，恢复原始图片
 */
export function undoPhotoWallOperation(board: PlaitBoard): boolean {
  const lastOperation = getLastPhotoWallOperation(board);

  if (!lastOperation || lastOperation.type !== 'merge') {
    console.warn('[PhotoWall] No merge operation to undo');
    return false;
  }

  try {
    // Step 1: 删除合并后的新元素
    const mergedElementIndex = board.children.findIndex(
      (child: any) => child.id === lastOperation.mergedElementId
    );

    if (mergedElementIndex >= 0) {
      Transforms.removeNode(board, [mergedElementIndex]);
    }

    // Step 2: 恢复原始元素
    // 按原始顺序在末尾插入
    for (const originalElement of lastOperation.originalElements) {
      const restoredElement = {
        ...originalElement,
        id: (originalElement as any).id || undefined,
      };

      Transforms.insertNode(board, restoredElement as any, [board.children.length]);
    }

    // Step 3: 从历史记录中移除该操作
    const history = (board as any).__photoWallHistory as PhotoWallOperation[];
    history.pop();

    console.log('[PhotoWall] Undo successful');
    return true;
  } catch (error) {
    console.error('[PhotoWall] Undo failed:', error);
    return false;
  }
}

/**
 * 重做照片墙合并
 * 删除已恢复的原始图片，重新执行合并
 */
export function redoPhotoWallOperation(board: PlaitBoard): boolean {
  const history = (board as any).__photoWallHistory as PhotoWallOperation[] | undefined;

  if (!history || history.length === 0) {
    console.warn('[PhotoWall] No operation to redo');
    return false;
  }

  // 获取最后一个操作
  const operationToRedo = history[history.length - 1];

  if (operationToRedo.type !== 'merge') {
    console.warn('[PhotoWall] Last operation is not a merge');
    return false;
  }

  try {
    // Step 1: 删除已恢复的原始元素
    for (const originalElement of operationToRedo.originalElements) {
      const elementIndex = board.children.findIndex(
        (child: any) => child.id === originalElement.id
      );

      if (elementIndex >= 0) {
        Transforms.removeNode(board, [elementIndex]);
      }
    }

    // Step 2: 重新插入合并后的图片
    insertImageElementWithAssetId(
      board,
      operationToRedo.mergedAssetId,
      operationToRedo.mergedWidth,
      operationToRedo.mergedHeight,
      operationToRedo.insertPosition
    );

    console.log('[PhotoWall] Redo successful');
    return true;
  } catch (error) {
    console.error('[PhotoWall] Redo failed:', error);
    return false;
  }
}

/**
 * 清除照片墙历史记录
 */
export function clearPhotoWallHistory(board: PlaitBoard): void {
  (board as any).__photoWallHistory = [];
}

/**
 * 检查是否可以撤销
 */
export function canUndoPhotoWall(board: PlaitBoard): boolean {
  const history = (board as any).__photoWallHistory as PhotoWallOperation[] | undefined;
  return !!history && history.length > 0;
}

/**
 * 获取历史记录长度
 */
export function getPhotoWallHistoryLength(board: PlaitBoard): number {
  const history = (board as any).__photoWallHistory as PhotoWallOperation[] | undefined;
  return history?.length || 0;
}
