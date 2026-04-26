import React, { ReactNode, useState } from 'react';
import { AdvancedColorPicker } from './advanced-color-picker';
import { ToolButton } from '../../tool-button';
import classNames from 'classnames';
import { Island } from '../../island';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard, Transforms } from '@plait/core';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { PlaitDrawElement } from '@plait/draw';
import {
  applyOpacityToHex,
  isFullyOpaque,
  removeHexAlpha,
} from '../../../utils/color';
import { updateTextPropertyDeep, DEFAULT_TEXT_STYLE } from '../../../utils/text-style';

export type PopupFontColorButtonProps = {
  board: PlaitBoard;
  currentColor: string | undefined;
  fontColorIcon: ReactNode;
  title: string;
};

/**
 * 应用文本颜色到选中的文本元素
 * 严格遵守双轨数据流：同时更新宏观 textStyle.color 和微观 text.children
 */
const applyTextColor = (board: PlaitBoard, element: any, newColor: string) => {
  if (!PlaitDrawElement.isText(element)) return;

  const elementIndex = board.children.findIndex((child: any) => child.id === element.id);
  if (elementIndex < 0) return;

  // 生成新的内部富文本 JSON，深度更新所有叶子节点的 color 属性
  const newTextChildren = updateTextPropertyDeep(
    (element.text as any)?.children || [{ text: '' }],
    'color',
    newColor
  );

  const newText = {
    ...element.text,
    children: newTextChildren,
    textStyle: {
      ...((element.text as any)?.textStyle || {}),
      color: newColor
    }
  };

  // 同步更新宏观外框颜色和微观富文本颜色（双轨数据流）
  Transforms.setNode(
    board,
    {
      textStyle: { ...(element.textStyle || DEFAULT_TEXT_STYLE), color: newColor },
      text: newText
    },
    [elementIndex]
  );
};

export const PopupFontColorButton: React.FC<PopupFontColorButtonProps> = ({
  board,
  currentColor,
  fontColorIcon,
  title,
}) => {
  const [isFontColorPropertyOpen, setIsFontColorPropertyOpen] = useState(false);
  const container = PlaitBoard.getBoardContainer(board);

  // 事件隔离：阻止事件冒泡到画布（焦点护城河）
  const handlePointerDown = (data: { pointerType: any; event: React.PointerEvent }) => {
    data.event.preventDefault();
    data.event.stopPropagation();
  };

  // 处理颜色变化 - 使用 Transforms.setNode 实现双轨数据流
  const handleColorChange = (selectedColor: string) => {
    const selectedElements = board.getSelectedElements();
    if (selectedElements.length > 0) {
      selectedElements.forEach(element => {
        applyTextColor(board, element, selectedColor);
      });
    }
  };

  // 处理透明度变化 - 使用 Transforms.setNode 实现双轨数据流
  const handleOpacityChange = (opacity: number) => {
    if (!currentColor) return;
    const currentFontColorValue = removeHexAlpha(currentColor);
    const newFontColor = isFullyOpaque(opacity)
      ? currentFontColorValue
      : applyOpacityToHex(currentFontColorValue, opacity);

    const selectedElements = board.getSelectedElements();
    if (selectedElements.length > 0) {
      selectedElements.forEach(element => {
        applyTextColor(board, element, newFontColor);
      });
    }
  };

  return (
    <Popover
      sideOffset={12}
      open={isFontColorPropertyOpen}
      onOpenChange={(open) => {
        setIsFontColorPropertyOpen(open);
      }}
      placement={'top'}
    >
      <PopoverTrigger asChild>
        <ToolButton
          className={classNames(`property-button`)}
          selected={isFontColorPropertyOpen}
          visible={true}
          icon={fontColorIcon}
          type="button"
          title={title}
          aria-label={title}
          onPointerDown={handlePointerDown}
          onPointerUp={() => {
            setIsFontColorPropertyOpen(!isFontColorPropertyOpen);
          }}
        ></ToolButton>
      </PopoverTrigger>
      <PopoverContent container={container} onPointerDown={handlePointerDown}>
        <Island
          padding={4}
          className={classNames(`${ATTACHED_ELEMENT_CLASS_NAME}`)}
        >
          <AdvancedColorPicker
            onColorChange={handleColorChange}
            onOpacityChange={handleOpacityChange}
            currentColor={currentColor}
          ></AdvancedColorPicker>
        </Island>
      </PopoverContent>
    </Popover>
  );
};
