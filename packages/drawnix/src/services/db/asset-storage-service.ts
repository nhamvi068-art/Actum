import { db, AssetData } from './app-database';

/**
 * 资产存储服务
 * 负责在 IndexedDB 中存储和管理图片、视频等二进制资产
 */
export class AssetStorageService {
  /**
   * 保存资产到 IndexedDB
   */
  async saveAsset(asset: Partial<AssetData> & Pick<AssetData, 'id' | 'type' | 'mimeType'>): Promise<string> {
    const now = Date.now();
    const assetData: AssetData = {
      id: asset.id,
      type: asset.type,
      mimeType: asset.mimeType,
      blob: asset.blob,
      dataUrl: asset.dataUrl,
      size: asset.size || 0,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt || now,
      updatedAt: now
    };

    await db.assets.put(assetData);
    return assetData.id;
  }

  /**
   * 根据 ID 获取资产
   */
  async getAsset(id: string): Promise<AssetData | undefined> {
    return await db.assets.get(id);
  }

  /**
   * 获取资产的 Blob URL
   * 如果存储的是 dataUrl，转换为 Blob URL
   */
  async getAssetUrl(id: string): Promise<string | null> {
    const asset = await this.getAsset(id);
    if (!asset) return null;

    if (asset.blob) {
      return URL.createObjectURL(asset.blob);
    }

    if (asset.dataUrl) {
      return asset.dataUrl;
    }

    return null;
  }

  /**
   * 根据类型获取所有资产
   */
  async getAssetsByType(type: AssetData['type']): Promise<AssetData[]> {
    return await db.assets.where('type').equals(type).toArray();
  }

  /**
   * 获取工作区关联的所有资产
   */
  async getAssetsByWorkspace(workspaceId: string): Promise<AssetData[]> {
    // 这里简化处理，实际可能需要 workspaceId 索引
    return await db.assets.toArray();
  }

  /**
   * 删除资产
   */
  async deleteAsset(id: string): Promise<void> {
    await db.assets.delete(id);
  }

  /**
   * 批量删除资产
   */
  async deleteAssets(ids: string[]): Promise<void> {
    await db.assets.bulkDelete(ids);
  }

  /**
   * 获取存储使用情况
   */
  async getStorageUsage(): Promise<{ count: number; size: number }> {
    const assets = await db.assets.toArray();
    return {
      count: assets.length,
      size: assets.reduce((total: number, asset: AssetData) => total + (asset.size || 0), 0)
    };
  }

  /**
   * 清理过期资产（可选：基于时间或大小限制）
   */
  async cleanOldAssets(daysOld: number = 30): Promise<number> {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const oldAssets = await db.assets
      .where('createdAt')
      .below(cutoffTime)
      .toArray();

    const ids = oldAssets.map((a: AssetData) => a.id);
    if (ids.length > 0) {
      await db.assets.bulkDelete(ids);
    }

    return ids.length;
  }
}

export const assetStorageService = new AssetStorageService();
