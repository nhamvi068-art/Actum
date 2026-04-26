import {
  getHitElementByPoint,
  PlaitBoard,
  Point,
  Transforms,
  idCreator,
  toViewBoxPoint,
  toHostPoint,
} from '@plait/core';
import { CanvasImageItem } from '../types/ImageItem';
import { getDataURL } from './blob';
import { MindElement, MindTransforms } from '@plait/mind';
import { getElementOfFocusedImage } from '@plait/common';
import { assetStorageService } from '../services/db/asset-storage-service';
import { unifiedCacheService } from '../services/unified-cache-service';
import { compressImageBeforeUpload } from '../utils/image-compressor';
import { nanoid } from 'nanoid';

/**
 * 加载 HTML 图片元素
 */
export const loadHTMLImageElement = (dataURL: string): Promise<HTMLImageElement> => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (error) => reject(error);
    image.src = dataURL;
  });
};

/**
 * 构建图片元素数据
 *
 * 【重要】此函数不再设置 url 字段！
 * 单一数据源原则：Model 层只存 assetId，渲染层通过 getAssetBlob() 获取 Blob
 *
 * @param image HTML 图片元素
 * @param assetId IndexedDB 资产 ID
 * @param maxWidth 最大宽度
 * @returns CanvasImageItem
 */
export const buildImage = (
  image: HTMLImageElement,
  assetId: string,
  maxWidth: number
): CanvasImageItem => {
  const width = image.width > maxWidth ? maxWidth : image.width;
  const height = (width / image.width) * image.height;
  return {
    id: '',
    assetId,
    width,
    height,
    // 注意：不再设置 url 字段！
    // Model 层只存 assetId，渲染层通过 unifiedCacheService.getAssetBlob() 获取 Blob
  };
};

/**
 * 【新增】强制安全数值
 * 确保宽高是有限的正数，否则返回默认值
 */
function sanitizeDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

/**
 * 插入图片到画板
 *
 * 【三阶段架构】
 * Phase 1（同步）：预注入内存 + 获取真实尺寸（await getDataURL + loadHTMLImageElement）
 * Phase 2（同步）：验证尺寸有效后插入画板
 * Phase 3（异步）：后台压缩+落盘，不阻塞用户操作
 *
 * @param board 画板实例
 * @param imageFile 图片文件
 * @param startPoint 插入位置
 * @param isDrop 是否为拖拽插入
 */
export const insertImage = async (
  board: PlaitBoard,
  imageFile: File,
  startPoint?: Point,
  isDrop?: boolean
) => {
  const selectedElement =
    board.getSelectedElements()[0] || getElementOfFocusedImage(board);
  const defaultImageWidth = selectedElement ? 240 : 400;

  // ========== 【Phase 1: 获取真实尺寸 + 预注入】==========

  // 1. nanoid
  const assetId = nanoid();

  // 2. 【立即预注入内存】（不阻塞，用户操作不受影响）
  unifiedCacheService.setAssetInMemory(assetId, imageFile);
  console.log('[Insert] Phase1: Pre-injected to memory');

  // 3. 【获取真实尺寸】（必须 await，File 没有宽高属性）
  const dataURL = await getDataURL(imageFile);
  const image = await loadHTMLImageElement(dataURL);
  console.log('[Insert] Phase1: Loaded image dimensions:', { width: image.width, height: image.height });

  // ========== 【Phase 2: 构建元素并插入】==========

  const originalWidth = image.width;
  const originalHeight = image.height;

  // ========== 【除零防御】必须先于任何除法计算 ==========
  if (originalWidth === 0 || originalHeight === 0 || !Number.isFinite(originalWidth) || !Number.isFinite(originalHeight)) {
    console.error('[Insert] ABORT — image has invalid dimensions:', { originalWidth, originalHeight }, 'falling back to default size');
    const fallbackItem: CanvasImageItem = {
      id: '',
      assetId,
      url: '',
      width: defaultImageWidth,
      height: defaultImageWidth,
    };
    const element = startPoint && getHitElementByPoint(board, startPoint);
    if (isDrop && element && MindElement.isMindElement(board, element)) {
      MindTransforms.setImage(board, element as MindElement, fallbackItem);
    } else if (selectedElement && MindElement.isMindElement(board, selectedElement) && !isDrop) {
      MindTransforms.setImage(board, selectedElement as MindElement, fallbackItem);
    } else {
      // 绕过 DrawTransforms.insertImage，直接用 Transforms.insertNode 透传 assetId
      insertImageNodeDirectly(board, assetId, fallbackItem.width, fallbackItem.height, startPoint);
    }
    return;
  }

  // 4. 根据真实尺寸计算最终尺寸
  const targetWidth = originalWidth > defaultImageWidth ? defaultImageWidth : originalWidth;
  const targetHeight = (targetWidth / originalWidth) * originalHeight;

  console.log('[Insert] Phase1: Creating imageItem with:', { assetId, width: targetWidth, height: targetHeight });

  // 5. 【双重防御】确保宽高是有效数字
  const safeWidth = sanitizeDimension(targetWidth, defaultImageWidth);
  const safeHeight = sanitizeDimension(targetHeight, defaultImageWidth);

  const imageItem: CanvasImageItem = {
    id: '',
    assetId,
    url: '',
    width: safeWidth,
    height: safeHeight,
  };

  // 6. 插入画板（绕过 DrawTransforms.insertImage，直接用 Transforms.insertNode 透传 assetId）
  const element = startPoint && getHitElementByPoint(board, startPoint);
  if (isDrop && element && MindElement.isMindElement(board, element)) {
    MindTransforms.setImage(board, element as MindElement, imageItem);
    console.log('[Insert] Phase1: Inserted via MindTransforms.setImage');
  } else if (
    selectedElement &&
    MindElement.isMindElement(board, selectedElement) &&
    !isDrop
  ) {
    MindTransforms.setImage(board, selectedElement as MindElement, imageItem);
    console.log('[Insert] Phase1: Inserted via MindTransforms.setImage');
  } else {
    insertImageNodeDirectly(board, assetId, safeWidth, safeHeight, startPoint);
    console.log('[Insert] Phase1: Inserted via raw Transforms.insertNode with assetId');
  }

  // ========== 【Phase 3: 后台异步处理】==========
  // 压缩+落盘，不阻塞

  (async () => {
    try {
      const compressedBlob = await compressImageBeforeUpload(imageFile);

      // 先等待 IndexedDB 保存完成，确保数据落地后再更新内存缓存
      await assetStorageService.saveAsset({
        id: assetId,
        type: 'image',
        mimeType: 'image/webp',
        blob: compressedBlob,
        size: compressedBlob.size,
        width: safeWidth,
        height: safeHeight,
      });

      // IndexedDB 保存成功后再更新内存缓存
      unifiedCacheService.setAssetInMemory(assetId, compressedBlob);

      console.log('[Insert] Phase3: Complete for assetId:', assetId);
    } catch (e) {
      console.error('[insertImage] Phase3: Error:', e);
    }
  })();
};

/**
 * ============================================================
 * 【底层核心】直接插入包含 assetId 的图片节点
 *
 * 绕开 DrawTransforms.insertImage 的 Schema Drop。
 * 原生 insertImage 只解构 {width, height, url}，丢弃 assetId。
 * 此函数直接构建包含 assetId 的 PlaitImage 对象，
 * 通过 Transforms.insertNode 绕开外层封装的属性过滤。
 * ============================================================
 */
function insertImageNodeDirectly(
  board: PlaitBoard,
  assetId: string,
  width: number,
  height: number,
  startPoint?: Point
): void {
  const viewportWidth = PlaitBoard.getBoardContainer(board).clientWidth;
  const viewportHeight = PlaitBoard.getBoardContainer(board).clientHeight;
  const centerPoint = toViewBoxPoint(board, toHostPoint(board, viewportWidth / 2, viewportHeight / 2));

  const points: [[number, number], [number, number]] = startPoint
    ? [startPoint, [startPoint[0] + width, startPoint[1] + height]]
    : [
        [centerPoint[0] - width / 2, centerPoint[1] - height / 2],
        [centerPoint[0] + width / 2, centerPoint[1] + height / 2],
      ];

  const imageElement = {
    id: idCreator(),
    type: 'image' as const,
    assetId, // 核心透传！
    points,
    url: '', // Model 层只存 assetId，url 永远为空
    angle: 0,
  };

  Transforms.insertNode(board, imageElement as any, [board.children.length]);
}
