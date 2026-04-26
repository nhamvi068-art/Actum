import React from 'react';
import { useBoard } from '@plait-board/react-board';
import { PlaitMarkEditor } from '@plait/text-plugins';
import { getTextEditorsByElement } from '@plait/common';
import { useI18n } from '../../../i18n';
import { TextformatItalicIcon } from 'tdesign-icons-react';

interface PopupItalicButtonProps {
    isItalic: boolean;
}

export const PopupItalicButton: React.FC<PopupItalicButtonProps> = (props) => {
    const { isItalic } = props;
    const board = useBoard();
    const { t } = useI18n();

    // 事件隔离：阻止事件冒泡到画布
    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        const selectedElements = board.getSelectedElements();
        if (selectedElements.length > 0) {
            selectedElements.forEach(element => {
                const editors = getTextEditorsByElement(element);
                editors.forEach(editor => {
                    PlaitMarkEditor.toggleMark(editor, 'italic');
                });
            });
        }
    };

    return (
        <button
            className={`popup-toolbar-btn popup-italic-btn ${isItalic ? 'active' : ''}`}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            title={t('popupToolbar.italic') || '斜体'}
        >
            <TextformatItalicIcon />
        </button>
    );
};



