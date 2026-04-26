import React from 'react';
import { useBoard } from '@plait-board/react-board';
import { getSelectedElements, PlaitElement } from '@plait/core';
import { MarkTypes, PlaitMarkEditor } from '@plait/text-plugins';
import { getTextEditorsByElement } from '@plait/common';
import { useI18n } from '../../../i18n';
import { TextformatBoldIcon } from 'tdesign-icons-react';

interface PopupBoldButtonProps {
    isBold: boolean;
}

export const PopupBoldButton: React.FC<PopupBoldButtonProps> = (props) => {
    const { isBold } = props;
    const board = useBoard();
    const { t } = useI18n();

    // 事件隔离：阻止事件冒泡到画布
    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        // 直接使用 board.getSelectedElements 获取选中的元素
        const selectedElements = board.getSelectedElements();
        if (selectedElements.length > 0) {
            // 直接获取每个元素的 text editors 并应用 bold
            selectedElements.forEach(element => {
                const editors = getTextEditorsByElement(element);
                editors.forEach(editor => {
                    PlaitMarkEditor.toggleMark(editor, 'bold');
                });
            });
        }
    };

    return (
        <button
            className={`popup-toolbar-btn popup-bold-btn ${isBold ? 'active' : ''}`}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            title={t('popupToolbar.bold')}
        >
            <TextformatBoldIcon />
        </button>
    );
};
