import React, { useState, useRef, useEffect } from 'react';
import { useBoard } from '@plait-board/react-board';
import { Transforms } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { useI18n } from '../../../i18n';
import { updateTextPropertyDeep, DEFAULT_TEXT_STYLE } from '../../../utils/text-style';

// 可用字号预设
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64];

interface PopupFontSizeButtonProps {
    fontSize: number;
}

export const PopupFontSizeButton: React.FC<PopupFontSizeButtonProps> = (props) => {
    const { fontSize } = props;
    const board = useBoard();
    const { t } = useI18n();
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedElements = (board as any).getSelectedElements?.() || [];
    const primaryElement = selectedElements[0];
    const currentSize = primaryElement?.textStyle?.fontSize || fontSize || 14;

    // 同步当前字号
    useEffect(() => {
        if (!isEditing) {
            setInputValue(String(currentSize));
        }
    }, [currentSize, isEditing]);

    // 输入框聚焦时自动选中
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.select();
        }
    }, [isEditing]);

    // 应用字号到选中文本
    const applyFontSize = (newSize: number) => {
        const validSize = Math.max(8, Math.min(200, newSize));

        selectedElements.forEach((element: any) => {
            if (!PlaitDrawElement.isText(element)) return;
            const elementIndex = board.children.findIndex((child: any) => child.id === element.id);
            if (elementIndex < 0) return;

            // 使用通用深度更新函数
            const newTextChildren = updateTextPropertyDeep(
                (element.text as any)?.children || [{ text: '' }],
                'font-size',
                validSize
            );
            const newText = {
                ...element.text,
                children: newTextChildren,
                textStyle: { ...((element.text as any)?.textStyle || {}), fontSize: validSize }
            };

            Transforms.setNode(
                board,
                {
                    textStyle: { ...(element.textStyle || DEFAULT_TEXT_STYLE), fontSize: validSize },
                    text: newText
                },
                [elementIndex]
            );
        });
    };

    // 递增字号
    const handleIncrease = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newSize = Math.min(200, currentSize + 1);
        applyFontSize(newSize);
    };

    // 递减字号
    const handleDecrease = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newSize = Math.max(8, currentSize - 1);
        applyFontSize(newSize);
    };

    // 开始编辑
    const handleDisplayClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
        setInputValue(String(currentSize));
    };

    // 输入框变化
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^0-9]/g, '');
        setInputValue(value);
    };

    // 确认输入
    const handleInputConfirm = () => {
        const newSize = parseInt(inputValue, 10);
        if (!isNaN(newSize) && newSize >= 8 && newSize <= 200) {
            applyFontSize(newSize);
        } else {
            setInputValue(String(currentSize));
        }
        setIsEditing(false);
    };

    // 快捷键处理
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleInputConfirm();
        } else if (e.key === 'Escape') {
            setInputValue(String(currentSize));
            setIsEditing(false);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const newSize = Math.min(200, (parseInt(inputValue, 10) || currentSize) + 1);
            setInputValue(String(newSize));
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const newSize = Math.max(8, (parseInt(inputValue, 10) || currentSize) - 1);
            setInputValue(String(newSize));
        }
    };

    // 选择预设字号
    const handleSelectPreset = (size: number) => {
        applyFontSize(size);
        setIsDropdownOpen(false);
    };

    // 事件隔离
    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
    };

    return (
        <div 
            className="popup-font-size-container"
            onPointerDown={handlePointerDown}
        >
            <button
                className="popup-toolbar-btn popup-font-size-btn popup-font-size-decrease"
                onPointerDown={handlePointerDown}
                onClick={handleDecrease}
                title={t('popupToolbar.fontSizeDecrease' as any) || '减小字号'}
            >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </button>

            <div className="popup-font-size-display">
                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        className="font-size-input"
                        value={inputValue}
                        onChange={handleInputChange}
                        onBlur={handleInputConfirm}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                ) : (
                    <button
                        className="font-size-display-btn"
                        onClick={handleDisplayClick}
                        onPointerDown={handlePointerDown}
                        title={t('popupToolbar.fontSizeEdit' as any) || '点击编辑字号'}
                    >
                        {currentSize}
                        <span className="font-size-unit">px</span>
                    </button>
                )}
            </div>

            <button
                className="popup-toolbar-btn popup-font-size-btn popup-font-size-increase"
                onPointerDown={handlePointerDown}
                onClick={handleIncrease}
                title={t('popupToolbar.fontSizeIncrease' as any) || '增大字号'}
            >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </button>

            <button
                className="popup-toolbar-btn popup-font-size-dropdown-btn"
                onPointerDown={handlePointerDown}
                onClick={(e) => {
                    e.stopPropagation();
                    setIsDropdownOpen(!isDropdownOpen);
                }}
                title={t('popupToolbar.fontSizePresets' as any) || '字号预设'}
            >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {isDropdownOpen && (
                <div className="popup-font-size-dropdown" onPointerDown={handlePointerDown}>
                    {FONT_SIZES.map((size) => (
                        <div
                            key={size}
                            className={`font-size-option ${currentSize === size ? 'selected' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSelectPreset(size);
                            }}
                            onPointerDown={handlePointerDown}
                        >
                            {size}px
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
