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
import { SelectionToolbar } from './components/toolbar/selection-toolbar/selection-toolbar';
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
  onPlaceholderConfirmInsert?: (placeholderId: string, taskId?: string) => void;
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
  progress?: number; // 进度百分比 0-100
  // 种子卡片新增字段
  model?: string; // 模型名称，如 "Nano Banana"
  aspect_ratio?: string; // 比例字符串，如 "16:9"
  image_size?: string; // 尺寸，如 "1K"
  referenceImages?: string[]; // 参考图片
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
  onConfirmInsert?: (placeholderId: string, taskId?: string) => void;
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
  onConfirmInsert,
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
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      >
        {/* 任务进度卡 - 统一布局 */}
        <div
          className={`task-progress-card ${isSelected ? 'task-progress-card--selected' : ''} ${isError ? 'task-progress-card--error' : ''}`}
          style={{
            pointerEvents: 'auto',
            cursor: 'grab',
            transform: `scale(${screenPosition.zoom})`,
            transformOrigin: '0 0',
          }}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
        >
          {/* 第一行：图标容器 + 标题 + 状态徽章 + 删除按钮 */}
          <div className="task-progress-card__header">
            <div className="task-progress-card__title">
              <div className={`task-progress-card__icon-wrapper task-progress-card__icon-wrapper--${status}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <span>图片生成</span>
            </div>
            <div className="task-progress-card__header-right">
              <div className={`task-progress-card__status task-progress-card__status--${status}`}>
                {status === 'submitting' && '提交中'}
                {status === 'generating' && '执行中'}
                {status === 'completed' && '已完成'}
                {status === 'failed' && '失败'}
                {status === 'pending' && '等待中'}
              </div>
              <button
                className="task-progress-card__delete"
                onClick={handleDeleteClick}
                title="删除"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>

          {/* 执行中/提交中 - 进度文字 + 进度条 */}
          {(status === 'generating' || status === 'submitting') && (
            <div className="task-progress-card__progress-section">
              <div className="task-progress-card__progress-meta">
                <span>{status === 'submitting' ? '步骤 1/1：提交任务...' : '步骤 1/1：正在生成...'}</span>
                {timeElapsed && <span>{timeElapsed}</span>}
              </div>
              <div className="task-progress-card__progress-track">
                <div
                  className="task-progress-card__progress-fill"
                  style={{ width: `${placeholder.progress && placeholder.progress > 0 ? placeholder.progress : 30}%` }}
                />
              </div>
            </div>
          )}

          {/* 等待中 */}
          {status === 'pending' && (
            <div className="task-progress-card__progress-section">
              <div className="task-progress-card__progress-meta">
                <span>等待提交...</span>
              </div>
              <div className="task-progress-card__progress-track">
                <div className="task-progress-card__progress-fill" style={{ width: '5%' }} />
              </div>
            </div>
          )}

          {/* 失败 - 红色错误框 + 全宽重试按钮 */}
          {status === 'failed' && (
            <>
              <div className="task-progress-card__error-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="task-progress-card__error-icon">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div>
                  <div className="task-progress-card__error-title">生成失败</div>
                  {placeholder.errorMessage && (
                    <div className="task-progress-card__error-msg">{placeholder.errorMessage}</div>
                  )}
                </div>
              </div>
              <button
                className="task-progress-card__btn task-progress-card__btn--retry-full"
                onClick={handleRetryClick}
                title="重新生成"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                重新尝试
              </button>
            </>
          )}

          {/* 已完成 - 缩略图 + 耗时/尺寸 + 图标按钮 */}
          {status === 'completed' && (
            <div className="task-progress-card__completed-row">
              <div className="task-progress-card__thumb">
                {placeholder.imageUrl
                  ? <img src={placeholder.imageUrl} alt="预览" />
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                }
              </div>
              <div className="task-progress-card__completed-meta">
                {timeElapsed && <span>耗时 {timeElapsed}</span>}
                <span>{placeholder.image_size || placeholder.aspectRatio || ''}</span>
              </div>
              <div className="task-progress-card__icon-btns">
                <button
                  className="task-progress-card__icon-btn"
                  onClick={handleRetryClick}
                  title="重新生成"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                </button>
                <button
                  className="task-progress-card__icon-btn task-progress-card__icon-btn--primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onConfirmInsert) {
                      onConfirmInsert(placeholder.id, placeholder.taskId);
                    }
                  }}
                  title="插入画布"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </button>
              </div>
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
  onPlaceholderConfirmInsert,
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

  // 处理选区变化 - 用于图片点击回填功能
  const handleSelectionChange = (selection: any) => {
    if (!board) return;

    const selectedElements = board.getSelectedElements();
    if (selectedElements.length === 1) {
      const selectedElement = selectedElements[0];
      // 检查是否是图片元素
      if (selectedElement.type === 'image') {
        // 获取图片索引
        const imageIndex = board.children.findIndex((el: any) => el.id === selectedElement.id);
        if (imageIndex !== -1) {
          // 从元数据映射中获取保存的参数
          const metadataMap = (board as any).__imageMetadataMap || {};
          const metadata = metadataMap[imageIndex];
          if (metadata && onFillInput) {
            console.log('[Drawnix] Image clicked, filling input:', metadata);
            onFillInput({
              prompt: metadata.prompt || '',
              images: metadata.referenceImages || [],
              model: metadata.model || 'nano-banana-pro',
              aspectRatio: metadata.aspect_ratio || '1:1',
              imageSize: metadata.image_size || '1K',
            });
          }
        }
      }
    }
  };

  // 发射开始 - 创建飞向画布的光点动画
  const handleSendStart = () => {
    // 创建一个从底部输入框飞向画布中心的光点
    const sendButton = document.querySelector('.bottom-input-bar .bottom-input-bar__action-btn') as HTMLElement;
    const canvasContainer = document.querySelector('.plait-board-viewport') as HTMLElement;
    
    if (!sendButton || !canvasContainer) {
      console.log('[SeedCard] Cannot find send button or canvas');
      return;
    }

    // 获取发送按钮的位置
    const buttonRect = sendButton.getBoundingClientRect();
    const buttonCenterX = buttonRect.left + buttonRect.width / 2;
    const buttonCenterY = buttonRect.top + buttonRect.height / 2;

    // 获取画布中心位置
    const canvasRect = canvasContainer.getBoundingClientRect();
    const canvasCenterX = canvasRect.left + canvasRect.width / 2;
    const canvasCenterY = canvasRect.top + canvasRect.height / 2;

    // 创建光点元素
    const lightOrb = document.createElement('div');
    lightOrb.className = 'seed-card-launch-orb';
    lightOrb.style.cssText = `
      position: fixed;
      left: ${buttonCenterX}px;
      top: ${buttonCenterY}px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: radial-gradient(circle, #3b82f6 0%, #60a5fa 50%, rgba(96, 165, 250, 0) 70%);
      box-shadow: 0 0 20px rgba(59, 130, 246, 0.8), 0 0 40px rgba(59, 130, 246, 0.4);
      pointer-events: none;
      z-index: 10000;
      transform: translate(-50%, -50%);
      transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    document.body.appendChild(lightOrb);

    // 强制重绘后启动动画
    requestAnimationFrame(() => {
      lightOrb.style.left = `${canvasCenterX}px`;
      lightOrb.style.top = `${canvasCenterY}px`;
      lightOrb.style.opacity = '0';
      lightOrb.style.transform = 'translate(-50%, -50%) scale(3)';
    });

    // 动画结束后移除元素
    setTimeout(() => {
      if (lightOrb.parentNode) {
        lightOrb.parentNode.removeChild(lightOrb);
      }
    }, 500);

    console.log('[SeedCard] Launch animation triggered from', { buttonCenterX, buttonCenterY }, 'to', { canvasCenterX, canvasCenterY });
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
    // 使用固定的任务卡片尺寸（不再根据 imageSize 变化）
    // 卡片尺寸约 180x130，与截图中的 UI 一致
    const CARD_WIDTH = 180;
    const CARD_HEIGHT = 130;
    width = CARD_WIDTH;
    height = CARD_HEIGHT;
    // 保存用户选择的宽高比，用于最终图片生成
    const aspectRatio = options.aspect_ratio || '1:1';

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
      // 种子卡片：保存完整的生成参数
      model: options.model,
      aspect_ratio: options.aspect_ratio,
      image_size: options.image_size,
      referenceImages: images,
    };

    console.log('[Placeholder] Setting placeholder info:', newPlaceholder);
    setPlaceholderInfo(newPlaceholder);
    console.log('[Placeholder] placeholderInfo set successfully');
  };

  // 处理图片生成完成 - 直接在占位符位置渲染图片
  // 返回插入的图片索引，用于后续更新
  // fallbackBounds: 当没有占位符时使用的尺寸和位置信息
  const handleImageGenerated = async (
    imageUrl: string,
    placeholderId?: string,
    taskId?: string,
    fallbackBounds?: { x?: number; y?: number; width: number; height: number; prompt?: string; model?: string; aspect_ratio?: string; image_size?: string; referenceImages?: string[] }
  ): Promise<number | null> => {
    console.log('[Drawnix] handleImageGenerated called:', { imageUrl: imageUrl.substring(0, 50), placeholderId, taskId, fallbackBounds });

    // 如果传入了 placeholderId，查找对应的占位符信息
    let targetPlaceholder = placeholderInfo;
    if (placeholderId && placeholderInfo && placeholderInfo.id !== placeholderId) {
      // 如果 ID 不匹配，可能需要从其他地方获取（暂时使用当前的 placeholderInfo）
      console.log('[Drawnix] placeholderId mismatch, using current placeholderInfo');
    }

    // 确定使用的尺寸和位置
    let x: number, y: number, width: number, height: number;
    let imageMetadata: any = {};

    if (targetPlaceholder && board) {
      // 使用占位符的位置和尺寸
      x = targetPlaceholder.x;
      y = targetPlaceholder.y;
      width = targetPlaceholder.width;
      height = targetPlaceholder.height;
      imageMetadata = {
        prompt: targetPlaceholder.prompt,
        model: targetPlaceholder.model,
        aspect_ratio: targetPlaceholder.aspect_ratio,
        image_size: targetPlaceholder.image_size,
        referenceImages: targetPlaceholder.referenceImages,
      };
    } else if (fallbackBounds && board) {
      // 使用 fallbackBounds 的尺寸，位置用视口中心或 fallbackBounds 提供的坐标
      width = fallbackBounds.width;
      height = fallbackBounds.height;

      if (fallbackBounds.x !== undefined && fallbackBounds.y !== undefined) {
        x = fallbackBounds.x;
        y = fallbackBounds.y;
      } else {
        // 使用视口中心作为默认位置
        const viewport = board.viewport;
        const zoom = viewport.zoom || 1;
        const container = document.querySelector('.drawnix-board');
        const viewportWidth = container ? container.clientWidth : 800;
        const viewportHeight = container ? container.clientHeight : 600;
        const origX = viewport.origination?.[0] || 0;
        const origY = viewport.origination?.[1] || 0;
        x = origX + (viewportWidth / 2) / zoom - width / 2;
        y = origY + (viewportHeight / 2) / zoom - height / 2;
      }

      // 使用 fallbackBounds 提供的元数据
      imageMetadata = {
        prompt: fallbackBounds.prompt,
        model: fallbackBounds.model,
        aspect_ratio: fallbackBounds.aspect_ratio,
        image_size: fallbackBounds.image_size,
        referenceImages: fallbackBounds.referenceImages,
      };

      console.log('[Drawnix] Using fallbackBounds for image insertion:', { x, y, width, height });
    } else {
      // 没有占位符也没有 fallbackBounds，无法插入图片
      console.warn('[Drawnix] handleImageGenerated: no placeholderInfo or fallbackBounds, cannot insert image');
      return null;
    }

    if (board) {
      
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

          // 保存种子卡片的元数据到图片元素，供后续点击回填使用
          if (Object.keys(imageMetadata).length > 0) {
            // 将元数据保存到 board 的一个映射中
            const existingMetadata = (board as any).__imageMetadataMap || {};
            existingMetadata[newIndex] = imageMetadata;
            (board as any).__imageMetadataMap = existingMetadata;
            console.log('[Drawnix] saved image metadata:', imageMetadata);
          }

          // 种子卡片：增强的落位动画 - 从模糊到清晰 + 缩放
          // 初始状态：缩放 0.8，透明度 0
          Transforms.setNode(board, { opacity: 0 }, [newIndex]);

          // 渐显 + 缩放动画
          let opacity = 0;
          let scale = 0.8;
          const reveal = () => {
            opacity += 0.05;
            scale += 0.02;
            if (opacity >= 1) {
              opacity = 1;
              scale = 1;
              Transforms.setNode(board, { opacity: 1 }, [newIndex]);

              // 渐显完成后，清理占位符状态
              setPlaceholderInfo(null);
              return;
            }
            // 应用缩放效果需要使用其他方法，这里只控制透明度
            Transforms.setNode(board, { opacity }, [newIndex]);
            requestAnimationFrame(reveal);
          };

          requestAnimationFrame(reveal);

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
  const updatePlaceholderStatus = (status: 'pending' | 'generating' | 'completed' | 'failed', errorMessage?: string, imageUrl?: string, taskId?: string) => {
    if (placeholderInfo) {
      setPlaceholderInfo({
        ...placeholderInfo,
        status,
        errorMessage,
        imageUrl,
        taskId,
      });
    }
  };

  // 更新占位符进度（供外部调用）- 种子卡片专用
  const updatePlaceholderProgress = (progress: number) => {
    if (placeholderInfo) {
      setPlaceholderInfo({
        ...placeholderInfo,
        progress,
        status: 'generating',
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

  // 聚焦到指定位置的占位符/种子卡片
  const focusOnPlaceholder = (x: number, y: number, width: number, height: number) => {
    if (!board) return;

    // 计算目标视口中心
    const zoom = board.viewport.zoom || 1;
    const targetX = x + width / 2;
    const targetY = y + height / 2;

    // 设置新的视口中心，使用平滑过渡
    board.setViewport({
      zoom,
      origination: [targetX, targetY],
    });

    console.log('[Drawnix] Focus on placeholder:', { x, y, width, height, targetX, targetY });
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
      (board as any).updatePlaceholderProgress = updatePlaceholderProgress;
      (board as any).clearPlaceholder = clearPlaceholder;
      (board as any).setInputValue = setInputValue;
      (board as any).setInputImages = setInputImages;
      (board as any).updateImageByTaskId = updateImageByTaskId;
      (board as any).focusOnPlaceholder = focusOnPlaceholder;
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
            onSelectionChange={handleSelectionChange}
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
                  onConfirmInsert={(id, taskId) => {
                    onPlaceholderConfirmInsert?.(id, taskId);
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
              onSendStart={handleSendStart}
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
