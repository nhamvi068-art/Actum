/**
 * 固定画笔模式工具栏 (PencilModeToolbar)
 *
 * 在激活画笔/橡皮擦工具时显示的关闭按钮
 * 固定在顶部居中位置
 */

import React from 'react';
import { ToolButton } from '../../tool-button';
import { CloseIcon } from '../../icons';
import { useBoard } from '@plait-board/react-board';
import { useDrawnix } from '../../../hooks/use-drawnix';
import { setIsPencilMode } from '../../../plugins/with-pencil';
import { PlaitPointerType, BoardTransforms } from '@plait/core';
import './pencil-mode-toolbar.scss';

export const PencilModeToolbar: React.FC = () => {
  const board = useBoard();
  const {
    appState,
    setAppState,
    isPencilTool,
    isEraserTool,
  } = useDrawnix();

  const handleClose = () => {
    setAppState({ ...appState, isPencilMode: false });
    setIsPencilMode(board, false);
    // 切换回 hand 指针
    BoardTransforms.updatePointerType(board, PlaitPointerType.hand);
  };

  const showPencilSettings = isPencilTool();
  const showEraserSettings = isEraserTool();

  const isActive = showPencilSettings || showEraserSettings;

  if (!isActive) {
    return null;
  }

  return (
    <div className="pencil-mode-toolbar">
      <ToolButton
        type="icon"
        visible={true}
        icon={CloseIcon}
        aria-label="关闭"
        onPointerDown={handleClose}
        className="pencil-mode-toolbar__close"
      />
    </div>
  );
};
