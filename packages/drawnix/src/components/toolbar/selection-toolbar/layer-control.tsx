import React, { useState } from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { ToolButton } from '../../tool-button';
import { PlaitBoard, Transforms, getSelectedElements } from '@plait/core';
import { useI18n } from '../../../i18n';
import { useBoard, useListRender } from '@plait-board/react-board';
import {
    AlignTopOutlined,
    AlignBottomOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    LayersOutlined,
} from '../../icons';
import './selection-toolbar.scss';

interface LayerControlProps {
    element: PlaitDrawElement;
}

export const LayerControl: React.FC<LayerControlProps> = ({ element }) => {
    const { t } = useI18n();
    const board = useBoard();
    const listRender = useListRender();
    const [layerMenuOpen, setLayerMenuOpen] = useState(false);

    // Get element index in board children
    const getElementIndex = () => {
        return board.children.findIndex((child: any) => child.id === element.id);
    };

    const getTotalElements = () => {
        return board.children.length;
    };

    // Check if element is at top
    const isAtTop = () => {
        return getElementIndex() === getTotalElements() - 1;
    };

    // Check if element is at bottom
    const isAtBottom = () => {
        return getElementIndex() === 0;
    };

    // Reorder and update board
    const reorderAndUpdate = (newChildren: any[]) => {
        board.children = newChildren;
        listRender.update(board.children, {
            board: board,
            parent: board,
            parentG: PlaitBoard.getElementHost(board),
        });
    };

    // Move to top - move to end of array (highest layer)
    const handleMoveToTop = () => {
        const currentIndex = getElementIndex();
        if (currentIndex === getTotalElements() - 1) return;
        const newChildren = [...board.children];
        const [removed] = newChildren.splice(currentIndex, 1);
        newChildren.push(removed);
        reorderAndUpdate(newChildren);
        setLayerMenuOpen(false);
    };

    // Move to bottom - move to start of array (lowest layer)
    const handleMoveToBottom = () => {
        const currentIndex = getElementIndex();
        if (currentIndex === 0) return;
        const newChildren = [...board.children];
        const [removed] = newChildren.splice(currentIndex, 1);
        newChildren.unshift(removed);
        reorderAndUpdate(newChildren);
        setLayerMenuOpen(false);
    };

    // Move up one layer
    const handleMoveUp = () => {
        const currentIndex = getElementIndex();
        if (currentIndex === getTotalElements() - 1) return;
        const newChildren = [...board.children];
        const [removed] = newChildren.splice(currentIndex, 1);
        newChildren.splice(currentIndex + 1, 0, removed);
        reorderAndUpdate(newChildren);
        setLayerMenuOpen(false);
    };

    // Move down one layer
    const handleMoveDown = () => {
        const currentIndex = getElementIndex();
        if (currentIndex === 0) return;
        const newChildren = [...board.children];
        const [removed] = newChildren.splice(currentIndex, 1);
        newChildren.splice(currentIndex - 1, 0, removed);
        reorderAndUpdate(newChildren);
        setLayerMenuOpen(false);
    };

    if (layerMenuOpen) {
        return (
            <div className="layer-control-dropdown">
                <ToolButton
                    type="icon"
                    icon={AlignTopOutlined}
                    visible={true}
                    title={t('layer.moveToTop') || '置顶'}
                    aria-label={t('layer.moveToTop') || '置顶'}
                    disabled={isAtTop()}
                    onPointerUp={handleMoveToTop}
                />
                <ToolButton
                    type="icon"
                    icon={ArrowUpOutlined}
                    visible={true}
                    title={t('layer.moveUp') || '上移一层'}
                    aria-label={t('layer.moveUp') || '上移一层'}
                    disabled={isAtTop()}
                    onPointerUp={handleMoveUp}
                />
                <ToolButton
                    type="icon"
                    icon={ArrowDownOutlined}
                    visible={true}
                    title={t('layer.moveDown') || '下移一层'}
                    aria-label={t('layer.moveDown') || '下移一层'}
                    disabled={isAtBottom()}
                    onPointerUp={handleMoveDown}
                />
                <ToolButton
                    type="icon"
                    icon={AlignBottomOutlined}
                    visible={true}
                    title={t('layer.moveToBottom') || '置底'}
                    aria-label={t('layer.moveToBottom') || '置底'}
                    disabled={isAtBottom()}
                    onPointerUp={handleMoveToBottom}
                />
                <ToolButton
                    type="icon"
                    icon={LayersOutlined}
                    visible={true}
                    title={t('common.close') || '关闭'}
                    aria-label={t('common.close') || '关闭'}
                    onPointerUp={() => setLayerMenuOpen(false)}
                />
            </div>
        );
    }

    return (
        <ToolButton
            type="icon"
            icon={LayersOutlined}
            visible={true}
            title={t('layer.title') || '图层顺序'}
            aria-label={t('layer.title') || '图层顺序'}
            onPointerUp={() => setLayerMenuOpen(true)}
        />
    );
};
