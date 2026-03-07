import React from 'react';
import { useBoard } from '@plait-board/react-board';
import { Transforms, getSelectedElements } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';
import { TextItalicIcon } from '../../icons';

interface PopupItalicButtonProps {
    isItalic: boolean;
}

export const PopupItalicButton: React.FC<PopupItalicButtonProps> = (props) => {
    const { isItalic } = props;
    const board = useBoard();
    const { t } = useI18n();

    const handleClick = () => {
        const selectedElements = getSelectedElements(board);
        const newItalic = !isItalic;
        selectedElements.forEach((element) => {
            if (PlaitDrawElement.isText(element)) {
                const newElement = {
                    ...element,
                    textStyle: {
                        ...(element as any).textStyle,
                        italic: newItalic,
                    },
                };
                const index = board.children.findIndex((child: any) => child.id === element.id);
                if (index >= 0) {
                    Transforms.setNode(board, { textStyle: newElement.textStyle }, [index]);
                }
            }
        });
    };

    return (
        <button
            className={`popup-toolbar-btn popup-italic-btn ${isItalic ? 'active' : ''}`}
            onClick={handleClick}
            title={t('popupToolbar.italic') || '斜体'}
        >
            <TextItalicIcon />
        </button>
    );
};



