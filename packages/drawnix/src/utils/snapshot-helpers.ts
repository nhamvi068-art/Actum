/**
 * SnapshotHelpers - 快照辅助工具
 *
 * 提供快照遗舱创建的核心工具函数：
 * 1. SVG 克隆与 blob URL → Data URL 转换
 * 2. 视口信息提取
 * 3. 元素数据快照
 */

import { PlaitBoard, PlaitElement } from '@plait/core';
import { unifiedCacheService } from '../services/unified-cache-service';
import { compressBlobToBase64 } from './common';

const FALLBACK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * 创建快照遗舱
 *
 * 在退出前的一瞬间，获取当前的 board 数据，克隆 SVG DOM，
 * 并将所有 blob URL 转换为 Data URL（内联 Base64）。
 *
 * 转换后的 SVG 是自包含的，不再依赖 blob URL，可以安全地用于后台截图。
 *
 * @param board PlaitBoard 实例
 * @param projectId 项目 ID
 * @returns 克隆的 SVG 元素和元素快照（尚未创建遗舱，由调用者决定）
 */
export async function createSnapshotPod(
  board: PlaitBoard,
  projectId: string
): Promise<{
  svgClone: SVGSVGElement;
  elementsSnapshot: PlaitElement[];
  viewport?: { width: number; height: number; zoom: number };
} | null> {
  try {
    // 1. 获取 SVG 主元素
    const sourceSvg = PlaitBoard.getHost(board);
    if (!sourceSvg) {
      console.warn('[SnapshotHelpers] sourceSvg not found');
      return null;
    }

    // 2. 深拷贝 SVG
    const svgClone = sourceSvg.cloneNode(true) as SVGSVGElement;

    // 3. 收集所有 blob URL 并行转换为 Data URL
    await convertBlobUrlsToDataUrls(svgClone);

    // 4. 序列化 elements 数据快照
    const elementsSnapshot = deepCloneElements(board.children);

    // 5. 提取视口信息
    const viewport = extractViewport(board);

    console.log(`[SnapshotHelpers] Created snapshot pod for project ${projectId}, elements: ${elementsSnapshot.length}`);

    return {
      svgClone,
      elementsSnapshot,
      viewport,
    };
  } catch (error) {
    console.error('[SnapshotHelpers] Failed to create snapshot pod:', error);
    return null;
  }
}

/**
 * 转换 SVG 中的 blob URL 为 Data URL
 *
 * 支持 <img> 和 <image> 两种元素，
 * 使用 href/src 双保险赋值，
 * 具备 unifiedCacheService + fetch 双重兜底。
 *
 * @param svgClone 克隆的 SVG 元素
 */
async function convertBlobUrlsToDataUrls(svgClone: SVGSVGElement): Promise<void> {
  // 同时查询 <img> 和 <image> 元素
  const htmlImgElements = svgClone.querySelectorAll('img');
  const svgImageElements = svgClone.querySelectorAll('image');

  interface BlobEntry {
    element: HTMLElement;
    blobUrl: string;
    isSvgImage: boolean;
  }

  const blobEntries: BlobEntry[] = [];

  // 收集 HTML <img> 元素
  htmlImgElements.forEach((img: HTMLImageElement) => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('blob:')) {
      blobEntries.push({ element: img, blobUrl: src, isSvgImage: false });
    }
  });

  // 收集 SVG <image> 元素（支持 href 和 xlink:href）
  svgImageElements.forEach((img: SVGImageElement) => {
    // 优先检查 href
    const href = img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
    if (href.startsWith('blob:')) {
      blobEntries.push({ element: img, blobUrl: href, isSvgImage: true });
    }
  });

  if (blobEntries.length === 0) {
    console.log('[SnapshotHelpers] No blob URLs found in SVG');
    return;
  }

  console.log(`[SnapshotHelpers] Found ${blobEntries.length} blob URL(s) to convert`);

  // 并行转换所有 blob URL
  await Promise.all(
    blobEntries.map(async ({ element, blobUrl, isSvgImage }) => {
      try {
        // 【关键修改】保存原始 blob URL 用于 fetch 兜底
        const originalBlobUrl = blobUrl;

        // 方案一：优先尝试 unifiedCacheService
        const assetId = extractAssetId(originalBlobUrl);
        let blob: Blob | null = null;

        if (assetId) {
          blob = await unifiedCacheService.getAssetBlob(assetId);
        }

        // 方案二：unifiedCacheService 失败时，直接 fetch blob URL
        if (!blob) {
          console.warn(`[SnapshotHelpers] Cache miss for ${assetId || originalBlobUrl}, attempting direct fetch...`);
          try {
            const response = await fetch(originalBlobUrl);
            if (response.ok) {
              blob = await response.blob();
              console.log(`[SnapshotHelpers] Direct fetch successful for ${originalBlobUrl}`);
            }
          } catch (fetchError) {
            console.error(`[SnapshotHelpers] Direct fetch failed:`, fetchError);
          }
        }

        if (blob) {
          const dataUrl = await compressBlobToBase64(blob);

          // 根据元素类型设置正确的属性
          if (isSvgImage) {
            // SVG <image> 元素使用 href
            (element as SVGImageElement).setAttribute('href', dataUrl);
            // 清除旧的 xlink:href 和 src
            element.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
            element.removeAttribute('src');
          } else {
            // HTML <img> 元素使用 src
            (element as HTMLImageElement).src = dataUrl;
          }

          console.log(`[SnapshotHelpers] Converted blob to Data URL, length: ${dataUrl.length}`);
        } else {
          console.error(`[SnapshotHelpers] FATAL: Could not resolve blob for ${originalBlobUrl}`);
          element.setAttribute('src', FALLBACK_IMAGE);
          if (isSvgImage) {
            (element as SVGImageElement).setAttribute('href', FALLBACK_IMAGE);
          }
        }
      } catch (error) {
        console.warn(`[SnapshotHelpers] Failed to convert blob URL:`, error);
        element.setAttribute('src', FALLBACK_IMAGE);
        if (isSvgImage) {
          (element as SVGImageElement).setAttribute('href', FALLBACK_IMAGE);
        }
      }
    })
  );
}

/**
 * 从 blob URL 中提取 assetId
 *
 * blob URL 格式：
 * - blob:http://localhost:3000/uuid
 * - blob:file:///uuid
 * - blob:nodedata://uuid
 */
function extractAssetId(blobUrl: string): string | null {
  // 获取 URL 的最后一部分作为 assetId
  const parts = blobUrl.split('/');
  const lastPart = parts[parts.length - 1];

  // 去掉查询参数
  const assetId = lastPart?.split('?')[0];

  if (!assetId || assetId.length === 0) {
    return null;
  }

  return assetId;
}

/**
 * 深拷贝元素数组
 */
function deepCloneElements(elements: PlaitElement[]): PlaitElement[] {
  return elements.map(element => deepCloneElement(element));
}

/**
 * 深拷贝单个元素
 */
function deepCloneElement(element: PlaitElement): PlaitElement {
  const clone: PlaitElement = { ...element };

  // 移除不可序列化的属性
  delete (clone as any).g;

  // 递归拷贝 children
  if (element.children && Array.isArray(element.children)) {
    clone.children = deepCloneElements(element.children);
  }

  return clone;
}

/**
 * 提取视口信息
 */
function extractViewport(
  board: PlaitBoard
): { width: number; height: number; zoom: number } | undefined {
  try {
    const { viewport } = board;

    // 获取视口尺寸（从 SVG viewBox 或 container）
    const svg = PlaitBoard.getHost(board);
    if (!svg) return undefined;

    const rect = svg.getBoundingClientRect();

    return {
      width: rect.width || 800,
      height: rect.height || 600,
      zoom: viewport?.zoom || 1,
    };
  } catch (error) {
    console.warn('[SnapshotHelpers] Failed to extract viewport:', error);
    return undefined;
  }
}

/**
 * 立即触发快照遗舱创建（不阻塞）
 *
 * 这是一个便捷函数，用于在 handleBack 中调用：
 * - 异步创建遗舱
 * - 不阻塞 UI 跳转
 *
 * @param board PlaitBoard 实例
 * @param projectId 项目 ID
 * @returns Promise<boolean> 是否成功创建遗舱
 */
export async function triggerSnapshotPod(
  board: PlaitBoard,
  projectId: string
): Promise<boolean> {
  try {
    const result = await createSnapshotPod(board, projectId);
    if (!result) return false;

    // 动态导入以避免循环依赖
    const { SnapshotPodManager } = await import('../services/snapshot-pod-manager');

    SnapshotPodManager.createPod(projectId, result.svgClone, result.elementsSnapshot, result.viewport);

    console.log(`[SnapshotHelpers] Snapshot pod triggered for project ${projectId}`);

    return true;
  } catch (error) {
    console.error('[SnapshotHelpers] Failed to trigger snapshot pod:', error);
    return false;
  }
}

/**
 * 创建遗舱并启动后台服务
 *
 * 便捷函数，一步完成：
 * 1. 创建快照遗舱
 * 2. 确保后台服务正在运行
 *
 * @param board PlaitBoard 实例
 * @param projectId 项目 ID
 */
export async function createSnapshotPodAndStartService(
  board: PlaitBoard,
  projectId: string
): Promise<void> {
  // 创建遗舱
  await triggerSnapshotPod(board, projectId);

  // 确保后台服务正在运行
  const { BackgroundSnapshotService } = await import('../services/background-snapshot-service');
  if (!BackgroundSnapshotService.serviceIsRunning) {
    BackgroundSnapshotService.start();
  }
}
