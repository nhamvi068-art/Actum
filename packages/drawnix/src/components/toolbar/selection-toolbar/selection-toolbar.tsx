import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { useBoard } from '@plait-board/react-board';
import {
    ATTACHED_ELEMENT_CLASS_NAME,
    getRectangleByElements,
    getSelectedElements,
    PlaitBoard,
    RectangleClient,
    toHostPointFromViewBoxPoint,
    toScreenPointFromHostPoint,
    Transforms,
} from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { MindElement } from '@plait/mind';
import { Island } from '../../island';
import './selection-toolbar.scss';
import { flip, offset, useFloating } from '@floating-ui/react';
import {
    AlignCenterOutlined,
    AlignLeftOutlined,
    AlignRightOutlined,
    LinkIcon,
    TextBoldIcon,
    TextItalicIcon,
    TextUnderlineIcon,
} from '../../icons';
import { useI18n } from '../../../i18n';
import { TextSizeControl } from './text-size-control';
import { ColorPickerEnhanced } from './color-picker-enhanced';
import { PresetStyleDropdown } from './preset-style-dropdown';
import { useDrawnix } from '../../../hooks/use-drawnix';
import { getFirstTextEditor, LinkElement } from '@plait/common';
import { ReactEditor } from 'slate-react';
import { Editor, Transforms as SlateTransforms } from 'slate';
import { LinkEditor } from '@plait/text-plugins';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

const FONT_OPTIONS = [
    'Inter',
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Georgia',
    'Courier New',
    'Verdana',
    'Microsoft YaHei',
    'SimSun',
];

interface SelectionToolbarProps {
    position?: { left: number; top: number } | null;
    externalPositioning?: boolean;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({ position, externalPositioning }) => {
    const board = useBoard();
    const { t } = useI18n();
    const { appState, setAppState } = useDrawnix();
    const toolbarRef = useRef<HTMLDivElement | null>(null);
    const [openPopup, setOpenPopup] = useState<null | 'color' | 'preset' | 'font'>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Step 1: 建立本地实时状态 - 追踪 Slate 内部的 marks 变化
    const [activeMarks, setActiveMarks] = useState<Record<string, boolean>>({});

    // Step 1 (extended): 建立本地乐观状态 - 追踪所有文本样式属性
    const [localTextStyle, setLocalTextStyle] = useState<{
        fontFamily: string;
        fontSize: number;
        textAlign: 'left' | 'center' | 'right' | 'justify';
        color: string;
    }>({
        fontFamily: 'Inter',
        fontSize: 16,
        textAlign: 'left',
        color: '#000000',
    });

    // Use floating-ui for positioning (unless external positioning is provided)
    const { refs, floatingStyles } = useFloating({
        placement: 'top-start',
        middleware: [offset(8), flip()],
    });

    // Check if only one text element is selected (supports both Draw text and Mind elements)
    const isTextSelected = useMemo(() => {
        if (!board) return false;
        const selectedElements = getSelectedElements(board);
        console.log('[SelectionToolbar] getSelectedElements:', selectedElements.length, selectedElements.map((e: any) => e.id));
        if (!selectedElements || selectedElements.length !== 1) return false;
        const element = selectedElements[0];
        console.log('[SelectionToolbar] Checking element:', element.id, 'isText:', PlaitDrawElement.isText(element), 'isMind:', MindElement.isMindElement(board, element));
        // Check if it's a Draw text element or a Mind element (both have text)
        return PlaitDrawElement.isText(element) || MindElement.isMindElement(board, element);
    }, [board]);

    const selectedElement = useMemo(() => {
        if (!isTextSelected || !board) return null;
        return getSelectedElements(board)[0] as PlaitDrawElement;
    }, [board, isTextSelected]);

    // Set position reference based on selected element (only when not using external positioning)
    useEffect(() => {
        if (externalPositioning || !board || !isTextSelected) return;

        const element = getSelectedElements(board)[0];
        const rectangle = getRectangleByElements(board, [element], false);
        if (!rectangle) return;
        const [start, end] = RectangleClient.getPoints(rectangle);
        const screenStart = toScreenPointFromHostPoint(
            board,
            toHostPointFromViewBoxPoint(board, start)
        );
        const screenEnd = toScreenPointFromHostPoint(
            board,
            toHostPointFromViewBoxPoint(board, end)
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
    }, [board, isTextSelected, externalPositioning, refs]);

    useEffect(() => {
        if (!isTextSelected) return;
        const onMouseDown = (e: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
                setOpenPopup(null);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [isTextSelected]);

    // Step 1 (continued): 监听选区变化，实时更新本地 marks 状态
    useEffect(() => {
        if (!selectedElement || !board) return;

        const editor = getFirstTextEditor(selectedElement);
        if (!editor) return;

        // Initial sync
        const initialMarks = Editor.marks(editor) || {};
        setActiveMarks(initialMarks as Record<string, boolean>);

        // Listen for selection changes to update marks
        const { onChange } = editor;
        editor.onChange = () => {
            onChange?.();
            // Update active marks when selection changes
            const newMarks = Editor.marks(editor) || {};
            setActiveMarks(newMarks as Record<string, boolean>);
        };

        return () => {
            editor.onChange = onChange;
        };
    }, [selectedElement, board]);

    // Step 1 (extended): 当选中元素变化时，同步 localTextStyle
    useEffect(() => {
        if (!selectedElement || !board) return;

        const elementTextStyle = (selectedElement as any).textStyle || {};
        setLocalTextStyle({
            fontFamily: elementTextStyle.fontFamily || 'Inter',
            fontSize: elementTextStyle.fontSize || 16,
            textAlign: elementTextStyle.textAlign || 'left',
            color: elementTextStyle.color || '#000000',
        });
    }, [selectedElement, board]);

    if (!selectedElement || !board) return null;

    // Use external positioning if provided, otherwise use floating-ui
    const toolbarStyle = externalPositioning && position
        ? { position: 'absolute' as const, left: position.left, top: position.top, transform: 'translateX(-50%)', zIndex: 1000 }
        : floatingStyles;

    // Use localTextStyle for immediate UI feedback (Step 1 extended)
    console.log('[SelectionToolbar] textStyle:', localTextStyle, 'refreshKey:', refreshKey, 'activeMarks:', activeMarks);

    // Get marks from local activeMarks state (Step 1) + localTextStyle for persistence
    const slateBold = !!activeMarks.bold;
    const slateItalic = !!activeMarks.italic;
    const slateUnderline = !!activeMarks.underlined;

    const marks = {
        fontFamily: localTextStyle.fontFamily,
        fontSize: localTextStyle.fontSize,
        bold: slateBold,
        italic: slateItalic,
        underline: slateUnderline,
        textAlign: localTextStyle.textAlign,
        color: localTextStyle.color,
    };

    const updateTextStyle = useCallback(
        (updates: Partial<typeof marks>) => {
            if (!board || !selectedElement) return;

            console.log('[SelectionToolbar] updateTextStyle called', {
                selectedElementId: selectedElement.id,
                updates
            });

            // ===== 路径1：全局属性 (fontSize, color, textAlign, fontFamily) =====
            // 流程：先乐观更新 UI -> 再用 Transforms.setNode 更新画布
            const globalProps = ['fontFamily', 'fontSize', 'textAlign', 'color'] as const;
            const hasGlobalProps = globalProps.some(key => key in updates);

            if (hasGlobalProps) {
                // 【步骤1】瞬间更新本地 UI 状态（乐观更新）
                setLocalTextStyle(prev => ({ ...prev, ...updates }));
                console.log('[SelectionToolbar] [Optimistic] LocalTextStyle updated for:', Object.keys(updates));

                // 【步骤2】用 Transforms.setNode 更新画布元素（与 popup-toolbar 保持一致）
                const boardElementUpdates: any = {};
                if ('fontFamily' in updates) boardElementUpdates.fontFamily = updates.fontFamily;
                if ('fontSize' in updates) boardElementUpdates.fontSize = updates.fontSize;
                if ('textAlign' in updates) boardElementUpdates.textAlign = updates.textAlign;
                if ('color' in updates) boardElementUpdates.color = updates.color;

                const index = board.children.findIndex((child: any) => child.id === selectedElement.id);
                console.log('[SelectionToolbar] Element index:', index);

                if (index >= 0) {
                    const element = board.children[index];
                    const prevTextStyle = (element as any).textStyle || {};
                    const newTextStyle = { ...prevTextStyle, ...boardElementUpdates };
                    Transforms.setNode(board, { textStyle: newTextStyle }, [index]);
                    console.log('[SelectionToolbar] Board element updated via Transforms.setNode:', newTextStyle);
                } else {
                    console.error('[SelectionToolbar] Element not found in board.children!');
                }

                // 全局属性更新后直接返回，不走 Slate 路径！
                return;
            }

            // ===== 路径2：内联属性 (bold, italic, underline) =====
            // 流程：检查光标 -> 更新 Slate -> 乐观更新 UI -> 用 Transforms.setNode 同步到 Board
            const inlineProps = ['bold', 'italic', 'underline'] as const;
            const hasInlineProps = inlineProps.some(key => key in updates);

            if (hasInlineProps) {
                const editor = getFirstTextEditor(selectedElement);
                console.log('[SelectionToolbar] Editor found for marks:', !!editor);

                // 【步骤1】安全检查 - 防止 [-1] 崩溃
                if (!editor) {
                    console.log('[SelectionToolbar] No editor, skipping marks');
                    return;
                }
                if (!editor.selection) {
                    console.log('[SelectionToolbar] No selection, skipping marks to prevent crash');
                    return;
                }

                // 【步骤2】安全修改 Slate 内部节点
                if ('bold' in updates) {
                    const currentMarks = Editor.marks(editor);
                    const isBold = currentMarks ? currentMarks['bold'] === true : false;
                    console.log('[SelectionToolbar] Current bold mark:', isBold, 'Setting to:', updates.bold);
                    if (updates.bold) {
                        Editor.addMark(editor, 'bold', true);
                    } else {
                        Editor.removeMark(editor, 'bold');
                    }
                }

                if ('italic' in updates) {
                    const currentMarks = Editor.marks(editor);
                    const isItalic = currentMarks ? currentMarks['italic'] === true : false;
                    console.log('[SelectionToolbar] Current italic mark:', isItalic, 'Setting to:', updates.italic);
                    if (updates.italic) {
                        Editor.addMark(editor, 'italic', true);
                    } else {
                        Editor.removeMark(editor, 'italic');
                    }
                }

                if ('underline' in updates) {
                    const currentMarks = Editor.marks(editor);
                    const isUnderline = currentMarks ? currentMarks['underlined'] === true : false;
                    console.log('[SelectionToolbar] Current underline mark:', isUnderline, 'Setting to:', updates.underline);
                    if (updates.underline) {
                        Editor.addMark(editor, 'underlined', true);
                    } else {
                        Editor.removeMark(editor, 'underlined');
                    }
                }

                // 【步骤3】瞬间更新 UI 按钮状态（乐观更新）
                setActiveMarks(prev => ({ ...prev, ...updates }));
                console.log('[SelectionToolbar] [Optimistic] ActiveMarks updated for:', Object.keys(updates));

                // 【步骤4】用 Transforms.setNode 同步到 Board（与 popup-toolbar 保持一致）
                const markIndex = board.children.findIndex((child: any) => child.id === selectedElement.id);
                if (markIndex >= 0) {
                    const element = board.children[markIndex];
                    const prevTextStyle = (element as any).textStyle || {};
                    // 将 bold/italic/underline 同步到 textStyle
                    const markUpdates: any = {};
                    if ('bold' in updates) markUpdates.bold = updates.bold;
                    if ('italic' in updates) markUpdates.italic = updates.italic;
                    if ('underline' in updates) markUpdates.underline = updates.underline;
                    const newTextStyle = { ...prevTextStyle, ...markUpdates };
                    Transforms.setNode(board, { textStyle: newTextStyle }, [markIndex]);
                    console.log('[SelectionToolbar] Board element updated for marks via Transforms.setNode:', newTextStyle);
                }
            }

            // Force re-render by incrementing refreshKey
            setRefreshKey(k => k + 1);
        },
        [board, selectedElement, setRefreshKey, setActiveMarks, setLocalTextStyle]
    );

    const setFloatingRef = useCallback(
        (node: HTMLDivElement | null) => {
            toolbarRef.current = node;
            refs.setFloating(node);
        },
        [refs]
    );

    const handleLinkEdit = useCallback(() => {
        const editor = getFirstTextEditor(selectedElement);
        if (!editor) return;

        const linkElementEntry = LinkEditor.getLinkElement(editor);
        if (!linkElementEntry) {
            LinkEditor.wrapLink(editor, t('textPlaceholders.link') || '链接', '');
        }

        setTimeout(() => {
            const entry = LinkEditor.getLinkElement(editor);
            if (!entry) return;
            const linkElement = entry[0] as LinkElement;
            const targetDom = ReactEditor.toDOMNode(editor, linkElement);
            setAppState({
                ...appState,
                linkState: {
                    editor,
                    targetDom,
                    targetElement: linkElement,
                    isEditing: true,
                    isHovering: false,
                    isHoveringOrigin: false,
                },
            });
        }, 0);
    }, [appState, selectedElement, setAppState, t]);

    return (
        <Island
            ref={setFloatingRef}
            style={toolbarStyle}
            className={classNames('selection-toolbar', 'popup-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}
            padding={1}
        >
            {/* 1) Color */}
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <button
                    type="button"
                    className="text-toolbar__icon-btn"
                    title={t('popupToolbar.fontColor') || '颜色'}
                    aria-label={t('popupToolbar.fontColor') || '颜色'}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setOpenPopup(openPopup === 'color' ? null : 'color')}
                >
                    <span className="text-toolbar__color-dot" style={{ backgroundColor: marks.color }} />
                </button>
                {openPopup === 'color' && (
                    <div
                        className="text-toolbar__popup"
                        style={{ left: 0, width: 208 }}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <ColorPickerEnhanced
                            value={marks.color}
                            onChange={(color) => updateTextStyle({ color })}
                        />
                    </div>
                )}
            </div>

            <div className="toolbar-divider" />

            {/* 2) Preset */}
            <PresetStyleDropdown
                open={openPopup === 'preset'}
                onOpenChange={(open) => setOpenPopup(open ? 'preset' : null)}
                value={{ fontSize: marks.fontSize, bold: marks.bold }}
                onSelect={(preset) => {
                    updateTextStyle({ fontSize: preset.fontSize, bold: preset.bold });
                }}
            />

            <div className="toolbar-divider" />

            {/* 3) Font Family */}
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <button
                    type="button"
                    className="text-toolbar__select-btn"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setOpenPopup(openPopup === 'font' ? null : 'font')}
                    aria-label={t('popupToolbar.fontFamily') || '字体'}
                    title={t('popupToolbar.fontFamily') || '字体'}
                    style={{ fontFamily: marks.fontFamily }}
                >
                    <span className="text-toolbar__select-label">{marks.fontFamily}</span>
                    <span aria-hidden="true" style={{ color: '#9ca3af', fontSize: 12 }}>
                        ▼
                    </span>
                </button>
                {openPopup === 'font' && (
                    <div
                        className="text-toolbar__popup text-toolbar__dropdown"
                        style={{ left: 0 }}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {FONT_OPTIONS.map((font) => {
                            const selected = font === marks.fontFamily;
                            return (
                                <button
                                    key={font}
                                    type="button"
                                    className={[
                                        'text-toolbar__dropdown-item',
                                        selected ? 'is-selected' : '',
                                    ].join(' ')}
                                    style={{ fontFamily: font }}
                                    onClick={() => {
                                        updateTextStyle({ fontFamily: font });
                                        setOpenPopup(null);
                                    }}
                                >
                                    <span>{font}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="toolbar-divider" />

            {/* 4) Font Size */}
            <TextSizeControl
                element={selectedElement}
                onSizeChange={(size) => setLocalTextStyle(prev => ({ ...prev, fontSize: size }))}
            />

            <div className="toolbar-divider" />

            {/* 5) Basic styles */}
            <button
                type="button"
                className={['text-toolbar__icon-btn', marks.bold ? 'is-active' : ''].join(' ')}
                title={t('textStyle.bold') || '加粗'}
                aria-label={t('textStyle.bold') || '加粗'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => updateTextStyle({ bold: !marks.bold })}
            >
                <TextBoldIcon />
            </button>
            <button
                type="button"
                className={['text-toolbar__icon-btn', marks.italic ? 'is-active' : ''].join(' ')}
                title={t('textStyle.italic') || '斜体'}
                aria-label={t('textStyle.italic') || '斜体'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => updateTextStyle({ italic: !marks.italic })}
            >
                <TextItalicIcon />
            </button>
            <button
                type="button"
                className={['text-toolbar__icon-btn', marks.underline ? 'is-active' : ''].join(' ')}
                title={t('textStyle.underline') || '下划线'}
                aria-label={t('textStyle.underline') || '下划线'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => updateTextStyle({ underline: !marks.underline })}
            >
                <TextUnderlineIcon />
            </button>

            <div className="toolbar-divider" />

            {/* 6) Align */}
            <button
                type="button"
                className={['text-toolbar__icon-btn', marks.textAlign === 'left' ? 'is-active' : ''].join(' ')}
                title={t('textAlign.left') || '左对齐'}
                aria-label={t('textAlign.left') || '左对齐'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => updateTextStyle({ textAlign: 'left' })}
            >
                <AlignLeftOutlined />
            </button>
            <button
                type="button"
                className={['text-toolbar__icon-btn', marks.textAlign === 'center' ? 'is-active' : ''].join(' ')}
                title={t('textAlign.center') || '居中对齐'}
                aria-label={t('textAlign.center') || '居中对齐'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => updateTextStyle({ textAlign: 'center' })}
            >
                <AlignCenterOutlined />
            </button>
            <button
                type="button"
                className={['text-toolbar__icon-btn', marks.textAlign === 'right' ? 'is-active' : ''].join(' ')}
                title={t('textAlign.right') || '右对齐'}
                aria-label={t('textAlign.right') || '右对齐'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => updateTextStyle({ textAlign: 'right' })}
            >
                <AlignRightOutlined />
            </button>

            <div className="toolbar-divider" />

            {/* 7) Link */}
            <button
                type="button"
                className={[
                    'text-toolbar__icon-btn',
                    appState.linkState ? 'is-active' : '',
                ].join(' ')}
                title={t('popupToolbar.link') || '链接'}
                aria-label={t('popupToolbar.link') || '链接'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                    setOpenPopup(null);
                    handleLinkEdit();
                }}
            >
                <LinkIcon />
            </button>
        </Island>
    );
};

export default SelectionToolbar;
