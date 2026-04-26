// 图片对象的核心类型定义
// 【重要】此接口使用平铺的 width/height，而非嵌套的 size 对象
export interface CanvasImageItem {
  id: string; // 唯一标识（编辑时定位图片）
  assetId: string; // IndexedDB 资产 ID（持久保存）
  url?: string; // 运行时 URL（由 assetId 转换，不持久保存）
  prompt?: string; // 生成 prompt（可选，支持编辑修改）
  position?: { x: number; y: number }; // 位置（可选，编辑时可调整）
  width: number; // 图片宽度
  height: number; // 图片高度
}
