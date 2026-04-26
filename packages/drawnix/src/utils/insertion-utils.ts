/**
 * 插入位置计算工具
 *
 * 通过当前画布选中的元素包围盒（Bounding Box），计算出新占位图的插入坐标，防止重叠。
 *
 * 核心设计：
 * 1. 优先基于选中元素计算插入点
 * 2. 其次基于所有画布元素计算
 * 3. 最终回退到视口中心
 *
 * 【上下文感知插入逻辑】
 * - 如果有选中元素：新占位符插入在选中元素群的下方
 * - 如果有画布内容：新占位符插入在内容区域的右下角
 * - 如果画布为空：新占位符插入在视口中心
 */

import { PlaitBoard, PlaitElement } from '@plait/core';
import { getRectangleByElements, RectangleClient } from '@plait/core';
import { DEFAULT_INSERTION_OFFSET, PLACEHOLDER_VIEWPORT_MARGIN } from '../constants/size-constants';

/** 插入点坐标接口 */
export interface InsertionPoint {
  x: number;
  y: number;
}

/** 元素边界接口 */
interface ElementBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 计算元素的包围盒
 * @param board 画板实例
 * @param elements 元素数组
 * @returns 包围盒边界
 */
function calculateElementBounds(board: PlaitBoard, elements: PlaitElement[]): ElementBounds | null {
  if (!elements || elements.length === 0) {
    return null;
  }

  const rectangle = getRectangleByElements(board, elements, false);
  if (!rectangle) {
    return null;
  }

  const { x, y, width, height } = rectangle;
  return {
    minX: x,
    minY: y,
    maxX: x + width,
    maxY: y + height,
  };
}

/**
 * 计算占位符插入点
 *
 * 【插入优先级】
 * 1. 如果有选中元素：插入在选中元素群的下方
 * 2. 如果画布有内容：插入在内容区域的右下角
 * 3. 默认：插入在视口中心
 *
 * @param board 画板实例
 * @param selectedIds 当前选中的元素 ID 数组
 * @param offset 插入偏移量（元素之间的间距），默认 20
 * @returns 插入点坐标
 */
export function calculateInsertionPoint(
  board: PlaitBoard,
  selectedIds: string[],
  offset: number = DEFAULT_INSERTION_OFFSET
): InsertionPoint {
  // 1. 如果有选中元素，基于选中元素计算
  if (selectedIds && selectedIds.length > 0) {
    const selectedElements = board.children.filter(el => selectedIds.includes(el.id));
    if (selectedElements.length > 0) {
      const bounds = calculateElementBounds(board, selectedElements);
      if (bounds) {
        // 在选中元素群组的下方插入（水平对齐左侧，垂直方向下移偏移量）
        return {
          x: bounds.minX,
          y: bounds.maxY + offset,
        };
      }
    }
  }

  // 2. 如果画布有内容，基于所有元素计算
  if (board.children.length > 0) {
    const bounds = calculateElementBounds(board, board.children);
    if (bounds) {
      // 在内容区域右下角插入
      return {
        x: bounds.maxX + offset,
        y: bounds.minY,
      };
    }
  }

  // 3. 默认：视口中心
  return getViewportCenter(board);
}

/**
 * 计算确保在视口内的插入点
 * 如果计算的插入点超出视口范围，自动调整到视口内
 *
 * @param board 画板实例
 * @param insertionPoint 原始插入点
 * @param placeholderWidth 占位符宽度
 * @param placeholderHeight 占位符高度
 * @param margin 视口边缘间距
 * @returns 调整后的插入点
 */
export function clampInsertionPointToViewport(
  board: PlaitBoard,
  insertionPoint: InsertionPoint,
  placeholderWidth: number,
  placeholderHeight: number,
  margin: number = PLACEHOLDER_VIEWPORT_MARGIN
): InsertionPoint {
  const viewport = board.viewport;
  const zoom = viewport.zoom || 1;

  // 视口左上角坐标（画布坐标）
  const viewportLeft = viewport.origination?.[0] || 0;
  const viewportTop = viewport.origination?.[1] || 0;

  // 视口尺寸（画布坐标）
  const viewportWidth = PlaitBoard.getBoardContainer(board).clientWidth / zoom;
  const viewportHeight = PlaitBoard.getBoardContainer(board).clientHeight / zoom;

  // 计算视口右下角
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;

  // 确保占位符完全在视口内
  let x = insertionPoint.x;
  let y = insertionPoint.y;

  // 水平方向调整
  if (x + placeholderWidth > viewportRight - margin) {
    x = Math.max(viewportLeft + margin, viewportRight - placeholderWidth - margin);
  }
  if (x < viewportLeft + margin) {
    x = viewportLeft + margin;
  }

  // 垂直方向调整
  if (y + placeholderHeight > viewportBottom - margin) {
    y = Math.max(viewportTop + margin, viewportBottom - placeholderHeight - margin);
  }
  if (y < viewportTop + margin) {
    y = viewportTop + margin;
  }

  return { x, y };
}

/**
 * 获取视口中心点（画布坐标）
 */
export function getViewportCenter(board: PlaitBoard): InsertionPoint {
  const viewport = board.viewport;
  const zoom = viewport.zoom || 1;

  const viewportWidth = PlaitBoard.getBoardContainer(board).clientWidth;
  const viewportHeight = PlaitBoard.getBoardContainer(board).clientHeight;

  const origX = viewport.origination?.[0] || 0;
  const origY = viewport.origination?.[1] || 0;

  return {
    x: origX + viewportWidth / 2 / zoom,
    y: origY + viewportHeight / 2 / zoom,
  };
}

/**
 * 检查指定位置是否与其他元素重叠
 *
 * @param board 画板实例
 * @param x 插入点 X 坐标
 * @param y 插入点 Y 坐标
 * @param width 占位符宽度
 * @param height 占位符高度
 * @param margin 重叠检测边距（默认 20）
 * @param excludeIds 需要排除检测的元素 ID（用于排除自己）
 * @returns 是否重叠
 */
export function isPositionOccupied(
  board: PlaitBoard,
  x: number,
  y: number,
  width: number,
  height: number,
  margin: number = 20,
  excludeIds: string[] = []
): boolean {
  const newRect = { x, y, width, height };

  for (const element of board.children) {
    // 排除指定的元素
    if (excludeIds.includes(element.id)) {
      continue;
    }

    const rect = board.getRectangle(element);
    if (!rect) continue;

    const { x: elX, y: elY, width: elWidth, height: elHeight } = rect;

    // 矩形碰撞检测（带边距）
    if (
      newRect.x < elX + elWidth + margin &&
      newRect.x + newRect.width + margin > elX &&
      newRect.y < elY + elHeight + margin &&
      newRect.y + newRect.height + margin > elY
    ) {
      return true;
    }
  }

  return false;
}

/**
 * 在视口内寻找空白位置（从给定位置向外螺旋搜索最近的空白位置）
 *
 * @param board 画板实例
 * @param width 占位符宽度
 * @param height 占位符高度
 * @param startX 起始搜索位置 X
 * @param startY 起始搜索位置 Y
 * @returns 找到的空白位置，如果找不到则返回起始位置
 */
export function findEmptyPosition(
  board: PlaitBoard,
  width: number,
  height: number,
  startX: number,
  startY: number
): InsertionPoint {
  const viewport = board.viewport;
  const zoom = viewport.zoom || 1;

  // 视口尺寸（画布坐标）
  const viewportWidth = PlaitBoard.getBoardContainer(board).clientWidth / zoom;
  const viewportHeight = PlaitBoard.getBoardContainer(board).clientHeight / zoom;

  const viewportLeft = viewport.origination?.[0] || 0;
  const viewportTop = viewport.origination?.[1] || 0;
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;

  // 搜索步长
  const step = Math.max(width, height) * 1.5;

  // 最大搜索半径（步长的倍数）
  const maxRadius = 10;

  // 首先检查起始位置是否可用
  if (!isPositionOccupied(board, startX, startY, width, height)) {
    return { x: startX, y: startY };
  }

  // 从中心向外螺旋搜索
  for (let radius = 1; radius <= maxRadius; radius++) {
    // 检查四个方向的点
    const checkPoints = [
      { x: startX + radius * step, y: startY },                    // 右
      { x: startX - radius * step, y: startY },                    // 左
      { x: startX, y: startY + radius * step },                    // 下
      { x: startX, y: startY - radius * step },                    // 上
      { x: startX + radius * step, y: startY + radius * step },    // 右下
      { x: startX - radius * step, y: startY + radius * step },    // 左下
      { x: startX + radius * step, y: startY - radius * step },    // 右上
      { x: startX - radius * step, y: startY - radius * step },    // 左上
    ];

    for (const point of checkPoints) {
      // 检查是否在视口范围内
      if (
        point.x >= viewportLeft &&
        point.x <= viewportRight - width &&
        point.y >= viewportTop &&
        point.y <= viewportBottom - height
      ) {
        if (!isPositionOccupied(board, point.x, point.y, width, height)) {
          return { x: point.x, y: point.y };
        }
      }
    }
  }

  // 如果找不到空白位置，返回起始位置
  return { x: startX, y: startY };
}
