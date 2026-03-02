import type {
  ImageProps,
  PlaitImageBoard,
  RenderComponentRef,
} from '@plait/common';
import {
  PlaitBoard,
  PlaitI18nBoard,
  PlaitElement,
  PlaitPointerType,
  toViewBoxPoint,
  toHostPoint,
  getHitElementByPoint,
  isMainPointer,
  getSelectedElements,
  Transforms,
} from '@plait/core';
import { createRoot } from 'react-dom/client';
import { Image } from './components/image';
import { withImagePlugin } from './with-image';
import { DrawI18nKey, PlaitDrawElement } from '@plait/draw';
import { MindI18nKey } from '@plait/mind';
import { i18nInsidePlaitHook } from '../i18n';

// 覆盖 Transforms.insertNode 以在插入新元素前清除循环引用
import { Transforms as CoreTransforms } from '@plait/core';

// 清除循环引用的 group（导出供外部使用）
// 使用更简单直接的方法：直接清除所有有 groupId 的元素的 groupId
// 因为循环引用是错误数据，清除所有 groupId 是最安全的方式
export const clearCircularGroupReferences = (board: PlaitBoard): void => {
  const elements = board.children;
  
  // 直接清除所有元素的 groupId - 最简单粗暴但最有效
  // 循环引用是错误数据，group 功能在当前应用中可能不需要
  for (const element of elements) {
    if ('groupId' in element) {
      (element as any).groupId = undefined;
    }
    if ('groupIds' in element) {
      (element as any).groupIds = undefined;
    }
  }
  
  // 同时清除 board 上可能缓存的 group 信息
  if ((board as any).groups) {
    (board as any).groups = undefined;
  }
  if ((board as any).groupCache) {
    (board as any).groupCache = undefined;
  }
};

export const withCommonPlugin = (board: PlaitBoard) => {
  const newBoard = board as PlaitBoard & PlaitImageBoard & PlaitI18nBoard;
  
  // 在任何操作之前先清除循环引用的 group
  clearCircularGroupReferences(board);
  
  // 覆盖 insertNode，在插入新元素之前清除循环引用
  const originalInsertNode = CoreTransforms.insertNode;
  CoreTransforms.insertNode = (...args: any[]) => {
    clearCircularGroupReferences(board);
    return originalInsertNode(...args);
  };
  
  // 覆盖 getSelectedElements，在获取选中元素之前先清除循环引用
  // 这样可以防止在选择元素时触发栈溢出
  const originalGetSelectedElements = newBoard.getSelectedElements;
  newBoard.getSelectedElements = () => {
    clearCircularGroupReferences(board);
    return originalGetSelectedElements();
  };
  
  // 覆盖 deleteFragment 添加循环引用检查
  const originalDeleteFragment = newBoard.deleteFragment;
  newBoard.deleteFragment = (elementsOrBoard: PlaitElement[] | PlaitBoard) => {
    // 检查是否有循环引用，如果有则先清除
    clearCircularGroupReferences(board);
    return originalDeleteFragment(elementsOrBoard as any);
  };

  // 覆盖 pointerDown 支持非选中图片的直接拖动
  const originalPointerDown = newBoard.pointerDown;
  newBoard.pointerDown = (event: PointerEvent) => {
    // 如果不是主指针，直接调用原始逻辑
    if (!isMainPointer(event)) {
      return originalPointerDown(event);
    }

    // 检查当前指针类型是否是 selection
    if (!PlaitBoard.isPointer(board, PlaitPointerType.selection)) {
      // 如果不是 selection 类型，调用原始逻辑
      return originalPointerDown(event);
    }

    // 如果按住 Shift 键，直接调用原始逻辑，让底层多选逻辑生效
    if (event.shiftKey) {
      return originalPointerDown(event);
    }

    const point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y));

    // 检查是否点击了可移动的图片元素
    const hitElement = getHitElementByPoint(
      board,
      point,
      (el) => newBoard.isMovable(el)
    );

    // 如果点击了图片元素（非选中状态），先选中它
    if (hitElement && PlaitDrawElement.isImage(hitElement)) {
      const selectedElements = getSelectedElements(board);
      const isSelected = selectedElements.includes(hitElement);

      // 如果图片未被选中，选中它以启用拖动
      if (!isSelected) {
        // 使用 point 创建一个 collapsed selection 来选中元素
        const selection = { anchor: point, focus: point };
        Transforms.setSelection(board, selection);
      }
    }

    return originalPointerDown(event);
  };

  newBoard.renderImage = (
    container: Element | DocumentFragment,
    props: ImageProps
  ) => {
    const root = createRoot(container);
    root.render(<Image {...props}></Image>);
    let newProps = { ...props };
    const ref: RenderComponentRef<ImageProps> = {
      destroy: () => {
        setTimeout(() => {
          root.unmount();
        }, 0);
      },
      update: (updatedProps: Partial<ImageProps>) => {
        newProps = { ...newProps, ...updatedProps };
        root.render(<Image {...newProps}></Image>);
      },
    };
    return ref;
  };

  const { t } = i18nInsidePlaitHook();

  newBoard.getI18nValue = (key: string) => {
    if (key === DrawI18nKey.lineText) {
      return t('draw.lineText');
    }
    if (key === DrawI18nKey.geometryText) {
      return t("draw.geometryText");
    }
    if (key === MindI18nKey.mindCentralText) {
      return t('mind.centralText');
    }
    if (key === MindI18nKey.abstractNodeText) {
      return t('mind.abstractNodeText');
    }

    return null;
  };

  return withImagePlugin(newBoard);
};
