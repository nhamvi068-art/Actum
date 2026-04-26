import { PlaitImage } from '@plait/draw';

/**
 * 扩展 PlaitImage 接口，添加非破坏性裁剪属性
 * crop 属性存储相对于原图的裁剪比例 (0-1)
 */
export interface ImageCropData {
  x: number;      // 裁剪框左上角 X 坐标 (相对比例 0-1)
  y: number;      // 裁剪框左上角 Y 坐标 (相对比例 0-1)
  width: number;  // 裁剪框宽度 (相对比例 0-1)
  height: number; // 裁剪框高度 (相对比例 0-1)
}

/**
 * 扩展后的图片元素类型
 */
export interface PlaitImageWithCrop extends PlaitImage {
  crop?: ImageCropData;
}

/**
 * 判断元素是否有裁剪数据
 */
export function hasCropData(element: PlaitImage): element is PlaitImageWithCrop {
  return !!(element as any).crop;
}

/**
 * 获取图片元素的裁剪数据
 */
export function getCropData(element: PlaitImage): ImageCropData | undefined {
  return (element as PlaitImageWithCrop).crop;
}