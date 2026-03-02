import React from 'react';
import { useBoard } from '@plait-board/react-board';
import { Transforms, getSelectedElements } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';
import { TextUnderlineIcon } from '../../icons';

interface PopupUnderlineButtonProps {
    isUnderline: boolean;
}

export const PopupUnderlineButton: React.FC<PopupUnderlineButtonProps> = (props) => {
    const { isUnderline } = props;
    const board = useBoard();
    const { t } = useI18n();

    const handleClick = () => {
        const selectedElements = getSelectedElements(board);
        const newUnderline = !isUnderline;
        selectedElements.forEach((element) => {
            if (PlaitDrawElement.isText(element)) {
                const newElement = {
                    ...element,
                    textStyle: {
                        ...(element as any).textStyle,
                        underline: newUnderline,
                    },
                };
                Transforms.set(board, newElement, {
                    at: [board.children.findIndex((child: any) => child.id === element.id)],
                });
            }
        });
    };

    return (
        <button
            className={`popup-toolbar-btn popup-underline-btn ${isUnderline ? 'active' : ''}`}
            onClick={handleClick}
            title={t('popupToolbar.underline') || '下划线'}
        >
            <TextUnderlineIcon />
        </button>
    );
};



