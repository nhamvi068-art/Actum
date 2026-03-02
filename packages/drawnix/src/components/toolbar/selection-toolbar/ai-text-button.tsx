import React from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { ToolButton } from '../../tool-button';
import classNames from 'classnames';
import { useI18n } from '../../../i18n';
import { PlaitBoard } from '@plait/core';
import { LightbulbIcon } from '../../icons';

interface AITextButtonProps {
    element: PlaitDrawElement;
}

export const AITextButton: React.FC<AITextButtonProps> = ({ element }) => {
    const { t } = useI18n();
    const board = PlaitBoard.getBoardFromElement(element);

    // Placeholder for AI text enhancement - not implemented yet
    const handleAITextClick = () => {
        // TODO: Implement AI text enhancement
        console.log('AI Text Enhancement - Not implemented yet');
    };

    return (
        <ToolButton
            className={classNames(`property-button`, 'ai-text-button')}
            visible={true}
            icon={LightbulbIcon}
            type="button"
            title={t('aiText.enhance') || 'AI文本增强'}
            aria-label={t('aiText.enhance') || 'AI文本增强'}
            onPointerUp={handleAITextClick}
        />
    );
};
