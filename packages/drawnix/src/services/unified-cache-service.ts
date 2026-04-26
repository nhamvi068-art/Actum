import { LRUCache } from '../utils/lru-cache';
import { assetStorageService } from './db/asset-storage-service';
import { nanoid } from 'nanoid';

/**
 * 统一缓存与请求合并服务
 *
 * 核心功能：
 * 1. 请求合并 (Deduplication)：相同 assetId 只发起一次 IndexedDB 查询
 * 2. Blob LRU 缓存：最大 200 条，自动淘汰最久未使用的条目
 * 3. 组件自管理 ObjectURL：缓存服务只存 Blob，不存 URL
 * 4. 内存预注入：在图片上传时提前将 Blob 注入缓存
 *
 * 【重要】单一数据源架构：
 * - Model 层只存 assetId，不存 blob URL
 * - Cache 层（UnifiedCacheService）管理 Blob 生命周期
 * - 渲染层通过 getAssetBlob() 获取 Blob，自己创建 ObjectURL
 */
class UnifiedCacheService {
    /**
     * 请求合并缓存：正在进行的请求（Promise 缓存）
     * 多个组件请求同一 assetId 时，复用同一个 Promise
     */
    private pendingRequests = new Map<string, Promise<Blob | null>>();

    /**
     * Blob LRU 缓存
     * 使用 LRU 策略，自动淘汰最久未使用的条目
     *
     * 注意：这里只缓存 Blob，不缓存 URL
     * URL 由组件自己创建，自己管理生命周期
     */
    private blobCache = new LRUCache<string, Blob>(200);

    /**
     * 内存预注入缓存
     * 用于在图片上传时，提前将 Blob 注入缓存
     * 这样渲染层可以立即获取数据，无需等待 IndexedDB 写入
     *
     * 【核心】这是实现"单一数据源"的关键：
     * 上传时：insertImage → setAssetInMemory → 渲染立即可用
     * 刷新时：getAssetBlob → 内存/IndexedDB → 正常加载
     */
    private memoryInjectionCache = new Map<string, Blob>();

    /**
     * 预注入资产到内存
     * 在图片上传时调用，将 Blob 提前注入缓存
     * 确保渲染层可以立即获取数据
     *
     * 【使用场景】
     * insertImage() 流程中：
     * 1. 获取压缩后的 Blob
     * 2. 生成 assetId
     * 3. 调用 setAssetInMemory() 预注入
     * 4. 异步落盘到 IndexedDB
     * 5. 插入画板（Model 只存 assetId）
     *
     * @param assetId 资产 ID
     * @param blob 图片 Blob
     */
    setAssetInMemory(assetId: string, blob: Blob): void {
        this.memoryInjectionCache.set(assetId, blob);
        console.log('[UnifiedCache] Asset pre-injected to memory:', assetId, 'size:', blob.size, 'total cache size:', this.blobCache.size, '+1 pending');
    }

    /**
     * 获取资产 Blob（推荐方式）
     *
     * 【优先级】
     * 1. 内存预注入缓存（上传时预注入）
     * 2. LRU 缓存（最近使用过的）
     * 3. 正在进行的请求（避免重复加载）
     * 4. IndexedDB（持久化存储）
     *
     * 组件自行创建 ObjectURL，自己管理生命周期
     *
     * @param assetId 资产 ID
     * @returns Blob 或 null
     *
     * @example
     * ```typescript
     * const blob = await unifiedCacheService.getAssetBlob(assetId);
     * if (blob) {
     *     const url = URL.createObjectURL(blob);  // 组件自己创建
     *     // 使用 url...
     *     // 组件卸载时：URL.revokeObjectURL(url);
     * }
     * ```
     */
    async getAssetBlob(assetId: string): Promise<Blob | null> {
        // 0. 检查内存预注入缓存（最高优先级）
        const memoryCached = this.memoryInjectionCache.get(assetId);
        if (memoryCached) {
            // 转移到 LRU 缓存（保留一份在内存）
            this.blobCache.set(assetId, memoryCached);
            // 从预注入缓存移除（避免双重持有）
            this.memoryInjectionCache.delete(assetId);
            console.log('[UnifiedCache] Memory injection cache hit:', assetId, '→ transferred to LRU, remaining injections:', this.memoryInjectionCache.size);
            return memoryCached;
        }

        // 1. 检查 LRU 缓存（最近使用过的）
        const cached = this.blobCache.get(assetId);
        if (cached) {
            console.log('[UnifiedCache] LRU cache hit:', assetId, 'cache size:', this.blobCache.size);
            return cached;
        }

        // 2. 检查是否有正在进行的请求（请求合并）
        const pending = this.pendingRequests.get(assetId);
        if (pending) {
            console.log('[UnifiedCache] Pending request reuse:', assetId);
            return pending;
        }

        // 3. 从 IndexedDB 加载
        console.log('[UnifiedCache] Cache MISS for assetId:', assetId, '→ loading from IndexedDB, cache size:', this.blobCache.size);
        const requestPromise = this.loadAsset(assetId);
        this.pendingRequests.set(assetId, requestPromise);

        try {
            const blob = await requestPromise;
            return blob;
        } finally {
            // 请求完成后移除（但 Blob 已写入缓存）
            this.pendingRequests.delete(assetId);
        }
    }

    /**
     * 获取原始尺寸图片 Blob（用于下载）
     *
     * 【关键】此方法直接查询 IndexedDB，完全跳过 LRU 缓存，
     * 确保返回的是未经压缩的原始图片数据。
     *
     * 适用场景：下载按钮需要获取原始尺寸图片，而不是显示用的压缩版
     *
     * @param assetId 资产 ID
     * @returns 原始 Blob 或 null
     */
    async getOriginalBlob(assetId: string): Promise<Blob | null> {
        try {
            const asset = await assetStorageService.getAsset(assetId);
            if (asset?.originalBlob) {
                console.log('[UnifiedCache] getOriginalBlob hit for assetId:', assetId, 'original size:', asset.originalBlob.size);
                return asset.originalBlob;
            }
            // 兜底：没有原始 Blob 时返回压缩版
            if (asset?.blob) {
                console.log('[UnifiedCache] getOriginalBlob: no original, falling back to compressed for assetId:', assetId, 'compressed size:', asset.blob.size);
                return asset.blob;
            }
            // IndexedDB miss，尝试内存预注入缓存
            const memoryCached = this.memoryInjectionCache.get(assetId);
            if (memoryCached) {
                console.log('[UnifiedCache] getOriginalBlob: IndexedDB miss but memory hit for assetId:', assetId);
                return memoryCached;
            }
            console.log('[UnifiedCache] getOriginalBlob miss for assetId:', assetId);
            return null;
        } catch (e) {
            console.error('[UnifiedCache] getOriginalBlob error for assetId:', assetId, e);
            return null;
        }
    }

    /**
     * 从 IndexedDB 加载资产
     */
    private async loadAsset(assetId: string): Promise<Blob | null> {
        try {
            const asset = await assetStorageService.getAsset(assetId);
            // 优先返回原始尺寸图片（用于下载），其次才是压缩后的（用于显示）
            const blobToCache = asset?.originalBlob ?? asset?.blob;
            if (blobToCache) {
                this.blobCache.set(assetId, blobToCache);
                const label = asset?.originalBlob ? 'original' : 'compressed';
                console.log('[UnifiedCache] IndexedDB hit for assetId:', assetId, 'blob size:', blobToCache.size, `(${label})`, 'LRU cache size:', this.blobCache.size);
                return blobToCache;
            }
            // IndexedDB miss 时，检查内存预注入缓存（异步保存尚未完成时的兜底）
            const memoryCached = this.memoryInjectionCache.get(assetId);
            if (memoryCached) {
                console.log('[UnifiedCache] IndexedDB miss BUT memory hit for assetId:', assetId, '- using memory blob, size:', memoryCached.size);
                this.blobCache.set(assetId, memoryCached);
                this.memoryInjectionCache.delete(assetId);
                return memoryCached;
            }
            console.log('[UnifiedCache] IndexedDB miss for assetId:', assetId);
            return null;
        } catch (e) {
            console.error('[UnifiedCache] IndexedDB error for assetId:', assetId, e);
            return null;
        }
    }

    /**
     * 【保留兼容】获取 URL
     *
     * 注意：这个方法仅供内部流程使用，不推荐组件直接调用
     * 如果你需要使用图片 URL，请使用 getAssetBlob() 自己创建 URL
     *
     * @deprecated 请使用 getAssetBlob() 自行创建 URL
     */
    async getAssetUrl(assetId: string): Promise<string | null> {
        const blob = await this.getAssetBlob(assetId);
        if (!blob) return null;
        return URL.createObjectURL(blob);
    }

    /**
     * 检查 Blob 是否已缓存
     * 包括内存预注入缓存和 LRU 缓存
     */
    hasAsset(assetId: string): boolean {
        // 检查内存预注入缓存
        if (this.memoryInjectionCache.has(assetId)) {
            return true;
        }
        // 检查 LRU 缓存
        return this.blobCache.has(assetId);
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): {
        blobCount: number;
        pendingRequests: number;
        memoryInjectionCount: number;
    } {
        return {
            blobCount: this.blobCache.size,
            pendingRequests: this.pendingRequests.size,
            memoryInjectionCount: this.memoryInjectionCache.size
        };
    }

    /**
     * 获取 Blob 缓存大小
     */
    getCacheSize(): number {
        return this.blobCache.size;
    }

    /**
     * 清空所有 Blob 缓存（内存熔断时调用）
     *
     * 注意：这个方法只清除 Blob 缓存
     * 不会销毁任何 blob URL，因为 URL 由创建它们的组件自己管理
     *
     * 如果有组件正在使用某个 Blob，该组件的 URL 仍然有效
     * （因为 URL 是从 Blob 创建的，Blob 在内存中仍然存在）
     */
    clearAllBlobs(): void {
        this.blobCache.clear();
        console.log('[UnifiedCache] All Blob caches cleared');
    }

    /**
     * 清空内存预注入缓存（内存熔断时调用）
     * 这个缓存用于存储还未写入 IndexedDB 的 Blob
     */
    clearMemoryInjectionCache(): void {
        this.memoryInjectionCache.clear();
        console.log('[UnifiedCache] Memory injection cache cleared');
    }

    /**
     * 清空待处理的请求（内存熔断时调用）
     * 取消所有正在进行的异步请求
     */
    clearPendingRequests(): void {
        this.pendingRequests.clear();
        console.log('[UnifiedCache] Pending requests cleared');
    }

    /**
     * 预加载资产到缓存（提前缓存 Blob）
     * 用于预热缓存，避免首次加载时的延迟
     */
    async preloadAsset(assetId: string): Promise<void> {
        await this.getAssetBlob(assetId);
    }

    /**
     * 批量预加载资产
     */
    async preloadAssets(assetIds: string[]): Promise<void> {
        await Promise.all(assetIds.map(id => this.preloadAsset(id)));
    }

    /**
     * 缓存远程 URL 图片到本地
     *
     * 将外部 HTTP/HTTPS 图片下载到本地，以 Blob 形式存入缓存，
     * 返回一个新的 assetId，用于替代远程 URL 永久存储。
     *
     * @param remoteUrl 远程图片 URL
     * @param existingAssetId 可选：已有 assetId（用于覆盖已有缓存）
     * @returns 本地 assetId
     */
    async cacheRemoteUrl(remoteUrl: string, existingAssetId?: string): Promise<string> {
        const assetId = existingAssetId || nanoid();

        try {
            const response = await fetch(remoteUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch remote image: ${response.status}`);
            }
            const blob = await response.blob();

            // 存入内存缓存
            this.setAssetInMemory(assetId, blob);

            // 异步写入 IndexedDB（不阻塞）
            assetStorageService.saveAsset({
                id: assetId,
                type: 'image',
                mimeType: blob.type || 'image/webp',
                blob,
                size: blob.size,
            }).catch(e => console.warn('[UnifiedCache] cacheRemoteUrl: IndexedDB save failed:', e));

            console.log('[UnifiedCache] Remote URL cached locally:', { assetId, remoteUrl, size: blob.size });
            return assetId;
        } catch (e) {
            console.error('[UnifiedCache] cacheRemoteUrl failed:', e);
            throw e;
        }
    }

    /**
     * 获取本地缓存的 URL（Blob URL）
     *
     * 如果 assetId 已在内存中，返回内存中的 Blob URL；
     * 否则从 IndexedDB 加载后创建 Blob URL。
     *
     * 注意：返回的是临时 Blob URL，组件必须自己管理其生命周期。
     * 如果需要更规范的方案，请使用 getAssetBlob() 自己创建 URL。
     *
     * @param assetId 资产 ID
     * @returns Blob URL 或 null
     */
    async getCachedUrl(assetId: string): Promise<string | null> {
        const blob = await this.getAssetBlob(assetId);
        if (!blob) return null;
        return URL.createObjectURL(blob);
    }
}

// 全局单例
export const unifiedCacheService = new UnifiedCacheService();

// ============================================
// 缩略图缓存功能（模块级变量）
// ============================================

// 当前缓存的缩略图和对应的项目 ID
let cachedThumbnail: string | null = null;
let thumbnailProjectId: string | null = null;

/**
 * 设置缩略图缓存
 * 用于"连续静默快照"机制：用户静止时后台生成缩略图，退出时直接读取
 *
 * @param thumbnail Base64 缩略图字符串
 * @param projectId 项目 ID
 */
export function setCachedThumbnail(thumbnail: string, projectId: string): void {
  cachedThumbnail = thumbnail;
  thumbnailProjectId = projectId;
  console.log('[UnifiedCache] Thumbnail cached for project:', projectId, 'size:', thumbnail.length);
}

/**
 * 获取缩略图缓存
 * 只有当缓存的 projectId 与请求的 projectId 匹配时才返回
 *
 * @param projectId 项目 ID
 * @returns 缓存的 Base64 缩略图或 null
 */
export function getCachedThumbnail(projectId: string): string | null {
  if (thumbnailProjectId === projectId && cachedThumbnail) {
    console.log('[UnifiedCache] Thumbnail cache hit for project:', projectId);
    return cachedThumbnail;
  }
  console.log('[UnifiedCache] Thumbnail cache miss for project:', projectId);
  return null;
}

/**
 * 清除缩略图缓存
 * 通常在切换项目或组件卸载时调用
 */
export function clearCachedThumbnail(): void {
  cachedThumbnail = null;
  thumbnailProjectId = null;
  console.log('[UnifiedCache] Thumbnail cache cleared');
}
