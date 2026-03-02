import React, { useState } from 'react';
import { useBoard } from '@plait-board/react-board';
import { Transforms, getSelectedElements } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';
import { AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined, AlignJustifyOutlined } from '../../icons';

type TextAlign = 'left' | 'center' | 'right' | 'justify';

interface PopupTextAlignButtonProps {
    textAlign: TextAlign;
}

export const PopupTextAlignButton: React.FC<PopupTextAlignButtonProps> = (props) => {
    const { textAlign } = props;
    const board = useBoard();
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);

    const alignOptions: { value: TextAlign; icon: React.ReactNode; title: string }[] = [
        { value: 'left', icon: <AlignLeftOutlined />, title: t('textAlign.left') || '左对齐' },
        { value: 'center', icon: <AlignCenterOutlined />, title: t('textAlign.center') || '居中对齐' },
        { value: 'right', icon: <AlignRightOutlined />, title: t('textAlign.right') || '右对齐' },
        { value: 'justify', icon: <AlignJustifyOutlined />, title: t('textAlign.justify') || '两端对齐' },
    ];

    const handleAlignChange = (align: TextAlign) => {
        const selectedElements = getSelectedElements(board);
        selectedElements.forEach((element) => {
            if (PlaitDrawElement.isText(element)) {
                const newElement = {
                    ...element,
                    textStyle: {
                        ...(element as any).textStyle,
                        textAlign: align,
                    },
                };
                Transforms.set(board, newElement, {
                    at: [board.children.findIndex((child: any) => child.id === element.id)],
                });
            }
        });
        setIsOpen(false);
    };

    const currentIcon = alignOptions.find(o => o.value === textAlign)?.icon;

    return (
        <div className="popup-text-align-container">
            <button
                className={`popup-toolbar-btn popup-text-align-btn`}
                onClick={() => setIsOpen(!isOpen)}
                title={t('textAlign.title') || '文本对齐'}
            >
                {currentIcon}
            </button>
            {isOpen && (
                <div className="popup-text-align-dropdown">
                    {alignOptions.map(option => (
                        <button
                            key={option.value}
                            className={`popup-toolbar-btn ${textAlign === option.value ? 'active' : ''}`}
                            onClick={() => handleAlignChange(option.value)}
                            title={option.title}
                        >
                            {option.icon}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};



