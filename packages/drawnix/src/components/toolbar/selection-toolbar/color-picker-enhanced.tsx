import React, { useEffect, useMemo, useState } from 'react';

const DEFAULT_COLORS = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#CCCCCC',
  '#EB4335',
  '#FBBC04',
  '#34A853',
  '#4285F4',
  '#F538A0',
  '#FF6D01',
  '#46BDC6',
  '#0B8043',
  '#3F51B5',
  '#673AB7',
  '#9C27B0',
  '#795548',
  '#FFEB3B',
  '#CDDC39',
  '#FFFFFF',
];

const isValidHexColor = (value: string) => /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);

const normalizeHexInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return (trimmed.startsWith('#') ? trimmed : `#${trimmed}`).toUpperCase();
};

export interface ColorPickerEnhancedProps {
  value: string;
  onChange: (color: string) => void;
  title?: string;
  colors?: string[];
}

export const ColorPickerEnhanced: React.FC<ColorPickerEnhancedProps> = ({
  value,
  onChange,
  title = '主题颜色',
  colors,
}) => {
  const palette = useMemo(() => colors ?? DEFAULT_COLORS, [colors]);
  const [hexDraft, setHexDraft] = useState(value || '#000000');

  useEffect(() => {
    setHexDraft(value || '#000000');
  }, [value]);

  return (
    <div>
      <div className="text-toolbar__popup-title">{title}</div>
      <div className="text-toolbar__color-grid">
        {palette.map((color) => (
          <button
            key={color}
            type="button"
            className={[
              'text-toolbar__color-swatch',
              value?.toUpperCase() === color.toUpperCase() ? 'is-selected' : '',
            ].join(' ')}
            style={{ backgroundColor: color }}
            title={color}
            onClick={() => onChange(color)}
          />
        ))}
      </div>

      <div className="text-toolbar__popup-footer">
        <div
          className="text-toolbar__custom-color"
          title="自定义颜色"
          style={{ backgroundColor: value || '#000000' }}
        >
          <input
            type="color"
            value={isValidHexColor((value || '').toUpperCase()) ? (value || '#000000') : '#000000'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            aria-label="自定义颜色"
          />
        </div>

        <div className="text-toolbar__hex-input">
          <span className="text-toolbar__hex-label">HEX</span>
          <input
            type="text"
            value={hexDraft}
            placeholder="#000000"
            onChange={(e) => {
              const next = normalizeHexInput(e.target.value);
              setHexDraft(next);
              if (isValidHexColor(next)) {
                onChange(next);
              }
            }}
            onBlur={() => {
              const next = normalizeHexInput(hexDraft);
              setHexDraft(next);
              if (isValidHexColor(next)) {
                onChange(next);
              } else {
                setHexDraft(value || '#000000');
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

