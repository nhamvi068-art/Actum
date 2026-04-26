/**
 * 旧数据迁移服务
 * 使用串行处理 + 内存释放，避免 OOM
 * 支持取消操作和大文件跳过
 */

import { assetStorageService } from '../services/db/asset-storage-service';

/**
 * 迁移选项
 */
export interface MigrationOptions {
    /** 中止信号，用于取消迁移 */
    abortSignal?: AbortSignal;
    /** 最大 Blob 大小（字节），超过则跳过，默认 20MB */
    maxBlobSize?: number;
}

/**
 * 迁移进度信息
 */
export interface MigrationProgress {
    current: number;
    total: number;
    percent: number;
    currentElementId?: string;
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
 * 迁移旧画布数据中的 Base64 图片
 * 使用串行处理 + 内存释放，避免 OOM
 *
 * @param boardData 画布数据（包含 children 或直接是元素数组）
 * @param onProgress 进度回调 (percent: number) => void
 * @param options 迁移选项（abortSignal, maxBlobSize）
 * @returns 迁移后的数据
 */
export async function migrateLegacyBoardData(
    boardData: any,
    onProgress?: (percent: number) => void,
    options?: MigrationOptions
): Promise<any> {
    const { abortSignal, maxBlobSize = 20 * 1024 * 1024 } = options || {};

    // 1. 获取元素数组
    const elements = boardData.children || boardData;

    if (!Array.isArray(elements)) {
        return boardData;
    }

    // 2. 找出需要迁移的元素（带有 Base64 且没有 assetId）
    const toMigrate: Array<{ element: any; index: number; url: string }> = [];

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        // 检查 url 字段或 image.url 字段
        const url = element.url || element.image?.url;

        if (url && isBase64Image(url) && !element.assetId) {
            toMigrate.push({ element, index: i, url });
        }
    }

    // 如果没有需要迁移的元素，直接返回
    if (toMigrate.length === 0) {
        onProgress?.(100);
        return boardData;
    }

    console.log(`[LegacyMigrationService] Found ${toMigrate.length} images to migrate`);

    // 3. 串行处理（极其重要，避免并发导致内存峰值）
    for (let i = 0; i < toMigrate.length; i++) {
        // 3.0 检查中止信号
        if (abortSignal?.aborted) {
            console.log('[LegacyMigrationService] Migration aborted by user');
            throw new Error('Migration aborted');
        }

        const { element, url } = toMigrate[i];

        try {
            // 3.1 Base64 转 Blob
            const { blob, mimeType } = base64ToBlob(url);

            // 3.2 检查 Blob 大小，跳过超大文件
            if (blob.size > maxBlobSize) {
                console.warn(`[LegacyMigrationService] Skipping oversized blob (${blob.size} bytes): ${element.id}`);
                // 标记为已处理但不迁移
                element._migrationSkipped = true;
                element._skipReason = 'oversized';

                // 更新进度
                const percent = Math.round(((i + 1) / toMigrate.length) * 100);
                onProgress?.(percent);

                // 仍然让出主线程
                await new Promise(resolve => setTimeout(resolve, 50));
                continue;
            }

            // 3.3 保存到 IndexedDB
            const assetId = await assetStorageService.createAssetFromBlob(blob, mimeType);

            // 3.4 替换 assetId 并删除 url（释放内存）
            element.assetId = assetId;

            // 删除 url 字段
            if (element.url) {
                delete element.url;
            }

            // 同时处理 image.url
            if (element.image && element.image.url) {
                delete element.image.url;
                element.image.assetId = assetId;
            }

            // 3.5 尝试释放 Blob 内存
            if (blob.close) {
                blob.close();
            }

            console.log(`[LegacyMigrationService] Migrated ${i + 1}/${toMigrate.length}: ${element.id} -> ${assetId}`);

        } catch (error) {
            // 判断是否是中止错误
            if (abortSignal?.aborted) {
                console.log('[LegacyMigrationService] Migration aborted');
                throw new Error('Migration aborted');
            }

            console.error(`[LegacyMigrationService] Failed to migrate element ${element.id}:`, error);
            // 迁移失败，保留原始数据，标记错误
            element._migrationError = (error as Error).message;
        }

        // 3.6 更新进度
        const percent = Math.round(((i + 1) / toMigrate.length) * 100);
        onProgress?.(percent);

        // 3.7 每处理完一个，让出主线程 50ms（给浏览器时间处理 UI）
        if (i < toMigrate.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    console.log('[LegacyMigrationService] Migration completed');

    return boardData;
}

/**
 * 检查画布数据是否需要迁移
 */
export function needsMigration(boardData: any): boolean {
    const elements = boardData?.children || boardData;

    if (!Array.isArray(elements)) {
        return false;
    }

    for (const element of elements) {
        const url = element.url || element.image?.url;
        if (url && isBase64Image(url) && !element.assetId) {
            return true;
        }
    }

    return false;
}

/**
 * 估算需要迁移的图片数量
 */
export function countImagesToMigrate(boardData: any): number {
    const elements = boardData?.children || boardData;

    if (!Array.isArray(elements)) {
        return 0;
    }

    let count = 0;
    for (const element of elements) {
        const url = element.url || element.image?.url;
        if (url && isBase64Image(url) && !element.assetId) {
            count++;
        }
    }

    return count;
}

/**
 * 估算 Base64 数据的大小
 */
export function estimateBase64Size(src: string): number {
    if (!src || !isBase64Image(src)) {
        return 0;
    }

    // 估算：Base64 编码会增大约 33%
    const base64Part = src.split(',')[1] || '';
    return Math.floor(base64Part.length * 0.75);
}
