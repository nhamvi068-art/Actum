import { useState, useCallback, useRef, useEffect } from 'react';
import { CropBox } from './ImageCropOverlay';

export interface ImageCropState {
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

export const useImageCrop = (imageUrl: string) => {
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [state, setState] = useState<ImageCropState>({
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

  // Load image and initialize crop box
  useEffect(() => {
    if (!imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = () => {
      imageRef.current = img;

      // Calculate initial scale to fit in view
      const maxWidth = window.innerWidth * 0.6;
      const maxHeight = window.innerHeight * 0.6;
      const scaleX = maxWidth / img.width;
      const scaleY = maxHeight / img.height;
      const cropScale = Math.min(scaleX, scaleY, 1);

      setState(prev => ({
        ...prev,
        imageWidth: img.width,
        imageHeight: img.height,
        cropBox: {
          x: 0,
          y: 0,
          width: img.width,
          height: img.height
        },
        cropScale,
        rotateDegree: 0,
        flipHorizontal: false,
        flipVertical: false,
      }));
      setImageLoaded(true);
    };

    img.onerror = () => {
      console.error('Failed to load image');
    };
  }, [imageUrl]);

  // Handle rotate
  const handleRotate = useCallback(() => {
    setState(prev => ({
      ...prev,
      rotateDegree: (prev.rotateDegree + 90) % 360
    }));
  }, []);

  // Handle flip horizontal
  const handleFlipHorizontal = useCallback(() => {
    setState(prev => ({
      ...prev,
      flipHorizontal: !prev.flipHorizontal
    }));
  }, []);

  // Handle flip vertical
  const handleFlipVertical = useCallback(() => {
    setState(prev => ({
      ...prev,
      flipVertical: !prev.flipVertical
    }));
  }, []);

  // Handle crop ratio change
  const handleCropRatioChange = useCallback((ratioKey: string, ratioValue: number) => {
    setState(prev => {
      let newBox = { ...prev.cropBox };

      if (ratioValue > 0) {
        const imgWidth = prev.rotateDegree % 180 !== 0 ? prev.imageHeight : prev.imageWidth;
        const imgHeight = prev.rotateDegree % 180 !== 0 ? prev.imageWidth : prev.imageHeight;

        newBox.width = Math.min(imgWidth, imgWidth);
        newBox.height = newBox.width / ratioValue;
        newBox.x = (imgWidth - newBox.width) / 2;
        newBox.y = (imgHeight - newBox.height) / 2;
      }

      return {
        ...prev,
        cropRatio: ratioKey,
        cropRatioValue: ratioValue,
        cropBox: newBox
      };
    });
  }, []);

  // Handle crop box change
  const handleCropBoxChange = useCallback((newBox: CropBox) => {
    setState(prev => ({
      ...prev,
      cropBox: newBox
    }));
  }, []);

  // Apply crop and return the cropped image
  const applyCrop = useCallback((): string | null => {
    if (!imageRef.current) return null;

    const { imageWidth, imageHeight, cropBox, rotateDegree, flipHorizontal, flipVertical } = state;

    // Determine if we're rotated 90 or 270 degrees
    const isRotated = rotateDegree % 180 !== 0;

    // The display dimensions (what the user sees on screen)
    // After rotation, display dimensions are swapped
    const displayWidth = isRotated ? imageHeight : imageWidth;
    const displayHeight = isRotated ? imageWidth : imageHeight;

    // Scale factor from display coordinates to original image coordinates
    // cropBox now uses display dimensions, so we need this to map back
    const scaleX = imageWidth / displayWidth;
    const scaleY = imageHeight / displayHeight;

    // Map cropBox from display coordinates to original image coordinates
    // For rotated images (90/270), x/y are swapped due to dimension swap
    let srcX: number, srcY: number, srcW: number, srcH: number;
    
    if (isRotated) {
      // When rotated 90/270 degrees:
      // - display x maps to original y
      // - display y maps to original x (inverted)
      srcX = cropBox.y * scaleY;
      srcY = (displayHeight - cropBox.y - cropBox.height) * scaleX;
      srcW = cropBox.height * scaleY;
      srcH = cropBox.width * scaleX;
    } else {
      // No rotation: straightforward mapping
      srcX = cropBox.x * scaleX;
      srcY = cropBox.y * scaleY;
      srcW = cropBox.width * scaleX;
      srcH = cropBox.height * scaleY;
    }

    // Create canvas for cropping with output dimensions
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Output dimensions should match crop box (in display coordinates)
    // After rotation, swap width/height for output
    canvas.width = isRotated ? cropBox.height : cropBox.width;
    canvas.height = isRotated ? cropBox.width : cropBox.height;

    // Apply transformations
    ctx.save();

    // Move to center
    ctx.translate(canvas.width / 2, canvas.height / 2);

    // Apply rotation
    ctx.rotate((rotateDegree * Math.PI) / 180);

    // Apply flip
    ctx.scale(
      flipHorizontal ? -1 : 1,
      flipVertical ? -1 : 1
    );

    // Draw the cropped portion of the image
    // We draw the original image, centered at the canvas center
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

  // Reset state
  const reset = useCallback(() => {
    if (!imageRef.current) return;

    const img = imageRef.current;
    const maxWidth = window.innerWidth * 0.6;
    const maxHeight = window.innerHeight * 0.6;
    const scaleX = maxWidth / img.width;
    const scaleY = maxHeight / img.height;
    const cropScale = Math.min(scaleX, scaleY, 1);

    setState(prev => ({
      ...prev,
      cropBox: {
        x: 0,
        y: 0,
        width: img.width,
        height: img.height
      },
      cropScale,
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
    handleRotate,
    handleFlipHorizontal,
    handleFlipVertical,
    handleCropRatioChange,
    handleCropBoxChange,
    applyCrop,
    reset,
  };
};

