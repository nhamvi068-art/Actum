// 图片对象的核心类型定义
export interface ImagePosition {
  x: number; // 画布中X坐标（编辑时拖拽调整）
  y: number; // 画布中Y坐标（编辑时拖拽调整）
}

export interface ImageSize {
  width: number; // 编辑时调整的宽度
  height: number; // 编辑时调整的高度
}

export interface CanvasImageItem {
  id: string; // 唯一标识（编辑时定位图片）
  url: string; // 图片地址（编辑后不变，仅调整尺寸/位置）
  prompt: string; // 生成prompt（支持编辑修改）
  position: ImagePosition; // 位置（编辑时可调整）
  size: ImageSize; // 尺寸（核心编辑项：宽高）
}






