import React, { useMemo } from 'react';

export type PresetTextStyle = {
  label: string;
  fontSize: number;
  bold: boolean;
};

const DEFAULT_PRESETS: PresetTextStyle[] = [
  { label: '大标题', fontSize: 36, bold: true },
  { label: '副标题', fontSize: 24, bold: true },
  { label: '小标题', fontSize: 20, bold: true },
  { label: '正文', fontSize: 16, bold: false },
  { label: '注释', fontSize: 12, bold: false },
];

export interface PresetStyleDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: { fontSize: number; bold: boolean };
  onSelect: (preset: PresetTextStyle) => void;
  presets?: PresetTextStyle[];
}

export const PresetStyleDropdown: React.FC<PresetStyleDropdownProps> = ({
  open,
  onOpenChange,
  value,
  onSelect,
  presets,
}) => {
  const items = useMemo(() => presets ?? DEFAULT_PRESETS, [presets]);
  const activeLabel =
    items.find((p) => p.fontSize === value.fontSize && p.bold === value.bold)?.label ||
    '自定义';

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        className="text-toolbar__select-btn"
        onClick={() => onOpenChange(!open)}
        aria-label="预设样式"
        title="预设样式"
      >
        <span className="text-toolbar__select-label">{activeLabel}</span>
        <span aria-hidden="true" style={{ color: '#9ca3af', fontSize: 12 }}>
          ▼
        </span>
      </button>

      {open && (
        <div
          className="text-toolbar__popup text-toolbar__dropdown"
          style={{ left: 0 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {items.map((preset) => {
            const selected = preset.fontSize === value.fontSize && preset.bold === value.bold;
            return (
              <button
                key={preset.label}
                type="button"
                className={[
                  'text-toolbar__dropdown-item',
                  selected ? 'is-selected' : '',
                ].join(' ')}
                onClick={() => {
                  onSelect(preset);
                  onOpenChange(false);
                }}
              >
                <span style={{ fontWeight: preset.bold ? 700 : 400 }}>{preset.label}</span>
                <span className="text-toolbar__dropdown-right">{preset.fontSize}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

