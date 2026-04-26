import { nanoid } from 'nanoid';
import { db, WorkspaceData, CanvasSnapshot, CanvasDelta } from './app-database';
import { PlaitTheme, Viewport } from '@plait/core';
import { migrateLegacyCanvas } from '../legacy-migration';
import { sanitizeElementsOnSave, sanitizeElementsOnLoad } from '../../utils/image-sanitizer';

/**
 * 完整画布数据
 */
export interface FullCanvasData {
  elements: any[];
  theme?: PlaitTheme;
  viewport?: Viewport;
  thumbnail?: string;
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
   *
   * 【重要】在保存前会清理所有图片元素中的 blob URL
   * 确保只有 assetId 被持久化，blob URL 不会存入数据库
   */
  async saveFull(workspaceId: string, elements: any[], theme?: PlaitTheme, viewport?: Viewport, thumbnail?: string): Promise<void> {
    // 【关键】清理 blob URL，确保不存入持久化存储
    const sanitizedElements = sanitizeElementsOnSave(elements);

    console.log('[CanvasService] saveFull called:', {
      workspaceId,
      elementsCount: sanitizedElements.length,
      elementOrder: sanitizedElements.map((e: any) => `${e.id?.slice(0,8)}:${e.type}`),
    });

    const workspace = await db.workspaces.get(workspaceId);
    const now = Date.now();

    if (workspace) {
      await db.workspaces.update(workspaceId, {
        elements: sanitizedElements,
        theme,
        viewport,
        thumbnail,
        updatedAt: now,
        version: (workspace.version || 0) + 1
      });
    } else {
      await db.workspaces.add({
        id: workspaceId,
        name: 'Untitled',
        elements: sanitizedElements,
        theme,
        viewport,
        thumbnail,
        createdAt: now,
        updatedAt: now,
        version: 1
      });
    }

    // 创建快照（直接使用已清理的 elements，避免从数据库重新读取导致的事务同步问题）
    await this.createSnapshot(workspaceId, sanitizedElements);

    // 【新增】清除快照之后的增量记录（它们已被快照覆盖，无需保留）
    const sortedSnapshots = await db.canvasSnapshots
      .where('workspaceId')
      .equals(workspaceId)
      .reverse()
      .sortBy('createdAt');
    const snapshot = sortedSnapshots[0];

    console.log('[CanvasService] saveFull snapshot:', {
      snapshotId: snapshot?.id,
      snapshotCreatedAt: snapshot?.createdAt,
      elementsCount: snapshot?.elements?.length,
      elementOrder: snapshot?.elements?.map((e: any) => `${e.id?.slice(0,8)}:${e.type}`),
    });

    if (snapshot) {
      const deleted = await db.canvasDeltas
        .where('workspaceId')
        .equals(workspaceId)
        .and(d => d.timestamp >= snapshot.createdAt)
        .delete();
      console.log('[CanvasService] Deleted deltas after snapshot:', deleted);
    }

    this.deltaCountSinceSnapshot = 0;
  }

  /**
   * 保存增量变更
   *
   * 【重要】在保存增量前会清理所有图片元素中的 blob URL
   */
  async saveDelta(workspaceId: string, delta: Omit<CanvasDelta, 'id' | 'workspaceId' | 'timestamp'>): Promise<void> {
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) {
      // 工作区不存在，创建新的（会自动清理 blob URL）
      await this.saveFull(workspaceId, delta.added);
      return;
    }

    // 【关键】清理增量中的 blob URL
    const sanitizedDelta = {
      ...delta,
      added: sanitizeElementsOnSave(delta.added || []),
      modified: sanitizeElementsOnSave(delta.modified || []),
      // removed 不需要清理（已被删除的元素）
    };

    const now = Date.now();
    const newDelta: CanvasDelta = {
      id: nanoid(),
      workspaceId,
      baseVersion: workspace.version || 0,
      added: sanitizedDelta.added,
      removed: sanitizedDelta.removed,
      modified: sanitizedDelta.modified,
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
  async createSnapshot(workspaceId: string, snapshotElements?: any[]): Promise<string> {
    // 如果没有传入 snapshotElements，则从数据库重建
    const elements = snapshotElements !== undefined 
      ? snapshotElements 
      : await this.rebuildCanvas(workspaceId);
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
   *
   * 【重要】返回前会清理所有图片元素中的 blob URL
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
      // 【关键】清理直接返回的数据中的 blob URL
      return sanitizeElementsOnLoad(workspace.elements || []);
    }

    // 从最新快照开始重建
    return this.rebuildCanvas(workspaceId);
  }

  /**
   * 获取完整画布数据（包括 elements、theme 和 viewport）
   *
   * 【重要】加载后会自动清理脏数据中的 blob URL
   * 确保兼容之前存入的错误数据
   */
  async getFullCanvas(workspaceId: string): Promise<FullCanvasData> {
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) {
      return { elements: [] };
    }

    let elements = await this.getCanvas(workspaceId);

    // 迁移旧 Base64 数据到 IndexedDB
    elements = await migrateLegacyCanvas(elements);

    // 【关键】清理加载数据中的 blob URL（兼容脏数据）
    elements = sanitizeElementsOnLoad(elements);

    console.log('[CanvasService] getFullCanvas loaded:', {
      workspaceId,
      elementsCount: elements.length,
      elementOrder: elements.map((e: any) => `${e.id?.slice(0,8)}:${e.type}`),
    });

    return {
      elements,
      theme: workspace.theme,
      viewport: workspace.viewport,
      thumbnail: workspace.thumbnail
    };
  }

  /**
   * 保存 theme 和 viewport（独立于 elements 的变更）
   */
  async saveThemeAndViewport(workspaceId: string, theme?: PlaitTheme, viewport?: Viewport, thumbnail?: string): Promise<void> {
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) return;

    const now = Date.now();

    const updateFields: any = { updatedAt: now, version: (workspace.version || 0) + 1 };
    if (theme !== undefined) updateFields.theme = theme;
    if (viewport !== undefined) updateFields.viewport = viewport;
    if (thumbnail !== undefined) updateFields.thumbnail = thumbnail;

    await db.workspaces.update(workspaceId, updateFields);
  }

  /**
   * 从快照和增量重建画布
   *
   * 【重要】重建后会自动清理所有图片元素中的 blob URL
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
    const merged = this.mergeDeltas(baseElements, deltas);

    // 【关键】清理合并结果中的 blob URL
    return sanitizeElementsOnLoad(merged);
  }

  /**
   * 合并增量到基础元素
   *
   * 【重要】合并过程中会自动清理增量中的 blob URL
   */
  private mergeDeltas(baseElements: any[], deltas: CanvasDelta[]): any[] {
    let result = [...baseElements];

    for (const delta of deltas) {
      // 删除
      const removedIds = new Set(delta.removed.map((r: any) => r.id));
      result = result.filter(e => !removedIds.has(e.id));

      // 添加（增量中的 blob URL 已在 saveDelta 时被清理）
      result = [...result, ...delta.added];

      // 修改（增量中的 blob URL 已在 saveDelta 时被清理）
      // 检测是否是纯顺序变化：没有增删，只有顺序调整
      const isOrderOnlyChange = delta.added.length === 0 &&
                                delta.removed.length === 0 &&
                                delta.modified.length > 0 &&
                                result.length === delta.modified.length &&
                                result.every((e, i) => e.id === delta.modified[i].id);

      if (isOrderOnlyChange) {
        // 顺序变化：直接使用 modified 的顺序（包含最新内容）
        result = [...delta.modified];
      } else {
        for (const mod of delta.modified) {
          const idx = result.findIndex(e => e.id === mod.id);
          if (idx >= 0) result[idx] = mod;
        }
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

    // 检测顺序变化
    // 如果 added/removed/modified 都为空，但 oldElements 和 newElements 长度相同
    // 且每个元素 ID 都存在，只是顺序不同，说明发生了图层顺序调整
    // 此时需要将所有元素标记为 modified，确保顺序变更被持久化
    if (added.length === 0 && removed.length === 0 && modified.length === 0 && oldElements.length === newElements.length) {
      const oldOrder = oldElements.map(e => e.id);
      const newOrder = newElements.map(e => e.id);
      const orderChanged = oldOrder.some((id, idx) => id !== newOrder[idx]);
      if (orderChanged) {
        return {
          added: [],
          removed: [],
          modified: newElements
        };
      }
    }

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
