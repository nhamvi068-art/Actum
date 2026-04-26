import React from 'react';
import { useBoard } from '@plait-board/react-board';
import { PlaitMarkEditor } from '@plait/text-plugins';
import { getTextEditorsByElement } from '@plait/common';
import { useI18n } from '../../../i18n';
import { TextformatUnderlineIcon } from 'tdesign-icons-react';

interface PopupUnderlineButtonProps {
    isUnderline: boolean;
}

export const PopupUnderlineButton: React.FC<PopupUnderlineButtonProps> = (props) => {
    const { isUnderline } = props;
    const board = useBoard();
    const { t } = useI18n();

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        const selectedElements = board.getSelectedElements();
        if (selectedElements.length > 0) {
            selectedElements.forEach(element => {
                const editors = getTextEditorsByElement(element);
                editors.forEach(editor => {
                    PlaitMarkEditor.toggleMark(editor, 'underlined');
                });
            });
        }
    };

    return (
        <button
            className={`popup-toolbar-btn popup-underline-btn ${isUnderline ? 'active' : ''}`}
            onClick={handleClick}
            title={t('popupToolbar.underline') || '下划线'}
        >
            <TextformatUnderlineIcon />
        </button>
    );
};



