import { IS_APPLE, IS_MAC, PlaitBoard, toImage, ToImageOptions } from '@plait/core';
import type { ResolutionType } from './utility-types';
import { unifiedCacheService } from '../services/unified-cache-service';

export const isPromiseLike = (
  value: any
): value is Promise<ResolutionType<typeof value>> => {
  return (
    !!value &&
    typeof value === 'object' &&
    'then' in value &&
    'catch' in value &&
    'finally' in value
  );
};

// taken from Radix UI
// https://github.com/radix-ui/primitives/blob/main/packages/core/primitive/src/primitive.tsx
export const composeEventHandlers = <E>(
  originalEventHandler?: (event: E) => void,
  ourEventHandler?: (event: E) => void,
  { checkForDefaultPrevented = true } = {}
) => {
  return function handleEvent(event: E) {
    originalEventHandler?.(event);

    if (
      !checkForDefaultPrevented ||
      !(event as unknown as Event)?.defaultPrevented
    ) {
      return ourEventHandler?.(event);
    }
  };
};

export const base64ToBlob = (base64: string) => {
  const arr = base64.split(',');
  const fileType = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let l = bstr.length;
  const u8Arr = new Uint8Array(l);

  while (l--) {
    u8Arr[l] = bstr.charCodeAt(l);
  }
  return new Blob([u8Arr], {
    type: fileType,
  });
};

// 透明的 1x1 像素 GIF，用于降级处理
const FALLBACK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Blob 转 Base64 Data URL 辅助函数
 */
function blobToBase64DataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export function compressBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const maxSize = 1024;
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height / width) * maxSize);
          width = maxSize;
        } else {
          width = Math.round((width / height) * maxSize);
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Failed to get canvas context')); return; }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image for compression')); };
    img.src = url;
  });
}

/**
 * 尝试从 blob URL 加载真实图片数据
 * 从 blob URL 中解析出 assetId，通过 UnifiedCacheService 获取真实图片 Blob
 */
async function tryLoadRealImageData(blobUrl: string): Promise<string> {
    if (!blobUrl.startsWith('blob:')) {
        return FALLBACK_IMAGE;
    }

    // Robust extraction: grab everything after the last '/', strip any '?...' query string.
    // Works regardless of browser origin format:
    //   blob:http://localhost:3000/1Fmogo5R2gqeXDe1aKgDD
    //   blob:file:///{uuid}
    //   blob:nodedata://{uuid}
    const assetId = blobUrl.split('/').pop()?.split('?')[0];

    if (!assetId) {
        console.warn('[Snapshot] Could not extract assetId from blob URL:', blobUrl);
        return FALLBACK_IMAGE;
    }

    try {
        const blob = await unifiedCacheService.getAssetBlob(assetId);
        if (!blob) {
            console.warn('[Snapshot] No cached blob found for assetId:', assetId);
            return FALLBACK_IMAGE;
        }
        const base64 = await blobToBase64DataUrl(blob);
        console.log('[Snapshot] Image patched for snapshot, assetId:', assetId, 'base64 length:', base64.length);
        return base64;
    } catch (e) {
        console.warn('[Snapshot] Failed to convert blob to base64:', e);
        return FALLBACK_IMAGE;
    }
}

// 阈值常量 - 优化版截图使用
const THUMBNAIL_MAX_ELEMENTS = 200;
const THUMBNAIL_MAX_DIMENSION = 400; // 最大边长

export const boardToImage = async (
  board: PlaitBoard | null | undefined,
  options: ToImageOptions = {}
): Promise<string | null> => {
  if (!board) {
    console.warn('[boardToImage] Board is null or undefined');
    return null;
  }

  // 在调用 toImage 之前，尝试将所有 blob 图片替换为真实数据
  // 这样可以保留图片内容，而不是降级为透明 GIF
  // 尝试多种方式获取画板容器，最差兜底到 document.body
  let hostElement: Element | null = null;
  try {
    hostElement =
      (board as any).host ||
      document.querySelector('plait-board') ||
      document.querySelector('.plait-board-host') ||
      document.querySelector('[data-board-host]') ||
      document.body;
  } catch (e) {
    hostElement = document.body;
  }

  const originalSrcMap = new Map<HTMLImageElement, string>();

  if (hostElement) {
    const imgElements = hostElement.querySelectorAll('img, image');

    // Separate collection of blob entries from the src replacement loop
    // so that Promise.all can run all replacements in parallel.
    const blobEntries: Array<{ img: HTMLImageElement; src: string }> = [];
    imgElements.forEach((img: HTMLImageElement) => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('blob:')) {
        originalSrcMap.set(img, src);
        blobEntries.push({ img, src });
      }
    });

    // Parallel replacement: all tryLoadRealImageData calls run concurrently.
    // toImage is NOT called until every img.src has been patched.
    await Promise.all(
      blobEntries.map(async ({ img, src }) => {
        const realDataUrl = await tryLoadRealImageData(src);
        img.setAttribute('src', realDataUrl);
      })
    );
  }

  // Restore helper — used in both the normal path and the fallback path.
  const restoreBlobUrls = () => {
    originalSrcMap.forEach((originalSrc, img) => {
      try {
        img.setAttribute('src', originalSrc);
      } catch (e) {
        console.warn('[boardToImage] Failed to restore img src:', e);
      }
    });
  };

  try {
    const result = await toImage(board, {
      fillStyle: 'transparent',
      inlineStyleClassNames: '.extend,.emojis,.text',
      padding: 20,
      ratio: 4,
      ...options,
    });

    if (!result) {
      console.warn('[boardToImage] toImage returned undefined');
      restoreBlobUrls();          // ← restore even on null result
      return null;
    }

    restoreBlobUrls();            // ← restore before returning
    return result;
  } catch (error) {
    console.warn('[boardToImage] Primary export failed, trying fallback ratio=2:', error);

    try {
      const fallbackResult = await toImage(board, {
        fillStyle: 'transparent',
        padding: 20,
        ratio: 2,
        ...options,
      });
      if (fallbackResult) {
        restoreBlobUrls();        // ← restore before returning fallback
        return fallbackResult;
      }
    } catch (fallbackError) {
      console.error('[boardToImage] Fallback export also failed:', fallbackError);
    }

    restoreBlobUrls();            // ← restore after both failures
    return null;
  }
};

/**
 * 优化版截图函数 - 用于返回首页时的后台截图
 *
 * 关键优化点：
 * 1. 元素过多时直接跳过，避免 SVG 克隆和遍历耗时
 * 2. 使用极低的 ratio，大幅减少 Canvas 尺寸
 * 3. 尝试使用 WebP 格式，减小 Base64 体积
 * 4. 完全在后台执行，不阻塞主线程
 *
 * @param board 画布实例
 * @param options 配置选项
 * @returns Base64 图片字符串或 null
 */
export const boardToImageOptimized = async (
  board: PlaitBoard | null | undefined,
  options: {
    ratio?: number;
    maxElements?: number;
  } = {}
): Promise<string | null> => {
  const { ratio = 0.4, maxElements = THUMBNAIL_MAX_ELEMENTS } = options;

  // 防御：没有 board 时跳过截图
  if (!board) {
    console.log('[boardToImageOptimized] Skipped: no board');
    return null;
  }

  // 防御：检查 board.children 是否有效
  if (!board.children || !Array.isArray(board.children)) {
    console.warn('[boardToImageOptimized] Invalid board children, skipping');
    return null;
  }

  // 防御：元素过多时跳过截图
  if (board.children.length > maxElements) {
    console.log(`[boardToImageOptimized] Skipped: ${board.children.length} elements > ${maxElements}`);
    return null;
  }

  // 尝试多种方式获取画板容器，最差兜底到 document.body
  let hostElement: Element | null = null;
  try {
    hostElement =
      (board as any).host ||
      document.querySelector('plait-board') ||
      document.querySelector('.plait-board-host') ||
      document.querySelector('[data-board-host]') ||
      document.body;
  } catch (e) {
    hostElement = document.body;
  }

  console.log(`[boardToImageOptimized] Generating thumbnail for ${board.children.length} elements with ratio ${ratio}`);

  // 在调用 toImage 之前，尝试将所有 blob 图片替换为真实数据
  const originalSrcMap = new Map<HTMLImageElement, string>();

  // ── Bug Fix: use try/finally so blob URLs are ALWAYS restored,
  // even if Promise.all(loadPromises) throws before toImage is reached. ──
  try {
    const imgElements = hostElement!.querySelectorAll('img, image');

    // Collect blob entries first; exit early if there are none.
    const blobEntries: Array<{ img: HTMLImageElement; src: string }> = [];
    imgElements.forEach((img: HTMLImageElement) => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('blob:')) {
        originalSrcMap.set(img, src);
        blobEntries.push({ img, src });
      }
    });

    if (blobEntries.length === 0) {
      console.log('[boardToImageOptimized] No blob images found, skipping patch.');
    } else {
      console.log(`[boardToImageOptimized] Patching ${blobEntries.length} blob image(s)...`);
      console.log('[boardToImageOptimized] Blob entries:', blobEntries.map(e => ({
        assetId: e.src.split('/').pop()?.split('?')[0],
        srcPrefix: e.src.substring(0, 60),
      })));
      // All replacements run in parallel; toImage is NOT called until every src is patched.
      // 直接从 unifiedCacheService 获取 Blob 并转为 Base64，完全绕过 generateThumbnail
      // （generateThumbnail 会主动拒绝 blob URL 并返回透明 GIF）
      await Promise.all(
        blobEntries.map(async ({ img, src }) => {
          // 从 blob URL 中提取 assetId
          const assetId = src.split('/').pop()?.split('?')[0];
          if (!assetId) {
            console.warn('[boardToImageOptimized] Could not extract assetId from blob URL:', src);
            img.setAttribute('src', FALLBACK_IMAGE);
            return;
          }
          try {
            const blob = await unifiedCacheService.getAssetBlob(assetId);
            if (!blob) {
              console.log('[boardToImageOptimized] No blob found for assetId:', assetId, '- keeping original src to avoid flicker');
              // 不替换 src，保留原 blob URL，避免闪烁
              return;
            }
            const base64 = await blobToBase64DataUrl(blob);
            img.setAttribute('src', base64);
            console.log('[boardToImageOptimized] Image patched, assetId:', assetId, 'base64 length:', base64.length);
          } catch (e) {
            console.warn('[boardToImageOptimized] Failed to patch image:', e, '- keeping original src');
            // 不替换 src，保留原 blob URL，避免闪烁
          }
        })
      );
    }

    // ── toImage runs here only after all img.src have been patched ──
    const result = await toImage(board, {
      fillStyle: 'transparent',
      padding: 10,
      ratio: ratio,
    });

    if (!result) {
      console.warn('[boardToImageOptimized] toImage returned undefined');
      return null;
    }

    console.log(`[boardToImageOptimized] Thumbnail generated, length: ${result.length}`);

    try {
      const webpResult = await convertToWebP(result);
      if (webpResult) {
        console.log(`[boardToImageOptimized] Converted to WebP, length: ${webpResult.length}`);
        return webpResult;
      }
    } catch (e) {
      console.warn('[boardToImageOptimized] WebP conversion failed, using original PNG');
    }

    return result;
  } catch (error) {
    console.warn('[boardToImageOptimized] Failed to convert board to image:', error);
    return null;
  } finally {
    // ALWAYS restore blob URLs, regardless of which path threw.
    originalSrcMap.forEach((originalSrc, img) => {
      try {
        img.setAttribute('src', originalSrc);
      } catch (e) {
        console.warn('[boardToImageOptimized] Failed to restore img src on cleanup:', e);
      }
    });
  }
};

/**
 * 将 PNG Base64 转换为 WebP Base64
 * WebP 通常比 PNG 小 25-50%
 */
async function convertToWebP(pngBase64: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);

          // 尝试 WebP，质量 0.75
          const webpDataUrl = canvas.toDataURL('image/webp', 0.75);
          if (webpDataUrl.startsWith('data:image/webp')) {
            resolve(webpDataUrl);
          } else {
            // 不支持 WebP，返回 null
            resolve(null);
          }
        } catch (e) {
          console.warn('[convertToWebP] Canvas conversion failed:', e);
          resolve(null);
        }
      };
      img.onerror = () => {
        console.warn('[convertToWebP] Image load failed');
        resolve(null);
      };
      img.src = pngBase64;
    } catch (e) {
      console.warn('[convertToWebP] Error:', e);
      resolve(null);
    }
  });
}

export function download(blob: Blob | MediaSource, filename: string) {
  const a = document.createElement('a');
  const url = window.URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}

export const splitRows = <T>(shapes: T[], cols: number) => {
  const result = [];
  for (let i = 0; i < shapes.length; i += cols) {
    result.push(shapes.slice(i, i + cols));
  }
  return result;
};

export const getShortcutKey = (shortcut: string): string => {
  shortcut = shortcut
    .replace(/\bAlt\b/i, "Alt")
    .replace(/\bShift\b/i, "Shift")
    .replace(/\b(Enter|Return)\b/i, "Enter");
  if (IS_APPLE || IS_MAC) {
    return shortcut
      .replace(/\bCtrlOrCmd\b/gi, "Cmd")
      .replace(/\bAlt\b/i, "Option");
  }
  return shortcut.replace(/\bCtrlOrCmd\b/gi, "Ctrl");
};
