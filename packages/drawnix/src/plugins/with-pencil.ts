import { isPencilEvent, PlaitBoard, PlaitPointerType } from '@plait/core';
import { DrawnixState } from '../hooks/use-drawnix';
import { FreehandShape } from './freehand/type';

const IS_PENCIL_MODE = new WeakMap<PlaitBoard, boolean>();

export const isPencilMode = (board: PlaitBoard) => {
  return !!IS_PENCIL_MODE.get(board);
};

export const setIsPencilMode = (board: PlaitBoard, isPencilMode: boolean) => {
  IS_PENCIL_MODE.set(board, isPencilMode);
};

export const buildPencilPlugin = (
  updateAppState: (appState: Partial<DrawnixState>) => void
) => {
  const withPencil = (board: PlaitBoard) => {
    const { pointerDown } = board;

    board.pointerDown = (event: PointerEvent) => {
      // 手写笔事件：进入画笔模式并阻断鼠标触摸事件
      if (isPencilEvent(event) && !isPencilMode(board)) {
        setIsPencilMode(board, true);
        updateAppState({ isPencilMode: true });
        return;
      }
      // 如果当前是自由笔指针类型（feltTipPen 等），允许事件继续传播到 withFreehandCreate
      // 这样鼠标/触摸也能正常绘制
      const isFreehandPointer = Object.values(FreehandShape).includes(board.pointer as FreehandShape);
      if (isFreehandPointer && isPencilMode(board) && !isPencilEvent(event)) {
        // 不阻断，让事件继续传播到 withFreehandCreate 处理绘制
      }
      pointerDown(event);
    };

    return board;
  };
  return withPencil;
};
