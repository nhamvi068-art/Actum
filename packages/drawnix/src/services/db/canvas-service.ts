import { nanoid } from 'nanoid';
import { db, WorkspaceData, CanvasSnapshot, CanvasDelta } from './app-database';
import { PlaitTheme, Viewport } from '@plait/core';

/**
 * 完整画布数据
 */
export interface FullCanvasData {
  elements: any[];
  theme?: PlaitTheme;
  viewport?: Viewport;
}

/**
 * 画布增量存储服务
 * 支持增量保存、快照折叠、版本管理
 */

// 快照折叠配置
const SQUASH_DELTA_COUNT = 50;
const SQUASH_INTERVAL_MS = 5 * 60 * 1000;

export class CanvasService {
  private deltaCountSinceSnapshot = 0;
  private lastSquashTime = 0;
  private squashScheduled = false;

  /**
   * 保存完整的画布数据（全量保存，兼容旧数据）
   */
  async saveFull(workspaceId: string, elements: any[], theme?: PlaitTheme, viewport?: Viewport): Promise<void> {
    const workspace = await db.workspaces.get(workspaceId);
    const now = Date.now();

    if (workspace) {
      await db.workspaces.update(workspaceId, {
        elements,
        theme,
        viewport,
        updatedAt: now,
        version: (workspace.version || 0) + 1
      });
    } else {
      await db.workspaces.add({
        id: workspaceId,
        name: 'Untitled',
        elements,
        theme,
        viewport,
        createdAt: now,
        updatedAt: now,
        version: 1
      });
    }

    // 创建快照
    await this.createSnapshot(workspaceId);
    this.deltaCountSinceSnapshot = 0;
  }

  /**
   * 保存增量变更
   */
  async saveDelta(workspaceId: string, delta: Omit<CanvasDelta, 'id' | 'workspaceId' | 'timestamp'>): Promise<void> {
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) {
      // 工作区不存在，创建新的
      await this.saveFull(workspaceId, delta.added);
      return;
    }

    const now = Date.now();
    const newDelta: CanvasDelta = {
      id: nanoid(),
      workspaceId,
      baseVersion: workspace.version || 0,
      added: delta.added || [],
      removed: delta.removed || [],
      modified: delta.modified || [],
      timestamp: now
    };

    // 保存增量
    await db.canvasDeltas.add(newDelta);

    // 更新工作区版本
    await db.workspaces.update(workspaceId, {
      updatedAt: now,
      version: (workspace.version || 0) + 1
    });

    // 检查是否需要快照折叠
    this.deltaCountSinceSnapshot++;
    await this.checkSquash(workspaceId);
  }

  /**
   * 检查并触发快照折叠
   */
  private async checkSquash(workspaceId: string): Promise<void> {
    const now = Date.now();

    // 检查数量阈值
    if (this.deltaCountSinceSnapshot >= SQUASH_DELTA_COUNT && !this.squashScheduled) {
      this.scheduleSquash(workspaceId);
    }

    // 检查时间阈值
    if (now - this.lastSquashTime >= SQUASH_INTERVAL_MS && !this.squashScheduled) {
      this.scheduleSquash(workspaceId);
    }
  }

  /**
   * 调度快照折叠（在浏览器空闲时执行）
   */
  private scheduleSquash(workspaceId: string): void {
    if (this.squashScheduled) return;
    this.squashScheduled = true;

    const doSquash = () => {
      this.squashToSnapshot(workspaceId).then(() => {
        this.squashScheduled = false;
      });
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => doSquash(), { timeout: 10000 });
    } else {
      setTimeout(() => doSquash(), 2000);
    }
  }

  /**
   * 快照折叠：将所有 Delta 合并为一个新的全量快照
   */
  private async squashToSnapshot(workspaceId: string): Promise<void> {
    const elements = await this.getCanvas(workspaceId);
    await this.createSnapshot(workspaceId);

    // 删除旧 Delta（保留最近 5 个）
    const oldDeltas = await db.canvasDeltas
      .where('workspaceId')
      .equals(workspaceId)
      .reverse()
      .sortBy('timestamp');

    if (oldDeltas.length > 5) {
      const toDelete = oldDeltas.slice(5).map(d => d.id);
      await db.canvasDeltas.bulkDelete(toDelete);
    }

    this.deltaCountSinceSnapshot = 0;
    this.lastSquashTime = Date.now();
    console.log(`[CanvasService] Snapshot squashed for workspace ${workspaceId}`);
  }

  /**
   * 创建快照
   */
  async createSnapshot(workspaceId: string): Promise<string> {
    const elements = await this.rebuildCanvas(workspaceId);
    const workspace = await db.workspaces.get(workspaceId);
    const now = Date.now();

    const snapshot: CanvasSnapshot = {
      id: nanoid(),
      workspaceId,
      elements,
      version: workspace?.version || 1,
      createdAt: now
    };

    await db.canvasSnapshots.add(snapshot);

    // 限制快照数量（保留最近 20 个）
    await this.pruneSnapshots(workspaceId, 20);

    return snapshot.id;
  }

  /**
   * 限制快照数量
   */
  private async pruneSnapshots(workspaceId: string, maxSnapshots: number): Promise<void> {
    const snapshots = await db.canvasSnapshots
      .where('workspaceId')
      .equals(workspaceId)
      .reverse()
      .sortBy('createdAt');

    if (snapshots.length > maxSnapshots) {
      const toDelete = snapshots.slice(maxSnapshots).map(s => s.id);
      await db.canvasSnapshots.bulkDelete(toDelete);
    }
  }

  /**
   * 获取完整画布数据（合并快照和增量）
   */
  async getCanvas(workspaceId: string): Promise<any[]> {
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) return [];

    // 获取所有增量
    const deltas = await db.canvasDeltas
      .where('workspaceId')
      .equals(workspaceId)
      .sortBy('timestamp');

    if (deltas.length === 0) {
      return workspace.elements || [];
    }

    // 从最新快照开始重建
    return this.rebuildCanvas(workspaceId);
  }

  /**
   * 获取完整画布数据（包括 elements、theme 和 viewport）
   */
  async getFullCanvas(workspaceId: string): Promise<FullCanvasData> {
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) {
      return { elements: [] };
    }

    const elements = await this.getCanvas(workspaceId);

    return {
      elements,
      theme: workspace.theme,
      viewport: workspace.viewport
    };
  }

  /**
   * 保存 theme 和 viewport（独立于 elements 的变更）
   */
  async saveThemeAndViewport(workspaceId: string, theme?: PlaitTheme, viewport?: Viewport): Promise<void> {
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) return;

    const now = Date.now();

    await db.workspaces.update(workspaceId, {
      theme,
      viewport,
      updatedAt: now,
      version: (workspace.version || 0) + 1
    });
  }

  /**
   * 从快照和增量重建画布
   */
  private async rebuildCanvas(workspaceId: string): Promise<any[]> {
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) return [];

    // 获取最新快照
    const latestSnapshot = await db.canvasSnapshots
      .where('workspaceId')
      .equals(workspaceId)
      .reverse()
      .sortBy('createdAt');

    const snapshot = latestSnapshot[0];
    let baseElements = snapshot?.elements || workspace.elements || [];

    // 获取快照之后的增量
    const snapshotTime = snapshot?.createdAt || 0;
    const deltas = await db.canvasDeltas
      .where('workspaceId')
      .equals(workspaceId)
      .and(d => d.timestamp > snapshotTime)
      .sortBy('timestamp');

    // 合并增量
    return this.mergeDeltas(baseElements, deltas);
  }

  /**
   * 合并增量到基础元素
   */
  private mergeDeltas(baseElements: any[], deltas: CanvasDelta[]): any[] {
    let result = [...baseElements];

    for (const delta of deltas) {
      // 删除
      const removedIds = new Set(delta.removed.map((r: any) => r.id));
      result = result.filter(e => !removedIds.has(e.id));

      // 添加
      result = [...result, ...delta.added];

      // 修改
      for (const mod of delta.modified) {
        const idx = result.findIndex(e => e.id === mod.id);
        if (idx >= 0) result[idx] = mod;
      }
    }

    return result;
  }

  /**
   * 计算两个画布状态的增量
   */
  computeDelta(oldElements: any[], newElements: any[]): Omit<CanvasDelta, 'id' | 'workspaceId' | 'timestamp'> {
    const oldIds = new Map(oldElements.map(e => [e.id, e]));

    // 新增
    const added = newElements.filter(e => !oldIds.has(e.id));

    // 删除
    const newIds = new Set(newElements.map(e => e.id));
    const removed = oldElements.filter(e => !newIds.has(e.id));

    // 修改
    const modified = newElements.filter(e => {
      const old = oldIds.get(e.id);
      if (!old) return false;
      return JSON.stringify(old) !== JSON.stringify(e);
    });

    return { added, removed, modified };
  }

  /**
   * 获取工作区
   */
  async getWorkspace(workspaceId: string): Promise<WorkspaceData | undefined> {
    return await db.workspaces.get(workspaceId);
  }

  /**
   * 获取所有工作区
   */
  async getAllWorkspaces(): Promise<WorkspaceData[]> {
    return await db.workspaces.orderBy('updatedAt').reverse().toArray();
  }

  /**
   * 删除工作区及其相关数据
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    await db.transaction('rw', [db.workspaces, db.canvasSnapshots, db.canvasDeltas], async () => {
      await db.workspaces.delete(workspaceId);
      await db.canvasSnapshots.where('workspaceId').equals(workspaceId).delete();
      await db.canvasDeltas.where('workspaceId').equals(workspaceId).delete();
    });
  }

  /**
   * 获取快照历史
   */
  async getSnapshots(workspaceId: string): Promise<CanvasSnapshot[]> {
    return await db.canvasSnapshots
      .where('workspaceId')
      .equals(workspaceId)
      .reverse()
      .sortBy('createdAt');
  }

  /**
   * 恢复到指定快照
   */
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await db.canvasSnapshots.get(snapshotId);
    if (!snapshot) return;

    await db.workspaces.update(snapshot.workspaceId, {
      elements: snapshot.elements,
      version: snapshot.version,
      updatedAt: Date.now()
    });

    // 删除该快照之后的所有增量
    await db.canvasDeltas
      .where('workspaceId')
      .equals(snapshot.workspaceId)
      .and(d => d.timestamp > snapshot.createdAt)
      .delete();
  }
}

export const canvasService = new CanvasService();
