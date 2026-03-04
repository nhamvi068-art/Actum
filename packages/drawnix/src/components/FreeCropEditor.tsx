import React, { useState, useRef, useEffect, useCallback } from 'react';
import { message } from 'antd';
import '../styles/FreeCropEditor.css';

/**
 * 自由裁切核心组件
 * @param imageUrl 待裁切图片地址
 * @param onCropComplete 裁切完成回调（返回裁切后的Base64）
 */
interface FreeCropEditorProps {
  imageUrl: string;
  onCropComplete?: (base64: string) => void;
}

const FreeCropEditor: React.FC<FreeCropEditorProps> = ({ imageUrl, onCropComplete }) => {
  // 状态
  const [cropState, setCropState] = useState({
    cropBox: { x: 50, y: 50, width: 400, height: 300 },
    scale: 1,
    isDragging: false,
    dragType: 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | null,
    dragStart: { x: 0, y: 0 },
    offsetX: 0,
    offsetY: 0,
    cropCompleted: false
  });

  // 引用
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(new Image());
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);

  // 绘制画布
  const drawCanvas = useCallback(() => {
    const mainCanvas = canvasRef.current;
    const ctx = mainCanvas?.getContext('2d');
    if (!mainCanvas || !ctx || !imageRef.current.complete) return;

    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    ctx.save();
    ctx.drawImage(
      imageRef.current,
      cropState.offsetX,
      cropState.offsetY,
      imageRef.current.width * cropState.scale,
      imageRef.current.height * cropState.scale
    );
    ctx.restore();

    drawCropBox(ctx);
  }, [cropState.offsetX, cropState.offsetY, cropState.scale]);

  // 绘制裁剪框
  const drawCropBox = (ctx: CanvasRenderingContext2D) => {
    const { cropBox, scale, offsetX, offsetY } = cropState;
    const mainCanvas = canvasRef.current!;

    const boxX = offsetX + cropBox.x * scale;
    const boxY = offsetY + cropBox.y * scale;
    const boxWidth = cropBox.width * scale;
    const boxHeight = cropBox.height * scale;

    // 遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, boxX, mainCanvas.height);
    ctx.fillRect(boxX + boxWidth, 0, mainCanvas.width - (boxX + boxWidth), mainCanvas.height);
    ctx.fillRect(boxX, 0, boxWidth, boxY);
    ctx.fillRect(boxX, boxY + boxHeight, boxWidth, mainCanvas.height - (boxY + boxHeight));

    // 边框
    ctx.strokeStyle = '#ff7d00';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    // 九宫格
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(boxX + boxWidth / 3, boxY);
    ctx.lineTo(boxX + boxWidth / 3, boxY + boxHeight);
    ctx.moveTo(boxX + 2 * boxWidth / 3, boxY);
    ctx.lineTo(boxX + 2 * boxWidth / 3, boxY + boxHeight);
    ctx.moveTo(boxX, boxY + boxHeight / 3);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight / 3);
    ctx.moveTo(boxX, boxY + 2 * boxHeight / 3);
    ctx.lineTo(boxX + boxWidth, boxY + 2 * boxHeight / 3);
    ctx.stroke();

    // 控制点
    ctx.fillStyle = '#ff7d00';
    const controlSize = 6;
    ctx.beginPath();
    ctx.arc(boxX + boxWidth, boxY + boxHeight, controlSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(boxX, boxY, controlSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(boxX + boxWidth, boxY, controlSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(boxX, boxY + boxHeight, controlSize, 0, Math.PI * 2);
    ctx.fill();
  };

  // 初始化
  useEffect(() => {
    imageRef.current.src = imageUrl;
    imageRef.current.crossOrigin = 'anonymous';
    
    imageRef.current.onload = () => {
      const mainCanvas = canvasRef.current;
      if (!mainCanvas) return;

      mainCanvas.width = 800;
      mainCanvas.height = 600;

      const scaleX = mainCanvas.width / imageRef.current.width;
      const scaleY = mainCanvas.height / imageRef.current.height;
      const initScale = Math.min(scaleX, scaleY) * 0.8;

      const offsetX = (mainCanvas.width - imageRef.current.width * initScale) / 2;
      const offsetY = (mainCanvas.height - imageRef.current.height * initScale) / 2;

      const initCropBox = {
        x: Math.max(0, (imageRef.current.width - 400) / 2),
        y: Math.max(0, (imageRef.current.height - 300) / 2),
        width: Math.min(400, imageRef.current.width),
        height: Math.min(300, imageRef.current.height)
      };

      setCropState(prev => ({
        ...prev,
        scale: initScale,
        offsetX,
        offsetY,
        cropBox: initCropBox
      }));

      drawCanvas();
    };

    imageRef.current.onerror = () => {
      message.error('图片加载失败，请检查地址');
    };
  }, [imageUrl, drawCanvas]);

  // 鼠标事件
  useEffect(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return;

    const handleMouseDown = (e: MouseEvent) => {
      const rect = mainCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const { cropBox, scale, offsetX, offsetY } = cropState;

      const boxX = offsetX + cropBox.x * scale;
      const boxY = offsetY + cropBox.y * scale;
      const boxWidth = cropBox.width * scale;
      const boxHeight = cropBox.height * scale;

      const tolerance = 10;
      let dragType: typeof cropState.dragType = null;

      if (Math.abs(mouseX - (boxX + boxWidth)) < tolerance && Math.abs(mouseY - (boxY + boxHeight)) < tolerance) {
        dragType = 'resize-se';
      } else if (Math.abs(mouseX - boxX) < tolerance && Math.abs(mouseY - boxY) < tolerance) {
        dragType = 'resize-nw';
      } else if (Math.abs(mouseX - (boxX + boxWidth)) < tolerance && Math.abs(mouseY - boxY) < tolerance) {
        dragType = 'resize-ne';
      } else if (Math.abs(mouseX - boxX) < tolerance && Math.abs(mouseY - (boxY + boxHeight)) < tolerance) {
        dragType = 'resize-sw';
      } else if (mouseX > boxX && mouseX < boxX + boxWidth && mouseY > boxY && mouseY < boxY + boxHeight) {
        dragType = 'move';
      }

      if (dragType) {
        setCropState(prev => ({
          ...prev,
          isDragging: true,
          dragType,
          dragStart: { x: mouseX, y: mouseY }
        }));
        mainCanvas.style.cursor = dragType === 'move' ? 'move' : 'nwse-resize';
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!cropState.isDragging || !cropState.dragType) return;

      const mainCanvas = canvasRef.current!;
      const rect = mainCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const { dragStart, cropBox, scale, dragType, offsetX, offsetY } = cropState;

      const dx = mouseX - dragStart.x;
      const dy = mouseY - dragStart.y;
      const dxOriginal = dx / scale;
      const dyOriginal = dy / scale;

      const newCropBox = { ...cropBox };

      switch (dragType) {
        case 'move':
          newCropBox.x = Math.max(0, Math.min(imageRef.current.width - cropBox.width, cropBox.x + dxOriginal));
          newCropBox.y = Math.max(0, Math.min(imageRef.current.height - cropBox.height, cropBox.y + dyOriginal));
          break;
        case 'resize-se':
          newCropBox.width = Math.max(50, Math.min(imageRef.current.width - cropBox.x, cropBox.width + dxOriginal));
          newCropBox.height = Math.max(50, Math.min(imageRef.current.height - cropBox.y, cropBox.height + dyOriginal));
          break;
        case 'resize-nw':
          newCropBox.x = Math.max(0, cropBox.x + dxOriginal);
          newCropBox.y = Math.max(0, cropBox.y + dyOriginal);
          newCropBox.width = Math.max(50, Math.min(imageRef.current.width - newCropBox.x, cropBox.width - dxOriginal));
          newCropBox.height = Math.max(50, Math.min(imageRef.current.height - newCropBox.y, cropBox.height - dyOriginal));
          break;
        case 'resize-ne':
          newCropBox.width = Math.max(50, Math.min(imageRef.current.width - cropBox.x, cropBox.width + dxOriginal));
          newCropBox.y = Math.max(0, cropBox.y + dyOriginal);
          newCropBox.height = Math.max(50, Math.min(imageRef.current.height - newCropBox.y, cropBox.height - dyOriginal));
          break;
        case 'resize-sw':
          newCropBox.x = Math.max(0, cropBox.x + dxOriginal);
          newCropBox.width = Math.max(50, Math.min(imageRef.current.width - newCropBox.x, cropBox.width - dxOriginal));
          newCropBox.height = Math.max(50, Math.min(imageRef.current.height - cropBox.y, cropBox.height + dyOriginal));
          break;
      }

      setCropState(prev => ({
        ...prev,
        cropBox: newCropBox,
        dragStart: { x: mouseX, y: mouseY }
      }));
      drawCanvas();
    };

    const handleMouseUp = () => {
      const mainCanvas = canvasRef.current!;
      setCropState(prev => ({
        ...prev,
        isDragging: false,
        dragType: null
      }));
      mainCanvas.style.cursor = 'default';
    };

    mainCanvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      mainCanvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [cropState.isDragging, cropState.dragType, cropState.scale, cropState.offsetX, cropState.offsetY, drawCanvas]);

  // 执行裁切
  const executeFreeCrop = () => {
    if (!canvasRef.current || !imageRef.current || cropState.cropCompleted) return;

    const tempCanvas = tempCanvasRef.current || document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCanvas.width = cropState.cropBox.width;
    tempCanvas.height = cropState.cropBox.height;

    tempCtx.drawImage(
      imageRef.current,
      cropState.cropBox.x,
      cropState.cropBox.y,
      cropState.cropBox.width,
      cropState.cropBox.height,
      0,
      0,
      tempCanvas.width,
      tempCanvas.height
    );

    const croppedBase64 = tempCanvas.toDataURL('image/png');

    setCropState(prev => ({ ...prev, cropCompleted: true }));
    message.success('自由裁切完成');
    if (onCropComplete) onCropComplete(croppedBase64);

    const mainCanvas = canvasRef.current;
    const mainCtx = mainCanvas.getContext('2d');
    if (mainCtx) {
      mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
      mainCtx.drawImage(tempCanvas, 0, 0, mainCanvas.width, mainCanvas.height);
    }
  };

  // 重置
  const resetFreeCrop = () => {
    const initCropBox = {
      x: Math.max(0, (imageRef.current.width - 400) / 2),
      y: Math.max(0, (imageRef.current.height - 300) / 2),
      width: Math.min(400, imageRef.current.width),
      height: Math.min(300, imageRef.current.height)
    };
    setCropState(prev => ({
      ...prev,
      cropBox: initCropBox,
      cropCompleted: false
    }));
    drawCanvas();
  };

  return (
    <div className="free-crop-editor-container">
      <div className="crop-canvas-wrapper">
        <canvas ref={canvasRef} className="free-crop-canvas"></canvas>
        <canvas ref={tempCanvasRef} style={{ display: 'none' }}></canvas>
      </div>

      <div className="crop-operation-buttons">
        <button 
          className="crop-btn crop-confirm-btn"
          onClick={executeFreeCrop}
          disabled={cropState.cropCompleted}
        >
          确认自由裁切
        </button>
        <button 
          className="crop-btn crop-reset-btn"
          onClick={resetFreeCrop}
        >
          重置裁切框
        </button>
      </div>
    </div>
  );
};

export default FreeCropEditor;

