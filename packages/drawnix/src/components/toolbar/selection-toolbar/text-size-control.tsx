import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';
import { Transforms, PlaitBoard } from '@plait/core';
import { useBoard } from '@plait-board/react-board';
import './selection-toolbar.scss';

interface TextSizeControlProps {
    element: PlaitDrawElement;
    onSizeChange?: (size: number) => void;
}

export const TextSizeControl: React.FC<TextSizeControlProps> = ({ element, onSizeChange }) => {
    const { t } = useI18n();
    const board = useBoard();

    const getFontSize = (): number => {
        const textStyle = (element as any).textStyle || {};
        return textStyle.fontSize || 16;
    };

    const fontSize = getFontSize();

    const [draft, setDraft] = useState<string>(String(fontSize));

    useEffect(() => {
        setDraft(String(fontSize));
    }, [fontSize]);

    const clampSize = useCallback((value: number) => Math.max(8, Math.min(200, value)), []);

    const applySize = useCallback((nextSize: number) => {
        const newSize = clampSize(nextSize);
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
            Transforms.setNode(board, { textStyle: newElement.textStyle }, [index]);
        }
        // Sync with parent local state for immediate UI feedback
        if (onSizeChange) {
            onSizeChange(newSize);
        }
    }, [board, clampSize, element, onSizeChange]);

    const parsedDraft = useMemo(() => {
        const n = parseInt(draft, 10);
        return Number.isFinite(n) ? n : NaN;
    }, [draft]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (!Number.isNaN(parsedDraft)) {
                applySize(parsedDraft);
            } else {
                setDraft(String(fontSize));
            }
            (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
            setDraft(String(fontSize));
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <div className="text-size-control" title={t('popupToolbar.fontSize') || '字号'}>
            <button
                type="button"
                className="font-size-step"
                aria-label="减小字号"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => applySize((Number.isNaN(parsedDraft) ? fontSize : parsedDraft) - 1)}
            >
                −
            </button>
            <input
                type="text"
                inputMode="numeric"
                className="font-size-input"
                aria-label={t('popupToolbar.fontSize') || '字号'}
                value={draft}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                    const next = e.target.value.replace(/[^\d]/g, '');
                    setDraft(next);
                }}
                onBlur={() => {
                    if (!draft) {
                        setDraft(String(fontSize));
                        return;
                    }
                    const n = parseInt(draft, 10);
                    if (Number.isNaN(n)) {
                        setDraft(String(fontSize));
                        return;
                    }
                    applySize(n);
                }}
                onKeyDown={handleKeyDown}
            />
            <button
                type="button"
                className="font-size-step"
                aria-label="增大字号"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => applySize((Number.isNaN(parsedDraft) ? fontSize : parsedDraft) + 1)}
            >
                +
            </button>
        </div>
    );
};
