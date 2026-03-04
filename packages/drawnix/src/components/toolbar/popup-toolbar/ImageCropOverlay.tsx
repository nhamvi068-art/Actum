import React, { useRef, useEffect, useCallback } from 'react';
import './ImageCropOverlay.css';

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageCropOverlayProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  cropBox: CropBox;
  cropScale: number;
  rotateDegree: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  cropRatioValue: number;
  onCropBoxChange: (cropBox: CropBox) => void;
}

export const ImageCropOverlay: React.FC<ImageCropOverlayProps> = ({
  imageUrl,
  imageWidth,
  imageHeight,
  cropBox,
  cropScale,
  rotateDegree,
  flipHorizontal,
  flipVertical,
  cropRatioValue,
  onCropBoxChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    isDragging: boolean;
    dragType: 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-w' | 'resize-e' | null;
    dragStart: { x: number; y: number };
    cropBox: CropBox;
  }>({
    isDragging: false,
    dragType: null,
    dragStart: { x: 0, y: 0 },
    cropBox: { x: 0, y: 0, width: 0, height: 0 }
  });

  // 计算显示尺寸
  // 注意：imageWidth/imageHeight 现在已经是处理过旋转的显示尺寸
  // (popup-toolbar.tsx 中的 useEffect 会在旋转变化时更新 displayDimensions)
  // 所以这里不再需要 getRotatedDimensions 来处理旋转
  const getRotatedDimensions = useCallback(() => {
    return { width: imageWidth, height: imageHeight };
  }, [imageWidth, imageHeight]);

  // 计算显示尺寸 - 直接使用传入的尺寸（已经考虑旋转）
  const displayDimensions = getRotatedDimensions();
  const displayWidth = displayDimensions.width * cropScale;
  const displayHeight = displayDimensions.height * cropScale;

  // 处理鼠标按下事件
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const boxX = cropBox.x;
    const boxY = cropBox.y;
    const boxWidth = cropBox.width;
    const boxHeight = cropBox.height;

    const cornerTolerance = 20;
    const edgeTolerance = 15;
    let dragType: typeof dragRef.current.dragType = null;

    // 4个角
    if (Math.abs(mouseX - (boxX + boxWidth)) < cornerTolerance && Math.abs(mouseY - (boxY + boxHeight)) < cornerTolerance) {
      dragType = 'resize-se';
    } else if (Math.abs(mouseX - boxX) < cornerTolerance && Math.abs(mouseY - boxY) < cornerTolerance) {
      dragType = 'resize-nw';
    } else if (Math.abs(mouseX - (boxX + boxWidth)) < cornerTolerance && Math.abs(mouseY - boxY) < cornerTolerance) {
      dragType = 'resize-ne';
    } else if (Math.abs(mouseX - boxX) < cornerTolerance && Math.abs(mouseY - (boxY + boxHeight)) < cornerTolerance) {
      dragType = 'resize-sw';
    }
    // 4个边
    else if (Math.abs(mouseY - boxY) < edgeTolerance && mouseX >= boxX && mouseX <= boxX + boxWidth) {
      dragType = 'resize-n';
    } else if (Math.abs(mouseY - (boxY + boxHeight)) < edgeTolerance && mouseX >= boxX && mouseX <= boxX + boxWidth) {
      dragType = 'resize-s';
    } else if (Math.abs(mouseX - boxX) < edgeTolerance && mouseY >= boxY && mouseY <= boxY + boxHeight) {
      dragType = 'resize-w';
    } else if (Math.abs(mouseX - (boxX + boxWidth)) < edgeTolerance && mouseY >= boxY && mouseY <= boxY + boxHeight) {
      dragType = 'resize-e';
    }
    // 移动裁剪框
    else if (mouseX >= boxX && mouseX <= boxX + boxWidth && mouseY >= boxY && mouseY <= boxY + boxHeight) {
      dragType = 'move';
    }

    if (dragType) {
      dragRef.current.isDragging = true;
      dragRef.current.dragType = dragType;
      dragRef.current.dragStart = { x: mouseX, y: mouseY };
      dragRef.current.cropBox = { ...cropBox };
    }
  }, [cropBox, cropScale]);

  // 处理鼠标移动事件
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging || !containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const dx = mouseX - dragRef.current.dragStart.x;
      const dy = mouseY - dragRef.current.dragStart.y;
      // 现在 cropBox 使用显示尺寸，所以直接使用 dx/dy，不需要除以 cropScale
      const dxOriginal = dx;
      const dyOriginal = dy;

      const currentBox = { ...dragRef.current.cropBox };
      const imgWidth = displayDimensions.width;
      const imgHeight = displayDimensions.height;

      switch (dragRef.current.dragType) {
        case 'move':
          currentBox.x = Math.max(0, Math.min(imgWidth - currentBox.width, currentBox.x + dxOriginal));
          currentBox.y = Math.max(0, Math.min(imgHeight - currentBox.height, currentBox.y + dyOriginal));
          break;
        case 'resize-se':
          currentBox.width = Math.max(50, currentBox.width + dxOriginal);
          if (cropRatioValue > 0) {
            currentBox.height = currentBox.width / cropRatioValue;
          } else {
            currentBox.height = Math.max(50, currentBox.height + dyOriginal);
          }
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          break;
        case 'resize-nw':
          currentBox.x = Math.max(0, currentBox.x + dxOriginal);
          currentBox.y = Math.max(0, currentBox.y + dyOriginal);
          currentBox.width = Math.max(50, currentBox.width - dxOriginal);
          if (cropRatioValue > 0) {
            currentBox.height = currentBox.width / cropRatioValue;
          } else {
            currentBox.height = Math.max(50, currentBox.height - dyOriginal);
          }
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          break;
        case 'resize-ne':
          currentBox.width = Math.max(50, currentBox.width + dxOriginal);
          currentBox.y = Math.max(0, currentBox.y + dyOriginal);
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          if (cropRatioValue > 0) {
            currentBox.height = currentBox.width / cropRatioValue;
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          } else {
            currentBox.height = Math.max(50, currentBox.height - dyOriginal);
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          }
          break;
        case 'resize-sw':
          currentBox.x = Math.max(0, currentBox.x + dxOriginal);
          currentBox.width = Math.max(50, currentBox.width - dxOriginal);
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          if (cropRatioValue > 0) {
            currentBox.height = currentBox.width / cropRatioValue;
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          } else {
            currentBox.height = Math.max(50, currentBox.height + dyOriginal);
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          }
          break;
        case 'resize-n':
          currentBox.y = Math.max(0, currentBox.y + dyOriginal);
          if (cropRatioValue > 0) {
            currentBox.height = currentBox.width / cropRatioValue;
          } else {
            currentBox.height = Math.max(50, currentBox.height - dyOriginal);
          }
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          break;
        case 'resize-s':
          if (cropRatioValue > 0) {
            currentBox.height = currentBox.width / cropRatioValue;
          } else {
            currentBox.height = Math.max(50, currentBox.height + dyOriginal);
          }
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          break;
        case 'resize-w':
          currentBox.x = Math.max(0, currentBox.x + dxOriginal);
          currentBox.width = Math.max(50, currentBox.width - dxOriginal);
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          if (cropRatioValue > 0) {
            currentBox.height = currentBox.width / cropRatioValue;
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          }
          break;
        case 'resize-e':
          currentBox.width = Math.max(50, currentBox.width + dxOriginal);
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          if (cropRatioValue > 0) {
            currentBox.height = currentBox.width / cropRatioValue;
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          }
          break;
      }

      onCropBoxChange(currentBox);
      dragRef.current.cropBox = currentBox;
      dragRef.current.dragStart = { x: mouseX, y: mouseY };
    };

    const handleMouseUp = () => {
      dragRef.current.isDragging = false;
      dragRef.current.dragType = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [cropScale, cropRatioValue, displayDimensions, onCropBoxChange]);

  // 计算裁剪框的显示位置 - 直接使用原始坐标
  const boxStyle: React.CSSProperties = {
    left: cropBox.x,
    top: cropBox.y,
    width: cropBox.width,
    height: cropBox.height,
  };

  // 计算翻转样式 - 拉伸填满容器
  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    transform: `rotate(${rotateDegree}deg) scaleX(${flipHorizontal ? -1 : 1}) scaleY(${flipVertical ? -1 : 1})`,
    transformOrigin: 'center center',
  };

  // 更新鼠标光标 - 直接使用原始坐标
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.isDragging) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const boxX = cropBox.x;
    const boxY = cropBox.y;
    const boxWidth = cropBox.width;
    const boxHeight = cropBox.height;

    const tolerance = 15;

    let cursor = 'default';

    // 4个角
    if (Math.abs(mouseX - (boxX + boxWidth)) < tolerance && Math.abs(mouseY - (boxY + boxHeight)) < tolerance) {
      cursor = 'nwse-resize';
    } else if (Math.abs(mouseX - boxX) < tolerance && Math.abs(mouseY - boxY) < tolerance) {
      cursor = 'nwse-resize';
    } else if (Math.abs(mouseX - (boxX + boxWidth)) < tolerance && Math.abs(mouseY - boxY) < tolerance) {
      cursor = 'nesw-resize';
    } else if (Math.abs(mouseX - boxX) < tolerance && Math.abs(mouseY - (boxY + boxHeight)) < tolerance) {
      cursor = 'nesw-resize';
    }
    // 4个边
    else if (Math.abs(mouseY - boxY) < tolerance && mouseX >= boxX && mouseX <= boxX + boxWidth) {
      cursor = 'ns-resize';
    } else if (Math.abs(mouseY - (boxY + boxHeight)) < tolerance && mouseX >= boxX && mouseX <= boxX + boxWidth) {
      cursor = 'ns-resize';
    } else if (Math.abs(mouseX - boxX) < tolerance && mouseY >= boxY && mouseY <= boxY + boxHeight) {
      cursor = 'ew-resize';
    } else if (Math.abs(mouseX - (boxX + boxWidth)) < tolerance && mouseY >= boxY && mouseY <= boxY + boxHeight) {
      cursor = 'ew-resize';
    }
    // 移动裁剪框内部
    else if (mouseX >= boxX && mouseX <= boxX + boxWidth && mouseY >= boxY && mouseY <= boxY + boxHeight) {
      cursor = 'move';
    }

    container.style.cursor = cursor;
  }, [cropBox, cropScale]);

  return (
    <div
      ref={containerRef}
      className="image-crop-overlay"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
    >
      {/* 图片层 */}
      <img
        src={imageUrl}
        alt="crop"
        className="crop-image"
        style={imageStyle}
        draggable={false}
      />

      {/* 裁剪框 */}
      <div className="crop-box" style={boxStyle}>
        {/* 遮罩层 - 使用四个矩形实现 */}
        <div className="crop-mask crop-mask-top" style={{
          top: 0,
          left: 0,
          right: 0,
          height: cropBox.y,
        }} />
        <div className="crop-mask crop-mask-bottom" style={{
          bottom: 0,
          left: 0,
          right: 0,
          height: 'auto',
          top: cropBox.y + cropBox.height,
        }} />
        <div className="crop-mask crop-mask-left" style={{
          top: cropBox.y,
          left: 0,
          width: cropBox.x,
          height: cropBox.height,
        }} />
        <div className="crop-mask crop-mask-right" style={{
          top: cropBox.y,
          right: 0,
          width: 'auto',
          left: cropBox.x + cropBox.width,
          height: cropBox.height,
        }} />

        {/* 边框 */}
        <div className="crop-border" />

        {/* 网格线 */}
        <div className="crop-grid">
          <div className="crop-grid-line crop-grid-line-v1" />
          <div className="crop-grid-line crop-grid-line-v2" />
          <div className="crop-grid-line crop-grid-line-h1" />
          <div className="crop-grid-line crop-grid-line-h2" />
        </div>

        {/* 控制点 - 8个 */}
        <div className="crop-handle crop-handle-nw" />
        <div className="crop-handle crop-handle-ne" />
        <div className="crop-handle crop-handle-sw" />
        <div className="crop-handle crop-handle-se" />
        <div className="crop-handle crop-handle-n" />
        <div className="crop-handle crop-handle-s" />
        <div className="crop-handle crop-handle-w" />
        <div className="crop-handle crop-handle-e" />
      </div>
    </div>
  );
};

export default ImageCropOverlay;

