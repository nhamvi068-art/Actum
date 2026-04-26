/**
 * Image Splitter Utility - Recursive XY-Cut Algorithm
 * Pure functions for detecting and slicing grid-based images
 *
 * 【重构版本 v3】
 * - 递归 XY-Cut 算法（支持局部区域独立扫描，解决间隙不完全对齐问题）
 * - 增加颜色容差参数，适应浅灰背景 (threshold = 240)
 * - CORS 污染异常捕获（友好中文提示）
 * - 全程 Blob流转，彻底告别 Base64
 * - 增加结果校验与状态返回
 */

export interface SliceRect {
    x: number;
    y: number;
    w: number;
    h: number;
    /** 所在行索引（用于 GAP 间距计算） */
    rowIndex?: number;
    /** 所在列索引（用于 GAP 间距计算） */
    colIndex?: number;
}

export interface SliceResult {
    blob: Blob;
    rect: SliceRect;
}

export interface ImageLoadResult {
    image: HTMLImageElement;
    width: number;
    height: number;
}

/** 边缘裁剪结果 */
export interface TrimBounds {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** 拆图结果状态 */
export interface SplitResult {
    /** 成功标志 */
    success: boolean;
    /** 切片结果数组 */
    slices: SliceResult[];
    /** 切片数量 */
    sliceCount: number;
    /** 错误信息（如果有） */
    errorMessage?: string;
}

/**
 * Load an image from URL
 */
export const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            resolve(image);
        };
        image.onerror = () => {
            reject(new Error(`Failed to load image: ${src}`));
        };
        image.src = src;
    });
};

/**
 * 将 Blob 转换为 HTMLImageElement
 */
export const loadImageFromBlob = (blob: Blob): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load image from blob'));
        image.src = URL.createObjectURL(blob);
    });
};

/**
 * 释放 Blob URL（防止内存泄漏）
 */
export const revokeBlobUrl = (image: HTMLImageElement) => {
    if (image.src.startsWith('blob:')) {
        URL.revokeObjectURL(image.src);
    }
};

/**
 * 【重构 v3】检查像素是否为空白
 *
 * 增加颜色容差参数，适应浅灰背景
 * - 透明像素 (alpha < 10) 视为背景
 * - RGB 三通道都 >= threshold 视为白色/浅色背景
 */
const isBlankPixel = (data: Uint8ClampedArray, idx: number, threshold: number = 240): boolean => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];

    // 透明像素视为背景
    if (a < 10) return true;

    // RGB 三通道都 >= threshold 视为白色/浅色背景
    return r >= threshold && g >= threshold && b >= threshold;
};

/**
 * 【重构 v3】安全获取像素数据
 *
 * 增加 CORS 污染异常捕获
 */
export const getPixelsFromImage = (image: HTMLImageElement): ImageData => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
        throw new Error('无法获取 Canvas 上下文，请检查浏览器兼容性');
    }

    ctx.drawImage(image, 0, 0);

    try {
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (error: any) {
        if (error.name === 'SecurityError' ||
            error.message?.includes('tainted') ||
            error.message?.includes('SecurityError')) {
            throw new Error(
                'CORS_RESTRICTION: 跨域图片限制，无法读取像素数据进行拆分分析。' +
                '请先将图片下载至本地，再重新上传进行拆分。'
            );
        }
        throw error;
    }
};

/**
 * 【重构 v3】边缘修剪（Trim Borders）
 */
export const trimBorders = (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    threshold: number = 240
): TrimBounds => {
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (!isBlankPixel(data, idx, threshold)) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < minX || maxY < minY) {
        return { x: 0, y: 0, w: width, h: height };
    }

    return {
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1
    };
};

/**
 * 【重构 v3】提取子区域像素数据
 */
const extractSubImageData = (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    bounds: TrimBounds
): Uint8ClampedArray => {
    const { x, y, w, h } = bounds;
    const subData = new Uint8ClampedArray(w * h * 4);

    for (let sy = 0; sy < h; sy++) {
        for (let sx = 0; sx < w; sx++) {
            const srcIdx = ((y + sy) * width + (x + sx)) * 4;
            const dstIdx = (sy * w + sx) * 4;

            subData[dstIdx] = data[srcIdx];
            subData[dstIdx + 1] = data[srcIdx + 1];
            subData[dstIdx + 2] = data[srcIdx + 2];
            subData[dstIdx + 3] = data[srcIdx + 3];
        }
    }

    return subData;
};

/**
 * 【重构 v3】检测水平空白行
 *
 * 在指定的矩形区域内检测完全空白的行
 * @param data 像素数据
 * @param width 图片宽度
 * @param rect 要检测的矩形区域 {x, y, w, h}
 * @param threshold 空白阈值
 * @returns 空白行的 Y 坐标数组（相对于原图）
 */
const detectBlankRowsInRect = (
    data: Uint8ClampedArray,
    width: number,
    rect: { x: number; y: number; w: number; h: number },
    threshold: number
): number[] => {
    const blankRows: number[] = [];
    const { x: rectX, y: rectY, w: rectW, h: rectH } = rect;

    for (let localY = 0; localY < rectH; localY++) {
        const absoluteY = rectY + localY;
        let isBlankRow = true;

        // 检测该行是否完全空白
        for (let localX = 0; localX < rectW; localX++) {
            const absoluteX = rectX + localX;
            const idx = (absoluteY * width + absoluteX) * 4;

            if (!isBlankPixel(data, idx, threshold)) {
                isBlankRow = false;
                break; // 短路优化
            }
        }

        if (isBlankRow) {
            blankRows.push(absoluteY);
        }
    }

    return blankRows;
};

/**
 * 【重构 v3】检测垂直空白列
 *
 * 在指定的矩形区域内检测完全空白的列
 * @param data 像素数据
 * @param width 图片宽度
 * @param rect 要检测的矩形区域 {x, y, w, h}
 * @param threshold 空白阈值
 * @returns 空白列的 X 坐标数组（相对于原图）
 */
const detectBlankColsInRect = (
    data: Uint8ClampedArray,
    width: number,
    rect: { x: number; y: number; w: number; h: number },
    threshold: number
): number[] => {
    const blankCols: number[] = [];
    const { x: rectX, y: rectY, w: rectW, h: rectH } = rect;

    for (let localX = 0; localX < rectW; localX++) {
        const absoluteX = rectX + localX;
        let isBlankCol = true;

        // 检测该列是否完全空白
        for (let localY = 0; localY < rectH; localY++) {
            const absoluteY = rectY + localY;
            const idx = (absoluteY * width + absoluteX) * 4;

            if (!isBlankPixel(data, idx, threshold)) {
                isBlankCol = false;
                break; // 短路优化
            }
        }

        if (isBlankCol) {
            blankCols.push(absoluteX);
        }
    }

    return blankCols;
};

/**
 * 【重构 v3】将连续的空白线位置转换为连续的区间段
 *
 * 例如: [5,6,7,15,16,20] → [5,7], [15,16], [20,20]
 */
const linesToSegments = (lines: number[]): { start: number; end: number }[] => {
    if (lines.length === 0) return [];

    const sortedLines = [...lines].sort((a, b) => a - b);
    const segments: { start: number; end: number }[] = [];

    let segmentStart = sortedLines[0];
    let prev = sortedLines[0];

    for (let i = 1; i < sortedLines.length; i++) {
        const current = sortedLines[i];
        // 如果有间隙（不连续），说明是新的区间段
        if (current - prev > 1) {
            segments.push({ start: segmentStart, end: prev });
            segmentStart = current;
        }
        prev = current;
    }
    // 添加最后一个区间段
    segments.push({ start: segmentStart, end: prev });

    return segments;
};

/**
 * 【重构 v3】检测连续空白带（至少 minGap 像素宽/高）
 *
 * @param lines 空白线位置数组
 * @param max 原图尺寸
 * @param minGap 最少连续空白像素数
 */
const findContinuousGaps = (
    lines: { start: number; end: number }[],
    max: number,
    minGap: number = 5
): { start: number; end: number }[] => {
    return lines.filter(seg => (seg.end - seg.start + 1) >= minGap);
};

/**
 * 【重构 v3】递归 XY-Cut 核心算法
 *
 * 在指定的矩形区域内递归切分：
 * 1. 先尝试水平切分（找连续的空白行）
 * 2. 对每个子区域递归调用，尝试垂直切分
 * 3. 交替进行，直到无法再切分
 *
 * @param data 像素数据
 * @param width 图片宽度
 * @param rect 要切分的矩形区域
 * @param threshold 空白阈值
 * @param minGap 最小间隙宽度（像素）
 * @param minArea 最小面积（小于则丢弃）
 * @param depth 递归深度（防止无限递归）
 * @param direction 当前切分方向 ('horizontal' | 'vertical')
 */
const recursiveXyCut = (
    data: Uint8ClampedArray,
    width: number,
    rect: { x: number; y: number; w: number; h: number },
    threshold: number,
    minGap: number,
    minArea: number,
    depth: number = 0,
    direction: 'horizontal' | 'vertical' = 'horizontal'
): SliceRect[] => {
    // 防止无限递归
    if (depth > 20) {
        console.warn('[recursiveXyCut] Max depth reached, returning current rect');
        return rect.w * rect.h >= minArea ? [rect] : [];
    }

    // 过滤掉太小的区域
    if (rect.w * rect.h < minArea) {
        return [];
    }

    // 如果区域太小无法切分，直接返回
    if (rect.w < minGap * 2 || rect.h < minGap * 2) {
        return [rect];
    }

    let gaps: { start: number; end: number }[] = [];

    // 优先尝试当前方向的切分
    if (direction === 'horizontal') {
        const blankRows = detectBlankRowsInRect(data, width, rect, threshold);
        const rowSegments = linesToSegments(blankRows);
        gaps = findContinuousGaps(rowSegments, rect.h, minGap);
    } else {
        const blankCols = detectBlankColsInRect(data, width, rect, threshold);
        const colSegments = linesToSegments(blankCols);
        gaps = findContinuousGaps(colSegments, rect.w, minGap);
    }

    // 如果找到了间隙，进行切分
    if (gaps.length > 0) {
        const subRects: { x: number; y: number; w: number; h: number }[] = [];

        if (direction === 'horizontal') {
            // 水平切分：按行切分
            let currentY = rect.y;
            for (const gap of gaps) {
                const gapStart = gap.start;
                const gapEnd = gap.end;
                const gapHeight = gapEnd - gapStart + 1;

                // 添加间隙上方的内容区域
                if (currentY < gapStart) {
                    subRects.push({
                        x: rect.x,
                        y: currentY,
                        w: rect.w,
                        h: gapStart - currentY
                    });
                }

                // 移动到间隙下方
                currentY = gapEnd + 1;
            }

            // 添加最后一个间隙之后的内容区域
            if (currentY < rect.y + rect.h) {
                subRects.push({
                    x: rect.x,
                    y: currentY,
                    w: rect.w,
                    h: (rect.y + rect.h) - currentY
                });
            }

            // 对每个子区域递归垂直切分
            return subRects.flatMap(subRect =>
                recursiveXyCut(data, width, subRect, threshold, minGap, minArea, depth + 1, 'vertical')
            );
        } else {
            // 垂直切分：按列切分
            let currentX = rect.x;
            for (const gap of gaps) {
                const gapStart = gap.start;
                const gapEnd = gap.end;

                // 添加间隙左侧的内容区域
                if (currentX < gapStart) {
                    subRects.push({
                        x: currentX,
                        y: rect.y,
                        w: gapStart - currentX,
                        h: rect.h
                    });
                }

                // 移动到间隙右侧
                currentX = gapEnd + 1;
            }

            // 添加最后一个间隙之后的内容区域
            if (currentX < rect.x + rect.w) {
                subRects.push({
                    x: currentX,
                    y: rect.y,
                    w: (rect.x + rect.w) - currentX,
                    h: rect.h
                });
            }

            // 对每个子区域递归水平切分
            return subRects.flatMap(subRect =>
                recursiveXyCut(data, width, subRect, threshold, minGap, minArea, depth + 1, 'horizontal')
            );
        }
    }

    // 没有找到间隙，尝试另一个方向
    const nextDirection = direction === 'horizontal' ? 'vertical' : 'horizontal';

    // 检测另一个方向是否有间隙
    let hasGapsInOtherDirection = false;
    if (nextDirection === 'horizontal') {
        const blankRows = detectBlankRowsInRect(data, width, rect, threshold);
        const rowSegments = linesToSegments(blankRows);
        hasGapsInOtherDirection = findContinuousGaps(rowSegments, rect.h, minGap).length > 0;
    } else {
        const blankCols = detectBlankColsInRect(data, width, rect, threshold);
        const colSegments = linesToSegments(blankCols);
        hasGapsInOtherDirection = findContinuousGaps(colSegments, rect.w, minGap).length > 0;
    }

    // 如果另一个方向有间隙，递归切换方向
    if (hasGapsInOtherDirection) {
        return recursiveXyCut(data, width, rect, threshold, minGap, minArea, depth + 1, nextDirection);
    }

    // 两个方向都没有间隙，这是一个叶子节点，返回自身
    return [rect];
};

/**
 * 【重构 v3】检测网格并切片图片（返回带状态的结果）
 *
 * 使用递归 XY-Cut 算法
 */
export const detectAndSliceGridWithResult = async (
    image: HTMLImageElement,
    options?: {
        blankThreshold?: number;
        minSliceArea?: number;
        minGap?: number;
        enableTrim?: boolean;
    }
): Promise<SplitResult> => {
    const {
        blankThreshold = 240,
        minSliceArea = 1000,
        minGap = 5,
        enableTrim = true
    } = options || {};

    const originalWidth = image.width;
    const originalHeight = image.height;

    // Step 1: 获取像素数据
    let imageData: ImageData;
    try {
        imageData = getPixelsFromImage(image);
    } catch (error) {
        return {
            success: false,
            slices: [],
            sliceCount: 0,
            errorMessage: error instanceof Error ? error.message : 'Failed to get image data'
        };
    }
    const data = imageData.data;

    // Step 2: 边缘修剪
    let workRect: { x: number; y: number; w: number; h: number } = {
        x: 0, y: 0, w: originalWidth, h: originalHeight
    };

    if (enableTrim) {
        const trimBounds = trimBorders(data, originalWidth, originalHeight, blankThreshold);
        if (trimBounds.w > 0 && trimBounds.h > 0) {
            workRect = trimBounds;
        }
    }

    // Step 3: 递归 XY-Cut 切分
    const rectangles = recursiveXyCut(
        data,
        originalWidth,
        workRect,
        blankThreshold,
        minGap,
        minSliceArea,
        0,
        'horizontal'
    );

    // Step 4: 切片提取
    const slices: SliceResult[] = [];

    for (const rect of rectangles) {
        if (rect.w <= 0 || rect.h <= 0) {
            continue;
        }

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = rect.w;
        sliceCanvas.height = rect.h;
        const sliceCtx = sliceCanvas.getContext('2d');

        if (!sliceCtx) {
            continue;
        }

        sliceCtx.drawImage(
            image,
            rect.x, rect.y, rect.w, rect.h,
            0, 0, rect.w, rect.h
        );

        const blob = await canvasToBlob(sliceCanvas, 'image/png');
        if (!blob) {
            continue;
        }

        slices.push({ blob, rect });
    }

    // Step 5: 结果校验
    if (slices.length === 0) {
        return {
            success: false,
            slices: [],
            sliceCount: 0,
            errorMessage: '未能检测到清晰的背景分割线，图片无法智能拆分。请确保图片具有纯色背景或明显的间隙。'
        };
    }

    // 如果只有 1 个切片，说明没有有效切分
    if (slices.length <= 1) {
        return {
            success: false,
            slices,
            sliceCount: slices.length,
            errorMessage: '未能检测到有效的分割区域，图片可能不具备可拆分的宫格结构。'
        };
    }

    return {
        success: true,
        slices,
        sliceCount: slices.length
    };
};

/**
 * 【保留兼容】detectAndSliceGrid 函数（内部调用新算法）
 *
 * @deprecated 请使用 detectAndSliceGridWithResult 获取详细状态
 */
export const detectAndSliceGrid = async (
    image: HTMLImageElement,
    options?: {
        blankThreshold?: number;
        minSliceArea?: number;
        enableTrim?: boolean;
    }
): Promise<SliceResult[]> => {
    const result = await detectAndSliceGridWithResult(image, {
        blankThreshold: options?.blankThreshold,
        minSliceArea: options?.minSliceArea,
        minGap: 5,
        enableTrim: options?.enableTrim
    });

    if (!result.success) {
        console.warn('[detectAndSliceGrid]', result.errorMessage);
    }

    return result.slices;
};

/**
 * 将 Canvas 转换为 Blob
 */
const canvasToBlob = (canvas: HTMLCanvasElement, mimeType = 'image/png'): Promise<Blob | null> => {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob);
        }, mimeType);
    });
};

/**
 * Convert slice results to image blobs suitable for the factory pipeline
 */
export const sliceResultsToImageBlobs = (
    slices: SliceResult[]
): { blob: Blob; width: number; height: number; rowIndex?: number; colIndex?: number }[] => {
    return slices.map(slice => ({
        blob: slice.blob,
        width: slice.rect.w,
        height: slice.rect.h,
        rowIndex: slice.rect.rowIndex,
        colIndex: slice.rect.colIndex
    }));
};

/**
 * 将 Blob 转换为 ObjectURL（用于预览）
 */
export const blobToObjectURL = (blob: Blob): string => {
    return URL.createObjectURL(blob);
};

/**
 * 释放 ObjectURL（防止内存泄漏）
 */
export const revokeObjectURL = (objectUrl: string) => {
    if (objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrl);
    }
};

/**
 * 批量释放 ObjectURL
 */
export const revokeObjectURLs = (objectUrls: string[]) => {
    objectUrls.forEach(url => revokeObjectURL(url));
};
