import { nanoid } from 'nanoid';
import { db, AssetData } from './app-database';
import { assetStorageService } from './asset-storage-service';

export interface CachedAsset {
  assetId: string;
  localUrl: string;
}

/**
 * 任务资产管理器
 * 当任务完成时自动将生成的图片缓存到本地 IndexedDB
 */
class TaskAssetManager {
  /**
   * 缓存任务生成的图片
   * @param imageUrl 图片 URL 或 base64
   * @param workspaceId 工作区 ID
   * @param metadata 可选的元数据（尺寸等）
   * @returns 缓存后的本地 assetId
   */
  async cacheTaskImage(
    imageUrl: string,
    workspaceId?: string,
    metadata?: { width?: number; height?: number; aspectRatio?: string }
  ): Promise<string | null> {
    try {
      const assetId = nanoid();
      let blob: Blob;
      let mimeType = 'image/png';

      // 处理不同类型的图片数据
      if (imageUrl.startsWith('data:')) {
        // Base64 数据
        const base64Data = imageUrl.split(',')[1];
        mimeType = this.extractMimeType(imageUrl) || 'image/png';
        blob = this.base64ToBlob(base64Data, mimeType);
      } else if (imageUrl.startsWith('http')) {
        // 远程 URL，需要下载
        const response = await fetch(imageUrl);
        if (!response.ok) {
          console.warn('[TaskAssetManager] Failed to fetch image:', response.status);
          return null;
        }
        blob = await response.blob();
        mimeType = blob.type || mimeType;
      } else {
        console.warn('[TaskAssetManager] Unknown image format');
        return null;
      }

      // 保存到 IndexedDB
      await assetStorageService.saveAsset({
        id: assetId,
        type: 'image',
        mimeType,
        blob,
        size: blob.size,
        width: metadata?.width,
        height: metadata?.height,
        workspaceId
      });

      console.log('[TaskAssetManager] Cached image:', assetId);
      return assetId;
    } catch (error) {
      console.error('[TaskAssetManager] Failed to cache image:', error);
      return null;
    }
  }

  /**
   * 缓存多个任务图片
   */
  async cacheTaskImages(
    images: Array<{ url: string; metadata?: { width?: number; height?: number } }>,
    workspaceId?: string
  ): Promise<string[]> {
    const assetIds: string[] = [];

    for (const image of images) {
      const assetId = await this.cacheTaskImage(image.url, workspaceId, image.metadata);
      if (assetId) {
        assetIds.push(assetId);
      }
    }

    return assetIds;
  }

  /**
   * 获取本地缓存的图片 URL
   * @param assetId 资产 ID
   * @returns 本地 Blob URL 或 null
   */
  async getCachedImageUrl(assetId: string): Promise<string | null> {
    return await assetStorageService.getAssetUrl(assetId);
  }

  /**
   * 删除缓存的图片
   */
  async deleteCachedImage(assetId: string): Promise<void> {
    await assetStorageService.deleteAsset(assetId);
  }

  /**
   * 从 base64 转换为 Blob
   */
  private base64ToBlob(base64: string, mimeType: string): Blob {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  /**
   * 从 data URL 提取 mime type
   */
  private extractMimeType(dataUrl: string): string | null {
    const match = dataUrl.match(/data:([^;]+);/);
    return match ? match[1] : null;
  }

  /**
   * 获取工作区的所有缓存图片
   */
  async getWorkspaceAssets(workspaceId: string): Promise<AssetData[]> {
    return await db.assets
      .where('workspaceId')
      .equals(workspaceId)
      .toArray();
  }

  /**
   * 清理工作区的未使用资产
   */
  async cleanupUnusedAssets(workspaceId: string, usedAssetIds: Set<string>): Promise<number> {
    const assets = await this.getWorkspaceAssets(workspaceId);
    const toDelete = assets.filter(a => !usedAssetIds.has(a.id));

    if (toDelete.length > 0) {
      await assetStorageService.deleteAssets(toDelete.map(a => a.id));
    }

    return toDelete.length;
  }
}

export const taskAssetManager = new TaskAssetManager();
