import React, { useState } from 'react';
import { useBoard } from '@plait-board/react-board';
import { TextEffectType } from '../../utils/text-style';
import { setTextEffect, removeTextEffect } from '../../../transforms/text-effect';
import { buildShadowCSS, buildGradientCSS, buildStrokeCSS } from '../../utils/text-effects';
import { useI18n } from '../../../i18n';

interface TextEffectPanelProps {
  element: any; // The selected text element with textStyle
}

export const TextEffectPanel: React.FC<TextEffectPanelProps> = (props) => {
  const { element } = props;
  const board = useBoard();
  const { t } = useI18n();
  const textStyle = element?.textStyle || {};
  const effects = textStyle.effects || [];

  const [activeEffect, setActiveEffect] = useState<TextEffectType | null>(
    effects.length > 0 ? effects[0].type : null
  );

  // Shadow effect state
  const shadowEffect = effects.find(e => e.type === 'shadow')?.shadow;
  const [shadowColor, setShadowColor] = useState(shadowEffect?.color || 'rgba(0, 0, 0, 0.5)');
  const [shadowBlur, setShadowBlur] = useState(shadowEffect?.blur || 4);
  const [shadowOffsetX, setShadowOffsetX] = useState(shadowEffect?.offsetX || 2);
  const [shadowOffsetY, setShadowOffsetY] = useState(shadowEffect?.offsetY || 2);

  // Gradient effect state
  const gradientEffect = effects.find(e => e.type === 'gradient')?.gradient;
  const [gradientAngle, setGradientAngle] = useState(gradientEffect?.angle || 90);
  const [gradientStartColor, setGradientStartColor] = useState(
    gradientEffect?.stops?.[0]?.color || '#ff0000'
  );
  const [gradientEndColor, setGradientEndColor] = useState(
    gradientEffect?.stops?.[1]?.color || '#0000ff'
  );

  // Stroke effect state
  const strokeEffect = effects.find(e => e.type === 'stroke')?.stroke;
  const [strokeColor, setStrokeColor] = useState(strokeEffect?.color || '#000000');
  const [strokeWidth, setStrokeWidth] = useState(strokeEffect?.width || 1);

  // 事件隔离：阻止事件冒泡到画布
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const handleEffectToggle = (effectType: TextEffectType) => {
    if (activeEffect === effectType) {
      // Remove effect
      removeTextEffect(board, effectType);
      setActiveEffect(null);
    } else {
      // Add effect with default values
      addEffect(effectType);
    }
  };

  const addEffect = (effectType: TextEffectType) => {
    switch (effectType) {
      case 'shadow':
        setTextEffect(board, 'shadow', {
          offsetX: shadowOffsetX,
          offsetY: shadowOffsetY,
          blur: shadowBlur,
          color: shadowColor,
        });
        setActiveEffect('shadow');
        break;
      case 'gradient':
        setTextEffect(board, 'gradient', {
          type: 'linear',
          angle: gradientAngle,
          stops: [
            { offset: 0, color: gradientStartColor },
            { offset: 1, color: gradientEndColor },
          ],
        });
        setActiveEffect('gradient');
        break;
      case 'stroke':
        setTextEffect(board, 'stroke', {
          width: strokeWidth,
          color: strokeColor,
        });
        setActiveEffect('stroke');
        break;
    }
  };

  const updateShadow = () => {
    setTextEffect(board, 'shadow', {
      offsetX: shadowOffsetX,
      offsetY: shadowOffsetY,
      blur: shadowBlur,
      color: shadowColor,
    });
  };

  const updateGradient = () => {
    setTextEffect(board, 'gradient', {
      type: 'linear',
      angle: gradientAngle,
      stops: [
        { offset: 0, color: gradientStartColor },
        { offset: 1, color: gradientEndColor },
      ],
    });
  };

  const updateStroke = () => {
    setTextEffect(board, 'stroke', {
      width: strokeWidth,
      color: strokeColor,
    });
  };

  return (
    <div className="text-effect-panel" onPointerDown={handlePointerDown}>
      <div className="effect-toggle-buttons">
        <button
          className={`effect-toggle-btn ${activeEffect === 'shadow' ? 'active' : ''}`}
          onClick={() => handleEffectToggle('shadow')}
          onPointerDown={handlePointerDown}
          title={t('textEffect.shadow')}
        >
          <span style={{ textShadow: '2px 2px 2px rgba(0,0,0,0.5)' }}>Aa</span>
        </button>
        <button
          className={`effect-toggle-btn ${activeEffect === 'gradient' ? 'active' : ''}`}
          onClick={() => handleEffectToggle('gradient')}
          onPointerDown={handlePointerDown}
          title={t('textEffect.gradient')}
        >
          <span style={{
            background: 'linear-gradient(90deg, #ff0000, #0000ff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>Aa</span>
        </button>
        <button
          className={`effect-toggle-btn ${activeEffect === 'stroke' ? 'active' : ''}`}
          onClick={() => handleEffectToggle('stroke')}
          onPointerDown={handlePointerDown}
          title={t('textEffect.stroke')}
        >
          <span style={{ WebkitTextStroke: '1px #000' }}>Aa</span>
        </button>
      </div>

      {activeEffect === 'shadow' && (
        <div className="effect-options" onPointerDown={handlePointerDown}>
          <div className="option-row">
            <label>{t('textEffect.shadowColor')}</label>
            <input
              type="color"
              value={shadowColor}
              onChange={(e) => setShadowColor(e.target.value)}
              onBlur={updateShadow}
              onPointerDown={handlePointerDown}
            />
          </div>
          <div className="option-row">
            <label>{t('textEffect.blur')}</label>
            <input
              type="range"
              min="0"
              max="20"
              value={shadowBlur}
              onChange={(e) => setShadowBlur(Number(e.target.value))}
              onMouseUp={updateShadow}
              onPointerDown={handlePointerDown}
            />
            <span>{shadowBlur}px</span>
          </div>
          <div className="option-row">
            <label>{t('textEffect.offset')}</label>
            <input
              type="range"
              min="-10"
              max="10"
              value={shadowOffsetX}
              onChange={(e) => setShadowOffsetX(Number(e.target.value))}
              onMouseUp={updateShadow}
              onPointerDown={handlePointerDown}
            />
            <span>X: {shadowOffsetX}</span>
            <input
              type="range"
              min="-10"
              max="10"
              value={shadowOffsetY}
              onChange={(e) => setShadowOffsetY(Number(e.target.value))}
              onMouseUp={updateShadow}
              onPointerDown={handlePointerDown}
            />
            <span>Y: {shadowOffsetY}</span>
          </div>
        </div>
      )}

      {activeEffect === 'gradient' && (
        <div className="effect-options" onPointerDown={handlePointerDown}>
          <div className="option-row">
            <label>{t('textEffect.angle')}</label>
            <input
              type="range"
              min="0"
              max="360"
              value={gradientAngle}
              onChange={(e) => setGradientAngle(Number(e.target.value))}
              onMouseUp={updateGradient}
              onPointerDown={handlePointerDown}
            />
            <span>{gradientAngle}°</span>
          </div>
          <div className="option-row">
            <label>{t('textEffect.startColor')}</label>
            <input
              type="color"
              value={gradientStartColor}
              onChange={(e) => setGradientStartColor(e.target.value)}
              onBlur={updateGradient}
              onPointerDown={handlePointerDown}
            />
          </div>
          <div className="option-row">
            <label>{t('textEffect.endColor')}</label>
            <input
              type="color"
              value={gradientEndColor}
              onChange={(e) => setGradientEndColor(e.target.value)}
              onBlur={updateGradient}
              onPointerDown={handlePointerDown}
            />
          </div>
        </div>
      )}

      {activeEffect === 'stroke' && (
        <div className="effect-options" onPointerDown={handlePointerDown}>
          <div className="option-row">
            <label>{t('textEffect.strokeColor')}</label>
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              onBlur={updateStroke}
              onPointerDown={handlePointerDown}
            />
          </div>
          <div className="option-row">
            <label>{t('textEffect.strokeWidth')}</label>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              onMouseUp={updateStroke}
              onPointerDown={handlePointerDown}
            />
            <span>{strokeWidth}px</span>
          </div>
        </div>
      )}
    </div>
  );
};
