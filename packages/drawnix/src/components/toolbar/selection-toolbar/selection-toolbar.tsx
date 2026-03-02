import React, { useMemo, useState, useEffect } from 'react';
import { useBoard } from '@plait-board/react-board';
import { getSelectedElements, PlaitElement, PlaitBoard, Transforms, RectangleClient, toScreenPointFromHostPoint, toHostPointFromViewBoxPoint } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { Island } from '../../island';
import { ToolButton } from '../../tool-button';
import './selection-toolbar.scss';
import { flip, offset, useFloating } from '@floating-ui/react';
import {
    AlignCenterOutlined,
    AlignLeftOutlined,
    AlignRightOutlined,
    AlignJustifyOutlined,
    LayersOutlined,
    SizeOutlined,
    LinkOutlined,
    LinkBrokenOutlined,
    LockOnIcon,
    LockOffIcon,
    DuplicateIcon,
    TrashIcon,
    ChevronDownIcon,
} from '../../icons';
import classNames from 'classnames';
import { useI18n } from '../../../i18n';
import { TextStylePanel } from './text-style-panel';
import { TextSizeControl } from './text-size-control';
import { TextLinkButton } from './text-link-button';
import { AITextButton } from './ai-text-button';
import { FillSettingPanel } from './fill-setting-panel';
import { LayerControl } from './layer-control';
import { SizeControl } from './size-control';
import { MorePropertyPanel } from './more-property-panel';
import { CopyElementButton } from './copy-element-button';
import { DeleteElementButton } from './delete-element-button';
import './selection-toolbar.scss';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export const SelectionToolbar: React.FC = () => {
    const board = useBoard();
    const { t } = useI18n();
    const [stylePanelVisible, setStylePanelVisible] = useState(false);

    // Use floating-ui for positioning
    const { refs, floatingStyles } = useFloating({
        placement: 'top-start',
        middleware: [offset(8), flip()],
    });

    // Check if only one text element is selected
    const isTextSelected = useMemo(() => {
        const selectedElements = getSelectedElements(board);
        return (
            selectedElements.length === 1 &&
            PlaitDrawElement.isText(selectedElements[0])
        );
    }, [board]);

    // Set position reference based on selected element
    useEffect(() => {
        if (!board || !isTextSelected) return;

        const selectedElement = getSelectedElements(board)[0];
        const rectangle = RectangleClient.getElementRectangle(selectedElement);

        if (rectangle) {
            const { x: startX, y: startY, width, height } = rectangle;
            const screenStart = toScreenPointFromHostPoint(
                board,
                toHostPointFromViewBoxPoint(board, [startX, startY])
            );
            const screenEnd = toScreenPointFromHostPoint(
                board,
                toHostPointFromViewBoxPoint(board, [startX + width, startY + height])
            );

            refs.setPositionReference({
                getBoundingClientRect() {
                    return {
                        width: screenEnd[0] - screenStart[0],
                        height: screenEnd[1] - screenStart[1],
                        x: screenStart[0],
                        y: screenStart[1],
                        top: screenStart[1],
                        left: screenStart[0],
                        right: screenStart[0] + (screenEnd[0] - screenStart[0]),
                        bottom: screenStart[1] + (screenEnd[1] - screenStart[1]),
                    };
                },
            });
        }
    }, [board, isTextSelected, refs]);

    if (!isTextSelected || !board) return null;

    const selectedElement = getSelectedElements(board)[0] as PlaitDrawElement;

    return (
        <Island
            ref={refs.setFloating}
            style={floatingStyles}
            className="selection-toolbar"
            padding={1}
        >
            {/* Text Style Panel - Big A icon */}
            <TextStylePanel
                visible={stylePanelVisible}
                onVisibleChange={setStylePanelVisible}
                element={selectedElement}
            />

            {/* Font Size Control */}
            <TextSizeControl element={selectedElement} />

            {/* Divider */}
            <div className="toolbar-divider" />

            {/* Link Button */}
            <TextLinkButton element={selectedElement} />

            {/* AI Text Button (placeholder) */}
            <AITextButton element={selectedElement} />

            {/* Text Align Control */}
            <TextAlignControl element={selectedElement} />

            {/* Fill Setting */}
            <FillSettingPanel element={selectedElement} />

            {/* Layer Control */}
            <LayerControl element={selectedElement} />

            {/* Divider */}
            <div className="toolbar-divider" />

            {/* Size Control */}
            <SizeControl element={selectedElement} />

            {/* More Property Panel */}
            <MorePropertyPanel element={selectedElement} />

            {/* Divider */}
            <div className="toolbar-divider" />

            {/* Copy Button */}
            <CopyElementButton element={selectedElement} />

            {/* Delete Button */}
            <DeleteElementButton element={selectedElement} />
        </Island>
    );
};

// Text Align Control Component
interface TextAlignControlProps {
    element: PlaitDrawElement;
}

export const TextAlignControl: React.FC<TextAlignControlProps> = ({ element }) => {
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const board = PlaitBoard.getBoardFromElement(element);

    const getTextAlign = (): TextAlign => {
        const textStyle = (element as any).textStyle || {};
        return textStyle.textAlign || 'left';
    };

    const currentAlign = getTextAlign();

    const alignOptions: { value: TextAlign; icon: React.ReactNode; title: string }[] = [
        { value: 'left', icon: <AlignLeftOutlined />, title: t('textAlign.left') || '左对齐' },
        { value: 'center', icon: <AlignCenterOutlined />, title: t('textAlign.center') || '居中对齐' },
        { value: 'right', icon: <AlignRightOutlined />, title: t('textAlign.right') || '右对齐' },
        { value: 'justify', icon: <AlignJustifyOutlined />, title: t('textAlign.justify') || '两端对齐' },
    ];

    const handleAlignChange = (align: TextAlign) => {
        const textStyle = (element as any).textStyle || {};
        const newElement = {
            ...element,
            textStyle: {
                ...textStyle,
                textAlign: align,
            },
        };
        const index = board.children.findIndex((child: any) => child.id === element.id);
        if (index >= 0) {
            Transforms.set(board, newElement, { at: [index] });
        }
        setIsOpen(false);
    };

    return (
        <div className="text-align-control">
            <ToolButton
                type="icon"
                icon={alignOptions.find(o => o.value === currentAlign)?.icon}
                visible={true}
                title={t('textAlign.title') || '文本对齐'}
                aria-label={t('textAlign.title') || '文本对齐'}
                onPointerUp={() => setIsOpen(!isOpen)}
            />
            {isOpen && (
                <div className="text-align-dropdown">
                    {alignOptions.map(option => (
                        <ToolButton
                            key={option.value}
                            type="icon"
                            icon={option.icon}
                            visible={true}
                            title={option.title}
                            selected={currentAlign === option.value}
                            onPointerUp={() => handleAlignChange(option.value)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SelectionToolbar;
