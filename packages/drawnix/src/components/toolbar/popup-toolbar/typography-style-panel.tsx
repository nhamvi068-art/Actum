import React from 'react';
import { useBoard } from '@plait-board/react-board';
import { Transforms, PlaitBoard } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { updateTextPropertyDeep, DEFAULT_TEXT_STYLE } from '../../../utils/text-style';

// 字体样式预设（与截图一致）
const TYPOGRAPHY_STYLES = [
  { name: '标题', fontSize: 44, fontWeight: 700, bold: true },
  { name: '副标题', fontSize: 32, fontWeight: 600, bold: true },
  { name: '标题1', fontSize: 32, fontWeight: 600, bold: true },
  { name: '标题2', fontSize: 28, fontWeight: 600, bold: true },
  { name: '标题3', fontSize: 24, fontWeight: 600, bold: true },
  { name: '标题4', fontSize: 20, fontWeight: 600, bold: true },
  { name: '正文', fontSize: 18, fontWeight: 400, bold: false },
  { name: '注释', fontSize: 16, fontWeight: 400, bold: false },
];

interface TypographyStylePanelProps {
  onClose?: () => void;
}

// 字体样式预设面板
export const TypographyStylePanel: React.FC<TypographyStylePanelProps> = ({ onClose }) => {
  const board = useBoard();

  // 应用字体样式
  const applyTypographyStyle = (fontSize: number, fontWeight: number, bold: boolean) => {
    if (!board) return;

    const selectedElements = board.getSelectedElements();
    selectedElements.forEach((element: any) => {
      if (!PlaitDrawElement.isText(element)) return;
      const elementIndex = board.children.findIndex((child: any) => child.id === element.id);
      if (elementIndex < 0) return;

      // 使用通用深度更新函数更新字号
      let newTextChildren = updateTextPropertyDeep(
        (element.text as any)?.children || [{ text: '' }],
        'font-size',
        fontSize
      );

      // 同时更新 fontWeight
      newTextChildren = updateTextPropertyDeep(
        newTextChildren,
        'font-weight',
        fontWeight
      );

      // 处理 bold 标记
      newTextChildren = updateTextPropertyDeep(
        newTextChildren,
        'bold',
        bold
      );

      const newText = {
        ...element.text,
        children: newTextChildren,
        textStyle: { ...((element.text as any)?.textStyle || {}), fontSize, fontWeight }
      };

      Transforms.setNode(
        board,
        {
          textStyle: { ...(element.textStyle || DEFAULT_TEXT_STYLE), fontSize, fontWeight },
          text: newText
        },
        [elementIndex]
      );
    });

    // 关闭面板
    onClose?.();
  };

  // 事件隔离：防止画布失焦
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="typography-style-panel"
      onPointerDown={handlePointerDown}
    >
      {/* 预设列表 */}
      <div className="typography-panel-list">
        {TYPOGRAPHY_STYLES.map((style) => (
          <div
            key={style.name}
            className="size-dropdown-item"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              applyTypographyStyle(style.fontSize, style.fontWeight, style.bold);
            }}
          >
            <span
              className="size-dropdown-item-name"
              style={{
                fontSize: Math.min(style.fontSize, 20),
                fontWeight: style.fontWeight,
              }}
            >
              {style.name}
            </span>
            <span className="size-dropdown-item-spec">{style.fontSize}px</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// 独立的字体样式入口按钮（可单独使用）
export const TypographyStyleButton: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false);

  // 事件隔离
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="typography-style-container" onPointerDown={handlePointerDown}>
      <button
        className="popup-toolbar-btn typography-style-btn"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        title="字体样式"
      >
        <svg
          className="typography-style-h-svg"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          {/* 大写 H：与 B/I/U 同风格的描边路径 */}
          <path
            d="M7 5V19M17 5V19M7 12H17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isOpen && (
        <TypographyStylePanel onClose={() => setIsOpen(false)} />
      )}
    </div>
  );
};
