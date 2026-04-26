/**
 * BackgroundSnapshotService - 后台截图服务
 *
 * 轮询检测 SnapshotPodManager 中的新遗舱，并异步处理：
 * 1. 等待 SVG Data URL 加载完成
 * 2. 渲染到离屏 Canvas
 * 3. 截图并尝试转换为 WebP
 * 4. 写入 IndexedDB
 * 5. 通过 ThumbnailEventBus 通知所有页面
 *
 * 特点：
 * - 单例模式，确保只有一个后台服务运行
 * - 轮询检测，无需复杂的生命周期管理
 * - 支持批量处理多个遗舱
 */

import { SnapshotPodManager } from './snapshot-pod-manager';
import { ThumbnailEventBus } from './thumbnail-event-bus';
import { canvasService } from './db/canvas-service';
import localforage from 'localforage';
import { PROJECTS_KEY } from './storage';

const POLL_INTERVAL_MS = 2000; // 轮询间隔（增加到 2 秒减少性能消耗）
const MAX_CONCURRENT = 1; // 最大并发处理数
const PROCESS_DELAY_MS = 100; // 处理间隔

class BackgroundSnapshotServiceClass {
  private isRunning = false;
  private pollTimer: number | null = null;
  private processingSet = new Set<string>();

  /**
   * 服务是否正在运行
   */
  get serviceIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 启动后台服务
   *
   * 应该在 App 组件挂载时调用一次
   */
  start(): void {
    if (this.isRunning) {
      console.log('[BackgroundSnapshotService] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[BackgroundSnapshotService] Started');

    // 开始轮询
    this.startPolling();
  }

  /**
   * 停止后台服务
   *
   * 应该在 App 组件卸载时调用
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    console.log('[BackgroundSnapshotService] Stopped');
  }

  /**
   * 开始轮询
   */
  private startPolling(): void {
    if (!this.isRunning) return;

    // 检测并处理新遗舱
    this.pollNewPods();

    // 安排下一次轮询
    this.pollTimer = window.setTimeout(() => {
      this.startPolling();
    }, POLL_INTERVAL_MS);
  }

  /**
   * 轮询检测新遗舱
   */
  private pollNewPods(): void {
    if (!this.isRunning) return;

    // 获取所有未处理的遗舱
    const unprocessedPods = SnapshotPodManager.getUnprocessedPods();

    for (const pod of unprocessedPods) {
      // 跳过正在处理的遗舱
      if (this.processingSet.has(pod.projectId)) continue;

      // 限制并发数
      if (this.processingSet.size >= MAX_CONCURRENT) break;

      // 开始处理
      this.processPod(pod.projectId);
    }
  }

  /**
   * 处理单个遗舱
   */
  private async processPod(projectId: string): Promise<void> {
    if (!this.isRunning) return;
    if (this.processingSet.has(projectId)) return;

    this.processingSet.add(projectId);
    console.log(`[BackgroundSnapshotService] Processing pod: ${projectId}`);

    try {
      // 1. 获取遗舱
      const pod = SnapshotPodManager.getPod(projectId);
      if (!pod) {
        console.warn(`[BackgroundSnapshotService] Pod not found: ${projectId}`);
        return;
      }

      if (pod.isProcessed) {
        console.log(`[BackgroundSnapshotService] Pod already processed: ${projectId}`);
        return;
      }

      // 2. 等待 SVG Data URL 加载完成
      await this.waitForSvgLoad(pod.svgDataUrl);

      // 3. 渲染 SVG 到 Canvas 并截图
      const thumbnail = await this.renderSvgToThumbnail(pod);
      if (!thumbnail) {
        console.error(`[BackgroundSnapshotService] Failed to render thumbnail for ${projectId}`);
        return;
      }

      // 缩略图生成后校验
      console.log(`[BackgroundSnapshotService] Generated thumbnail for ${projectId}, length: ${thumbnail.length}`);
      if (thumbnail.length < 1000) {
        console.error('[BackgroundSnapshotService] Warning: Generated thumbnail is unusually small, SVG to Canvas rendering may have failed!');
      }

      // 4. 写入 IndexedDB (workspaces 表)
      await canvasService.saveThemeAndViewport(projectId, undefined, undefined, thumbnail);
      console.log(
        `[BackgroundSnapshotService] Thumbnail saved to IndexedDB for ${projectId}, size: ${thumbnail.length}`
      );

      // 5. 同步更新 PROJECTS_KEY（首页卡片的数据源）
      await this.syncThumbnailToProjectsKey(projectId, thumbnail);

      // 6. 标记为已处理
      SnapshotPodManager.markProcessed(projectId);

      // 7. 分发事件通知所有页面
      ThumbnailEventBus.dispatch(projectId, thumbnail, thumbnail.length);

      console.log(`[BackgroundSnapshotService] Successfully processed pod: ${projectId}`);
    } catch (error) {
      console.error(`[BackgroundSnapshotService] Error processing pod ${projectId}:`, error);
    } finally {
      this.processingSet.delete(projectId);

      // 处理下一个遗舱（如果有）
      if (this.isRunning) {
        setTimeout(() => {
          this.pollNewPods();
        }, PROCESS_DELAY_MS);
      }
    }
  }

  /**
   * 等待 SVG Data URL 加载完成
   */
  private waitForSvgLoad(svgDataUrl: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(img.src); // 释放内存
        resolve();
      };

      img.onerror = () => {
        console.warn('[BackgroundSnapshotService] SVG load failed, continuing anyway');
        resolve(); // 即使加载失败也继续
      };

      img.src = svgDataUrl;
    });
  }

  /**
   * 严格加载 Image，确保 SVG 完全加载后再返回
   *
   * @param src SVG Data URL
   * @returns 加载完成的 Image 或 null
   */
  private loadImageStrict(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const img = new Image();

      // 设置 crossOrigin 以避免 CORS 问题
      img.crossOrigin = 'anonymous';

      const timeout = setTimeout(() => {
        console.error('[BackgroundSnapshotService] Image load timeout after 10s');
        img.onload = null;
        img.onerror = null;
        resolve(null);
      }, 10000);

      img.onload = () => {
        clearTimeout(timeout);
        console.log(
          `[BackgroundSnapshotService] Image loaded successfully: ${img.naturalWidth}x${img.naturalHeight}`
        );
        resolve(img);
      };

      img.onerror = (e) => {
        clearTimeout(timeout);
        console.error('[BackgroundSnapshotService] Image load error:', e);
        resolve(null);
      };

      img.src = src;
    });
  }

  /**
   * 渲染 SVG 到 Canvas 并生成缩略图
   */
  private async renderSvgToThumbnail(
    pod: ReturnType<typeof SnapshotPodManager.getPod> extends infer T ? NonNullable<T> : never
  ): Promise<string | null> {
    // 严格等待 Image 加载完成
    const img = await this.loadImageStrict(pod.svgDataUrl);
    if (!img) {
      console.error('[BackgroundSnapshotService] Failed to load SVG image');
      return null;
    }

    // 验证图片尺寸
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      console.error(
        `[BackgroundSnapshotService] Image has zero dimensions: ${img.naturalWidth}x${img.naturalHeight}`
      );
      return null;
    }

    console.log(
      `[BackgroundSnapshotService] Image loaded: ${img.naturalWidth}x${img.naturalHeight}, source size: ${pod.svgDataUrl.length} bytes`
    );

    try {
      // 计算截图尺寸（使用实际图片尺寸）
      const { width, height } = this.calculateThumbnailSize(img, pod.viewport);

      // 创建 Canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('[BackgroundSnapshotService] Failed to get canvas 2d context');
        return null;
      }

      // 填充白色背景（确保非透明，方便查看）
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // 绘制 SVG（保持宽高比）
      ctx.drawImage(img, 0, 0, width, height);

      console.log(`[BackgroundSnapshotService] Canvas drawn: ${width}x${height}`);

      // 导出为 PNG
      const thumbnail = canvas.toDataURL('image/png');
      console.log(`[BackgroundSnapshotService] PNG export size: ${thumbnail.length} bytes`);

      // 尝试转换为 WebP（减小体积）
      const webpThumbnail = await this.tryConvertToWebP(canvas);
      if (webpThumbnail) {
        console.log(
          `[BackgroundSnapshotService] WebP conversion: ${thumbnail.length} -> ${webpThumbnail.length} bytes`
        );
        return webpThumbnail;
      }

      return thumbnail;
    } catch (error) {
      console.error('[BackgroundSnapshotService] Render error:', error);
      return null;
    }
  }

  /**
   * 计算缩略图尺寸
   */
  private calculateThumbnailSize(
    img: HTMLImageElement,
    viewport?: { width: number; height: number; zoom: number }
  ): { width: number; height: number } {
    const maxWidth = 400;
    const maxHeight = 300;

    let width: number;
    let height: number;

    if (viewport) {
      // 优先使用 viewport 尺寸
      width = Math.round(viewport.width * viewport.zoom);
      height = Math.round(viewport.height * viewport.zoom);
    } else {
      // 使用图片实际尺寸
      width = img.naturalWidth;
      height = img.naturalHeight;
    }

    // 按比例缩放
    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);

    // 确保最小尺寸
    width = Math.max(width, 100);
    height = Math.max(height, 75);

    return { width, height };
  }

  /**
   * 尝试将 Canvas 转换为 WebP
   */
  private tryConvertToWebP(canvas: HTMLCanvasElement): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
              resolve(reader.result as string);
            };
            reader.onerror = () => {
              resolve(null);
            };
            reader.readAsDataURL(blob);
          },
          'image/webp',
          0.85
        );
      } catch (error) {
        console.warn('[BackgroundSnapshotService] WebP conversion not supported:', error);
        resolve(null);
      }
    });
  }

  /**
   * 同步缩略图到 PROJECTS_KEY
   *
   * 首页卡片的数据源是 PROJECTS_KEY，如果不同步更新，
   * 即使 IndexedDB 中的 workspaces 已更新，卡片也看不到新缩略图
   */
  private async syncThumbnailToProjectsKey(projectId: string, thumbnail: string): Promise<void> {
    try {
      const projects = await localforage.getItem<any[]>(PROJECTS_KEY);
      if (!Array.isArray(projects)) {
        console.log(`[BackgroundSnapshotService] No projects found in PROJECTS_KEY`);
        return;
      }

      const projectIndex = projects.findIndex(p => p.id === projectId);
      if (projectIndex === -1) {
        console.log(`[BackgroundSnapshotService] Project ${projectId} not found in PROJECTS_KEY`);
        return;
      }

      // 检查缩略图是否有变化
      if (projects[projectIndex].thumbnail === thumbnail) {
        console.log(`[BackgroundSnapshotService] Thumbnail unchanged for ${projectId}, skipping update`);
        return;
      }

      // 更新对应项目的缩略图
      const updatedProjects = projects.map(p =>
        p.id === projectId
          ? { ...p, thumbnail, updatedAt: new Date().toISOString() }
          : p
      );

      await localforage.setItem(PROJECTS_KEY, updatedProjects);
      console.log(
        `[BackgroundSnapshotService] PROJECTS_KEY synced for ${projectId}, thumbnail length: ${thumbnail.length}`
      );
    } catch (error) {
      console.error(`[BackgroundSnapshotService] Failed to sync PROJECTS_KEY for ${projectId}:`, error);
    }
  }

  /**
   * 获取调试信息
   */
  getDebugInfo(): object {
    return {
      isRunning: this.isRunning,
      pollIntervalMs: POLL_INTERVAL_MS,
      processingCount: this.processingSet.size,
      processingIds: Array.from(this.processingSet),
      activePods: SnapshotPodManager.getActiveCount(),
    };
  }
}

/**
 * 后台截图服务单例
 */
export const BackgroundSnapshotService = new BackgroundSnapshotServiceClass();
