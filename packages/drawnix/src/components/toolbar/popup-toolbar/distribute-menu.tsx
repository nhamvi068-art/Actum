import React from 'react';
import classNames from 'classnames';
import { useBoard } from '@plait-board/react-board';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { Island } from '../../island';
import Stack from '../../stack';
import { ToolButton } from '../../tool-button';
import { distributeElements } from '../../../transforms/distribute';
import { ElementDistributeHIcon, ElementDistributeVIcon, ChevronLeftIcon } from '../../icons';
import { MessagePlugin } from 'tdesign-react';

interface DistributeMenuProps {
  toolbarPosition: { left: number; top: number };
  onClose: () => void;
  disabled?: boolean;
}

export const DistributeMenu: React.FC<DistributeMenuProps> = ({ toolbarPosition, onClose, disabled = false }) => {
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
          icon={<ElementDistributeHIcon />}
          visible={true}
          title="水平分布"
          aria-label="水平分布"
          disabled={disabled}
          onClick={() => {
            const success = distributeElements(board, 'horizontal');
            onClose();
            if (!success) {
              MessagePlugin.warning('间距分布需要至少选择 3 个元素');
            }
          }}
        />
        <ToolButton
          type="icon"
          icon={<ElementDistributeVIcon />}
          visible={true}
          title="垂直分布"
          aria-label="垂直分布"
          disabled={disabled}
          onClick={() => {
            const success = distributeElements(board, 'vertical');
            onClose();
            if (!success) {
              MessagePlugin.warning('间距分布需要至少选择 3 个元素');
            }
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
