/**
 * 画笔预设配置存储 (Freehand Settings)
 *
 * 使用 WeakMap 绑定 Board 的预设配置，解决工具栏修改配置后新建线条不生效的问题。
 *
 * 架构说明：
 * - React 层 (drawnix.tsx) 使用 appState.pencilSettings 管理 UI 状态
 * - WeakMap 层 (本文件) 存储插件层需要读取的预设配置
 * - 画笔工具层 (freehand-tool.ts) 在创建新元素时读取 WeakMap 配置
 *
 * 数据流：
 * 工具栏 onChange → updateFreehandSettings → WeakMap
 *                                          ↘
 *                        createFreehandElement ← getFreehandSettings ← WeakMap
 */

import { PlaitBoard } from '@plait/core';

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type BrushShape = 'round' | 'square';

export interface FreehandSettings {
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  lineStyle: LineStyle;
  shape: BrushShape;
}

const DEFAULT_SETTINGS: FreehandSettings = {
  strokeColor: '#3b82f6',  // 与 drawnix.tsx 中的默认值保持一致
  strokeWidth: 4,
  opacity: 100,
  lineStyle: 'solid',
  shape: 'round',
};

const FREEHAND_SETTINGS = new WeakMap<PlaitBoard, FreehandSettings>();

export const getFreehandSettings = (board: PlaitBoard): FreehandSettings => {
  return FREEHAND_SETTINGS.get(board) || DEFAULT_SETTINGS;
};

export const updateFreehandSettings = (board: PlaitBoard, settings: Partial<FreehandSettings>) => {
  const current = getFreehandSettings(board);
  FREEHAND_SETTINGS.set(board, { ...current, ...settings });
};
