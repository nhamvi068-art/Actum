/**
 * Photo Wall Layout Engine
 * 计算多图合并时的网格布局
 */

export interface LayoutItem {
  /** 图片 URL */
  url: string;
  /** 图片 ID */
  id: string;
  /** 原始宽度 */
  originalWidth: number;
  /** 原始高度 */
  originalHeight: number;
  /** 绘制位置 X */
  x: number;
  /** 绘制位置 Y */
  y: number;
  /** 绘制宽度 */
  width: number;
  /** 绘制高度 */
  height: number;
  /** 原始图片实际宽度（用于保持清晰度） */
  actualImageWidth?: number;
  /** 原始图片实际高度（用于保持清晰度） */
  actualImageHeight?: number;
}

export interface GridLayoutOptions {
  /** 每个格子的固定大小，默认 300px */
  cellSize?: number;
  /** 格子之间的间距，默认 10px */
  gap?: number;
  /** 背景颜色，默认白色 */
  backgroundColor?: string;
  /** 适应模式：contain(包含) 或 cover(覆盖)，默认 cover */
  fitMode?: 'contain' | 'cover';
  /** 最大列数，默认 0 表示自动计算 */
  maxColumns?: number;
  /** 最大行数，默认 0 表示自动计算 */
  maxRows?: number;
}

export interface LayoutResult {
  /** 网格总宽度 */
  totalWidth: number;
  /** 网格总高度 */
  totalHeight: number;
  /** 网格列数 */
  columns: number;
  /** 网格行数 */
  rows: number;
  /** 每个格子的尺寸 */
  cellSize: number;
  /** 格子间距 */
  gap: number;
  /** 背景颜色 */
  backgroundColor: string;
  /** 适应模式 */
  fitMode: 'contain' | 'cover';
  /** 每个图片的布局信息 */
  layout: LayoutItem[];
}

const DEFAULT_OPTIONS: Required<GridLayoutOptions> = {
  cellSize: 300,
  gap: 10,
  backgroundColor: '#ffffff',
  fitMode: 'cover',
  maxColumns: 0,
  maxRows: 0,
};

/**
 * 计算最佳网格布局
 * @param images 图片数组，每个图片包含宽高和 URL
 * @param options 布局选项
 * @returns 布局结果
 */
export function calculatePhotoWallLayout(
  images: { id: string; width: number; height: number; url: string }[],
  options?: GridLayoutOptions
): LayoutResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const count = images.length;

  if (count === 0) {
    return {
      totalWidth: 0,
      totalHeight: 0,
      columns: 0,
      rows: 0,
      cellSize: opts.cellSize,
      gap: opts.gap,
      backgroundColor: opts.backgroundColor,
      fitMode: opts.fitMode,
      layout: [],
    };
  }

  // 计算最佳列数和行数
  const { cols, rows } = calculateGridDimensions(count, opts.maxColumns, opts.maxRows);

  // 计算每个格子的尺寸（考虑间距）
  const totalWidth = cols * opts.cellSize + (cols - 1) * opts.gap;
  const totalHeight = rows * opts.cellSize + (rows - 1) * opts.gap;

  // 为每张图片计算布局
  const layout: LayoutItem[] = images.map((img, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    return {
      url: img.url,
      id: img.id,
      originalWidth: img.width,
      originalHeight: img.height,
      x: col * (opts.cellSize + opts.gap),
      y: row * (opts.cellSize + opts.gap),
      width: opts.cellSize,
      height: opts.cellSize,
    };
  });

  return {
    totalWidth,
    totalHeight,
    columns: cols,
    rows,
    cellSize: opts.cellSize,
    gap: opts.gap,
    backgroundColor: opts.backgroundColor,
    fitMode: opts.fitMode,
    layout,
  };
}

/**
 * 计算网格的列数和行数
 * 优先使用接近正方形的布局
 */
function calculateGridDimensions(
  count: number,
  maxColumns: number,
  maxRows: number
): { cols: number; rows: number } {
  // 如果指定了最大列数
  if (maxColumns > 0) {
    const cols = Math.min(maxColumns, count);
    const rows = Math.ceil(count / cols);
    return { cols, rows };
  }

  // 如果指定了最大行数
  if (maxRows > 0) {
    const rows = Math.min(maxRows, count);
    const cols = Math.ceil(count / rows);
    return { cols, rows };
  }

  // 自动计算：使用最接近正方形的布局
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  return { cols, rows };
}

/**
 * 计算 cover 模式下的裁切区域
 * 确保图片填满格子，保持宽高比
 */
export function calculateCoverCrop(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number
): { sx: number; sy: number; sWidth: number; sHeight: number } {
  const imageRatio = imageWidth / imageHeight;
  const targetRatio = targetWidth / targetHeight;

  let sWidth: number;
  let sHeight: number;
  let sx: number;
  let sy: number;

  if (imageRatio > targetRatio) {
    // 图片更宽，以高度为基准裁切宽度
    sHeight = imageHeight;
    sWidth = imageHeight * targetRatio;
    sx = (imageWidth - sWidth) / 2;
    sy = 0;
  } else {
    // 图片更高，以宽度为基准裁切高度
    sWidth = imageWidth;
    sHeight = imageWidth / targetRatio;
    sx = 0;
    sy = (imageHeight - sHeight) / 2;
  }

  return { sx, sy, sWidth, sHeight };
}

/**
 * 计算 contain 模式下的绘制区域
 * 确保图片完整显示在格子内，保持宽高比
 */
export function calculateContainDraw(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number
): { dx: number; dy: number; dWidth: number; dHeight: number } {
  const imageRatio = imageWidth / imageHeight;
  const targetRatio = targetWidth / targetHeight;

  let dWidth: number;
  let dHeight: number;

  if (imageRatio > targetRatio) {
    // 图片更宽，以宽度为基准
    dWidth = targetWidth;
    dHeight = targetWidth / imageRatio;
  } else {
    // 图片更高，以高度为基准
    dHeight = targetHeight;
    dWidth = targetHeight * imageRatio;
  }

  // 居中绘制
  const dx = (targetWidth - dWidth) / 2;
  const dy = (targetHeight - dHeight) / 2;

  return { dx, dy, dWidth, dHeight };
}

/**
 * 根据图片数量获取推荐的布局信息
 */
export function getRecommendedLayout(count: number): { cols: number; rows: number; description: string } {
  const recommendations: Record<number, { cols: number; rows: number; description: string }> = {
    1: { cols: 1, rows: 1, description: '单图展示' },
    2: { cols: 2, rows: 1, description: '并排两图' },
    3: { cols: 3, rows: 1, description: '三图横排' },
    4: { cols: 2, rows: 2, description: '2x2 网格' },
    5: { cols: 3, rows: 2, description: '3x2 网格' },
    6: { cols: 3, rows: 2, description: '3x2 网格' },
    7: { cols: 4, rows: 2, description: '4x2 网格' },
    8: { cols: 4, rows: 2, description: '4x2 网格' },
    9: { cols: 3, rows: 3, description: '3x3 网格' },
  };

  return recommendations[count] || {
    cols: Math.ceil(Math.sqrt(count)),
    rows: Math.ceil(count / Math.ceil(Math.sqrt(count))),
    description: `${count} 图网格`,
  };
}

/**
 * 计算所有图片的边界框
 */
function calculateBoundingBox(
  images: { x: number; y: number; width: number; height: number }[]
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const img of images) {
    minX = Math.min(minX, img.x);
    minY = Math.min(minY, img.y);
    maxX = Math.max(maxX, img.x + img.width);
    maxY = Math.max(maxY, img.y + img.height);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * 计算保持位置的布局（用于照片墙）
 * 每张图片保持原始位置和尺寸，按画板坐标合成一张完整图片
 *
 * @param images 图片数组，每个包含位置、尺寸和 URL
 * @param options 布局选项
 * @returns 布局结果
 */
export function calculatePositionPreservedLayout(
  images: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    url: string;
    actualImageWidth?: number;
    actualImageHeight?: number;
  }[],
  options?: { backgroundColor?: string; padding?: number }
): LayoutResult {
  const backgroundColor = options?.backgroundColor || '#ffffff';
  const padding = options?.padding || 0;

  if (images.length === 0) {
    return {
      totalWidth: 0,
      totalHeight: 0,
      columns: 0,
      rows: 0,
      cellSize: 0,
      gap: 0,
      backgroundColor,
      fitMode: 'cover',
      layout: [],
    };
  }

  // Step 1: 计算所有图片的边界框
  const bounds = calculateBoundingBox(images);

  // Step 2: 创建布局，每张图片保持原位置（转换为相对于边界框的坐标）
  const layout: LayoutItem[] = images.map((img) => ({
    url: img.url,
    id: img.id,
    originalWidth: img.width,
    originalHeight: img.height,
    x: img.x - bounds.minX + padding,
    y: img.y - bounds.minY + padding,
    width: img.width,
    height: img.height,
    actualImageWidth: img.actualImageWidth || img.width,
    actualImageHeight: img.actualImageHeight || img.height,
  }));

  return {
    totalWidth: bounds.width + padding * 2,
    totalHeight: bounds.height + padding * 2,
    columns: 1,
    rows: 1,
    cellSize: 0,
    gap: 0,
    backgroundColor,
    fitMode: 'contain',
    layout,
  };
}

/**
 * 高保真布局项（包含预加载的图片对象）
 */
export interface HighResLayoutItem {
  /** 预加载的图片对象 */
  imgElement: HTMLImageElement;
  /** 图片 ID */
  id: string;
  /** 绘制位置 X（放大后） */
  x: number;
  /** 绘制位置 Y（放大后） */
  y: number;
  /** 绘制宽度（放大后） */
  width: number;
  /** 绘制高度（放大后） */
  height: number;
}

/**
 * 高保真布局结果
 */
export interface HighResLayoutResult {
  /** Canvas 物理宽度（用于离屏绘制，乘以 maxScaleFactor） */
  canvasWidth: number;
  /** Canvas 物理高度（用于离屏绘制） */
  canvasHeight: number;
  /** 逻辑宽度（用于画板显示，与原 bounding box 一致） */
  logicalWidth: number;
  /** 逻辑高度（用于画板显示） */
  logicalHeight: number;
  /** 每张图片的布局信息 */
  layout: HighResLayoutItem[];
  /** 最大缩放因子 */
  maxScaleFactor: number;
}

/** 最大 Canvas 尺寸限制，防止内存溢出 */
const MAX_CANVAS_DIMENSION = 8000;

/**
 * 高保真布局计算
 * 先预加载所有图片获取真实分辨率，计算全局最大缩放因子，
 * 然后等比放大 Canvas 和绘制坐标，确保导出高清图片
 *
 * @param imagesInfo 图片信息数组
 * @param options 布局选项
 * @returns 高保真布局结果
 */
export async function calculateHighResLayout(
  imagesInfo: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    url: string;
  }[],
  options?: { backgroundColor?: string; padding?: number }
): Promise<HighResLayoutResult> {
  const padding = options?.padding || 0;

  if (imagesInfo.length === 0) {
    return {
      canvasWidth: 0,
      canvasHeight: 0,
      logicalWidth: 0,
      logicalHeight: 0,
      layout: [],
      maxScaleFactor: 1,
    };
  }

  // Step 1: 预加载所有图片，获取真实物理分辨率
  const loadedImages = await Promise.all(
    imagesInfo.map(
      (info) =>
        new Promise<{
          id: string;
          x: number;
          y: number;
          width: number;
          height: number;
          url: string;
          imgElement: HTMLImageElement;
          naturalWidth: number;
          naturalHeight: number;
        }>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            resolve({
              ...info,
              imgElement: img,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
            });
          };
          img.onerror = () => reject(new Error(`Failed to load image: ${info.url}`));
          img.src = info.url;
        })
    )
  );

  // Step 2: 计算全局最大缩放因子
  let maxScaleFactor = 1;
  for (const item of loadedImages) {
    const scaleX = item.naturalWidth / item.width;
    const scaleY = item.naturalHeight / item.height;
    const itemScale = Math.max(scaleX, scaleY);
    if (itemScale > maxScaleFactor) {
      maxScaleFactor = itemScale;
    }
  }

  // Step 3: 计算画板上的原始边界框
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const img of loadedImages) {
    minX = Math.min(minX, img.x);
    minY = Math.min(minY, img.y);
    maxX = Math.max(maxX, img.x + img.width);
    maxY = Math.max(maxY, img.y + img.height);
  }

  let boardTotalWidth = maxX - minX;
  let boardTotalHeight = maxY - minY;

  // Step 4: 安全限制 - 防止 Canvas 尺寸爆掉浏览器内存
  if (
    boardTotalWidth * maxScaleFactor > MAX_CANVAS_DIMENSION ||
    boardTotalHeight * maxScaleFactor > MAX_CANVAS_DIMENSION
  ) {
    const limitScaleX = MAX_CANVAS_DIMENSION / boardTotalWidth;
    const limitScaleY = MAX_CANVAS_DIMENSION / boardTotalHeight;
    maxScaleFactor = Math.min(limitScaleX, limitScaleY);
  }

  // Step 5: 计算物理尺寸和逻辑尺寸
  const canvasWidth = boardTotalWidth * maxScaleFactor + padding * 2;
  const canvasHeight = boardTotalHeight * maxScaleFactor + padding * 2;
  const logicalWidth = boardTotalWidth + padding * 2;
  const logicalHeight = boardTotalHeight + padding * 2;

  // Step 6: 生成高保真布局数据
  const layout: HighResLayoutItem[] = loadedImages.map((item) => ({
    imgElement: item.imgElement,
    id: item.id,
    x: (item.x - minX) * maxScaleFactor + padding,
    y: (item.y - minY) * maxScaleFactor + padding,
    width: item.width * maxScaleFactor,
    height: item.height * maxScaleFactor,
  }));

  return {
    canvasWidth,
    canvasHeight,
    logicalWidth,
    logicalHeight,
    layout,
    maxScaleFactor,
  };
}
