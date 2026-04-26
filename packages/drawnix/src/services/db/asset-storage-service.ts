import { db, AssetData } from './app-database';
import { nanoid } from 'nanoid';
import { compressImageBeforeUpload } from '../../utils/image-compressor';

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
      originalBlob: asset.originalBlob,
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

  /**
   * 从 File 创建资产（自动生成 ID）
   * 注意：此方法会自动压缩超过 1MB 或最大边长超过 2048px 的图片
   */
  async createAssetFromFile(file: File, type: AssetData['type'] = 'image'): Promise<string> {
    const assetId = nanoid();

    // 【关键修改】压缩图片（尺寸限制 2048px，质量 80%，格式 WebP）
    const compressedBlob = await compressImageBeforeUpload(file);

    return this.saveAsset({
      id: assetId,
      type,
      mimeType: 'image/webp', // 统一使用 WebP
      blob: compressedBlob,
      size: compressedBlob.size,
      width: undefined,
      height: undefined,
    });
  }

  /**
   * 从 Blob 创建资产（需要提供 MIME 类型）
   */
  async createAssetFromBlob(blob: Blob, mimeType: string, type: AssetData['type'] = 'image'): Promise<string> {
    const assetId = nanoid();

    return this.saveAsset({
      id: assetId,
      type,
      mimeType,
      blob,
      size: blob.size,
      width: undefined,
      height: undefined,
    });
  }

  /**
   * 压缩并存储图片
   * 适用于已经有 Blob 的情况（如剪贴板粘贴、外部 URL 下载等）
   *
   * @param fileOrBlob - 图片 File 或 Blob
   * @param type - 资产类型
   * @returns 资产 ID
   */
  async compressAndStore(fileOrBlob: Blob | File, type: AssetData['type'] = 'image'): Promise<string> {
    const assetId = nanoid();

    // 压缩图片（尺寸限制 2048px，质量 80%，格式 WebP）
    const compressedBlob = await compressImageBeforeUpload(fileOrBlob);

    return this.saveAsset({
      id: assetId,
      type,
      mimeType: compressedBlob.type || 'image/webp',
      blob: compressedBlob,
      size: compressedBlob.size,
      width: undefined,
      height: undefined,
    });
  }

  /**
   * 检查资产是否存在
   */
  async hasAsset(id: string): Promise<boolean> {
    const asset = await db.assets.get(id);
    return !!asset;
  }

  /**
   * 更新资产元数据（尺寸等）
   */
  async updateAssetMetadata(id: string, metadata: { width?: number; height?: number }): Promise<void> {
    await db.assets.update(id, metadata);
  }
}

export const assetStorageService = new AssetStorageService();
