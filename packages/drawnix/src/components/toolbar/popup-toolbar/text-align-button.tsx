import React from 'react';
import { useBoard } from '@plait-board/react-board';
import { AlignEditor } from '@plait/text-plugins';
import { getTextEditorsByElement } from '@plait/common';
import { useI18n } from '../../../i18n';
import { AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined, AlignJustifyOutlined } from '../../icons';

type TextAlign = 'left' | 'center' | 'right' | 'justify';

interface PopupTextAlignButtonProps {
    textAlign: TextAlign;
    onClick?: () => void;
}

export const PopupTextAlignButton: React.FC<PopupTextAlignButtonProps> = (props) => {
    const { textAlign, onClick } = props;
    const board = useBoard();
    const { t } = useI18n();

    // 事件隔离：阻止事件冒泡到画布
    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onClick) {
            onClick();
        }
    };

    const alignOptions: { value: TextAlign; icon: React.ReactNode; title: string }[] = [
        { value: 'left', icon: <AlignLeftOutlined />, title: t('textAlign.left') || '左对齐' },
        { value: 'center', icon: <AlignCenterOutlined />, title: t('textAlign.center') || '居中对齐' },
        { value: 'right', icon: <AlignRightOutlined />, title: t('textAlign.right') || '右对齐' },
        { value: 'justify', icon: <AlignJustifyOutlined />, title: t('textAlign.justify') || '两端对齐' },
    ];

    const currentIcon = alignOptions.find(o => o.value === textAlign)?.icon;

    return (
        <button
            className="popup-toolbar-btn popup-text-align-entry"
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            title={t('textAlign.title') || '文本对齐'}
            type="button"
        >
            <span className="popup-text-align-icon">
                {currentIcon}
            </span>
        </button>
    );
};

export const getAlignOptions = () => {
    return [
        { value: 'left' as TextAlign, icon: <AlignLeftOutlined /> },
        { value: 'center' as TextAlign, icon: <AlignCenterOutlined /> },
        { value: 'right' as TextAlign, icon: <AlignRightOutlined /> },
        { value: 'justify' as TextAlign, icon: <AlignJustifyOutlined /> },
    ];
};

export const handleTextAlignChange = (align: TextAlign) => {
    const board = useBoard();
    const selectedElements = board.getSelectedElements();
    if (selectedElements.length > 0) {
        selectedElements.forEach(element => {
            const editors = getTextEditorsByElement(element);
            editors.forEach(editor => {
                AlignEditor.setAlign(editor, align);
            });
        });
    }
};
