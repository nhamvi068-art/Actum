/**
 * 紧凑工具栏颜色入口：触发器为小色块，完整 AdvancedColorPicker 放在 Popover 内，
 * 与字体/描边/填充工具的交互行为对齐（受控 open、指针隔离、container 画板）。
 */

import React, { useState } from 'react';
import classNames from 'classnames';
import { Popover, PopoverContent, PopoverTrigger } from '../popover/popover';
import { Island } from '../island';
import { AdvancedColorPicker } from './popup-toolbar/advanced-color-picker';
import { ToolButton } from '../tool-button';
import { removeHexAlpha, isNoColor } from '../../utils/color';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import { PlaitBoard } from '@plait/core';
import './toolbar-color-popover.scss';

export type ToolbarColorPopoverProps = {
  currentColor: string;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  'aria-label'?: string;
};

export const ToolbarColorPopover: React.FC<ToolbarColorPopoverProps> = ({
  currentColor,
  onColorChange,
  onOpacityChange,
  'aria-label': ariaLabel,
}) => {
  const { t } = useI18n();
  const board = useBoard();
  const container = board ? PlaitBoard.getBoardContainer(board) : null;

  const [isOpen, setIsOpen] = useState(false);

  const hex = removeHexAlpha(currentColor);
  const isNo = isNoColor(currentColor) || isNoColor(hex);

  const handlePointerDown = (data: { pointerType: any; event: React.PointerEvent }) => {
    data.event.preventDefault();
    data.event.stopPropagation();
  };

  const handleContentPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Popover
      placement="bottom"
      sideOffset={8}
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
      }}
    >
      <PopoverTrigger asChild>
        <ToolButton
          type="button"
          className={classNames('toolbar-color-popover-trigger')}
          visible={true}
          aria-label={ariaLabel ?? t('popupToolbar.stroke')}
          onPointerDown={handlePointerDown}
          onPointerUp={() => {
            setIsOpen(!isOpen);
          }}
          style={{
            backgroundColor: isNo ? 'transparent' : hex,
            border: isNo ? '2px dashed var(--island-border-color, #ccc)' : undefined,
          }}
        />
      </PopoverTrigger>
      <PopoverContent container={container} onPointerDown={handleContentPointerDown}>
        <Island
          padding={4}
          className="toolbar-color-popover-panel"
        >
          <AdvancedColorPicker
            currentColor={currentColor}
            onColorChange={(c) => {
              onColorChange(c);
            }}
            onOpacityChange={onOpacityChange}
          />
        </Island>
      </PopoverContent>
    </Popover>
  );
};
