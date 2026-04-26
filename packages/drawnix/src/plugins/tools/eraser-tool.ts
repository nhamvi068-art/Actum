/**
 * 橡皮擦工具插件 (Eraser Tool)
 *
 * 核心链路：
 * 1. pointerDown → 开始擦除模式
 * 2. pointerMove → 遍历所有元素，通过碰撞检测命中则标记删除
 * 3. pointerUp → 删除所有被标记的元素
 *
 * 特点：
 * - 元素级擦除（命中整个元素即删除）
 * - 使用 LaserPointer 类渲染擦除轨迹
 * - 使用 throttleRAF 节流碰撞检测
 */

import {
  PlaitBoard,
  PlaitElement,
  Point,
  throttleRAF,
  toHostPoint,
  toViewBoxPoint,
} from '@plait/core';
import { isDrawingMode } from '@plait/common';
import { isHitFreehand } from './utils';
import { Freehand, FreehandShape } from './type';
import { CoreTransforms } from '@plait/core';
import { LaserPointer } from '../../utils/laser-pointer';
import { isTwoFingerMode } from '@plait-board/react-board';

export interface EraserToolOptions {
  /** 擦除轨迹颜色 */
  trailColor?: string;
  /** 擦除轨迹宽度 */
  trailWidth?: number;
  /** 擦除轨迹最大宽度 */
  trailMaxWidth?: number;
  /** 轨迹透明度 */
  trailOpacity?: number;
  /** 轨迹延迟（毫秒） */
  trailDelay?: number;
}

const DEFAULT_ERASER_OPTIONS: Required<EraserToolOptions> = {
  trailColor: '211, 211, 211',
  trailWidth: 10,
  trailMaxWidth: 10,
  trailOpacity: 0.6,
  trailDelay: 180,
};

/**
 * 创建橡皮擦工具插件
 */
export function createEraserToolPlugin(options: EraserToolOptions = {}) {
  const opts = { ...DEFAULT_ERASER_OPTIONS, ...options };

  return (board: PlaitBoard): PlaitBoard => {
    const { pointerDown, pointerMove, pointerUp, globalPointerUp, touchStart } = board;

    // 擦除状态
    let isErasing = false;
    const elementsToDelete = new Set<string>();

    // 激光指针实例（用于渲染擦除轨迹）
    let laserPointer: LaserPointer | null = null;

    /**
     * 检查是否是橡皮擦指针
     */
    const isEraserPointer = (): boolean => {
      return PlaitBoard.isInPointer(board, [FreehandShape.eraser]);
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
     * 检测并标记需要删除的元素
     */
    const checkAndMarkElementsForDeletion = (point: Point) => {
      const viewBoxPoint = toCanvasPoint(point);

      // 获取所有手绘元素
      const freehandElements = board.children.filter(
        (element) => Freehand.isFreehand(element)
      ) as Freehand[];

      // 遍历检测碰撞
      freehandElements.forEach((element) => {
        // 跳过已标记的元素
        if (elementsToDelete.has(element.id)) return;

        // 碰撞检测
        if (isHitFreehand(board, element, viewBoxPoint)) {
          // 标记为半透明（视觉反馈）
          const g = PlaitElement.getElementG(element);
          if (g) {
            g.style.opacity = '0.2';
          }
          elementsToDelete.add(element.id);
        }
      });
    };

    /**
     * 删除所有被标记的元素
     */
    const deleteMarkedElements = () => {
      if (elementsToDelete.size === 0) return;

      const elementsToRemove = board.children.filter((element) =>
        elementsToDelete.has(element.id)
      );

      if (elementsToRemove.length > 0) {
        // 使用 CoreTransforms 删除元素
        CoreTransforms.removeElements(board, elementsToRemove);
      }
    };

    /**
     * 初始化激光指针
     */
    const initLaserPointer = () => {
      laserPointer = new LaserPointer();
      laserPointer.init(board);
    };

    /**
     * 销毁激光指针
     */
    const destroyLaserPointer = () => {
      if (laserPointer) {
        laserPointer.destroy();
        laserPointer = null;
      }
    };

    /**
     * 完成擦除
     */
    const complete = () => {
      if (!isErasing) return;

      // 删除标记的元素
      deleteMarkedElements();

      // 销毁激光指针
      destroyLaserPointer();

      // 重置状态
      isErasing = false;
      elementsToDelete.clear();
    };

    /**
     * 开始擦除
     */
    const startErasing = (event: PointerEvent): boolean => {
      if (!isEraserPointer()) return false;

      isErasing = true;
      elementsToDelete.clear();

      // 初始化激光指针
      initLaserPointer();

      // 检测第一个点的碰撞
      const currentPoint: Point = [event.x, event.y];
      checkAndMarkElementsForDeletion(currentPoint);

      return true;
    };

    /**
     * 继续擦除（移动）
     */
    const continueErasing = (event: PointerEvent): boolean => {
      if (!isErasing || isTwoFingerMode(board)) {
        if (isTwoFingerMode(board) && isErasing) {
          complete();
        }
        return false;
      }

      // 使用 throttleRAF 节流
      throttleRAF(board, 'eraser-collision-check', () => {
        const currentPoint: Point = [event.x, event.y];
        checkAndMarkElementsForDeletion(currentPoint);
      });

      return true;
    };

    // ==================== 事件拦截 ====================

    board.touchStart = (event: TouchEvent) => {
      if (isEraserPointer() && isDrawingMode(board)) {
        event.preventDefault();
        return;
      }
      touchStart(event);
    };

    board.pointerDown = (event: PointerEvent) => {
      if (startErasing(event)) {
        return;
      }
      pointerDown(event);
    };

    board.pointerMove = (event: PointerEvent) => {
      if (continueErasing(event)) {
        return;
      }
      pointerMove(event);
    };

    board.pointerUp = (event: PointerEvent) => {
      if (isErasing) {
        complete();
        return;
      }
      pointerUp(event);
    };

    board.globalPointerUp = (event: PointerEvent) => {
      if (isErasing) {
        complete();
      }
      globalPointerUp(event);
    };

    return board;
  };
}

/**
 * 兼容旧版本的导出（向后兼容）
 */
export const withFreehandErase = createEraserToolPlugin();
