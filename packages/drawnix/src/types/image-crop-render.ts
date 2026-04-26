import { PlaitImage, PlaitImageWithCrop, ImageCropData } from './image-crop';

/**
 * 检查元素是否有裁剪数据
 */
export function hasCropData(element: PlaitImage): element is PlaitImageWithCrop {
    return !!(element as any).crop;
}

/**
 * 获取图片的裁剪数据
 */
export function getCropData(element: PlaitImage): ImageCropData | undefined {
    return (element as PlaitImageWithCrop).crop;
}

/**
 * 检查裁剪数据是否有效
 */
export function isValidCropData(crop: ImageCropData): boolean {
    return (
        crop.x >= 0 &&
        crop.y >= 0 &&
        crop.width > 0 &&
        crop.height > 0 &&
        crop.x + crop.width <= 1 &&
        crop.y + crop.height <= 1
    );
}

/**
 * 裁剪渲染辅助函数
 * 使用 Canvas API 的 9 参数 drawImage 进行裁剪渲染
 *
 * @param ctx Canvas 2D 渲染上下文
 * @param img 图片元素 (HTMLImageElement 或 CanvasImageSource)
 * @param targetX 目标绘制 X 坐标
 * @param targetY 目标绘制 Y 坐标
 * @param targetWidth 目标绘制宽度
 * @param targetHeight 目标绘制高度
 * @param crop 裁剪数据 (相对于原图的比例 0-1)
 */
export function drawCroppedImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    targetX: number,
    targetY: number,
    targetWidth: number,
    targetHeight: number,
    crop: ImageCropData
): void {
    if (!isValidCropData(crop)) {
        // 裁剪数据无效，执行普通绘制
        ctx.drawImage(img, targetX, targetY, targetWidth, targetHeight);
        return;
    }

    const srcX = crop.x * img.naturalWidth;
    const srcY = crop.y * img.naturalHeight;
    const srcW = crop.width * img.naturalWidth;
    const srcH = crop.height * img.naturalHeight;

    ctx.drawImage(
        img,
        srcX, srcY, srcW, srcH,    // 源图截取区域
        targetX, targetY, targetWidth, targetHeight  // 目标绘制区域
    );
}

/**
 * 创建裁剪图片的 Clip Path
 * 用于 SVG 渲染模式
 *
 * @param element 图片元素
 * @returns SVG clipPath 元素或 null
 */
export function createCropClipPath(
    element: PlaitImage,
    originX: number,
    originY: number,
    width: number,
    height: number
): SVGClipPathElement | null {
    const crop = getCropData(element);
    if (!crop || !isValidCropData(crop)) {
        return null;
    }

    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

    // 根据裁剪比例计算裁剪框的位置和尺寸
    const cropX = originX + (crop.x * width);
    const cropY = originY + (crop.y * height);
    const cropWidth = crop.width * width;
    const cropHeight = crop.height * height;

    rect.setAttribute('x', String(cropX));
    rect.setAttribute('y', String(cropY));
    rect.setAttribute('width', String(cropWidth));
    rect.setAttribute('height', String(cropHeight));

    clipPath.appendChild(rect);

    return clipPath;
}

/**
 * 裁剪渲染 Hook
 * 提供了在自定义插件中集成裁剪渲染的辅助函数
 *
 * 使用方法：
 * 1. 在你的插件中导入这个 hook
 * 2. 在 drawElement 处理函数中，根据元素是否有 crop 属性来决定渲染方式
 *
 * 示例：
 * ```ts
 * import { useImageCropRender } from '../types/image-crop-render';
 *
 * board.drawElement = (context) => {
 *   const { element, host } = context;
 *
 *   if (PlaitDrawElement.isImage(element)) {
 *     const cropData = getCropData(element);
 *     if (cropData) {
 *       // 使用裁剪渲染
 *       const draws = host.svg.drawElement(element); // 先获取默认的 SVG 元素
 *       // 应用裁剪...
 *       return draws;
 *     }
 *   }
 *
 *   return drawElement(context);
 * }
 * ```
 */
export const useImageCropRender = () => {
    return {
        hasCropData,
        getCropData,
        isValidCropData,
        drawCroppedImage,
        createCropClipPath,
    };
};

export default useImageCropRender;