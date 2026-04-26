import {
  PlaitBoard,
  Transforms,
  getRectangleByElements,
  PlaitElement,
  Point,
  RectangleClient,
} from '@plait/core';

/**
 * 对齐类型枚举
 */
export type AlignType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * 将多个选中元素按指定方式对齐
 * @param board 画布实例
 * @param alignType 对齐类型
 */
export function alignElements(board: PlaitBoard, alignType: AlignType): void {
  const elements = board.getSelectedElements();

  if (elements.length < 2) {
    return;
  }

  // 1. 获取所有选中元素的整体外部包围盒作为基准
  const overallRect = getRectangleByElements(board, elements, false);

  // 2. 遍历元素计算偏移量并派发更新
  elements.forEach((element) => {
    const elementRect = board.getRectangle(element);
    let dx = 0;
    let dy = 0;

    // 计算差值
    switch (alignType) {
      case 'left':
        dx = overallRect.x - elementRect.x;
        break;
      case 'center':
        dx = (overallRect.x + overallRect.width / 2) - (elementRect.x + elementRect.width / 2);
        break;
      case 'right':
        dx = (overallRect.x + overallRect.width) - (elementRect.x + elementRect.width);
        break;
      case 'top':
        dy = overallRect.y - elementRect.y;
        break;
      case 'middle':
        dy = (overallRect.y + overallRect.height / 2) - (elementRect.y + elementRect.height / 2);
        break;
      case 'bottom':
        dy = (overallRect.y + overallRect.height) - (elementRect.y + elementRect.height);
        break;
    }

    if (dx === 0 && dy === 0) {
      return; // 无需移动
    }

    // 3. 核心：通过 Path 找到节点并派发移动坐标的 Transform 指令
    const path = PlaitBoard.findPath(board, element);

    // 计算新的 points
    const newPoints: [Point, Point] = [
      [element.points[0][0] + dx, element.points[0][1] + dy],
      [element.points[1][0] + dx, element.points[1][1] + dy],
    ];

    // 使用 Transforms.setNode 派发更新
    Transforms.setNode(board, { points: newPoints }, path);
  });
}
