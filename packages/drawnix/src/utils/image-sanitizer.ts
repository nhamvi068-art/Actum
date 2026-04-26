import { CanvasImageItem } from '../types';

/**
 * 检测是否为会话级的 blob URL
 * blob: URL 是浏览器临时生成的，会话结束或页面刷新后失效
 */
export function isBlobUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return url.startsWith('blob:');
}

/**
 * 清理图片元素中的 blob URL
 * 在序列化(保存)前调用，确保 blob URL 不会被存入持久化存储
 *
 * @param item 图片元素
 * @returns 清理后的图片元素（url 字段被删除）
 */
export function sanitizeImageItem(item: CanvasImageItem): CanvasImageItem {
  if (isBlobUrl(item.url)) {
    const { url, ...rest } = item;
    console.log('[ImageSanitizer] Removed blob URL from image item:', item.assetId);
    return rest as CanvasImageItem;
  }
  return item;
}

/**
 * 深度清理数组中所有图片元素的 blob URL
 * 用于 saveDelta 或 saveFull 之前
 */
export function sanitizeElementsOnSave<T extends Record<string, any>>(elements: T[]): T[] {
  return elements.map(element => {
    if ('assetId' in element && element.assetId) {
      return sanitizeImageItem(element as any) as any;
    }
    return element;
  });
}

/**
 * 清理脏数据中的 blob URL
 * 在反序列化(加载)后调用，兼容之前已存入的"脏数据"
 */
export function sanitizeImageItemOnLoad(item: CanvasImageItem): CanvasImageItem {
  if (isBlobUrl(item.url)) {
    console.log('[ImageSanitizer] Cleaned stale blob URL on load:', item.assetId);
    const { url, ...rest } = item;
    return rest as CanvasImageItem;
  }
  return item;
}

/**
 * 深度清理加载后的元素数组（兼容脏数据）
 */
export function sanitizeElementsOnLoad<T extends Record<string, any>>(elements: T[]): T[] {
  return elements.map(element => {
    if ('assetId' in element && element.assetId) {
      return sanitizeImageItemOnLoad(element as any) as any;
    }
    return element;
  });
}
