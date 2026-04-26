import { PlaitBoard, PlaitElement, Transforms, getRectangleByElements, getSelectedElements, idCreator } from '@plait/core';
import { PlaitDrawElement, PlaitImage } from '@plait/draw';
import { loadImage, detectAndSliceGrid, sliceResultsToImageBlobs, SliceResult } from '../../utils/image-splitter';
import { createStandardImageElementsFromBlobs } from '../../services/image-element-factory';
import { unifiedCacheService } from '../../services/unified-cache-service';
import { getDataURL } from '../../data/blob';

/**
 * 子图间距常量（像素）
 * 用于在画布上排列拆分的子图时添加间隔
 */
const GAP = 15;

/**
 * 原图与拆分图组之间的垂直大间距（像素）
 * 新生成的拆分图组将放置在原图正下方
 */
const SECTION_GAP = 60;

/**
 * 【重构 v3】Execute smart split on a selected image element
 *
 * 交互规范 (Aitu UX)：
 * 1. 保留原图，不删除
 * 2. 在原图正下方（留出 SECTION_GAP 间距）生成拆分图组
 * 3. 子图组内部的切片使用 GAP 间距排列
 */
export const executeSmartSplit = async (
    board: PlaitBoard,
    targetElement: PlaitElement
): Promise<{ success: boolean; message: string; sliceCount: number }> => {
    // Validate target element is an image
    if (!PlaitDrawElement.isImage(targetElement)) {
        return {
            success: false,
            message: 'Selected element is not an image',
            sliceCount: 0
        };
    }

    const imageElement = targetElement as PlaitImage;
    const assetId = (imageElement as any).assetId as string | undefined;
    const imageUrl = imageElement.url;

    // 【强制收敛】优先使用 assetId 加载图片
    // 兼容旧数据：若无 assetId 则降级使用 url 字段
    let imageBlob: Blob | null = null;
    if (assetId) {
        imageBlob = await unifiedCacheService.getAssetBlob(assetId) ?? null;
    }
    if (!imageBlob && imageUrl) {
        // 降级：从 url 字段获取 Blob
        try {
            imageBlob = await urlToBlob(imageUrl);
        } catch (e) {
            console.warn('[executeSmartSplit] Failed to load image from url:', e);
        }
    }
    if (!imageBlob) {
        return {
            success: false,
            message: 'Image data not found (no assetId or url)',
            sliceCount: 0
        };
    }

    try {
        // Get the original image dimensions
        const image = await loadFromBlob(imageBlob);

        // Get the element's rectangle on the canvas
        const rectangle = getRectangleByElements(board, [imageElement], false);

        if (!rectangle) {
            return {
                success: false,
                message: 'Failed to get image position',
                sliceCount: 0
            };
        }

        // Calculate scale between original image and canvas display
        const originalWidth = image.width;
        const originalHeight = image.height;
        const canvasWidth = rectangle.width;
        const canvasHeight = rectangle.height;

        const scaleX = canvasWidth / originalWidth;
        const scaleY = canvasHeight / originalHeight;

        // 【重构 v3】计算拆分区域的起始坐标
        // 保留原图，新图组放置在原图正下方
        const originX = rectangle.x;
        // 新图组的起始 Y = 原图 Y + 原图高度 + 区域间距
        const startY = rectangle.y + rectangle.height + SECTION_GAP;

        // Detect and slice the grid
        const slices = await detectAndSliceGrid(image, {
            enableTrim: true // 开启边缘修剪
        });

        if (slices.length === 0) {
            return {
                success: false,
                message: 'No content regions detected',
                sliceCount: 0
            };
        }

        // 【强制收敛】使用新的 Blobs API，不再返回 dataURL
        const blobItems = sliceResultsToImageBlobs(slices);

        // 使用批量工厂创建标准 CanvasImageItems
        // 每个切片都有独立的 assetId，url 永远为空
        const imageItems = await createStandardImageElementsFromBlobs(
            blobItems.map(b => b.blob),
            blobItems.map(b => ({ width: b.width, height: b.height }))
        );

        // 【重构 v3】构建所有新图片元素
        // - 保留原图位置不变
        // - 新图组放置在原图下方（使用 startY 而非 originY）
        const newElements: PlaitImage[] = [];
        for (let i = 0; i < imageItems.length; i++) {
            const imageItem = imageItems[i];
            const slice = slices[i].rect;
            const blobItem = blobItems[i];

            // 获取行列索引，用于 GAP 偏移计算
            const rowIndex = blobItem.rowIndex ?? 0;
            const colIndex = blobItem.colIndex ?? 0;

            // 【关键修改】Y 坐标从 startY 开始，而非 originY
            const canvasX = originX + (slice.x * scaleX) + (colIndex * GAP);
            const canvasY = startY + (slice.y * scaleY) + (rowIndex * GAP);
            const canvasW = slice.w * scaleX;
            const canvasH = slice.h * scaleY;

            // 构建包含 assetId 的完整 PlaitImage Element
            const points: [[number, number], [number, number]] = [
                [canvasX, canvasY],
                [canvasX + canvasW, canvasY + canvasH],
            ];

            const newImageElement: PlaitImage = {
                id: idCreator(),
                type: 'image' as const,
                assetId: imageItem.assetId, // 核心透传！
                points,
                url: '', // Model 层只存 assetId，url 永远为空
                angle: imageElement.angle || 0, // 保留原图的旋转角度
            };

            newElements.push(newImageElement);
        }

        // 【重构 v3】只插入新图，不删除原图
        // 批量插入所有新图（按顺序插入到画板末尾）
        for (const newElement of newElements) {
            Transforms.insertNode(board, newElement as any, [board.children.length]);
        }

        return {
            success: true,
            message: `Successfully split image into ${slices.length} pieces (original kept, slices inserted below with ${SECTION_GAP}px gap)`,
            sliceCount: slices.length
        };
    } catch (error) {
        console.error('Smart split error:', error);

        // 【重构 v2】CORS 错误特殊处理
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        if (errorMessage.includes('CORS_RESTRICTION') || errorMessage.includes('tainted')) {
            return {
                success: false,
                message: '跨域图片限制：无法读取像素数据进行拆分分析。请先将图片下载至本地，再重新上传进行拆分。',
                sliceCount: 0
            };
        }

        return {
            success: false,
            message: errorMessage,
            sliceCount: 0
        };
    }
};

/**
 * 【重构 v3】使用 Modal 拆图后的结果直接插入画布
 *
 * 交互规范 (Aitu UX)：
 * 1. 保留原图，不删除
 * 2. 在原图正下方生成拆分图组
 *
 * @param board 画板实例
 * @param slices 切片结果（来自 Modal）
 * @param originalElement 原图元素
 */
export const executeSmartSplitFromSlices = async (
    board: PlaitBoard,
    slices: SliceResult[],
    originalElement: PlaitImage
): Promise<{ success: boolean; message: string; sliceCount: number }> => {
    if (slices.length === 0) {
        return {
            success: false,
            message: 'No slices to insert',
            sliceCount: 0
        };
    }

    try {
        // Get the original image rectangle on canvas
        const rectangle = getRectangleByElements(board, [originalElement], false);
        if (!rectangle) {
            return {
                success: false,
                message: 'Failed to get image position',
                sliceCount: 0
            };
        }

        // Calculate scale
        const originalWidth = slices[0].rect.x + slices[0].rect.w;
        const originalHeight = slices[0].rect.y + slices[0].rect.h;
        const canvasWidth = rectangle.width;
        const canvasHeight = rectangle.height;
        const scaleX = canvasWidth / originalWidth;
        const scaleY = canvasHeight / originalHeight;

        // 【重构 v3】计算拆分区域的起始坐标
        // 保留原图，新图组放置在原图正下方
        const originX = rectangle.x;
        const startY = rectangle.y + rectangle.height + SECTION_GAP;

        // 【强制收敛】使用 Blobs API
        const blobItems = sliceResultsToImageBlobs(slices);
        const imageItems = await createStandardImageElementsFromBlobs(
            blobItems.map(b => b.blob),
            blobItems.map(b => ({ width: b.width, height: b.height }))
        );

        // 构建新元素，带 GAP 间距
        const newElements: PlaitImage[] = [];
        for (let i = 0; i < imageItems.length; i++) {
            const imageItem = imageItems[i];
            const slice = slices[i].rect;
            const blobItem = blobItems[i];

            const rowIndex = blobItem.rowIndex ?? 0;
            const colIndex = blobItem.colIndex ?? 0;

            // 【关键修改】Y 坐标从 startY 开始
            const canvasX = originX + (slice.x * scaleX) + (colIndex * GAP);
            const canvasY = startY + (slice.y * scaleY) + (rowIndex * GAP);
            const canvasW = slice.w * scaleX;
            const canvasH = slice.h * scaleY;

            const points: [[number, number], [number, number]] = [
                [canvasX, canvasY],
                [canvasX + canvasW, canvasY + canvasH],
            ];

            newElements.push({
                id: idCreator(),
                type: 'image' as const,
                assetId: imageItem.assetId,
                points,
                url: '',
                angle: originalElement.angle || 0,
            });
        }

        // 【重构 v3】只插入新图，不删除原图
        // 批量插入所有新图
        for (const newElement of newElements) {
            Transforms.insertNode(board, newElement as any, [board.children.length]);
        }

        return {
            success: true,
            message: `Successfully inserted ${slices.length} slices below original image (${SECTION_GAP}px gap)`,
            sliceCount: slices.length
        };
    } catch (error) {
        console.error('Smart split from slices error:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred',
            sliceCount: 0
        };
    }
};

/**
 * 【内部工具】从 Blob 加载 HTMLImageElement
 */
async function loadFromBlob(blob: Blob): Promise<HTMLImageElement> {
    const dataURL = await getDataURL(blob);
    return loadImage(dataURL);
}

/**
 * 【内部工具】将 URL 字符串转换为 Blob
 * 支持 http/https 和 data:image/... 格式
 */
async function urlToBlob(url: string): Promise<Blob> {
    if (url.startsWith('data:')) {
        // data:image/... → Base64 解码 → Blob
        const arr = url.split(',');
        if (arr.length < 2) throw new Error('Invalid data URL');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
    }
    // http/https → fetch → Blob
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    return response.blob();
}

/**
 * Execute smart split on the currently selected image in the board
 */
export const executeSmartSplitOnSelected = async (
    board: PlaitBoard
): Promise<{ success: boolean; message: string; sliceCount: number }> => {
    const selectedElements = getSelectedElements(board);

    if (selectedElements.length === 0) {
        return {
            success: false,
            message: 'No element selected',
            sliceCount: 0
        };
    }

    // Find the first image element
    const imageElement = selectedElements.find(PlaitDrawElement.isImage) as PlaitImage | undefined;

    if (!imageElement) {
        return {
            success: false,
            message: 'No image selected',
            sliceCount: 0
        };
    }

    return executeSmartSplit(board, imageElement);
};
