import React, { useState, useCallback } from 'react';
import { useBoard } from '@plait-board/react-board';
import { Transforms, getSelectedElements } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';

interface PopupFontFamilyButtonProps {
    fontFamily: string;
}

// 可用字体列表
const FONT_FAMILIES = [
    { value: 'Arial', label: 'Arial' },
    { value: 'Microsoft Yahei', label: '微软雅黑' },
    { value: 'SimSun', label: '宋体' },
    { value: 'SimHei', label: '黑体' },
    { value: 'PingFang SC', label: '苹方' },
    { value: 'Helvetica', label: 'Helvetica' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Times New Roman', label: 'Times New Roman' },
];

export const PopupFontFamilyButton: React.FC<PopupFontFamilyButtonProps> = (props) => {
    const { fontFamily } = props;
    const board = useBoard();
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);

    const handleSelect = useCallback((family: string) => {
        const selectedElements = getSelectedElements(board);
        selectedElements.forEach((element) => {
            if (PlaitDrawElement.isText(element)) {
                // 更新文本元素字体
                const newElement = {
                    ...element,
                    textStyle: {
                        ...(element as any).textStyle,
                        fontFamily: family,
                    },
                };
                Transforms.set(board, newElement, {
                    at: [board.children.findIndex((child: any) => child.id === element.id)],
                });
            }
        });
        setIsOpen(false);
    }, [board]);

    return (
        <div className="popup-font-family-container">
            <button
                className="popup-toolbar-btn popup-font-family-btn"
                onClick={() => setIsOpen(!isOpen)}
                title={t('popupToolbar.fontFamily')}
                style={{ fontFamily }}
            >
                <span className="font-family-label">{fontFamily || '字体'}</span>
                <span className="dropdown-arrow">▼</span>
            </button>
            {isOpen && (
                <div className="popup-font-family-dropdown">
                    {FONT_FAMILIES.map((family) => (
                        <div
                            key={family.value}
                            className={`font-family-option ${fontFamily === family.value ? 'selected' : ''}`}
                            onClick={() => handleSelect(family.value)}
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
