import { useState, useEffect, useRef, useCallback } from 'react';
import { PlaitBoard, isDragging, isMovingElements } from '@plait/core';

/**
 * 画板交互状态 Hook 配置选项
 */
export interface BoardInteractionOptions {
    /** 交互停止后延迟恢复高清渲染的时间（毫秒） */
    recoveryDelay?: number;
    /** 是否在初始化时立即计算一次 */
    immediate?: boolean;
}

/**
 * 画板交互状态结果
 */
export interface BoardInteractionResult {
    /** 当前是否处于交互状态（拖拽/缩放/移动中） */
    isInteracting: boolean;
    /** 是否正在拖拽元素 */
    isDragging: boolean;
    /** 是否正在移动画板/选择 */
    isMoving: boolean;
    /** 是否正在缩放 */
    isZooming: boolean;
    /** 强制刷新状态 */
    refresh: () => void;
    /** 通知交互开始（供外部调用） */
    notifyInteractionStart: () => void;
    /** 通知交互结束（供外部调用） */
    notifyInteractionEnd: () => void;
}

/**
 * 默认恢复延迟时间
 */
const DEFAULT_RECOVERY_DELAY = 150;

/**
 * 缩放检测阈值
 */
const ZOOM_CHANGE_THRESHOLD = 0.001;

/**
 * 画板交互状态 Hook - 事件驱动版本
 *
 * 移除所有 RAF polling，改用事件回调
 * 只在交互结束时更新 React 状态
 *
 * @param board 画板实例
 * @param options 配置选项
 */
export const useBoardInteraction = (
    board: PlaitBoard,
    options: BoardInteractionOptions = {}
): BoardInteractionResult => {
    const { recoveryDelay = DEFAULT_RECOVERY_DELAY, immediate = true } = options;

    const [isInteracting, setIsInteracting] = useState(immediate ? false : true);
    const [isDraggingState, setIsDraggingState] = useState(false);
    const [isMovingState, setIsMovingState] = useState(false);
    const [isZoomingState, setIsZoomingState] = useState(false);

    const boardRef = useRef(board);
    const rafRef = useRef<number | null>(null);
    const timeoutRef = useRef<number | null>(null);
    const isActiveRef = useRef(false);

    // 缩放相关 refs
    const lastZoomRef = useRef<number>(1);
    const zoomTimeoutRef = useRef<number | null>(null);
    const isZoomingRef = useRef(false);

    // 更新 board ref
    useEffect(() => {
        boardRef.current = board;
    }, [board]);

    /**
     * 检查当前交互状态
     */
    const checkInteraction = useCallback(() => {
        const boardInstance = boardRef.current;

        try {
            const dragging = isDragging(boardInstance);
            const moving = isMovingElements(boardInstance);

            setIsDraggingState(dragging);
            setIsMovingState(moving);

            // 任何交互状态都设置为 interacting
            const interacting = dragging || moving || isZoomingRef.current;

            // 如果正在交互，立即更新状态
            if (interacting) {
                setIsInteracting(true);
                isActiveRef.current = true;

                // 清除之前的恢复计时器
                if (timeoutRef.current !== null) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
            }
        } catch (e) {
            console.warn('Failed to check interaction state:', e);
        }
    }, []);

    /**
     * 节流的交互检查
     */
    const throttledCheck = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
        }

        rafRef.current = requestAnimationFrame(() => {
            checkInteraction();
            rafRef.current = null;
        });
    }, [checkInteraction]);

    /**
     * 刷新状态
     */
    const refresh = useCallback(() => {
        throttledCheck();
    }, [throttledCheck]);

    // 设置交互状态恢复计时器
    const scheduleRecovery = useCallback(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = window.setTimeout(() => {
            setIsInteracting(false);
            setIsZoomingState(false);
            isZoomingRef.current = false;
            isActiveRef.current = false;

            // 通知 viewport intersection hook 交互结束
            const viewportIntersectingSetter = (boardRef.current as any).__setViewportIntersecting;
            if (viewportIntersectingSetter) {
                viewportIntersectingSetter(false);
            }

            // 派发交互结束事件，通知所有监听组件恢复高清
            window.dispatchEvent(new CustomEvent('canvas-interaction-end', {
                detail: {
                    board: boardRef.current,
                    timestamp: Date.now()
                }
            }));
        }, recoveryDelay);
    }, [recoveryDelay]);

    // 监听指针事件 - 事件驱动版本
    useEffect(() => {
        const boardInstance = boardRef.current;

        // 初始检查
        if (immediate) {
            checkInteraction();
        }

        // 记录初始缩放值
        lastZoomRef.current = boardInstance.viewport?.zoom || 1;

        // 包装 pointerMove 以触发检查
        const originalPointerMove = boardInstance.pointerMove;
        boardInstance.pointerMove = (event: PointerEvent) => {
            // 交互开始
            isActiveRef.current = true;
            setIsInteracting(true);

            // 通知 viewport intersection hook
            const viewportIntersectingSetter = (boardInstance as any).__setViewportIntersecting;
            if (viewportIntersectingSetter) {
                viewportIntersectingSetter(true);
            }

            return originalPointerMove(event);
        };

        // 包装 pointerDown 以触发检查
        const originalPointerDown = boardInstance.pointerDown;
        boardInstance.pointerDown = (event: PointerEvent) => {
            // 交互开始
            isActiveRef.current = true;
            setIsInteracting(true);

            // 通知 viewport intersection hook
            const viewportIntersectingSetter = (boardInstance as any).__setViewportIntersecting;
            if (viewportIntersectingSetter) {
                viewportIntersectingSetter(true);
            }

            return originalPointerDown(event);
        };

        // 包装 pointerUp 以触发恢复计时器
        const originalPointerUp = boardInstance.pointerUp;
        boardInstance.pointerUp = (event: PointerEvent) => {
            // 先执行原始逻辑
            const result = originalPointerUp(event);

            // 延迟检查是否真的停止了交互
            if (zoomTimeoutRef.current !== null) {
                clearTimeout(zoomTimeoutRef.current);
            }
            zoomTimeoutRef.current = window.setTimeout(() => {
                // 检查是否还在交互
                const dragging = isDragging(boardInstance);
                const moving = isMovingElements(boardInstance);

                if (!dragging && !moving && !isZoomingRef.current) {
                    // 交互真正结束
                    scheduleRecovery();
                }
            }, 50);

            return result;
        };

        // 监听缩放变化 - 通过检测 viewport.zoom
        // 使用事件驱动而不是 polling
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                // 缩放开始
                if (!isZoomingRef.current) {
                    isZoomingRef.current = true;
                    setIsZoomingState(true);
                    setIsInteracting(true);
                    isActiveRef.current = true;

                    // 通知 viewport intersection hook
                    const viewportIntersectingSetter = (boardInstance as any).__setViewportIntersecting;
                    if (viewportIntersectingSetter) {
                        viewportIntersectingSetter(true);
                    }

                    // 清除之前的恢复计时器
                    if (timeoutRef.current !== null) {
                        clearTimeout(timeoutRef.current);
                        timeoutRef.current = null;
                    }
                }

                // 更新上次的缩放值
                lastZoomRef.current = boardInstance.viewport?.zoom || 1;

                // 清除之前的缩放恢复计时器
                if (zoomTimeoutRef.current !== null) {
                    clearTimeout(zoomTimeoutRef.current);
                }

                // 设置缩放恢复计时器
                zoomTimeoutRef.current = window.setTimeout(() => {
                    isZoomingRef.current = false;
                    setIsZoomingState(false);

                    // 检查是否还有其他交互
                    const dragging = isDragging(boardInstance);
                    const moving = isMovingElements(boardInstance);

                    if (!dragging && !moving) {
                        scheduleRecovery();
                    }
                }, recoveryDelay);
            }
        };

        // 绑定 wheel 事件到 board host
        const host = PlaitBoard.getHost(boardInstance);
        if (host) {
            host.addEventListener('wheel', handleWheel, { passive: true });
        }

        // 清理函数
        return () => {
            // 恢复原始方法
            boardInstance.pointerMove = originalPointerMove;
            boardInstance.pointerDown = originalPointerDown;
            boardInstance.pointerUp = originalPointerUp;

            // 移除 wheel 事件
            if (host) {
                host.removeEventListener('wheel', handleWheel);
            }

            // 清除计时器和 RAF
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
            }
            if (zoomTimeoutRef.current !== null) {
                clearTimeout(zoomTimeoutRef.current);
            }
        };
    }, [board, checkInteraction, scheduleRecovery, immediate, recoveryDelay]);

    // 供外部调用的方法
    const notifyInteractionStart = useCallback(() => {
        isActiveRef.current = true;
        setIsInteracting(true);
        const viewportIntersectingSetter = (boardRef.current as any).__setViewportIntersecting;
        if (viewportIntersectingSetter) {
            viewportIntersectingSetter(true);
        }
    }, []);

    const notifyInteractionEnd = useCallback(() => {
        scheduleRecovery();
    }, [scheduleRecovery]);

    return {
        isInteracting,
        isDragging: isDraggingState,
        isMoving: isMovingState,
        isZooming: isZoomingState,
        refresh,
        notifyInteractionStart,
        notifyInteractionEnd
    };
};
