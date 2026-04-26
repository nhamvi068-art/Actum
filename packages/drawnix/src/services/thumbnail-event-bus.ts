/**
 * ThumbnailEventBus - 缩略图事件总线
 *
 * 提供跨页面、跨组件的缩略图更新通知机制：
 * 1. 发布-订阅模式：组件可以订阅缩略图更新事件
 * 2. postMessage 跨标签页通信：用户可能在多个标签页打开应用
 *
 * 使用场景：
 * - BackgroundSnapshotService 完成截图后，通知所有打开的页面更新缩略图
 * - 首页 ProjectCard 监听到通知后，静默刷新缩略图
 */

export interface ThumbnailUpdateEvent {
  /** 项目 ID */
  projectId: string;
  /** 新生成的缩略图 Base64 */
  thumbnail: string;
  /** 缩略图大小（字节） */
  thumbnailSize: number;
  /** 事件时间戳 */
  timestamp: number;
}

export type ThumbnailCallback = (event: ThumbnailUpdateEvent) => void;

const POST_MESSAGE_TYPE = 'DRAWNIX_THUMBNAIL_UPDATE';

/**
 * 缩略图事件总线单例
 */
class ThumbnailEventBusClass {
  private subscribers: Set<ThumbnailCallback> = new Set();
  private latestThumbnails: Map<string, ThumbnailUpdateEvent> = new Map();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private isListening = false;

  /**
   * 分发缩略图更新事件
   *
   * @param projectId 项目 ID
   * @param thumbnail 新生成的缩略图 Base64
   * @param thumbnailSize 缩略图大小
   */
  dispatch(projectId: string, thumbnail: string, thumbnailSize?: number): void {
    const event: ThumbnailUpdateEvent = {
      projectId,
      thumbnail,
      thumbnailSize: thumbnailSize || thumbnail.length,
      timestamp: Date.now(),
    };

    // 先存入缓存（类似 BehaviorSubject 的 behavior）
    this.latestThumbnails.set(projectId, event);
    console.log(`[ThumbnailEventBus] Cached thumbnail for ${projectId}, cache size: ${this.latestThumbnails.size}`);

    // 通知当前页面的订阅者
    this.notifySubscribers(event);

    // 通过 postMessage 通知（同源页面通信，包括跨标签页）
    if (typeof window !== 'undefined') {
      window.postMessage(
        {
          type: POST_MESSAGE_TYPE,
          payload: event,
        },
        window.location.origin
      );
    }
  }

  /**
   * 通知所有订阅者
   */
  private notifySubscribers(event: ThumbnailUpdateEvent): void {
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (e) {
        console.error('[ThumbnailEventBus] Subscriber error:', e);
      }
    }
  }

  /**
   * 订阅缩略图更新事件
   *
   * @param callback 回调函数
   * @returns 取消订阅的函数
   */
  subscribe(callback: ThumbnailCallback): () => void {
    this.subscribers.add(callback);
    console.log(`[ThumbnailEventBus] Subscribed, total: ${this.subscribers.size}`);

    // 立即检查缓存，将历史事件回调给新订阅者
    const cachedEvents = Array.from(this.latestThumbnails.values());
    if (cachedEvents.length > 0) {
      console.log(`[ThumbnailEventBus] Sending ${cachedEvents.length} cached events to new subscriber`);
      for (const cachedEvent of cachedEvents) {
        try {
          callback(cachedEvent);
        } catch (e) {
          console.error('[ThumbnailEventBus] Cached event callback error:', e);
        }
      }
    }

    // 返回取消订阅函数
    return () => {
      this.subscribers.delete(callback);
      console.log(`[ThumbnailEventBus] Unsubscribed, total: ${this.subscribers.size}`);
    };
  }

  /**
   * 批量订阅
   *
   * @param callbacks 回调函数数组
   * @returns 取消所有订阅的函数
   */
  subscribeAll(callbacks: ThumbnailCallback[]): () => void {
    for (const callback of callbacks) {
      this.subscribers.add(callback);
    }

    return () => {
      for (const callback of callbacks) {
        this.subscribers.delete(callback);
      }
    };
  }

  /**
   * 获取当前订阅者数量
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * 清除所有订阅者
   */
  clearSubscribers(): void {
    this.subscribers.clear();
    console.log('[ThumbnailEventBus] All subscribers cleared');
  }

  /**
   * 启动 postMessage 监听（用于跨标签页通信）
   *
   * 应该在 App 组件挂载时调用一次
   */
  startListening(): void {
    if (this.isListening) return;
    if (typeof window === 'undefined') return;

    this.messageHandler = (event: MessageEvent) => {
      // 仅处理同源消息
      if (event.origin !== window.location.origin) return;

      // 仅处理缩略图更新消息
      if (event.data?.type !== POST_MESSAGE_TYPE) return;

      const updateEvent = event.data.payload as ThumbnailUpdateEvent;

      // 验证事件数据
      if (!updateEvent.projectId || !updateEvent.thumbnail) {
        console.warn('[ThumbnailEventBus] Invalid event data:', updateEvent);
        return;
      }

      console.log(
        `[ThumbnailEventBus] Received cross-tab update for project ${updateEvent.projectId}, size: ${updateEvent.thumbnailSize}`
      );

      // 通知所有订阅者
      this.notifySubscribers(updateEvent);
    };

    window.addEventListener('message', this.messageHandler);
    this.isListening = true;
    console.log('[ThumbnailEventBus] Started listening for postMessage');
  }

  /**
   * 停止 postMessage 监听
   *
   * 应该在 App 组件卸载时调用（如果有的话）
   */
  stopListening(): void {
    if (!this.isListening || !this.messageHandler) return;
    if (typeof window === 'undefined') return;

    window.removeEventListener('message', this.messageHandler);
    this.messageHandler = null;
    this.isListening = false;
    console.log('[ThumbnailEventBus] Stopped listening for postMessage');
  }

  /**
   * 获取指定项目的最新缩略图（如果有）
   */
  getLatestThumbnail(projectId: string): ThumbnailUpdateEvent | undefined {
    return this.latestThumbnails.get(projectId);
  }

  /**
   * 获取调试信息
   */
  getDebugInfo(): object {
    return {
      subscriberCount: this.subscribers.size,
      isListening: this.isListening,
      cachedProjects: Array.from(this.latestThumbnails.keys()),
    };
  }
}

/**
 * 缩略图事件总线单例
 */
export const ThumbnailEventBus = new ThumbnailEventBusClass();
