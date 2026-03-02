import React from 'react';
import { useBoard } from '@plait-board/react-board';
import { Transforms, getSelectedElements } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';

interface PopupBoldButtonProps {
    isBold: boolean;
}

export const PopupBoldButton: React.FC<PopupBoldButtonProps> = (props) => {
    const { isBold } = props;
    const board = useBoard();
    const { t } = useI18n();

    const handleClick = () => {
        const selectedElements = getSelectedElements(board);
        const newBold = !isBold;
        selectedElements.forEach((element) => {
            if (PlaitDrawElement.isText(element)) {
                // 更新文本元素粗体
                const newElement = {
                    ...element,
                    textStyle: {
                        ...(element as any).textStyle,
                        bold: newBold,
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
            className={`popup-toolbar-btn popup-bold-btn ${isBold ? 'active' : ''}`}
            onClick={handleClick}
            title={t('popupToolbar.bold')}
        >
            <span style={{ fontWeight: isBold ? 'bold' : 'normal' }}>B</span>
        </button>
    );
};
