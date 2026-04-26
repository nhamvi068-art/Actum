/**
 * 内存熔断事件名称
 * 当内存使用率超过阈值时触发
 */
export const MEMORY_CRITICAL_EVENT = 'memory-critical';

/**
 * 内存状态信息
 */
export interface MemoryStatus {
    /** 已使用的堆内存（字节） */
    usedHeap: number;
    /** 总堆内存（字节） */
    totalHeap: number;
    /** 堆内存上限（字节） */
    heapLimit: number;
    /** 内存使用率 */
    usageRatio: number;
    /** 是否达到危险阈值 */
    isCritical: boolean;
}

/**
 * Chrome 特有的内存信息接口
 */
interface PerformanceMemory {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
}

/**
 * 扩展的 performance 接口
 */
interface ExtendedPerformance extends Performance {
    memory?: PerformanceMemory;
}

/**
 * 内存监控服务
 *
 * 主动监控内存使用情况，在接近阈值时触发熔断事件
 *
 * 使用 Chrome 特有的 performance.memory API
 * 注意：此 API 在非 Chromium 浏览器中不可用
 */
class MemoryMonitorService {
    private intervalId: number | null = null;
    private checkInterval = 3000; // 每 3 秒检测一次
    private criticalThreshold = 0.6; // 60% 就触发熔断（提前预警）
    private isMonitoring = false;
    private lastCircuitBreakerTime = 0;
    private circuitBreakerCooldown = 10000; // 熔断冷却 10 秒，防止频繁触发

    /**
     * 获取当前内存状态
     *
     * 使用 Chrome 特有的 performance.memory API
     *
     * @returns 内存状态，如果 API 不可用则返回 null
     */
    getMemoryInfo(): MemoryStatus | null {
        const perf = performance as ExtendedPerformance;

        // 检查 API 可用性
        if (!perf.memory) {
            return null;
        }

        const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = perf.memory;

        return {
            usedHeap: usedJSHeapSize,
            totalHeap: totalJSHeapSize,
            heapLimit: jsHeapSizeLimit,
            usageRatio: usedJSHeapSize / jsHeapSizeLimit,
            isCritical: usedJSHeapSize / jsHeapSizeLimit >= this.criticalThreshold
        };
    }

    /**
     * 启动内存监控
     *
     * 开始定期检测内存使用情况
     */
    startMonitoring(): void {
        if (this.isMonitoring) {
            console.log('[MemoryMonitor] Already monitoring');
            return;
        }

        // 检查 API 可用性
        const memInfo = this.getMemoryInfo();
        if (!memInfo) {
            console.warn('[MemoryMonitor] Memory API not available (non-Chromium browser)');
            return;
        }

        console.log('[MemoryMonitor] Started');

        this.isMonitoring = true;

        this.intervalId = window.setInterval(() => {
            this.checkMemory();
        }, this.checkInterval);

        // 立即执行一次检查
        this.checkMemory();
    }

    /**
     * 检测内存使用情况
     */
    private checkMemory(): void {
        const status = this.getMemoryInfo();

        if (!status) {
            return;
        }

        const usedMB = (status.usedHeap / 1024 / 1024).toFixed(2);
        const limitMB = (status.heapLimit / 1024 / 1024).toFixed(2);
        const usagePercent = (status.usageRatio * 100).toFixed(1);

        // 日志输出（只在临界状态时警告）
        if (status.isCritical) {
            console.warn(`[MemoryMonitor] CRITICAL - Heap: ${usedMB}MB / ${limitMB}MB (${usagePercent}%)`);
        } else {
            console.debug(`[MemoryMonitor] Heap: ${usedMB}MB / ${limitMB}MB (${usagePercent}%)`);
        }

        // 检查是否触发熔断（有冷却时间限制）
        if (status.isCritical) {
            const now = Date.now();
            if (now - this.lastCircuitBreakerTime > this.circuitBreakerCooldown) {
                this.lastCircuitBreakerTime = now;
                this.triggerCircuitBreaker();
            } else {
                console.log('[MemoryMonitor] Circuit breaker skipped (cooldown active)');
            }
        }
    }

    /**
     * 触发内存熔断
     *
     * 派发全局事件，通知所有订阅者进行内存回收
     */
    private triggerCircuitBreaker(): void {
        console.warn('[MemoryMonitor] TRIGGERING CIRCUIT BREAKER - Memory threshold exceeded');

        // 派发全局事件
        const event = new CustomEvent(MEMORY_CRITICAL_EVENT, {
            detail: {
                timestamp: Date.now(),
                status: this.getMemoryInfo()
            },
            bubbles: true
        });

        window.dispatchEvent(event);
    }

    /**
     * 停止内存监控
     */
    stopMonitoring(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.isMonitoring = false;
            console.log('[MemoryMonitor] Stopped');
        }
    }

    /**
     * 获取当前内存状态
     */
    getStatus(): MemoryStatus | null {
        return this.getMemoryInfo();
    }

    /**
     * 获取监控状态
     */
    getIsMonitoring(): boolean {
        return this.isMonitoring;
    }

    /**
     * 获取检测间隔
     */
    getCheckInterval(): number {
        return this.checkInterval;
    }

    /**
     * 获取临界阈值
     */
    getCriticalThreshold(): number {
        return this.criticalThreshold;
    }

    /**
     * 手动触发熔断（用于测试或紧急释放）
     */
    forceCircuitBreaker(): void {
        console.warn('[MemoryMonitor] Manual circuit breaker triggered');
        this.triggerCircuitBreaker();
    }
}

// 全局单例
export const memoryMonitorService = new MemoryMonitorService();
