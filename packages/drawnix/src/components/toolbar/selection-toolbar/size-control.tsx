import React, { useState, useCallback } from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { ToolButton } from '../../tool-button';
import { PlaitBoard, Transforms, Point } from '@plait/core';
import { useI18n } from '../../../i18n';
import { LinkOutlined, LinkBrokenOutlined } from '../../icons';
import './selection-toolbar.scss';

interface SizeControlProps {
    element: PlaitDrawElement;
}

export const SizeControl: React.FC<SizeControlProps> = ({ element }) => {
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const [lockAspectRatio, setLockAspectRatio] = useState(true);

    // Get element dimensions
    const getDimensions = (): { width: number; height: number } => {
        // Try to get width/height from element directly
        const width = (element as any).width || 0;
        const height = (element as any).height || 0;

        // If not available, calculate from points
        if (!width || !height) {
            const points = (element as any).points;
            if (points && points.length >= 2) {
                return {
                    width: Math.abs(points[1][0] - points[0][0]),
                    height: Math.abs(points[1][1] - points[0][1]),
                };
            }
        }

        return { width: width || 100, height: height || 100 };
    };

    const dimensions = getDimensions();
    const [width, setWidth] = useState(dimensions.width);
    const [height, setHeight] = useState(dimensions.height);

    const handleWidthChange = useCallback((newWidth: number) => {
        setWidth(newWidth);
        if (lockAspectRatio) {
            const ratio = dimensions.height / dimensions.width;
            setHeight(Math.round(newWidth * ratio));
        }
    }, [lockAspectRatio, dimensions]);

    const handleHeightChange = useCallback((newHeight: number) => {
        setHeight(newHeight);
        if (lockAspectRatio) {
            const ratio = dimensions.width / dimensions.height;
            setWidth(Math.round(newHeight * ratio));
        }
    }, [lockAspectRatio, dimensions]);

    const updateElementSize = useCallback(() => {
        const points = (element as any).points;
        if (points && points.length >= 2) {
            const x = points[0][0];
            const y = points[0][1];
            const newPoints: [Point, Point] = [
                [x, y],
                [x + width, y + height]
            ];
            const index = board.children.findIndex((child: any) => child.id === element.id);
            if (index >= 0) {
                Transforms.setNode(board, {
                    points: newPoints,
                    width: width,
                    height: height
                }, [index]);
            }
        }
    }, [board, element, width, height]);

    const handleBlur = useCallback(() => {
        updateElementSize();
    }, [updateElementSize]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            updateElementSize();
            setIsOpen(false);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    if (isOpen) {
        return (
            <div className="size-control-panel">
                <div className="size-input-wrapper">
                    <span className="size-input-label">W</span>
                    <input
                        type="number"
                        className="size-input"
                        value={width}
                        onChange={(e) => handleWidthChange(parseInt(e.target.value) || 1)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        min={1}
                        autoFocus
                    />
                </div>
                <div
                    className={`aspect-lock-button ${lockAspectRatio ? 'locked' : ''}`}
                    onPointerUp={() => setLockAspectRatio(!lockAspectRatio)}
                    title={lockAspectRatio ? t('size.unlock') || '解锁比例' : t('size.lock') || '锁定比例'}
                >
                    {lockAspectRatio ? <LinkOutlined /> : <LinkBrokenOutlined />}
                </div>
                <div className="size-input-wrapper">
                    <span className="size-input-label">H</span>
                    <input
                        type="number"
                        className="size-input"
                        value={height}
                        onChange={(e) => handleHeightChange(parseInt(e.target.value) || 1)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        min={1}
                    />
                </div>
            </div>
        );
    }

    return (
        <ToolButton
            type="icon"
            visible={true}
            title={t('size.title') || '尺寸'}
            aria-label={t('size.title') || '尺寸'}
            onPointerUp={() => {
                setWidth(dimensions.width);
                setHeight(dimensions.height);
                setIsOpen(true);
            }}
        >
            <span className="size-label">{Math.round(dimensions.width)} × {Math.round(dimensions.height)}</span>
        </ToolButton>
    );
};
