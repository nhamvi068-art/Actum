import React, { useState, useCallback } from 'react';
import Stack from '../../stack';
import { ToolButton } from '../../tool-button';
import { FontColorIcon, DuplicateIcon, TrashIcon, DownloadIcon, AlignTopOutlined, AlignBottomOutlined, ArrowUpOutlined, ArrowDownOutlined, LayersOutlined, SizeOutlined, LinkOutlined, LinkBrokenOutlined } from '../../icons';
import {
  ATTACHED_ELEMENT_CLASS_NAME,
  getRectangleByElements,
  getSelectedElements,
  isDragging,
  isMovingElements,
  isSelectionMoving,
  PlaitBoard,
  PlaitElement,
  Point,
  RectangleClient,
  Transforms,
  deleteFragment,
  duplicateElements,
  toHostPointFromViewBoxPoint,
  toScreenPointFromHostPoint,
} from '@plait/core';
import { useEffect, useRef } from 'react';
import { useBoard, useListRender } from '@plait-board/react-board';
import { flip, offset, useFloating } from '@floating-ui/react';
import { Island } from '../../island';
import { SelectionToolbar } from '../selection-toolbar/selection-toolbar';
import classNames from 'classnames';
import { useI18n } from '../../../i18n';
import {
  getStrokeColorByElement as getStrokeColorByMindElement,
  MindElement,
} from '@plait/mind';
import './popup-toolbar.scss';
import '../../../styles/canvas-toolbar.css';
import {
  ArrowLineHandle,
  getStrokeColorByElement as getStrokeColorByDrawElement,
  getStrokeStyleByElement,
  isClosedCustomGeometry,
  isClosedDrawElement,
  isDrawElementsIncludeText,
  PlaitDrawElement,
} from '@plait/draw';
import { CustomText, StrokeStyle } from '@plait/common';
import { getTextMarksByElement } from '@plait/text-plugins';
import { PopupFontColorButton } from './font-color-button';
import { PopupStrokeButton } from './stroke-button';
import { PopupFillButton } from './fill-button';
import { PopupFontSizeButton } from './font-size-button';
import { PopupFontFamilyButton } from './font-family-button';
import { PopupBoldButton } from './bold-button';
import { isWhite, removeHexAlpha } from '../../../utils/color';
import { NO_COLOR } from '../../../constants/color';
import { COMMON_SIZES } from '../../../constants/commonSizes';
import { Freehand } from '../../../plugins/freehand/type';
import { PopupLinkButton } from './link-button';
import { ArrowMarkButton } from './arrow-mark-button';
export const PopupToolbar = () => {
  const board = useBoard();
  const listRender = useListRender();
  const { t } = useI18n();
  const selectedElements = getSelectedElements(board);
  const [movingOrDragging, setMovingOrDragging] = useState(false);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState<number>(800);
  const [customHeight, setCustomHeight] = useState<number>(800);
  const [lockAspectRatio, setLockAspectRatio] = useState<boolean>(true);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState<boolean>(false);
  const movingOrDraggingRef = useRef(movingOrDragging);

  // Check if selected element is an image
  const isImageSelected = selectedElements.length > 0 && selectedElements.every(PlaitDrawElement.isImage);

  // Check if single text element is selected (let SelectionToolbar handle it)
  const isSingleTextSelected =
    selectedElements.length === 1 &&
    (PlaitDrawElement.isText(selectedElements[0]) || MindElement.isMindElement(board, selectedElements[0]));

  console.log('[PopupToolbar] isSingleTextSelected:', isSingleTextSelected, 'selectedElements:', selectedElements.map((e: any) => ({ id: e.id, type: e.type })));

  const open =
    selectedElements.length > 0 &&
    !isSelectionMoving(board) &&
    !isImageSelected &&
    !isSingleTextSelected;
    
  // 图片选中时显示的一级工具栏
  const imageToolbarOpen = selectedElements.length > 0 && !isSelectionMoving(board) && isImageSelected;

  // 文本选中时显示的工具栏（使用和图片工具栏相同的定位逻辑）
  const textToolbarOpen = isSingleTextSelected && !isSelectionMoving(board) && !movingOrDragging;

  console.log('[PopupToolbar] textToolbarOpen:', textToolbarOpen, 'isSelectionMoving:', isSelectionMoving(board), 'movingOrDragging:', movingOrDragging);

  const { viewport, selection, children } = board;
  const { refs, floatingStyles } = useFloating({
    placement: 'top-start',
    middleware: [offset(32), flip()],
  });

  let state: {
    fill: string | undefined;
    strokeColor?: string;
    strokeStyle?: StrokeStyle;
    hasFill?: boolean;
    hasText?: boolean;
    fontColor?: string;
    hasFontColor?: boolean;
    hasStroke?: boolean;
    hasStrokeStyle?: boolean;
    marks?: Omit<CustomText, 'text'>;
    // Text style state
    fontSize?: number;
    fontFamily?: string;
    isBold?: boolean;
    // Line state
    isLine?: boolean;
    source?: ArrowLineHandle;
    target?: ArrowLineHandle;
  } = {
    fill: 'red',
  };
  if (open && !movingOrDragging) {
    const hasFill =
      selectedElements.some((value) => hasFillProperty(board, value)) &&
      !PlaitBoard.hasBeenTextEditing(board);
    const hasText = selectedElements.some((value) =>
      hasTextProperty(board, value)
    );
    const hasStroke =
      selectedElements.some((value) => hasStrokeProperty(board, value)) &&
      !PlaitBoard.hasBeenTextEditing(board);
    const hasStrokeStyle =
      selectedElements.some((value) => hasStrokeStyleProperty(board, value)) &&
      !PlaitBoard.hasBeenTextEditing(board);
    const isLine = selectedElements.every((value) =>
      PlaitDrawElement.isArrowLine(value)
    );
    state = {
      ...getElementState(board),
      hasFill,
      hasFontColor: hasText,
      hasStroke,
      hasStrokeStyle,
      hasText,
      isLine,
    };
  }
  useEffect(() => {
    if (open) {
      const hasSelected = selectedElements.length > 0;
      if (!movingOrDragging && hasSelected) {
        const elements = getSelectedElements(board);
        const rectangle = getRectangleByElements(board, elements, false);
        const [start, end] = RectangleClient.getPoints(rectangle);
        const screenStart = toScreenPointFromHostPoint(
          board,
          toHostPointFromViewBoxPoint(board, start)
        );
        const screenEnd = toScreenPointFromHostPoint(
          board,
          toHostPointFromViewBoxPoint(board, end)
        );
        const width = screenEnd[0] - screenStart[0];
        const height = screenEnd[1] - screenStart[1];
        refs.setPositionReference({
          getBoundingClientRect() {
            return {
              width,
              height,
              x: screenStart[0],
              y: screenStart[1],
              top: screenStart[1],
              left: screenStart[0],
              right: screenStart[0] + width,
              bottom: screenStart[1] + height,
            };
          },
        });
      }
    }
  }, [viewport, selection, children, movingOrDragging]);

  // Position image/text toolbar above the selected element
  const [toolbarPosition, setToolbarPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const shouldOpen = imageToolbarOpen || textToolbarOpen;
    console.log('[PopupToolbar] Position effect:', { shouldOpen, selectedElementsLength: selectedElements.length, movingOrDragging, textToolbarOpen });
    if (shouldOpen && selectedElements.length > 0 && !movingOrDragging) {
      const elements = getSelectedElements(board);
      const rectangle = getRectangleByElements(board, elements, false);
      const [start, end] = RectangleClient.getPoints(rectangle);
      const screenStart = toScreenPointFromHostPoint(
        board,
        toHostPointFromViewBoxPoint(board, start)
      );
      const screenEnd = toScreenPointFromHostPoint(
        board,
        toHostPointFromViewBoxPoint(board, end)
      );
      const width = screenEnd[0] - screenStart[0];
      const height = screenEnd[1] - screenStart[1];
      const newPosition = {
        left: screenStart[0] + width / 2,
        top: screenStart[1] - 60,
      };
      console.log('[PopupToolbar] Setting toolbarPosition:', newPosition);
      setToolbarPosition(newPosition);
    } else {
      setToolbarPosition(null);
    }
  }, [viewport, selection, children, movingOrDragging, imageToolbarOpen, textToolbarOpen]);

  useEffect(() => {
    movingOrDraggingRef.current = movingOrDragging;
  }, [movingOrDragging]);

  useEffect(() => {
    const { pointerUp, pointerMove } = board;

    board.pointerMove = (event: PointerEvent) => {
      if (
        (isMovingElements(board) || isDragging(board)) &&
        !movingOrDraggingRef.current
      ) {
        setMovingOrDragging(true);
      }
      pointerMove(event);
    };

    board.pointerUp = (event: PointerEvent) => {
      if (
        movingOrDraggingRef.current &&
        (isMovingElements(board) || isDragging(board))
      ) {
        setMovingOrDragging(false);
      }
      pointerUp(event);
    };

    return () => {
      board.pointerUp = pointerUp;
      board.pointerMove = pointerMove;
    };
  }, [board]);

  // 获取当前选中的图片元素
  const getSelectedImageElement = () => {
    return selectedElements.find(PlaitDrawElement.isImage) as any;
  };

  // 获取当前选中图片在数组中的索引
  const getSelectedImageIndex = () => {
    const imageElement = getSelectedImageElement();
    if (!imageElement) return -1;
    return board.children.findIndex((child: any) => child.id === imageElement.id);
  };

  // 获取当前选中图片是否是最后一个（最上层）
  const isLastImage = () => {
    const index = getSelectedImageIndex();
    return index === board.children.length - 1;
  };

  // 获取当前选中图片是否是第一个（最底层）
  const isFirstImage = () => {
    const index = getSelectedImageIndex();
    return index === 0;
  };

  // 重新排序后更新 board
  const reorderAndUpdate = (newChildren: any[]) => {
    board.children = newChildren;
    listRender.update(board.children, {
      board: board,
      parent: board,
      parentG: PlaitBoard.getElementHost(board),
    });
  };

  // 置顶 - 移动到数组末尾（最上层）
  const handleMoveToTop = () => {
    const imageElement = getSelectedImageElement();
    if (!imageElement || isLastImage()) return;
    const currentIndex = getSelectedImageIndex();
    const newChildren = [...board.children];
    const [removed] = newChildren.splice(currentIndex, 1);
    newChildren.push(removed);
    reorderAndUpdate(newChildren);
  };

  // 置底 - 移动到数组开头（最底层）
  const handleMoveToBottom = () => {
    const imageElement = getSelectedImageElement();
    if (!imageElement || isFirstImage()) return;
    const currentIndex = getSelectedImageIndex();
    const newChildren = [...board.children];
    const [removed] = newChildren.splice(currentIndex, 1);
    newChildren.unshift(removed);
    reorderAndUpdate(newChildren);
  };

  // 上移一层 - 在数组中向后移动一位
  const handleMoveUp = () => {
    const imageElement = getSelectedImageElement();
    if (!imageElement || isLastImage()) return;
    const currentIndex = getSelectedImageIndex();
    const newChildren = [...board.children];
    const [removed] = newChildren.splice(currentIndex, 1);
    newChildren.splice(currentIndex + 1, 0, removed);
    reorderAndUpdate(newChildren);
  };

  // 下移一层 - 在数组中向前移动一位
  const handleMoveDown = () => {
    const imageElement = getSelectedImageElement();
    if (!imageElement || isFirstImage()) return;
    const currentIndex = getSelectedImageIndex();
    const newChildren = [...board.children];
    const [removed] = newChildren.splice(currentIndex, 1);
    newChildren.splice(currentIndex - 1, 0, removed);
    reorderAndUpdate(newChildren);
  };

  // 更新图片尺寸
  const handleResizeImage = (newWidth: number, newHeight: number) => {
    const imageElement = getSelectedImageElement();
    if (!imageElement) return;
    
    // 获取当前图片的位置（左上角坐标）
    const x = imageElement.points[0][0];
    const y = imageElement.points[0][1];
    
    // 计算新的 points
    const newPoints: [Point, Point] = [
      [x, y],
      [x + newWidth, y + newHeight]
    ];
    
    // 使用 Transforms.setNode 来修改元素，传入索引作为 path
    const currentIndex = getSelectedImageIndex();
    if (currentIndex >= 0) {
      Transforms.setNode(board, {
        points: newPoints,
        width: newWidth,
        height: newHeight
      }, [currentIndex]);
    }
    
    // 更新自定义输入框的值
    setCustomWidth(newWidth);
    setCustomHeight(newHeight);
  };

  return (
    <>
      {open && !movingOrDragging && (
        <Island
          padding={1}
          className={classNames('popup-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}
          ref={refs.setFloating}
          style={floatingStyles}
        >
          <Stack.Row gap={1} align="center">
            {state.hasFontColor && (
              <PopupFontColorButton
                board={board}
                key={0}
                currentColor={state.marks?.color}
                title={t('popupToolbar.fontColor')}
                fontColorIcon={
                  <FontColorIcon currentColor={state.marks?.color} />
                }
              ></PopupFontColorButton>
            )}
            {state.hasText && (
              <>
                <PopupFontSizeButton
                  fontSize={state.fontSize || 16}
                />
                <PopupFontFamilyButton
                  fontFamily={state.fontFamily || 'Arial'}
                />
                <PopupBoldButton
                  isBold={state.isBold || false}
                />
              </>
            )}
            {state.hasStroke && (
              <PopupStrokeButton
                board={board}
                key={1}
                currentColor={state.strokeColor}
                currentStyle={state.strokeStyle}
                title={t('popupToolbar.stroke')}
                hasStrokeStyle={state.hasStrokeStyle || false}
              >
                <label
                  className={classNames('stroke-label', 'color-label')}
                  style={{ borderColor: state.strokeColor }}
                ></label>
              </PopupStrokeButton>
            )}
            {state.hasFill && (
              <PopupFillButton
                board={board}
                key={2}
                currentColor={state.fill}
                title={t('popupToolbar.fillColor')}
              >
                <label
                  className={classNames('fill-label', 'color-label', {
                    'color-white':
                      state.fill && isWhite(removeHexAlpha(state.fill)),
                  })}
                  style={{ backgroundColor: state.fill }}
                ></label>
              </PopupFillButton>
            )}
            {state.hasText && (
              <PopupLinkButton
                board={board}
                key={3}
                title={t('popupToolbar.link')}
              ></PopupLinkButton>
            )}
            {state.isLine && (
              <>
                <ArrowMarkButton
                  board={board}
                  key={4}
                  end={'source'}
                  endProperty={state.source}
                />
                <ArrowMarkButton
                  board={board}
                  key={5}
                  end={'target'}
                  endProperty={state.target}
                />
              </>
            )}
          </Stack.Row>
        </Island>
      )}
      {/* Text toolbar - 文本工具栏 */}
      {textToolbarOpen && !movingOrDragging && toolbarPosition && (
        <SelectionToolbar position={toolbarPosition} externalPositioning />
      )}
      {/* Image toolbar - 一级工具栏（当二级工具栏未打开时显示） */}
      {imageToolbarOpen && !movingOrDragging && toolbarPosition && !layerMenuOpen && !sizeMenuOpen && (
        <Island
          padding={1}
          className={classNames('popup-toolbar', 'image-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}
          style={{
            position: 'absolute',
            left: toolbarPosition.left,
            top: toolbarPosition.top,
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
        >
          <Stack.Row gap={1} align="center">
            <ToolButton
              type="icon"
              icon={DownloadIcon}
              visible={true}
              title={t('general.download')}
              aria-label={t('general.download')}
              onPointerUp={() => {
                const imageElement = selectedElements.find(PlaitDrawElement.isImage) as any;
                if (imageElement && imageElement.url) {
                  const imageUrl = imageElement.url;
                  fetch(imageUrl)
                    .then(response => response.blob())
                    .then(blob => {
                      const blobUrl = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = blobUrl;
                      link.download = `image-${Date.now()}.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
                    })
                    .catch(() => {
                      window.open(imageUrl, '_blank');
                    });
                }
              }}
            />
            <ToolButton
              type="icon"
              icon={DuplicateIcon}
              visible={true}
              title={t('general.duplicate')}
              aria-label={t('general.duplicate')}
              onPointerUp={() => {
                duplicateElements(board);
              }}
            />
            <ToolButton
              type="icon"
              icon={TrashIcon}
              visible={true}
              title={t('general.delete')}
              aria-label={t('general.delete')}
              onPointerUp={() => {
                deleteFragment(board);
              }}
            />
            {/* 工具栏分隔符 */}
            <div className="toolbar-divider" />
            {/* 图层顺序入口按钮 */}
            <ToolButton
              type="icon"
              icon={LayersOutlined}
              visible={true}
              title="图层顺序"
              aria-label="图层顺序"
              onPointerUp={() => {
                setLayerMenuOpen(true);
              }}
            />
            {/* 常用尺寸入口按钮 */}
            <ToolButton
              type="icon"
              icon={SizeOutlined}
              visible={true}
              title="常用尺寸"
              aria-label="常用尺寸"
              onPointerUp={() => {
                setSizeMenuOpen(true);
              }}
            />
          </Stack.Row>
        </Island>
      )}

      {/* Image toolbar - 二级工具栏（图层顺序） */}
      {imageToolbarOpen && !movingOrDragging && toolbarPosition && layerMenuOpen && (
        <Island
          padding={1}
          className={classNames('popup-toolbar', 'image-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}
          style={{
            position: 'absolute',
            left: toolbarPosition.left,
            top: toolbarPosition.top,
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
        >
          <Stack.Row gap={1} align="center">
            <ToolButton
              type="icon"
              icon={AlignTopOutlined}
              visible={true}
              title="置顶"
              aria-label="置顶"
              disabled={isLastImage()}
              onPointerUp={() => {
                handleMoveToTop();
                setLayerMenuOpen(false);
              }}
            />
            <ToolButton
              type="icon"
              icon={ArrowUpOutlined}
              visible={true}
              title="上移一层"
              aria-label="上移一层"
              disabled={isLastImage()}
              onPointerUp={() => {
                handleMoveUp();
                setLayerMenuOpen(false);
              }}
            />
            <ToolButton
              type="icon"
              icon={ArrowDownOutlined}
              visible={true}
              title="下移一层"
              aria-label="下移一层"
              disabled={isFirstImage()}
              onPointerUp={() => {
                handleMoveDown();
                setLayerMenuOpen(false);
              }}
            />
            <ToolButton
              type="icon"
              icon={AlignBottomOutlined}
              visible={true}
              title="置底"
              aria-label="置底"
              disabled={isFirstImage()}
              onPointerUp={() => {
                handleMoveToBottom();
                setLayerMenuOpen(false);
              }}
            />
            {/* 工具栏分隔符 */}
            <div className="toolbar-divider" />
            {/* 返回一级工具栏 */}
            <ToolButton
              type="icon"
              icon={LayersOutlined}
              visible={true}
              title="返回"
              aria-label="返回"
              onPointerUp={() => {
                setLayerMenuOpen(false);
              }}
            />
          </Stack.Row>
        </Island>
      )}

      {/* Image toolbar - 二级工具栏（常用尺寸） */}
      {imageToolbarOpen && !movingOrDragging && toolbarPosition && sizeMenuOpen && (
        <Island
          padding={1}
          className={classNames('popup-toolbar', 'image-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}
          style={{
            position: 'absolute',
            left: toolbarPosition.left,
            top: toolbarPosition.top,
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
        >
          <Stack.Row gap={1} align="center">
            {/* 预设尺寸下拉菜单 */}
            <div className="size-dropdown-container">
              <div
                className="size-dropdown-trigger"
                onPointerUp={() => {
                  setSizeDropdownOpen(!sizeDropdownOpen);
                }}
              >
                <span>预设</span>
                <span className="size-dropdown-arrow">▼</span>
              </div>
              {sizeDropdownOpen && (
                <div className="size-dropdown-menu">
                  {/* 打印类尺寸 */}
                  <div className="size-dropdown-category">打印</div>
                  {COMMON_SIZES.filter(s => s.category === 'print').map(size => (
                    <div
                      key={size.sizeId}
                      className="size-dropdown-item"
                      onPointerUp={() => {
                        handleResizeImage(size.width, size.height);
                        setSizeDropdownOpen(false);
                      }}
                    >
                      <span className="size-dropdown-item-name">{size.sizeName}</span>
                      <span className="size-dropdown-item-spec">{size.width}×{size.height}</span>
                    </div>
                  ))}
                  {/* 社交类尺寸 */}
                  <div className="size-dropdown-category">社交</div>
                  {COMMON_SIZES.filter(s => s.category === 'social').map(size => (
                    <div
                      key={size.sizeId}
                      className="size-dropdown-item"
                      onPointerUp={() => {
                        handleResizeImage(size.width, size.height);
                        setSizeDropdownOpen(false);
                      }}
                    >
                      <span className="size-dropdown-item-name">{size.sizeName}</span>
                      <span className="size-dropdown-item-spec">{size.width}×{size.height}</span>
                    </div>
                  ))}
                  {/* 电商类尺寸 */}
                  <div className="size-dropdown-category">电商</div>
                  {COMMON_SIZES.filter(s => s.category === 'ecommerce').map(size => (
                    <div
                      key={size.sizeId}
                      className="size-dropdown-item"
                      onPointerUp={() => {
                        handleResizeImage(size.width, size.height);
                        setSizeDropdownOpen(false);
                      }}
                    >
                      <span className="size-dropdown-item-name">{size.sizeName}</span>
                      <span className="size-dropdown-item-spec">{size.width}×{size.height}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* 工具栏分隔符 */}
            <div className="toolbar-divider" />
            {/* 自定义尺寸输入框：W - 锁定 - H */}
            <div className="custom-size-inputs">
              <div className="size-input-wrapper">
                <span className="size-input-label">W</span>
                <input
                  type="number"
                  className="custom-size-input"
                  value={customWidth}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value) || 1);
                    setCustomWidth(val);
                    if (lockAspectRatio) {
                      const imageElement = getSelectedImageElement();
                      if (imageElement) {
                        const currentWidth = imageElement.points[1][0] - imageElement.points[0][0];
                        const currentHeight = imageElement.points[1][1] - imageElement.points[0][1];
                        const ratio = currentWidth / currentHeight;
                        setCustomHeight(Math.round(val / ratio));
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleResizeImage(customWidth, customHeight);
                    }
                  }}
                  onBlur={() => {
                    handleResizeImage(customWidth, customHeight);
                  }}
                  min={1}
                />
              </div>
              {/* 锁定比例按钮 */}
              <div
                className={`aspect-lock-button ${lockAspectRatio ? 'locked' : ''}`}
                onPointerUp={() => {
                  setLockAspectRatio(!lockAspectRatio);
                }}
                title={lockAspectRatio ? "解除锁定" : "锁定比例"}
              >
                {lockAspectRatio ? <LinkOutlined /> : <LinkBrokenOutlined />}
              </div>
              <div className="size-input-wrapper">
                <span className="size-input-label">H</span>
                <input
                  type="number"
                  className="custom-size-input"
                  value={customHeight}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value) || 1);
                    setCustomHeight(val);
                    if (lockAspectRatio) {
                      const imageElement = getSelectedImageElement();
                      if (imageElement) {
                        const currentWidth = imageElement.points[1][0] - imageElement.points[0][0];
                        const currentHeight = imageElement.points[1][1] - imageElement.points[0][1];
                        const ratio = currentWidth / currentHeight;
                        setCustomWidth(Math.round(val * ratio));
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleResizeImage(customWidth, customHeight);
                    }
                  }}
                  onBlur={() => {
                    handleResizeImage(customWidth, customHeight);
                  }}
                  min={1}
                />
              </div>
            </div>
            {/* 工具栏分隔符 */}
            <div className="toolbar-divider" />
            {/* 返回一级工具栏 */}
            <ToolButton
              type="icon"
              icon={SizeOutlined}
              visible={true}
              title="返回"
              aria-label="返回"
              onPointerUp={() => {
                setSizeMenuOpen(false);
              }}
            />
          </Stack.Row>
        </Island>
      )}
    </>
  );
};

export const getMindElementState = (
  board: PlaitBoard,
  element: MindElement
) => {
  const marks = getTextMarksByElement(element);
  return {
    fill: element.fill,
    strokeColor: getStrokeColorByMindElement(board, element),
    strokeStyle:getStrokeStyleByElement(board, element),
    marks,
  };
};

export const getDrawElementState = (
  board: PlaitBoard,
  element: PlaitDrawElement
) => {
  const marks: Omit<CustomText, 'text'> = getTextMarksByElement(element);
  // 获取文本样式信息
  const textStyle = (element as any).textStyle || {};
  return {
    fill: element.fill,
    strokeColor: getStrokeColorByDrawElement(board, element),
    strokeStyle: getStrokeStyleByElement(board, element),
    marks,
    source: element?.source || {},
    target: element?.target || {},
    // 文本样式
    fontSize: textStyle.fontSize || marks?.fontSize,
    fontFamily: textStyle.fontFamily || marks?.fontFamily,
    isBold: textStyle.bold || marks?.bold,
  };
};

export const getElementState = (board: PlaitBoard) => {
  const selectedElement = getSelectedElements(board)[0];
  if (MindElement.isMindElement(board, selectedElement)) {
    return getMindElementState(board, selectedElement);
  }
  return getDrawElementState(board, selectedElement as PlaitDrawElement);
};

export const hasFillProperty = (board: PlaitBoard, element: PlaitElement) => {
  if (MindElement.isMindElement(board, element)) {
    return true;
  }
  if (isClosedCustomGeometry(board, element)) {
    return true;
  }
  if (PlaitDrawElement.isDrawElement(element)) {
    return (
      PlaitDrawElement.isShapeElement(element) &&
      !PlaitDrawElement.isImage(element) &&
      !PlaitDrawElement.isText(element) &&
      isClosedDrawElement(element)
    );
  }
  return false;
};

export const hasStrokeProperty = (board: PlaitBoard, element: PlaitElement) => {
  if (MindElement.isMindElement(board, element)) {
    return true;
  }
  if (Freehand.isFreehand(element)) {
    return true;
  }
  if (PlaitDrawElement.isDrawElement(element)) {
    return (
      (PlaitDrawElement.isShapeElement(element) &&
        !PlaitDrawElement.isImage(element) &&
        !PlaitDrawElement.isText(element)) ||
      PlaitDrawElement.isArrowLine(element) ||
      PlaitDrawElement.isVectorLine(element) ||
      PlaitDrawElement.isTable(element)
    );
  }
  return false;
};

export const hasTextProperty = (board: PlaitBoard, element: PlaitElement) => {
  if (MindElement.isMindElement(board, element)) {
    return true;
  }
  if (PlaitDrawElement.isDrawElement(element)) {
    return PlaitDrawElement.isText(element);
  }
  return false;
};

export const hasStrokeStyleProperty = (
  board: PlaitBoard,
  element: PlaitElement
) => {
  return hasStrokeProperty(board, element);
};

export const getColorPropertyValue = (color: string) => {
  if (color === NO_COLOR) {
    return null;
  } else {
    return color;
  }
};

export const getStrokeColorByElement = (
  board: PlaitBoard,
  element: PlaitElement
) => {
  if (MindElement.isMindElement(board, element)) {
    return getStrokeColorByMindElement(board, element);
  }
  if (PlaitDrawElement.isDrawElement(element)) {
    return getStrokeColorByDrawElement(board, element);
  }
  return undefined;
};
