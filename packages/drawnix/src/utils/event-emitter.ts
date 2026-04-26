/**
 * 简单的事件派发器
 * 用于解耦模块之间的通信，支持订阅/取消订阅模式
 */

type EventListener = (...args: any[]) => void;

interface ListenerEntry {
  listener: EventListener;
  context?: any;
}

export class EventEmitter {
  private events: Map<string, ListenerEntry[]> = new Map();

  /**
   * 订阅事件
   */
  on(event: string, listener: EventListener, context?: any): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const entries = this.events.get(event)!;
    entries.push({ listener, context });

    // 返回取消订阅函数
    return () => this.off(event, listener);
  }

  /**
   * 订阅一次性事件（触发后自动取消订阅）
   */
  once(event: string, listener: EventListener, context?: any): () => void {
    const wrappedListener = (...args: any[]) => {
      this.off(event, wrappedListener);
      listener.apply(context, args);
    };
    return this.on(event, wrappedListener);
  }

  /**
   * 取消订阅
   */
  off(event: string, listener: EventListener): void {
    const entries = this.events.get(event);
    if (!entries) return;

    const index = entries.findIndex(entry => entry.listener === listener);
    if (index !== -1) {
      entries.splice(index, 1);
    }

    if (entries.length === 0) {
      this.events.delete(event);
    }
  }

  /**
   * 派发事件
   */
  emit(event: string, ...args: any[]): void {
    const entries = this.events.get(event);
    if (!entries) return;

    // 复制一份，防止监听器在执行过程中修改事件列表
    const entriesCopy = [...entries];
    entriesCopy.forEach(entry => {
      entry.listener.apply(entry.context, args);
    });
  }

  /**
   * 移除所有事件监听器
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  /**
   * 获取事件监听器数量
   */
  listenerCount(event: string): number {
    return this.events.get(event)?.length || 0;
  }
}
