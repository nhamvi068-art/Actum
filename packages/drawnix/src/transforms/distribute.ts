import {
  PlaitBoard,
  Transforms,
  PlaitElement,
  Point,
  RectangleClient,
} from '@plait/core';

/**
 * 分布方向枚举
 */
export type DistributeDirection = 'horizontal' | 'vertical';

/**
 * 将多个选中元素等距分布
 * @param board 画布实例
 * @param direction 分布方向：horizontal（水平）或 vertical（垂直）
 * @returns 是否成功执行分布操作
 */
export function distributeElements(board: PlaitBoard, direction: DistributeDirection): boolean {
  const elements = board.getSelectedElements();

  // 至少需要 3 个元素才能进行等距分布
  if (elements.length < 3) {
    return false;
  }

  // 获取所有元素的矩形信息并排序
  const elementsWithRect = elements
    .map((element) => {
      const rect = board.getRectangle(element);
      if (!rect) return null;
      return { element, rect };
    })
    .filter((item): item is { element: PlaitElement; rect: RectangleClient } => item !== null);

  if (direction === 'horizontal') {
    // 水平分布：按 X 坐标升序排序
    elementsWithRect.sort((a, b) => a.rect.x - b.rect.x);

    const firstRect = elementsWithRect[0].rect;
    const lastRect = elementsWithRect[elementsWithRect.length - 1].rect;

    // 计算总跨度（最左到最右）
    const totalSpan = lastRect.x + lastRect.width - firstRect.x;
    // 计算所有元素宽度总和
    const totalWidth = elementsWithRect.reduce((sum, item) => sum + item.rect.width, 0);
    // 计算平均间距
    const gap = (totalSpan - totalWidth) / (elementsWithRect.length - 1);

    // 累加计算每个元素的新 X 坐标
    let currentX = firstRect.x;

    elementsWithRect.forEach(({ element, rect }) => {
      const dx = currentX - rect.x;

      if (dx !== 0) {
        const path = PlaitBoard.findPath(board, element);
        const newPoints: [Point, Point] = [
          [element.points[0][0] + dx, element.points[0][1]],
          [element.points[1][0] + dx, element.points[1][1]],
        ];
        Transforms.setNode(board, { points: newPoints }, path);
      }

      // 累加下一个元素的起点
      currentX += rect.width + gap;
    });
  } else {
    // 垂直分布：按 Y 坐标升序排序
    elementsWithRect.sort((a, b) => a.rect.y - b.rect.y);

    const firstRect = elementsWithRect[0].rect;
    const lastRect = elementsWithRect[elementsWithRect.length - 1].rect;

    // 计算总跨度（最上到最下）
    const totalSpan = lastRect.y + lastRect.height - firstRect.y;
    // 计算所有元素高度总和
    const totalHeight = elementsWithRect.reduce((sum, item) => sum + item.rect.height, 0);
    // 计算平均间距
    const gap = (totalSpan - totalHeight) / (elementsWithRect.length - 1);

    // 累加计算每个元素的新 Y 坐标
    let currentY = firstRect.y;

    elementsWithRect.forEach(({ element, rect }) => {
      const dy = currentY - rect.y;

      if (dy !== 0) {
        const path = PlaitBoard.findPath(board, element);
        const newPoints: [Point, Point] = [
          [element.points[0][0], element.points[0][1] + dy],
          [element.points[1][0], element.points[1][1] + dy],
        ];
        Transforms.setNode(board, { points: newPoints }, path);
      }

      // 累加下一个元素的起点
      currentY += rect.height + gap;
    });
  }

  return true;
}
