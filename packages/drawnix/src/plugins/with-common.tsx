import type {
  ImageProps,
  PlaitImageBoard,
  RenderComponentRef,
} from '@plait/common';
import {
  PlaitBoard,
  PlaitI18nBoard,
  PlaitPointerType,
  PlaitElement,
  toViewBoxPoint,
  toHostPoint,
  getHitElementByPoint,
  isMainPointer,
  getSelectedElements,
  Transforms,
} from '@plait/core';
import { createRoot } from 'react-dom/client';
import { LazyImage } from './components/image';
import { withImagePlugin } from './with-image';
import { DrawI18nKey, PlaitDrawElement } from '@plait/draw';
import { MindI18nKey } from '@plait/mind';
import { i18nInsidePlaitHook } from '../i18n';
import { IS_RESIZING } from '@plait/common';
import { handleTextResize } from '../transforms/text-property';

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

  // 覆盖 getSelectedElements，在获取选中元素之前先清除循环引用
  // 这样可以防止在选择元素时触发栈溢出
  // 注意：getSelectedElements 是模块级函数，需要断言到 any 以兼容 board 接口
  (newBoard as any).getSelectedElements = () => {
    clearCircularGroupReferences(board);
    return getSelectedElements(board);
  };

  // 覆盖 deleteFragment 添加循环引用检查
  const originalDeleteFragment = newBoard.deleteFragment;
  newBoard.deleteFragment = (elementsOrBoard: any) => {
    // 检查是否有循环引用，如果有则先清除
    clearCircularGroupReferences(board);
    return originalDeleteFragment(elementsOrBoard);
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
    root.render(<LazyImage {...props}></LazyImage>);
    let newProps = { ...props };
    const ref: RenderComponentRef<ImageProps> = {
      destroy: () => {
        setTimeout(() => {
          root.unmount();
        }, 0);
      },
      update: (updatedProps: Partial<ImageProps>) => {
        newProps = { ...newProps, ...updatedProps };
        root.render(<LazyImage {...newProps}></LazyImage>);
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

  // 包装 globalPointerUp，在 resize 结束后对文本元素进行字号缩放
  const originalGlobalPointerUp = newBoard.globalPointerUp;
  newBoard.globalPointerUp = (event: PointerEvent) => {
    // 获取当前 resize 引用（在调用原始 globalPointerUp 之前获取）
    const resizeRef = IS_RESIZING.get(board);

    // 调用原始的 globalPointerUp
    originalGlobalPointerUp(event);

    // 如果存在 resize 引用且为单元素文本几何，则触发字号缩放
    if (resizeRef) {
      const element = resizeRef.element;
      // 判断是否为数组，若是则取第一个元素
      const targetElement = Array.isArray(element) ? element[0] : element;

      if (targetElement && PlaitDrawElement.isText(targetElement)) {
        // 获取旧的宽度（从 resizeRef.rectangle）
        const oldRectangle = resizeRef.rectangle;
        const oldWidth = oldRectangle ? oldRectangle.width : 0;

        if (oldWidth > 0) {
          // 获取元素当前的新宽度（从 element.points）
          const newWidth = targetElement.points[1][0] - targetElement.points[0][0];

          if (newWidth > 0 && newWidth !== oldWidth) {
            // 调用 handleTextResize 进行字号缩放
            handleTextResize(board, targetElement, oldWidth, newWidth);
          }
        }
      }
    }
  };

  return withImagePlugin(newBoard);
};
