/**
 * 钢笔设置工具栏 (Pen Settings Toolbar)
 *
 * 提供钢笔工具的描边颜色、闭合路径等设置选项
 * 使用 Island 组件，水平布局显示
 */

import React, { useState, useCallback } from 'react';
import { ToolbarColorPopover } from '../toolbar-color-popover';
import { ToolButton } from '../../tool-button';
import { Island } from '../../island';
import { useI18n } from '../../../i18n';
import { DEFAULT_COLOR } from '@plait/core';
import classNames from 'classnames';
import './pen-settings-toolbar.scss';

export interface PenSettings {
  color: string;
  strokeWidth: number;
  isClosed: boolean;
}

export interface PenSettingsToolbarProps {
  /** 当前描边颜色 */
  color?: string;
  /** 当前粗细 */
  strokeWidth?: number;
  /** 是否闭合路径 */
  isClosed?: boolean;
  /** 颜色变更回调 */
  onColorChange?: (color: string) => void;
  /** 粗细变更回调 */
  onStrokeWidthChange?: (width: number) => void;
  /** 闭合状态变更回调 */
  onIsClosedChange?: (isClosed: boolean) => void;
  /** 完成绘制回调 */
  onComplete?: () => void;
  /** 自定义样式 */
  className?: string;
}

const DEFAULT_STROKE_WIDTH = 2;

export const PenSettingsToolbar: React.FC<PenSettingsToolbarProps> = ({
  color = DEFAULT_COLOR,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  isClosed = false,
  onColorChange,
  onStrokeWidthChange,
  onIsClosedChange,
  onComplete: _onComplete,
  className,
}) => {
  const { t } = useI18n();
  const [localColor, setLocalColor] = useState(color);
  const [localStrokeWidth, setLocalStrokeWidth] = useState(strokeWidth);
  const [localIsClosed, setLocalIsClosed] = useState(isClosed);

  const handleColorChange = useCallback((newColor: string) => {
    setLocalColor(newColor);
    onColorChange?.(newColor);
  }, [onColorChange]);

  const handleStrokeWidthChange = useCallback((newWidth: number) => {
    setLocalStrokeWidth(newWidth);
    onStrokeWidthChange?.(newWidth);
  }, [onStrokeWidthChange]);

  const handleIsClosedToggle = useCallback(() => {
    const newValue = !localIsClosed;
    setLocalIsClosed(newValue);
    onIsClosedChange?.(newValue);
  }, [localIsClosed, onIsClosedChange]);

  return (
    <Island padding={8} className={classNames('pen-settings-island', className)}>
      <div className="pen-settings-container">
        {/* 颜色选择器 */}
        <div className="pen-settings-section pen-settings-section--color">
          <ToolbarColorPopover
            currentColor={localColor}
            onColorChange={handleColorChange}
            onOpacityChange={() => {}}
            aria-label={t('popupToolbar.stroke')}
          />
        </div>

        {/* 分隔线 */}
        <div className="pen-settings-divider" />

        {/* 粗细选择 */}
        <div className="pen-settings-section">
          {[2, 4, 6].map((width) => (
            <ToolButton
              key={width}
              type="icon"
              size="small"
              selected={localStrokeWidth === width}
              aria-label={`Stroke width ${width}`}
              onClick={() => handleStrokeWidthChange(width)}
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line
                    x1="4"
                    y1="10"
                    x2="16"
                    y2="10"
                    stroke="currentColor"
                    strokeWidth={width}
                    strokeLinecap="round"
                  />
                </svg>
              }
            />
          ))}
        </div>

        {/* 分隔线 */}
        <div className="pen-settings-divider" />

        {/* 闭合路径切换 */}
        <div className="pen-settings-section">
          <ToolButton
            type="icon"
            size="small"
            selected={localIsClosed}
            aria-label="Toggle closed path"
            onClick={handleIsClosedToggle}
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                {localIsClosed ? (
                  <path
                    d="M10 3L17 10L10 17L3 10L10 3Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                ) : (
                  <path
                    d="M4 16L10 4L16 16"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            }
          />
        </div>

        {/* 分隔线 */}
        <div className="pen-settings-divider" />

        {/* 预览 */}
        <div className="pen-settings-preview">
          <svg width="60" height="24" viewBox="0 0 60 24">
            <path
              d={localIsClosed
                ? 'M 8 18 Q 2 10, 15 6 Q 30 2, 45 6 Q 58 10, 52 18 Q 30 24, 8 18 Z'
                : 'M 8 12 Q 18 4, 30 12 T 52 12'
              }
              stroke={localColor}
              strokeWidth={localStrokeWidth}
              fill={localIsClosed ? localColor + '20' : 'none'}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </Island>
  );
};
