import { assetStorageService } from './db/asset-storage-service';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `as_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 统一缓存服务
 * 负责将远程 URL 的资源抓取并存储到本地 IndexedDB
 */
export class UnifiedCacheService {
  /**
   * 将远程图片 URL 永久缓存到本地 IndexedDB
   * @param remoteUrl 远程图片 URL
   * @param assetId 可选的资产 ID
   * @returns 本地资产 ID
   */
  async cacheRemoteUrl(remoteUrl: string, assetId?: string): Promise<string> {
    try {
      const response = await fetch(remoteUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const finalAssetId = assetId || generateId();

      await assetStorageService.saveAsset({
        id: finalAssetId,
        type: 'image',
        mimeType: blob.type,
        blob: blob,
        size: blob.size,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      return finalAssetId;
    } catch (error) {
      console.error('[UnifiedCache] Failed to cache remote asset:', error);
      throw error;
    }
  }

  /**
   * 将 Base64 数据转换为资产并存储
   * @param base64Data Base64 编码的图片数据
   * @param mimeType MIME 类型
   * @param assetId 可选的资产 ID
   * @returns 本地资产 ID
   */
  async cacheBase64(base64Data: string, mimeType: string = 'image/png', assetId?: string): Promise<string> {
    try {
      // 移除 data:image/png;base64, 前缀
      const base64Content = base64Data.split(',')[1] || base64Data;
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mimeType });
      const finalAssetId = assetId || generateId();

      await assetStorageService.saveAsset({
        id: finalAssetId,
        type: 'image',
        mimeType: mimeType,
        blob: blob,
        size: blob.size,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      return finalAssetId;
    } catch (error) {
      console.error('[UnifiedCache] Failed to cache base64:', error);
      throw error;
    }
  }

  /**
   * 从缓存获取资产 URL
   * @param assetId 资产 ID
   * @returns Blob URL 或 null
   */
  async getCachedUrl(assetId: string): Promise<string | null> {
    return await assetStorageService.getAssetUrl(assetId);
  }

  /**
   * 检查资产是否已缓存
   * @param assetId 资产 ID
   * @returns 是否已缓存
   */
  async isCached(assetId: string): Promise<boolean> {
    const asset = await assetStorageService.getAsset(assetId);
    return !!asset;
  }
}

export const unifiedCacheService = new UnifiedCacheService();
