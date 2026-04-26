import React from 'react';
import { ImageEditToolbar, ImageEditToolbarProps } from './ImageEditToolbar';
import { CropIcon, ChevronLeftIcon } from '../../icons';
import { ToolButton } from '../../tool-button';
import './CanvasCropToolbar.css';

export interface CanvasCropToolbarProps extends Omit<ImageEditToolbarProps, 'onConfirm' | 'onCancel'> {
  position: { left: number; top: number };
  onConfirm: () => void;
  onCancel: () => void;
  onBack?: () => void;
  showBackButton?: boolean;
}

export const CanvasCropToolbar: React.FC<CanvasCropToolbarProps> = ({
  position,
  onConfirm,
  onCancel,
  onBack,
  showBackButton = false,
  ...toolbarProps
}) => {
  return (
    <div
      className="canvas-crop-toolbar"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        transform: 'translateX(-50%)',
        zIndex: 10001,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ImageEditToolbar
        {...toolbarProps}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>
  );
};

export default CanvasCropToolbar;
