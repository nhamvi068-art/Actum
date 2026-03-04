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
import { withDraw, PlaitDrawElement, DrawTransforms } from '@plait/draw';
import { MindThemeColors, withMind } from '@plait/mind';
import MobileDetect from 'mobile-detect';
import { withMindExtend } from './plugins/with-mind-extend';
import { clearCircularGroupReferences } from './plugins/with-common';

// 创建一个空的 withGroup 插件来完全禁用 group 功能
// 这样可以彻底解决智能拆图后删除图片的栈溢出问题
const withGroup = (board: PlaitBoard): PlaitBoard => {
  // 禁用 group 功能，什么都不做
  return board;
};

// 创建安全的 getGroupByElement 函数
const createSafeGetGroupByElement = (originalFn: Function) => {
  return function(board: PlaitBoard, element: any, recursion?: boolean, originElements?: any[]) {
    // 安全检查：如果没有元素或没有 groupId，直接返回
    if (!element || !element.groupId) {
      return recursion ? [] : null;
    }
    
    // 使用 Set 来跟踪已访问的元素，防止循环引用
    const visited = new Set<string>();
    
    const findGroup = (el: any, recurse: boolean, originEls?: any[]): any => {
      if (!el || !el.groupId) {
        return recurse ? [] : null;
      }
      
      // 检测循环：如果已经访问过这个元素，停止递归
      if (visited.has(el.id)) {
        console.warn('检测到循环引用，停止递归:', el.id);
        return recurse ? [] : null;
      }
      
      visited.add(el.id);
      
      const elements = originEls || board.children;
      const group = elements.find((item: any) => item.id === el.groupId);
      
      if (!group) {
        return recurse ? [] : null;
      }
      
      if (recurse) {
        const groups = [group];
        const grandGroups = findGroup(group, recurse, originEls);
        if (grandGroups && Array.isArray(grandGroups) && grandGroups.length) {
          groups.push(...grandGroups);
        }
        return groups;
      } else {
        return group;
      }
    };
    
    return findGroup(element, recursion || false, originElements);
  };
};

// 创建一个插件，在 withGroup 之前清除所有 groupId
// 这样可以防止循环引用导致的栈溢出问题
const withClearGroupIds = (board: PlaitBoard): PlaitBoard => {
  // 清除所有元素的 groupId 和相关属性
  for (const element of board.children) {
    if ('groupId' in element) {
      (element as any).groupId = undefined;
    }
    // 清除 groupIds 数组（如果有）
    if ('groupIds' in element) {
      (element as any).groupIds = undefined;
    }
  }
  
  // 同时清除 board 上可能缓存的 group 信息
  // 这样可以确保不会有任何残留的 group 引用
  if ((board as any).groups) {
    (board as any).groups = undefined;
  }
  if ((board as any).groupCache) {
    (board as any).groupCache = undefined;
  }
  
  return board;
};

import { withCommonPlugin } from './plugins/with-common';
import { CreationToolbar } from './components/toolbar/creation-toolbar';
import { ZoomToolbar } from './components/toolbar/zoom-toolbar';
import { PopupToolbar } from './components/toolbar/popup-toolbar/popup-toolbar';
import { SelectionToolbar } from './components/toolbar/selection-toolbar/selection-toolbar';
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
  showMenuButton?: boolean;
  // 图片生成相关
  onGenerateImage?: (prompt: string, images: string[], options: ImageGenerateOptions) => void;
  onImageGenerated?: (imageUrl: string, placeholderId: string) => void;
  imageGenerateOptions?: ImageGenerateOptions;
  isGenerating?: boolean;
  // 任务恢复相关
  initialPlaceholder?: PlaceholderInfo;
  onPlaceholderUpdate?: (placeholderInfo: PlaceholderInfo) => void;
  onPlaceholderStatusChange?: (placeholderId: string, status: 'pending' | 'submitting' | 'generating' | 'completed' | 'failed', errorMessage?: string) => void;
  // 占位符选中相关
  onPlaceholderSelect?: (placeholderId: string) => void;
  onPlaceholderDelete?: (placeholderId: string) => void;
  onPlaceholderRetry?: (placeholderId: string) => void;
  selectedPlaceholderId?: string | null;
  // 任务列表相关
  projectId?: string;
  tasks?: any[];
  onTaskRetry?: (task: any) => void;
  onTaskRedo?: (task: any) => void;
  onTaskClick?: (task: any) => void;
  // 输入栏填充相关（用于重做功能）
  fillInputData?: {
    prompt: string;
    images: string[];
    model: string;
    aspectRatio: string;
    imageSize?: string;
  };
  onFillInput?: (data: { prompt: string; images: string[]; model: string; aspectRatio: string; imageSize?: string }) => void;
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
  // 新增：状态和提示信息
  status?: 'pending' | 'submitting' | 'generating' | 'completed' | 'failed';
  prompt?: string; // 用户输入的 prompt
  errorMessage?: string; // 错误信息
  taskId?: string; // 关联的任务 ID
  startTime?: number; // 生成开始时间
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

// PlaceholderOverlay 组件的 props 类型
interface PlaceholderOverlayProps {
  placeholder: PlaceholderInfo;
  board: DrawnixBoard;
  viewportZoom: number;
  viewportOrigX: number;
  viewportOrigY: number;
  onPlaceholderMove?: (x: number, y: number) => void;
  isSelected?: boolean;
  onSelect?: (placeholderId: string) => void;
  onDelete?: (placeholderId: string) => void;
  onRetry?: (placeholderId: string) => void;
}

// 加载动画覆盖层组件 - 优化版本，使用独立的视口属性避免不必要的重渲染
const PlaceholderOverlayInner: React.FC<PlaceholderOverlayProps> = ({
  placeholder,
  board,
  viewportZoom,
  viewportOrigX,
  viewportOrigY,
  onPlaceholderMove,
  isSelected = false,
  onSelect,
  onDelete,
  onRetry,
}) => {
  const elementX = placeholder.x;
  const elementY = placeholder.y;
  const elementWidth = placeholder.width;
  const elementHeight = placeholder.height;

  // 使用 useMemo 缓存视口计算结果，只依赖具体的数值而不是整个对象
  const screenPosition = React.useMemo(() => {
    const zoom = viewportZoom || 1;

    return {
      left: (elementX - viewportOrigX) * zoom,
      top: (elementY - viewportOrigY) * zoom,
      width: elementWidth * zoom,
      height: elementHeight * zoom,
      zoom,
    };
  }, [viewportZoom, viewportOrigX, viewportOrigY, elementX, elementY, elementWidth, elementHeight]);
  
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
      const zoom = screenPosition.zoom;
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
  
  // 截断 prompt 显示
  const truncatePrompt = (prompt?: string, maxLength: number = 50): string => {
    if (!prompt) return '';
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  };

  // 状态显示
  const status = placeholder.status || 'generating';
  const isError = status === 'failed';
  const isSubmitting = status === 'submitting';

  // 生成时间显示（纯秒数格式，如 1200s）
  const [timeElapsed, setTimeElapsed] = useState<string>('');

  // 点击占位符选中
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(placeholder.id);
    }
  };

  // 处理删除按钮点击
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(placeholder.id);
    }
  };

  // 处理重试按钮点击
  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRetry) {
      onRetry(placeholder.id);
    }
  };

  useEffect(() => {
    if ((status === 'generating' || status === 'submitting') && placeholder.startTime) {
      const updateTime = () => {
        const now = Date.now();
        const diff = Math.floor((now - placeholder.startTime!) / 1000);
        setTimeElapsed(`${diff}s`);
      };

      updateTime(); // Initial update
      const interval = setInterval(updateTime, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeElapsed('');
    }
  }, [status, placeholder.startTime]);

  return (
    <>
      <div
        className={`image-placeholder ${isError ? 'placeholder-error' : ''} ${isSelected ? 'placeholder-selected' : ''}`}
        style={{
          position: 'absolute',
          left: screenPosition.left,
          top: screenPosition.top,
          width: screenPosition.width,
          height: screenPosition.height,
          overflow: 'hidden',
          pointerEvents: 'auto',
          cursor: 'grab',
          background: isError ? '#fef2f2' : '#e5e7eb',
          userSelect: 'none',
          border: isSelected ? '2px solid #1890ff' : (isError ? '1px solid #fecaca' : '1px solid #e5e7eb'),
          boxShadow: isSelected ? '0 0 0 2px rgba(24, 144, 255, 0.3)' : 'none',
          zIndex: 9999,
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        {/* Simple Gradient Background */}
        <div className="placeholder-gradient" />

        {/* Multi-color Fluid Aura Animation for Generating Status */}
        {(status === 'generating' || status === 'submitting' || status === 'pending') && (
          <div className="placeholder-blob-container">
            <div className="color-blob color-blob-1"></div>
            <div className="color-blob color-blob-2"></div>
            <div className="color-blob color-blob-3"></div>
            <div className="water-drop"></div>
          </div>
        )}

        {/* 状态显示层 - 仅报错时显示 */}
        <div className={`Placeholder-status ${status === 'failed' ? 'is-error' : ''}`}>
          {/* 提交中状态 */}
          {status === 'submitting' && (
            <div
              className="placeholder-submitting"
              style={{
                transform: `scale(${screenPosition.zoom})`,
                transformOrigin: 'bottom right'
              }}
            >
              <div className="submitting-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <span>提交中...</span>
            </div>
          )}

          {/* 生成中状态 */}
          {status === 'generating' && (
            <div
              className="placeholder-generating"
              style={{
                transform: `scale(${screenPosition.zoom})`,
                transformOrigin: 'bottom right'
              }}
            >
              <div className="breathing-dot"></div>
              {timeElapsed && <div className="placeholder-time">{timeElapsed}</div>}
            </div>
          )}

          {/* 失败状态 */}
          {status === 'failed' && (
            <div className="placeholder-failed">
              <div className="placeholder-error-icon">!</div>
              <div className="placeholder-error-message">
                {placeholder.errorMessage || '生成失败'}
              </div>
              {/* 操作按钮：选中失败占位符时显示 */}
              {isSelected && (
                <div className="placeholder-failed-actions">
                  <button
                    className="placeholder-action-btn placeholder-action-btn--retry"
                    onClick={handleRetryClick}
                    title="重新生成"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    重试
                  </button>
                  <button
                    className="placeholder-action-btn placeholder-action-btn--delete"
                    onClick={handleDeleteClick}
                    title="删除"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    删除
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 等待提交状态 */}
          {status === 'pending' && (
            <div className="placeholder-pending">
              <span>等待提交</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// 使用 React.memo 包装组件，避免不必要的重渲染
const PlaceholderOverlay = React.memo(PlaceholderOverlayInner);

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
  showMenuButton,
  onGenerateImage,
  onImageGenerated,
  imageGenerateOptions,
  isGenerating,
  initialPlaceholder,
  onPlaceholderUpdate,
  onPlaceholderStatusChange,
  onPlaceholderSelect,
  onPlaceholderDelete,
  onPlaceholderRetry,
  projectId,
  tasks,
  onTaskRetry,
  onTaskRedo,
  onTaskClick,
  fillInputData,
  onFillInput,
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
  const [selectedPlaceholderId, setSelectedPlaceholderId] = useState<string | null>(null);
  // 记录上次占位符放置的位置（用于下次放置的参考）
  const lastPlaceholderPositionRef = useRef<{ x: number; y: number } | null>(null);
  const isInputFocusedRef = useRef(false);

  // 使用 useMemo 缓存视口属性，避免不必要的重渲染
  const viewportProps = React.useMemo(() => {
    if (!board) return { zoom: 1, origX: 0, origY: 0 };
    return {
      zoom: board.viewport.zoom || 1,
      origX: board.viewport.origination?.[0] || 0,
      origY: board.viewport.origination?.[1] || 0,
    };
  }, [board?.viewport.zoom, board?.viewport.origination]);

  // 恢复初始占位符（用于页面刷新后恢复任务）
  useEffect(() => {
    if (initialPlaceholder && !placeholderInfo) {
      console.log('[Drawnix] Restoring placeholder from initialPlaceholder:', initialPlaceholder);
      setPlaceholderInfo(initialPlaceholder);
    }
  }, [initialPlaceholder]);

  // 当占位符更新时，通知父组件
  useEffect(() => {
    if (placeholderInfo && onPlaceholderUpdate) {
      onPlaceholderUpdate(placeholderInfo);
    }
  }, [placeholderInfo, onPlaceholderUpdate]);

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
    withClearGroupIds,
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
    console.log('[Placeholder] handleGenerateImageWithContext called', { value, images, options, board: !!board });

    if (!board) {
      console.log('[Placeholder] No board, returning');
      return;
    }

    console.log('[Placeholder] Board exists, proceeding...');

    let width: number;
    let height: number;
    // 始终使用用户选择的目标比例，而不是输入图片的比例
    const aspectRatio = options.aspect_ratio || '1:1';
    // 获取用户选择的尺寸 (1K/2K/4K)
    const imageSize = options.image_size || '1K';
    
    // 根据尺寸确定固定边长 (使用宽度作为基准)
    // 1K: 宽度 200, 2K: 宽度 400, 4K: 宽度 800
    const sizeBaseWidth: Record<string, number> = {
      '1K': 200,
      '2K': 400,
      '4K': 800,
    };
    const baseWidth = sizeBaseWidth[imageSize] || 200;
    
    // 根据用户选择的目标比例计算高度
    const [ratioW, ratioH] = aspectRatio.split(':').map(Number);
    const ratio = ratioW / ratioH;
    
    if (ratio >= 1) {
      // 横向比例或方形：宽度固定，高度按比例计算
      width = baseWidth;
      height = baseWidth / ratio;
    } else {
      // 竖向比例：高度固定，宽度按比例计算
      height = baseWidth;
      width = baseWidth * ratio;
    }
    
    // 如果有输入图片，记录下来用于生成时参考（但不改变占位符尺寸）
    
    // 简化：直接使用视口中心作为位置
    // 视口左上角在画布上的位置就是 viewport.origination
    const viewport = board.viewport;
    const zoom = viewport.zoom || 1;

    // 使用 board 的容器尺寸
    const container = document.querySelector('.drawnix-board');
    const viewportWidth = container ? container.clientWidth : 800;
    const viewportHeight = container ? container.clientHeight : 600;

    // 视口左上角坐标（画布坐标）
    const origX = viewport.origination?.[0] || 0;
    const origY = viewport.origination?.[1] || 0;

    // 视口中心在屏幕像素坐标中
    const screenCenterX = viewportWidth / 2;
    const screenCenterY = viewportHeight / 2;

    // 转换为画布坐标（需要加上 origX/origY 并除以 zoom）
    // 注意：Plait 的 viewport 坐标转换逻辑可能不同，这里使用更直接的方式
    const centerX = origX + screenCenterX / zoom;
    const centerY = origY + screenCenterY / zoom;

    // 视口边界（画布坐标）
    const viewportLeft = origX;
    const viewportTop = origY;
    const viewportRight = origX + (viewportWidth / zoom);
    const viewportBottom = origY + (viewportHeight / zoom);

    console.log('[Placeholder] Viewport:', { origX, origY, zoom, viewportWidth, viewportHeight, centerX, centerY, viewportLeft, viewportTop, viewportRight, viewportBottom });
    
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
    // 简化：直接使用视口中心（减去占位符尺寸的一半，使其居中）
    // 避免复杂的位置计算导致问题
    let finalX = centerX - width / 2;
    let finalY = centerY - height / 2;

    // 边距
    const margin = 20;

    // 确保在视口内（给一点边距）
    const minX = viewportLeft + margin;
    const maxX = viewportRight - width - margin;
    const minY = viewportTop + margin;
    const maxY = viewportBottom - height - margin;

    // 限制在视口范围内（确保 max >= min）
    finalX = Math.max(minX, Math.min(finalX, Math.max(minX, maxX)));
    finalY = Math.max(minY, Math.min(finalY, Math.max(minY, maxY)));

    // 如果视口太小，给一个默认值
    if (maxX < minX) {
      finalX = viewportLeft + margin;
    }
    if (maxY < minY) {
      finalY = viewportTop + margin;
    }

    console.log('[Placeholder] Final position:', finalX, finalY, { centerX, centerY, viewportLeft, viewportTop, viewportRight, viewportBottom });

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
      status: 'generating', // 初始状态为生成中
      prompt: value, // 保存用户输入的 prompt
      startTime: Date.now(), // 记录开始时间
    };

    console.log('[Placeholder] Setting placeholder info:', newPlaceholder);
    setPlaceholderInfo(newPlaceholder);
    console.log('[Placeholder] placeholderInfo set successfully');
  };

  // 处理图片生成完成 - 直接在占位符位置渲染图片
  // 返回插入的图片索引，用于后续更新
  const handleImageGenerated = async (imageUrl: string, placeholderId?: string, taskId?: string): Promise<number | null> => {
    console.log('[Drawnix] handleImageGenerated called:', { imageUrl: imageUrl.substring(0, 50), placeholderId, taskId });
    
    // 如果传入了 placeholderId，查找对应的占位符信息
    let targetPlaceholder = placeholderInfo;
    if (placeholderId && placeholderInfo && placeholderInfo.id !== placeholderId) {
      // 如果 ID 不匹配，可能需要从其他地方获取（暂时使用当前的 placeholderInfo）
      console.log('[Drawnix] placeholderId mismatch, using current placeholderInfo');
    }
    
    if (targetPlaceholder && board) {
      const { x, y, width, height } = targetPlaceholder;
      
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
          // 保存任务ID和图片索引的映射关系，供后续更新使用
          if (taskId) {
            setTimeout(() => {
              // 保存映射关系：taskId -> imageIndex
              const existingMap = (board as any).__taskImageIndexMap || {};
              existingMap[taskId] = newIndex;
              (board as any).__taskImageIndexMap = existingMap;
              console.log('[Drawnix] saved task-image mapping:', { taskId, imageIndex: newIndex });
            }, 100);
          }
          
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
          
          // 返回图片索引
          return newIndex;
        } else {
          setPlaceholderInfo(null);
        }
      } catch (e) {
        console.error('Failed to render image on placeholder:', e);
      }
    }
    return null;
  };
  
  // 根据任务ID更新图片（用于将临时URL替换为永久Base64）
  const updateImageByTaskId = async (taskId: string, newImageUrl: string): Promise<boolean> => {
    if (!board) return false;
    
    const imageIndexMap = (board as any).__taskImageIndexMap || {};
    const imageIndex = imageIndexMap[taskId];
    
    if (imageIndex === undefined) {
      console.warn('[Drawnix] updateImageByTaskId: no image found for taskId:', taskId);
      return false;
    }
    
    try {
      console.log('[Drawnix] updateImageByTaskId:', { taskId, imageIndex, newImageUrl: newImageUrl.substring(0, 50) });
      Transforms.setNode(board, { url: newImageUrl }, [imageIndex]);
      return true;
    } catch (e) {
      console.error('[Drawnix] updateImageByTaskId failed:', e);
      return false;
    }
  };

  // 处理占位符拖动移动
  const handlePlaceholderMove = (x: number, y: number) => {
    if (placeholderInfo) {
      console.log('[Placeholder] move', {
        id: placeholderInfo.id,
        from: { x: placeholderInfo.x, y: placeholderInfo.y },
        to: { x, y },
        status: placeholderInfo.status,
      });
      setPlaceholderInfo({
        ...placeholderInfo,
        x,
        y,
      });
    }
  };

  // 更新占位符状态（供外部调用）
  const updatePlaceholderStatus = (status: 'pending' | 'generating' | 'completed' | 'failed', errorMessage?: string) => {
    if (placeholderInfo) {
      setPlaceholderInfo({
        ...placeholderInfo,
        status,
        errorMessage,
      });
    }
  };

  // 清理占位符（供外部调用）
  const clearPlaceholder = () => {
    setPlaceholderInfo(null);
    setSelectedPlaceholderId(null);
  };

  // 暴露 handleImageGenerated、updatePlaceholderStatus、clearPlaceholder 和 setInputValue 给外部
  const setInputValue = (value: string) => {
    // 找到 BottomInputBar 组件并触发更新
    const input = document.querySelector('.bottom-input-bar textarea') as HTMLTextAreaElement;
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  const setInputImages = (images: string[]) => {
    setSelectedImageUrls(images);
  };

  // 监听 Board 点击事件，清除占位符选中状态
  useEffect(() => {
    if (!board) return;

    const handleBoardClick = (e: MouseEvent) => {
      // 点击画布空白处，清除占位符选中状态
      if (selectedPlaceholderId) {
        setSelectedPlaceholderId(null);
      }
    };

    // 使用 setTimeout 确保 board 完全初始化后再添加监听器
    const timer = setTimeout(() => {
      const host = (board as any).host;
      if (host) {
        host.addEventListener('click', handleBoardClick);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      const host = (board as any).host;
      if (host) {
        host.removeEventListener('click', handleBoardClick);
      }
    };
  }, [board, selectedPlaceholderId]);

  useEffect(() => {
    if (board) {
      (board as any).handleImageGenerated = handleImageGenerated;
      (board as any).updatePlaceholderStatus = updatePlaceholderStatus;
      (board as any).clearPlaceholder = clearPlaceholder;
      (board as any).setInputValue = setInputValue;
      (board as any).setInputImages = setInputImages;
      (board as any).updateImageByTaskId = updateImageByTaskId;
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
                  viewportZoom={viewportProps.zoom}
                  viewportOrigX={viewportProps.origX}
                  viewportOrigY={viewportProps.origY}
                  onPlaceholderMove={handlePlaceholderMove}
                  isSelected={selectedPlaceholderId === placeholderInfo.id}
                  onSelect={(id) => {
                    setSelectedPlaceholderId(id);
                    onPlaceholderSelect?.(id);
                  }}
                  onDelete={(id) => {
                    setSelectedPlaceholderId(null);
                    onPlaceholderDelete?.(id);
                  }}
                  onRetry={(id) => {
                    setSelectedPlaceholderId(null);
                    onPlaceholderRetry?.(id);
                  }}
                />
              )}
              {tutorial &&
                board &&
                PlaitBoard.isPointer(board, PlaitPointerType.selection) && (
                  <Tutorial />
                )}
            </Board>
            <AppToolbar
              headerLeft={headerLeft}
              headerRight={headerRight}
              onBack={onBack}
              showMenuButton={showMenuButton}
              tasks={tasks}
              onTaskClick={onTaskClick}
            ></AppToolbar>
            <CreationToolbar></CreationToolbar>
            <ZoomToolbar></ZoomToolbar>
            <PopupToolbar></PopupToolbar>
            <SelectionToolbar></SelectionToolbar>
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
              initialPrompt={fillInputData?.prompt}
              initialImages={fillInputData?.images}
              initialModel={fillInputData?.model}
              initialAspectRatio={fillInputData?.aspectRatio}
              initialImageSize={fillInputData?.imageSize}
            ></BottomInputBar>
          </Wrapper>
          <canvas className={`${LASER_POINTER_CLASS_NAME} mouse-course-hidden`}></canvas>
        </div>
      </DrawnixContext.Provider>
    </I18nProvider>
  );
};
