import { useState, useCallback, useRef, useEffect } from 'react';
import { CropBox } from './ImageCropOverlay';

export interface CropOnCanvasState {
  isCropping: boolean;
  cropImageUrl: string | null;
  originalImageUrl: string;
  originalImageElement: any | null;
  imageWidth: number;
  imageHeight: number;
  cropBox: CropBox;
  cropScale: number;
  rotateDegree: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  cropRatio: string;
  cropRatioValue: number;
}

export const useImageCropOnCanvas = () => {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const boardRef = useRef<any>(null);

  const [state, setState] = useState<CropOnCanvasState>({
    isCropping: false,
    cropImageUrl: null,
    originalImageUrl: '',
    originalImageElement: null,
    imageWidth: 0,
    imageHeight: 0,
    cropBox: { x: 0, y: 0, width: 0, height: 0 },
    cropScale: 1,
    rotateDegree: 0,
    flipHorizontal: false,
    flipVertical: false,
    cropRatio: 'free',
    cropRatioValue: 0,
  });

  const [imageLoaded, setImageLoaded] = useState(false);

  // 进入裁剪模式
  const enterCropMode = useCallback((imageUrl: string, imageElement: any, existingCrop?: { x: number; y: number; width: number; height: number }) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = () => {
      imageRef.current = img;

      // 1. 获取元素当前在画布上的物理宽高 (残缺的物理尺寸)
      const currentPhysicalWidth = imageElement.width || (imageElement.points[1][0] - imageElement.points[0][0]);
      const currentPhysicalHeight = imageElement.height || (imageElement.points[1][1] - imageElement.points[0][1]);

      let fullDisplayedWidth = currentPhysicalWidth;
      let fullDisplayedHeight = currentPhysicalHeight;
      let startCropX = 0;
      let startCropY = 0;

      // 2. 核心修复：如果存在 existingCrop，逆推这张图"没被裁剪时"的完整物理显示尺寸
      if (existingCrop && existingCrop.width > 0 && existingCrop.height > 0) {
        fullDisplayedWidth = currentPhysicalWidth / existingCrop.width;
        fullDisplayedHeight = currentPhysicalHeight / existingCrop.height;
        startCropX = fullDisplayedWidth * existingCrop.x;
        startCropY = fullDisplayedHeight * existingCrop.y;
      }

      // 3. 设置初始裁剪框 (完美贴合当前的物理尺寸)
      const initialCropBox: CropBox = {
        x: startCropX,
        y: startCropY,
        width: currentPhysicalWidth,
        height: currentPhysicalHeight,
      };

      setState({
        isCropping: true,
        cropImageUrl: imageUrl,
        originalImageUrl: imageUrl,
        originalImageElement: imageElement,
        imageWidth: fullDisplayedWidth,
        imageHeight: fullDisplayedHeight,
        cropBox: initialCropBox,
        cropScale: 1,
        rotateDegree: 0,
        flipHorizontal: false,
        flipVertical: false,
        cropRatio: 'free',
        cropRatioValue: 0,
      });
      setImageLoaded(true);
    };

    img.onerror = () => {
      console.error('Failed to load image for cropping');
    };
  }, []);

  // 退出裁剪模式
  const exitCropMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      isCropping: false,
      cropImageUrl: null,
    }));
    setImageLoaded(false);
  }, []);

  // 旋转
  const handleRotate = useCallback(() => {
    setState(prev => ({
      ...prev,
      rotateDegree: (prev.rotateDegree + 90) % 360,
    }));
  }, []);

  // 水平翻转
  const handleFlipHorizontal = useCallback(() => {
    setState(prev => ({
      ...prev,
      flipHorizontal: !prev.flipHorizontal,
    }));
  }, []);

  // 垂直翻转
  const handleFlipVertical = useCallback(() => {
    setState(prev => ({
      ...prev,
      flipVertical: !prev.flipVertical,
    }));
  }, []);

  // 裁剪比例变更
  const handleCropRatioChange = useCallback((ratioKey: string, ratioValue: number) => {
    setState(prev => {
      let newBox = { ...prev.cropBox };

      if (ratioValue > 0) {
        const isRotated = prev.rotateDegree % 180 !== 0;
        const imgWidth = isRotated ? prev.imageHeight : prev.imageWidth;
        const imgHeight = isRotated ? prev.imageWidth : prev.imageHeight;

        newBox.width = imgWidth;
        newBox.height = newBox.width / ratioValue;
        newBox.x = 0;
        newBox.y = (imgHeight - newBox.height) / 2;
      }

      return {
        ...prev,
        cropRatio: ratioKey,
        cropRatioValue: ratioValue,
        cropBox: newBox,
      };
    });
  }, []);

  // 裁剪框变更
  const handleCropBoxChange = useCallback((newBox: CropBox) => {
    setState(prev => ({
      ...prev,
      cropBox: newBox,
    }));
  }, []);

  // 执行裁剪并返回裁剪后的 Base64
  const applyCrop = useCallback((): string | null => {
    if (!imageRef.current) return null;

    const { imageWidth, imageHeight, cropBox, rotateDegree, flipHorizontal, flipVertical } = state;

    const isRotated = rotateDegree % 180 !== 0;
    const displayWidth = isRotated ? imageHeight : imageWidth;
    const displayHeight = isRotated ? imageWidth : imageHeight;

    const scaleX = imageWidth / displayWidth;
    const scaleY = imageHeight / displayHeight;

    let srcX: number, srcY: number, srcW: number, srcH: number;

    if (isRotated) {
      srcX = cropBox.y * scaleY;
      srcY = (displayHeight - cropBox.y - cropBox.height) * scaleX;
      srcW = cropBox.height * scaleY;
      srcH = cropBox.width * scaleX;
    } else {
      srcX = cropBox.x * scaleX;
      srcY = cropBox.y * scaleY;
      srcW = cropBox.width * scaleX;
      srcH = cropBox.height * scaleY;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = isRotated ? cropBox.height : cropBox.width;
    canvas.height = isRotated ? cropBox.width : cropBox.height;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotateDegree * Math.PI) / 180);
    ctx.scale(
      flipHorizontal ? -1 : 1,
      flipVertical ? -1 : 1
    );

    ctx.drawImage(
      imageRef.current,
      srcX - imageWidth / 2,
      srcY - imageHeight / 2,
      srcW,
      srcH
    );

    ctx.restore();

    return canvas.toDataURL('image/png');
  }, [state]);

  // 重置
  const reset = useCallback(() => {
    if (!imageRef.current) return;

    const img = imageRef.current;

    setState(prev => ({
      ...prev,
      cropBox: {
        x: 0,
        y: 0,
        width: img.width,
        height: img.height,
      },
      rotateDegree: 0,
      flipHorizontal: false,
      flipVertical: false,
      cropRatio: 'free',
      cropRatioValue: 0,
    }));
  }, []);

  return {
    state,
    imageLoaded,
    enterCropMode,
    exitCropMode,
    handleRotate,
    handleFlipHorizontal,
    handleFlipVertical,
    handleCropRatioChange,
    handleCropBoxChange,
    applyCrop,
    reset,
    imageRef,
  };
};
