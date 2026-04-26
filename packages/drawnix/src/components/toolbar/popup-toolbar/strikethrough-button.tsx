import React from 'react';
import { useBoard } from '@plait-board/react-board';
import { PlaitMarkEditor } from '@plait/text-plugins';
import { getTextEditorsByElement } from '@plait/common';
import { useI18n } from '../../../i18n';
import { TextformatStrikethroughIcon } from 'tdesign-icons-react';

interface PopupStrikethroughButtonProps {
    isStrikethrough: boolean;
}

export const PopupStrikethroughButton: React.FC<PopupStrikethroughButtonProps> = (props) => {
    const { isStrikethrough } = props;
    const board = useBoard();
    const { t } = useI18n();

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        const selectedElements = board.getSelectedElements();
        if (selectedElements.length > 0) {
            selectedElements.forEach(element => {
                const editors = getTextEditorsByElement(element);
                editors.forEach(editor => {
                    PlaitMarkEditor.toggleMark(editor, 'strike');
                });
            });
        }
    };

    return (
        <button
            className={`popup-toolbar-btn popup-strikethrough-btn ${isStrikethrough ? 'active' : ''}`}
            onClick={handleClick}
            title={t('popupToolbar.strikethrough') || '删除线'}
        >
            <TextformatStrikethroughIcon />
        </button>
    );
};



