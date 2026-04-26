/**
 * 画笔设置工具栏 (Pencil Settings Toolbar)
 *
 * 提供画笔工具的颜色、粗细、透明度等设置选项
 * 使用 Island 组件，水平布局显示
 */

import React, { useState, useCallback, useEffect } from 'react';
import { SizeSlider } from '../../size-slider';
import { ToolbarColorPopover } from '../toolbar-color-popover';
import { Island } from '../../island';
import {
  DEFAULT_COLOR,
  MERGING,
  PlaitHistoryBoard,
} from '@plait/core';
import { useBoard } from '@plait-board/react-board';
import classNames from 'classnames';
import { Circle, Square, ChevronDown } from 'lucide-react';
import './pencil-settings-toolbar.scss';

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type BrushShape = 'round' | 'square';

export interface PencilSettings {
  color: string;
  strokeWidth: number;
  opacity: number;
  lineStyle?: LineStyle;
  shape?: BrushShape;
}

export interface PencilSettingsToolbarProps {
  /** 当前颜色 */
  color?: string;
  /** 当前粗细 */
  strokeWidth?: number;
  /** 当前透明度 */
  opacity?: number;
  /** 当前线条样式 */
  lineStyle?: LineStyle;
  /** 当前笔刷形状 */
  shape?: BrushShape;
  /** 颜色变更回调 */
  onColorChange?: (color: string) => void;
  /** 粗细变更回调 */
  onStrokeWidthChange?: (width: number) => void;
  /** 透明度变更回调 */
  onOpacityChange?: (opacity: number) => void;
  /** 线条样式变更回调 */
  onLineStyleChange?: (style: LineStyle) => void;
  /** 笔刷形状变更回调 */
  onShapeChange?: (shape: BrushShape) => void;
  /** 自定义样式 */
  className?: string;
}

const DEFAULT_STROKE_WIDTH = 4;
const DEFAULT_OPACITY = 100;
const DEFAULT_LINE_STYLE: LineStyle = 'solid';
const DEFAULT_SHAPE: BrushShape = 'round';

// 线条样式 SVG 图标
const LineStyleIcons: Record<LineStyle, React.ReactNode> = {
  solid: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="12" x2="20" y2="12"></line>
    </svg>
  ),
  dashed: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5">
      <line x1="4" y1="12" x2="20" y2="12"></line>
    </svg>
  ),
  dotted: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="1 6" strokeLinecap="round">
      <line x1="4" y1="12" x2="20" y2="12"></line>
    </svg>
  ),
};

export const PencilSettingsToolbar: React.FC<PencilSettingsToolbarProps> = ({
  color = DEFAULT_COLOR,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  opacity = DEFAULT_OPACITY,
  lineStyle = DEFAULT_LINE_STYLE,
  shape = DEFAULT_SHAPE,
  onColorChange,
  onStrokeWidthChange,
  onOpacityChange,
  onLineStyleChange,
  onShapeChange,
  className,
}) => {
  const board = useBoard();
  const [localColor, setLocalColor] = useState(color);
  const [localStrokeWidth, setLocalStrokeWidth] = useState(strokeWidth);
  const [localOpacity, setLocalOpacity] = useState(opacity);
  const [localLineStyle, setLocalLineStyle] = useState(lineStyle);
  const [localShape, setLocalShape] = useState(shape);
  const [isLineMenuOpen, setIsLineMenuOpen] = useState(false);

  // Props 同步：当外部 strokeWidth 变化时更新本地状态
  useEffect(() => {
    setLocalStrokeWidth(strokeWidth);
  }, [strokeWidth]);

  useEffect(() => {
    setLocalColor(color);
  }, [color]);

  useEffect(() => {
    setLocalOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    setLocalLineStyle(lineStyle);
  }, [lineStyle]);

  useEffect(() => {
    setLocalShape(shape);
  }, [shape]);

  const handleColorChange = useCallback((newColor: string) => {
    setLocalColor(newColor);
    onColorChange?.(newColor);
  }, [onColorChange]);

  const handleStrokeWidthChange = useCallback((newWidth: number) => {
    setLocalStrokeWidth(newWidth);
    onStrokeWidthChange?.(newWidth);
  }, [onStrokeWidthChange]);

  const handleOpacityChange = useCallback((newOpacity: number) => {
    setLocalOpacity(newOpacity);
    onOpacityChange?.(newOpacity);
  }, [onOpacityChange]);

  const handleLineStyleChange = useCallback((newLineStyle: LineStyle) => {
    setLocalLineStyle(newLineStyle);
    onLineStyleChange?.(newLineStyle);
    setIsLineMenuOpen(false);
  }, [onLineStyleChange]);

  const handleShapeChange = useCallback((newShape: BrushShape) => {
    setLocalShape(newShape);
    onShapeChange?.(newShape);
  }, [onShapeChange]);

  const handleStrokeWidthStart = useCallback(() => {
    MERGING.set(board, true);
    PlaitHistoryBoard.setSplittingOnce(board, true);
  }, [board]);

  const handleStrokeWidthEnd = useCallback(() => {
    MERGING.set(board, false);
  }, [board]);

  return (
    <Island
      padding={2}
      className={classNames('draw-toolbar', 'pencil-settings-island', className)}
      style={{ borderRadius: '40px' }}
    >
      <div className="pencil-settings-container">
        {/* 颜色选择器 */}
        <div className="pencil-settings-section">
          <ToolbarColorPopover
            currentColor={localColor}
            onColorChange={handleColorChange}
            onOpacityChange={handleOpacityChange}
            aria-label="选择颜色"
          />
        </div>

        {/* 分隔线 */}
        <div className="pencil-settings-divider" />

        {/* 粗细滑块 */}
        <div className="pencil-settings-section pencil-settings-section--slider">
          <SizeSlider
            title="笔刷大小"
            min={1}
            max={100}
            step={1}
            defaultValue={localStrokeWidth}
            onChange={handleStrokeWidthChange}
            beforeStart={handleStrokeWidthStart}
            afterEnd={handleStrokeWidthEnd}
            showSizeIndicators={true}
          />
          <span
            className="pencil-settings-stroke-value"
            title="笔刷大小"
            aria-label={`笔刷大小 ${localStrokeWidth}`}
          >
            {localStrokeWidth}
          </span>
        </div>

        {/* 分隔线 */}
        <div className="pencil-settings-divider" />

        {/* 画线样式选择器 */}
        <div className="pencil-settings-section">
          <div className="pencil-settings-line-style-dropdown">
            <button
              onClick={() => setIsLineMenuOpen(!isLineMenuOpen)}
              className={classNames('line-style-trigger', { active: isLineMenuOpen })}
              title="画线样式"
              aria-label="画线样式"
              aria-expanded={isLineMenuOpen}
            >
              {LineStyleIcons[localLineStyle]}
              <ChevronDown size={14} className={classNames('chevron', { rotated: isLineMenuOpen })} />
            </button>

            {/* 悬浮菜单 */}
            {isLineMenuOpen && (
              <>
                {/* 透明遮罩，点击外部关闭 */}
                <div className="line-style-overlay" onClick={() => setIsLineMenuOpen(false)} />
                <div className="line-style-menu">
                  {[
                    { id: 'solid' as LineStyle, label: '实线' },
                    { id: 'dashed' as LineStyle, label: '虚线' },
                    { id: 'dotted' as LineStyle, label: '点线' },
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleLineStyleChange(item.id)}
                      className={classNames('line-style-option', { selected: localLineStyle === item.id })}
                    >
                      <div className="line-style-icon">{LineStyleIcons[item.id]}</div>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 分隔线 */}
        <div className="pencil-settings-divider" />

        {/* 笔刷形状切换 */}
        <div className="pencil-settings-section">
          <div className="pencil-settings-shape-toggle" title="笔刷形状">
            <button
              onClick={() => handleShapeChange('round')}
              className={classNames('shape-toggle-btn', { active: localShape === 'round' })}
              title="圆形笔刷"
              aria-label="圆形笔刷"
              aria-pressed={localShape === 'round'}
            >
              <Circle size={16} strokeWidth={localShape === 'round' ? 2.5 : 2} />
            </button>
            <button
              onClick={() => handleShapeChange('square')}
              className={classNames('shape-toggle-btn', { active: localShape === 'square' })}
              title="方形笔刷"
              aria-label="方形笔刷"
              aria-pressed={localShape === 'square'}
            >
              <Square size={16} strokeWidth={localShape === 'square' ? 2.5 : 2} />
            </button>
          </div>
        </div>
      </div>
    </Island>
  );
};
