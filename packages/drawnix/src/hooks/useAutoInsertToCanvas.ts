import { useEffect, useCallback, useRef } from 'react';
import { PlaitBoard } from '@plait/core';
import { useWorkflowStatusSync } from './useWorkflowStatusSync';
import { insertStandardImage, DEFAULT_IMAGE_WIDTH } from '../services/image-element-factory';

/**
 * 自动插入到画布的 Hook
 *
 * 【强制收敛】
 * 所有图片插入统一走 image-element-factory 的标准管线：
 *   1. createStandardImageElement() → 严格符合 CanvasImageItem 的数据
 *   2. assetId 必有，url 永远为空字符串
 *   3. Base64 / HTTP URL / Blob → 统一转换为 Blob → 压缩 → 落盘
 *
 * 彻底消灭的后门：
 * ❌ uri 字段（直接塞 blob URL 到画板 JSON）
 * ❌ url 字段为 Base64 / HTTP URL
 * ✅ 一律通过工厂生成 assetId，Model 层只存 assetId
 *
 * 【去重机制】
 * 通过 Ref 记录已插入的任务 ID，防止 handleImageGenerated 和 liveQuery 回调双重触发导致重复插入。
 */
export const useAutoInsertToCanvas = (board: PlaitBoard | null) => {
  const { lastCompletedTask, clearLastCompleted } = useWorkflowStatusSync();
  // 记录已插入的任务 ID，防止重复插入
  const insertedTaskIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!board || !lastCompletedTask) return;

    // 【去重】检查该任务是否已通过 handleImageGenerated 插入
    const taskId = (lastCompletedTask as any).id || (lastCompletedTask as any).taskId;
    if (taskId && insertedTaskIds.current.has(taskId)) {
      clearLastCompleted();
      return;
    }

    // 检查是否是图片生成任务
    if (
      lastCompletedTask.status === 'completed' &&
      lastCompletedTask.result &&
      (lastCompletedTask.result.type === 'image' || lastCompletedTask.type === 'image_generation')
    ) {
        const doInsert = async () => {
        try {
          // 优先从 resultImageUrl 获取（Phase 2 内存任务同步格式），
          // 兼容旧数据从 result.remoteUrl 读取
          const imageUrl = (lastCompletedTask as any).resultImageUrl || lastCompletedTask.result?.remoteUrl;
          const metadata = lastCompletedTask.result?.metadata;

          if (!imageUrl) {
            console.warn('[useAutoInsertToCanvas] No result image URL provided');
            return;
          }

          // 【强制收敛】调用 insertStandardImage：
          // - 两阶段架构：预注入内存 → 同步占座 → 异步填充
          // - 不再使用阻塞的 createStandardImageElement
          // - 传入预计算的宽高，避免重复获取尺寸
          await insertStandardImage(
            board,
            imageUrl,
            undefined,
            {
              width: metadata?.width || DEFAULT_IMAGE_WIDTH,
              height: metadata?.height || DEFAULT_IMAGE_WIDTH,
            }
          );

          // 清除完成状态，避免重复插入
          if (taskId) {
            insertedTaskIds.current.add(taskId);
          }
          clearLastCompleted();

          console.log('[useAutoInsertToCanvas] Image inserted via two-phase factory');
        } catch (error) {
          console.error('[useAutoInsertToCanvas] Failed to insert image:', error);
        }
      };

      doInsert();
    }
  }, [board, lastCompletedTask, clearLastCompleted]);

  /**
   * 手动触发插入
   *
   * 【强制收敛】
   * - 远程 URL：fetch 下载 → Blob → 压缩 → assetId → 落盘
   * - Base64：解码 → Blob → 压缩 → assetId → 落盘
   * - 已有 assetId：直接使用（如果 URL 也提供，URL 会被忽略）
   *
   * @param imageUrl 图片 URL（支持 HTTP/HTTPS 和 data:image/...）
   * @param assetId 可选：已有 assetId（用于覆盖缓存）
   * @param metadata 可选：宽高信息
   */
  const insertImageToCanvas = useCallback(
    async (
      imageUrl: string,
      assetId?: string,
      metadata?: { width?: number; height?: number }
    ) => {
      if (!board) {
        console.warn('[useAutoInsertToCanvas] Board not available');
        return;
      }

      try {
        const centerX = board.viewport ? board.viewport.centerX : 300;
        const centerY = board.viewport ? board.viewport.centerY : 300;
        const width = metadata?.width || DEFAULT_IMAGE_WIDTH;
        const height = metadata?.height || DEFAULT_IMAGE_WIDTH;

        // 【强制收敛】所有来源统一走工厂管线
        // - 传入 assetId 时，工厂会复用已有缓存（如果 URL 也提供，URL 被忽略）
        // - 不再有 uri 字段
        await insertStandardImage(
          board,
          imageUrl,
          [centerX - width / 2, centerY - height / 2],
          { width, height }
        );

        console.log('[useAutoInsertToCanvas] Manual insert via factory complete');
      } catch (error) {
        console.error('[useAutoInsertToCanvas] Manual insert failed:', error);
      }
    },
    [board]
  );

  return {
    insertImageToCanvas,
  };
};
