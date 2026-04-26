/**
 * useThumbnailEvents - 缩略图更新事件 Hook
 *
 * 订阅 ThumbnailEventBus，监听后台截图服务完成的缩略图更新事件。
 *
 * 使用场景：
 * - 在首页 ProjectCard 列表中使用
 * - 当 BackgroundSnapshotService 完成截图并写入 IndexedDB 后，
 *   此 Hook 会收到通知，允许组件静默刷新缩略图
 *
 * @example
 * ```tsx
 * function ProjectList({ projects }) {
 *   const { latestUpdate, hasPendingUpdate } = useThumbnailEvents();
 *
 *   // 当收到缩略图更新时，静默刷新
 *   useEffect(() => {
 *     if (latestUpdate) {
 *       setProjects(prev => prev.map(p =>
 *         p.id === latestUpdate.projectId
 *           ? { ...p, thumbnail: latestUpdate.thumbnail }
 *           : p
 *       ));
 *     }
 *   }, [latestUpdate]);
 *
 *   return projects.map(p => (
 *     <ProjectCard
 *       key={p.id}
 *       project={p}
 *       pendingThumbnail={hasPendingUpdate(p.id) ? latestUpdate?.thumbnail : undefined}
 *     />
 *   ));
 * }
 * ```
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { ThumbnailEventBus, type ThumbnailUpdateEvent } from '../services/thumbnail-event-bus';

export interface UseThumbnailEventsOptions {
  /** 启用跨标签页通信（通过 postMessage） */
  enableCrossTab?: boolean;
  /** 是否自动启动/停止事件监听 */
  autoListen?: boolean;
}

export interface UseThumbnailEventsResult {
  /** 最近更新的缩略图事件 */
  latestUpdate: ThumbnailUpdateEvent | null;
  /** 检查是否有指定项目的待处理更新（返回后清除记录） */
  hasPendingUpdate: (projectId: string) => boolean;
  /** 获取指定项目的最新缩略图 */
  getThumbnail: (projectId: string) => string | undefined;
  /** 清除所有待处理的更新 */
  clearPendingUpdates: () => void;
}

/**
 * 监听缩略图更新事件的 React Hook
 *
 * 用于首页 ProjectCard 在后台截图完成后自动刷新缩略图
 */
export function useThumbnailEvents(
  options: UseThumbnailEventsOptions = {}
): UseThumbnailEventsResult {
  const { enableCrossTab = true, autoListen = true } = options;

  // 最近更新的缩略图事件
  const [latestUpdate, setLatestUpdate] = useState<ThumbnailUpdateEvent | null>(null);

  // 待处理的更新 Map（用于批量处理）
  const pendingUpdatesRef = useRef<Map<string, ThumbnailUpdateEvent>>(new Map());

  // 订阅事件
  useEffect(() => {
    // 启动跨标签页通信监听
    if (enableCrossTab) {
      ThumbnailEventBus.startListening();
    }

    // 订阅事件
    const unsubscribe = ThumbnailEventBus.subscribe((event) => {
      console.log(
        `[useThumbnailEvents] Received thumbnail update for project ${event.projectId}, size: ${event.thumbnailSize}`
      );

      // 记录待处理更新
      pendingUpdatesRef.current.set(event.projectId, event);

      // 更新最近事件
      setLatestUpdate(event);
    });

    return () => {
      unsubscribe();
    };
  }, [enableCrossTab]);

  /**
   * 检查是否有指定项目的待处理更新
   * 返回 true 后自动清除记录
   */
  const hasPendingUpdate = useCallback((projectId: string): boolean => {
    const has = pendingUpdatesRef.current.has(projectId);
    if (has) {
      pendingUpdatesRef.current.delete(projectId);
    }
    return has;
  }, []);

  /**
   * 获取指定项目的最新缩略图
   */
  const getThumbnail = useCallback((projectId: string): string | undefined => {
    const update = pendingUpdatesRef.current.get(projectId);
    return update?.thumbnail;
  }, []);

  /**
   * 清除所有待处理的更新
   */
  const clearPendingUpdates = useCallback(() => {
    pendingUpdatesRef.current.clear();
  }, []);

  return {
    latestUpdate,
    hasPendingUpdate,
    getThumbnail,
    clearPendingUpdates,
  };
}

/**
 * useThumbnailUpdate - 简化版 Hook
 *
 * 仅监听指定项目的缩略图更新
 *
 * @param projectId 要监听的项目 ID
 * @returns 更新后的缩略图（如果有）
 *
 * @example
 * ```tsx
 * function ProjectCard({ project }) {
 *   const thumbnail = useThumbnailUpdate(project.id);
 *
 *   return (
 *     <div className="card-preview">
 *       <img src={thumbnail || project.thumbnail} alt={project.name} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useThumbnailUpdate(projectId: string | null): string | undefined {
  const [thumbnail, setThumbnail] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;

    // 启动跨标签页通信监听
    ThumbnailEventBus.startListening();

    // 初始化时立即检查缓存（如果 BackgroundService 已经处理过）
    const cached = ThumbnailEventBus.getLatestThumbnail(projectId);
    if (cached) {
      console.log(`[useThumbnailUpdate] Initialized with cached thumbnail for ${projectId}`);
      setThumbnail(cached.thumbnail);
    }

    // 订阅事件
    const unsubscribe = ThumbnailEventBus.subscribe((event) => {
      if (event.projectId === projectId) {
        console.log(`[useThumbnailUpdate] Received update for project ${projectId}`);
        setThumbnail(event.thumbnail);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [projectId]);

  return thumbnail;
}
