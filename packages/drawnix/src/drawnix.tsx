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
  RectangleClient,
  getSnapRectangles,
  drawPointSnapLines,
  clearSelectedElement,
  Transforms,
  updateViewportOrigination,
} from '@plait/core';
import React, { useState, useRef, useEffect, useImperativeHandle, useCallback } from 'react';
// 修复 TDesign 在 React 19 下命令式组件 (MessagePlugin 等) 的渲染报错
import 'tdesign-react/es/_util/react-19-adapter';
import { initPreventPinchZoom } from './utils/prevent-pinch-zoom';
import { withDraw, PlaitDrawElement, DrawTransforms } from '@plait/draw';
import { MindThemeColors, withMind } from '@plait/mind';
import MobileDetect from 'mobile-detect';
import { withMindExtend } from './plugins/with-mind-extend';
import { clearCircularGroupReferences } from './plugins/with-common';
import { updateFreehandSettings } from './plugins/freehand/freehand-settings';
import { PLACEHOLDER_DISPLAY_SIZES, DEFAULT_INSERTION_OFFSET } from './constants/size-constants';
import { calculateInsertionPoint, clampInsertionPointToViewport } from './utils/insertion-utils';
import { createTaskMemory, updateTaskMemory, updateTaskProgressMemory, updateTaskStatusMemory, completeTaskMemory, failTaskMemory, generateTaskIdMemory, getTaskByPlaceholderId } from './services/task-store';
import { getImageGenerationAdapter } from './services/image-generation-adapter';
import { startTaskPolling } from './services/task-polling';
import {
  initTaskSyncService,
  syncTaskComplete,
  syncTaskFailure,
  syncTaskProgress,
  syncTaskPlaceholder,
  cacheImageAsset,
} from './services/task-sync-service';
import { db } from './services/db/app-database';
import { assetStorageService } from './services/db/asset-storage-service';

// 模块级变量：存储 triggerSnapshot 引用，供外部（如 App.tsx header back button）调用
// 这样 header 的 <button onClick={handleBack}> 也能绕过 4 秒防抖立即触发快照
let requestSnapshotFn: (() => void | Promise<void>) | null = null;
// 模块级变量：UI 点击期间跳过选区检查
// 解决：点击 UI 控制元素时，board 先清空选区触发 checkSelection，
// 导致 onImageSelect([]) 被调用，选中图片丢失
let _skipSelectionCheck = false;
// 模块级变量：最近创建的占位符 ID，供 handleGenerateImage 复用其关联的内存任务
let _lastCreatedPlaceholderId: string | null = null;

export function requestSnapshotFromOutside(): void {
  if (requestSnapshotFn) {
    requestSnapshotFn();
  }
}

/** 从 Blob 测量图片真实尺寸（用于插入前纠正变形） */
async function measureImageDimensionsFromBlob(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(blob);
  });
}

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

// 【引擎层】画布选择保护插件
// 拦截 globalPointerUp 中的清空选中逻辑，防止操作 UI 期间视觉选中框消失
const withSelectionProtection = (
  _board: PlaitBoard,
  _isInputFocusedRef: React.MutableRefObject<boolean>
): PlaitBoard => {
  // This function is kept for API compatibility but logic is handled by the
  // inline board.globalPointerUp override below (after withSelectionProtection call).
  // No-op: actual protection is applied inline in drawnix.tsx render.
  return _board;
};

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
  PencilSettings,
  SidebarPanelType,
} from './hooks/use-drawnix';
import { DrawnixBoardContext } from './hooks/use-drawnix-board';
import { useAutoSnapshot } from './hooks/use-auto-snapshot';
import { unifiedCacheService } from './services/unified-cache-service';
import { insertStandardImage, insertImageElementWithAssetId } from './services/image-element-factory';
import { ClosePencilToolbar } from './components/toolbar/pencil-mode-toolbar';
import { PencilSettingsToolbar } from './components/toolbar/pencil-settings-toolbar/pencil-settings-toolbar';
import { EraserSettingsToolbar } from './components/toolbar/eraser-settings-toolbar/eraser-settings-toolbar';
import { TTDDialog } from './components/ttd-dialog/ttd-dialog';
import { CleanConfirm } from './components/clean-confirm/clean-confirm';
import { buildTextLinkPlugin } from './plugins/with-text-link';
import { I18nProvider } from './i18n';
import { Tutorial } from './components/tutorial';
import { LASER_POINTER_CLASS_NAME } from './utils/laser-pointer';
import {
  BottomInputBar,
  type ImageGenerateOptions,
  MODEL_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  SIZE_OPTIONS,
} from './components/bottom-input-bar/bottom-input-bar';
import {
  GlobalConsole,
  type Skill,
  SKILLS,
} from './components/global-console/global-console';

// Re-export for external use
export {
  BottomInputBar,
  GlobalConsole,
  type ImageGenerateOptions,
  type Skill,
  MODEL_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  SIZE_OPTIONS,
  SKILLS,
};

// 选中图片元数据类型
export interface SelectedImageMeta {
  id: string;
  assetId?: string;
  url?: string;
}

// Selection tracker component that lives inside Board - 事件驱动版本
// 【简化】React 层：盲目实时同步引擎真实状态，不再做焦点判断
const SelectionTracker: React.FC<{
  onImageSelect: (images: SelectedImageMeta[]) => void;
  isRestoringSelectionRef: React.MutableRefObject<boolean>;
  onSingleImageAspectRatioDetected?: (aspectRatio: string) => void;
}> = ({ onImageSelect, isRestoringSelectionRef, onSingleImageAspectRatioDetected }) => {
  const board = useBoard();
  const lastSelectionRef = useRef<string>('');
  const lastAspectRatioRef = useRef<string>('');
  // 维护选中顺序：Map<elementId, clickIndex>
  // 第一次点击的图片 index=0，第二次点击 index=1，以此类推
  const selectionOrderRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    console.log('[SelectionTracker] ✅ 组件已挂载到画布');

    // 检查是否需要更新选中图片
    const checkSelection = () => {
      // 如果模块级跳过标志被设置（UI 点击期间），跳过这次检查
      // 这样可以防止 board 清空选区时触发 onImageSelect([])
      if (_skipSelectionCheck) {
        console.log('[SelectionTracker] ⏭️ UI 点击期间，跳过此次检查');
        return;
      }

      // 如果正在恢复选区，跳过这次检查
      // 选区恢复会在 requestAnimationFrame 后完成，到时候会重新触发 checkSelection
      if (isRestoringSelectionRef.current) {
        console.log('[SelectionTracker] ⏭️ 正在恢复选区，跳过此次检查');
        return;
      }

      console.log('[SelectionTracker] 🔍 checkSelection 被调用');
      console.log('[SelectionTracker] 📊 跳过标志状态:', {
        _skipSelectionCheck,
        isRestoring: isRestoringSelectionRef.current
      });

      // Log raw board.selection state — board.selection may be undefined, not null
      const rawSel = board.selection as any;
      console.log('[SelectionTracker] 📦 board.selection:', rawSel
        ? (rawSel.all ? rawSel.all.map((e: any) => e.id).join(', ') : 'no-all-prop')
        : 'null/undefined'
      );

      const selectedElements = board.getSelectedElements();
      console.log('[SelectionTracker] 📋 选中的元素数量:', selectedElements.length);

      const selectedImages: SelectedImageMeta[] = [];

      for (const element of selectedElements) {
        console.log('[SelectionTracker] 🔎 检查元素:', {
          type: element?.type,
          id: element?.id,
          isImage: PlaitDrawElement.isImage(element),
        });

        if (PlaitDrawElement.isImage(element)) {
          const imgEl = element as any;
          console.log('[SelectionTracker] ✅ 找到图片元素:', {
            id: imgEl.id,
            assetId: imgEl.assetId,
            url: imgEl.url ? '存在' : '不存在',
            width: imgEl.width,
            height: imgEl.height,
          });
          selectedImages.push({
            id: imgEl.id,
            assetId: imgEl.assetId,
            url: imgEl.url,
          });
        }
      }

      console.log('[SelectionTracker] 📦 提取到的图片元数据:', selectedImages);

      // ── 自动检测单张图片的比例并更新 AI 输入框 ───────────────
      if (selectedImages.length === 1 && onSingleImageAspectRatioDetected) {
        const selectedElements = board.getSelectedElements();
        const imageElement = selectedElements.find(el => PlaitDrawElement.isImage(el));

        if (imageElement) {
          const imgEl = imageElement as any;
          const assetId = imgEl.assetId;
          const width = imgEl.width;
          const height = imgEl.height;

          console.log('[SelectionTracker] 🎯 单张图片检测:', { width, height, assetId, hasCallback: !!onSingleImageAspectRatioDetected });

          // 优先使用元素自带的尺寸
          if (width && height && width > 0 && height > 0) {
            const aspectRatio = calculateBestAspectRatio(width, height);
            console.log('[SelectionTracker] 使用元素尺寸计算比例:', { width, height, aspectRatio, lastRatio: lastAspectRatioRef.current });

            if (aspectRatio !== lastAspectRatioRef.current) {
              lastAspectRatioRef.current = aspectRatio;
              onSingleImageAspectRatioDetected(aspectRatio);
              console.log('[SelectionTracker] ✅ 已触发比例更新回调:', aspectRatio);
            }
            return; // 完成，无需继续
          }

          // 如果元素尺寸无效，尝试通过 assetId 异步获取
          if (assetId) {
            // 异步获取图片尺寸
            (async () => {
              try {
                const blob = await unifiedCacheService.getAssetBlob(assetId);
                if (blob) {
                  const img = new Image();
                  img.src = URL.createObjectURL(blob);
                  await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    setTimeout(reject, 3000); // 3秒超时
                  });
                  const actualWidth = img.naturalWidth || img.width;
                  const actualHeight = img.naturalHeight || img.height;
                  URL.revokeObjectURL(img.src);

                  console.log('[SelectionTracker] 通过 assetId 获取到图片尺寸:', { actualWidth, actualHeight });

                  if (actualWidth > 0 && actualHeight > 0) {
                    const aspectRatio = calculateBestAspectRatio(actualWidth, actualHeight);
                    console.log('[SelectionTracker] 计算比例:', { actualWidth, actualHeight, aspectRatio });

                    if (aspectRatio !== lastAspectRatioRef.current) {
                      lastAspectRatioRef.current = aspectRatio;
                      onSingleImageAspectRatioDetected(aspectRatio);
                      console.log('[SelectionTracker] ✅ 已触发比例更新回调:', aspectRatio);
                    }
                  }
                }
              } catch (error) {
                console.warn('[SelectionTracker] 获取图片尺寸失败:', error);
              }
            })();
          } else {
            console.log('[SelectionTracker] ⚠️ 无 assetId，无法获取图片尺寸');
          }
        }
      } else if (selectedImages.length === 0) {
        // 没有选中图片时，重置上次的比例记录
        lastAspectRatioRef.current = '';
      } else {
        console.log('[SelectionTracker] ℹ️ 多张或无图片，不触发比例检测:', { count: selectedImages.length });
      }

      // ── 选中顺序重排 ──────────────────────────────────────────
      const currentIds = selectedImages.map(i => i.id);

      // 没有图片选中时重置顺序追踪
      if (currentIds.length === 0) {
        selectionOrderRef.current = new Map();
      }

      const prevIds = Array.from(selectionOrderRef.current.keys());

      // 清掉已不在选中列表中的 ID
      for (const id of prevIds) {
        if (!currentIds.includes(id)) {
          selectionOrderRef.current.delete(id);
        }
      }

      // 新增的图片追加到顺序末尾
      for (const id of currentIds) {
        if (!selectionOrderRef.current.has(id)) {
          selectionOrderRef.current.set(id, selectionOrderRef.current.size);
        }
      }

      // 用 click 顺序重排 selectedImages
      const orderedImages = [...selectedImages].sort((a, b) => {
        const orderA = selectionOrderRef.current.get(a.id) ?? Infinity;
        const orderB = selectionOrderRef.current.get(b.id) ?? Infinity;
        return orderA - orderB;
      });
      // ─────────────────────────────────────────────────────────

      const currentSelectionKey = orderedImages.map(i => i.id).join(',') || '(空)';
      console.log('[SelectionTracker] 🔄 当前选中 Key:', currentSelectionKey);
      console.log('[SelectionTracker] 🔄 上次选中 Key:', lastSelectionRef.current || '(空)');

      if (currentSelectionKey !== lastSelectionRef.current) {
        console.log('[SelectionTracker] 选中项有变化，准备触发 onImageSelect');
        lastSelectionRef.current = currentSelectionKey;

        console.log('[SelectionTracker] 调用 onImageSelect:', orderedImages);
        onImageSelect(orderedImages);
      } else {
        console.log('[SelectionTracker] 选中项无变化，跳过');
      }
    };

    // 监听 pointerUp 事件（选区变化通常在释放鼠标时发生）
    const handlePointerUp = () => {
      console.log('[SelectionTracker] 🖱️ pointerUp 事件触发');
      // 延迟一点点，确保画布内部的选区状态已经更新完毕
      setTimeout(checkSelection, 50);
    };

    // 🚀 核心修改：直接绑定到 document，解决 host 不存在的问题
    document.addEventListener('pointerup', handlePointerUp);
    // 支持键盘操作（比如 Ctrl+A 全选）
    document.addEventListener('keyup', handlePointerUp);

    return () => {
      console.log('[SelectionTracker] 🧹 组件卸载，清理事件监听');
      // 🧹 记得在组件卸载时清理 document 上的事件
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('keyup', handlePointerUp);
      // @ts-ignore
      if (board.off) {
        // @ts-ignore
        board.off('selectionChange', checkSelection);
        // @ts-ignore
        board.off('change', checkSelection);
      }
    };
  }, [board, onImageSelect]);

  return null;
};

// 强制快照接口 —— 通过 ref 暴露给外部（如 App.tsx）
// 解决：handleBack 在防抖期间点击时，requestSnapshotFromOutside() 触发的 async snapshot 还没完成
// 就已经去读 getCachedThumbnail()，导致缓存 MISS。
// 使用 forwardRef + useImperativeHandle 后，handleBack 可以 await forceSnapshot()
// 确保快照写入缓存后，再去读缓存，彻底消除竞态。
export interface DrawnixRef {
  /**
   * 强制执行一次快照（绕过 4 秒防抖），等待完成后返回缩略图 Base64。
   * 用于 handleBack 等需要确保缓存已填充的场景。
   * @param fallbackProjectId - 可选：如果 prop 中的 projectId 为空，则使用此兜底 ID
   */
  forceSnapshot: (fallbackProjectId?: string, options?: { skipIfEmpty?: boolean }) => Promise<string | null>;
  /**
   * 清除当前占位符（任务卡片）。
   */
  clearPlaceholder: () => void;
  /**
   * 将生成的图片插入画布。
   */
  handleImageGenerated: (
    imageUrl: string,
    placeholderId?: string,
    taskId?: string,
    fallbackBounds?: { x?: number; y?: number; width: number; height: number; prompt?: string; model?: string; aspect_ratio?: string; image_size?: string; referenceImages?: string[] },
    assetId?: string
  ) => Promise<number | null>;
}

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
  onBeforeBack?: () => void | Promise<void>;
  showMenuButton?: boolean;
  // 图片生成相关
  onGenerateImage?: (prompt: string, images: string[], options: ImageGenerateOptions) => void;
  onImageGenerated?: (imageUrl: string, placeholderId: string) => void;
  imageGenerateOptions?: ImageGenerateOptions;
  isGenerating?: boolean;
  // 任务恢复相关
  initialPlaceholder?: PlaceholderInfo;
  onPlaceholderUpdate?: (placeholderInfo: PlaceholderInfo) => void;
  onPlaceholderStatusChange?: (placeholderId: string, status: 'pending' | 'submitting' | 'generating' | 'completed' | 'failed' | 'loading', errorMessage?: string) => void;
  // 占位符选中相关
  onPlaceholderSelect?: (placeholderId: string) => void;
  onPlaceholderDelete?: (placeholderId: string) => void;
  onPlaceholderRetry?: (placeholderId: string) => void;
  onPlaceholderConfirmInsert?: (placeholderId: string, taskId?: string) => void;
  selectedPlaceholderId?: string | null;
  // 任务列表相关
  projectId?: string;
  // 输入栏填充相关（用于重做功能）
  fillInputData?: {
    prompt: string;
    images: string[];
    model: string;
    aspectRatio: string;
    imageSize?: string;
  };
  onFillInput?: (data: { prompt: string; images: string[]; model: string; aspectRatio: string; imageSize?: string }) => void;
  /** 缩略图生成完成后的回调（用于通知首页实时更新缩略图） */
  onThumbnailGenerated?: (thumbnail: string, projectId: string) => void;
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
  status?: 'pending' | 'submitting' | 'generating' | 'completed' | 'failed' | 'loading';
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
  const selectedElements = board.getSelectedElements();
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

// 计算图片的最佳比例
// 根据图片的宽高比，找出最接近的预设比例
export const calculateBestAspectRatio = (width: number, height: number): string => {
  if (!width || !height || width <= 0 || height <= 0) {
    return '1:1';
  }

  const ratio = width / height;

  // 可用的比例选项（与 ASPECT_RATIO_OPTIONS 保持一致）
  const availableRatios: { value: string; ratio: number }[] = [
    { value: '1:1', ratio: 1.0 },
    { value: '2:3', ratio: 2/3 },
    { value: '3:4', ratio: 3/4 },
    { value: '4:5', ratio: 4/5 },
    { value: '9:16', ratio: 9/16 },
    { value: '3:2', ratio: 3/2 },
    { value: '4:3', ratio: 4/3 },
    { value: '5:4', ratio: 5/4 },
    { value: '16:9', ratio: 16/9 },
    { value: '21:9', ratio: 21/9 },
  ];

  // 找到最接近的比例
  let bestMatch = availableRatios[0];
  let minDiff = Math.abs(ratio - bestMatch.ratio);

  for (const option of availableRatios) {
    const diff = Math.abs(ratio - option.ratio);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = option;
    }
  }

  return bestMatch.value;
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
            const host = PlaitBoard.getHost(board);
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
  const status = placeholder.status || 'loading';
  const isError = status === 'failed';
  const isSubmitting = status === 'submitting';
  const isGenerating = status === 'generating';
  const isCompleted = status === 'completed';
  const isPending = status === 'pending';
  const isLoading = status === 'loading';

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

  // 确认插入按钮点击
  const handleConfirmClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onConfirmInsert) {
      onConfirmInsert(placeholder.id, placeholder.taskId);
    }
  };

  useEffect(() => {
    if ((status === 'generating' || status === 'submitting' || status === 'loading') && placeholder.startTime) {
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

  // 根据状态获取图标 SVG
  const getStatusIcon = () => {
    if (isGenerating || isSubmitting || isLoading) {
      // 加载中图标
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
      );
    }
    if (isCompleted) {
      // 完成图标
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      );
    }
    if (isError) {
      // 失败图标
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
      );
    }
    // 等待图标
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
    );
  };

  // 截断 prompt
  const truncatedPrompt = truncatePrompt(placeholder.prompt, 40);

  // 计算进度条宽度
  const progressWidth = placeholder.progress !== undefined ? `${placeholder.progress}%` : '40%';

  // 状态显示文案
  const getStatusLabel = () => {
    switch (status) {
      case 'loading': return '等待中';
      case 'submitting': return '提交中';
      case 'generating': return '生成中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      case 'pending': return '等待中';
      default: return '等待中';
    }
  };

  return (
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
        {/* 头部：标题 + 状态 + 删除 */}
        <div className="task-progress-card__header">
          <div className="task-progress-card__title">
            <div className={`task-progress-card__icon-wrapper task-progress-card__icon-wrapper--${status}`}>
              {getStatusIcon()}
            </div>
            <span>图片生成</span>
          </div>
          <div className="task-progress-card__header-right">
            <span className={`task-progress-card__status task-progress-card__status--${status}`}>
              {getStatusLabel()}
            </span>
            <button
              className="task-progress-card__delete"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={handleDeleteClick}
              title="删除"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 生成中 / 提交中 / loading */}
        {(isGenerating || isSubmitting || isPending || isLoading) && (
          <div className="task-progress-card__progress-section">
            {placeholder.model && (
              <div className="task-progress-card__model-name">
                {placeholder.model}
              </div>
            )}
            {truncatedPrompt && (
              <div className="task-progress-card__progress-meta">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px', fontFamily: 'inherit' }}>
                  {truncatedPrompt}
                </span>
                {timeElapsed && <span style={{ fontFamily: '"SF Mono", Monaco, "Cascadia Code", monospace' }}>{timeElapsed}</span>}
              </div>
            )}
            <div className="task-progress-card__progress-track">
              <div
                className="task-progress-card__progress-fill"
                style={{ width: progressWidth }}
              />
            </div>
          </div>
        )}

        {/* 失败状态 */}
        {isError && (
          <>
            {placeholder.errorMessage && (
              <div className="task-progress-card__error-box">
                <span className="task-progress-card__error-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </span>
                <div>
                  <div className="task-progress-card__error-title">生成失败</div>
                  <div className="task-progress-card__error-msg">{placeholder.errorMessage}</div>
                </div>
              </div>
            )}
            <button
              className="task-progress-card__btn task-progress-card__btn--retry-full"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={handleRetryClick}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2v6h-6"/>
                <path d="M3 12a9 9 0 0115-6.7L21 8"/>
                <path d="M3 22v-6h6"/>
                <path d="M21 12a9 9 0 01-15 6.7L3 16"/>
              </svg>
              重新尝试
            </button>
          </>
        )}

        {/* 完成状态 */}
        {isCompleted && (
          <div className="task-progress-card__completed-row">
            <div className="task-progress-card__thumb">
              {placeholder.imageUrl ? (
                <img src={placeholder.imageUrl} alt="生成结果" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              )}
            </div>
            <div className="task-progress-card__completed-meta">
              <span>共耗时 {timeElapsed || '0s'}</span>
              <span style={{ color: '#94a3b8' }}>尺寸 {placeholder.image_size || placeholder.aspectRatio || '1:1'}</span>
            </div>
            <div className="task-progress-card__icon-btns">
              <button
                className="task-progress-card__icon-btn task-progress-card__icon-btn--regenerate"
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={handleRetryClick}
                title="重新生成"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2v6h-6"/>
                  <path d="M3 12a9 9 0 0115-6.7L21 8"/>
                  <path d="M3 22v-6h6"/>
                  <path d="M21 12a9 9 0 01-15 6.7L3 16"/>
                </svg>
              </button>
              {placeholder.imageUrl && (
                <button
                  className="task-progress-card__icon-btn task-progress-card__icon-btn--primary"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = placeholder.imageUrl!;
                    a.download = `generated-image-${placeholder.id}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  title="下载图片"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
              )}
              <button
                className="task-progress-card__icon-btn task-progress-card__icon-btn--primary"
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={handleConfirmClick}
                title="确认插入"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PlaceholderOverlay = React.memo(PlaceholderOverlayInner);

// forwardRef wrapper: expose forceSnapshot to App via ref.current.forceSnapshot()
// This eliminates the async race window where getCachedThumbnail() is called
// before requestSnapshotFromOutside() async snapshot completes.
export const Drawnix = React.forwardRef<DrawnixRef, DrawnixProps>((props, ref) => {
  const {
    value,
    viewport,
    theme,
    onChange,
    onSelectionChange,
    onViewportChange,
    onThemeChange,
    onValueChange,
    afterInit,
    tutorial,
    canvasRef,
    headerLeft,
    headerRight,
    onBack,
    onBeforeBack,
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
    fillInputData,
    onFillInput,
    onThumbnailGenerated,
  } = props;
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
      pencilSettings: {
        color: '#3b82f6',
        strokeWidth: 4,
        opacity: 100,
        lineStyle: 'solid',
        shape: 'round',
      },
    };
  });

  // 初始化缩放阻止器（仅在客户端执行一次）
  useEffect(() => {
    initPreventPinchZoom();
    // 初始化任务同步服务：将内存任务自动同步到 IndexedDB
    initTaskSyncService();
  }, []);

  const [board, setBoard] = useState<DrawnixBoard | null>(null);
  const boardRef = useRef<DrawnixBoard | null>(null);

  // 选区保护协调状态 - ref 版本
  const selPresIsRestoringRef = useRef(false);

  // placeholderInfos 必须在 handleImageGenerated 之前定义，因为它被用作 useCallback 的依赖
  const [placeholderInfos, setPlaceholderInfos] = useState<PlaceholderInfo[]>([]);
  const [selectedPlaceholderId, setSelectedPlaceholderId] = useState<string | null>(null);
  // 始终持有最新 placeholderInfos，避免 startTaskPolling 回调中的闭包陈旧问题
  const placeholderInfosRef = useRef<PlaceholderInfo[]>(placeholderInfos);
  useEffect(() => { placeholderInfosRef.current = placeholderInfos; }, [placeholderInfos]);

  // 通过 ID 查找指定卡片
  const findPlaceholder = (id: string) => placeholderInfos.find(p => p.id === id);

  // 更新指定卡片的状态
  const updatePlaceholder = (id: string, partial: Partial<PlaceholderInfo>) => {
    setPlaceholderInfos(prev => prev.map(p => p.id === id ? { ...p, ...partial } : p));
  };

  // 从数组中移除指定卡片
  const removePlaceholder = (id: string) => {
    setPlaceholderInfos(prev => prev.filter(p => p.id !== id));
  };

  // 处理图片生成完成 - 直接在占位符位置渲染图片
  // 返回插入的图片索引，用于后续更新
  // fallbackBounds: 当没有占位符时使用的尺寸和位置信息
  // assetId: 可选的 IndexedDB 资产 ID（用于永久存储，刷新页面不丢失）
  const handleImageGenerated = useCallback(async (
    imageUrl: string,
    placeholderId?: string,
    taskId?: string,
    fallbackBounds?: { x?: number; y?: number; width: number; height: number; prompt?: string; model?: string; aspect_ratio?: string; image_size?: string; referenceImages?: string[] },
    assetId?: string
  ): Promise<number | null> => {
    console.log('[Drawnix] handleImageGenerated called:', {
      imageUrl: imageUrl.substring(0, 50),
      placeholderId,
      taskId,
      assetId
    });

    // 如果传入了 placeholderId，查找对应的占位符信息
    const targetPlaceholder = placeholderId ? findPlaceholder(placeholderId) : placeholderInfosRef.current[placeholderInfosRef.current.length - 1];
    if (placeholderId && targetPlaceholder && targetPlaceholder.id !== placeholderId) {
      console.log('[Drawnix] placeholderId mismatch, using current placeholderInfo');
    }

    // 确定使用的尺寸和位置
    let x: number, y: number, width: number, height: number;
    let imageMetadata: any = {};

    if (targetPlaceholder && board) {
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
      width = fallbackBounds.width;
      height = fallbackBounds.height;

      if (fallbackBounds.x !== undefined && fallbackBounds.y !== undefined) {
        x = fallbackBounds.x;
        y = fallbackBounds.y;
      } else {
        const viewport = board.viewport;
        const zoom = viewport.zoom || 1;
        const viewportWidth = PlaitBoard.getBoardContainer(board).clientWidth;
        const viewportHeight = PlaitBoard.getBoardContainer(board).clientHeight;
        const origX = viewport.origination?.[0] || 0;
        const origY = viewport.origination?.[1] || 0;
        x = origX + viewportWidth / 2 / zoom - width / 2;
        y = origY + viewportHeight / 2 / zoom - height / 2;
      }

      imageMetadata = {
        prompt: fallbackBounds.prompt,
        model: fallbackBounds.model,
        aspect_ratio: fallbackBounds.aspect_ratio,
        image_size: fallbackBounds.image_size,
        referenceImages: fallbackBounds.referenceImages,
      };

      console.log('[Drawnix] Using fallbackBounds for image insertion:', { x, y, width, height });
    } else {
      console.warn('[Drawnix] handleImageGenerated: no placeholderInfo or fallbackBounds, cannot insert image');
      return null;
    }

    if (board) {
      try {
        clearSelectedElement(board);

        // 尝试加载 assetId（可能是内存缓存未命中，或从 IndexedDB 恢复）
        let resolvedAssetId: string | undefined = assetId;
        if (resolvedAssetId && !unifiedCacheService.hasAsset(resolvedAssetId)) {
          console.log('[Drawnix] handleImageGenerated: assetId in memory cache miss, trying to load from IndexedDB:', resolvedAssetId);
          try {
            const asset = await assetStorageService.getAsset(resolvedAssetId);
            if (asset && asset.blob) {
              unifiedCacheService.setAssetInMemory(resolvedAssetId, asset.blob);
              console.log('[Drawnix] handleImageGenerated: asset loaded from IndexedDB to memory cache');
            } else {
              console.warn('[Drawnix] handleImageGenerated: no blob found in IndexedDB for assetId:', resolvedAssetId);
              resolvedAssetId = undefined;
            }
          } catch (loadErr) {
            console.warn('[Drawnix] handleImageGenerated: failed to load asset from IndexedDB:', loadErr);
            resolvedAssetId = undefined;
          }
        }

        if (resolvedAssetId && unifiedCacheService.hasAsset(resolvedAssetId)) {
          console.log('[Drawnix] handleImageGenerated: using pre-cached assetId:', resolvedAssetId);

          // Measure real image dimensions to avoid distortion (placeholder sizes differ from real)
          const cachedBlob = await unifiedCacheService.getAssetBlob(resolvedAssetId);
          if (cachedBlob) {
            const realDims = await measureImageDimensionsFromBlob(cachedBlob);
            if (realDims) {
              width = realDims.width;
              height = realDims.height;
              console.log('[Drawnix] handleImageGenerated: using real dimensions:', { width, height });
            }
          }

          imageMetadata = {
            assetId: resolvedAssetId,
            width,
            height,
          };

          insertImageElementWithAssetId(board, resolvedAssetId, width, height, [x, y]);

          const newIndex = board.children.length - 1;

          if (taskId) {
            setTimeout(() => {
              const existingMap = (board as any).__taskImageIndexMap || {};
              existingMap[taskId] = newIndex;
              (board as any).__taskImageIndexMap = existingMap;
            }, 100);
          }

          if (Object.keys(imageMetadata).length > 0) {
            const existingMetadata = (board as any).__imageMetadataMap || {};
            existingMetadata[newIndex] = imageMetadata;
            (board as any).__imageMetadataMap = existingMetadata;
          }

          Transforms.setNode(board, { opacity: 1 }, [newIndex]);

          // 同步 canvas 实际尺寸到 IndexedDB（解决 handleConfirmInsert / handleSendTaskToCanvas 使用错误尺寸的问题）
          if (taskId) {
            syncTaskPlaceholder(taskId, {
              x,
              y,
              width,
              height,
              imageUrl,
              ...imageMetadata,
            });
          }

          // 更新占位符状态为已完成，再清除（供外部组件如 TaskNotificationPanel 读取最新状态）
          if (targetPlaceholder) {
            updatePlaceholder(targetPlaceholder.id, {
              status: 'completed',
              imageUrl,
              taskId,
            });
          }
          setTimeout(() => targetPlaceholder && removePlaceholder(targetPlaceholder.id), 100);
          return newIndex;
        }

        // 尝试通过 fetch 插入（如果 URL 可访问）
        let imageInserted = false;
        try {
          const imageItemFallback = await insertStandardImage(board, imageUrl, [x, y], { width, height });
          console.log('[Drawnix] Image inserted via factory (assetId:', imageItemFallback.assetId, ', no url in model)');
          imageInserted = true;
        } catch (fetchErr) {
          console.warn('[Drawnix] handleImageGenerated: fetch insert failed, trying IndexedDB fallback:', fetchErr);
        }

        // 如果 fetch 失败，尝试从 IndexedDB 查找已缓存的 asset 并加载
        if (!imageInserted && taskId) {
          try {
            const idbTask = await db.tasks.get(taskId);
            const cachedAssetId = idbTask?.localAssetId;
            if (cachedAssetId) {
              const asset = await assetStorageService.getAsset(cachedAssetId);
              if (asset && asset.blob) {
                unifiedCacheService.setAssetInMemory(cachedAssetId, asset.blob);
                // Measure real dimensions to avoid distortion
                const realDims = await measureImageDimensionsFromBlob(asset.blob);
                if (realDims) {
                  width = realDims.width;
                  height = realDims.height;
                }
                insertImageElementWithAssetId(board, cachedAssetId, width, height, [x, y]);
                const newIndex = board.children.length - 1;

                if (taskId) {
                  setTimeout(() => {
                    const existingMap = (board as any).__taskImageIndexMap || {};
                    existingMap[taskId] = newIndex;
                    (board as any).__taskImageIndexMap = existingMap;
                  }, 100);
                }

                const cachedMetadata = { assetId: cachedAssetId, width, height };
                const existingMetadata = (board as any).__imageMetadataMap || {};
                existingMetadata[newIndex] = cachedMetadata;
                (board as any).__imageMetadataMap = existingMetadata;
                Transforms.setNode(board, { opacity: 1 }, [newIndex]);

                if (taskId) {
                  syncTaskPlaceholder(taskId, { x, y, width, height, imageUrl, ...cachedMetadata });
                }
                if (targetPlaceholder) {
                  updatePlaceholder(targetPlaceholder.id, { status: 'completed', imageUrl, taskId });
                }
                setTimeout(() => targetPlaceholder && removePlaceholder(targetPlaceholder.id), 100);
                return newIndex;
              }
            }
          } catch (idbErr) {
            console.warn('[Drawnix] handleImageGenerated: IndexedDB fallback also failed:', idbErr);
          }
          console.error('Failed to render image on placeholder: fetch and IndexedDB fallback both failed');
        }
      } catch (e) {
        console.error('Failed to render image on placeholder:', e);
      }
    }
    return null;
  }, [board, placeholderInfos]);

  // 【新增 forceSnapshot】通过 ref 暴露给外部，用于退出前强制刷新快照
  // 解决：handleBack 在防抖期间调用时，requestSnapshotFromOutside() 触发 async snapshot，
  // 但 getCachedThumbnail() 立即同步返回 null（Promise 还未 resolve）。
  // 使用 await ref.current.forceSnapshot() 确保快照写入缓存后，再去读缓存，彻底消除竞态。
  useImperativeHandle(ref, () => ({
    forceSnapshot: async (fallbackProjectId?: string, options?: { skipIfEmpty?: boolean }) => {
      const activeProjectId = projectId || fallbackProjectId;

      if (!board) { console.warn('[forceSnapshot] board is null!'); return null; }
      if (!activeProjectId) {
        console.warn('[forceSnapshot] activeProjectId is null!');
        return null;
      }

      if (options?.skipIfEmpty) {
        const children = (board as any).children;
        if (!children || children.length === 0) {
          console.log('[forceSnapshot] Skipped: board has no children');
          return null;
        }
      }

      const children = (board as any).children;
      console.log('[forceSnapshot] Board children count:', children?.length ?? 'unknown');
      try {
        console.log('[forceSnapshot] Starting snapshot generation...');
        const { boardToImageOptimized } = await import('./utils/common');
        const { setCachedThumbnail } = await import('./services/unified-cache-service');

        const thumbnail = await boardToImageOptimized(board, { ratio: 0.4, maxElements: 200 });

        if (thumbnail && thumbnail.length >= 1000) {
          setCachedThumbnail(thumbnail, activeProjectId);
          console.log('[forceSnapshot] Snapshot generated, length:', thumbnail.length);
          return thumbnail;
        }

        console.warn('[forceSnapshot] Thumbnail too small:', thumbnail?.length ?? 'null', 'bytes, trying fallback...');
      } catch (error) {
        console.error('[forceSnapshot] Exception during snapshot:', error);
      }

      const { getCachedThumbnail } = await import('./services/unified-cache-service');
      const cached = getCachedThumbnail(activeProjectId);
      if (cached && cached.length >= 1000) {
        console.log('[forceSnapshot] Fallback to cached thumbnail, length:', cached.length);
        return cached;
      }

      console.warn('[forceSnapshot] No valid thumbnail available.');
      return null;
    },
    clearPlaceholder: () => {
      setPlaceholderInfos([]);
      setSelectedPlaceholderId(null);
    },
    handleImageGenerated: handleImageGenerated,
  }), [board, projectId, handleImageGenerated]);

  const [selectedImageUrls, setSelectedImageUrls] = useState<SelectedImageMeta[]>([]);
  // 自动比例检测：记录当前检测到的图片比例，用于同步到 AI 输入框
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<string | null>(null);
  // 记录上次占位符放置的位置（用于下次放置的参考）
  const lastPlaceholderPositionRef = useRef<{ x: number; y: number } | null>(null);
  // 【双端锁定】追踪输入框焦点状态，用于 React 层冻结选中上下文 + 引擎层阻止清空选中
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

  // 【新增】连续静默快照 Hook - 用户静止 4 秒后自动生成缩略图
  const { triggerSnapshot } = useAutoSnapshot(board, projectId || null, {
    onThumbnailGenerated: onThumbnailGenerated,
  });

  // 将 triggerSnapshot 注册到模块级变量，供外部同步调用（header back button 绕过防抖）
  React.useEffect(() => {
    requestSnapshotFn = triggerSnapshot;
    return () => {
      requestSnapshotFn = null;
    };
  }, [triggerSnapshot]);

  // 恢复初始占位符（用于页面刷新后恢复任务）
  useEffect(() => {
    if (initialPlaceholder && placeholderInfos.length === 0) {
      console.log('[Drawnix] Restoring placeholder from initialPlaceholder:', initialPlaceholder);
      setPlaceholderInfos([initialPlaceholder]);
    }
  }, [initialPlaceholder]);

  // 当占位符更新时，通知父组件
  useEffect(() => {
    if (placeholderInfos.length > 0 && onPlaceholderUpdate) {
      onPlaceholderUpdate(placeholderInfosRef.current[placeholderInfosRef.current.length - 1]);
    }
  }, [placeholderInfos, onPlaceholderUpdate]);

  // 处理自动检测到的图片比例变化
  // detectedAspectRatio 会在 SelectionTracker 检测到单张图片时自动更新
  // GlobalConsole 会通过 initialAspectRatio 变化自动应用新比例

  if (board) {
    board.appState = appState;
    (appState as any).board = board;
  }

  const updateAppState = (newAppState: Partial<DrawnixState>) => {
    setAppState({
      ...appState,
      ...newAppState,
    });
  };

  // Helper functions for settings
  const setPencilSettings = (settings: PencilSettings) => {
    setAppState({
      ...appState,
      pencilSettings: settings,
    });
  };

  // Tool type detection functions
  const isPencilTool = (): boolean => {
    if (!board) return false;
    return PlaitBoard.isInPointer(board, [
      'feltTipPen',
      'markerHighlight',
      'nibPen',
      'artisticBrush',
    ]);
  };

  const isEraserTool = (): boolean => {
    if (!board) return false;
    return PlaitBoard.isInPointer(board, ['eraser']);
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

  // 【双端锁定 - UI 层】输入框获得/失去焦点时更新追踪状态
  const handleInputFocus = () => {
    isInputFocusedRef.current = true;
  };

  const handleInputBlur = () => {
    isInputFocusedRef.current = false;
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

  // 【核心】上传参考图时自动插入画布（让缩略图能看到上传的图片）
  const handleImageUploadedToCanvas = async (imageUrl: string) => {
    // 优先使用 boardRef（立即就绪），降级使用 board state
    const targetBoard = boardRef.current || board;
    if (!targetBoard) {
      console.warn('[handleImageUploadedToCanvas] No board available');
      return;
    }
    console.log('[handleImageUploadedToCanvas] Board children BEFORE insert:', (targetBoard as any).children?.length);
    try {
      const { insertStandardImage } = await import('./services/image-element-factory');
      const result = await insertStandardImage(targetBoard, imageUrl);
      console.log('[handleImageUploadedToCanvas] Image inserted to canvas:', result);
      console.log('[handleImageUploadedToCanvas] Board children AFTER insert:', (targetBoard as any).children?.length);
    } catch (e) {
      console.error('[handleImageUploadedToCanvas] Failed to insert image:', e);
    }
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

    // 【重构后】使用常量获取显示尺寸（不再硬编码）
    const aspectRatio = options.aspect_ratio || '1:1';
    const displaySize = PLACEHOLDER_DISPLAY_SIZES[aspectRatio] || PLACEHOLDER_DISPLAY_SIZES['1:1'];
    const width = displaySize.width;
    const height = displaySize.height;

    // 获取当前选中元素的 ID
    const selectedIds = board.getSelectedElements().map(el => el.id);

    // 【重构后】使用新的插入点计算函数（上下文感知）
    const rawInsertPos = calculateInsertionPoint(board, selectedIds, DEFAULT_INSERTION_OFFSET);

    // 确保占位符完全在视口内
    const insertPos = clampInsertionPointToViewport(
      board,
      rawInsertPos,
      width,
      height
    );

    const finalX = insertPos.x;
    const finalY = insertPos.y;

    console.log('[Placeholder] Final position:', finalX, finalY, { aspectRatio, displaySize });

    // 创建占位块信息 - 使用新的比例感知尺寸
    const placeholderId = generatePlaceholderId();

    // 创建内存任务（与占位符关联，供 handleGenerateImage 复用）
    const memoryTask = createTaskMemory({
      prompt: value,
      model: options.model,
      aspectRatio: options.aspect_ratio,
      imageSize: options.image_size,
      referenceImages: images,
      placeholderId, // 关联占位符 ID
      workspaceId: projectId,
    });
    console.log('[Placeholder] Created memory task:', memoryTask.id, 'for placeholderId:', placeholderId);

    const newPlaceholder: PlaceholderInfo = {
      id: placeholderId,
      taskId: memoryTask.id, // 关联内存任务 ID，供外部和后续回调使用
      x: finalX,
      y: finalY,
      width,
      height,
      aspectRatio,
      placeholderElement: undefined,
      status: 'loading', // 【新增】loading 状态表示正在等待生成
      prompt: value,
      startTime: Date.now(),
      // 种子卡片：保存完整的生成参数
      model: options.model,
      aspect_ratio: options.aspect_ratio,
      image_size: options.image_size,
      referenceImages: images,
    };

    console.log('[Placeholder] Setting placeholder info:', newPlaceholder);
    // 通知 handleGenerateImage 应该复用这个 placeholderId 对应的内存任务
    _lastCreatedPlaceholderId = placeholderId;
    setPlaceholderInfos(prev => [...prev, newPlaceholder]);
    console.log('[Placeholder] placeholderInfo set successfully, memoryTaskId:', memoryTask.id);
  };

  // 【Phase 2 新增】处理图片生成 - 新的非阻塞架构
  // 1. 向全局 Task Store 添加任务（UI 立即显示任务卡片）
  // 2. 调用 Adapter.generate 发起 API 请求
  // 3. 启动后台轮询（非阻塞）
  const handleGenerateImage = async (
    value: string,
    images: string[],
    options: ImageGenerateOptions
  ) => {
    console.log('[TaskStore] handleGenerateImage called', { value, images, options });

    // 尝试复用 handleGenerateImageWithContext 创建的任务（通过 placeholderId 关联）
    // 如果找不到（standalone 调用场景），则创建新任务
    let task: ReturnType<typeof createTaskMemory>;
    const lastPlaceholderId = _lastCreatedPlaceholderId;
    _lastCreatedPlaceholderId = null; // 立即清除，避免泄漏

    if (lastPlaceholderId) {
      const existingTask = getTaskByPlaceholderId(lastPlaceholderId);
      if (existingTask) {
        task = existingTask;
        console.log('[TaskStore] Reusing existing task for placeholderId:', lastPlaceholderId, 'taskId:', task.id);
      } else {
        task = createTaskMemory({
          prompt: value,
          model: options.model,
          aspectRatio: options.aspect_ratio,
          imageSize: options.image_size,
          referenceImages: images,
          workspaceId: projectId,
        });
        console.log('[TaskStore] No existing task found, created new task:', task.id);
      }
    } else {
      task = createTaskMemory({
        prompt: value,
        model: options.model,
        aspectRatio: options.aspect_ratio,
        imageSize: options.image_size,
        referenceImages: images,
        workspaceId: projectId,
      });
      console.log('[TaskStore] No last placeholderId, created new task:', task.id);
    }

    console.log('[TaskStore] Task ready:', task.id);

    try {
      // 获取适配器并发起生成请求
      const adapter = getImageGenerationAdapter();
      const t0 = Date.now();
      const remoteTaskId = await adapter.generate({
        prompt: value,
        model: options.model,
        aspect_ratio: options.aspect_ratio,
        image_size: options.image_size as any,
        image: images,
      });
      console.log('[TaskStore] ✅ adapter.generate completed in', Date.now() - t0, 'ms, remoteTaskId:', remoteTaskId);

      // 更新任务为 generating 状态，保存 remoteTaskId
      updateTaskMemory(task.id, {
        status: 'generating',
        remoteTaskId,
      });

      // 同步更新占位卡片为 generating 状态
      const targetForGenerating = placeholderInfosRef.current.find(p => p.taskId === task.id);
      if (targetForGenerating) {
        updatePlaceholder(targetForGenerating.id, { status: 'generating', startTime: Date.now() });
      }

      // 5. 启动后台轮询（非阻塞，函数立即返回）
      //    同时通过回调将任务状态同步到 IndexedDB（解决 TaskListButton 看不到任务的问题）
      const pollingAdapter = adapter;
      const pollingTaskId = task.id;
      startTaskPolling(pollingTaskId, remoteTaskId, pollingAdapter, {
        onProgress: (progress: number) => {
          syncTaskProgress(pollingTaskId, progress);
          const target = placeholderInfosRef.current.find(p => p.taskId === pollingTaskId);
          if (target) {
            updatePlaceholder(target.id, { progress, status: 'generating' });
          }
        },
        onSuccess: async (imageUrl: string) => {
          console.log('[TaskStore] Task completed, updating placeholder card:', pollingTaskId);

          const targetPlaceholder = placeholderInfosRef.current.find(p => p.taskId === pollingTaskId);
          if (targetPlaceholder) {
            updatePlaceholder(targetPlaceholder.id, { status: 'completed', imageUrl });
            console.log('[TaskStore] Placeholder card updated to completed:', targetPlaceholder.id);
          } else {
            console.warn('[TaskStore] No placeholder found for taskId:', pollingTaskId);
          }

          // 【修复】先缓存图片到本地，获取 assetId 后再同步到 IndexedDB
          // 确保 localAssetId 在 syncTaskComplete 之前就绪
          let localAssetId: string | undefined;
          try {
            localAssetId = await cacheImageAsset(imageUrl, pollingTaskId);
            if (localAssetId) {
              updateTaskMemory(pollingTaskId, { localAssetId });
            }
          } catch (cacheErr) {
            console.warn('[TaskStore] Failed to cache image asset (non-critical):', cacheErr);
          }

          // 同步完成状态到 IndexedDB（现在 localAssetId 已就绪）
          try {
            await syncTaskComplete(pollingTaskId, imageUrl, {
              originalUrl: imageUrl,
              projectId,
              localAssetId,
            });
            console.log('[TaskStore] Task status synced to IndexedDB, localAssetId:', localAssetId);
          } catch (syncErr) {
            console.error('[TaskStore] Failed to sync task status:', syncErr);
          }

          // 通知外部状态变化
          if (targetPlaceholder && onPlaceholderStatusChange) {
            onPlaceholderStatusChange(targetPlaceholder.id, 'completed', undefined);
          }
        },
        onFailure: (error: string) => {
          console.error('[TaskStore] Task failed, updating placeholder card:', pollingTaskId, error);

          const targetPlaceholder = placeholderInfosRef.current.find(p => p.taskId === pollingTaskId);
          if (targetPlaceholder) {
            updatePlaceholder(targetPlaceholder.id, { status: 'failed', errorMessage: error });
            console.log('[TaskStore] Placeholder card updated to failed:', targetPlaceholder.id);
          }

          syncTaskFailure(pollingTaskId, error);
          // 通知外部状态变化
          if (targetPlaceholder && onPlaceholderStatusChange) {
            onPlaceholderStatusChange(targetPlaceholder.id, 'failed', error);
          }
        },
      });

      console.log('[TaskStore] Polling started for task:', task.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TaskStore] Generate failed:', errorMessage);

      // 标记任务失败
      failTaskMemory(task.id, errorMessage);
      // 同步失败状态到 IndexedDB
      syncTaskFailure(task.id, errorMessage);

      // 查找对应卡片并更新状态
      const targetPlaceholder = placeholderInfosRef.current.find(p => p.taskId === task.id);
      if (targetPlaceholder) {
        updatePlaceholder(targetPlaceholder.id, { status: 'failed', errorMessage });
        if (onPlaceholderStatusChange) {
          onPlaceholderStatusChange(targetPlaceholder.id, 'failed', errorMessage);
        }
      }
    }
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
    const target = selectedPlaceholderId
      ? findPlaceholder(selectedPlaceholderId)
      : placeholderInfosRef.current[placeholderInfosRef.current.length - 1];
    if (target) {
      console.log('[Placeholder] move', {
        id: target.id,
        from: { x: target.x, y: target.y },
        to: { x, y },
        status: target.status,
      });
      updatePlaceholder(target.id, { x, y });
    }
  };

  // 更新占位符状态（供外部调用）
  const updatePlaceholderStatus = (status: 'pending' | 'generating' | 'completed' | 'failed' | 'loading', errorMessage?: string, imageUrl?: string, taskId?: string) => {
    if (!taskId) {
      console.warn('[drawnix] updatePlaceholderStatus: taskId is required to locate the target placeholder');
      return;
    }
    const target = placeholderInfosRef.current.find(p => p.taskId === taskId);
    if (!target) {
      console.warn('[drawnix] updatePlaceholderStatus: no placeholder found for taskId:', taskId);
      return;
    }
    updatePlaceholder(target.id, { status, errorMessage, imageUrl, taskId });
  };

  // 更新占位符进度（供外部调用）- 种子卡片专用
  const updatePlaceholderProgress = (progress: number, taskId?: string) => {
    if (!taskId) {
      console.warn('[drawnix] updatePlaceholderProgress: taskId is required to locate the target placeholder');
      return;
    }
    const target = placeholderInfosRef.current.find(p => p.taskId === taskId);
    if (!target) {
      console.warn('[drawnix] updatePlaceholderProgress: no placeholder found for taskId:', taskId);
      return;
    }
    updatePlaceholder(target.id, { progress, status: 'generating' });
  };

  // 清理占位符（供外部调用）
  const clearPlaceholder = () => {
    setPlaceholderInfos([]);
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

  const setInputImages = (images: SelectedImageMeta[]) => {
    console.log('[Drawnix] 📥 setInputImages 被调用，接收到的数据:', images);
    console.log('[Drawnix] 📊 数组长度:', images?.length);
    if (images && images.length > 0) {
      console.log('[Drawnix] 🖼️ 第一张图片元数据:', {
        id: images[0].id,
        assetId: images[0].assetId,
        hasUrl: !!images[0].url,
      });
    }
    console.log('[Drawnix] 📥 setInputImages 被调用，接收到的数据:', images);
    setSelectedImageUrls(images);
  };

  // 聚焦到指定位置的占位符/种子卡片
  const focusOnPlaceholder = (x: number, y: number, width: number, height: number) => {
    if (!board) return;

    // 计算目标视口中心
    const targetX = x + width / 2;
    const targetY = y + height / 2;

    // 使用正确的 API 设置视口中心
    updateViewportOrigination(board, [targetX, targetY]);

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
  }, [board, placeholderInfos, handleImageGenerated]);

  return (
    <I18nProvider>
      <DrawnixContext.Provider
        value={{
          appState,
          setAppState,
          setPencilSettings,
          isPencilTool,
          isEraserTool,
        }}
      >
        <DrawnixBoardContext.Provider value={board}>
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
                // board state may be null on first call; use boardRef which is set synchronously in afterInit
                const currentBoard = boardRef.current;
                if (currentBoard) {
                  const sel = currentBoard.selection as any;
                  const selectedElements = currentBoard.getSelectedElements();
                  console.log('[drawnix onChange]', {
                    boardReady: true,
                    selection: sel ? sel.all?.map((e: PlaitElement) => e.id).join(',') || `len=${sel.length}` : 'null/undefined',
                    selectedElements: selectedElements.map((e: PlaitElement) => e.id).join(','),
                  });
                }
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

                // 初始化画笔预设配置（从 appState 同步到 WeakMap）
                updateFreehandSettings(board as DrawnixBoard, {
                  strokeColor: appState.pencilSettings.color,
                  strokeWidth: appState.pencilSettings.strokeWidth,
                  opacity: appState.pencilSettings.opacity,
                  lineStyle: appState.pencilSettings.lineStyle,
                  shape: appState.pencilSettings.shape,
                });

                if (canvasRef && containerRef.current) {
                  const canvas = containerRef.current.querySelector('canvas');
                  if (canvas) {
                    canvasRef(canvas as HTMLCanvasElement);
                  }
                }

                // 【双端锁定 - 引擎层】应用选择保护插件
                withSelectionProtection(board, isInputFocusedRef);

                // 【UI 拦截】统一覆盖 board 的 pointerDown/pointerMove/pointerUp/globalPointerMove/globalPointerUp
                // 当事件发生在 FloatingWindow 内部时，阻止 board 处理，防止 board 进入拖拽状态导致交互冲突
                // 同时保留 try/catch 错误处理
                const _origPD = board.pointerDown.bind(board);
                const _origPM = board.pointerMove.bind(board);
                const _origPU = board.pointerUp.bind(board);
                const _origGPM = board.globalPointerMove.bind(board);
                const _origGPU = board.globalPointerUp.bind(board);
                const _isFWDragging = new WeakMap<PlaitBoard, boolean>();
                _isFWDragging.set(board, false);

                // 【aitu 标准保护机制】在捕获阶段标记是否点击了 UI 控件
                // 目标：在 pointerdown 阶段记录，globalPointerUp 时依据此标志提前 return
                // 让画布"对 UI 点击完全失明"，而不是事后补救
                const _isUIControl = (target: HTMLElement | null | undefined): boolean => {
                  if (!target) return false;
                  return (
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'INPUT' ||
                    target.tagName === 'BUTTON' ||
                    !!target.closest?.(
                      'textarea, input, button, [contenteditable="true"], .global-console'
                    )
                  );
                };

                // 捕获阶段监听：比 board.pointerDown 更早执行，在事件到达 document 前打标记
                const _handleCapturePointerDown = (e: PointerEvent) => {
                  (board as any).__isUIControlClick = _isUIControl(e.target as HTMLElement);
                  if ((board as any).__isUIControlClick) {
                    console.log('[board] 📴 UI 控件点击已标记，画布将忽略此次 pointerUp');
                  }
                };
                document.addEventListener('pointerdown', _handleCapturePointerDown, true);

                board.pointerDown = (event: PointerEvent) => {
                  try {
                    if (_isFWDragging.get(board)) {
                      return;
                    }
                    _origPD(event);
                  } catch (error) { /* suppress */ }
                };

                board.pointerMove = (event: PointerEvent) => {
                  try {
                    if (_isFWDragging.get(board)) return;
                    _origPM(event);
                  } catch (error) { /* suppress */ }
                };

                board.pointerUp = (event: PointerEvent) => {
                  try {
                    if (_isFWDragging.get(board)) {
                      _isFWDragging.set(board, false);
                      return;
                    }
                    _origPU(event);
                  } catch (error) { /* suppress */ }
                };

                board.globalPointerMove = (event: PointerEvent) => {
                  try {
                    if (_isFWDragging.get(board)) return;
                    _origGPM(event);
                  } catch (error) { /* suppress */ }
                };

                board.globalPointerUp = (event: PointerEvent) => {
                  try {
                    // 【关键】如果点击目标是 UI 控件，直接跳过原生逻辑，防止清空选区
                    if ((board as any).__isUIControlClick) {
                      console.log('[board] 📴 UI 控件点击，跳过 globalPointerUp 原生逻辑');
                      _isFWDragging.set(board, false);
                      return;
                    }

                    if (_isFWDragging.get(board)) {
                      _isFWDragging.set(board, false);
                      return;
                    }
                    _origGPU(event);
                  } catch (error) { /* suppress */ }
                };

                afterInit && afterInit(board);
              }}
            >
              <SelectionTracker onImageSelect={setSelectedImageUrls} isRestoringSelectionRef={selPresIsRestoringRef} onSingleImageAspectRatioDetected={setDetectedAspectRatio} />
              {placeholderInfos.length > 0 && board && placeholderInfos.map(placeholder => (
                <PlaceholderOverlay
                  key={placeholder.id}
                  placeholder={placeholder}
                  board={board}
                  viewportZoom={viewportProps.zoom}
                  viewportOrigX={viewportProps.origX}
                  viewportOrigY={viewportProps.origY}
                  onPlaceholderMove={handlePlaceholderMove}
                  isSelected={selectedPlaceholderId === placeholder.id}
                  onSelect={(id) => {
                    setSelectedPlaceholderId(id);
                    onPlaceholderSelect?.(id);
                  }}
                  onDelete={(id) => {
                    setSelectedPlaceholderId(null);
                    removePlaceholder(id);
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
              ))}
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
              onBeforeBack={onBeforeBack}
              showMenuButton={showMenuButton}
            ></AppToolbar>
            <CreationToolbar></CreationToolbar>
            <ZoomToolbar></ZoomToolbar>
            <PopupToolbar></PopupToolbar>
            <ClosePencilToolbar></ClosePencilToolbar>
            {/* 画笔/橡皮擦工具栏：顶部居中，切换工具自动消失 */}
            {board &&
              (isPencilTool() || isEraserTool()) && (
                <div className="contextual-toolbar-layer">
                  {isPencilTool() && (
                    <PencilSettingsToolbar
                      color={appState.pencilSettings.color}
                      strokeWidth={appState.pencilSettings.strokeWidth}
                      opacity={appState.pencilSettings.opacity}
                      lineStyle={appState.pencilSettings.lineStyle}
                      shape={appState.pencilSettings.shape}
                      onColorChange={(color) => {
                        updateFreehandSettings(board, { strokeColor: color });
                        setAppState({
                          ...appState,
                          pencilSettings: { ...appState.pencilSettings, color },
                        });
                      }}
                      onStrokeWidthChange={(strokeWidth) => {
                        updateFreehandSettings(board, { strokeWidth });
                        setAppState({
                          ...appState,
                          pencilSettings: { ...appState.pencilSettings, strokeWidth },
                        });
                      }}
                      onOpacityChange={(opacity) => {
                        updateFreehandSettings(board, { opacity });
                        setAppState({
                          ...appState,
                          pencilSettings: { ...appState.pencilSettings, opacity },
                        });
                      }}
                      onLineStyleChange={(lineStyle) => {
                        updateFreehandSettings(board, { lineStyle });
                        setAppState({
                          ...appState,
                          pencilSettings: { ...appState.pencilSettings, lineStyle },
                        });
                      }}
                      onShapeChange={(shape) => {
                        updateFreehandSettings(board, { shape });
                        setAppState({
                          ...appState,
                          pencilSettings: { ...appState.pencilSettings, shape },
                        });
                      }}
                    />
                  )}
                  {isEraserTool() && <EraserSettingsToolbar />}
                </div>
              )}
            <TTDDialog container={containerRef.current}></TTDDialog>
            <CleanConfirm container={containerRef.current}></CleanConfirm>
            <GlobalConsole
              placeholder="今天你想创作什么"
              imageUrls={selectedImageUrls}
              onImagesClear={() => setSelectedImageUrls([])}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onSubmit={(value, images) => console.log('AI Submit:', { value, images })}
              onGenerateImage={onGenerateImage ?? handleGenerateImage}
              onGenerateImageWithContext={handleGenerateImageWithContext}
              onAgentSubmit={(value, images, skill) => console.log('Agent Submit:', { value, images, skill })}
              onSendStart={handleSendStart}
              imageGenerateOptions={imageGenerateOptions}
              isGenerating={isGenerating}
              initialPrompt={fillInputData?.prompt}
              initialImages={fillInputData?.images}
              initialModel={fillInputData?.model}
              initialAspectRatio={detectedAspectRatio || fillInputData?.aspectRatio}
              initialImageSize={fillInputData?.imageSize}
              onImageUploadedToCanvas={handleImageUploadedToCanvas}
              onFillInput={onFillInput}
            ></GlobalConsole>
          </Wrapper>
          <canvas className={`${LASER_POINTER_CLASS_NAME} mouse-course-hidden`}></canvas>
          </div>
        </DrawnixBoardContext.Provider>
        </DrawnixContext.Provider>
      </I18nProvider>
  );
});
