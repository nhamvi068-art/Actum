import React, { useCallback } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '../popover/popover';
import { useBoard } from '@plait-board/react-board';
import { Transforms, PlaitElement, PlaitBoard } from '@plait/core';
import { Layers, Eye, EyeOff, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown } from 'lucide-react';
import './LayerPanel.scss';

export const LayerPanel: React.FC = () => {
  const board = useBoard();
  const container = PlaitBoard.getBoardContainer(board);
  const elements = board.children || [];

  // 调整图层顺序
  const handleMove = useCallback((
    e: React.MouseEvent,
    currentIndex: number,
    direction: 'up' | 'down' | 'top' | 'bottom'
  ) => {
    e.stopPropagation();
    let targetIndex = currentIndex;

    if (direction === 'up' && currentIndex < elements.length - 1) {
      targetIndex = currentIndex + 1;
    } else if (direction === 'down' && currentIndex > 0) {
      targetIndex = currentIndex - 1;
    } else if (direction === 'top') {
      targetIndex = elements.length - 1;
    } else if (direction === 'bottom') {
      targetIndex = 0;
    }

    if (targetIndex !== currentIndex) {
      Transforms.moveNode(board, [currentIndex], [targetIndex]);
      board.onChange();
    }
  }, [board, elements]);

  // 切换元素可见性 (使用 opacity 属性)
  const toggleVisibility = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const element = elements[index];
    const newOpacity = (element.opacity === 0 || element.opacity === undefined) ? 0.3 : 1;
    Transforms.setNode(board, { opacity: newOpacity }, [index]);
    board.onChange();
  }, [board, elements]);

  // 获取元素类型名称
  const getElementTypeName = (element: PlaitElement): string => {
    const typeMap: Record<string, string> = {
      'geometry': '图形',
      'image': '图片',
      'arrow-line': '箭头线',
      'line': '线条',
      'table': '表格',
      'mind': '思维导图',
      'swimlane': '泳道',
      'freehand': '手绘',
      'vector': '矢量',
      'text': '文本',
    };
    return typeMap[element.type || ''] || element.type || '元素';
  };

  // 点击图层项选中元素
  const handleSelectElement = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    board.setSelection([[index]]);
  }, [board]);

  return (
    <Popover
      placement="bottom-end"
      sideOffset={8}
    >
      <PopoverTrigger asChild>
        <button
          className="tool-icon tool-icon_type_button tool-icon--show"
          aria-label="图层管理"
          title="图层管理"
        >
          <div className="tool-icon__icon">
            <Layers />
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent container={container} className="layer-panel-content">
        <div className="layer-panel-container">
          {/* 头部 */}
          <div className="layer-panel-header">
            <span className="layer-panel-title">图层管理</span>
            <span className="layer-panel-count">{elements.length}</span>
          </div>

          {/* 图层列表 - 逆序渲染，最上层显示在顶部 */}
          <div className="layer-panel-list">
            {elements.length === 0 ? (
              <div className="layer-empty">
                <Layers size={24} />
                <span>画布暂无内容</span>
              </div>
            ) : (
              [...elements].reverse().map((element, reversedIndex) => {
                const actualIndex = elements.length - 1 - reversedIndex;
                const isHidden = element.opacity === 0;
                const isFaded = element.opacity === 0.3;

                return (
                  <div
                    key={element.id}
                    className={`layer-item ${isHidden || isFaded ? 'layer-item--hidden' : ''}`}
                    onClick={(e) => handleSelectElement(e, actualIndex)}
                  >
                    {/* 左侧：类型标识 */}
                    <div className="layer-item-info">
                      <span className="layer-type-badge">{getElementTypeName(element)}</span>
                      <span className="layer-item-id">{element.id.slice(0, 8)}</span>
                    </div>

                    {/* 右侧：操作按钮 */}
                    <div className="layer-item-actions">
                      {/* 可见性切换 */}
                      <button
                        className="layer-action-btn"
                        onClick={(e) => toggleVisibility(e, actualIndex)}
                        title={isHidden || isFaded ? '显示' : '隐藏'}
                      >
                        {isHidden || isFaded ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>

                      {/* 上移一层 */}
                      <button
                        className="layer-action-btn"
                        onClick={(e) => handleMove(e, actualIndex, 'up')}
                        disabled={actualIndex === elements.length - 1}
                        title="上移一层"
                      >
                        <ChevronUp size={14} />
                      </button>

                      {/* 下移一层 */}
                      <button
                        className="layer-action-btn"
                        onClick={(e) => handleMove(e, actualIndex, 'down')}
                        disabled={actualIndex === 0}
                        title="下移一层"
                      >
                        <ChevronDown size={14} />
                      </button>

                      {/* 置顶 */}
                      <button
                        className="layer-action-btn"
                        onClick={(e) => handleMove(e, actualIndex, 'top')}
                        disabled={actualIndex === elements.length - 1}
                        title="置顶"
                      >
                        <ChevronsUp size={14} />
                      </button>

                      {/* 置底 */}
                      <button
                        className="layer-action-btn"
                        onClick={(e) => handleMove(e, actualIndex, 'bottom')}
                        disabled={actualIndex === 0}
                        title="置底"
                      >
                        <ChevronsDown size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default LayerPanel;
