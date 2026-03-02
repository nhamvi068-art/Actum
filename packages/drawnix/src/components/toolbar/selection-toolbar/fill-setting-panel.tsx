import React, { useState } from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { ToolButton } from '../../tool-button';
import classNames from 'classnames';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard } from '@plait/core';
import { Island } from '../../island';
import { ColorPicker } from '../../color-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { useI18n } from '../../../i18n';
import { hexAlphaToOpacity, isFullyTransparent, removeHexAlpha } from '../../../utils/color';
import { BackgroundColorIcon } from '../../icons';
import './selection-toolbar.scss';
import {
    setFillColor,
    setFillColorOpacity,
} from '../../../transforms/property';

interface FillSettingPanelProps {
    element: PlaitDrawElement;
}

export const FillSettingPanel: React.FC<FillSettingPanelProps> = ({ element }) => {
    const { t } = useI18n();
    const board = PlaitBoard.getBoardFromElement(element);
    const [isFillPropertyOpen, setIsFillPropertyOpen] = useState(false);

    const getFillColor = (): string | undefined => {
        return (element as any).fill;
    };

    const currentColor = getFillColor();
    const hexColor = currentColor && removeHexAlpha(currentColor);
    const opacity = currentColor ? hexAlphaToOpacity(currentColor) : 100;
    const container = PlaitBoard.getBoardContainer(board);
    const icon =
        !hexColor || isFullyTransparent(opacity) ? BackgroundColorIcon : undefined;

    return (
        <Popover
            sideOffset={12}
            open={isFillPropertyOpen}
            onOpenChange={(open) => {
                setIsFillPropertyOpen(open);
            }}
            placement={'top'}
        >
            <PopoverTrigger asChild>
                <ToolButton
                    className={classNames(`property-button`)}
                    visible={true}
                    icon={icon}
                    type="button"
                    title={t('popupToolbar.fillColor') || '背景填充'}
                    aria-label={t('popupToolbar.fillColor') || '背景填充'}
                    onPointerUp={() => {
                        setIsFillPropertyOpen(!isFillPropertyOpen);
                    }}
                >
                    {!icon && (
                        <div
                            className="fill-preview"
                            style={{ backgroundColor: currentColor || 'transparent' }}
                        />
                    )}
                </ToolButton>
            </PopoverTrigger>
            <PopoverContent container={container}>
                <Island
                    padding={4}
                    className={classNames(`${ATTACHED_ELEMENT_CLASS_NAME}`)}
                >
                    <ColorPicker
                        onColorChange={(selectedColor: string) => {
                            setFillColor(board, selectedColor);
                        }}
                        onOpacityChange={(newOpacity: number) => {
                            setFillColorOpacity(board, newOpacity);
                        }}
                        currentColor={currentColor}
                    ></ColorPicker>
                </Island>
            </PopoverContent>
        </Popover>
    );
};
