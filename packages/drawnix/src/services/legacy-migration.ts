import { assetStorageService } from './db/asset-storage-service';

/**
 * 迁移结果
 */
export interface MigrationResult {
    migrated: boolean;
    assetId?: string;
    error?: string;
}

/**
 * 检查字符串是否为 Base64 图片数据
 */
function isBase64Image(src: string | undefined): boolean {
    if (!src) return false;
    return src.startsWith('data:image/') && src.includes('base64');
}

/**
 * 将 Base64 转换为 Blob
 */
function base64ToBlob(base64: string): { blob: Blob; mimeType: string } {
    const matches = base64.match(/data:([^;]+);base64,(.+)/);
    const mimeType = matches?.[1] || 'image/png';
    const base64Data = matches?.[2] || base64;

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mimeType });
    return { blob, mimeType };
}

/**
 * 迁移旧画布元素中的 Base64 图片数据
 * 将 Base64 转换为 IndexedDB 资产
 *
 * @param element 画布元素
 * @returns 迁移后的元素（如果无需迁移则返回原元素）
 */
export async function migrateLegacyImageData(element: any): Promise<any> {
    // 检查 url 字段
    const src = element.url || element.image?.url;

    if (!src || !isBase64Image(src)) {
        return element;
    }

    try {
        console.log('[LegacyMigration] Migrating Base64 image:', element.id);

        // 转换 Base64 为 Blob
        const { blob, mimeType } = base64ToBlob(src);

        // 保存到 IndexedDB
        const assetId = await assetStorageService.createAssetFromBlob(blob, mimeType);

        console.log('[LegacyMigration] Migrated to assetId:', assetId);

        // 返回替换了 assetId 的元素
        return {
            ...element,
            assetId,
            // 移除 Base64 数据
            url: undefined,
            image: element.image ? {
                ...element.image,
                url: undefined,
                assetId
            } : undefined
        };
    } catch (error) {
        console.error('[LegacyMigration] Failed to migrate:', error);
        // 迁移失败，返回原元素
        return element;
    }
}

/**
 * 批量迁移画布元素
 * 在画布加载时调用此函数
 *
 * @param elements 画布元素数组
 * @param onProgress 进度回调（可选）
 * @returns 迁移后的元素数组
 */
export async function migrateLegacyCanvas(
    elements: any[],
    onProgress?: (current: number, total: number) => void
): Promise<any[]> {
    const total = elements.length;
    const results: any[] = [];

    // 分批处理，避免阻塞主线程
    const BATCH_SIZE = 10;

    for (let i = 0; i < elements.length; i += BATCH_SIZE) {
        const batch = elements.slice(i, i + BATCH_SIZE);

        const migratedBatch = await Promise.all(
            batch.map(element => migrateLegacyImageData(element))
        );

        results.push(...migratedBatch);

        // 报告进度
        if (onProgress) {
            onProgress(Math.min(i + BATCH_SIZE, total), total);
        }

        // 让出主线程
        if (i + BATCH_SIZE < elements.length) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    return results;
}

/**
 * 检查元素是否包含 Base64 数据
 */
export function hasBase64Data(element: any): boolean {
    const src = element.url || element.image?.url;
    return isBase64Image(src);
}

/**
 * 计算元素中的 Base64 数据大小（字节）
 */
export function estimateBase64Size(element: any): number {
    const src = element.url || element.image?.url;
    if (!src || !isBase64Image(src)) {
        return 0;
    }

    // 估算：Base64 编码会增大约 33%
    const base64Part = src.split(',')[1] || '';
    return Math.floor(base64Part.length * 0.75);
}
