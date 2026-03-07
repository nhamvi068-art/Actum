import { useEffect, useCallback } from 'react';
import { PlaitBoard, Transforms } from '@plait/core';
import { useWorkflowStatusSync } from './useWorkflowStatusSync';
import { unifiedCacheService } from '../services/unified-cache-service';

/**
 * 自动插入到画布的 Hook
 * 监听任务完成事件，自动将生成的图片插入到画布中
 */
export const useAutoInsertToCanvas = (board: PlaitBoard | null) => {
  const { lastCompletedTask, clearLastCompleted } = useWorkflowStatusSync();

  useEffect(() => {
    if (!board || !lastCompletedTask) return;

    // 检查是否是图片生成任务
    if (lastCompletedTask.status === 'completed' && 
        lastCompletedTask.result &&
        (lastCompletedTask.result.type === 'image' || lastCompletedTask.type === 'image_generation')) {
      
      const insertImage = async () => {
        try {
          const { assetId, remoteUrl, metadata } = lastCompletedTask.result!;
          
          let finalAssetId = assetId;
          let imageUrl: string | null = null;

          // 如果有远程 URL，先缓存到本地
          if (remoteUrl && !assetId) {
            finalAssetId = await unifiedCacheService.cacheRemoteUrl(remoteUrl);
          }

          // 获取本地 Blob URL
          if (finalAssetId) {
            imageUrl = await unifiedCacheService.getCachedUrl(finalAssetId);
          } else if (remoteUrl) {
            // 降级：直接使用远程 URL
            imageUrl = remoteUrl;
          }

          if (!imageUrl) {
            console.error('[useAutoInsertToCanvas] No valid image URL');
            return;
          }

          // 获取视口中心位置
          const centerX = board.viewport ? board.viewport.centerX : 300;
          const centerY = board.viewport ? board.viewport.centerY : 300;

          // 计算元素尺寸
          const width = metadata?.width || 300;
          const height = metadata?.height || 300;

          // 创建图片元素
          const imageElement = {
            type: 'image' as const,
            id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            width,
            height,
            hasMask: false,
            uri: imageUrl,
            assetId: finalAssetId,
            x: centerX - width / 2,
            y: centerY - height / 2,
            children: []
          };

          // 插入到画布
          Transforms.insertNode(board, imageElement as any, { at: [board.children.length] });

          // 清除完成状态，避免重复插入
          clearLastCompleted();

          console.log('[useAutoInsertToCanvas] Image inserted successfully');
        } catch (error) {
          console.error('[useAutoInsertToCanvas] Failed to insert image:', error);
        }
      };

      insertImage();
    }
  }, [board, lastCompletedTask, clearLastCompleted]);

  // 提供手动触发插入的方法
  const insertImageToCanvas = useCallback(async (
    imageUrl: string,
    assetId?: string,
    metadata?: { width?: number; height?: number }
  ) => {
    if (!board) {
      console.warn('[useAutoInsertToCanvas] Board not available');
      return;
    }

    try {
      let finalAssetId = assetId;
      let localUrl = imageUrl;

      // 如果是远程 URL，先缓存
      if (imageUrl.startsWith('http')) {
        finalAssetId = await unifiedCacheService.cacheRemoteUrl(imageUrl, assetId);
        localUrl = await unifiedCacheService.getCachedUrl(finalAssetId) || imageUrl;
      }

      const centerX = board.viewport ? board.viewport.centerX : 300;
      const centerY = board.viewport ? board.viewport.centerY : 300;
      const width = metadata?.width || 300;
      const height = metadata?.height || 300;

      const imageElement = {
        type: 'image' as const,
        id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        width,
        height,
        hasMask: false,
        uri: localUrl,
        assetId: finalAssetId,
        x: centerX - width / 2,
        y: centerY - height / 2,
        children: []
      };

      Transforms.insertNode(board, imageElement as any);
    } catch (error) {
      console.error('[useAutoInsertToCanvas] Manual insert failed:', error);
    }
  }, [board]);

  return {
    insertImageToCanvas
  };
};
