/**
 * 资产加载队列
 * 控制图片加载并发数，避免 OOM
 */
export class AssetLoadQueue {
    private queue: Array<() => Promise<any>> = [];
    private running = 0;
    private maxConcurrent: number;
    private readonly DEFAULT_CONCURRENCY = 4;

    constructor(maxConcurrent = 4) {
        this.maxConcurrent = maxConcurrent || this.DEFAULT_CONCURRENCY;
    }

    /**
     * 入队一个任务
     */
    async enqueue<T>(task: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const wrappedTask = async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            };

            this.queue.push(wrappedTask);
            this.process();
        });
    }

    /**
     * 处理队列
     */
    private async process(): Promise<void> {
        while (this.running < this.maxConcurrent && this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                this.running++;
                try {
                    await task();
                } catch (e) {
                    // 错误已在 wrappedTask 中处理
                    console.error('[AssetLoadQueue] Task failed:', e);
                }
                this.running--;
            }
        }
    }

    /**
     * 获取当前队列长度
     */
    getQueueLength(): number {
        return this.queue.length;
    }

    /**
     * 获取当前运行数
     */
    getRunningCount(): number {
        return this.running;
    }

    /**
     * 设置最大并发数
     */
    setMaxConcurrent(max: number): void {
        this.maxConcurrent = max;
    }

    /**
     * 清空队列
     */
    clear(): void {
        this.queue = [];
    }
}

// 全局单例
export const assetLoadQueue = new AssetLoadQueue(4);

/**
 * 创建专用队列实例
 * 用于不同场景的并发控制
 */
export function createLoadQueue(maxConcurrent = 4): AssetLoadQueue {
    return new AssetLoadQueue(maxConcurrent);
}
