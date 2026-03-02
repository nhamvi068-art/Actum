import React from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { ToolButton } from '../../tool-button';
import { useI18n } from '../../../i18n';
import { PlaitBoard, duplicateElements } from '@plait/core';
import { DuplicateIcon } from '../../icons';

interface CopyElementButtonProps {
    element: PlaitDrawElement;
}

export const CopyElementButton: React.FC<CopyElementButtonProps> = ({ element }) => {
    const { t } = useI18n();
    const board = PlaitBoard.getBoardFromElement(element);

    const handleCopy = () => {
        duplicateElements(board);
    };

    return (
        <ToolButton
            type="icon"
            icon={DuplicateIcon}
            visible={true}
            title={t('general.duplicate') || '复制'}
            aria-label={t('general.duplicate') || '复制'}
            onPointerUp={handleCopy}
        />
    );
};
