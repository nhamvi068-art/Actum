import React, { useState, useCallback } from 'react';
import Stack from '../../stack';
import { ToolButton } from '../../tool-button';
import { FontColorIcon, DuplicateIcon, TrashIcon, DownloadIcon, AlignTopOutlined, ArrowUpOutlined, ArrowDownOutlined, AlignBottomOutlined, LayersOutlined, SizeOutlined, LinkOutlined, LinkBrokenOutlined, ChevronLeftIcon, AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined, AlignJustifyOutlined, SplitImageIcon, ElementAlignLeftIcon, ElementDistributeMenuIcon } from '../../icons';
import {
  ATTACHED_ELEMENT_CLASS_NAME,
  getRectangleByElements,
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
import classNames from 'classnames';
import { useI18n } from '../../../i18n';
import {
  getStrokeColorByElement as getStrokeColorByMindElement,
  MindElement,
} from '@plait/mind';
import './popup-toolbar.scss';
import '../../../styles/canvas-toolbar.css';
import { canvasService } from '../../../services/db/canvas-service';
import {
  ArrowLineHandle,
  getStrokeColorByElement as getStrokeColorByDrawElement,
  getStrokeStyleByElement,
  isClosedCustomGeometry,
  isClosedDrawElement,
  isDrawElementsIncludeText,
  PlaitDrawElement,
} from '@plait/draw';
import { CustomText, StrokeStyle, getTextEditorsByElement } from '@plait/common';
import { getTextMarksByElement } from '@plait/text-plugins';
import { AlignEditor } from '@plait/text-plugins';
import { PopupFontColorButton } from './font-color-button';
import { PopupTypographyButton } from './typography-panel';
import { TypographyStyleButton } from './typography-style-panel';
import { PopupTextAlignButton } from './text-align-button';
import { PopupStrokeButton } from './stroke-button';
import { PopupFillButton } from './fill-button';
import { PopupBoldButton } from './bold-button';
import { PopupItalicButton } from './italic-button';
import { PopupUnderlineButton } from './underline-button';
import { PopupStrikethroughButton } from './strikethrough-button';
import { isWhite, removeHexAlpha } from '../../../utils/color';
import { NO_COLOR } from '../../../constants/color';
import { COMMON_SIZES } from '../../../constants/commonSizes';
import { Freehand } from '../../../plugins/freehand/type';
import { PopupLinkButton } from './link-button';
import { ArrowMarkButton } from './arrow-mark-button';
import { TextStyleConfig } from '../../../utils/text-style';
import { executeSmartSplit } from '../../../services/canvas-operations/split-image';
import { MessagePlugin } from 'tdesign-react';
import { AlignmentMenu } from './alignment-menu';
import { DistributeMenu } from './distribute-menu';
import { PhotoWallButton } from './photo-wall-button';
import { CropIcon } from '../../icons';
import { useImageCropOnCanvas } from './useImageCropOnCanvas';
import { CanvasCropOverlay } from './CanvasCropOverlay';
import { unifiedCacheService } from '../../../services/unified-cache-service';
import { getDataURL } from '../../../data/blob';

export const PopupToolbar = () => {
  const board = useBoard();
  const listRender = useListRender();
  const { t } = useI18n();
  const selectedElements = board.getSelectedElements();
  const [movingOrDragging, setMovingOrDragging] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [alignmentMenuOpen, setAlignmentMenuOpen] = useState(false);
  const [distributeMenuOpen, setDistributeMenuOpen] = useState(false);
  const [textAlignMenuOpen, setTextAlignMenuOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState<number>(800);
  const [customHeight, setCustomHeight] = useState<number>(800);
  const [lockAspectRatio, setLockAspectRatio] = useState<boolean>(true);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState<boolean>(false);
  const [isSmartSplitting, setIsSmartSplitting] = useState(false);

  // 裁剪相关状态
  const [cropMenuOpen, setCropMenuOpen] = useState(false);
  // 图层二级工具栏状态
  const [layerControlOpen, setLayerControlOpen] = useState(false);
  const {
    state: cropState,
    imageLoaded: cropImageLoaded,
    enterCropMode,
    exitCropMode,
    handleRotate,
    handleFlipHorizontal,
    handleFlipVertical,
    handleCropRatioChange,
    handleCropBoxChange,
    applyCrop,
    reset: resetCrop,
    imageRef: cropImageRef,
  } = useImageCropOnCanvas();

  // 获取图片在屏幕上的位置（用于 overlay 挂载）
  // 核心修复：使用节点上保存的静态 crop 数据来定位，绝对不能使用实时变化的 cropState.cropBox
  // 注意：只有在裁剪模式下才计算位置，避免不必要的警告
  const getImageScreenPosition = useCallback(() => {
    // 关键修复：添加早期返回，避免在非裁剪模式下访问 undefined 元素
    if (!cropState.isCropping || !cropState.originalImageElement) {
      return null;
    }

    const element = cropState.originalImageElement;

    const zoom = board.viewport.zoom;

    // 1. 获取图片当前在屏幕上的残缺包围盒
    const rectangle = getRectangleByElements(board, [element], false);
    const [start, end] = RectangleClient.getPoints(rectangle);
    const screenStart = toScreenPointFromHostPoint(
      board,
      toHostPointFromViewBoxPoint(board, start)
    );
    const screenEnd = toScreenPointFromHostPoint(
      board,
      toHostPointFromViewBoxPoint(board, end)
    );

    const elementScreenX = screenStart[0];
    const elementScreenY = screenStart[1];
    const elementScreenW = (screenEnd[0] - screenStart[0]);
    const elementScreenH = (screenEnd[1] - screenStart[1]);

    // 2. 核心修复：根据节点上保存的静态 crop 数据，推导出完整的原图屏幕位置
    let fullScreenX = elementScreenX;
    let fullScreenY = elementScreenY;
    let fullScreenW = elementScreenW;
    let fullScreenH = elementScreenH;

    if (element.crop && element.crop.width > 0 && element.crop.height > 0) {
      fullScreenW = elementScreenW / element.crop.width;
      fullScreenH = elementScreenH / element.crop.height;
      fullScreenX = elementScreenX - (element.crop.x * fullScreenW);
      fullScreenY = elementScreenY - (element.crop.y * fullScreenH);
    }

    console.log('[getImageScreenPosition] Static anchor result:', {
      fullScreenX,
      fullScreenY,
      fullScreenW,
      fullScreenH,
      elementScreenX,
      elementScreenY,
      elementScreenW,
      elementScreenH,
      elementCrop: element.crop,
    });

    // 3. 必须带上 overflow: hidden 来截断阴影
    return {
      x: fullScreenX,
      y: fullScreenY,
      width: fullScreenW,
      height: fullScreenH,
      overflowHidden: true,
    };
  }, [cropState.originalImageElement, board]);

  const imageScreenPosition = getImageScreenPosition();

  // 开始裁剪
  const handleStartCrop = useCallback(async () => {
    const imageElement = selectedElements.find(PlaitDrawElement.isImage) as any;
    if (!imageElement) return;

    // 尝试多种方式获取图片 URL
    let imageUrl = imageElement.url || imageElement.image?.url;

    // 如果没有 URL，尝试通过 assetId 获取
    if (!imageUrl && imageElement.assetId) {
      try {
        const blob = await unifiedCacheService.getAssetBlob(imageElement.assetId);
        if (blob) {
          imageUrl = await getDataURL(blob);
        }
      } catch (error) {
        console.error('[handleStartCrop] Failed to get image from assetId:', error);
      }
    }

    if (!imageUrl) {
      MessagePlugin.error('无法获取图片地址');
      return;
    }

    // 支持二次裁剪：如果元素已有 crop 数据，传入以恢复裁剪框位置
    const existingCrop = imageElement.crop;

    // 进入裁剪模式
    enterCropMode(imageUrl, imageElement, existingCrop);
    setCropMenuOpen(true);
  }, [selectedElements, enterCropMode]);

  // 确认裁剪
  const handleConfirmCrop = useCallback(async () => {
    const imageElement = cropState.originalImageElement;
    if (!imageElement) return;

    try {
      const { cropBox, imageWidth, imageHeight } = cropState;
      const imageIndex = board.children.findIndex((child: any) => child.id === imageElement.id);
      if (imageIndex < 0) return;

      // 1. 计算原始比例 (可能由于鼠标拖拽超出 0~1 范围)
      const rawX = cropBox.x / imageWidth;
      const rawY = cropBox.y / imageHeight;
      const rawW = cropBox.width / imageWidth;
      const rawH = cropBox.height / imageHeight;

      // 2. 核心修复：严格的边界钳制 (Clamp)
      // 起点绝不能越过左/上边界 (不能小于0)，也不能越过右/下边界 (不能大于1)
      const safeX = Math.max(0, Math.min(1, rawX));
      const safeY = Math.max(0, Math.min(1, rawY));

      // 宽高绝不能为负数，且 [起点 + 宽高] 绝不能超过 1 (也就是不能溢出原图的右/下边缘)
      const safeW = Math.max(0.01, Math.min(1 - safeX, rawW));
      const safeH = Math.max(0.01, Math.min(1 - safeY, rawH));

      const newCropData = {
        x: safeX,
        y: safeY,
        width: safeW,
        height: safeH
      };

      // 3. 提取当前画布上的物理坐标 (可能是完整的，也可能是上一次裁剪后残缺的)
      const currentPoints = imageElement.points;
      const currentStartX = currentPoints[0][0];
      const currentStartY = currentPoints[0][1];
      const currentPhysicalWidth = currentPoints[1][0] - currentStartX;
      const currentPhysicalHeight = currentPoints[1][1] - currentStartY;

      // 4. 核心修复：逆向还原出该图片如果【完全没被裁剪】时的物理包围盒
      let fullPhysicalWidth = currentPhysicalWidth;
      let fullPhysicalHeight = currentPhysicalHeight;
      let fullStartX = currentStartX;
      let fullStartY = currentStartY;

      const oldCrop = imageElement.crop;
      if (oldCrop && oldCrop.width > 0 && oldCrop.height > 0) {
        // 还原全尺寸物理宽高
        fullPhysicalWidth = currentPhysicalWidth / oldCrop.width;
        fullPhysicalHeight = currentPhysicalHeight / oldCrop.height;
        // 还原全尺寸物理起点 (当前起点减去因为旧裁剪而偏移的距离)
        fullStartX = currentStartX - (fullPhysicalWidth * oldCrop.x);
        fullStartY = currentStartY - (fullPhysicalHeight * oldCrop.y);
      }

      // 5. 根据【还原后的全尺寸物理包围盒】和【钳制后的安全比例】，计算最终的新坐标
      const newStartX = fullStartX + (fullPhysicalWidth * newCropData.x);
      const newStartY = fullStartY + (fullPhysicalHeight * newCropData.y);
      const newEndX = newStartX + (fullPhysicalWidth * newCropData.width);
      const newEndY = newStartY + (fullPhysicalHeight * newCropData.height);

      const newPoints: [Point, Point] = [
        [newStartX, newStartY],
        [newEndX, newEndY]
      ];

      // 6. 智能判断：如果完全恢复到了原图尺寸，直接清除 crop 属性，提升渲染性能
      const isFullImage = safeX === 0 && safeY === 0 && safeW === 1 && safeH === 1;

      const updatePayload: any = {
        points: newPoints,
        width: newEndX - newStartX,
        height: newEndY - newStartY,
        crop: newCropData
      };

      // 抹除完全不必要的裁剪数据
      if (isFullImage) {
        updatePayload.crop = null;
      }

      Transforms.setNode(board, updatePayload, [imageIndex]);

      exitCropMode();
      setCropMenuOpen(false);
      MessagePlugin.success('裁剪成功');
    } catch (error) {
      console.error('裁剪保存失败:', error);
      MessagePlugin.error('裁剪失败');
    }
  }, [cropState, board, exitCropMode]);

  // 取消裁剪
  const handleCancelCrop = useCallback(() => {
    exitCropMode();
    setCropMenuOpen(false);
  }, [exitCropMode]);

  // 处理文本对齐变化
  const handleTextAlignChange = (align: 'left' | 'center' | 'right' | 'justify') => {
    const selectedElements = board.getSelectedElements();
    if (selectedElements.length > 0) {
      selectedElements.forEach(element => {
        const editors = getTextEditorsByElement(element);
        editors.forEach(editor => {
          AlignEditor.setAlign(editor, align);
        });
      });
    }
  };

  const movingOrDraggingRef = useRef(movingOrDragging);

  // Check if selected element is an image
  const isImageSelected = selectedElements.length > 0 && selectedElements.every(PlaitDrawElement.isImage);

  const open =
    selectedElements.length > 0 &&
    !isSelectionMoving(board) &&
    !isImageSelected;
    
  // 图片选中时显示的一级工具栏
  const imageToolbarOpen = selectedElements.length > 0 && !isSelectionMoving(board) && isImageSelected;

  // 检测是否为文本元素（Mind 或 Draw Text）
  const isTextSelected = selectedElements.length > 0 &&
    selectedElements.some(value => hasTextProperty(board, value));

  // 文本工具栏显示条件
  const shouldShowTextToolbar = isTextSelected && !isSelectionMoving(board) && !movingOrDragging;

  // 文本工具栏位置状态
  const [textToolbarPosition, setTextToolbarPosition] = useState<{ left: number; top: number } | null>(null);

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
    isItalic?: boolean;
    isUnderline?: boolean;
    isStrikethrough?: boolean;
    textAlign?: string;
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
        const elements = board.getSelectedElements();
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

  // 选择变化时重置二级菜单状态
  useEffect(() => {
    setAlignmentMenuOpen(false);
    setDistributeMenuOpen(false);
  }, [selectedElements.length, selection]);

  // Position image toolbar above the selected element
  const [toolbarPosition, setToolbarPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const shouldOpen = imageToolbarOpen;
    if (shouldOpen && selectedElements.length > 0 && !movingOrDragging) {
      const elements = board.getSelectedElements();
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
      setToolbarPosition(newPosition);
    } else {
      setToolbarPosition(null);
    }
  }, [viewport, selection, children, movingOrDragging, imageToolbarOpen]);

  // 计算文本工具栏位置
  useEffect(() => {
    if (shouldShowTextToolbar && selectedElements.length > 0 && !movingOrDragging) {
      const elements = board.getSelectedElements();
      const rectangle = getRectangleByElements(board, elements, false);
      const [start, end] = RectangleClient.getPoints(rectangle);

      // 坐标系转换：ViewBox -> Host -> Screen
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
      setTextToolbarPosition(newPosition);
    } else {
      setTextToolbarPosition(null);
    }
  }, [viewport, selection, children, movingOrDragging, shouldShowTextToolbar]);

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

  // 获取元素索引
  const getElementIndex = useCallback((element: PlaitElement): number => {
    return board.children.findIndex((child) => child.id === element.id);
  }, [board.children]);

  // 图层操作：置顶
  const handleMoveToTop = useCallback(() => {
    const sorted = [...selectedElements].sort((a, b) => {
      const idxA = getElementIndex(a);
      const idxB = getElementIndex(b);
      return idxA - idxB;
    });

    sorted.forEach((element) => {
      const currentIdx = getElementIndex(element);
      if (currentIdx < board.children.length - 1) {
        Transforms.moveNode(board, [currentIdx], [board.children.length - 1]);
      }
    });
    board.onChange();

    // 【关键修复】直接调用 canvasService.saveFull 保存图层顺序
    // 不依赖 app.tsx 的事件监听器，确保数据一定写入 IndexedDB
    const projectId = (board as any).projectId;
    if (projectId) {
      canvasService.saveFull(
        projectId,
        board.children,
        (board as any).theme,
        (board as any).viewport
      ).then(()=>{
      }).catch((e) => {
        console.warn('[LayerControl] handleMoveToTop save failed:', e);
      });
    } else {
    }
    // 仍然通知 app.tsx 作为双重保障
    window.dispatchEvent(new CustomEvent('layer-order-changed', {
      detail: { children: board.children }
    }));
  }, [board, selectedElements, getElementIndex]);

  // 图层操作：置底
  const handleMoveToBottom = useCallback(() => {
    const sorted = [...selectedElements].sort((a, b) => {
      const idxA = getElementIndex(a);
      const idxB = getElementIndex(b);
      return idxA - idxB;
    });

    sorted.forEach((element) => {
      const currentIdx = getElementIndex(element);
      if (currentIdx > 0) {
        Transforms.moveNode(board, [currentIdx], [0]);
      }
    });
    board.onChange();

    // 【关键修复】直接调用 canvasService.saveFull 保存图层顺序
    const projectId = (board as any).projectId;
    if (projectId) {
      canvasService.saveFull(
        projectId,
        board.children,
        (board as any).theme,
        (board as any).viewport
      ).catch((e) => {
        console.warn('[LayerControl] handleMoveToBottom save failed:', e);
      });
    }
    window.dispatchEvent(new CustomEvent('layer-order-changed', {
      detail: { children: board.children }
    }));
  }, [board, selectedElements, getElementIndex]);

  // 图层操作：上移一层
  const handleMoveForward = useCallback(() => {
    const sorted = [...selectedElements].sort((a, b) => {
      const idxA = getElementIndex(a);
      const idxB = getElementIndex(b);
      return idxA - idxB;
    });

    sorted.forEach((element) => {
      const currentIdx = getElementIndex(element);
      if (currentIdx < board.children.length - 1) {
        Transforms.moveNode(board, [currentIdx], [currentIdx + 1]);
      }
    });
    board.onChange();

    // 【关键修复】直接调用 canvasService.saveFull 保存图层顺序
    const projectId = (board as any).projectId;
    if (projectId) {
      canvasService.saveFull(
        projectId,
        board.children,
        (board as any).theme,
        (board as any).viewport
      ).catch((e) => {
        console.warn('[LayerControl] handleMoveForward save failed:', e);
      });
    }
    window.dispatchEvent(new CustomEvent('layer-order-changed', {
      detail: { children: board.children }
    }));
  }, [board, selectedElements, getElementIndex]);

  // 图层操作：下移一层
  const handleMoveBackward = useCallback(() => {
    const sorted = [...selectedElements].sort((a, b) => {
      const idxA = getElementIndex(a);
      const idxB = getElementIndex(b);
      return idxA - idxB;
    });

    sorted.forEach((element) => {
      const currentIdx = getElementIndex(element);
      if (currentIdx > 0) {
        Transforms.moveNode(board, [currentIdx], [currentIdx - 1]);
      }
    });
    board.onChange();

    // 【关键修复】直接调用 canvasService.saveFull 保存图层顺序
    const projectId = (board as any).projectId;
    if (projectId) {
      canvasService.saveFull(
        projectId,
        board.children,
        (board as any).theme,
        (board as any).viewport
      ).catch((e) => {
        console.warn('[LayerControl] handleMoveBackward save failed:', e);
      });
    }
    window.dispatchEvent(new CustomEvent('layer-order-changed', {
      detail: { children: board.children }
    }));
  }, [board, selectedElements, getElementIndex]);

  return (
    <>
      {open && !movingOrDragging && !isTextSelected && (
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
                <TypographyStyleButton />
                <PopupBoldButton
                  isBold={state.isBold || false}
                />
                <PopupItalicButton
                  isItalic={state.isItalic || false}
                />
                <PopupUnderlineButton
                  isUnderline={state.isUnderline || false}
                />
                <PopupStrikethroughButton
                  isStrikethrough={state.isStrikethrough || false}
                />
                <PopupTypographyButton
                  fontSize={state.fontSize || 16}
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
      {/* Image toolbar - 一级工具栏（当二级工具栏未打开时显示） */}
      {imageToolbarOpen && !movingOrDragging && toolbarPosition && !sizeMenuOpen && !alignmentMenuOpen && !distributeMenuOpen && !layerControlOpen && (
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
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Stack.Row gap={1} align="center">
            {/* 多选图片时的对齐和分布功能入口按钮 */}
            {selectedElements.length >= 2 && (
              <>
                <ToolButton
                  type="icon"
                  icon={<ElementAlignLeftIcon />}
                  visible={true}
                  title="对齐"
                  aria-label="对齐"
                  onPointerUp={() => setAlignmentMenuOpen(true)}
                />
                <ToolButton
                  type="icon"
                  icon={<ElementDistributeMenuIcon />}
                  visible={true}
                  title="分布"
                  aria-label="分布"
                  onPointerUp={() => setDistributeMenuOpen(true)}
                />
                {/* 合并为照片墙按钮 */}
                <PhotoWallButton
                  board={board}
                  selectedElements={selectedElements}
                />
                <div className="toolbar-divider" />
              </>
            )}
            <ToolButton
              type="icon"
              icon={DownloadIcon}
              visible={true}
              title={t('general.download')}
              aria-label={t('general.download')}
              onPointerUp={() => {
                const imageElement = selectedElements.find(PlaitDrawElement.isImage) as any;
                if (!imageElement) return;

                // 优先使用 assetId 获取 Blob（新架构）
                const assetId = imageElement.assetId;
                const imageUrl = imageElement.url;

                const doDownload = async (blob: Blob) => {
                  const blobUrl = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = blobUrl;
                  // 从 blob type 推断扩展名
                  const ext = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'jpg' : 'png';
                  link.download = `image-${Date.now()}.${ext}`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
                };

                if (assetId) {
                  // 新架构：通过 assetId 从缓存获取原始尺寸图片（用于下载）
                  unifiedCacheService.getOriginalBlob(assetId).then(blob => {
                    if (blob) {
                      doDownload(blob);
                    } else {
                      console.warn('[Download] No blob found for assetId:', assetId);
                    }
                  }).catch(err => {
                    console.error('[Download] Failed to get blob:', err);
                  });
                } else if (imageUrl) {
                  // 旧架构：直接 fetch URL
                  fetch(imageUrl)
                    .then(response => response.blob())
                    .then(doDownload)
                    .catch(() => {
                      window.open(imageUrl, '_blank');
                    });
                } else {
                  console.warn('[Download] No assetId or url found for image element');
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
            {/* 智能拆图按钮 */}
            <ToolButton
              type="icon"
              icon={SplitImageIcon}
              visible={true}
              title={t('popupToolbar.smartSplit')}
              aria-label={t('popupToolbar.smartSplit')}
              disabled={isSmartSplitting}
              onPointerUp={async () => {
                const imageElement = selectedElements.find(PlaitDrawElement.isImage);
                if (imageElement) {
                  setIsSmartSplitting(true);
                  try {
                    const result = await executeSmartSplit(board, imageElement);

                    // 1. 拆分失败（算法校验未通过，如未检测到分割线）
                    if (!result.success || (result.sliceCount !== undefined && result.sliceCount <= 1)) {
                      MessagePlugin.warning('未能检测到清晰的宫格或背景分割线，图片无法进行智能拆分。');
                      return;
                    }

                    // 2. 拆分成功
                    MessagePlugin.success(`智能拆图成功，已拆分为 ${result.sliceCount} 个元素！`);

                  } catch (error: any) {
                    // 3. 异常捕获（包含我们之前做的 CORS 污染拦截）
                    const errorMsg = error?.message || '拆图过程中发生未知错误';
                    if (errorMsg.includes('CORS_RESTRICTION') || errorMsg.includes('tainted')) {
                      MessagePlugin.error({ content: '跨域图片限制：无法读取像素数据进行拆分分析。请先将图片下载至本地，再重新上传进行拆分。', duration: 5000 });
                    } else {
                      MessagePlugin.error(`拆图失败: ${errorMsg}`);
                    }
                    console.error('[SmartSplit] error:', error);
                  } finally {
                    setIsSmartSplitting(false);
                  }
                }
              }}
            />
            {/* 裁剪按钮 */}
            <ToolButton
              type="icon"
              icon={CropIcon}
              visible={true}
              title={t('popupToolbar.crop')}
              aria-label={t('popupToolbar.crop')}
              onPointerUp={() => {
                handleStartCrop();
              }}
            />
            {/* 工具栏分隔符 */}
            <div className="toolbar-divider" />
            {/* 图层顺序入口按钮 */}
            <ToolButton
              type="icon"
              icon={LayersOutlined}
              visible={true}
              title={t('layerControl.title') || '图层顺序'}
              aria-label={t('layerControl.title') || '图层顺序'}
              onPointerUp={() => {
                setLayerControlOpen(true);
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
          onPointerDown={(e) => e.stopPropagation()}
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

      {/* Image toolbar - 二级工具栏（图层顺序） */}
      {imageToolbarOpen && !movingOrDragging && toolbarPosition && layerControlOpen && (
        <Island
          padding={1}
          className={classNames(
            'popup-toolbar',
            'image-toolbar',
            'layer-control-island',
            ATTACHED_ELEMENT_CLASS_NAME
          )}
          style={{
            position: 'absolute',
            left: toolbarPosition.left,
            top: toolbarPosition.top,
            transform: 'translateX(-50%)',
            zIndex: 1001,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Stack.Row gap={1} align="center">
            <ToolButton
              type="icon"
              icon={AlignTopOutlined}
              visible={true}
              title={t('layerControl.bringToFront') || '置顶'}
              aria-label={t('layerControl.bringToFront') || '置顶'}
              onPointerUp={() => {
                handleMoveToTop();
                setLayerControlOpen(false);
              }}
            />
            <ToolButton
              type="icon"
              icon={ArrowUpOutlined}
              visible={true}
              title={t('layerControl.bringForward') || '上移一层'}
              aria-label={t('layerControl.bringForward') || '上移一层'}
              onPointerUp={() => {
                handleMoveForward();
                setLayerControlOpen(false);
              }}
            />
            <ToolButton
              type="icon"
              icon={ArrowDownOutlined}
              visible={true}
              title={t('layerControl.sendBackward') || '下移一层'}
              aria-label={t('layerControl.sendBackward') || '下移一层'}
              onPointerUp={() => {
                handleMoveBackward();
                setLayerControlOpen(false);
              }}
            />
            <ToolButton
              type="icon"
              icon={AlignBottomOutlined}
              visible={true}
              title={t('layerControl.sendToBack') || '置底'}
              aria-label={t('layerControl.sendToBack') || '置底'}
              onPointerUp={() => {
                handleMoveToBottom();
                setLayerControlOpen(false);
              }}
            />
            <div className="toolbar-divider" />
            <ToolButton
              type="icon"
              icon={LayersOutlined}
              visible={true}
              title="返回"
              aria-label="返回"
              onPointerUp={() => {
                setLayerControlOpen(false);
              }}
            />
          </Stack.Row>
        </Island>
      )}

      {/* Image toolbar - 二级工具栏（对齐） */}
      {imageToolbarOpen && !movingOrDragging && toolbarPosition && alignmentMenuOpen && selectedElements.length >= 2 && (
        <AlignmentMenu
          toolbarPosition={toolbarPosition}
          onClose={() => setAlignmentMenuOpen(false)}
          disabled={selectedElements.length < 2}
        />
      )}

      {/* Image toolbar - 二级工具栏（分布） */}
      {imageToolbarOpen && !movingOrDragging && toolbarPosition && distributeMenuOpen && selectedElements.length >= 2 && (
        <DistributeMenu
          toolbarPosition={toolbarPosition}
          onClose={() => setDistributeMenuOpen(false)}
          disabled={selectedElements.length < 2}
        />
      )}

      {/* 文本工具栏 - 使用 CSS 隔离 */}
      <div
        className="text-toolbar-container"
        style={{
          position: 'absolute',
          left: textToolbarPosition?.left,
          top: textToolbarPosition?.top,
          transform: 'translateX(-50%)',
          opacity: shouldShowTextToolbar ? 1 : 0,
          pointerEvents: shouldShowTextToolbar ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
          zIndex: 1000,
        }}
      >
        {/* 一级工具栏 - 当对齐二级工具栏未打开时显示 */}
        {!textAlignMenuOpen && (
          <Island padding={1} className={classNames('popup-toolbar', 'text-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}>
            <Stack.Row gap={1} align="center">
              {/* 文字样式预设 - 放在最左侧 */}
              {state.hasText && (
                <TypographyStyleButton />
              )}
              {/* 粗体 */}
              {state.hasText && (
                <PopupBoldButton
                  isBold={state.isBold || false}
                />
              )}
              {/* 斜体 */}
              {state.hasText && (
                <PopupItalicButton
                  isItalic={state.isItalic || false}
                />
              )}
              {/* 下划线 */}
              {state.hasText && (
                <PopupUnderlineButton
                  isUnderline={state.isUnderline || false}
                />
              )}
              {/* 删除线 */}
              {state.hasText && (
                <PopupStrikethroughButton
                  isStrikethrough={state.isStrikethrough || false}
                />
              )}
              {/* 颜色 */}
              {state.hasFontColor && (
                <PopupFontColorButton
                  board={board}
                  currentColor={state.marks?.color}
                  title={t('popupToolbar.fontColor')}
                  fontColorIcon={
                    <FontColorIcon currentColor={state.marks?.color} />
                  }
                />
              )}
              {/* 文字对齐 - 入口按钮 */}
              {state.hasText && (
                <>
                  {/* 工具栏分隔符 */}
                  <div className="toolbar-divider" />
                  <PopupTextAlignButton
                    textAlign={state.textAlign || 'left'}
                    onClick={() => setTextAlignMenuOpen(true)}
                  />
                </>
              )}
              {/* 综合排版面板 - 放在最右侧 */}
              {state.hasText && (
                <PopupTypographyButton
                  fontSize={state.fontSize || 16}
                />
              )}
            </Stack.Row>
          </Island>
        )}
        {/* 文字对齐 - 二级工具栏 */}
        {textAlignMenuOpen && shouldShowTextToolbar && textToolbarPosition && (
          <Island
            padding={1}
            className={classNames('popup-toolbar', 'text-toolbar', 'text-align-secondary-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}
          >
            <Stack.Row gap={1} align="center">
              {/* 左对齐 */}
              <ToolButton
                type="icon"
                icon={<AlignLeftOutlined />}
                visible={true}
                title={t('textAlign.left') || '左对齐'}
                aria-label={t('textAlign.left') || '左对齐'}
                onPointerUp={() => {
                  handleTextAlignChange('left');
                  setTextAlignMenuOpen(false);
                }}
              />
              {/* 居中对齐 */}
              <ToolButton
                type="icon"
                icon={<AlignCenterOutlined />}
                visible={true}
                title={t('textAlign.center') || '居中对齐'}
                aria-label={t('textAlign.center') || '居中对齐'}
                onPointerUp={() => {
                  handleTextAlignChange('center');
                  setTextAlignMenuOpen(false);
                }}
              />
              {/* 右对齐 */}
              <ToolButton
                type="icon"
                icon={<AlignRightOutlined />}
                visible={true}
                title={t('textAlign.right') || '右对齐'}
                aria-label={t('textAlign.right') || '右对齐'}
                onPointerUp={() => {
                  handleTextAlignChange('right');
                  setTextAlignMenuOpen(false);
                }}
              />
              {/* 两端对齐 */}
              <ToolButton
                type="icon"
                icon={<AlignJustifyOutlined />}
                visible={true}
                title={t('textAlign.justify') || '两端对齐'}
                aria-label={t('textAlign.justify') || '两端对齐'}
                onPointerUp={() => {
                  handleTextAlignChange('justify');
                  setTextAlignMenuOpen(false);
                }}
              />
              {/* 工具栏分隔符 */}
              <div className="toolbar-divider" />
              {/* 返回按钮 */}
              <ToolButton
                type="icon"
                icon={ChevronLeftIcon}
                visible={true}
                title="返回"
                aria-label="返回"
                onPointerUp={() => {
                  setTextAlignMenuOpen(false);
                }}
              />
            </Stack.Row>
          </Island>
        )}
      </div>

      {/* 画布裁剪模式 - 跟随图片位置，overflow: hidden 截断阴影 */}
      {cropState.isCropping && cropState.cropImageUrl && (() => {
        const position = getImageScreenPosition();
        if (!position) return null;
        return (
        <div
          style={{
            position: 'absolute',
            left: position.x,
            top: position.y,
            width: position.width,
            height: position.height,
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          <CanvasCropOverlay
            imageUrl={cropState.cropImageUrl}
            imageWidth={cropState.imageWidth}
            imageHeight={cropState.imageHeight}
            screenBox={{
              x: 0,
              y: 0,
              width: position.width,
              height: position.height,
            }}
            cropBox={cropState.cropBox}
            onCropBoxChange={handleCropBoxChange}
            onCancel={handleCancelCrop}
            onConfirm={handleConfirmCrop}
          />
        </div>
        );
      })()}
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
  // 获取文本样式信息 - 使用 TextStyleConfig 统一模型
  const textStyle: TextStyleConfig = (element as any).textStyle || {
    fontSize: 16,
    fontFamily: 'Arial',
    fontWeight: 400,
    scale: 1,
    effects: [],
  };

  return {
    fill: element.fill,
    strokeColor: getStrokeColorByDrawElement(board, element),
    strokeStyle: getStrokeStyleByElement(board, element),
    marks,
    source: element?.source || {},
    target: element?.target || {},
    // 统一文本样式模型
    textStyle: {
      fontSize: textStyle.fontSize || marks?.fontSize || 16,
      fontFamily: textStyle.fontFamily || marks?.fontFamily,
      fontWeight: textStyle.fontWeight || (marks?.bold ? 700 : 400),
      scale: textStyle.scale || 1,
      effects: textStyle.effects || [],
    },
    // Slate marks 用于即时样式
    isBold: marks?.bold,
    isItalic: marks?.italic,
    isUnderline: marks?.underlined,
    isStrikethrough: marks?.strike,
    textAlign: (marks as any)?.align || 'left',
    fontColor: marks?.color,
    // 兼容旧字段
    fontSize: textStyle.fontSize || marks?.fontSize,
    fontFamily: textStyle.fontFamily || marks?.fontFamily,
  };
};

export const getElementState = (board: PlaitBoard) => {
  const selectedElement = board.getSelectedElements()[0];
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
