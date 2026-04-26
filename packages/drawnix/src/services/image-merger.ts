/**
 * Image Merger Service
 * 使用 OffscreenCanvas 将多张图片合成为一张
 */

import { LayoutResult, HighResLayoutResult, calculateCoverCrop, calculateContainDraw } from './photo-wall-layout';

export interface ImageLoadResult {
  url: string;
  image: HTMLImageElement;
  loaded: boolean;
  error?: string;
}

export interface MergeProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export type ProgressCallback = (progress: MergeProgress) => void;

/**
 * 加载图片（支持跨域处理）
 * @param url 图片 URL
 * @param crossOrigin 是否使用跨域模式
 */
export function loadImage(url: string, crossOrigin: boolean = true): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    if (crossOrigin) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      resolve(img);
    };

    img.onerror = (error) => {
      reject(new Error(`Failed to load image: ${url}`));
    };

    img.src = url;
  });
}

/**
 * 批量加载图片
 * @param urls 图片 URL 数组
 * @param onProgress 进度回调
 * @param crossOrigin 是否使用跨域模式
 */
export async function loadImages(
  urls: string[],
  onProgress?: ProgressCallback,
  crossOrigin: boolean = true
): Promise<ImageLoadResult[]> {
  const results: ImageLoadResult[] = [];
  const total = urls.length;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    try {
      const image = await loadImage(url, crossOrigin);
      results.push({ url, image, loaded: true });
    } catch (error: any) {
      results.push({ url, image: null as any, loaded: false, error: error.message });
    }

    onProgress?.({
      loaded: i + 1,
      total,
      percentage: Math.round(((i + 1) / total) * 100),
    });
  }

  return results;
}

/**
 * 在 Canvas 上绘制单个图片
 */
function drawImageToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: HTMLImageElement | ImageBitmap,
  layoutItem: LayoutResult['layout'][0],
  fitMode: 'contain' | 'cover',
  backgroundColor: string
): void {
  const { x, y, width, height, originalWidth, originalHeight, actualImageWidth, actualImageHeight } = layoutItem;

  // 使用实际图片尺寸作为源图尺寸（保持清晰度）
  const sourceWidth = actualImageWidth || originalWidth;
  const sourceHeight = actualImageHeight || originalHeight;

  // 填充背景色
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(x, y, width, height);

  // 禁用平滑缩放，提高缩放后的清晰度
  ctx.imageSmoothingEnabled = false;

  if (fitMode === 'cover') {
    // Cover 模式：裁切图片以填满格子
    const crop = calculateCoverCrop(sourceWidth, sourceHeight, width, height);
    ctx.drawImage(
      img as HTMLImageElement,
      crop.sx,
      crop.sy,
      crop.sWidth,
      crop.sHeight,
      x,
      y,
      width,
      height
    );
  } else {
    // Contain 模式：完整显示图片在格子内
    const draw = calculateContainDraw(sourceWidth, sourceHeight, width, height);
    ctx.drawImage(
      img as HTMLImageElement,
      0,
      0,
      sourceWidth,
      sourceHeight,
      x + draw.dx,
      y + draw.dy,
      draw.dWidth,
      draw.dHeight
    );
  }

  // 恢复平滑设置
  ctx.imageSmoothingEnabled = true;
}

/**
 * 使用 OffscreenCanvas 合并多张图片
 * @param layoutData 布局数据
 * @param onProgress 进度回调
 * @param useOffscreen 是否使用 OffscreenCanvas（默认 true）
 */
export async function mergeImagesToBlob(
  layoutData: LayoutResult,
  onProgress?: ProgressCallback,
  useOffscreen: boolean = true
): Promise<Blob> {
  const { totalWidth, totalHeight, layout, fitMode, backgroundColor } = layoutData;

  if (layout.length === 0) {
    throw new Error('No images to merge');
  }

  // 创建离屏 Canvas
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  if (useOffscreen && typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(totalWidth, totalHeight);
    ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  } else {
    canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  // 填充背景色
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  const total = layout.length;
  let loaded = 0;

  // 逐个加载并绘制图片
  for (const item of layout) {
    try {
      // 设置跨域
      const img = await loadImage(item.url, true);

      // 绘制图片
      drawImageToCanvas(ctx, img, item, fitMode, backgroundColor);

      loaded++;
      onProgress?.({
        loaded,
        total,
        percentage: Math.round((loaded / total) * 100),
      });
    } catch (error) {
      console.error(`Failed to load image: ${item.url}`, error);
      // 即使单个图片加载失败，也继续处理其他图片
      loaded++;
      onProgress?.({
        loaded,
        total,
        percentage: Math.round((loaded / total) * 100),
      });
    }
  }

  // 导出为 Blob
  return new Promise((resolve, reject) => {
    const mimeType = 'image/png';
    const quality = 0.92;

    if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
      // OffscreenCanvas
      (canvas as OffscreenCanvas)
        .convertToBlob({ type: mimeType, quality })
        .then(resolve)
        .catch(reject);
    } else {
      // HTMLCanvasElement
      (canvas as HTMLCanvasElement).toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        mimeType,
        quality
      );
    }
  });
}

/**
 * 合并图片并返回 Data URL
 * 适用于需要预览的场景
 */
export async function mergeImagesToDataURL(
  layoutData: LayoutResult,
  onProgress?: ProgressCallback
): Promise<string> {
  const blob = await mergeImagesToBlob(layoutData, onProgress);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 检查图片 URL 是否可以跨域访问
 */
export async function checkImageCors(url: string): Promise<boolean> {
  try {
    const img = await loadImage(url, true);
    // 检查图片是否被污染（tainted）
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      // 如果图片被污染，这里会抛出错误
      try {
        ctx.getImageData(0, 0, 1, 1);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 高保真合并图片（使用预加载的高分辨率图片）
 * @param layoutData 高保真布局数据
 * @param onProgress 进度回调
 */
export async function mergeHighResImagesToBlob(
  layoutData: HighResLayoutResult,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const { canvasWidth, canvasHeight, layout } = layoutData;

  if (layout.length === 0) {
    throw new Error('No images to merge');
  }

  // 创建离屏 Canvas，使用物理尺寸
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  } else {
    canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  // 填充白色背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 开启高质量图像平滑
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const total = layout.length;

  // 直接绘制预加载的高保真图片
  for (let i = 0; i < layout.length; i++) {
    const item = layout[i];
    ctx.drawImage(item.imgElement, item.x, item.y, item.width, item.height);

    onProgress?.({
      loaded: i + 1,
      total,
      percentage: Math.round(((i + 1) / total) * 100),
    });
  }

  // 导出为 Blob
  return new Promise((resolve, reject) => {
    if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
      // OffscreenCanvas
      (canvas as OffscreenCanvas)
        .convertToBlob({ type: 'image/png' })
        .then(resolve)
        .catch(reject);
    } else {
      // HTMLCanvasElement
      (canvas as HTMLCanvasElement).toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        'image/png'
      );
    }
  });
}

/**
 * 高保真合并图片并返回 Data URL
 */
export async function mergeHighResImagesToDataURL(
  layoutData: HighResLayoutResult,
  onProgress?: ProgressCallback
): Promise<string> {
  const blob = await mergeHighResImagesToBlob(layoutData, onProgress);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 创建带超时控制的图片加载
 */
export function loadImageWithTimeout(
  url: string,
  timeout: number = 10000,
  crossOrigin: boolean = true
): Promise<HTMLImageElement> {
  return Promise.race([
    loadImage(url, crossOrigin),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Image load timeout: ${url}`)), timeout)
    ),
  ]);
}

/**
 * 批量加载图片（带并发控制）
 */
export async function loadImagesWithConcurrency(
  urls: string[],
  concurrency: number = 4,
  onProgress?: ProgressCallback,
  crossOrigin: boolean = true
): Promise<ImageLoadResult[]> {
  const results: ImageLoadResult[] = [];
  let currentIndex = 0;

  const processNext = async (): Promise<void> => {
    while (currentIndex < urls.length) {
      const index = currentIndex++;
      const url = urls[index];

      try {
        const image = await loadImageWithTimeout(url, 15000, crossOrigin);
        results[index] = { url, image, loaded: true };
      } catch (error: any) {
        results[index] = { url, image: null as any, loaded: false, error: error.message };
      }

      onProgress?.({
        loaded: results.filter((r) => r.loaded).length,
        total: urls.length,
        percentage: Math.round((currentIndex / urls.length) * 100),
      });
    }
  };

  // 启动并发任务
  const workers = Array(Math.min(concurrency, urls.length))
    .fill(null)
    .map(() => processNext());

  await Promise.all(workers);

  return results;
}
