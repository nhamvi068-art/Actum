import React, { useEffect, useState, useRef, memo } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  FloatingPortal,
} from '@floating-ui/react';
import { unifiedCacheService } from '../../services/unified-cache-service';

// 选中图片元数据类型（与 SelectionTracker 保持一致）
export interface SelectedImageMeta {
  id: string;
  assetId?: string;
  url?: string;
}

// 上传图片文件类型
export interface ImageFile {
  url: string;
  name: string;
  id: string;
}

interface PreviewImageItemProps {
  image: SelectedImageMeta | ImageFile;
  isSelected?: boolean;
  onRemove?: () => void;
  onImageLoaded?: (dataUrl: string) => void;
  onClick?: () => void;
}

/**
 * 独立的预览图片组件（增强版）
 * 【职责】组件自管理 Blob URL 生命周期，带异常降级。
 * 悬停预览通过 @floating-ui/react FloatingPortal 挂到 body，彻底规避祖先 overflow 裁切。
 */
export const PreviewImageItem: React.FC<PreviewImageItemProps> = memo(({
  image,
  isSelected = true,
  onRemove,
  onImageLoaded,
  onClick,
}) => {
  const [imgUrl, setImgUrl] = useState<string | null>(
    (image.url && !image.assetId) ? image.url : null
  );
  const [isError, setIsError] = useState(false);

  // 用 ref 标记是否已触发过加载，避免依赖数组陷阱导致无限循环
  const hasLoadedRef = useRef(false);
  // 用 ref 保存 objectUrl，cleanup 时安全释放
  const objectUrlRef = useRef<string | null>(null);
  // 用 ref 标记异步加载是否进行中（解决 Strict Mode 双挂载竞态）
  const isLoadingRef = useRef(false);

  // ── Floating UI ───────────────────────────────────────────────────────────
  const [isHovering, setIsHovering] = useState(false);

  const floating = useFloating({
    placement: 'top',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip(),
      shift({ padding: 5 }),
    ],
  });

  const { refs, floatingStyles } = floating;

  // 使用原生事件控制 hover 状态
  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);

  // ── 副作用：加载 Blob（幂等，仅首次挂载执行）─────────────────────────────
  useEffect(() => {
    // 有 url 且无 assetId → 已在 state 初始化时处理，无需重复加载
    if (image.url && !image.assetId) {
      return;
    }

    // 已有 imgUrl → 已成功加载过，跳过
    if (hasLoadedRef.current && imgUrl) {
      return;
    }

    // 加载进行中 → 跳过本次加载，让第一次异步完成（Strict Mode 双挂载时）
    if (isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 500; // 500ms

    const loadBlob = async () => {
      if (!image.assetId) {
        if (cancelled) { isLoadingRef.current = false; return; }
        if (image.url) setImgUrl(image.url);
        else setIsError(true);
        isLoadingRef.current = false;
        return;
      }

      try {
        const blob = await unifiedCacheService.getAssetBlob(image.assetId);
        if (cancelled) {
          isLoadingRef.current = false;
          return;
        }
        if (blob) {
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
          const newObjectUrl = URL.createObjectURL(blob);
          objectUrlRef.current = newObjectUrl;
          setImgUrl(newObjectUrl);
          hasLoadedRef.current = true;
          onImageLoaded?.(newObjectUrl);
        } else {
          // Blob 未就绪，可能 IndexedDB 还在写入，尝试重试
          retryCount++;
          if (retryCount < maxRetries) {
            console.log(`[PreviewImageItem] Blob not ready for ${image.assetId}, retry ${retryCount}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            if (!cancelled) loadBlob(); // 递归重试
            return;
          }
          // 所有重试都失败了
          console.warn(`[PreviewImageItem] Failed to load blob for ${image.assetId} after ${maxRetries} retries`);
          if (image.url) setImgUrl(image.url);
          else setIsError(true);
          hasLoadedRef.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[PreviewImageItem] Error loading blob:', err);
          if (image.url) setImgUrl(image.url);
          else setIsError(true);
          hasLoadedRef.current = true;
        }
      } finally {
        if (!cancelled) {
          isLoadingRef.current = false;
        }
      }
    };

    loadBlob();

    return () => {
      cancelled = true;
      // Strict Mode cleanup 后重置，让下一个 effect run 完整执行
      isLoadingRef.current = false;
      // 清理时撤销 objectUrl（组件卸载时）
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [image.assetId, image.url]);

  // ── 渲染 ────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div
        className="bottom-input-bar__preview-skeleton"
        style={{ backgroundColor: '#ffebee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#ff4d4f' }}
      >
        失效
      </div>
    );
  }

  if (!imgUrl) {
    return <div className="bottom-input-bar__preview-skeleton" />;
  }

  return (
    <>
      {/* reference：挂在 DOM 中的缩略图容器（鼠标悬停目标） */}
      <div
        ref={refs.setReference}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => { if (onClick) onClick(); }}
        className={`bottom-input-bar__preview-image-item ${isSelected ? 'bottom-input-bar__preview-image-item--selected' : ''}`}
      >
        <img src={imgUrl} alt={image.name || 'preview'} />

        {onRemove && (
          <button
            type="button"
            className="bottom-input-bar__remove-btn"
            aria-label="删除"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >×</button>
        )}
      </div>

      {/* Floating：预览大图，通过 FloatingPortal 挂到 body */}
      <FloatingPortal>
        <div
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            opacity: isHovering ? 1 : 0,
            pointerEvents: isHovering ? 'auto' : 'none',
          }}
          className={`bottom-input-bar__preview-tooltip ${isSelected ? 'bottom-input-bar__preview-tooltip--selected' : ''}`}
        >
          <img src={imgUrl} alt="enlarged preview" />
        </div>
      </FloatingPortal>
    </>
  );
});

PreviewImageItem.displayName = 'PreviewImageItem';
