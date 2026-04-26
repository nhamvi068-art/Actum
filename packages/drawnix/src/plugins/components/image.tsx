import React, { memo, useState, useEffect, useRef, useTransition } from 'react';
import { useViewportIntersection } from '../../hooks/use-viewport-intersection';
import { useBoardInteraction } from '../../hooks/use-board-interaction';
import { useImageLod } from '../../hooks/use-image-lod';
import { MEMORY_CRITICAL_EVENT } from '../../services/memory-monitor-service';
import type { ImageProps } from '@plait/common';
import classNames from 'classnames';
import { getCropData, isValidCropData } from '../../types/image-crop-render';

/**
 * LOD (Level of Detail) 渲染阈值
 */
const LOD_CONFIG = {
    // 缩略图阈值：zoom < 0.4 时使用缩略图
    THUMBNAIL_ZOOM_THRESHOLD: 0.4,
    // 缩略图最大边长
    THUMBNAIL_MAX_SIZE: 512,
};

/**
 * 缓存当前渲染状态（用于缩放锁定）
 */
interface RenderState {
    src: string;
    isThumbnail: boolean;
    isFrozen: boolean;
}

const currentRenderCache = new Map<string, RenderState>();

/**
 * 懒加载图片组件
 * 支持视口剔除和 LOD 多级渲染
 * 包含缩放期间的状态锁定和硬件加速
 */
export const LazyImage: React.FC<ImageProps> = memo((props: ImageProps) => {
    const { board, imageItem, getRectangle, isFocus, element } = props;

    // 从 element 透传的 assetId（弥补 @plait/common.CommonImageItem 不支持 assetId 的缺陷）
    const elementAssetId = (element as any)?.assetId as string | undefined;

    // 使用 imageItem 的尺寸作为后备
    const imageWidth = imageItem.width || 0;
    const imageHeight = imageItem.height || 0;

    // 生成唯一的缓存 key（优先使用 element assetId）
    const cacheKey = `${elementAssetId || imageItem.assetId || imageItem.url}_${imageWidth}x${imageHeight}`;

    // 渲染状态 ref（用于在缩放期间锁定）
    const renderStateRef = useRef<RenderState>({
        src: '',
        isThumbnail: false,
        isFrozen: false
    });

    // 使用 useTransition 替代 forceUpdate，平滑过渡状态
    const [, startTransition] = useTransition();

    // LOD 柔和渐入：追踪图片何时加载完成，触发 CSS 过渡
    const [isImageReady, setIsImageReady] = useState(false);

    // 图片源变化时重置渐入状态（避免切图时卡在 loaded 状态）
    useEffect(() => {
        setIsImageReady(false);
    }, [elementAssetId, imageItem.url]);

    // 使用 useMemo 缓存 getRectangle 结果
    const getElementRectangle = React.useMemo(
        () => () => getRectangle(),
        [getRectangle]
    );

    // 视口相交检测
    const { isIntersecting, isBoardReady } = useViewportIntersection(
        board,
        getElementRectangle,
        { padding: 500, immediate: true, boardReadyDelay: 500 }
    );

    // 交互状态检测（包含缩放状态）
    const { isInteracting, isZooming } = useBoardInteraction(
        board,
        { recoveryDelay: 150 }
    );

    // 获取当前缩放级别
    const currentZoom = board.viewport?.zoom || 1;

    // 首屏保护：画布未就绪时，不开始加载图片
    // 使用 Image LOD Hook（支持 assetId 模式）
    // 【状态同步修复】传入 onHighResLoaded 回调，确保高清图加载完成后立即重渲染
    const { thumbnailSrc, isThumbnailLoaded, fullImageUrl, status, error } = useImageLod({
        assetId: elementAssetId || imageItem.assetId,
        url: imageItem.url,
        maxSize: LOD_CONFIG.THUMBNAIL_MAX_SIZE,
        prefetch: isBoardReady, // 只有画布就绪后才预加载
        enabled: isBoardReady && isIntersecting, // 首屏保护和视口内才加载
        onHighResLoaded: () => {
            // 高清图加载完成，使用 startTransition 柔和过渡
            setIsImageReady(true);
            startTransition(() => {
                // 空回调，触发 transition
            });
        }
    });

    // 判断是否为可直接加载的 HTTP URL
    function isHttpUrl(url: string | undefined): boolean {
        if (!url) return false;
        return url.startsWith('http://') || url.startsWith('https://');
    }

    // 判断是否为临时的 blob: URL（乐观更新时使用）
    function isBlobUrl(url: string | undefined): boolean {
        if (!url) return false;
        return url.startsWith('blob:');
    }

    // 判断是否为临时的 blob: URL（乐观更新）- 此类 URL 应该跳过 LOD 降级，强制显示高清
    const isTemporaryUrl = imageItem.url && isBlobUrl(imageItem.url);

    // 获取渲染用的 URL（临时 blob: URL 直接作为高清原图）
    const renderUrl = isTemporaryUrl
        ? imageItem.url  // 临时 URL = 高清原图，跳过缩略图逻辑
        : (fullImageUrl || (imageItem.url && isHttpUrl(imageItem.url) ? imageItem.url : null));

    // 渲染策略：临时 URL 或选中状态跳过 LOD 降级，强制显示高清原图
    // - 临时 URL：新插入的图片（乐观更新）应该立即显示高清
    // - 选中状态：用户正在操作/查看的图片需要最清晰的细节
    const shouldUseThumbnail = !isTemporaryUrl &&
                              (currentZoom < LOD_CONFIG.THUMBNAIL_ZOOM_THRESHOLD || isInteracting) &&
                              isThumbnailLoaded &&
                              !fullImageUrl;

    // 监听交互结束事件，强制恢复高清（事件驱动机制，解决状态脱节问题）
    useEffect(() => {
        const handleInteractionEnd = (e: CustomEvent) => {
            const currentZoom = board.viewport?.zoom || 1;
            // 临时 URL 或选中状态：无条件恢复高清
            // 其他情况：zoom >= 0.15 时恢复高清
            const shouldRecoverHighRes = isTemporaryUrl || !!fullImageUrl || currentZoom >= 0.15;
            if (shouldRecoverHighRes && renderUrl) {
                // 使用 startTransition 确保平滑过渡
                startTransition(() => {
                    renderStateRef.current = {
                        src: renderUrl,
                        isThumbnail: false,
                        isFrozen: false
                    };
                });
            }
        };

        window.addEventListener('canvas-interaction-end', handleInteractionEnd as EventListener);
        return () => {
            window.removeEventListener('canvas-interaction-end', handleInteractionEnd as EventListener);
        };
    }, [board, renderUrl, isTemporaryUrl, fullImageUrl]);

    // 【内存熔断】订阅内存临界事件，触发时强制重置渲染状态
    useEffect(() => {
        const handleMemoryCritical = () => {
            console.warn('[LazyImage] Memory critical - resetting render state');
            // 强制卸载当前图片，重新加载会使用新的缓存
            startTransition(() => {
                renderStateRef.current = {
                    src: '',
                    isThumbnail: false,
                    isFrozen: false
                };
            });
        };

        window.addEventListener(MEMORY_CRITICAL_EVENT, handleMemoryCritical as EventListener);
        return () => {
            window.removeEventListener(MEMORY_CRITICAL_EVENT, handleMemoryCritical as EventListener);
        };
    }, []);

    // 缩放期间锁定 LOD 状态
    useEffect(() => {
        if (isZooming) {
            // 缩放期间：冻结当前渲染状态，不切换 src
            const currentState = renderStateRef.current;
            if (!currentState.isFrozen) {
                currentState.isFrozen = true;
                currentRenderCache.set(cacheKey, currentState);
            }
        } else {
            // 缩放结束：解除冻结
            // 临时 URL 或选中状态：强制使用高清原图，不使用缩略图
            const canUseHighRes = isTemporaryUrl || !!fullImageUrl || currentZoom >= 0.15;

            const cached = currentRenderCache.get(cacheKey);
            if (cached) {
                cached.isFrozen = false;
            }

            // 缩放结束且满足高清条件时，强制使用原图
            renderStateRef.current = {
                src: (canUseHighRes || !thumbnailSrc) ? renderUrl : thumbnailSrc,
                isThumbnail: !canUseHighRes && !!thumbnailSrc,
                isFrozen: false
            };
            // 使用 startTransition 应用最终的 LOD 级别
            startTransition(() => {});
        }
    }, [isZooming, cacheKey, shouldUseThumbnail, thumbnailSrc, renderUrl, isTemporaryUrl, fullImageUrl, currentZoom, board]);

    // 确定最终渲染的 src
    let renderSrc: string;
    let renderStyle: React.CSSProperties | undefined;

    if (renderStateRef.current.isFrozen) {
        // 缩放期间：使用冻结的 src
        renderSrc = renderStateRef.current.src;
        renderStyle = renderStateRef.current.isThumbnail ? {
            imageRendering: 'crisp-edges' as const,
            willChange: 'transform',
            transition: 'none',
        } : undefined;
    } else {
        // 正常渲染：根据条件选择
        if (shouldUseThumbnail && thumbnailSrc) {
            renderSrc = thumbnailSrc;
            renderStyle = {
                imageRendering: 'crisp-edges' as const,
                willChange: 'transform',
                transition: 'none',
            };
        } else {
            renderSrc = renderUrl;
            renderStyle = {
                imageRendering: 'auto' as const,
                opacity: isImageReady ? 1 : 0,
                transition: 'opacity 0.3s ease-in-out',
            };
        }

        // 更新缓存
        renderStateRef.current = {
            src: renderSrc,
            isThumbnail: shouldUseThumbnail,
            isFrozen: false
        };
    }

    // 容器样式 - 添加硬件加速
    const containerStyle: React.CSSProperties = {
        display: 'flex',
        width: imageWidth || '100%',
        height: imageHeight || '100%',
        minWidth: imageWidth || undefined,
        minHeight: imageHeight || undefined,
        willChange: 'transform',
        backfaceVisibility: 'hidden',
    };

    // 视口外：返回占位 div
    if (!isIntersecting) {
        return (
            <div
                style={{
                    ...containerStyle,
                    backgroundColor: '#f5f5f5',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 50%, #f0f0f0 75%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite',
                    }}
                />
            </div>
        );
    }

    // Loading 状态：显示骨架屏
    if (status === 'loading') {
        return (
            <div
                style={{
                    ...containerStyle,
                    backgroundColor: '#f5f5f5',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 50%, #f0f0f0 75%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite',
                    }}
                />
            </div>
        );
    }

    // Placeholder 状态：显示上传提示框（合法的空占位符）
    if (status === 'placeholder') {
        return (
            <div
                style={{
                    ...containerStyle,
                    backgroundColor: '#fafafa',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px dashed #d1d5db',
                    borderRadius: '4px',
                }}
            >
                <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ marginBottom: '4px' }}
                    >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <div style={{ fontSize: '11px' }}>点击上传图片</div>
                </div>
            </div>
        );
    }

    // Error 状态：显示优雅的占位
    if (status === 'error' || !renderUrl) {
        return (
            <div
                style={{
                    ...containerStyle,
                    backgroundColor: '#f9fafb',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px dashed #d1d5db',
                    borderRadius: '4px',
                }}
            >
                <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                    <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ marginBottom: '4px' }}
                    >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <div style={{ fontSize: '11px' }}>图片已丢失</div>
                </div>
            </div>
        );
    }

    // 是否为裁剪图片（非整图裁剪）
    const crop = element ? getCropData(element) : undefined;
    const isCropped = crop && isValidCropData(crop) &&
        (crop.width < 1 - 1e-6 || crop.height < 1 - 1e-6);

    // Success 状态：正常渲染图片
    return (
        <div style={containerStyle}>
            {isCropped ? (
                // 有 crop 时：用 overflow:hidden + absolute img 映射归一化裁剪区域
                <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                    <img
                        src={renderSrc}
                        draggable={false}
                        style={{
                            position: 'absolute',
                            // img 放大到足以填满容器（超出部分被 overflow:hidden 裁掉）
                            width: imageWidth / crop.width,
                            height: imageHeight / crop.height,
                            // 偏移到正确区域：crop.x=0.2 时，img 左侧 -20%*imgWidth，恰好把 x=0.2 处对齐到容器左侧
                            left: -(crop.x / crop.width) * imageWidth,
                            top: -(crop.y / crop.height) * imageHeight,
                            ...renderStyle,
                        }}
                        className={classNames('image-origin', 'lod-image', {
                            'image-origin--focus': isFocus,
                            'image-origin--thumbnail': renderStyle?.imageRendering === 'crisp-edges',
                            'lod-image--loaded': isImageReady && status === 'success',
                        })}
                    />
                </div>
            ) : (
                // 无 crop 或整图裁剪：保持原有 100% 填满行为
                <img
                    src={renderSrc}
                    draggable={false}
                    width="100%"
                    height="100%"
                    style={renderStyle}
                    className={classNames('image-origin', 'lod-image', {
                        'image-origin--focus': isFocus,
                        'image-origin--thumbnail': renderStyle?.imageRendering === 'crisp-edges',
                        'lod-image--loaded': isImageReady && status === 'success',
                    })}
                />
            )}
        </div>
    );
});

// 添加显示名称
LazyImage.displayName = 'LazyImage';
