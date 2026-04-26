/**
 * Photo Wall Service
 * 多图合并（照片墙）业务整合服务
 *
 * 整合布局计算 + 图片合成 + 资源保存 + 画板更新
 */

import { PlaitBoard, PlaitElement, Transforms, getRectangleByElements, RectangleClient, Point } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { calculatePositionPreservedLayout, calculatePhotoWallLayout, calculateHighResLayout, LayoutResult, GridLayoutOptions, HighResLayoutResult } from './photo-wall-layout';
import { mergeImagesToBlob, mergeHighResImagesToBlob, loadImage, ProgressCallback } from './image-merger';
import { assetStorageService } from './db/asset-storage-service';
import { unifiedCacheService } from './unified-cache-service';
import { insertImageElementWithAssetId } from './image-element-factory';

export interface PhotoWallMergeOptions {
  /** 布局选项 */
  layoutOptions?: GridLayoutOptions;
  /** 进度回调 */
  onProgress?: ProgressCallback;
}

export interface PhotoWallMergeResult {
  /** 新图片元素 ID */
  newElementId: string;
  /** 新图片 assetId */
  newAssetId: string;
  /** 新图片宽度 */
  width: number;
  /** 新图片高度 */
  height: number;
  /** 布局信息 */
  layout: HighResLayoutResult;
  /** 被删除的原始元素 IDs */
  deletedElementIds: string[];
}

export interface PhotoWallHistoryRecord {
  /** 合并操作前的快照 */
  before: {
    selectedElements: PlaitElement[];
    elementSnapshots: Map<string, any>;
  };
  /** 合并后的新元素 */
  after: {
    newElement: PlaitElement;
    newAssetId: string;
  };
  /** 被删除的原始元素 IDs */
  deletedElementIds: string[];
}

/**
 * 检查选中的元素是否全部是图片
 */
export function isAllImagesSelected(selectedElements: PlaitElement[]): boolean {
  if (selectedElements.length === 0) return false;
  return selectedElements.every(PlaitDrawElement.isImage);
}

/**
 * 获取选中图片的基本信息（包含位置信息）
 */
export function getSelectedImageInfos(
  board: PlaitBoard,
  selectedElements: PlaitElement[]
): { id: string; x: number; y: number; width: number; height: number; assetId: string }[] {
  return selectedElements
    .filter(PlaitDrawElement.isImage)
    .map((element: any) => {
      const points = element.points;
      const x = Math.min(points[0][0], points[1][0]);
      const y = Math.min(points[0][1], points[1][1]);
      const width = Math.abs(points[1][0] - points[0][0]);
      const height = Math.abs(points[1][1] - points[0][1]);

      return {
        id: element.id,
        x,
        y,
        width,
        height,
        assetId: element.assetId || '',
      };
    });
}

/**
 * 获取选中元素的中心点
 */
export function getSelectedElementsCenter(
  board: PlaitBoard,
  selectedElements: PlaitElement[]
): Point {
  if (selectedElements.length === 0) {
    return [0, 0];
  }

  const rectangle = getRectangleByElements(board, selectedElements, false);
  const [start, end] = RectangleClient.getPoints(rectangle);

  return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
}

/**
 * 计算新图片的插入位置（居中于选中区域）
 */
export function calculateInsertPosition(
  centerPoint: Point,
  totalWidth: number,
  totalHeight: number
): [number, number] {
  return [
    centerPoint[0] - totalWidth / 2,
    centerPoint[1] - totalHeight / 2,
  ];
}

/**
 * 核心功能：合并多张图片为照片墙
 * 保持图片原始位置和尺寸，按画板坐标合成一张完整图片
 *
 * @param board 画板实例
 * @param selectedElements 选中的图片元素
 * @param options 合并选项
 * @returns 合并结果
 */
export async function mergeImagesToPhotoWall(
  board: PlaitBoard,
  selectedElements: PlaitElement[],
  options: PhotoWallMergeOptions = {}
): Promise<PhotoWallMergeResult> {
  const { layoutOptions = {}, onProgress } = options;

  // Step 1: 提取图片数据（包含位置信息）
  const imageInfos = getSelectedImageInfos(board, selectedElements);

  if (imageInfos.length < 2) {
    throw new Error('需要至少选中 2 张图片才能合并');
  }

  // Step 2: 通过 assetId 获取每个图片的 Blob 并转换为 URL
  onProgress?.({ loaded: 0, total: imageInfos.length, percentage: 0 });

  const imagesWithUrls: { id: string; x: number; y: number; width: number; height: number; url: string; actualImageWidth: number; actualImageHeight: number }[] = [];
  const tempUrls: string[] = [];

  for (let i = 0; i < imageInfos.length; i++) {
    const img = imageInfos[i];

    // 验证 assetId
    if (!img.assetId) {
      console.error('[PhotoWall] Missing assetId for image:', img.id);
      throw new Error(`图片缺少 assetId: ${img.id}`);
    }

    // 从 unifiedCacheService 获取 Blob
    const blob = await unifiedCacheService.getAssetBlob(img.assetId);

    if (!blob) {
      console.error('[PhotoWall] Failed to get blob for assetId:', img.assetId);
      throw new Error(`无法获取图片数据: ${img.assetId}`);
    }

    // 创建临时 URL
    const url = URL.createObjectURL(blob);
    tempUrls.push(url);

    // 加载图片获取实际尺寸（用于保持清晰度）
    const loadedImg = await loadImage(url, true);

    imagesWithUrls.push({
      id: img.id,
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
      url,
      actualImageWidth: loadedImg.naturalWidth,
      actualImageHeight: loadedImg.naturalHeight,
    });

    onProgress?.({
      loaded: i + 1,
      total: imageInfos.length,
      percentage: Math.round(((i + 1) / imageInfos.length) * 50),
    });
  }

  // Step 3: 高保真布局计算（预加载图片获取真实分辨率，计算全局缩放因子）
  const highResLayout = await calculateHighResLayout(
    imagesWithUrls.map((img) => ({
      id: img.id,
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
      url: img.url,
    }))
  );

  // Step 4: 高保真合并图片（使用预加载的图片对象）
  const mergedBlob = await mergeHighResImagesToBlob(highResLayout, onProgress);

  // Step 5: 清理临时 URL（防止内存泄漏）
  tempUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  });

  // Step 6: 上传到 AssetStorage
  const assetId = await assetStorageService.createAssetFromBlob(
    mergedBlob,
    'image/png'
  );

  // 预注入到内存缓存
  unifiedCacheService.setAssetInMemory(assetId, mergedBlob);

  // Step 7: 计算插入位置（合并图片的左上角位置 = 选中区域的左上角）
  const rectangle = getRectangleByElements(board, selectedElements, false);
  const [start] = RectangleClient.getPoints(rectangle);
  const insertPosition: [number, number] = [start[0], start[1]];

  // Step 8: 删除原图片元素
  const deletedElementIds = selectedElements.map((el) => el.id);

  // 使用 Transforms 删除元素
  const indicesToRemove = selectedElements.map((el) => {
    return board.children.findIndex((child: any) => child.id === el.id);
  });

  // 按索引降序删除，避免索引变化问题
  indicesToRemove.sort((a, b) => b - a);
  for (const index of indicesToRemove) {
    if (index >= 0) {
      Transforms.removeNode(board, [index]);
    }
  }

  // Step 9: 插入新图片元素（使用逻辑尺寸，保持与原 bounding box 一致）
  insertImageElementWithAssetId(
    board,
    assetId,
    highResLayout.logicalWidth,
    highResLayout.logicalHeight,
    insertPosition
  );

  // 获取新插入元素的 ID
  const newElementId = board.children[board.children.length - 1]?.id || '';

  return {
    newElementId,
    newAssetId: assetId,
    width: highResLayout.logicalWidth,
    height: highResLayout.logicalHeight,
    layout: highResLayout,
    deletedElementIds,
  };
}

/**
 * 撤销照片墙合并
 * 删除合并后的图片，恢复原始图片
 */
export function undoPhotoWallMerge(
  board: PlaitBoard,
  record: PhotoWallHistoryRecord
): void {
  // Step 1: 删除合并后的新元素
  const newElementIndex = board.children.findIndex(
    (child: any) => child.id === record.after.newElement.id
  );

  if (newElementIndex >= 0) {
    Transforms.removeNode(board, [newElementIndex]);
  }

  // Step 2: 恢复原始元素
  // 原始元素应该在它们原来的位置附近插入
  // 由于无法精确恢复原始位置，我们按原顺序在末尾插入
  const sortedSnapshots = record.before.selectedElements.map((el) => ({
    element: el,
    snapshot: record.before.elementSnapshots.get(el.id),
  }));

  for (const item of sortedSnapshots) {
    if (item.snapshot) {
      Transforms.insertNode(board, item.snapshot as any, [board.children.length]);
    }
  }
}

/**
 * 检查是否可以执行照片墙合并
 */
export function canMergeToPhotoWall(selectedElements: PlaitElement[]): {
  canMerge: boolean;
  reason?: string;
} {
  if (selectedElements.length < 2) {
    return {
      canMerge: false,
      reason: '需要至少选中 2 个元素',
    };
  }

  if (!isAllImagesSelected(selectedElements)) {
    return {
      canMerge: false,
      reason: '只能合并图片元素',
    };
  }

  return { canMerge: true };
}

/**
 * 获取照片墙合并的预览信息
 */
export function getPhotoWallPreview(
  board: PlaitBoard,
  selectedElements: PlaitElement[]
): {
  imageCount: number;
  gridLayout: string;
  estimatedSize: { width: number; height: number };
} | null {
  if (selectedElements.length < 2 || !isAllImagesSelected(selectedElements)) {
    return null;
  }

  const imageInfos = getSelectedImageInfos(board, selectedElements);
  const layout = calculatePositionPreservedLayout(
    imageInfos.map((img) => ({
      id: img.id,
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
      url: '',
    }))
  );

  return {
    imageCount: imageInfos.length,
    gridLayout: '位置保持',
    estimatedSize: {
      width: layout.totalWidth,
      height: layout.totalHeight,
    },
  };
}
