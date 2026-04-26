/**
 * 橡皮擦设置工具栏 (Eraser Settings Toolbar)
 *
 * 提供橡皮擦的大小、形状等设置选项
 * 使用 Island 组件，水平布局显示
 */

import React, { useState } from 'react';
import { SizeSlider } from '../../size-slider';
import { ToolButton } from '../../tool-button';
import { Island } from '../../island';
import { useI18n } from '../../../i18n';
import classNames from 'classnames';
import './eraser-settings-toolbar.scss';

export type EraserShape = 'circle' | 'square';

export interface EraserSettings {
  size: number;
  shape: EraserShape;
}

export interface EraserSettingsToolbarProps {
  /** 当前大小 */
  size?: number;
  /** 当前形状 */
  shape?: EraserShape;
  /** 大小变更回调 */
  onSizeChange?: (size: number) => void;
  /** 形状变更回调 */
  onShapeChange?: (shape: EraserShape) => void;
  /** 自定义样式 */
  className?: string;
}

const DEFAULT_SIZE = 20;

export const EraserSettingsToolbar: React.FC<EraserSettingsToolbarProps> = ({
  size = DEFAULT_SIZE,
  shape = 'circle',
  onSizeChange,
  onShapeChange,
  className,
}) => {
  const { t } = useI18n();
  const [localSize, setLocalSize] = useState(size);
  const [localShape, setLocalShape] = useState(shape);

  const handleSizeChange = (newSize: number) => {
    setLocalSize(newSize);
    onSizeChange?.(newSize);
  };

  const handleShapeChange = (newShape: EraserShape) => {
    setLocalShape(newShape);
    onShapeChange?.(newShape);
  };

  return (
    <Island
      padding={2}
      className={classNames('eraser-settings-island', className)}
      style={{ borderRadius: '40px' }}
    >
      <div className="eraser-settings-container">
        {/* 形状选择 */}
        <div className="eraser-settings-section">
          <ToolButton
            type="icon"
            size="small"
            selected={localShape === 'circle'}
            aria-label="Circle eraser"
            onClick={() => handleShapeChange('circle')}
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20">
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            }
          />
          <ToolButton
            type="icon"
            size="small"
            selected={localShape === 'square'}
            aria-label="Square eraser"
            onClick={() => handleShapeChange('square')}
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20">
                <rect
                  x="2"
                  y="2"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            }
          />
        </div>

        {/* 分隔线 */}
        <div className="eraser-settings-divider" />

        {/* 大小滑块 */}
        <div className="eraser-settings-section">
          <SizeSlider
            title={t('popupToolbar.stroke')}
            min={8}
            max={60}
            step={2}
            defaultValue={localSize}
            onChange={handleSizeChange}
            showSizeIndicators={true}
          />
        </div>
      </div>
    </Island>
  );
};
