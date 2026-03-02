import React from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { ToolButton } from '../../tool-button';
import { useI18n } from '../../../i18n';
import { PlaitBoard, deleteFragment } from '@plait/core';
import { TrashIcon } from '../../icons';

interface DeleteElementButtonProps {
    element: PlaitDrawElement;
}

export const DeleteElementButton: React.FC<DeleteElementButtonProps> = ({ element }) => {
    const { t } = useI18n();
    const board = PlaitBoard.getBoardFromElement(element);

    const handleDelete = () => {
        deleteFragment(board);
    };

    return (
        <ToolButton
            type="icon"
            icon={TrashIcon}
            visible={true}
            title={t('general.delete') || '删除'}
            aria-label={t('general.delete') || '删除'}
            onPointerUp={handleDelete}
        />
    );
};
