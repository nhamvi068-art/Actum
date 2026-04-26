/**
 * 画笔工具插件 (Freehand Tool)
 *
 * 核心链路：
 * 1. pointerDown → 开始绘制，记录起点
 * 2. pointerMove → 节流采集坐标，使用平滑算法处理
 * 3. pointerUp → 将最终线条通过 Transforms.insertNode 落库
 *
 * 临时预览：
 * - 不走 React setState，直接操作 SVG DOM
 * - 使用 roughjs 生成手绘风格的临时路径
 */

import {
  PlaitBoard,
  Point,
  Transforms,
  distanceBetweenPointAndPoint,
  toHostPoint,
  toViewBoxPoint,
} from '@plait/core';
import { isDrawingMode } from '@plait/common';
import { createFreehandElement, getFreehandPointers } from './utils';
import { Freehand, FreehandShape } from './type';
import { FreehandGenerator } from './freehand.generator';
import { FreehandSmoother } from './smoother';
import { isTwoFingerMode } from '@plait-board/react-board';
import { ToolContext, ToolEvent } from './base-tool';

export interface FreehandToolOptions {
  /** 平滑算法参数 */
  smoothing?: number;
  /** 压力敏感度 */
  pressureSensitivity?: number;
  /** 最小采集距离 */
  minDistance?: number;
}

/**
 * 创建画笔工具插件
 */
export function createFreehandToolPlugin(options: FreehandToolOptions = {}) {
  const {
    smoothing = 0.7,
    pressureSensitivity = 0.6,
    minDistance = 8,
  } = options;

  return (board: PlaitBoard): PlaitBoard => {
    const { pointerDown, pointerMove, pointerUp, globalPointerUp, touchStart } = board;

    // 绘制状态
    let isDrawing = false;
    let isSnappingStartAndEnd = false;
    let points: Point[] = [];
    let originScreenPoint: Point | null = null;

    // 临时元素相关
    let temporaryElement: Freehand | null = null;
    let temporaryG: SVGGElement | null = null;

    // 平滑器实例
    const smoother = new FreehandSmoother({
      smoothing,
      pressureSensitivity,
      minDistance,
      samplingRate: 5,
    });

    // 临时 SVG 生成器
    const generator = new FreehandGenerator(board);

    /**
     * 获取当前指针类型
     */
    const getCurrentPointer = (): FreehandShape | null => {
      const freehandPointers = getFreehandPointers();
      if (PlaitBoard.isInPointer(board, freehandPointers)) {
        return PlaitBoard.getPointer(board) as FreehandShape;
      }
      return null;
    };

    /**
     * 检查是否是手绘指针
     */
    const isFreehandPointer = (): boolean => {
      return PlaitBoard.isInPointer(board, getFreehandPointers());
    };

    /**
     * 将屏幕坐标转换为画布坐标
     */
    const toCanvasPoint = (screenPoint: Point): Point => {
      return toViewBoxPoint(
        board,
        toHostPoint(board, screenPoint[0], screenPoint[1])
      );
    };

    /**
     * 销毁临时 SVG 元素
     */
    const destroyTemporaryElement = () => {
      if (temporaryG) {
        temporaryG.remove();
        temporaryG = null;
      }
      temporaryElement = null;
    };

    /**
     * 更新临时预览
     */
    const updateTemporaryPreview = () => {
      if (!points.length || !temporaryElement) return;

      // 销毁旧的临时元素
      destroyTemporaryElement();

      // 生成新的临时 SVG
      const topHost = PlaitBoard.getElementTopHost(board);
      temporaryG = generator.processDrawing(temporaryElement, topHost);
    };

    /**
     * 完成绘制
     */
    const complete = (cancel: boolean = false) => {
      if (!isDrawing) return;

      const pointer = getCurrentPointer();
      if (!pointer) return;

      // 如果是闭合形状，首尾相连
      if (isSnappingStartAndEnd && points.length > 1) {
        points.push(points[0]);
      }

      // 创建最终元素
      temporaryElement = createFreehandElement(board, pointer, points);

      // 销毁临时预览
      destroyTemporaryElement();

      // 非取消模式下，插入数据树（触发 React 重新渲染）
      if (!cancel && temporaryElement) {
        Transforms.insertNode(board, temporaryElement, [board.children.length]);
      }

      // 重置状态
      isDrawing = false;
      isSnappingStartAndEnd = false;
      points = [];
      smoother.reset();
      temporaryElement = null;
    };

    /**
     * 开始绘制
     */
    const startDrawing = (event: PointerEvent) => {
      if (!isFreehandPointer()) return false;

      isDrawing = true;
      originScreenPoint = [event.x, event.y];

      // 处理第一个点（平滑）
      const smoothingPoint = smoother.process(originScreenPoint) as Point;
      const point = toCanvasPoint(smoothingPoint);
      points.push(point);

      return true;
    };

    /**
     * 继续绘制（采集点）
     */
    const continueDrawing = (event: PointerEvent): boolean => {
      if (!isDrawing || isTwoFingerMode(board)) {
        if (isTwoFingerMode(board) && isDrawing) {
          complete(true);
        }
        return false;
      }

      const currentScreenPoint: Point = [event.x, event.y];

      // 检测是否需要闭合（起点终点距离很近）
      if (originScreenPoint) {
        const dist = distanceBetweenPointAndPoint(
          originScreenPoint[0],
          originScreenPoint[1],
          currentScreenPoint[0],
          currentScreenPoint[1]
        );
        isSnappingStartAndEnd = dist < minDistance;
      }

      // 平滑处理
      const smoothingPoint = smoother.process(currentScreenPoint);
      if (!smoothingPoint) return true; // 节流跳过

      // 转换为画布坐标
      const newPoint = toCanvasPoint(smoothingPoint);
      points.push(newPoint);

      // 创建临时元素并更新预览
      const pointer = getCurrentPointer();
      if (pointer) {
        temporaryElement = createFreehandElement(board, pointer, points);
        updateTemporaryPreview();
      }

      return true;
    };

    // ==================== 事件拦截 ====================

    board.touchStart = (event: TouchEvent) => {
      if (isFreehandPointer() && isDrawingMode(board)) {
        event.preventDefault();
        return;
      }
      touchStart(event);
    };

    board.pointerDown = (event: PointerEvent) => {
      if (startDrawing(event)) {
        return;
      }
      pointerDown(event);
    };

    board.pointerMove = (event: PointerEvent) => {
      if (continueDrawing(event)) {
        return;
      }
      pointerMove(event);
    };

    board.pointerUp = (event: PointerEvent) => {
      if (isDrawing) {
        complete();
        return;
      }
      pointerUp(event);
    };

    board.globalPointerUp = (event: PointerEvent) => {
      if (isDrawing) {
        complete(true);
      }
      globalPointerUp(event);
    };

    return board;
  };
}

/**
 * 兼容旧版本的导出（向后兼容）
 */
export const withFreehandCreate = createFreehandToolPlugin();
