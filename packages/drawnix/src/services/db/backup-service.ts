import { nanoid } from 'nanoid';
import { db, WorkspaceData, AssetData, CanvasSnapshot, CanvasDelta } from './app-database';
import { assetStorageService } from './asset-storage-service';
import { canvasService } from './canvas-service';

export interface ExportData {
  version: string;
  exportedAt: string;
  workspace: {
    id: string;
    name: string;
    elements: any[];
    createdAt: number;
    updatedAt: number;
    version: number;
  };
  snapshots?: CanvasSnapshot[];
  assets: Array<{
    id: string;
    type: string;
    mimeType: string;
    data: string; // base64
    width?: number;
    height?: number;
  }>;
}

/**
 * 备份导出服务
 * 支持导出/导入工作区数据
 */
class BackupService {
  /**
   * 导出工作区为 JSON 文件
   */
  async exportToJson(workspaceId: string): Promise<string> {
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const elements = await canvasService.getCanvas(workspaceId);

    const exportData: ExportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workspace: {
        id: workspace.id,
        name: workspace.name,
        elements,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        version: workspace.version || 1
      },
      assets: []
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导出工作区为带资产的 ZIP 文件（使用浏览器原生 API）
   * 由于没有 jszip，我们创建多文件导出
   */
  async exportWithAssets(workspaceId: string): Promise<{ json: string; assets: AssetData[] }> {
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const elements = await canvasService.getCanvas(workspaceId);

    // 收集使用的资产 ID
    const usedAssetIds = new Set<string>();
    const collectAssetIds = (items: any[]) => {
      for (const item of items) {
        if (item.parsedImage?.assetId) {
          usedAssetIds.add(item.parsedImage.assetId);
        }
        if (item.children) {
          collectAssetIds(item.children);
        }
      }
    };
    collectAssetIds(elements);

    // 获取资产数据
    const assets: ExportData['assets'] = [];
    for (const assetId of usedAssetIds) {
      const asset = await assetStorageService.getAsset(assetId);
      if (asset) {
        let data = '';
        if (asset.blob) {
          data = await this.blobToBase64(asset.blob);
        } else if (asset.dataUrl) {
          data = asset.dataUrl.split(',')[1]; // 移除 data:image/xxx;base64, 前缀
        }
        assets.push({
          id: asset.id,
          type: asset.type,
          mimeType: asset.mimeType,
          data,
          width: asset.width,
          height: asset.height
        });
      }
    }

    const exportData: ExportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workspace: {
        id: workspace.id,
        name: workspace.name,
        elements,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        version: workspace.version || 1
      },
      assets
    };

    return {
      json: JSON.stringify(exportData, null, 2),
      assets: Array.from(usedAssetIds).map(id => assetStorageService.getAsset(id)) as any
    };
  }

  /**
   * Blob 转 Base64
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 从 JSON 导入工作区
   */
  async importFromJson(jsonString: string): Promise<string> {
    let data: ExportData;

    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      throw new Error('Invalid JSON format');
    }

    if (!data.workspace) {
      throw new Error('Invalid export data: missing workspace');
    }

    // 生成新 ID 避免冲突
    const newWorkspaceId = nanoid();
    const now = Date.now();

    // 导入工作区
    await db.workspaces.add({
      id: newWorkspaceId,
      name: data.workspace.name + ' (Imported)',
      elements: data.workspace.elements,
      createdAt: now,
      updatedAt: now,
      version: 1
    });

    // 导入资产
    if (data.assets) {
      for (const asset of data.assets) {
        // 转换 base64 为 blob
        const blob = await this.base64ToBlob(asset.data, asset.mimeType);

        await assetStorageService.saveAsset({
          id: asset.id,
          type: asset.type as any,
          mimeType: asset.mimeType,
          blob,
          size: blob.size,
          width: asset.width,
          height: asset.height
        });
      }
    }

    return newWorkspaceId;
  }

  /**
   * Base64 转 Blob
   */
  private base64ToBlob(base64: string, mimeType: string): Promise<Blob> {
    // 处理 data URL
    if (base64.startsWith('data:')) {
      const response = fetch(base64);
      return response.then(r => r.blob());
    }

    // 纯 base64
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return Promise.resolve(new Blob([bytes], { type: mimeType }));
  }

  /**
   * 导出所有工作区列表
   */
  async exportAllWorkspaces(): Promise<WorkspaceData[]> {
    return await db.workspaces.orderBy('updatedAt').reverse().toArray();
  }

  /**
   * 删除未使用的资产
   */
  async cleanupOrphanAssets(): Promise<number> {
    // 获取所有资产
    const allAssets = await db.assets.toArray();
    const assetIds = new Set(allAssets.map(a => a.id));

    // 获取所有工作区的元素，检查引用的资产
    const workspaces = await db.workspaces.toArray();
    const usedAssetIds = new Set<string>();

    for (const ws of workspaces) {
      const elements = await canvasService.getCanvas(ws.id);
      const collectIds = (items: any[]) => {
        for (const item of items) {
          if (item.parsedImage?.assetId) {
            usedAssetIds.add(item.parsedImage.assetId);
          }
          if (item.children) {
            collectIds(item.children);
          }
        }
      };
      collectIds(elements);
    }

    // 删除未使用的
    const toDelete = allAssets.filter(a => !usedAssetIds.has(a.id));
    if (toDelete.length > 0) {
      await db.assets.bulkDelete(toDelete.map(a => a.id));
    }

    return toDelete.length;
  }
}

export const backupService = new BackupService();
