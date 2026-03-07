import { assetStorageService, AssetData } from './asset-storage-service';

interface ResourceRef {
  url: string;
  refCount: number;
  createdAt: number;
}

/**
 * 资源管理器
 * 统一管理 Blob URL 的创建和释放，防止内存泄漏
 */
class ResourceManager {
  private resources = new Map<string, ResourceRef>();
  private workspaceAssets = new Map<string, Set<string>>();

  /**
   * 获取资源的 URL（自动管理生命周期）
   * @param assetId 资产 ID
   * @param workspaceId 工作区 ID（用于追踪关联）
   */
  async getResourceUrl(assetId: string, workspaceId?: string): Promise<string | null> {
    // 检查是否已有缓存的 URL
    if (this.resources.has(assetId)) {
      const ref = this.resources.get(assetId)!;
      ref.refCount++;
      return ref.url;
    }

    // 从 IndexedDB 获取资产并创建 URL
    const asset = await assetStorageService.getAsset(assetId);
    if (!asset) return null;

    let url: string;
    if (asset.blob) {
      url = URL.createObjectURL(asset.blob);
    } else if (asset.dataUrl) {
      url = asset.dataUrl;
    } else {
      return null;
    }

    // 记录资源
    this.resources.set(assetId, {
      url,
      refCount: 1,
      createdAt: Date.now()
    });

    // 关联到工作区
    if (workspaceId) {
      if (!this.workspaceAssets.has(workspaceId)) {
        this.workspaceAssets.set(workspaceId, new Set());
      }
      this.workspaceAssets.get(workspaceId)!.add(assetId);
    }

    return url;
  }

  /**
   * 释放资源的引用
   * 当引用计数为 0 时，真正释放 URL
   */
  releaseResource(assetId: string): void {
    const ref = this.resources.get(assetId);
    if (!ref) return;

    ref.refCount--;

    if (ref.refCount <= 0) {
      // 释放 Object URL（dataUrl 不需要释放）
      if (ref.url.startsWith('blob:')) {
        URL.revokeObjectURL(ref.url);
      }
      this.resources.delete(assetId);
    }
  }

  /**
   * 释放工作区的所有资源（切换项目时调用）
   */
  releaseAllForWorkspace(workspaceId: string): void {
    const assetIds = this.workspaceAssets.get(workspaceId);
    if (!assetIds) return;

    for (const assetId of assetIds) {
      this.releaseResource(assetId);
    }

    this.workspaceAssets.delete(workspaceId);
  }

  /**
   * 获取资源的引用计数（用于调试）
   */
  getRefCount(assetId: string): number {
    return this.resources.get(assetId)?.refCount || 0;
  }

  /**
   * 获取资源 URL（同步版本，仅适用于 dataUrl）
   */
  getResourceUrlSync(assetId: string, asset: AssetData): string | null {
    // 检查缓存
    if (this.resources.has(assetId)) {
      const ref = this.resources.get(assetId)!;
      ref.refCount++;
      return ref.url;
    }

    let url: string;
    if (asset.blob) {
      url = URL.createObjectURL(asset.blob);
    } else if (asset.dataUrl) {
      url = asset.dataUrl;
    } else {
      return null;
    }

    this.resources.set(assetId, {
      url,
      refCount: 1,
      createdAt: Date.now()
    });

    return url;
  }

  /**
   * 清理所有资源（页面卸载时调用）
   */
  releaseAll(): void {
    for (const [assetId, ref] of this.resources) {
      if (ref.url.startsWith('blob:')) {
        URL.revokeObjectURL(ref.url);
      }
    }
    this.resources.clear();
    this.workspaceAssets.clear();
  }

  /**
   * 获取当前管理的资源数量（用于调试）
   */
  getStats() {
    return {
      resourceCount: this.resources.size,
      workspaceCount: this.workspaceAssets.size,
      resources: Array.from(this.resources.entries()).map(([id, ref]) => ({
        id,
        refCount: ref.refCount,
        age: Date.now() - ref.createdAt
      }))
    };
  }
}

export const resourceManager = new ResourceManager();
