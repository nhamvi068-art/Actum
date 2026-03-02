import React, { useState, useCallback } from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';
import { Transforms, PlaitBoard } from '@plait/core';
import { ToolButton } from '../../tool-button';
import './selection-toolbar.scss';

interface TextSizeControlProps {
    element: PlaitDrawElement;
}

export const TextSizeControl: React.FC<TextSizeControlProps> = ({ element }) => {
    const { t } = useI18n();
    const board = PlaitBoard.getBoardFromElement(element);
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(16);

    const getFontSize = (): number => {
        const textStyle = (element as any).textStyle || {};
        return textStyle.fontSize || 16;
    };

    const fontSize = getFontSize();

    const handleClick = () => {
        setIsEditing(true);
        setInputValue(fontSize);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInputValue(parseInt(value) || 16);
    };

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        const newSize = Math.max(8, Math.min(200, inputValue));
        const textStyle = (element as any).textStyle || {};
        const newElement = {
            ...element,
            textStyle: {
                ...textStyle,
                fontSize: newSize,
            },
        };
        const index = board.children.findIndex((child: any) => child.id === element.id);
        if (index >= 0) {
            Transforms.set(board, newElement, { at: [index] });
        }
    }, [board, element, inputValue]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBlur();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <div className="text-size-control">
                <input
                    type="number"
                    className="font-size-input"
                    value={inputValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    min={8}
                    max={200}
                />
            </div>
        );
    }

    return (
        <ToolButton
            type="button"
            visible={true}
            onClick={handleClick}
            title={t('popupToolbar.fontSize') || '字号'}
            aria-label={t('popupToolbar.fontSize') || '字号'}
        >
            <span className="font-size-label">{fontSize}</span>
        </ToolButton>
    );
};
