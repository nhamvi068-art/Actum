import { useState, useEffect, useRef, useCallback } from 'react';
import { PlaitBoard, RectangleClient } from '@plait/core';

/**
 * 视口相交检测配置选项
 */
export interface ViewportIntersectionOptions {
    /** 视口外缓冲区域大小（像素），避免边缘闪烁 */
    padding?: number;
    /** 是否在初始化时立即计算一次 */
    immediate?: boolean;
    /** 交互恢复延迟（毫秒） */
    recoveryDelay?: number;
    /** 画布就绪延迟（毫秒），首屏加载时等待视口建立 */
    boardReadyDelay?: number;
}

/**
 * 计算视口矩形
 * 考虑缩放因子，将屏幕坐标转换为画布坐标
 */
function calculateViewportRectangle(boardInstance: PlaitBoard, paddingValue: number): RectangleClient {
    const viewport = boardInstance.viewport;
    const containerRect = getViewportContainerRect(boardInstance);

    if (!containerRect || !viewport) {
        return { x: -paddingValue, y: -paddingValue, width: paddingValue * 2, height: paddingValue * 2 };
    }

    const zoom = viewport.zoom;
    const origination = viewport.origination || [0, 0];

    const viewportWidth = containerRect.width / zoom;
    const viewportHeight = containerRect.height / zoom;

    const viewportX = origination[0];
    const viewportY = origination[1];

    return {
        x: viewportX - paddingValue,
        y: viewportY - paddingValue,
        width: viewportWidth + paddingValue * 2,
        height: viewportHeight + paddingValue * 2
    };
}

/**
 * 视口相交检测结果
 */
export interface ViewportIntersectionResult {
    /** 元素是否在视口内 */
    isIntersecting: boolean;
    /** 视口矩形 */
    viewportRectangle: RectangleClient;
    /** 强制重新计算 */
    refresh: () => void;
    /** 画布是否已就绪（首屏加载保护） */
    isBoardReady: boolean;
}

/**
 * 默认缓冲区域大小
 */
const DEFAULT_PADDING = 500;

/**
 * 视口剔除 Hook - 事件驱动版本
 *
 * 移除所有 setInterval，使用事件驱动
 * 只在交互结束时更新状态，确保性能
 *
 * @param board 画板实例
 * @param getElementRectangle 获取元素包围盒的函数
 * @param options 配置选项
 */
export const useViewportIntersection = (
    board: PlaitBoard,
    getElementRectangle: () => RectangleClient | null,
    options: ViewportIntersectionOptions = {}
): ViewportIntersectionResult => {
    const { padding = DEFAULT_PADDING, immediate = true, recoveryDelay = 300, boardReadyDelay = 500 } = options;

    // 画布就绪状态：首屏加载时等待视口完全建立
    const [isBoardReady, setIsBoardReady] = useState(false);

    // 初始状态：画布未就绪时，认为所有图片都在视口外（避免首屏穿透）
    const [isIntersecting, setIsIntersecting] = useState(immediate ? false : false);
    const [viewportRectangle, setViewportRectangle] = useState<RectangleClient>(() => {
        return { x: -padding, y: -padding, width: padding * 2, height: padding * 2 };
    });

    const boardRef = useRef(board);
    const paddingRef = useRef(padding);
    const rafRef = useRef<number | null>(null);
    const debounceRef = useRef<number | null>(null);
    const isInteractingRef = useRef(false);

    // 画布就绪延迟
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsBoardReady(true);
        }, boardReadyDelay);
        return () => clearTimeout(timer);
    }, [boardReadyDelay]);

    // 更新 refs
    useEffect(() => {
        boardRef.current = board;
        paddingRef.current = padding;
    }, [board, padding]);

    /**
     * 检测元素是否与视口相交
     */
    const checkIntersection = useCallback(() => {
        const boardInstance = boardRef.current;
        const paddingValue = paddingRef.current;

        // 获取当前视口矩形
        const currentViewportRect = calculateViewportRectangle(boardInstance, paddingValue);
        setViewportRectangle(currentViewportRect);

        // 获取元素矩形
        const elementRect = getElementRectangle();

        // 如果元素矩形为 null，保持当前状态不变
        if (!elementRect) {
            return;
        }

        // 检测相交
        const intersecting = isRectangleIntersecting(elementRect, currentViewportRect);
        setIsIntersecting(intersecting);
    }, [getElementRectangle]);

    /**
     * 节流的检测（用于交互结束时）
     */
    const throttledCheck = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
        }

        rafRef.current = requestAnimationFrame(() => {
            checkIntersection();
            rafRef.current = null;
        });
    }, [checkIntersection]);

    /**
     * 强制重新计算
     */
    const refresh = useCallback(() => {
        throttledCheck();
    }, [throttledCheck]);

    // 监听视口变化 - 事件驱动
    useEffect(() => {
        const boardInstance = boardRef.current;

        // 初始计算 - 但要等待画布就绪
        const doInitialCheck = () => {
            if (isBoardReady && immediate) {
                checkIntersection();
            }
        };

        // 监听画布就绪状态
        if (isBoardReady) {
            doInitialCheck();
        }

        // 使用 RAF 循环检测视口变化（比 setInterval 更高效）
        // 只在交互结束后更新状态
        let lastZoom = boardInstance.viewport?.zoom || 1;
        let lastOrigination = JSON.stringify(boardInstance.viewport?.origination || [0, 0]);

        const checkViewportChange = () => {
            const viewport = boardInstance.viewport;
            if (!viewport) return;

            const currentZoom = viewport.zoom;
            const currentOrigination = JSON.stringify(viewport.origination || [0, 0]);

            const zoomChanged = Math.abs(currentZoom - lastZoom) > 0.0001;
            const originationChanged = currentOrigination !== lastOrigination;

            if (zoomChanged || originationChanged) {
                lastZoom = currentZoom;
                lastOrigination = currentOrigination;

                // 视口变化时，如果是交互中，不更新状态
                // 只记录变化，等待交互结束
                if (!isInteractingRef.current) {
                    throttledCheck();
                }
            }
        };

        // 使用 requestAnimationFrame 进行检测（添加节流避免频繁调用）
        let rafId: number;
        let lastCheckTime = 0;
        const THROTTLE_MS = 100; // 最小检测间隔

        const loop = () => {
            const now = performance.now();
            if (now - lastCheckTime >= THROTTLE_MS) {
                lastCheckTime = now;
                checkViewportChange();
            }
            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);

        // 监听 board 的事件（如果有）
        // PlaitBoard 可能有 change 事件
        const handleBoardChange = () => {
            if (!isInteractingRef.current) {
                throttledCheck();
            }
        };

        // 尝试监听 board 的事件
        // @ts-ignore - PlaitBoard 可能有点击/选区事件
        if (boardInstance.on) {
            // @ts-ignore
            boardInstance.on('change', handleBoardChange);
            // @ts-ignore
            boardInstance.on('selectionChange', handleBoardChange);
        }

        return () => {
            cancelAnimationFrame(rafId);
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
            if (debounceRef.current !== null) {
                clearTimeout(debounceRef.current);
            }
            // @ts-ignore
            if (boardInstance.off) {
                // @ts-ignore
                boardInstance.off('change', handleBoardChange);
                // @ts-ignore
                boardInstance.off('selectionChange', handleBoardChange);
            }
        };
    }, [board, checkIntersection, throttledCheck, immediate, isBoardReady]);

    // 导出设置交互状态的方法（供外部调用）
    // 当交互开始时调用 setInteracting(true)，结束时调用 setInteracting(false)
    useEffect(() => {
        (boardRef.current as any).__setViewportIntersecting = (interacting: boolean) => {
            isInteractingRef.current = interacting;
            if (!interacting) {
                // 交互结束，延迟更新状态
                if (debounceRef.current !== null) {
                    clearTimeout(debounceRef.current);
                }
                debounceRef.current = window.setTimeout(() => {
                    throttledCheck();
                }, recoveryDelay);
            }
        };
    }, [throttledCheck, recoveryDelay]);

    return {
        isIntersecting,
        viewportRectangle,
        refresh,
        isBoardReady
    };
};

/**
 * 获取视口容器尺寸
 */
function getViewportContainerRect(board: PlaitBoard): { width: number; height: number } | null {
    try {
        const host = PlaitBoard.getHost(board);
        if (host && host.parentElement) {
            const rect = host.parentElement.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height
            };
        }
    } catch (e) {
        // 静默处理
    }
    return null;
}

/**
 * 检测两个矩形是否相交
 */
function isRectangleIntersecting(rect1: RectangleClient, rect2: RectangleClient): boolean {
    return !(
        rect1.x + rect1.width < rect2.x ||
        rect2.x + rect2.width < rect1.x ||
        rect1.y + rect1.height < rect2.y ||
        rect2.y + rect2.height < rect1.y
    );
}
