/**
 * SnapshotPodManager - 快照遗舱管理器
 *
 * 在用户退出画板时的一瞬间，创建一个"遗舱"（SnapshotPod）：
 * - 克隆的 SVG DOM（已替换 blob URL 为 Data URL）
 * - 原始数据快照（board.children JSON）
 *
 * 这个遗舱存储在隐藏的 DOM 容器中，由 BackgroundSnapshotService 在后台异步处理。
 */

import { PlaitElement } from '@plait/core';

export interface SnapshotPod {
  /** 项目 ID（等于遗舱 ID） */
  projectId: string;
  /** 包含 Data URL 图片的 SVG 序列化字符串 */
  svgDataUrl: string;
  /** 原始数据快照 */
  elementsSnapshot: PlaitElement[];
  /** 创建时间戳 */
  timestamp: number;
  /** 隐藏容器引用 */
  container: HTMLDivElement;
  /** 是否已被处理 */
  isProcessed: boolean;
  /** SVG 视口信息（用于截图尺寸计算） */
  viewport?: {
    width: number;
    height: number;
    zoom: number;
  };
}

const MAX_POD_LIFETIME_MS = 60 * 1000; // 1 分钟后自动清理
const CONTAINER_CSS = `
  position: fixed;
  top: -9999px;
  left: -9999px;
  width: 3840px;
  height: 2160px;
  overflow: hidden;
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
  z-index: -1;
`;

/**
 * 快照遗舱管理器单例
 *
 * 管理所有活跃的快照遗舱，负责创建、存储、销毁操作。
 * 内部维护一个 Map，键为 projectId，值为 SnapshotPod。
 */
class SnapshotPodManagerClass {
  private activePods = new Map<string, SnapshotPod>();
  private cleanupTimer: number | null = null;

  /**
   * 创建快照遗舱
   *
   * @param projectId 项目 ID
   * @param svgClone 已经将所有 blob URL 替换为 Data URL 的 SVG 克隆
   * @param dataSnapshot board.children 的 JSON 快照
   * @param viewport 可选的视口信息
   * @returns 遗舱 ID（等于 projectId）
   */
  createPod(
    projectId: string,
    svgClone: SVGSVGElement,
    dataSnapshot: PlaitElement[],
    viewport?: SnapshotPod['viewport']
  ): string {
    // 清理旧遗舱（如果存在）
    this.deletePod(projectId);

    // 强制注入显式宽高属性
    this.ensureSvgDimensions(svgClone, viewport);

    // 创建隐藏容器
    const container = document.createElement('div');
    container.style.cssText = CONTAINER_CSS;
    container.setAttribute('data-snapshot-pod', projectId);
    container.appendChild(svgClone);
    document.body.appendChild(container);

    // 将 SVG 转为 Data URL
    const svgSerializer = new XMLSerializer();
    const svgString = svgSerializer.serializeToString(svgClone);
    // 使用 encodeURIComponent 正确编码 SVG 中的特殊字符
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

    const pod: SnapshotPod = {
      projectId,
      svgDataUrl,
      elementsSnapshot: dataSnapshot,
      timestamp: Date.now(),
      container,
      isProcessed: false,
      viewport,
    };

    this.activePods.set(projectId, pod);
    console.log(`[SnapshotPodManager] Created pod for project ${projectId}, SVG size: ${svgDataUrl.length} bytes`);

    // 确保清理定时器运行
    this.ensureCleanupTimer();

    return projectId;
  }

  /**
   * 获取遗舱
   */
  getPod(projectId: string): SnapshotPod | null {
    return this.activePods.get(projectId) || null;
  }

  /**
   * 检查是否有指定项目的活跃遗舱
   */
  hasActivePod(projectId: string): boolean {
    return this.activePods.has(projectId);
  }

  /**
   * 获取所有未处理的遗舱
   */
  getUnprocessedPods(): SnapshotPod[] {
    return Array.from(this.activePods.values()).filter(pod => !pod.isProcessed);
  }

  /**
   * 获取活跃遗舱数量
   */
  getActiveCount(): number {
    return this.activePods.size;
  }

  /**
   * 标记遗舱为已处理
   */
  markProcessed(projectId: string): void {
    const pod = this.activePods.get(projectId);
    if (pod) {
      pod.isProcessed = true;
      console.log(`[SnapshotPodManager] Marked pod as processed: ${projectId}`);
    }
  }

  /**
   * 删除遗舱
   */
  deletePod(projectId: string): void {
    const pod = this.activePods.get(projectId);
    if (pod) {
      // 从 DOM 中移除隐藏容器
      if (pod.container.parentNode) {
        pod.container.parentNode.removeChild(pod.container);
      }
      this.activePods.delete(projectId);
      console.log(`[SnapshotPodManager] Deleted pod for project ${projectId}`);
    }
  }

  /**
   * 删除所有遗舱
   */
  deleteAllPods(): void {
    for (const projectId of this.activePods.keys()) {
      this.deletePod(projectId);
    }
  }

  /**
   * 清理过期的遗舱
   */
  private cleanupStalePods(): void {
    const now = Date.now();
    const expiredPods: string[] = [];

    for (const [projectId, pod] of this.activePods) {
      if (now - pod.timestamp > MAX_POD_LIFETIME_MS) {
        expiredPods.push(projectId);
      }
    }

    if (expiredPods.length > 0) {
      console.log(`[SnapshotPodManager] Cleaning up ${expiredPods.length} stale pod(s)`);
      for (const projectId of expiredPods) {
        this.deletePod(projectId);
      }
    }
  }

  /**
   * 确保清理定时器正在运行
   */
  private ensureCleanupTimer(): void {
    if (this.cleanupTimer === null) {
      this.cleanupTimer = window.setInterval(() => {
        this.cleanupStalePods();
      }, 10000); // 每 10 秒检查一次
    }
  }

  /**
   * 停止清理定时器（用于测试或清理）
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 确保 SVG 元素具有显式的 width 和 height 属性
   *
   * Canvas 绘制 SVG 时，如果 SVG 根节点没有 width/height 属性，
   * 会导致渲染出空白图片（因为浏览器无法确定渲染尺寸）。
   */
  private ensureSvgDimensions(
    svgClone: SVGSVGElement,
    viewport?: SnapshotPod['viewport']
  ): void {
    // 优先使用 viewport 信息
    if (viewport) {
      const width = Math.round(viewport.width * viewport.zoom);
      const height = Math.round(viewport.height * viewport.zoom);

      svgClone.setAttribute('width', width.toString());
      svgClone.setAttribute('height', height.toString());
      console.log(`[SnapshotPodManager] Set SVG dimensions from viewport: ${width}x${height}`);
      return;
    }

    // 回退方案：从 style 获取或使用默认值
    const style = svgClone.getAttribute('style') || '';
    const widthMatch = style.match(/width:\s*(\d+(?:\.\d+)?)(?:px)?/);
    const heightMatch = style.match(/height:\s*(\d+(?:\.\d+)?)(?:px)?/);

    let width = widthMatch ? Math.round(parseFloat(widthMatch[1])) : 1920;
    let height = heightMatch ? Math.round(parseFloat(heightMatch[1])) : 1080;

    // 如果 style 中也没有，尝试从 bounding box 获取
    if (!widthMatch && !heightMatch) {
      try {
        const rect = svgClone.getBoundingClientRect();
        if (rect.width > 0) width = Math.round(rect.width);
        if (rect.height > 0) height = Math.round(rect.height);
      } catch (e) {
        console.warn('[SnapshotPodManager] Could not get SVG bounding rect, using defaults');
      }
    }

    svgClone.setAttribute('width', width.toString());
    svgClone.setAttribute('height', height.toString());

    // 确保包含 xmlns 属性
    if (!svgClone.getAttribute('xmlns')) {
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    console.log(`[SnapshotPodManager] Set SVG dimensions: ${width}x${height}`);
  }

  /**
   * 获取调试信息
   */
  getDebugInfo(): object {
    const pods: object[] = [];
    for (const [projectId, pod] of this.activePods) {
      pods.push({
        projectId,
        age: Date.now() - pod.timestamp,
        isProcessed: pod.isProcessed,
        svgDataUrlLength: pod.svgDataUrl.length,
        elementsCount: pod.elementsSnapshot.length,
      });
    }
    return {
      activeCount: this.activePods.size,
      cleanupTimerRunning: this.cleanupTimer !== null,
      pods,
    };
  }
}

/**
 * 快照遗舱管理器单例
 */
export const SnapshotPodManager = new SnapshotPodManagerClass();
