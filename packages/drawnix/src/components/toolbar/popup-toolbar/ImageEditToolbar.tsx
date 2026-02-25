import React from 'react';
import {
  RotateRightIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  Check,
  CloseIcon,
} from '../../icons';
import Stack from '../../stack';
import { ToolButton } from '../../tool-button';
import './ImageEditToolbar.css';

// 裁剪比例配置
export const CROP_RATIOS = [
  { key: 'free', label: '自由', value: 0 },
  { key: '16:9', label: '16:9', value: 16 / 9 },
  { key: '9:16', label: '9:16', value: 9 / 16 },
  { key: '4:3', label: '4:3', value: 4 / 3 },
  { key: '3:4', label: '3:4', value: 3 / 4 },
  { key: '1:1', label: '1:1', value: 1 },
  { key: '3:2', label: '3:2', value: 3 / 2 },
  { key: '2:3', label: '2:3', value: 2 / 3 },
];

export interface ImageEditToolbarProps {
  rotateDegree: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  cropRatio: string;
  onRotate: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onCropRatioChange: (ratioKey: string, ratioValue: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ImageEditToolbar: React.FC<ImageEditToolbarProps> = ({
  rotateDegree,
  flipHorizontal,
  flipVertical,
  cropRatio,
  onRotate,
  onFlipHorizontal,
  onFlipVertical,
  onCropRatioChange,
  onConfirm,
  onCancel
}) => {
  return (
    <div className="image-edit-toolbar">
      <div className="toolbar-section transform-section">
        <ToolButton
          type="icon"
          icon={RotateRightIcon}
          title={`旋转 ${rotateDegree}°`}
          onClick={onRotate}
        />
        <ToolButton
          type="icon"
          icon={FlipHorizontalIcon}
          title="水平翻转"
          selected={flipHorizontal}
          onClick={onFlipHorizontal}
        />
        <ToolButton
          type="icon"
          icon={FlipVerticalIcon}
          title="垂直翻转"
          selected={flipVertical}
          onClick={onFlipVertical}
        />
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section crop-ratio-section">
        <Stack.Row gap={4}>
          {CROP_RATIOS.map(ratio => (
            <button
              key={ratio.key}
              className={`crop-ratio-btn ${cropRatio === ratio.key ? 'active' : ''}`}
              onClick={() => onCropRatioChange(ratio.key, ratio.value)}
            >
              {ratio.label}
            </button>
          ))}
        </Stack.Row>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section action-section">
        <ToolButton
          type="icon"
          icon={CloseIcon}
          title="取消"
          onClick={onCancel}
        />
        <ToolButton
          type="icon"
          icon={Check}
          title="确认"
          onClick={onConfirm}
        />
      </div>
    </div>
  );
};

export default ImageEditToolbar;
