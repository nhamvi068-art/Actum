import React from 'react';
import classNames from 'classnames';
import { useBoard } from '@plait-board/react-board';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { Island } from '../../island';
import Stack from '../../stack';
import { ToolButton } from '../../tool-button';
import { alignElements } from '../../../transforms/alignment';
import {
  ElementAlignLeftIcon,
  ElementAlignCenterHIcon,
  ElementAlignRightIcon,
  ElementAlignTopIcon,
  ElementAlignCenterVIcon,
  ElementAlignBottomIcon,
  ChevronLeftIcon,
} from '../../icons';

interface AlignmentMenuProps {
  toolbarPosition: { left: number; top: number };
  onClose: () => void;
  disabled?: boolean;
}

export const AlignmentMenu: React.FC<AlignmentMenuProps> = ({ toolbarPosition, onClose, disabled = false }) => {
  const board = useBoard();

  return (
    <Island
      padding={1}
      className={classNames('popup-toolbar', 'image-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}
      style={{
        position: 'absolute',
        left: toolbarPosition.left,
        top: toolbarPosition.top,
        transform: 'translateX(-50%)',
        zIndex: 1000,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Stack.Row gap={1} align="center">
        <ToolButton
          type="icon"
          icon={<ElementAlignLeftIcon />}
          visible={true}
          title="左对齐"
          aria-label="左对齐"
          disabled={disabled}
          onClick={() => {
            alignElements(board, 'left');
            onClose();
          }}
        />
        <ToolButton
          type="icon"
          icon={<ElementAlignCenterHIcon />}
          visible={true}
          title="水平居中"
          aria-label="水平居中"
          disabled={disabled}
          onClick={() => {
            alignElements(board, 'center');
            onClose();
          }}
        />
        <ToolButton
          type="icon"
          icon={<ElementAlignRightIcon />}
          visible={true}
          title="右对齐"
          aria-label="右对齐"
          disabled={disabled}
          onClick={() => {
            alignElements(board, 'right');
            onClose();
          }}
        />
        <ToolButton
          type="icon"
          icon={<ElementAlignTopIcon />}
          visible={true}
          title="顶对齐"
          aria-label="顶对齐"
          disabled={disabled}
          onClick={() => {
            alignElements(board, 'top');
            onClose();
          }}
        />
        <ToolButton
          type="icon"
          icon={<ElementAlignCenterVIcon />}
          visible={true}
          title="垂直居中"
          aria-label="垂直居中"
          disabled={disabled}
          onClick={() => {
            alignElements(board, 'middle');
            onClose();
          }}
        />
        <ToolButton
          type="icon"
          icon={<ElementAlignBottomIcon />}
          visible={true}
          title="底对齐"
          aria-label="底对齐"
          disabled={disabled}
          onClick={() => {
            alignElements(board, 'bottom');
            onClose();
          }}
        />
        <div className="toolbar-divider" />
        <ToolButton
          type="icon"
          icon={<ChevronLeftIcon />}
          visible={true}
          title="返回"
          aria-label="返回"
          onClick={onClose}
        />
      </Stack.Row>
    </Island>
  );
};
