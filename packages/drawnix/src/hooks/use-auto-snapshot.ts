import { useEffect, useRef, useCallback } from 'react';
import { PlaitBoard } from '@plait/core';
import { boardToImageOptimized } from '../utils/common';
import { setCachedThumbnail } from '../services/unified-cache-service';

/**
 * 自动快照 Hook 配置
 */
interface UseAutoSnapshotOptions {
  /** 静默防抖延迟（毫秒），用户停止操作多久后触发截图 */
  debounceDelay?: number;
  /** 是否启用自动快照（可用于调试） */
  enabled?: boolean;
  /** 缩略图生成完成后的回调（用于通知外部更新 React state） */
  onThumbnailGenerated?: (thumbnail: string, projectId: string) => void;
}

/**
 * 自动快照 Hook 返回值
 */
interface UseAutoSnapshotResult {
  /** 手动触发一次快照生成 */
  triggerSnapshot: () => void;
  /** 强制取消当前待执行的快照 */
  cancelPendingSnapshot: () => void;
}

/**
 * 连续静默快照 Hook
 *
 * 核心功能：
 * 1. 监听画板内容变化，用户停止操作 N 秒后自动生成缩略图
 * 2. 将生成的缩略图存入 UnifiedCacheService 缓存
 * 3. 退出时直接读取缓存，无需在卸载时截图
 *
 * 使用场景：
 * - 在 Drawnix 组件中使用，确保用户返回首页时能快速获取缩略图
 * - 配合 handleBack 使用，handleBack 直接读取缓存而非截图
 *
 * @param board 画布实例
 * @param projectId 项目 ID
 * @param options 配置选项
 * @returns 包含手动触发和取消方法的接口
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { triggerSnapshot } = useAutoSnapshot(board, projectId);
 *
 *   // 手动触发
 *   useEffect(() => {
 *     triggerSnapshot();
 *   }, [someCondition]);
 *
 *   return <Drawnix />;
 * }
 * ```
 */
export function useAutoSnapshot(
  board: PlaitBoard | null,
  projectId: string | null,
  options: UseAutoSnapshotOptions = {}
): UseAutoSnapshotResult {
  const {
    debounceDelay = 5000, // 默认 5 秒静默防抖（减少截图频率，避免闪烁）
    enabled = true,
    onThumbnailGenerated,
  } = options;

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 生成缩略图并存入缓存
   */
  const generateSnapshot = useCallback(async () => {
    if (!board || !projectId) {
      console.log('[useAutoSnapshot] Skipped: no board or projectId');
      return;
    }

    // 跳过空画布的快照（避免透明 GIF 覆盖已有的有效缩略图缓存）
    const boardElement = (board as any).children;
    if (!boardElement || boardElement.length === 0) {
      console.log('[useAutoSnapshot] Skipped: board is empty (no elements to capture)');
      return;
    }

    console.log('[useAutoSnapshot] Generating snapshot for project:', projectId);

    try {
      const thumbnail = await boardToImageOptimized(board, {
        ratio: 0.4,
        maxElements: 200
      });

      if (thumbnail) {
        // 跳过极小的缩略图（通常是透明 GIF），不写入缓存
        if (thumbnail.length < 1000) {
          console.warn('[useAutoSnapshot] Thumbnail too small, skipping cache:', thumbnail.length, 'bytes');
          return;
        }
        setCachedThumbnail(thumbnail, projectId);
        if (onThumbnailGenerated) {
          onThumbnailGenerated(thumbnail, projectId);
        }
        console.log('[useAutoSnapshot] Snapshot saved to cache, size:', thumbnail.length);
      } else {
        console.log('[useAutoSnapshot] Snapshot generation returned null (skipped or failed)');
      }
    } catch (error) {
      console.warn('[useAutoSnapshot] Snapshot generation failed:', error);
    }
  }, [board, projectId, onThumbnailGenerated]);

  /**
   * 调度快照生成（带防抖）
   */
  const scheduleSnapshot = useCallback(() => {
    if (!enabled) return;

    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // 设置新的定时器
    debounceTimerRef.current = setTimeout(() => {
      console.log('[useAutoSnapshot] Debounce timer fired, generating snapshot...');
      generateSnapshot();
    }, debounceDelay);
  }, [generateSnapshot, debounceDelay, enabled]);

  /**
   * 取消待执行的快照
   */
  const cancelPendingSnapshot = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      console.log('[useAutoSnapshot] Pending snapshot cancelled');
    }
  }, []);

  // 监听画板变化事件
  useEffect(() => {
    if (!board || !projectId || !enabled) return;

    // 监听 board 的 change 事件
    const handleChange = () => {
      scheduleSnapshot();
    };

    // 使用 requestAnimationFrame 节流，避免频繁触发
    let rafId: number | null = null;
    const throttledHandler = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        handleChange();
        rafId = null;
      });
    };

    // 绑定事件
    if ((board as any).on) {
      (board as any).on('change', throttledHandler);
    }

    // 监听全局的交互结束事件（来自 use-board-interaction）
    const handleGlobalInteractionEnd = () => {
      scheduleSnapshot();
    };
    window.addEventListener('canvas-interaction-end', handleGlobalInteractionEnd);

    // 初始生成一次（页面加载后等待一小段时间）
    const initialTimer = setTimeout(() => {
      if (board && projectId) {
        console.log('[useAutoSnapshot] Initial snapshot scheduled');
        generateSnapshot();
      }
    }, 2000); // 2 秒后初始生成

    // 清理函数
    return () => {
      // 取消待执行的定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // 取消 RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      // 解绑事件
      if ((board as any).off) {
        (board as any).off('change', throttledHandler);
      }
      window.removeEventListener('canvas-interaction-end', handleGlobalInteractionEnd);

      // 清除初始定时器
      clearTimeout(initialTimer);
    };
  }, [board, projectId, enabled, scheduleSnapshot, generateSnapshot]);

  // 暴露接口
  return {
    triggerSnapshot: generateSnapshot,
    cancelPendingSnapshot
  };
}
