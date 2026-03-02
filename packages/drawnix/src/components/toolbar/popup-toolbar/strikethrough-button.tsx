import React from 'react';
import { useBoard } from '@plait-board/react-board';
import { Transforms, getSelectedElements } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';
import { TextStrikethroughIcon } from '../../icons';

interface PopupStrikethroughButtonProps {
    isStrikethrough: boolean;
}

export const PopupStrikethroughButton: React.FC<PopupStrikethroughButtonProps> = (props) => {
    const { isStrikethrough } = props;
    const board = useBoard();
    const { t } = useI18n();

    const handleClick = () => {
        const selectedElements = getSelectedElements(board);
        const newStrikethrough = !isStrikethrough;
        selectedElements.forEach((element) => {
            if (PlaitDrawElement.isText(element)) {
                const newElement = {
                    ...element,
                    textStyle: {
                        ...(element as any).textStyle,
                        strikethrough: newStrikethrough,
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
            className={`popup-toolbar-btn popup-strikethrough-btn ${isStrikethrough ? 'active' : ''}`}
            onClick={handleClick}
            title={t('popupToolbar.strikethrough') || '删除线'}
        >
            <TextStrikethroughIcon />
        </button>
    );
};



