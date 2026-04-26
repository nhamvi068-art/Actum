/**
 * 工具插件基类 - 统一的事件拦截架构
 *
 * 参考 Aitu/Excalidraw 的插件模式：
 * 1. 所有工具都通过高阶函数包装 board 的 pointerDown/pointerMove/pointerUp
 * 2. 工具只负责修改数据，不直接操作视图
 * 3. 通过 Transforms API 操作数据树，驱动 React/SVG 重新渲染
 */

import { PlaitBoard, Point, toViewBoxPoint, toHostPoint } from '@plait/core';

export interface ToolEvent {
  point: Point;           // 屏幕坐标
  viewBoxPoint: Point;    // 画布坐标（viewBox）
  event: PointerEvent;    // 原始事件
  timestamp: number;      // 时间戳
}

export interface ToolContext {
  board: PlaitBoard;
  isActive: boolean;      // 工具是否激活
  isDrawing: boolean;     // 是否正在绘制
  points: Point[];        // 当前采集的点
  startTime: number;      // 开始时间
}

export interface ToolCallbacks {
  onActivate?: (ctx: ToolContext) => void;
  onDeactivate?: (ctx: ToolContext) => void;
  onPointerDown?: (ctx: ToolContext, event: ToolEvent) => boolean | void;  // 返回 true 表示消费事件
  onPointerMove?: (ctx: ToolContext, event: ToolEvent) => boolean | void;   // 返回 true 表示消费事件
  onPointerUp?: (ctx: ToolContext, event: ToolEvent) => boolean | void;    // 返回 true 表示消费事件
  onDblClick?: (ctx: ToolContext, event: ToolEvent) => boolean | void;      // 返回 true 表示消费事件
}

export type ToolModeChecker = (board: PlaitBoard) => boolean;

export interface BaseToolOptions {
  /** 工具模式检测函数 */
  isToolActive: ToolModeChecker;
  /** 工具名称（用于调试） */
  name?: string;
  /** 是否阻止默认的 touch 事件 */
  preventTouch?: boolean;
  /** 触摸笔指针类型检测 */
  touchPointerType?: string;
}

export const DEFAULT_TOOL_OPTIONS: Required<BaseToolOptions> = {
  isToolActive: () => false,
  name: 'BaseTool',
  preventTouch: true,
  touchPointerType: 'pen',
};

/**
 * 工具插件工厂函数 - 创建标准化的工具插件
 */
export function createToolPlugin(options: BaseToolOptions, callbacks: ToolCallbacks) {
  const opts = { ...DEFAULT_TOOL_OPTIONS, ...options };
  const { isToolActive, name, preventTouch, touchPointerType } = opts;

  return (board: PlaitBoard): PlaitBoard => {
    // 保存原始事件处理函数
    const originalPointerDown = board.pointerDown;
    const originalPointerMove = board.pointerMove;
    const originalPointerUp = board.pointerUp;
    const originalTouchStart = board.touchStart;

    // 工具上下文
    const ctx: ToolContext = {
      board,
      isActive: false,
      isDrawing: false,
      points: [],
      startTime: 0,
    };

    /**
     * 将屏幕坐标转换为画布坐标
     */
    const getViewBoxPoint = (screenPoint: Point): Point => {
      return toViewBoxPoint(
        board,
        toHostPoint(board, screenPoint[0], screenPoint[1])
      );
    };

    /**
     * 创建统一的工具事件对象
     */
    const createToolEvent = (event: PointerEvent): ToolEvent => {
      const point: Point = [event.x, event.y];
      return {
        point,
        viewBoxPoint: getViewBoxPoint(point),
        event,
        timestamp: Date.now(),
      };
    };

    /**
     * 检查是否是指定类型的触摸笔
     */
    const isSpecificPen = (event: PointerEvent): boolean => {
      return touchPointerType
        ? event.pointerType === touchPointerType
        : event.pointerType === 'pen';
    };

    // 包装 touchStart
    board.touchStart = (event: TouchEvent) => {
      if (preventTouch && isToolActive(board) && isSpecificPen(event as any)) {
        event.preventDefault();
        return;
      }
      originalTouchStart(event);
    };

    // 包装 pointerDown
    board.pointerDown = (event: PointerEvent) => {
      if (isToolActive(board)) {
        if (!ctx.isActive) {
          ctx.isActive = true;
          ctx.points = [];
          ctx.startTime = Date.now();
          callbacks.onActivate?.(ctx);
        }

        const toolEvent = createToolEvent(event);
        const consumed = callbacks.onPointerDown?.(ctx, toolEvent);

        if (consumed) {
          event.preventDefault();
          return;
        }
      }
      originalPointerDown(event);
    };

    // 包装 pointerMove
    board.pointerMove = (event: PointerEvent) => {
      if (isToolActive(board) && ctx.isDrawing) {
        const toolEvent = createToolEvent(event);
        const consumed = callbacks.onPointerMove?.(ctx, toolEvent);

        if (consumed) {
          event.preventDefault();
          return;
        }
      }
      originalPointerMove(event);
    };

    // 包装 pointerUp
    board.pointerUp = (event: PointerEvent) => {
      if (isToolActive(board) && ctx.isDrawing) {
        const toolEvent = createToolEvent(event);
        const consumed = callbacks.onPointerUp?.(ctx, toolEvent);

        if (consumed) {
          event.preventDefault();
          return;
        }
      }
      originalPointerUp(event);
    };

    // 包装 globalPointerUp（用于处理意外中断）
    const originalGlobalPointerUp = board.globalPointerUp;
    board.globalPointerUp = (event: PointerEvent) => {
      if (isToolActive(board) && ctx.isDrawing) {
        ctx.isDrawing = false;
        callbacks.onDeactivate?.(ctx);
      }
      originalGlobalPointerUp(event);
    };

    return board;
  };
}

/**
 * 检测两点之间的距离
 */
export function distanceBetweenPoints(p1: Point, p2: Point): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 节流函数工厂
 */
export function createThrottleRAF(board: PlaitBoard, key: string, fn: () => void): void {
  const RAF_MAP = (board as any).__rafMap || new Map();
  (board as any).__rafMap = RAF_MAP;

  if (RAF_MAP.has(key)) {
    cancelAnimationFrame(RAF_MAP.get(key));
  }

  const id = requestAnimationFrame(() => {
    fn();
    RAF_MAP.delete(key);
  });

  RAF_MAP.set(key, id);
}

/**
 * 简易的点数组平滑算法（均值滤波）
 */
export function simpleSmooth(points: Point[], windowSize: number = 3): Point[] {
  if (points.length < windowSize) return points;

  const result: Point[] = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < points.length; i++) {
    if (i < half || i >= points.length - half) {
      result.push([...points[i]]);
    } else {
      let sumX = 0, sumY = 0;
      for (let j = -half; j <= half; j++) {
        sumX += points[i + j][0];
        sumY += points[i + j][1];
      }
      result.push([sumX / windowSize, sumY / windowSize]);
    }
  }

  return result;
}
