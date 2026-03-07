import React, { useState, useCallback } from 'react';
import { useBoard } from '@plait-board/react-board';
import { Transforms, getSelectedElements, PlaitElement } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';

interface PopupFontSizeButtonProps {
    fontSize: number;
}

export const PopupFontSizeButton: React.FC<PopupFontSizeButtonProps> = (props) => {
    const { fontSize } = props;
    const board = useBoard();
    const { t } = useI18n();
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(fontSize.toString());

    const handleClick = () => {
        setIsEditing(true);
        setInputValue(fontSize.toString());
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInputValue(value);
    };

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        const newSize = parseInt(inputValue, 10);
        if (!isNaN(newSize) && newSize >= 8 && newSize <= 200) {
            const selectedElements = getSelectedElements(board);
            selectedElements.forEach((element) => {
                if (PlaitDrawElement.isText(element)) {
                    // 更新文本元素样式
                    const newElement = {
                        ...element,
                        textStyle: {
                            ...(element as any).textStyle,
                            fontSize: newSize,
                        },
                    };
                    const index = board.children.findIndex((child: any) => child.id === element.id);
                    if (index >= 0) {
                        Transforms.setNode(board, { textStyle: newElement.textStyle }, [index]);
                    }
                }
            });
        }
    }, [board, inputValue]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBlur();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <div className="popup-font-size-edit">
                <input
                    type="number"
                    min={8}
                    max={200}
                    value={inputValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    className="font-size-input"
                />
            </div>
        );
    }

    return (
        <button
            className="popup-toolbar-btn"
            onClick={handleClick}
            title={t('popupToolbar.fontSize')}
        >
            <span className="font-size-label">{fontSize}</span>
        </button>
    );
};
