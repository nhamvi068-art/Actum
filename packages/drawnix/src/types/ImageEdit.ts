// 裁剪+滤镜整合的编辑状态
export interface ImageEditState {
  // 裁剪核心状态
  activeTab: 'crop' | 'filter'; // 裁剪/滤镜标签切换
  cropRatio: string; // 裁剪比例（16:9/9:16等）
  cropRatioValue: number; // 比例数值
  isRemoveWhiteEdge: boolean; // 智能去白边
  cropScale: number; // 画布缩放比例（100%对应1）
  cropBox: {
    // 裁剪框位置/尺寸
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // 滤镜核心状态
  currentFilterPreset: string; // 当前选中的滤镜预设（原图/黑白/怀旧等）
  filterParams: {
    // 滤镜参数（与截图滑块一一对应）
    brightness: number; // 亮度（0-200，默认100）
    contrast: number; // 对比度（0-200，默认100）
    saturation: number; // 饱和度（0-200，默认100）
    gray: number; // 灰度（0-100，默认0）
    retro: number; // 复古（0-100，默认0）
    hue: number; // 色相（-180~180，默认0）
    blur: number; // 模糊（0-20，默认0）
  };
}

// 滤镜预设类型
export interface FilterPreset {
  key: string;
  label: string;
  params: Partial<ImageEditState['filterParams']>;
}

// 预设的裁剪比例
export const CROP_RATIOS = [
  { key: '16:9', label: '16:9', value: 16 / 9 },
  { key: '9:16', label: '9:16', value: 9 / 16 },
  { key: '4:3', label: '4:3', value: 4 / 3 },
  { key: '3:4', label: '3:4', value: 3 / 4 },
  { key: '1:1', label: '1:1', value: 1 },
];

// 预设的滤镜配置
export const FILTER_PRESETS: FilterPreset[] = [
  { key: 'origin', label: '原图', params: { brightness: 100, contrast: 100, saturation: 100, gray: 0, retro: 0, hue: 0, blur: 0 } },
  { key: 'blackWhite', label: '黑白', params: { brightness: 100, contrast: 100, saturation: 0, gray: 100, retro: 0, hue: 0, blur: 0 } },
  { key: 'nostalgia', label: '怀旧', params: { brightness: 105, contrast: 105, saturation: 90, gray: 20, retro: 80, hue: 10, blur: 0 } },
  { key: 'fresh', label: '清新', params: { brightness: 105, contrast: 95, saturation: 110, gray: 0, retro: 0, hue: -5, blur: 0 } },
  { key: 'cold', label: '冷色', params: { brightness: 100, contrast: 100, saturation: 90, gray: 0, retro: 0, hue: -20, blur: 0 } },
  { key: 'warm', label: '暖色', params: { brightness: 100, contrast: 100, saturation: 100, gray: 0, retro: 0, hue: 20, blur: 0 } },
];

// 默认的滤镜参数
export const DEFAULT_FILTER_PARAMS: ImageEditState['filterParams'] = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  gray: 0,
  retro: 0,
  hue: 0,
  blur: 0,
};

