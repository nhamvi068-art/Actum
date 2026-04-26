/**
 * 图片元素全局工厂服务
 *
 * 【单一工厂模式】所有图片插入路径必须通过此工厂创建规范化的画布元素数据。
 * 此服务将任何来源的图片（File / Blob / Base64 / HTTP URL）统一转换为：
 *   - assetId（IndexedDB 持久化 ID）
 *   - width / height（安全数值）
 *   - url: ''（Model 层不存储运行时 URL）
 *
 * 这样做到了：
 * 1. 统一资产 ID 生成
 * 2. 统一压缩管线（compressImageBeforeUpload）
 * 3. 统一预注入内存（setAssetInMemory）
 * 4. 统一异步落盘（assetStorageService.saveAsset）
 * 5. 彻底消灭 Base64/Blob URL 直接塞进画板 JSON 的后门
 *
 * ============================================================
 * 【重要】所有图片创建代码必须调用此工厂，不允许：
 * ❌ 直接构造 { url: 'data:image/...', width, height }
 * ❌ 直接构造 { uri: blobUrl, width, height }
 * ✅ 一律通过 createStandardImageElement() 或 createImageElementFromFile()
 * ============================================================
 */

import { nanoid } from 'nanoid';
import { CanvasImageItem } from '../types/ImageItem';
import { getDataURL } from '../data/blob';
import { loadHTMLImageElement } from '../data/image';
import { unifiedCacheService } from './unified-cache-service';
import { assetStorageService } from './db/asset-storage-service';
import { compressImageBeforeUpload } from '../utils/image-compressor';
import { PlaitBoard, Transforms, idCreator, toViewBoxPoint, toHostPoint } from '@plait/core';

/** 默认插入尺寸 */
export const DEFAULT_IMAGE_WIDTH = 400;
export const DEFAULT_IMAGE_WIDTH_INSET = 240;

/** 默认 MIME 类型 */
const DEFAULT_MIME_TYPE = 'image/webp';

/**
 * 将任何来源的图片转换为标准画布元素数据（工厂核心函数）
 *
 * @param source 图片来源
 *   - string: HTTP URL 或 Base64 dataURL
 *   - Blob: 已有 Blob 数据
 *   - File: 用户选择的文件
 * @param options.width 强制指定宽度（可选，用于切图等场景）
 * @param options.height 强制指定高度（可选，用于切图等场景）
 * @returns 标准 CanvasImageItem 数据（assetId 必有，url 永远为空字符串）
 */
export async function createStandardImageElement(
  source: File | Blob | string,
  options?: {
    width?: number;
    height?: number;
  }
): Promise<CanvasImageItem> {
  const assetId = nanoid();

  // Step 1: 获取原始 Blob
  const originalBlob = await resolveToBlob(source);
  if (!originalBlob) {
    throw new Error('[ImageFactory] Failed to resolve source to Blob');
  }

  // Step 2: 测量原生尺寸（防 NaN）
  const { width: naturalWidth, height: naturalHeight } = await measureImageDimensions(originalBlob);

  // Step 3: 如果调用方强制指定尺寸，使用指定值；否则使用原生尺寸
  const finalWidth = options?.width ?? naturalWidth;
  const finalHeight = options?.height ?? naturalHeight;

  // Step 4: 强制安全数值
  const safeWidth = sanitizeDimension(finalWidth);
  const safeHeight = sanitizeDimension(finalHeight);

  // Step 5: 预注入内存（Phase 1）
  unifiedCacheService.setAssetInMemory(assetId, originalBlob);

  // Step 6: 异步压缩 + 落盘（Phase 2，不阻塞调用方）
  persistAsset(assetId, originalBlob, safeWidth, safeHeight);

  // Step 7: 返回严格符合 CanvasImageItem 接口的数据
  return {
    id: '',
    assetId,
    url: '', // 永远是空字符串！Model 层只存 assetId
    width: safeWidth,
    height: safeHeight,
  };
}

/**
 * 从 File 创建标准画布元素（简写）
 * 等价于 createStandardImageElement(file)
 */
export async function createImageElementFromFile(file: File): Promise<CanvasImageItem> {
  return createStandardImageElement(file);
}

/**
 * 插入标准图片元素到画板（两阶段插入，参考 data/image.ts 的 insertImage 模式）
 *
 * 【两阶段架构】
 * Phase 1（预注入）：Blob 解析完成后立即存入缓存（在任何树变更之前）
 * Phase 2（插入）：Transforms.insertNode 同步执行，元素进入树时 blob 已就绪
 *
 * 【关键设计】元素进入树时，渲染层已经能通过 getAssetBlob 获取数据。
 * - 同步路径（Blob/File/dataURL）：预注入在 await 之前，元素插入有 blob
 * - 异步路径（HTTP URL）：fetch 完成后立即预注入，然后才插入元素
 *
 * 【重要】此函数在交互事件处理中调用，必须确保 blob 在树变更前进入缓存。
 *
 * @param board 画板实例
 * @param source 图片来源
 * @param position 插入位置
 * @param options 额外选项
 */
export async function insertStandardImage(
  board: PlaitBoard,
  source: File | Blob | string,
  position?: [number, number],
  options?: {
    width?: number;
    height?: number;
    assetId?: string; // 【新增】允许外部传入已有 assetId
  }
): Promise<CanvasImageItem> {
  // ========== 【Phase 1: 解析 Blob（同步源立即，异步源异步）】==========

  const assetId = options?.assetId || nanoid();
  const defaultImageWidth = DEFAULT_IMAGE_WIDTH;

  // 【尝试同步获取 Blob（Blob/File/dataURL 可以立即获取）】
  let immediateBlob: Blob | null = null;
  if (source instanceof Blob) {
    immediateBlob = source;
  } else if (typeof source === 'string' && source.startsWith('data:')) {
    immediateBlob = dataURLToBlob(source);
  }

  let originalBlob: Blob;
  let needsAsyncFetch = false;

  if (immediateBlob) {
    // 【同步路径】blob 立即可用
    originalBlob = immediateBlob;
    // 立即预注入（在任何 await 之前！）
    unifiedCacheService.setAssetInMemory(assetId, originalBlob);
  } else {
    // 【异步路径】HTTP URL 需要 fetch
    needsAsyncFetch = true;
    // 开始 fetch（不 await，保留微任务顺序）
    const blobPromise = resolveToBlob(source);
    // 先 await fetch 完成
    originalBlob = await blobPromise;
    if (!originalBlob) {
      throw new Error('[insertStandardImage] Failed to resolve source to Blob');
    }
    // fetch 完成后立即预注入（在树变更之前！）
    unifiedCacheService.setAssetInMemory(assetId, originalBlob);
  }

  // ========== 【Phase 2: 获取尺寸 + 构建 + 插入（同步）】==========

  // 获取真实尺寸（必须 await，Blob/File 没有宽高属性）
  const { width: naturalWidth, height: naturalHeight } = await measureImageDimensions(originalBlob);

  // 计算最终尺寸：保持图片原始比例，以 options 为上限进行缩放
  const naturalRatio = naturalWidth / naturalHeight;

  const containerWidth = options?.width ?? naturalWidth;
  const containerHeight = options?.height ?? naturalHeight;
  const containerRatio = containerWidth / containerHeight;

  let finalWidth: number, finalHeight: number;
  if (naturalRatio > containerRatio) {
    // 图片更宽：以容器宽度为准
    finalWidth = containerWidth;
    finalHeight = containerWidth / naturalRatio;
  } else {
    // 图片更高或等比：以容器高度为准
    finalHeight = containerHeight;
    finalWidth = containerHeight * naturalRatio;
  }
  const safeWidth = sanitizeDimension(finalWidth, defaultImageWidth);
  const safeHeight = sanitizeDimension(finalHeight, defaultImageWidth);

  // 构建完整的 imageElement（绕过 DrawTransforms.insertImage，直接使用 Transforms.insertNode）
  // 【关键】必须将 assetId 透传到 element 中！
  const newImageElement = buildImageElementWithAssetId(
    board,
    assetId,
    safeWidth,
    safeHeight,
    position
  );
  // 同步插入——元素进入树时 blob 已经在缓存中
  Transforms.insertNode(board, newImageElement as any, [board.children.length]);

  // 异步压缩+落盘（不阻塞）
  persistAsset(assetId, originalBlob, safeWidth, safeHeight);

  return {
    id: '',
    assetId,
    url: '',
    width: safeWidth,
    height: safeHeight,
  };
}

/**
 * 【内部工具】将任何来源解析为 Blob
 *
 * - string (http/https): fetch 下载 → Blob
 * - string (data:image/...): base64 解码 → Blob
 * - Blob / File: 直接返回
 */
async function resolveToBlob(source: File | Blob | string): Promise<Blob | null> {
  if (source instanceof Blob) {
    return source;
  }

  if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      // Base64 / DataURL → Blob
      return dataURLToBlob(source);
    }

    if (source.startsWith('http://') || source.startsWith('https://')) {
      // HTTP/HTTPS URL → fetch → Blob
      try {
        const response = await fetch(source);
        if (!response.ok) {
          console.error('[ImageFactory] fetch failed:', response.status, source);
          return null;
        }
        return await response.blob();
      } catch (e) {
        console.error('[ImageFactory] fetch error:', e);
        return null;
      }
    }

    console.warn('[ImageFactory] Unknown string source format, treating as empty:', source.substring(0, 50));
    return null;
  }

  return null;
}

/**
 * 【内部工具】从 Blob / File 测量图片尺寸
 */
async function measureImageDimensions(blob: Blob | File): Promise<{ width: number; height: number }> {
  const dataURL = await getDataURL(blob);
  const image = await loadHTMLImageElement(dataURL);

  const w = image.width;
  const h = image.height;

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    console.warn('[ImageFactory] Invalid image dimensions from measure:', { w, h }, 'using default');
    return { width: DEFAULT_IMAGE_WIDTH, height: DEFAULT_IMAGE_WIDTH };
  }

  return { width: w, height: h };
}

/**
 * 【内部工具】Base64 / DataURL → Blob
 */
function dataURLToBlob(dataURL: string): Blob | null {
  try {
    const arr = dataURL.split(',');
    if (arr.length < 2) return null;

    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';

    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error('[ImageFactory] dataURLToBlob error:', e);
    return null;
  }
}

/**
 * 【内部工具】强制安全数值
 */
function sanitizeDimension(value: number, fallback: number = DEFAULT_IMAGE_WIDTH): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

/**
 * 【内部工具】异步持久化资产（不阻塞调用方）
 * 将 Blob 压缩后写入 IndexedDB，替换预注入的原始数据
 */
async function persistAsset(
  assetId: string,
  originalBlob: Blob,
  width: number,
  height: number
): Promise<void> {
  try {
    const compressedBlob = await compressImageBeforeUpload(originalBlob);
    unifiedCacheService.setAssetInMemory(assetId, compressedBlob);

    await assetStorageService.saveAsset({
      id: assetId,
      type: 'image',
      mimeType: compressedBlob.type || DEFAULT_MIME_TYPE,
      blob: compressedBlob,
      originalBlob,
      size: compressedBlob.size,
      width,
      height,
    });

    // compressedBlob is also stored in cache by setAssetInMemory called above
  } catch (e) {
    console.error('[ImageFactory] persistAsset error:', e);
  }
}

/**
 * ============================================================
 * 批量工厂：切图等场景需要批量创建多个图片元素
 * ============================================================
 */

/**
 * 批量从 Blobs 创建标准图片元素
 * 用于切图等场景：每个切片都是一个独立的 CanvasImageItem
 *
 * @param blobs Blob 数组
 * @param sizes 每个切片对应的原始尺寸（用于 scale 到画布坐标系）
 * @returns CanvasImageItem 数组（一一对应）
 */
export async function createStandardImageElementsFromBlobs(
  blobs: Blob[],
  sizes: { width: number; height: number }[]
): Promise<CanvasImageItem[]> {
  const results: CanvasImageItem[] = [];

  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i];
    const size = sizes[i];

    if (!blob) {
      console.warn('[ImageFactory] Skipping null blob at index', i);
      continue;
    }

    const assetId = nanoid();

    // 强制安全数值
    const safeWidth = sanitizeDimension(size?.width ?? 0);
    const safeHeight = sanitizeDimension(size?.height ?? 0);

    // 预注入内存
    unifiedCacheService.setAssetInMemory(assetId, blob);

    // 异步压缩落盘
    persistAsset(assetId, blob, safeWidth, safeHeight);

    results.push({
      id: '',
      assetId,
      url: '', // 永远是空字符串
      width: safeWidth,
      height: safeHeight,
    });
  }

  return results;
}

/**
 * ============================================================
 * 核心：直接构建 PlaitImage Element 并插入
 *
 * 【绕开 DrawTransforms.insertImage 的 Schema Drop】
 * 原生 insertImage 只解构 {width, height, url}，丢弃 assetId。
 * 此函数直接构建包含 assetId 的 PlaitImage 对象，
 * 通过 Transforms.insertNode 绕开外层封装的属性过滤。
 * ============================================================
 */

/**
 * 【对外暴露】直接插入包含 assetId 的图片节点
 *
 * @param board 画板实例
 * @param assetId 资产 ID（必有）
 * @param width 图片宽度
 * @param height 图片高度
 * @param position 插入位置（可选，默认居中）
 */
export function insertImageElementWithAssetId(
  board: PlaitBoard,
  assetId: string,
  width: number,
  height: number,
  position?: [number, number]
): void {
  const imageElement = buildImageElementWithAssetId(board, assetId, width, height, position);
  Transforms.insertNode(board, imageElement as any, [board.children.length]);
}

/**
 * 构建包含 assetId 的 PlaitImage Element 对象
 *
 * 【底层核心】完全复制 @plait/draw 的 insertImage 逻辑，
 * 唯一的区别是将 assetId 透传到 element 中。
 */
function buildImageElementWithAssetId(
  board: PlaitBoard,
  assetId: string,
  width: number,
  height: number,
  position?: [number, number]
) {
  const viewportWidth = PlaitBoard.getBoardContainer(board).clientWidth;
  const viewportHeight = PlaitBoard.getBoardContainer(board).clientHeight;
  const point = toViewBoxPoint(board, toHostPoint(board, viewportWidth / 2, viewportHeight / 2));

  const points: [[number, number], [number, number]] = position
    ? [position, [position[0] + width, position[1] + height]]
    : [
        [point[0] - width / 2, point[1] - height / 2],
        [point[0] + width / 2, point[1] + height / 2],
      ];

  const imageElement = {
    id: idCreator(),
    type: 'image' as const,
    assetId, // 核心透传！
    points,
    url: '', // Model 层只存 assetId，url 永远为空
    angle: 0,
  };

  return imageElement;
}
