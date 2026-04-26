import { PlaitBoard, PlaitImage, PlaitPluginElementContext, drawElement, PlaitDrawElement } from '@plait/draw';
import { getCropData, isValidCropData } from './image-crop-render';

/**
 * 图片裁剪插件
 * 通过拦截 board.drawElement 来实现非破坏性裁剪的渲染
 *
 * 工作原理：
 * 1. 当检测到图片元素有 crop 属性时，在图片渲染完成后叠加一层 Canvas
 * 2. Canvas 使用裁剪坐标进行绘制，显示裁剪效果
 * 3. 这样既保留了原图数据，又能在 UI 上实时显示裁剪结果
 */
export const withImageCrop = (board: PlaitBoard) => {
    const originalDrawElement = board.drawElement;

    board.drawElement = (context: PlaitPluginElementContext) => {
        const { element } = context;

        // 检查是否为图片元素
        if (PlaitDrawElement.isImage(element)) {
            const cropData = getCropData(element as PlaitImage);

            // 如果有有效的裁剪数据，添加标记以便后续处理
            if (cropData && isValidCropData(cropData)) {
                // 在元素上添加标记，供其他扩展点使用
                (element as any).__hasCrop = true;
                (element as any).__cropData = cropData;
            } else {
                (element as any).__hasCrop = false;
                (element as any).__cropData = undefined;
            }
        }

        // 调用原始的 drawElement
        return originalDrawElement(context);
    };

    return board;
};

/**
 * 从图片元素获取裁剪数据
 */
export function getElementCropData(element: PlaitImage): { x: number; y: number; width: number; height: number } | null {
    const crop = getCropData(element);
    if (!crop || !isValidCropData(crop)) {
        return null;
    }
    return crop;
}

/**
 * 应用裁剪到 Canvas 渲染上下文
 * 在图片渲染后调用此函数来显示裁剪效果
 *
 * @param ctx Canvas 渲染上下文
 * @param img 图片元素
 * @param x 图片在 canvas 上的 x 坐标
 * @param y 图片在 canvas 上的 y 坐标
 * @param width 图片在 canvas 上的宽度
 * @param height 图片在 canvas 上的高度
 * @param crop 裁剪数据 (0-1 比例)
 */
export function applyCropToCanvas(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    crop: { x: number; y: number; width: number; height: number }
): void {
    if (!crop || !isValidCropData(crop)) {
        return;
    }

    // 计算裁剪区域
    const srcX = crop.x * img.naturalWidth;
    const srcY = crop.y * img.naturalHeight;
    const srcWidth = crop.width * img.naturalWidth;
    const srcHeight = crop.height * img.naturalHeight;

    // 使用 9 参数 drawImage 进行裁剪绘制
    ctx.drawImage(
        img,
        srcX, srcY, srcWidth, srcHeight,  // 源图像区域
        x, y, width, height               // 目标画布区域
    );
}

export default withImageCrop;