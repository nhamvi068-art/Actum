import { LRUCache } from './lru-cache';

/**
 * 缩略图缓存管理器
 * 使用 LRU (最近最少使用) 策略，限制最大缓存数量
 */
class ThumbnailCache {
    private cache: LRUCache<string, string>;
    private maxSize: number;

    /**
     * @param maxSize 最大缓存条目数，默认 200
     */
    constructor(maxSize: number = 200) {
        this.maxSize = maxSize;
        this.cache = new LRUCache<string, string>(maxSize);
    }

    /**
     * 生成缓存 key
     */
    getCacheKey(imageUrl: string, maxSize: number = 256): string {
        return `${maxSize}_${imageUrl}`;
    }

    /**
     * 获取缩略图（同时更新访问顺序）
     */
    get(imageUrl: string, maxSize: number = 256): string | undefined {
        const key = this.getCacheKey(imageUrl, maxSize);
        return this.cache.get(key);
    }

    /**
     * 存储缩略图
     */
    set(imageUrl: string, thumbnail: string, maxSize: number = 256): void {
        const key = this.getCacheKey(imageUrl, maxSize);
        this.cache.set(key, thumbnail);
    }

    /**
     * 清除指定图片的缓存
     */
    clear(imageUrl: string): void {
        const keysToDelete: string[] = [];
        for (const key of this.cache.keys()) {
            if (key.endsWith(imageUrl)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    /**
     * 清除所有缓存
     */
    clearAll(): void {
        this.cache.clearAll();
    }

    /**
     * 获取当前缓存大小
     */
    get size(): number {
        return this.cache.size;
    }
}

export const thumbnailCache = new ThumbnailCache();

/**
 * 统一的错误占位图（SVG 转 Base64）
 */
const ERROR_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5Ij5JbnZhbGlkIGltYWdlPC90ZXh0Pjwvc3ZnPg==';

/**
 * 统一的缩略图绘制函数（内部使用）
 */
function drawThumbnail(
    source: HTMLImageElement | ImageBitmap,
    maxSize: number,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
): boolean {
    let width: number;
    let height: number;

    if (source instanceof ImageBitmap) {
        width = source.width;
        height = source.height;
    } else {
        width = source.width;
        height = source.height;
    }

    // 计算等比缩放后的尺寸
    let scaledWidth = width;
    let scaledHeight = height;

    if (width > height) {
        if (width > maxSize) {
            scaledWidth = maxSize;
            scaledHeight = (height * maxSize) / width;
        }
    } else {
        if (height > maxSize) {
            scaledHeight = maxSize;
            scaledWidth = (width * maxSize) / height;
        }
    }

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    try {
        ctx.drawImage(source as any, 0, 0, scaledWidth, scaledHeight);
        return true;
    } catch {
        return false;
    }
}

/**
 * 使用 createImageBitmap 解码图片源（Blob 或 ImageBitmap）
 * 这是最纯粹的"内存->图像"管线，不需要创建 URL
 */
async function decodeImageSource(source: Blob | ImageBitmap): Promise<ImageBitmap | null> {
    try {
        if (source instanceof ImageBitmap) {
            return source;
        }
        // Blob 直接使用 createImageBitmap（后台线程解码）
        return await createImageBitmap(source);
    } catch (e) {
        console.warn('[Thumbnail] Failed to decode image source:', e);
        return null;
    }
}

/**
 * 从 Blob 直接生成缩略图
 * 这是最高效的方式，完全绕过 URL 转换
 *
 * @param blob 图片 Blob
 * @param maxSize 最大边长（默认 256px）
 * @returns Promise<string> 返回 Base64 缩略图
 *
 * @example
 * ```typescript
 * const blob = await unifiedCacheService.getAssetBlob(assetId);
 * if (blob) {
 *     const thumbnail = await generateThumbnailFromBlob(blob, 256);
 *     setThumbnail(thumbnail);
 * }
 * ```
 */
export async function generateThumbnailFromBlob(
    blob: Blob,
    maxSize: number = 256
): Promise<string> {
    try {
        // 使用 createImageBitmap 解码 Blob（无需创建 URL）
        const bitmap = await decodeImageSource(blob);
        if (!bitmap) {
            return ERROR_PLACEHOLDER;
        }

        // 创建离屏 Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            bitmap.close();
            return ERROR_PLACEHOLDER;
        }

        // 绘制缩略图
        const success = drawThumbnail(bitmap, maxSize, canvas, ctx);
        bitmap.close();

        if (!success) {
            return ERROR_PLACEHOLDER;
        }

        // 导出为 WebP
        return canvas.toDataURL('image/webp', 0.6);
    } catch (e) {
        console.warn('[Thumbnail] Failed to generate from blob:', e);
        return ERROR_PLACEHOLDER;
    }
}

/**
 * 从 ImageBitmap 直接生成缩略图
 * 当已有解码后的 ImageBitmap 时使用，避免重复解码
 */
export async function generateThumbnailFromBitmap(
    bitmap: ImageBitmap,
    maxSize: number = 256
): Promise<string> {
    try {
        // 创建离屏 Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return ERROR_PLACEHOLDER;
        }

        // 绘制缩略图（bitmap 不会被消耗，可以复用）
        const success = drawThumbnail(bitmap, maxSize, canvas, ctx);
        if (!success) {
            return ERROR_PLACEHOLDER;
        }

        // 导出为 WebP
        return canvas.toDataURL('image/webp', 0.6);
    } catch (e) {
        console.warn('[Thumbnail] Failed to generate from bitmap:', e);
        return ERROR_PLACEHOLDER;
    }
}

/**
 * 检测是否为会话级的 blob URL
 */
function isBlobUrl(url: string): boolean {
    return url.startsWith('blob:');
}

/**
 * 生成图片缩略图（统一入口）
 * 支持传入原生 Blob 对象或 URL 字符串
 *
 * 【重要】blob: URL 会被拒绝，因为它们在页面刷新后会失效
 *
 * @param source 原图 Blob 或 URL
 * @param maxSize 最大边长（默认 256px）
 * @returns Promise<string> 返回 Base64 缩略图
 *
 * @example
 * ```typescript
 * // 直接传入 Blob（推荐）
 * const blob = await getAssetBlob(assetId);
 * const thumbnail = await generateThumbnail(blob, 256);
 *
 * // 传入 URL 字符串
 * const thumbnail = await generateThumbnail('https://example.com/image.jpg', 256);
 * ```
 */
export async function generateThumbnail(
    source: Blob | string,
    maxSize: number = 256
): Promise<string> {
    // 检查是否为 Blob
    if (source instanceof Blob) {
        return generateThumbnailFromBlob(source, maxSize);
    }

    // 【防御】如果是 blob: URL，直接返回空（避免无效请求）
    // blob: URL 是会话级的，页面刷新后会失效
    if (isBlobUrl(source)) {
        console.warn('[Thumbnail] Skipping invalid blob: URL:', source.substring(0, 50));
        return ERROR_PLACEHOLDER;
    }

    // 检查缓存（仅对 URL 有效）
    const cached = thumbnailCache.get(source, maxSize);
    if (cached) {
        return cached;
    }

    // 处理 URL 字符串
    try {
        // data: URL 使用传统 Image 加载
        if (source.startsWith('data:')) {
            return await generateThumbnailFromSpecialUrl(source, maxSize);
        }

        // HTTP/HTTPS URL 使用 fetch
        const response = await fetch(source, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const blob = await response.blob();

        // 直接从 Blob 生成缩略图
        const thumbnail = await generateThumbnailFromBlob(blob, maxSize);

        // 存入缓存
        thumbnailCache.set(source, thumbnail, maxSize);

        return thumbnail;
    } catch (e) {
        console.warn('[Thumbnail] Failed to generate thumbnail from URL:', source, e);
        return ERROR_PLACEHOLDER;
    }
}

/**
 * 处理特殊的 URL 类型（blob: 和 data:）
 * 这些 URL 不能用 fetch，必须使用传统的 Image 加载方式
 */
async function generateThumbnailFromSpecialUrl(
    url: string,
    maxSize: number = 256
): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();

        img.onload = async () => {
            try {
                // 使用 createImageBitmap 从 Image 元素创建
                const bitmap = await createImageBitmap(img);
                const thumbnail = await generateThumbnailFromBitmap(bitmap, maxSize);
                bitmap.close();

                // 存入缓存
                thumbnailCache.set(url, thumbnail, maxSize);

                resolve(thumbnail);
            } catch (e) {
                console.warn('[Thumbnail] Failed to create bitmap from special URL:', e);
                resolve(ERROR_PLACEHOLDER);
            }
        };

        img.onerror = () => {
            console.warn('[Thumbnail] Failed to load special URL:', url);
            resolve(ERROR_PLACEHOLDER);
        };

        img.src = url;
    });
}

/**
 * 预生成缩略图（不阻塞主线程）
 */
export function prefetchThumbnail(source: Blob | string, maxSize: number = 256): void {
    // 如果是 Blob，不需要预取（直接从内存解码）
    if (source instanceof Blob) {
        return;
    }

    // 检查是否已有缓存
    if (thumbnailCache.get(source, maxSize)) {
        return;
    }

    // 使用 requestIdleCallback 在空闲时生成
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
            generateThumbnail(source, maxSize).catch(console.error);
        }, { timeout: 2000 });
    } else if (typeof window !== 'undefined') {
        setTimeout(() => {
            generateThumbnail(source, maxSize).catch(console.error);
        }, 1000);
    }
}
