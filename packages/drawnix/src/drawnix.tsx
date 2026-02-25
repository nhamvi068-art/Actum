import { Board, BoardChangeData, Wrapper } from '@plait-board/react-board';
import { useBoard } from '@plait-board/react-board';
import {
  PlaitBoard,
  PlaitBoardOptions,
  PlaitElement,
  PlaitPlugin,
  PlaitPointerType,
  PlaitTheme,
  Point,
  Selection,
  ThemeColorMode,
  Viewport,
  getSelectedElements,
  RectangleClient,
  getSnapRectangles,
  drawPointSnapLines,
  PlaitBoard as PlaitBoardCore,
  clearSelectedElement,
  Transforms,
} from '@plait/core';
import React, { useState, useRef, useEffect } from 'react';
import { withGroup } from '@plait/common';
import { withDraw, PlaitDrawElement, DrawTransforms } from '@plait/draw';
import { MindThemeColors, withMind } from '@plait/mind';
import MobileDetect from 'mobile-detect';
import { withMindExtend } from './plugins/with-mind-extend';
import { withCommonPlugin } from './plugins/with-common';
import { CreationToolbar } from './components/toolbar/creation-toolbar';
import { ZoomToolbar } from './components/toolbar/zoom-toolbar';
import { PopupToolbar } from './components/toolbar/popup-toolbar/popup-toolbar';
import { AppToolbar } from './components/toolbar/app-toolbar/app-toolbar';
import classNames from 'classnames';
import './styles/index.scss';
import { buildDrawnixHotkeyPlugin } from './plugins/with-hotkey';
import { withFreehand } from './plugins/freehand/with-freehand';
import { buildPencilPlugin } from './plugins/with-pencil';
import {
  DrawnixBoard,
  DrawnixContext,
  DrawnixState,
} from './hooks/use-drawnix';
import { ClosePencilToolbar } from './components/toolbar/pencil-mode-toolbar';
import { TTDDialog } from './components/ttd-dialog/ttd-dialog';
import { CleanConfirm } from './components/clean-confirm/clean-confirm';
import { buildTextLinkPlugin } from './plugins/with-text-link';
import { LinkPopup } from './components/popup/link-popup/link-popup';
import { I18nProvider } from './i18n';
import { Tutorial } from './components/tutorial';
import { LASER_POINTER_CLASS_NAME } from './utils/laser-pointer';
import { loadHTMLImageElement, buildImage } from './data/image';
import { DataURL } from './types';
import {
  BottomInputBar,
  type ImageGenerateOptions,
  MODEL_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  SIZE_OPTIONS,
} from './components/bottom-input-bar/bottom-input-bar';

// Re-export for external use
export {
  BottomInputBar,
  type ImageGenerateOptions,
  MODEL_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  SIZE_OPTIONS,
};

// Selection tracker component that lives inside Board
const SelectionTracker: React.FC<{
  onImageSelect: (urls: string[]) => void;
  isInputFocusedRef?: React.MutableRefObject<boolean>;
}> = ({ onImageSelect, isInputFocusedRef }) => {
  const board = useBoard();
  // 存储上一次成功传递的值
  const lastSentUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const selectedElements = getSelectedElements(board);

      const imageUrls: string[] = [];
      selectedElements.forEach(element => {
        if (PlaitDrawElement.isImage(element)) {
          const imageElement = element as any;
          if (imageElement.url) {
            imageUrls.push(imageElement.url);
          }
        }
      });

      const prevUrls = lastSentUrlsRef.current;
      const isBoardFocused = PlaitBoard.isFocus(board);

      // 只有当值真正不同时才更新
      const shouldUpdate = JSON.stringify(imageUrls) !== JSON.stringify(prevUrls);

      // 当输入框有焦点时，保持当前选中状态，不更新
      const isInputFocused = isInputFocusedRef?.current ?? false;

      if (shouldUpdate && !isInputFocused) {
        if (isBoardFocused) {
          // 画布有焦点时正常更新
          lastSentUrlsRef.current = imageUrls;
          onImageSelect(imageUrls);
        } else if (imageUrls.length > 0) {
          // 画布失去焦点但有选中图片时也更新
          lastSentUrlsRef.current = imageUrls;
        onImageSelect(imageUrls);
      }
        // 画布失去焦点且没有选中图片时，不更新（保留之前的值）
      }
    }, 200);

    return () => clearInterval(intervalId);
  }, [board, onImageSelect, isInputFocusedRef]);

  return null;
};

export type DrawnixProps = {
  value: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
  onChange?: (value: BoardChangeData) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onValueChange?: (value: PlaitElement[]) => void;
  onViewportChange?: (value: Viewport) => void;
  onThemeChange?: (value: ThemeColorMode) => void;
  afterInit?: (board: PlaitBoard) => void;
  tutorial?: boolean;
  canvasRef?: (canvas: HTMLCanvasElement | null) => void;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  onBack?: () => void;
  // 图片生成相关
  onGenerateImage?: (prompt: string, images: string[], options: ImageGenerateOptions) => void;
  onImageGenerated?: (imageUrl: string, placeholderId: string) => void;
  imageGenerateOptions?: ImageGenerateOptions;
  isGenerating?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

// 占位块信息接口
export interface PlaceholderInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: string;
  placeholderElement?: PlaitElement;
  imageUrl?: string; // 用于显示生成的图片
}

// 比例尺寸对照表 - 占位块的显示尺寸（像素）
export const ASPECT_RATIO_SIZES: Record<string, { width: number; height: number }> = {
  '1:1': { width: 200, height: 200 },
  '2:3': { width: 160, height: 240 },
  '3:4': { width: 180, height: 240 },
  '4:5': { width: 160, height: 200 },
  '9:16': { width: 135, height: 240 },
  '3:2': { width: 240, height: 160 },
  '4:3': { width: 240, height: 180 },
  '5:4': { width: 200, height: 160 },
  '16:9': { width: 240, height: 135 },
  '21:9': { width: 280, height: 129 },
};

// 获取选中图片元素的位置信息
const getSelectedImageBounds = (board: PlaitBoard): { x: number; y: number; width: number; height: number } | null => {
  const selectedElements = getSelectedElements(board);
  const imageElement = selectedElements.find(el => PlaitDrawElement.isImage(el));
  
  if (imageElement) {
    const el = imageElement as any;
    return {
      x: el.x || 0,
      y: el.y || 0,
      width: el.width || 200,
      height: el.height || 200,
    };
  }
  
  return null;
};

// 计算占位块位置 - 在选中图片的右侧或下方寻找空白位置（使用视口坐标）
const calculatePlaceholderPosition = (
  board: PlaitBoard,
  placeholderWidth: number,
  placeholderHeight: number
): { x: number; y: number } => {
  const viewport = board.viewport;
  const zoom = viewport.zoom || 1;
  
  // 获取视口左上角在画布中的位置
  const origX = viewport.origination?.[0] || 0;
  const origY = viewport.origination?.[1] || 0;
  
  // 视口中心位置（转换为画布坐标）
  const viewportCenterX = origX + (800 / 2 / zoom);  // 假设视口宽约800
  const viewportCenterY = origY + (600 / 2 / zoom);  // 假设视口高约600
  
  const imageBounds = getSelectedImageBounds(board);
  
  // 默认位置：视口中心
  let x = viewportCenterX;
  let y = viewportCenterY;
  
  if (imageBounds) {
    // 尝试放在选中图片的右侧
    const rightX = imageBounds.x + imageBounds.width + 30;
    const rightY = imageBounds.y;
    
    // 尝试放在选中图片的下方
    const belowX = imageBounds.x;
    const belowY = imageBounds.y + imageBounds.height + 30;
    
    // 简单判断：优先使用右侧位置，否则使用下方位置
    if (rightX < origX + 1500 / zoom && rightY < origY + 1000 / zoom) {
      x = rightX;
      y = rightY;
    } else if (belowY < origY + 1000 / zoom) {
      x = belowX;
      y = belowY;
    }
  }
  
  return { x, y };
};

// 根据比例获取占位块尺寸
export const getPlaceholderSize = (aspectRatio: string): { width: number; height: number } => {
  return ASPECT_RATIO_SIZES[aspectRatio] || { width: 1024, height: 1024 };
};

// 在视口内寻找空白位置（从中心向外搜索最近的）
const findEmptyPosition = (
  board: PlaitBoard,
  width: number,
  height: number,
  startX: number,
  startY: number,
  zoom: number
): { x: number; y: number } => {
  // 视口可见区域（画布坐标）
  const viewportWidth = (window.innerWidth || 800) / zoom;
  const viewportHeight = (window.innerHeight || 600) / zoom;
  
  // 网格搜索步长
  const step = Math.max(width, height) * 1.2;
  
  // 从起始位置向外螺旋搜索，找到最近的空白位置
  const maxRadius = 5; // 搜索半径（步长的倍数）
  
  // 首先检查起始位置是否可用
  if (!isPositionOccupied(board, startX, startY, width, height)) {
    return { x: startX, y: startY };
  }
  
  // 从中心向外搜索
  for (let radius = 1; radius <= maxRadius; radius++) {
    // 检查四个方向的点
    const checkPoints = [
      { x: startX + radius * step, y: startY },           // 右
      { x: startX - radius * step, y: startY },           // 左
      { x: startX, y: startY + radius * step },          // 下
      { x: startX, y: startY - radius * step },          // 上
      { x: startX + radius * step, y: startY + radius * step },   // 右下
      { x: startX - radius * step, y: startY + radius * step },   // 左下
      { x: startX + radius * step, y: startY - radius * step },   // 右上
      { x: startX - radius * step, y: startY - radius * step },   // 左上
    ];
    
    for (const point of checkPoints) {
      // 检查是否在视口范围内
      const viewport = board.viewport;
      const origX = viewport.origination?.[0] || 0;
      const origY = viewport.origination?.[1] || 0;
      
      if (point.x >= origX && point.x <= origX + viewportWidth - width &&
          point.y >= origY && point.y <= origY + viewportHeight - height) {
        if (!isPositionOccupied(board, point.x, point.y, width, height)) {
          return { x: point.x, y: point.y };
        }
      }
    }
  }
  
  // 如果找不到空白位置，使用默认位置（视口左上角偏移位置，避免在正中心覆盖其他内容）
  const viewport = board.viewport;
  const origX = viewport.origination?.[0] || 0;
  const origY = viewport.origination?.[1] || 0;
  // 距离左上角 100px 的位置
  return {
    x: origX + 100,
    y: origY + 100
  };
};

// 检查指定位置是否与其他元素重叠
const isPositionOccupied = (
  board: PlaitBoard,
  x: number,
  y: number,
  width: number,
  height: number,
  margin: number = 20
): boolean => {
  const newRect = { x, y, width, height };
  
  for (const element of board.children) {
    // 使用 board.getRectangle 获取元素的位置和尺寸
    const rect = board.getRectangle(element);
    if (!rect) continue;
    
    const { x: elX, y: elY, width: elWidth, height: elHeight } = rect;
    
    // 简单的矩形碰撞检测（带边距）
    if (
      newRect.x < elX + elWidth + margin &&
      newRect.x + newRect.width + margin > elX &&
      newRect.y < elY + elHeight + margin &&
      newRect.y + newRect.height + margin > elY
    ) {
      return true;
    }
  }
  
  return false;
};

// 生成唯一ID
const generatePlaceholderId = () => `placeholder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// 加载动画覆盖层组件 - 只用一个占位符显示位置和动画效果
const PlaceholderOverlay: React.FC<{
  placeholder: PlaceholderInfo;
  board: PlaitBoard;
  onPlaceholderMove?: (x: number, y: number) => void;
}> = ({ placeholder, board, onPlaceholderMove }) => {
  // 直接使用 placeholderInfo 中的位置信息
  const elementX = placeholder.x;
  const elementY = placeholder.y;
  const elementWidth = placeholder.width;
  const elementHeight = placeholder.height;
  
  // 使用与插入图片相同的坐标计算
  const viewport = board.viewport;
  const zoom = viewport.zoom || 1;
  const origX = viewport.origination?.[0] || 0;
  const origY = viewport.origination?.[1] || 0;
  
  // 计算相对于视口的屏幕位置
  const left = (elementX - origX) * zoom;
  const top = (elementY - origY) * zoom;
  const width = elementWidth * zoom;
  const height = elementHeight * zoom;
  
  // 创建一个临时的虚拟 geometry 元素用于移动对齐
  const createMovingElement = (x: number, y: number): PlaitElement => {
    // geometry 元素需要 points 属性（两个点的数组）和 shape 属性
    const points: [Point, Point] = [
      [x, y],
      [x + elementWidth, y + elementHeight]
    ];
    return {
      id: placeholder.id,
      type: 'geometry',
      shape: 'rectangle',
      points: points,
      fill: 'transparent',
      strokeColor: '#9ca3af',
      strokeWidth: 1,
      children: [],
    } as PlaitElement;
  };
  
  // 拖动处理 - 使用纯 React 方式和 drawPointSnapLines 绘制对齐线
  const handlePointerDown = (e: React.PointerEvent) => {
    // 阻止默认行为以防止选择
    e.preventDefault();
    // 阻止事件冒泡
    e.stopPropagation();
    
    if (!onPlaceholderMove) return;
    
    // 获取 DOM 元素并设置指针捕获
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const origElementX = elementX;
    const origElementY = elementY;
    
    // 用于存储对齐线的引用
    let snapLinesG: SVGGElement | null = null;
    
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startX) / zoom;
      const deltaY = (moveEvent.clientY - startY) / zoom;
      let newX = origElementX + deltaX;
      let newY = origElementY + deltaY;
      
      // 移除旧的对齐线
      if (snapLinesG) {
        snapLinesG.remove();
        snapLinesG = null;
      }
      
      // 创建当前占位符位置的 RectangleClient
      const activeRectangle: RectangleClient = {
        x: newX,
        y: newY,
        width: elementWidth,
        height: elementHeight
      };
      
      // 获取可对齐的矩形
      const snapRectangles = getSnapRectangles(board, []);
      
      // 调试日志
      console.log('[Snap] Active rect:', activeRectangle);
      console.log('[Snap] Snap rects count:', snapRectangles.length);
      
      // 绘制对齐线
      if (snapRectangles.length > 0) {
        try {
          snapLinesG = drawPointSnapLines(board, activeRectangle, snapRectangles, true, true, true);
          
          console.log('[Snap] Generated snap lines, children:', snapLinesG?.children.length);
          
          // 如果返回了对齐线元素，确保它可见且在最上层
          if (snapLinesG && snapLinesG.children.length > 0) {
            snapLinesG.style.pointerEvents = 'none';
            snapLinesG.style.zIndex = '9999';
            
            // 将对齐线添加到 board host 中
            const host = PlaitBoardCore.getHost(board);
            if (host) {
              host.appendChild(snapLinesG);
              console.log('[Snap] Added to host');
            }
          } else {
            // 没有对齐线，不添加到 DOM
            snapLinesG = null;
          }
        } catch (err) {
          console.warn('drawPointSnapLines error:', err);
        }
      }
      
      // 更新占位符位置
      onPlaceholderMove(newX, newY);
    };
    
    const handlePointerUp = (upEvent: PointerEvent) => {
      // 释放指针捕获
      target.releasePointerCapture(upEvent.pointerId);
      
      // 移除对齐线
      if (snapLinesG) {
        snapLinesG.remove();
        snapLinesG = null;
      }
      
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
    
    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp, { passive: false });
  };
  
  return (
    <>
      <div
        className="image-placeholder"
        style={{
          position: 'absolute',
          left: left,
          top: top,
          width: width,
          height: height,
          overflow: 'hidden',
          pointerEvents: 'auto',
          cursor: 'grab',
          background: '#e5e7eb',
          userSelect: 'none',
        }}
        onPointerDown={handlePointerDown}
      >
      {/* 多层流光效果 */}
      <div
        className="placeholder-shimmer-1"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, #667eea, #764ba2, #f093fb, #667eea)',
          backgroundSize: '200% 100%',
        }}
      />
      <div
        className="placeholder-shimmer-2"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, #f093fb, #667eea, #764ba2, #f093fb)',
          backgroundSize: '200% 100%',
          opacity: 0.7,
        }}
      />
      <div
        className="placeholder-shimmer-3"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, #764ba2, #f093fb, #667eea, #764ba2)',
          backgroundSize: '200% 100%',
          opacity: 0.5,
        }}
      />
    </div>
    </>
  );
};

export const Drawnix: React.FC<DrawnixProps> = ({
  value,
  viewport,
  theme,
  onChange,
  onSelectionChange,
  onViewportChange,
  onThemeChange,
  onValueChange,
  afterInit,
  tutorial = false,
  canvasRef,
  headerLeft,
  headerRight,
  onBack,
  onGenerateImage,
  onImageGenerated,
  imageGenerateOptions,
  isGenerating,
}) => {
  const options: PlaitBoardOptions = {
    readonly: false,
    hideScrollbar: false,
    disabledScrollOnNonFocus: false,
    themeColors: MindThemeColors,
  };

  const [appState, setAppState] = useState<DrawnixState>(() => {
    // TODO: need to consider how to maintenance the pointer state in future
    const md = new MobileDetect(window.navigator.userAgent);
    return {
      pointer: PlaitPointerType.hand,
      isMobile: md.mobile() !== null,
      isPencilMode: false,
      openDialogType: null,
      openCleanConfirm: false,
    };
  });

  const [board, setBoard] = useState<DrawnixBoard | null>(null);
  const boardRef = useRef<DrawnixBoard | null>(null);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [placeholderInfo, setPlaceholderInfo] = useState<PlaceholderInfo | null>(null);
  // 记录上次占位符放置的位置（用于下次放置的参考）
  const lastPlaceholderPositionRef = useRef<{ x: number; y: number } | null>(null);
  const isInputFocusedRef = useRef(false);

  if (board) {
    board.appState = appState;
  }

  const updateAppState = (newAppState: Partial<DrawnixState>) => {
    setAppState({
      ...appState,
      ...newAppState,
    });
  };

  const plugins: PlaitPlugin[] = [
    withDraw,
    withGroup,
    withMind,
    withMindExtend,
    withCommonPlugin,
    buildDrawnixHotkeyPlugin(updateAppState),
    withFreehand,
    buildPencilPlugin(updateAppState),
    buildTextLinkPlugin(updateAppState),
  ];

  const containerRef = useRef<HTMLDivElement>(null);

  // 当输入框获得焦点时
  const handleInputFocus = () => {
    isInputFocusedRef.current = true;
  };

  // 当用户输入时
  const handleInputInput = () => {
    // 不再立即恢复选中状态，避免闪动
  };

  // 当输入框失去焦点时
  const handleInputBlur = () => {
    isInputFocusedRef.current = false;
    // 不再恢复选中状态，避免闪动
  };

  // 处理图片生成（带上下文）- 创建可拖拽的占位块
  const handleGenerateImageWithContext = async (
    value: string,
    images: string[],
    options: ImageGenerateOptions
  ) => {
    if (!board) return;
    
    let width: number;
    let height: number;
    let aspectRatio = options.aspect_ratio || '1:1';
    
    // 如果有输入图片，获取输入图片的尺寸
    if (images && images.length > 0) {
      try {
        const img = new Image();
        img.src = images[0];
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        
        // 使用输入图片的尺寸，保持宽高比
        // 如果图片太大，适当缩小以适应视口
        const maxSize = 600;
        let imgWidth = img.width;
        let imgHeight = img.height;
        
        // 如果图片太大，等比例缩小
        if (imgWidth > maxSize || imgHeight > maxSize) {
          const scale = Math.min(maxSize / imgWidth, maxSize / imgHeight);
          imgWidth = imgWidth * scale;
          imgHeight = imgHeight * scale;
        }
        
        width = imgWidth;
        height = imgHeight;
        
        // 计算新的宽高比
        aspectRatio = `${Math.round(width / height * 10) / 10}:1`;
      } catch (e) {
        // 如果获取图片尺寸失败，使用默认尺寸
        console.warn('Failed to get image dimensions, using default:', e);
        const defaultSize = getPlaceholderSize(aspectRatio);
        width = defaultSize.width;
        height = defaultSize.height;
      }
    } else {
      // 没有输入图片，使用默认尺寸
      const defaultSize = getPlaceholderSize(aspectRatio);
      width = defaultSize.width;
      height = defaultSize.height;
    }
    
    // 简化：直接使用视口中心作为位置
    // 视口左上角在画布上的位置就是 viewport.origination
    const viewport = board.viewport;
    const zoom = viewport.zoom || 1;
    const viewportWidth = window.innerWidth || 800;
    const viewportHeight = window.innerHeight || 600;
    
    // 视口左上角坐标
    const origX = viewport.origination?.[0] || 0;
    const origY = viewport.origination?.[1] || 0;
    
    // 计算视口中心在画布坐标中的位置
    // 屏幕像素转换为画布坐标需要除以 zoom
    const centerX = origX + (viewportWidth / 2) / zoom;
    const centerY = origY + (viewportHeight / 2) / zoom;
    
    // 视口边界（画布坐标）
    const viewportLeft = origX;
    const viewportTop = origY;
    const viewportRight = origX + viewportWidth / zoom;
    const viewportBottom = origY + viewportHeight / zoom;
    
    // 获取画布上所有元素，计算内容区域边界
    const allElements = board.children;
    let contentMinX = 0, contentMinY = 0, contentMaxX = 0, contentMaxY = 0;
    let hasContent = false;
    
    if (allElements.length > 0) {
      hasContent = true;
      // 初始化为第一个元素的位置
      const firstRect = board.getRectangle(allElements[0]);
      if (firstRect) {
        contentMinX = firstRect.x;
        contentMinY = firstRect.y;
        contentMaxX = firstRect.x + firstRect.width;
        contentMaxY = firstRect.y + firstRect.height;
      }
      
      // 计算所有元素的边界
      for (const element of allElements) {
        const rect = board.getRectangle(element);
        if (rect) {
          contentMinX = Math.min(contentMinX, rect.x);
          contentMinY = Math.min(contentMinY, rect.y);
          contentMaxX = Math.max(contentMaxX, rect.x + rect.width);
          contentMaxY = Math.max(contentMaxY, rect.y + rect.height);
        }
      }
    }
    
    // 内容中心（如果没有内容则使用视口中心）
    const contentCenterX = hasContent ? (contentMinX + contentMaxX) / 2 : centerX;
    const contentCenterY = hasContent ? (contentMinY + contentMaxY) / 2 : centerY;
    
    console.log('[Placeholder] Has content:', hasContent, 'Elements:', allElements.length);
    console.log('[Placeholder] Content center:', contentCenterX, contentCenterY);
    
    // 找到视口内空白位置最大的地方
    let finalX = contentCenterX - width / 2;
    let finalY = contentCenterY - height / 2;
    
    // 生成候选位置：在视口内创建网格采样点
    const candidates: { x: number; y: number; score: number }[] = [];
    const margin = 20;
    const gridSize = 5; // 5x5 网格
    
    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        const candidateX = viewportLeft + margin + (viewportRight - viewportLeft - 2 * margin) * (i / gridSize);
        const candidateY = viewportTop + margin + (viewportBottom - viewportTop - 2 * margin) * (j / gridSize);
        
        // 检查这个位置是否被占用
        if (!isPositionOccupied(board, candidateX, candidateY, width, height)) {
          // 计算分数：离现有内容越远越好
          let minDist = Infinity;
          for (const element of allElements) {
            const rect = board.getRectangle(element);
            if (rect) {
              const elemCenterX = rect.x + rect.width / 2;
              const elemCenterY = rect.y + rect.height / 2;
              const dist = Math.sqrt(
                Math.pow(candidateX + width / 2 - elemCenterX, 2) +
                Math.pow(candidateY + height / 2 - elemCenterY, 2)
              );
              minDist = Math.min(minDist, dist);
            }
          }
          
          candidates.push({
            x: candidateX,
            y: candidateY,
            score: minDist
          });
        }
      }
    }
    
    // 选择分数最高（离现有元素最远）的位置
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      finalX = candidates[0].x;
      finalY = candidates[0].y;
      console.log('[Placeholder] Best position found, score:', candidates[0].score);
    } else {
      // 没有找到空白位置，使用内容中心
      console.log('[Placeholder] No empty position found, using content center');
    }
    
    // 确保在视口内
    if (finalX < viewportLeft + margin) finalX = viewportLeft + margin;
    if (finalX + width > viewportRight - margin) finalX = viewportRight - margin - width;
    if (finalY < viewportTop + margin) finalY = viewportTop + margin;
    if (finalY + height > viewportBottom - margin) finalY = viewportBottom - margin - height;
    
    console.log('[Placeholder] Final position:', finalX, finalY);
    
    // 创建占位块信息 - 只使用位置信息，不需要创建画布元素
    const placeholderId = generatePlaceholderId();
    const newPlaceholder: PlaceholderInfo = {
      id: placeholderId,
      x: finalX,
      y: finalY,
      width,
      height,
      aspectRatio,
      placeholderElement: undefined, // 不再创建画布元素
    };
    
    setPlaceholderInfo(newPlaceholder);
  };

  // 处理图片生成完成 - 直接在占位符位置渲染图片
  const handleImageGenerated = async (imageUrl: string) => {
    if (placeholderInfo && board) {
      const { x, y, width, height } = placeholderInfo;
      
      try {
        // 清除选中状态
        clearSelectedElement(board);
        
        // 在相同位置插入新的图片元素
        const imageItem = {
          url: imageUrl,
          width: width,
          height: height,
        };
        
        DrawTransforms.insertImage(board, imageItem, [x, y]);
        
        // 获取刚插入的图片元素
        const newImageElement = board.children[board.children.length - 1];
        
        // 设置初始透明度为0，用于渐显动画
        if (newImageElement) {
          const newIndex = board.children.length - 1;
          Transforms.setNode(board, { opacity: 0 }, [newIndex]);
          
          // 渐显动画
          let opacity = 0;
          const fadeIn = () => {
            opacity += 0.1;
            if (opacity >= 1) {
              opacity = 1;
              Transforms.setNode(board, { opacity: 1 }, [newIndex]);
              
              // 渐显完成后，清理占位符状态
              setPlaceholderInfo(null);
              return;
            }
            Transforms.setNode(board, { opacity }, [newIndex]);
            requestAnimationFrame(fadeIn);
          };
          
          requestAnimationFrame(fadeIn);
        } else {
          setPlaceholderInfo(null);
        }
      } catch (e) {
        console.error('Failed to render image on placeholder:', e);
      }
    }
  };

  // 处理占位符拖动移动
  const handlePlaceholderMove = (x: number, y: number) => {
    if (placeholderInfo) {
      setPlaceholderInfo({
        ...placeholderInfo,
        x,
        y,
      });
    }
  };

  // 暴露 handleImageGenerated 给外部
  useEffect(() => {
    if (board) {
      (board as any).handleImageGenerated = handleImageGenerated;
    }
  }, [board, placeholderInfo, onImageGenerated]);

  return (
    <I18nProvider>
      <DrawnixContext.Provider value={{ appState, setAppState }}>
        <div
          className={classNames('drawnix', {
            'drawnix--mobile': appState.isMobile,
          })}
          ref={containerRef}
          style={{ position: 'relative', width: '100%', height: '100%' }}
        >
          <Wrapper
            value={value}
            viewport={viewport}
            theme={theme}
            options={options}
            plugins={plugins}
            onChange={(data: BoardChangeData) => {
              onChange && onChange(data);
            }}
            onSelectionChange={onSelectionChange}
            onViewportChange={onViewportChange}
            onThemeChange={onThemeChange}
            onValueChange={onValueChange}
          >
            <Board
              afterInit={(board) => {
                setBoard(board as DrawnixBoard);
                boardRef.current = board as DrawnixBoard;

                // Set up error handling for board events
                // This allows the board to function normally while catching errors
                const originalPointerMove = board.pointerMove.bind(board);
                const originalPointerUp = board.pointerUp.bind(board);
                const originalPointerDown = board.pointerDown.bind(board);
                
                board.pointerMove = (event: PointerEvent) => {
                  try {
                    originalPointerMove(event);
                  } catch (error) {
                    // Suppress errors from board pointerMove
                  }
                };
                
                board.pointerUp = (event: PointerEvent) => {
                  try {
                    originalPointerUp(event);
                  } catch (error) {
                    // Suppress errors from board pointerUp
                  }
                };
                
                board.pointerDown = (event: PointerEvent) => {
                  try {
                    originalPointerDown(event);
                  } catch (error) {
                    // Suppress errors from board pointerDown
                  }
                };

                if (canvasRef && containerRef.current) {
                  const canvas = containerRef.current.querySelector('canvas');
                  if (canvas) {
                    canvasRef(canvas as HTMLCanvasElement);
                  }
                }
                afterInit && afterInit(board);
              }}
            >
              <SelectionTracker onImageSelect={setSelectedImageUrls} isInputFocusedRef={isInputFocusedRef} />
              {placeholderInfo && board && (
                <PlaceholderOverlay
                  placeholder={placeholderInfo}
                  board={board}
                  onPlaceholderMove={handlePlaceholderMove}
                />
              )}
              {tutorial &&
                board &&
                PlaitBoard.isPointer(board, PlaitPointerType.selection) && (
                  <Tutorial />
                )}
            </Board>
            <AppToolbar headerLeft={headerLeft} headerRight={headerRight} onBack={onBack}></AppToolbar>
            <CreationToolbar></CreationToolbar>
            <ZoomToolbar></ZoomToolbar>
            <PopupToolbar></PopupToolbar>
            <LinkPopup></LinkPopup>
            <ClosePencilToolbar></ClosePencilToolbar>
            <TTDDialog container={containerRef.current}></TTDDialog>
            <CleanConfirm container={containerRef.current}></CleanConfirm>
            <BottomInputBar
              placeholder="今天你想创作什么"
              imageUrls={selectedImageUrls}
              onImagesClear={() => setSelectedImageUrls([])}
              onFocus={handleInputFocus}
              onInput={handleInputInput}
              onBlur={handleInputBlur}
              onSubmit={(value, images) => console.log('AI Submit:', { value, images })}
              onGenerateImage={onGenerateImage}
              onGenerateImageWithContext={handleGenerateImageWithContext}
              imageGenerateOptions={imageGenerateOptions}
              isGenerating={isGenerating}
            ></BottomInputBar>
          </Wrapper>
          <canvas className={`${LASER_POINTER_CLASS_NAME} mouse-course-hidden`}></canvas>
        </div>
      </DrawnixContext.Provider>
    </I18nProvider>
  );
};
