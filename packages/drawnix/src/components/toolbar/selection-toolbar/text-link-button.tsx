import React from 'react';
import { PlaitDrawElement } from '@plait/draw';
import { ToolButton } from '../../tool-button';
import classNames from 'classnames';
import { useI18n } from '../../../i18n';
import { getSelectedElements, PlaitBoard } from '@plait/core';
import { LinkIcon } from '../../icons';
import { useDrawnix } from '../../../hooks/use-drawnix';
import { getFirstTextEditor, LinkElement } from '@plait/common';
import { ReactEditor } from 'slate-react';
import { LinkEditor } from '@plait/text-plugins';

interface TextLinkButtonProps {
    element: PlaitDrawElement;
}

export const TextLinkButton: React.FC<TextLinkButtonProps> = ({ element }) => {
    const { t } = useI18n();
    const { appState, setAppState } = useDrawnix();
    const board = PlaitBoard.getBoardFromElement(element);

    return (
        <ToolButton
            className={classNames(`property-button`)}
            visible={true}
            icon={LinkIcon}
            type="button"
            title={t('popupToolbar.link') || '链接'}
            aria-label={t('popupToolbar.link') || '链接'}
            onPointerUp={() => {
                const editor = getFirstTextEditor(element);
                if (!editor) return;

                const linkElementEntry = LinkEditor.getLinkElement(editor);
                if (!linkElementEntry) {
                    LinkEditor.wrapLink(editor, t('textPlaceholders.link') || '链接', '');
                }
                setTimeout(() => {
                    const linkElementEntry = LinkEditor.getLinkElement(editor);
                    if (!linkElementEntry) return;
                    const linkElement = linkElementEntry[0] as LinkElement;
                    const targetDom = ReactEditor.toDOMNode(editor, linkElement);
                    setAppState({
                        ...appState,
                        linkState: {
                            editor,
                            targetDom: targetDom,
                            targetElement: linkElement,
                            isEditing: true,
                            isHovering: false,
                            isHoveringOrigin: false,
                        },
                    });
                }, 0);
            }}
        />
    );
};
