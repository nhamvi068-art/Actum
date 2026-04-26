import React, { useState, useCallback } from 'react';
import { useBoard } from '@plait-board/react-board';
import { getSelectedElements, PlaitBoard, Transforms, PlaitElement } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';
import { updateTextPropertyDeep, DEFAULT_TEXT_STYLE } from '../../../utils/text-style';

interface PopupFontFamilyButtonProps {
    fontFamily: string;
}

// 可用字体列表
const FONT_FAMILIES = [
    { value: 'Inter', label: 'Inter' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Helvetica', label: 'Helvetica' },
    { value: 'Verdana', label: 'Verdana' },
    { value: 'Courier New', label: 'Courier New' },
    { value: 'Microsoft Yahei', label: '微软雅黑' },
    { value: 'Microsoft YaHei', label: '微软雅黑 (YaHei)' },
    { value: 'SimSun', label: '宋体' },
    { value: 'SimHei', label: '黑体' },
    { value: 'PingFang SC', label: '苹方' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Times New Roman', label: 'Times New Roman' },
];

export const PopupFontFamilyButton: React.FC<PopupFontFamilyButtonProps> = (props) => {
    const { fontFamily } = props;
    const board = useBoard();
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);

    // 事件隔离：阻止事件冒泡到画布
    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
    };

    const handleSelect = useCallback((family: string) => {
        const selectedElements = getSelectedElements(board);
        selectedElements.forEach((element: PlaitElement) => {
            if (PlaitDrawElement.isText(element)) {
                const elementIndex = board.children.findIndex((child: any) => child.id === element.id);
                if (elementIndex < 0) return;

                // 使用通用深度更新函数（双轨数据流）
                const newTextChildren = updateTextPropertyDeep(
                    (element.text as any)?.children || [{ text: '' }],
                    'font-family',
                    family
                );

                const newText = {
                    ...element.text,
                    children: newTextChildren,
                    textStyle: {
                        ...((element.text as any)?.textStyle || {}),
                        fontFamily: family
                    }
                };

                // 同时更新宏观 textStyle 和微观 text.children
                Transforms.setNode(
                    board,
                    {
                        textStyle: { ...(element.textStyle || DEFAULT_TEXT_STYLE), fontFamily: family },
                        text: newText
                    },
                    [elementIndex]
                );
            }
        });
        setIsOpen(false);
    }, [board]);

    return (
        <div className="popup-font-family-container" onPointerDown={handlePointerDown}>
            <button
                className="popup-toolbar-btn popup-font-family-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                onPointerDown={handlePointerDown}
                title={t('popupToolbar.fontFamily' as any)}
                style={{ fontFamily }}
            >
                <span className="font-family-label">{fontFamily || '字体'}</span>
                <span className="dropdown-arrow">▼</span>
            </button>
            {isOpen && (
                <div className="popup-font-family-dropdown" onPointerDown={handlePointerDown}>
                    {FONT_FAMILIES.map((family) => (
                        <div
                            key={family.value}
                            className={`font-family-option ${fontFamily === family.value ? 'selected' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSelect(family.value);
                            }}
                            onPointerDown={handlePointerDown}
                            style={{ fontFamily: family.value }}
                        >
                            {family.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
