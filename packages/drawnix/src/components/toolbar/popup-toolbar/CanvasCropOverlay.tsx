import React, { useRef, useCallback, useEffect } from 'react';
import './CanvasCropOverlay.css';
import { CropBox } from './ImageCropOverlay';

export interface CanvasCropOverlayProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  screenBox: { x: number; y: number; width: number; height: number };
  cropBox: CropBox;
  onCropBoxChange: (cropBox: CropBox) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export const CanvasCropOverlay: React.FC<CanvasCropOverlayProps> = ({
  imageUrl,
  imageWidth,
  imageHeight,
  screenBox,
  cropBox,
  onCropBoxChange,
  onCancel,
  onConfirm,
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
    cropBox: { x: 0, y: 0, width: 0, height: 0 },
  });

  // 计算当前裁剪框相对于完整原图的百分比 (0 - 100)
  const percentX = imageWidth > 0 ? (cropBox.x / imageWidth) * 100 : 0;
  const percentY = imageHeight > 0 ? (cropBox.y / imageHeight) * 100 : 0;
  const percentW = imageWidth > 0 ? (cropBox.width / imageWidth) * 100 : 0;
  const percentH = imageHeight > 0 ? (cropBox.height / imageHeight) * 100 : 0;

  // ESC 键取消裁剪
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // 处理鼠标按下事件
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, dragType?: string) => {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let detectedDragType = dragType;

    // 如果没有传入 dragType，自动检测
    if (!detectedDragType) {
      const cropScreenX = (percentX / 100) * rect.width;
      const cropScreenY = (percentY / 100) * rect.height;
      const cropScreenW = (percentW / 100) * rect.width;
      const cropScreenH = (percentH / 100) * rect.height;

      const cornerTolerance = 12;
      const edgeTolerance = 8;

      const distToRight = Math.abs(mouseX - (cropScreenX + cropScreenW));
      const distToBottom = Math.abs(mouseY - (cropScreenY + cropScreenH));
      const distToLeft = Math.abs(mouseX - cropScreenX);
      const distToTop = Math.abs(mouseY - cropScreenY);

      if (distToRight < cornerTolerance && distToBottom < cornerTolerance) {
        detectedDragType = 'resize-se';
      } else if (distToLeft < cornerTolerance && distToTop < cornerTolerance) {
        detectedDragType = 'resize-nw';
      } else if (distToRight < cornerTolerance && distToTop < cornerTolerance) {
        detectedDragType = 'resize-ne';
      } else if (distToLeft < cornerTolerance && distToBottom < cornerTolerance) {
        detectedDragType = 'resize-sw';
      } else if (distToTop < edgeTolerance && mouseX >= cropScreenX && mouseX <= cropScreenX + cropScreenW) {
        detectedDragType = 'resize-n';
      } else if (distToBottom < edgeTolerance && mouseX >= cropScreenX && mouseX <= cropScreenX + cropScreenW) {
        detectedDragType = 'resize-s';
      } else if (distToLeft < edgeTolerance && mouseY >= cropScreenY && mouseY <= cropScreenY + cropScreenH) {
        detectedDragType = 'resize-w';
      } else if (distToRight < edgeTolerance && mouseY >= cropScreenY && mouseY <= cropScreenY + cropScreenH) {
        detectedDragType = 'resize-e';
      } else if (mouseX >= cropScreenX && mouseX <= cropScreenX + cropScreenW &&
               mouseY >= cropScreenY && mouseY <= cropScreenY + cropScreenH) {
        detectedDragType = 'move';
      }
    }

    if (detectedDragType) {
      dragRef.current.isDragging = true;
      dragRef.current.dragType = detectedDragType as any;
      dragRef.current.dragStart = { x: mouseX, y: mouseY };
      dragRef.current.cropBox = { ...cropBox };
    }
  }, [cropBox, percentX, percentY, percentW, percentH]);

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

      // 将屏幕像素偏移转换为逻辑像素偏移
      const scaleX = imageWidth / rect.width;
      const scaleY = imageHeight / rect.height;
      const dxOriginal = dx * scaleX;
      const dyOriginal = dy * scaleY;

      let currentBox = { ...dragRef.current.cropBox };
      const imgWidth = imageWidth;
      const imgHeight = imageHeight;
      const minSize = 20;

      switch (dragRef.current.dragType) {
        case 'move':
          currentBox.x = Math.max(0, Math.min(imgWidth - currentBox.width, currentBox.x + dxOriginal));
          currentBox.y = Math.max(0, Math.min(imgHeight - currentBox.height, currentBox.y + dyOriginal));
          break;
        case 'resize-se':
          currentBox.width = Math.max(minSize, currentBox.width + dxOriginal);
          currentBox.height = Math.max(minSize, currentBox.height + dyOriginal);
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          break;
        case 'resize-nw':
          currentBox.x = Math.max(0, currentBox.x + dxOriginal);
          currentBox.y = Math.max(0, currentBox.y + dyOriginal);
          currentBox.width = Math.max(minSize, currentBox.width - dxOriginal);
          currentBox.height = Math.max(minSize, currentBox.height - dyOriginal);
          break;
        case 'resize-ne':
          currentBox.width = Math.max(minSize, currentBox.width + dxOriginal);
          currentBox.y = Math.max(0, currentBox.y + dyOriginal);
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          currentBox.height = Math.max(minSize, currentBox.height - dyOriginal);
          break;
        case 'resize-sw':
          currentBox.x = Math.max(0, currentBox.x + dxOriginal);
          currentBox.width = Math.max(minSize, currentBox.width - dxOriginal);
          currentBox.height = Math.max(minSize, currentBox.height + dyOriginal);
          break;
        case 'resize-n':
          currentBox.y = Math.max(0, currentBox.y + dyOriginal);
          currentBox.height = Math.max(minSize, currentBox.height - dyOriginal);
          break;
        case 'resize-s':
          currentBox.height = Math.max(minSize, currentBox.height + dyOriginal);
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          break;
        case 'resize-w':
          currentBox.x = Math.max(0, currentBox.x + dxOriginal);
          currentBox.width = Math.max(minSize, currentBox.width - dxOriginal);
          break;
        case 'resize-e':
          currentBox.width = Math.max(minSize, currentBox.width + dxOriginal);
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
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
  }, [imageWidth, imageHeight, onCropBoxChange]);

  // 更新鼠标光标
  const handleMouseMoveOverlay = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const cropScreenX = (percentX / 100) * rect.width;
    const cropScreenY = (percentY / 100) * rect.height;
    const cropScreenW = (percentW / 100) * rect.width;
    const cropScreenH = (percentH / 100) * rect.height;

    const tolerance = 10;
    let cursor = 'default';

    if (Math.abs(mouseX - (cropScreenX + cropScreenW)) < tolerance &&
        Math.abs(mouseY - (cropScreenY + cropScreenH)) < tolerance) {
      cursor = 'nwse-resize';
    } else if (Math.abs(mouseX - cropScreenX) < tolerance &&
               Math.abs(mouseY - cropScreenY) < tolerance) {
      cursor = 'nwse-resize';
    } else if (Math.abs(mouseX - (cropScreenX + cropScreenW)) < tolerance &&
               Math.abs(mouseY - cropScreenY) < tolerance) {
      cursor = 'nesw-resize';
    } else if (Math.abs(mouseX - cropScreenX) < tolerance &&
               Math.abs(mouseY - (cropScreenY + cropScreenH)) < tolerance) {
      cursor = 'nesw-resize';
    } else if (Math.abs(mouseY - cropScreenY) < tolerance &&
             mouseX >= cropScreenX && mouseX <= cropScreenX + cropScreenW) {
      cursor = 'ns-resize';
    } else if (Math.abs(mouseY - (cropScreenY + cropScreenH)) < tolerance &&
              mouseX >= cropScreenX && mouseX <= cropScreenX + cropScreenW) {
      cursor = 'ns-resize';
    } else if (Math.abs(mouseX - cropScreenX) < tolerance &&
              mouseY >= cropScreenY && mouseY <= cropScreenY + cropScreenH) {
      cursor = 'ew-resize';
    } else if (Math.abs(mouseX - (cropScreenX + cropScreenW)) < tolerance &&
              mouseY >= cropScreenY && mouseY <= cropScreenY + cropScreenH) {
      cursor = 'ew-resize';
    } else if (mouseX >= cropScreenX && mouseX <= cropScreenX + cropScreenW &&
             mouseY >= cropScreenY && mouseY <= cropScreenY + cropScreenH) {
      cursor = 'move';
    }

    containerRef.current.style.cursor = cursor;
  }, [percentX, percentY, percentW, percentH]);

  if (screenBox.width <= 0 || screenBox.height <= 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="crop-overlay-wrapper"
      onMouseMove={handleMouseMoveOverlay}
      onDoubleClick={onConfirm}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 1. 唯一的底图：完整的高清原图 */}
      <img
        src={imageUrl}
        alt="crop-base"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          display: 'block',
          userSelect: 'none',
        }}
        draggable={false}
      />

      {/* 2. 裁剪活动区：自带无限大阴影遮罩 */}
      <div
        className="crop-active-box"
        onMouseDown={(e) => handleMouseDown(e, 'move')}
        style={{
          position: 'absolute',
          left: `${percentX}%`,
          top: `${percentY}%`,
          width: `${percentW}%`,
          height: `${percentH}%`,
          boxSizing: 'border-box',
          border: '2px solid #007AFF',
          cursor: 'move',
          // 魔法核心：用 9999px 的黑影反向遮盖周围区域
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          overflow: 'visible',
        }}
      >
        {/* 九宫格网格 */}
        <div
          className="crop-grid-lines"
          style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gridTemplateRows: '1fr 1fr 1fr',
            pointerEvents: 'none',
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="grid-cell" />
          ))}
        </div>

        {/* 拖拽手柄 - 四角 */}
        <div
          className="resize-handle nw"
          onMouseDown={(e) => handleMouseDown(e, 'resize-nw')}
          style={{
            position: 'absolute',
            left: -6,
            top: -6,
            pointerEvents: 'auto',
          }}
        />
        <div
          className="resize-handle ne"
          onMouseDown={(e) => handleMouseDown(e, 'resize-ne')}
          style={{
            position: 'absolute',
            right: -6,
            top: -6,
            pointerEvents: 'auto',
          }}
        />
        <div
          className="resize-handle sw"
          onMouseDown={(e) => handleMouseDown(e, 'resize-sw')}
          style={{
            position: 'absolute',
            left: -6,
            bottom: -6,
            pointerEvents: 'auto',
          }}
        />
        <div
          className="resize-handle se"
          onMouseDown={(e) => handleMouseDown(e, 'resize-se')}
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            pointerEvents: 'auto',
          }}
        />
        {/* 拖拽手柄 - 四边 */}
        <div
          className="resize-handle n"
          onMouseDown={(e) => handleMouseDown(e, 'resize-n')}
          style={{
            position: 'absolute',
            left: '50%',
            top: -6,
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
          }}
        />
        <div
          className="resize-handle s"
          onMouseDown={(e) => handleMouseDown(e, 'resize-s')}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: -6,
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
          }}
        />
        <div
          className="resize-handle w"
          onMouseDown={(e) => handleMouseDown(e, 'resize-w')}
          style={{
            position: 'absolute',
            left: -6,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'auto',
          }}
        />
        <div
          className="resize-handle e"
          onMouseDown={(e) => handleMouseDown(e, 'resize-e')}
          style={{
            position: 'absolute',
            right: -6,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'auto',
          }}
        />
      </div>
    </div>
  );
};

export default CanvasCropOverlay;
