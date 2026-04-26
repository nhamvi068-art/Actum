import { useState, useEffect, useRef, useCallback } from 'react';
import { generateThumbnail } from '../utils/thumbnail-generator';
import { unifiedCacheService } from '../services/unified-cache-service';

/**
 * Image LOD Hook 配置选项
 */
export interface UseImageLodOptions {
    /** 缩略图最大边长 */
    maxSize?: number;
    /** 是否预生成缩略图 */
    prefetch?: boolean;
    /** IndexedDB 资产 ID（主要来源） */
    assetId?: string;
    /** 图片 URL（仅用于外部链接图片兜底） */
    url?: string;
    /** 是否启用加载（首屏保护） */
    enabled?: boolean;
    /** 高清图加载完成时的回调 */
    onHighResLoaded?: () => void;
}

/**
 * Image LOD Hook 返回值
 */
export interface UseImageLodResult {
    /** 缩略图 Base64 */
    thumbnailSrc: string | null;
    /** 缩略图是否已加载 */
    isThumbnailLoaded: boolean;
    /** 缩略图是否正在加载 */
    isThumbnailLoading: boolean;
    /** 完整图片 URL（组件创建的 ObjectURL） */
    fullImageUrl: string | null;
    /** 是否正在加载完整图片 */
    isFullImageLoading: boolean;
    /** 加载状态：idle | loading | success | error | placeholder */
    status: 'idle' | 'loading' | 'success' | 'error' | 'placeholder';
    /** 错误信息 */
    error: string | null;
    /** 强制重新生成缩略图 */
    regenerate: () => void;
}

/**
 * 判断是否为可直接加载的 HTTP URL
 */
function isHttpUrl(url: string | undefined | null): boolean {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * 管理图片加载的 Hook（单一数据源架构）
 *
 * 核心设计原则：
 * 1. 只依赖 assetId，从 unifiedCacheService 获取 Blob
 * 2. 组件自管理 ObjectURL 生命周期
 * 3. 直接从 Blob 生成缩略图，绕过 URL
 * 4. 【单一数据源】Model 层只存 assetId，不存 blob URL
 *
 * 【数据流】
 * 上传时：insertImage → setAssetInMemory(assetId, blob) → 异步落盘
 * 渲染时：getAssetBlob(assetId) → Blob → ObjectURL → <img>
 * 刷新时：getAssetBlob(assetId) → 内存/IndexedDB → Blob → ObjectURL → <img>
 *
 * @param options 配置选项
 * @returns 图片加载状态
 */
export function useImageLod(
    options: UseImageLodOptions = {}
): UseImageLodResult {
    const { maxSize = 256, prefetch = true, assetId, url, enabled = true, onHighResLoaded } = options;

    const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
    const [isThumbnailLoaded, setIsThumbnailLoaded] = useState(false);
    const [isThumbnailLoading, setIsThumbnailLoading] = useState(false);
    const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
    const [isFullImageLoading, setIsFullImageLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'placeholder'>('idle');
    const [error, setError] = useState<string | null>(null);

    const assetIdRef = useRef(assetId);
    const urlRef = useRef(url);
    const maxSizeRef = useRef(maxSize);

    // 组件自管理的 ObjectURL（由组件创建，组件销毁）
    const componentObjectUrlRef = useRef<string | null>(null);

    // 追踪缩略图加载状态
    const thumbnailLoadedRef = useRef(false);

    // 更新 refs
    useEffect(() => {
        assetIdRef.current = assetId;
        urlRef.current = url;
        maxSizeRef.current = maxSize;
    }, [assetId, url, maxSize]);

    /**
     * 加载缩略图 - 直接从 Blob 生成
     *
     * 【核心优化】直接从 Blob 解码生成缩略图
     * 完全绕过 URL 创建，避免 blob URL 生命周期问题
     */
    const loadThumbnail = useCallback(async (blob: Blob): Promise<boolean> => {
        const currentMaxSize = maxSizeRef.current;

        setIsThumbnailLoading(true);
        try {
            // 直接从 Blob 生成缩略图（不创建 URL）
            const thumb = await generateThumbnail(blob, currentMaxSize);
            setThumbnailSrc(thumb);
            setIsThumbnailLoaded(true);
            thumbnailLoadedRef.current = true;
            return true;
        } catch (e) {
            console.error('[useImageLod] Failed to generate thumbnail from blob:', e);
            setStatus('error');
            setError((e as Error).message || 'Failed to generate thumbnail');
            thumbnailLoadedRef.current = false;
            return false;
        } finally {
            setIsThumbnailLoading(false);
        }
    }, []);

    /**
     * 从 unifiedCacheService 加载完整图片
     * 组件自己创建 ObjectURL，自己管理生命周期
     */
    const loadFullImage = useCallback(async (targetAssetId: string): Promise<string | null> => {
        setIsFullImageLoading(true);

        try {
            // 从统一缓存服务获取 Blob（优先内存缓存 > LRU缓存 > IndexedDB）
            const blob = await unifiedCacheService.getAssetBlob(targetAssetId);

            // 【关键修复】assetId 存在但 Blob 还未就绪（两阶段插入中间状态）
            // 此时 Blob 可能正在预注入过程中，不应该报错
            // 保持 loading 状态，组件会等待数据真正可用
            if (!blob) {
                console.log('[useImageLod] assetId exists but Blob not yet available:', targetAssetId, '(may be in pre-injection phase)');
                // 【注意】不设置 error 状态，保持 loading 直到数据真正到达
                // 由于 useEffect 依赖 assetId，数据到达后会自动重新触发加载
                setIsFullImageLoading(false);
                return null;
            }

            // 直接从 Blob 生成缩略图
            if (!thumbnailLoadedRef.current) {
                await loadThumbnail(blob);
            }

            // 组件自己创建 ObjectURL
            // 这样只有这个组件能销毁这个 URL，不会影响其他组件
            if (componentObjectUrlRef.current) {
                URL.revokeObjectURL(componentObjectUrlRef.current);
            }
            componentObjectUrlRef.current = URL.createObjectURL(blob);

            setFullImageUrl(componentObjectUrlRef.current);
            setIsFullImageLoading(false);
            setStatus('success');
            return componentObjectUrlRef.current;
        } catch (e) {
            console.error('[useImageLod] Failed to load full image:', e);
            setStatus('error');
            setError((e as Error).message || 'Failed to load image');
            setIsFullImageLoading(false);
            return null;
        }
    }, [loadThumbnail]);

    /**
     * 从 URL 加载图片（仅用于外部链接图片兜底）
     */
    const loadFromUrl = useCallback(async (imageUrl: string): Promise<void> => {
        setIsFullImageLoading(true);
        setIsThumbnailLoading(true);

        try {
            setFullImageUrl(imageUrl);

            // 生成缩略图
            const thumb = await generateThumbnail(imageUrl, maxSizeRef.current);
            setThumbnailSrc(thumb);
            setIsThumbnailLoaded(true);
            thumbnailLoadedRef.current = true;

            setStatus('success');
        } catch (e) {
            console.error('[useImageLod] Failed to load from URL:', e);
            setStatus('error');
            setError((e as Error).message || 'Failed to load from URL');
        } finally {
            setIsFullImageLoading(false);
            setIsThumbnailLoading(false);
        }
    }, []);

    // 加载图片主逻辑
    useEffect(() => {
        if (!enabled) return;

        // 重置状态
        setStatus('idle');
        setError(null);

        const loadImage = async () => {
            try {
                const currentAssetId = assetIdRef.current;
                const currentUrl = urlRef.current;

                console.log('[useImageLod] Loading image:', {
                    assetId: currentAssetId,
                    url: currentUrl
                });

                // 【第一优先级】assetId（本地高贵资产）
                // 无论 url 是什么，只要有有效的 assetId 就优先使用
                if (currentAssetId && currentAssetId.trim() !== '') {
                    console.log('[useImageLod] Using assetId:', currentAssetId);

                    // 【关键】必须同步设置 status='loading'，确保首次渲染就知道正在加载
                    // 如果等 loadFullImage() 完成后才设置，组件会先闪一下其他状态
                    setStatus('loading');

                    const objectUrl = await loadFullImage(currentAssetId);
                    if (objectUrl) {
                        setStatus('success');
                        if (onHighResLoaded) {
                            onHighResLoaded();
                        }
                    }
                    // 【两阶段插入中间状态】loadFullImage 返回 null 是正常的（blob 还在路上）
                    // status 已经设为 'loading'，组件会继续显示骨架屏直到 blob 到达
                    // 不设置 error，保持 loading
                }
                // 【第二优先级】HTTP URL（远程网络图片）
                else if (currentUrl && (isHttpUrl(currentUrl) || currentUrl.startsWith('data:'))) {
                    console.log('[useImageLod] Using URL:', currentUrl);
                    setStatus('loading');
                    await loadFromUrl(currentUrl);
                }
                // 【占位符状态】既没有有效的 assetId 也没有有效的 url
                // 这是合法的占位符情况（如用户只画了一个框，还没选择图片）
                else {
                    console.log('[useImageLod] Placeholder element detected (no image source yet):', {
                        assetId: currentAssetId,
                        url: currentUrl
                    });
                    setStatus('placeholder');
                    setError(null);
                }
            } catch (e) {
                console.error('[useImageLod] Unexpected error:', e);
                setStatus('error');
                setError((e as Error).message || 'Unexpected error');
            }
        };

        loadImage();
        // 注意：移除 status，避免无限循环
    }, [assetId, url, enabled]);

    // 强制重新生成
    const regenerate = useCallback(() => {
        const currentAssetId = assetIdRef.current;
        if (currentAssetId) {
            // 清除缓存并重新加载
            setIsThumbnailLoaded(false);
            setThumbnailSrc(null);
            thumbnailLoadedRef.current = false;
            loadFullImage(currentAssetId);
        }
    }, [loadFullImage]);

    // 组件卸载时清理
    useEffect(() => {
        return () => {
            // 销毁组件创建的 ObjectURL
            if (componentObjectUrlRef.current) {
                URL.revokeObjectURL(componentObjectUrlRef.current);
                componentObjectUrlRef.current = null;
            }
        };
    }, []);

    return {
        thumbnailSrc,
        isThumbnailLoaded,
        isThumbnailLoading,
        fullImageUrl,
        isFullImageLoading,
        status,
        error,
        regenerate,
    };
}
