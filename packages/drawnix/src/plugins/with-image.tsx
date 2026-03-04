import {
  getElementOfFocusedImage,
  isResizing,
  type PlaitImageBoard,
} from '@plait/common';
import {
  ClipboardData,
  getHitElementByPoint,
  isDragging,
  isSelectionMoving,
  PlaitBoard,
  Point,
  toHostPoint,
  toViewBoxPoint,
  WritableClipboardOperationType,
} from '@plait/core';
import { isSupportedImageFileType } from '../data/blob';
import { insertImage } from '../data/image';
import { isHitImage, MindElement, ImageData } from '@plait/mind';
import { ImageViewer } from '../libs/image-viewer';

export const withImagePlugin = (board: PlaitBoard) => {
  const newBoard = board as PlaitBoard & PlaitImageBoard;
  const { insertFragment, drop, pointerUp } = newBoard;
  const viewer = new ImageViewer({
    zoomStep: 0.3,
    minZoom: 0.1,
    maxZoom: 5,
    enableKeyboard: true,
  });

  newBoard.insertFragment = (
    clipboardData: ClipboardData | null,
    targetPoint: Point,
    operationType?: WritableClipboardOperationType
  ) => {
    if (
      clipboardData?.files?.length &&
      isSupportedImageFileType(clipboardData.files[0].type)
    ) {
      const imageFile = clipboardData.files[0];
      insertImage(board, imageFile, targetPoint, false);
      return;
    }
    insertFragment(clipboardData, targetPoint, operationType);
  };

  newBoard.drop = async (event: DragEvent) => {
    if (event.dataTransfer?.files?.length) {
      const imageFiles = Array.from(event.dataTransfer.files).filter((file) =>
        isSupportedImageFileType(file.type)
      );
      if (imageFiles.length > 0) {
        const basePoint = toViewBoxPoint(
          board,
          toHostPoint(board, event.x, event.y)
        );
        // 递归插入每张图片，带有偏移量避免重叠
        const offsetGap = 30;
        const insertNext = async (index: number) => {
          if (index >= imageFiles.length) {
            return;
          }
          const point: Point = [
            basePoint[0] + index * offsetGap,
            basePoint[1] + index * offsetGap,
          ];
          await insertImage(board, imageFiles[index], point, true);
          // 递归插入下一张
          await insertNext(index + 1);
        };
        await insertNext(0);
        return true;
      }
    }
    return drop(event);
  };

  newBoard.pointerUp = (event: PointerEvent) => {
    const focusMindNode = getElementOfFocusedImage(board);
    if (
      focusMindNode &&
      !isResizing(board) &&
      !isSelectionMoving(board) &&
      !isDragging(board)
    ) {
      const point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y));
      const hitElement = getHitElementByPoint(board, point);
      const isHittingImage =
        hitElement &&
        MindElement.isMindElement(board, hitElement) &&
        MindElement.hasImage(hitElement) &&
        isHitImage(board, hitElement as MindElement<ImageData>, point);
      if (isHittingImage && focusMindNode === hitElement) {
        viewer.open(hitElement.data.image.url);
      }
    }
    pointerUp(event);
  };

  return newBoard;
};
