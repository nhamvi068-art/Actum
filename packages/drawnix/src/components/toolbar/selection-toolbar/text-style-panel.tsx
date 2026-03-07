import React, { useState } from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { ToolButton } from '../../tool-button';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard, Transforms } from '@plait/core';
import { Island } from '../../island';
import { ColorPicker } from '../../color-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { useI18n } from '../../../i18n';
import { hexAlphaToOpacity, isFullyTransparent, removeHexAlpha } from '../../../utils/color';
import { FontColorIcon, TextBoldIcon, TextItalicIcon, TextUnderlineIcon, TextStrikethroughIcon } from '../../icons';
import classNames from 'classnames';
import './selection-toolbar.scss';
import {
    setFillColor,
    setFillColorOpacity,
} from '../../../transforms/property';

interface TextStylePanelProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    element: PlaitDrawElement;
}

export const TextStylePanel: React.FC<TextStylePanelProps> = ({
    visible,
    onVisibleChange,
    element,
}) => {
    const { t } = useI18n();
    const board = PlaitBoard.getBoardFromElement(element);
    const [stylePanelOpen, setStylePanelOpen] = useState(false);

    // Get current text marks
    const getTextMarks = () => {
        const textStyle = (element as any).textStyle || {};
        return {
            fontSize: textStyle.fontSize || 16,
            fontFamily: textStyle.fontFamily || 'Arial',
            color: textStyle.color || '#000000',
            bold: textStyle.bold || false,
            italic: textStyle.italic || false,
            underline: textStyle.underline || false,
            strikethrough: textStyle.strikethrough || false,
            lineHeight: textStyle.lineHeight || 1.5,
            letterSpacing: textStyle.letterSpacing || 0,
        };
    };

    const marks = getTextMarks();

    const updateTextStyle = (updates: Partial<typeof marks>) => {
        const textStyle = (element as any).textStyle || {};
        const newElement = {
            ...element,
            textStyle: {
                ...textStyle,
                ...updates,
            },
        };
        const index = board.children.findIndex((child: any) => child.id === element.id);
        if (index >= 0) {
            Transforms.setNode(board, { textStyle: newElement.textStyle }, [index]);
        }
    };

    const toggleStyle = (style: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
        updateTextStyle({ [style]: !marks[style] });
    };

    const container = PlaitBoard.getBoardContainer(board);

    return (
        <Popover
            sideOffset={12}
            open={stylePanelOpen}
            onOpenChange={(open) => {
                setStylePanelOpen(open);
                onVisibleChange(open);
            }}
            placement={'top'}
        >
            <PopoverTrigger asChild>
                <ToolButton
                    className={classNames(`property-button`)}
                    visible={true}
                    type="button"
                    title={t('textStyle.panel') || '文本样式'}
                    aria-label={t('textStyle.panel') || '文本样式'}
                >
                    <span style={{ fontSize: '16px', fontWeight: 'bold' }}>A</span>
                </ToolButton>
            </PopoverTrigger>
            <PopoverContent container={container}>
                <Island
                    padding={3}
                    className={classNames(`${ATTACHED_ELEMENT_CLASS_NAME}`)}
                >
                    <div className="text-style-panel">
                        {/* Font Family */}
                        <div className="style-section">
                            <select
                                className="font-family-select"
                                value={marks.fontFamily}
                                onChange={(e) => updateTextStyle({ fontFamily: e.target.value })}
                            >
                                <option value="Arial">Arial</option>
                                <option value="Helvetica">Helvetica</option>
                                <option value="Times New Roman">Times New Roman</option>
                                <option value="Georgia">Georgia</option>
                                <option value="Courier New">Courier New</option>
                                <option value="Verdana">Verdana</option>
                                <option value="Tahoma">Tahoma</option>
                            </select>
                        </div>

                        {/* Font Size */}
                        <div className="style-section">
                            <input
                                type="number"
                                className="font-size-input"
                                value={marks.fontSize}
                                min={8}
                                max={200}
                                onChange={(e) => updateTextStyle({ fontSize: parseInt(e.target.value) || 16 })}
                            />
                        </div>

                        {/* Divider */}
                        <div className="style-divider" />

                        {/* Text Color */}
                        <div className="style-section">
                            <ColorPicker
                                onColorChange={(selectedColor: string) => {
                                    updateTextStyle({ color: selectedColor });
                                }}
                                currentColor={marks.color}
                            />
                        </div>

                        {/* Divider */}
                        <div className="style-divider" />

                        {/* Style Buttons */}
                        <div className="style-buttons">
                            <ToolButton
                                type="icon"
                                icon={<TextBoldIcon />}
                                visible={true}
                                title={t('textStyle.bold') || '加粗'}
                                selected={marks.bold}
                                onPointerUp={() => toggleStyle('bold')}
                            />
                            <ToolButton
                                type="icon"
                                icon={<TextItalicIcon />}
                                visible={true}
                                title={t('textStyle.italic') || '斜体'}
                                selected={marks.italic}
                                onPointerUp={() => toggleStyle('italic')}
                            />
                            <ToolButton
                                type="icon"
                                icon={<TextUnderlineIcon />}
                                visible={true}
                                title={t('textStyle.underline') || '下划线'}
                                selected={marks.underline}
                                onPointerUp={() => toggleStyle('underline')}
                            />
                            <ToolButton
                                type="icon"
                                icon={<TextStrikethroughIcon />}
                                visible={true}
                                title={t('textStyle.strikethrough') || '删除线'}
                                selected={marks.strikethrough}
                                onPointerUp={() => toggleStyle('strikethrough')}
                            />
                        </div>

                        {/* Divider */}
                        <div className="style-divider" />

                        {/* Line Height */}
                        <div className="style-section">
                            <label className="style-label">{t('textStyle.lineHeight') || '行高'}</label>
                            <input
                                type="number"
                                className="style-input"
                                value={marks.lineHeight}
                                min={0.5}
                                max={3}
                                step={0.1}
                                onChange={(e) => updateTextStyle({ lineHeight: parseFloat(e.target.value) || 1.5 })}
                            />
                        </div>

                        {/* Letter Spacing */}
                        <div className="style-section">
                            <label className="style-label">{t('textStyle.letterSpacing') || '字间距'}</label>
                            <input
                                type="number"
                                className="style-input"
                                value={marks.letterSpacing}
                                min={-5}
                                max={20}
                                step={1}
                                onChange={(e) => updateTextStyle({ letterSpacing: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                    </div>
                </Island>
            </PopoverContent>
        </Popover>
    );
};
