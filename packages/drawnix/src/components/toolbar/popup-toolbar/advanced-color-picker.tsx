import React, { useState, useCallback, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { useI18n } from '../../../i18n';
import './advanced-color-picker.scss';

// 预设颜色
const PRESET_COLORS = [
  '#FF0000', '#FF4500', '#FF8C00', '#FFD700', '#FFFF00', '#9ACD32',
  '#00FF00', '#00CED1', '#00BFFF', '#1E90FF', '#0000FF', '#8A2BE2',
  '#FF00FF', '#FF1493', '#FFC0CB', '#FFFFFF', '#808080', '#000000',
];

interface AdvancedColorPickerProps {
  currentColor?: string;
  onColorChange: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
}

// 获取当前颜色透明度
const getOpacityFromHex = (hex: string): number => {
  if (hex.length === 9) {
    const alpha = parseInt(hex.slice(-2), 16);
    return Math.round((alpha / 255) * 100);
  }
  return 100;
};

// 移除透明度后的纯色
const removeOpacityFromHex = (hex: string): string => {
  return hex.length === 9 ? '#' + hex.slice(1, 7) : hex;
};

export const AdvancedColorPicker: React.FC<AdvancedColorPickerProps> = ({
  currentColor,
  onColorChange,
  onOpacityChange,
}) => {
  const { t } = useI18n();

  // 初始化颜色
  const [color, setColor] = useState('#000000');
  const [opacity, setOpacity] = useState(100);
  const [hexInput, setHexInput] = useState('#000000');
  const [recentColors, setRecentColors] = useState<string[]>([]);

  // 初始化颜色
  useEffect(() => {
    if (currentColor) {
      const pureColor = removeOpacityFromHex(currentColor);
      setColor(pureColor);
      setHexInput(pureColor.toUpperCase());
      setOpacity(getOpacityFromHex(currentColor));
    }
  }, [currentColor]);

  // 颜色变化
  const handleColorChange = useCallback((newColor: string) => {
    setColor(newColor);
    setHexInput(newColor.toUpperCase());

    // 生成带透明度的颜色
    const finalColor = opacity < 100
      ? newColor + Math.round((opacity / 100) * 255).toString(16).padStart(2, '0').toUpperCase()
      : newColor;

    onColorChange(finalColor);
  }, [onColorChange, opacity]);

  // 透明度变化
  const handleOpacityChange = useCallback((newOpacity: number) => {
    const clampedOpacity = Math.max(0, Math.min(100, newOpacity));
    setOpacity(clampedOpacity);

    if (onOpacityChange) {
      onOpacityChange(clampedOpacity);
    }

    // 同时更新颜色
    const finalColor = clampedOpacity < 100
      ? color + Math.round((clampedOpacity / 100) * 255).toString(16).padStart(2, '0').toUpperCase()
      : color;
    onColorChange(finalColor);
  }, [onOpacityChange, color, onColorChange]);

  // 添加到最近使用
  const addToRecent = useCallback((newColor: string) => {
    setRecentColors(prev => {
      const filtered = prev.filter(c => c !== newColor);
      return [newColor, ...filtered].slice(0, 8);
    });
  }, []);

  // 选择预设颜色
  const handlePresetClick = (presetColor: string) => {
    setColor(presetColor);
    setHexInput(presetColor.toUpperCase());
    addToRecent(presetColor);

    const finalColor = opacity < 100
      ? presetColor + Math.round((opacity / 100) * 255).toString(16).padStart(2, '0').toUpperCase()
      : presetColor;
    onColorChange(finalColor);
  };

  // Hex 输入变化
  const handleHexChange = (value: string) => {
    setHexInput(value);
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setColor(value);
      addToRecent(value.toUpperCase());

      const finalColor = opacity < 100
        ? value + Math.round((opacity / 100) * 255).toString(16).padStart(2, '0').toUpperCase()
        : value;
      onColorChange(finalColor);
    }
  };

  // 吸管工具
  const handleEyedropper = async () => {
    if ('EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        handleColorChange(result.sRGBHex);
        addToRecent(result.sRGBHex);
      } catch (e) {
        // 用户取消或不支持
      }
    }
  };

  // 事件隔离：防止画布失焦
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 最终显示颜色（带透明度）
  const displayColor = opacity < 100
    ? color + Math.round((opacity / 100) * 255).toString(16).padStart(2, '0').toUpperCase()
    : color;

  return (
    <div className="advanced-color-picker" onPointerDown={handlePointerDown}>
      {/* 使用 react-colorful 的取色器 */}
      <div className="color-picker-wrapper" onPointerDown={(e) => e.stopPropagation()}>
        <HexColorPicker
          color={color}
          onChange={handleColorChange}
        />
      </div>

      {/* 透明度条 */}
      <div className="opacity-section" onPointerDown={handlePointerDown}>
        <div className="opacity-label">透明度</div>
        <div className="opacity-slider-container" onPointerDown={handlePointerDown}>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
            className="opacity-slider"
            onPointerDown={handlePointerDown}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => handleOpacityChange(parseInt(e.target.value) || 0)}
            className="opacity-input"
            onPointerDown={handlePointerDown}
          />
          <span className="opacity-unit">%</span>
        </div>
      </div>

      {/* 底部：预览、Hex 输入、吸管 */}
      <div className="color-bottom" onPointerDown={handlePointerDown}>
        {/* 预览 */}
        <div
          className="color-preview"
          style={{ backgroundColor: displayColor }}
        />

        {/* Hex 输入 */}
        <div className="color-hex-input" onPointerDown={handlePointerDown}>
          <input
            type="text"
            value={hexInput}
            onChange={(e) => handleHexChange(e.target.value)}
            maxLength={7}
            onPointerDown={handlePointerDown}
          />
        </div>

        {/* 吸管按钮 */}
        <button
          className="eyedropper-btn"
          onClick={handleEyedropper}
          title="取色器"
          onPointerDown={handlePointerDown}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 22l1-1h3l9-9M20 4l-2 2m2-2l-5 5m5-5l-3 3" />
          </svg>
        </button>
      </div>

      {/* 预设色板 */}
      <div className="color-presets" onPointerDown={handlePointerDown}>
        {PRESET_COLORS.map((presetColor) => (
          <div
            key={presetColor}
            className={`preset-swatch ${color.toUpperCase() === presetColor ? 'active' : ''}`}
            style={{ backgroundColor: presetColor }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handlePresetClick(presetColor);
            }}
          />
        ))}
      </div>

      {/* 最近使用 */}
      {recentColors.length > 0 && (
        <div className="color-recent" onPointerDown={handlePointerDown}>
          <span className="recent-label">最近</span>
          <div className="recent-swatches">
            {recentColors.map((recentColor, i) => (
              <div
                key={i}
                className="recent-swatch"
                style={{ backgroundColor: recentColor }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePresetClick(recentColor);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
