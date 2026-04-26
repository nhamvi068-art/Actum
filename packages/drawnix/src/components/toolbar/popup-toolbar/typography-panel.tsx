import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBoard } from '@plait-board/react-board';
import { Transforms, PlaitBoard, getSelectedElements, Path } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { updateTextPropertyDeep } from '../../../utils/text-style';

// 字号范围
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 200;

// 行高范围
const LINE_HEIGHT_MIN = 0.8;
const LINE_HEIGHT_MAX = 3.0;

// 字距范围
const LETTER_SPACING_MIN = -5;
const LETTER_SPACING_MAX = 20;

interface TypographyPanelProps {
    onClose?: () => void;
}

// 获取当前选中文本的排版状态
const getTypographyState = (board: PlaitBoard) => {
    const selectedElements = getSelectedElements(board);
    const element = selectedElements[0];
    if (!element || !PlaitDrawElement.isText(element)) {
        return null;
    }
    const textStyle = element.textStyle || {};
    return {
        element,
        textStyle,
        fontSize: textStyle.fontSize || 16,
        lineHeight: textStyle.lineHeight || 1.5,
        letterSpacing: textStyle.letterSpacing || 0,
    };
};

export const TypographyPanel: React.FC<TypographyPanelProps> = ({ onClose }) => {
    const board = useBoard();
    // 获取底层引擎状态
    const state = getTypographyState(board);

    // 缓存有效选中元素的 ID（解决拖动滑块时选区丢失问题）
    const targetIdRef = useRef<string | null>(null);

    // 监听选区变化，缓存有效 ID
    useEffect(() => {
        if (!board) return;
        const selected = getSelectedElements(board);
        if (selected && selected.length > 0 && selected[0]?.id) {
            targetIdRef.current = selected[0].id;
        }
    }, [board, board.selection]);

    // 本地 UI 状态（用于丝滑拖动）
    const [localValues, setLocalValues] = useState({
        fontSize: 16,
        lineHeight: 1.5,
        letterSpacing: 0,
    });

    // 监听选中元素变化，同步引擎状态到本地
    useEffect(() => {
        if (!state) return;
        setLocalValues({
            fontSize: state.fontSize || 16,
            lineHeight: state.lineHeight || 1.5,
            letterSpacing: state.letterSpacing || 0,
        });
    }, [state?.element]);

    // 拖动中：极速更新 UI，不触发引擎计算
    const handleSliderDrag = (key: string, value: number) => {
        setLocalValues(prev => ({ ...prev, [key]: value }));
    };

    // 松手后 / 失去焦点时：提交到底层数据
    const handleSliderCommit = useCallback((key: string, rawValue: number, slateKeys: string[] = []) => {
    const targetId = targetIdRef.current;
    if (!board || !targetId) return;

    // 1. 递归打捞最新鲜的元素
    const findFreshNode = (nodes: any[]): any => {
        for (const node of nodes) {
            if (node.id === targetId) return node;
            if (node.children) {
                const found = findFreshNode(node.children);
                if (found) return found;
            }
        }
        return null;
    };

    const freshElement = findFreshNode(board.children);
    if (!freshElement || !freshElement.text) return;

    const path = PlaitBoard.findPath(board, freshElement) as Path;
    const value = Number(rawValue);

    // 2. 组装宏观属性
    const newTextStyle = { ...freshElement.textStyle, [key]: value };

    // 3. 💥 强制深拷贝并洗刷微观属性（防范 Slate 缓存毒化）
    let newChildren = JSON.parse(JSON.stringify(freshElement.text.children));
    if (slateKeys && slateKeys.length > 0) {
        slateKeys.forEach(slateKey => {
            newChildren = updateTextPropertyDeep(newChildren, slateKey, value);
        });
    }

    // 4. 💥 偷天换日魔法：必须把外层样式同步塞入 text 内部
    const newText = {
        ...freshElement.text,
        children: newChildren,
        textStyle: newTextStyle // 让渲染层瞎子复明！
    };

    // 5. 暴力写入
    try {
        Transforms.setNode(board, { textStyle: newTextStyle, text: newText }, path);
        console.log(`✅ 终极写入成功: ${key} = ${value}`);
    } catch (e) {
        console.error(`❌ 写入失败:`, e);
    }
}, [board]);

    // 事件隔离：仅阻止冒泡（面板外层 wrapper 使用）
    const handleWrapperPointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
    };

    // 事件隔离：防止画布失焦（普通按钮使用）- 阻止默认和冒泡
    const handleButtonPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    // 事件隔离：仅阻止冒泡，不阻止默认（Slider和Input使用）
    const handleInputPointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
    };

    if (!state) {
        return (
            <div className="typography-panel" onPointerDown={handleWrapperPointerDown}>
                <div className="typography-panel-empty">未选择文本元素</div>
            </div>
        );
    }

    return (
        <div className="typography-panel" onPointerDown={handleWrapperPointerDown}>
            {/* 顶部标题 */}
            <div className="typography-panel-header">
                <span className="typography-panel-title">属性设置</span>
                <button
                    className="typography-panel-close"
                    onPointerDown={handleButtonPointerDown}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose?.();
                    }}
                >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            <div className="typography-panel-content">
                {/* 字号：Slider + 输入框 */}
                <div className="typography-panel-row" onPointerDown={handleInputPointerDown}>
                    <label className="typography-panel-label">字号</label>
                    <div className="typography-panel-slider-row">
                        <input
                            type="range"
                            className="typography-panel-slider"
                            min={FONT_SIZE_MIN}
                            max={FONT_SIZE_MAX}
                            value={localValues.fontSize}
                            onChange={(e) => handleSliderDrag('fontSize', parseInt(e.target.value))}
                            onPointerDown={handleInputPointerDown}
                            onMouseUp={() => handleSliderCommit('fontSize', Number(localValues.fontSize), ['fontSize', 'font-size'])}
                            onTouchEnd={() => handleSliderCommit('fontSize', Number(localValues.fontSize), ['fontSize', 'font-size'])}
                        />
                        <input
                            type="number"
                            className="typography-panel-number"
                            min={FONT_SIZE_MIN}
                            max={FONT_SIZE_MAX}
                            value={localValues.fontSize}
                            onChange={(e) => handleSliderDrag('fontSize', parseInt(e.target.value) || 16)}
                            onPointerDown={handleInputPointerDown}
                            onBlur={() => handleSliderCommit('fontSize', Number(localValues.fontSize), ['fontSize', 'font-size'])}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleSliderCommit('fontSize', Number(localValues.fontSize), ['fontSize', 'font-size']);
                                    e.currentTarget.blur();
                                }
                            }}
                        />
                        <span className="typography-panel-unit">px</span>
                    </div>
                </div>

                {/* 行高：Slider + 输入框 */}
                <div className="typography-panel-row" onPointerDown={handleInputPointerDown}>
                    <label className="typography-panel-label">行高</label>
                    <div className="typography-panel-slider-row">
                        <input
                            type="range"
                            className="typography-panel-slider"
                            min={LINE_HEIGHT_MIN * 10}
                            max={LINE_HEIGHT_MAX * 10}
                            step={1}
                            value={typeof localValues.lineHeight === 'number' ? localValues.lineHeight * 10 : 15}
                            onChange={(e) => handleSliderDrag('lineHeight', parseInt(e.target.value) / 10)}
                            onPointerDown={handleInputPointerDown}
                            onMouseUp={() => handleSliderCommit('lineHeight', Number(localValues.lineHeight), ['lineHeight', 'line-height'])}
                            onTouchEnd={() => handleSliderCommit('lineHeight', Number(localValues.lineHeight), ['lineHeight', 'line-height'])}
                        />
                        <input
                            type="number"
                            className="typography-panel-number"
                            min={LINE_HEIGHT_MIN}
                            max={LINE_HEIGHT_MAX}
                            step={0.1}
                            value={typeof localValues.lineHeight === 'number' ? localValues.lineHeight : 1.5}
                            onChange={(e) => handleSliderDrag('lineHeight', parseFloat(e.target.value) || 1.5)}
                            onPointerDown={handleInputPointerDown}
                            onBlur={() => handleSliderCommit('lineHeight', Number(localValues.lineHeight), ['lineHeight', 'line-height'])}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleSliderCommit('lineHeight', Number(localValues.lineHeight), ['lineHeight', 'line-height']);
                                    e.currentTarget.blur();
                                }
                            }}
                        />
                    </div>
                </div>

                {/* 字距：Slider + 输入框 */}
                <div className="typography-panel-row" onPointerDown={handleInputPointerDown}>
                    <label className="typography-panel-label">字距</label>
                    <div className="typography-panel-slider-row">
                        <input
                            type="range"
                            className="typography-panel-slider"
                            min={LETTER_SPACING_MIN}
                            max={LETTER_SPACING_MAX}
                            step={1}
                            value={typeof localValues.letterSpacing === 'number' ? localValues.letterSpacing : 0}
                            onChange={(e) => handleSliderDrag('letterSpacing', parseInt(e.target.value))}
                            onPointerDown={handleInputPointerDown}
                            onMouseUp={() => handleSliderCommit('letterSpacing', Number(localValues.letterSpacing), ['letterSpacing', 'letter-spacing'])}
                            onTouchEnd={() => handleSliderCommit('letterSpacing', Number(localValues.letterSpacing), ['letterSpacing', 'letter-spacing'])}
                        />
                        <input
                            type="number"
                            className="typography-panel-number"
                            min={LETTER_SPACING_MIN}
                            max={LETTER_SPACING_MAX}
                            step={1}
                            value={typeof localValues.letterSpacing === 'number' ? localValues.letterSpacing : 0}
                            onChange={(e) => handleSliderDrag('letterSpacing', parseInt(e.target.value) || 0)}
                            onPointerDown={handleInputPointerDown}
                            onBlur={() => handleSliderCommit('letterSpacing', Number(localValues.letterSpacing), ['letterSpacing', 'letter-spacing'])}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleSliderCommit('letterSpacing', Number(localValues.letterSpacing), ['letterSpacing', 'letter-spacing']);
                                    e.currentTarget.blur();
                                }
                            }}
                        />
                        <span className="typography-panel-unit">px</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 独立的综合排版入口按钮
export const PopupTypographyButton: React.FC<{
    fontSize?: number;
}> = ({ fontSize = 16 }) => {
    const [isOpen, setIsOpen] = useState(false);

    // 事件隔离
    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div className="typography-button-container" onPointerDown={handlePointerDown}>
            <button
                className="popup-toolbar-btn typography-button"
                onPointerDown={handlePointerDown}
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                title="属性设置"
            >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <circle cx="12" cy="5" r="1.5"/>
                    <circle cx="12" cy="12" r="1.5"/>
                    <circle cx="12" cy="19" r="1.5"/>
                </svg>
            </button>
            {isOpen && (
                <TypographyPanel onClose={() => setIsOpen(false)} />
            )}
        </div>
    );
};
