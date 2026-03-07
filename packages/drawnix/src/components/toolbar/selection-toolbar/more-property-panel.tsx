import React, { useState } from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { ToolButton } from '../../tool-button';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard, Transforms } from '@plait/core';
import { Island } from '../../island';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { useI18n } from '../../../i18n';
import { ChevronDownIcon } from '../../icons';
import classNames from 'classnames';
import './selection-toolbar.scss';

interface MorePropertyPanelProps {
    element: PlaitDrawElement;
}

export const MorePropertyPanel: React.FC<MorePropertyPanelProps> = ({ element }) => {
    const { t } = useI18n();
    const board = PlaitBoard.getBoardFromElement(element);
    const [isOpen, setIsOpen] = useState(false);

    // Get advanced properties
    const getAdvancedProperties = () => {
        const style = (element as any).style || {};
        return {
            opacity: style.opacity ?? 1,
            rotation: style.rotation ?? 0,
            borderWidth: style.borderWidth ?? 0,
            borderColor: style.borderColor ?? '#000000',
            shadowBlur: style.shadowBlur ?? 0,
            shadowColor: style.shadowColor ?? '#000000',
        };
    };

    const properties = getAdvancedProperties();
    const container = PlaitBoard.getBoardContainer(board);

    const updateProperty = (key: string, value: any) => {
        const style = (element as any).style || {};
        const newElement = {
            ...element,
            style: {
                ...style,
                [key]: value,
            },
        };
        const index = board.children.findIndex((child: any) => child.id === element.id);
        if (index >= 0) {
            Transforms.setNode(board, { style: newElement.style }, [index]);
        }
    };

    return (
        <Popover
            sideOffset={12}
            open={isOpen}
            onOpenChange={(open) => {
                setIsOpen(open);
            }}
            placement={'top'}
        >
            <PopoverTrigger asChild>
                <ToolButton
                    className={classNames(`property-button`)}
                    visible={true}
                    icon={ChevronDownIcon}
                    type="button"
                    title={t('moreProperties.title') || '更多属性'}
                    aria-label={t('moreProperties.title') || '更多属性'}
                    onPointerUp={() => setIsOpen(!isOpen)}
                />
            </PopoverTrigger>
            <PopoverContent container={container}>
                <Island
                    padding={3}
                    className={classNames(`${ATTACHED_ELEMENT_CLASS_NAME}`)}
                >
                    <div className="more-property-panel">
                        {/* Opacity */}
                        <div className="property-row">
                            <label className="property-label">
                                {t('moreProperties.opacity') || '透明度'}
                            </label>
                            <input
                                type="range"
                                className="property-slider"
                                min={0}
                                max={1}
                                step={0.1}
                                value={properties.opacity}
                                onChange={(e) => updateProperty('opacity', parseFloat(e.target.value))}
                            />
                            <span className="property-value">{Math.round(properties.opacity * 100)}%</span>
                        </div>

                        {/* Rotation */}
                        <div className="property-row">
                            <label className="property-label">
                                {t('moreProperties.rotation') || '旋转'}
                            </label>
                            <input
                                type="number"
                                className="property-input"
                                value={properties.rotation}
                                min={-360}
                                max={360}
                                onChange={(e) => updateProperty('rotation', parseInt(e.target.value) || 0)}
                            />
                            <span className="property-unit">°</span>
                        </div>

                        {/* Border Width */}
                        <div className="property-row">
                            <label className="property-label">
                                {t('moreProperties.borderWidth') || '边框宽度'}
                            </label>
                            <input
                                type="number"
                                className="property-input"
                                value={properties.borderWidth}
                                min={0}
                                max={50}
                                onChange={(e) => updateProperty('borderWidth', parseInt(e.target.value) || 0)}
                            />
                            <span className="property-unit">px</span>
                        </div>

                        {/* Shadow Blur */}
                        <div className="property-row">
                            <label className="property-label">
                                {t('moreProperties.shadowBlur') || '阴影模糊'}
                            </label>
                            <input
                                type="range"
                                className="property-slider"
                                min={0}
                                max={50}
                                value={properties.shadowBlur}
                                onChange={(e) => updateProperty('shadowBlur', parseInt(e.target.value))}
                            />
                            <span className="property-value">{properties.shadowBlur}px</span>
                        </div>
                    </div>
                </Island>
            </PopoverContent>
        </Popover>
    );
};
