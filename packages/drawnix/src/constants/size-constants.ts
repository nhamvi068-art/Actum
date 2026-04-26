/**
 * 尺寸常量模块
 *
 * 将不同宽高比对应的物理分辨率（用于 API 生成）和画布显示尺寸（用于占位符）解耦并集中管理。
 *
 * 架构设计：
 * - IMAGE_GENERATION_SIZES: API 生成时的物理分辨率（发送给图像生成服务的尺寸）
 * - PLACEHOLDER_DISPLAY_SIZES: 占位符在画布上的显示尺寸（用户可见的占位卡片大小）
 *
 * 这样做到了：
 * 1. 比例与尺寸映射集中管理，便于维护和修改
 * 2. 生成尺寸与显示尺寸分离，支持独立调整
 * 3. 所有比例常量保持一致性
 */

/** API 生成时的物理分辨率（发送给图像生成服务的尺寸） */
export const IMAGE_GENERATION_SIZES: Record<string, { width: number; height: number }> = {
  '1:1':   { width: 1024, height: 1024 },
  '2:3':   { width: 1024, height: 1536 },
  '3:4':   { width: 1024, height: 1366 },
  '4:5':   { width: 1024, height: 1280 },
  '9:16':  { width: 1024, height: 1820 },
  '3:2':   { width: 1536, height: 1024 },
  '4:3':   { width: 1366, height: 1024 },
  '5:4':   { width: 1280, height: 1024 },
  '16:9':  { width: 1820, height: 1024 },
  '21:9':  { width: 2104, height: 968 },
};

/** 占位符在画布上的显示尺寸（用户可见的占位卡片大小） */
export const PLACEHOLDER_DISPLAY_SIZES: Record<string, { width: number; height: number }> = {
  '1:1':   { width: 200, height: 200 },
  '2:3':   { width: 160, height: 240 },
  '3:4':   { width: 180, height: 240 },
  '4:5':   { width: 160, height: 200 },
  '9:16':  { width: 135, height: 240 },
  '3:2':   { width: 240, height: 160 },
  '4:3':   { width: 240, height: 180 },
  '5:4':   { width: 200, height: 160 },
  '16:9':  { width: 240, height: 135 },
  '21:9':  { width: 280, height: 129 },
};

/** 默认插入偏移量（元素之间的间距） */
export const DEFAULT_INSERTION_OFFSET = 20;

/** 占位符与视口边缘的最小间距 */
export const PLACEHOLDER_VIEWPORT_MARGIN = 20;

/** 所有支持的比例列表（按分组） */
export const ASPECT_RATIO_LIST = [
  // 方形
  '1:1',
  // 竖向
  '2:3', '3:4', '4:5', '9:16',
  // 横向
  '3:2', '4:3', '5:4', '16:9',
  // 宽幅
  '21:9',
] as const;

/** 比例分组信息 */
export const ASPECT_RATIO_GROUPS: Record<string, { label: string; ratios: readonly string[] }> = {
  square: { label: '方形', ratios: ['1:1'] },
  portrait: { label: '竖向', ratios: ['2:3', '3:4', '4:5', '9:16'] },
  landscape: { label: '横向', ratios: ['3:2', '4:3', '5:4', '16:9'] },
  ultrawide: { label: '宽幅', ratios: ['21:9'] },
};
