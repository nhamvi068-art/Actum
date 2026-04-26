/**
 * LRU (Least Recently Used) 缓存实现
 * 当缓存达到最大容量时，自动淘汰最久未使用的条目
 */
export class LRUCache<K, V> {
    private cache: Map<K, V>;
    private maxSize: number;

    /**
     * @param maxSize 最大缓存条目数，默认 200
     */
    constructor(maxSize: number = 200) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    /**
     * 获取缓存值，同时将条目移至最新位置
     * @param key 缓存键
     * @returns 缓存值，如果不存在则返回 undefined
     */
    get(key: K): V | undefined {
        if (!this.cache.has(key)) {
            return undefined;
        }
        // 移动到末尾（标记为最新使用）
        const value = this.cache.get(key)!;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    /**
     * 设置缓存值
     * 如果已存在则更新，如果超过最大容量则淘汰最旧条目
     * @param key 缓存键
     * @param value 缓存值
     */
    set(key: K, value: V): void {
        // 如果已存在，先删除再添加（移到最新位置）
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // 超过容量，删除最旧的条目（Map 的第一个键值对）
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }

    /**
     * 检查缓存是否包含指定键
     * @param key 缓存键
     */
    has(key: K): boolean {
        return this.cache.has(key);
    }

    /**
     * 删除指定缓存
     * @param key 缓存键
     */
    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    /**
     * 清除所有缓存
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * 获取当前缓存条目数
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * 获取所有缓存键的迭代器
     */
    keys(): IterableIterator<K> {
        return this.cache.keys();
    }

    /**
     * 获取所有缓存值的迭代器
     */
    values(): IterableIterator<V> {
        return this.cache.values();
    }

    /**
     * 遍历缓存条目
     * @param callback 遍历回调函数
     */
    forEach(callback: (value: V, key: K, map: Map<K, V>) => void): void {
        this.cache.forEach(callback);
    }
}
