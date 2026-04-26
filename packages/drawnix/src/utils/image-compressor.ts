/**
 * 图片压缩配置
 */
const COMPRESS_CONFIG = {
    /** 文件大小阈值：小于此值不压缩（字节） */
    SIZE_THRESHOLD: 1 * 1024 * 1024, // 1MB
    /** 最大边长：超过此值进行缩放 */
    MAX_DIMENSION: 2048,
    /** WebP 压缩质量（0-1） */
    QUALITY: 0.8,
    /** 输出格式 */
    MIME_TYPE: 'image/webp' as const,
};

/**
 * 压缩结果统计
 */
export interface CompressStats {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    savedBytes: number;
    originalWidth: number;
    originalHeight: number;
    compressedWidth: number;
    compressedHeight: number;
    wasCompressed: boolean;
}

/**
 * 检查 OffscreenCanvas 是否可用
 */
function isOffscreenCanvasSupported(): boolean {
    return typeof OffscreenCanvas !== 'undefined';
}

/**
 * 使用 Image 加载图片（回退方案）
 */
function loadImageElement(source: Blob | File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(source);
    });
}

/**
 * 获取图片尺寸（从 Blob 或 ImageBitmap）
 */
async function getImageDimensions(
    source: Blob | File,
    useOffscreen: boolean
): Promise<{ width: number; height: number }> {
    if (useOffscreen) {
        const bitmap = await createImageBitmap(source);
        try {
            return { width: bitmap.width, height: bitmap.height };
        } finally {
            bitmap.close();
        }
    } else {
        const img = await loadImageElement(source);
        try {
            return { width: img.width, height: img.height };
        } finally {
            URL.revokeObjectURL(img.src);
        }
    }
}

/**
 * 压缩图片核心逻辑
 * 使用 OffscreenCanvas（主线程）或传统 Canvas（回退）
 */
async function compressWithOffscreenCanvas(
    source: Blob | File,
    targetWidth: number,
    targetHeight: number
): Promise<Blob> {
    const imageBitmap = await createImageBitmap(source);
    try {
        const canvas = new OffscreenCanvas(targetWidth, targetHeight);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('Failed to get OffscreenCanvas context');
        }

        ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

        return await canvas.convertToBlob({
            type: COMPRESS_CONFIG.MIME_TYPE,
            quality: COMPRESS_CONFIG.QUALITY,
        });
    } finally {
        imageBitmap.close();
    }
}

/**
 * 压缩图片回退方案（使用传统 Canvas）
 */
async function compressWithNormalCanvas(
    source: Blob | File,
    targetWidth: number,
    targetHeight: number
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const blobUrl = URL.createObjectURL(source);

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    URL.revokeObjectURL(blobUrl);
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                canvas.toBlob(
                    (blob) => {
                        URL.revokeObjectURL(blobUrl);
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create blob from canvas'));
                        }
                    },
                    COMPRESS_CONFIG.MIME_TYPE,
                    COMPRESS_CONFIG.QUALITY
                );
            } catch (e) {
                URL.revokeObjectURL(blobUrl);
                reject(e);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            reject(new Error('Failed to load image'));
        };

        img.src = blobUrl;
    });
}

/**
 * 图片压缩器
 *
 * 在图片存入 IndexedDB 之前进行尺寸限制和格式压缩
 *
 * @param fileOrBlob - 要压缩的图片文件或 Blob
 * @param options - 可选的压缩配置覆盖
 * @returns 压缩后的 Blob
 *
 * @example
 * ```typescript
 * const compressed = await compressImageBeforeUpload(file);
 * await assetStorageService.saveAsset({ blob: compressed });
 * ```
 */
export async function compressImageBeforeUpload(
    fileOrBlob: Blob | File,
    options?: Partial<typeof COMPRESS_CONFIG>
): Promise<Blob> {
    const config = { ...COMPRESS_CONFIG, ...options };
    const originalSize = fileOrBlob.size;

    // 1. 小文件不压缩，直接返回原文件
    if (originalSize < config.SIZE_THRESHOLD) {
        console.log(
            `[ImageCompressor] File ${(originalSize / 1024).toFixed(1)}KB < threshold (${(config.SIZE_THRESHOLD / 1024).toFixed(0)}KB), skip compression`
        );
        return fileOrBlob;
    }

    console.log(`[ImageCompressor] Compressing ${(originalSize / 1024 / 1024).toFixed(2)}MB file...`);

    // 2. 获取图片尺寸
    const useOffscreen = isOffscreenCanvasSupported();
    const dimensions = await getImageDimensions(fileOrBlob, useOffscreen);
    const { width: originalWidth, height: originalHeight } = dimensions;

    // 3. 计算目标尺寸（等比缩放）
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (originalWidth > config.MAX_DIMENSION || originalHeight > config.MAX_DIMENSION) {
        if (originalWidth > originalHeight) {
            targetWidth = config.MAX_DIMENSION;
            targetHeight = Math.round((originalHeight * config.MAX_DIMENSION) / originalWidth);
        } else {
            targetHeight = config.MAX_DIMENSION;
            targetWidth = Math.round((originalWidth * config.MAX_DIMENSION) / originalHeight);
        }
    }

    // 4. 执行压缩
    let compressedBlob: Blob;

    if (useOffscreen) {
        compressedBlob = await compressWithOffscreenCanvas(fileOrBlob, targetWidth, targetHeight);
    } else {
        console.warn('[ImageCompressor] OffscreenCanvas not supported, using fallback');
        compressedBlob = await compressWithNormalCanvas(fileOrBlob, targetWidth, targetHeight);
    }

    // 5. 如果压缩后反而变大（极端情况），保留原文件
    if (compressedBlob.size >= originalSize) {
        console.log(
            `[ImageCompressor] Compression increased size (${(compressedBlob.size / 1024).toFixed(1)}KB >= ${(originalSize / 1024).toFixed(1)}KB), keeping original`
        );
        return fileOrBlob;
    }

    const savedBytes = originalSize - compressedBlob.size;
    const savedPercent = ((savedBytes / originalSize) * 100).toFixed(1);

    console.log(
        `[ImageCompressor] Compressed: ${originalWidth}x${originalHeight} → ${targetWidth}x${targetHeight}, ` +
            `${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB (saved ${savedPercent}%)`
    );

    return compressedBlob;
}

/**
 * 获取压缩统计信息
 *
 * @param originalSize - 原始大小（字节）
 * @param compressedSize - 压缩后大小（字节）
 * @returns 统计信息
 */
export function getCompressStats(
    originalSize: number,
    compressedSize: number,
    originalWidth: number,
    originalHeight: number,
    compressedWidth: number,
    compressedHeight: number
): CompressStats {
    const savedBytes = Math.max(0, originalSize - compressedSize);
    const wasCompressed = compressedSize < originalSize;

    return {
        originalSize,
        compressedSize,
        compressionRatio: wasCompressed ? compressedSize / originalSize : 1,
        savedBytes,
        originalWidth,
        originalHeight,
        compressedWidth,
        compressedHeight,
        wasCompressed,
    };
}

/**
 * 检测图片是否需要压缩
 *
 * @param fileOrBlob - 图片文件或 Blob
 * @param maxDimension - 最大边长阈值（默认 2048）
 * @returns 是否需要压缩
 */
export async function needsCompression(
    fileOrBlob: Blob | File,
    maxDimension: number = COMPRESS_CONFIG.MAX_DIMENSION
): Promise<boolean> {
    // 检查文件大小
    if (fileOrBlob.size < COMPRESS_CONFIG.SIZE_THRESHOLD) {
        return false;
    }

    // 检查尺寸
    try {
        const dimensions = await getImageDimensions(fileOrBlob, isOffscreenCanvasSupported());
        return dimensions.width > maxDimension || dimensions.height > maxDimension;
    } catch {
        return false;
    }
}

/**
 * 获取压缩配置（用于外部访问）
 */
export function getCompressConfig(): Readonly<typeof COMPRESS_CONFIG> {
    return { ...COMPRESS_CONFIG };
}

/**
 * 创建可配置的压缩函数
 *
 * @param options - 压缩配置
 * @returns 压缩函数
 *
 * @example
 * ```typescript
 * const compressForAvatar = createCompressor({
 *     MAX_DIMENSION: 256,
 *     QUALITY: 0.7,
 * });
 * const compressed = await compressForAvatar(avatarFile);
 * ```
 */
export function createCompressor(options: Partial<typeof COMPRESS_CONFIG>) {
    const config = { ...COMPRESS_CONFIG, ...options };

    return async (fileOrBlob: Blob | File): Promise<Blob> => {
        return compressImageBeforeUpload(fileOrBlob, config);
    };
}
