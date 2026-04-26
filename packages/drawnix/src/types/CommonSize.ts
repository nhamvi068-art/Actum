/**
 * 常用尺寸项接口
 */
export interface CommonSizeItem {
  sizeId: string;          // 尺寸唯一ID
  sizeName: string;        // 尺寸名称（如"A4 竖版""电商主图800×800"）
  width: number;           // 宽度（像素）
  height: number;          // 高度（像素）
  unit: 'px' | 'mm';       // 单位（像素/毫米，mm用于打印场景）
  category: 'print' | 'social' | 'ecommerce' | 'custom'; // 尺寸分类
  isDefault?: boolean;     // 是否为默认选中尺寸
}



