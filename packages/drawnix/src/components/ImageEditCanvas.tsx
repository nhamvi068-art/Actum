import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  UndoIcon, RedoIcon, RotateRightIcon,
  ZoomInIcon, ZoomOutIcon, Check,
  CloseIcon, LockIcon, UnlockIcon
} from './icons';
import '../styles/ImageEditFull.css';
import ImageSaveModal from './ImageSaveModal';

// 容器尺寸常量
const CONTAINER_WIDTH = 660; // 900 - 200(侧边栏) - 40(padding)
const CONTAINER_HEIGHT = 560; // 600 - 40(padding)

// 裁剪比例配置
const CROP_RATIOS = [
  { key: 'free', label: '自由', value: 0 },
  { key: '16:9', label: '16:9', value: 16 / 9 },
  { key: '9:16', label: '9:16', value: 9 / 16 },
  { key: '4:3', label: '4:3', value: 4 / 3 },
  { key: '3:4', label: '3:4', value: 3 / 4 },
  { key: '1:1', label: '1:1', value: 1 },
  { key: '3:2', label: '3:2', value: 3 / 2 },
  { key: '2:3', label: '2:3', value: 2 / 3 },
];

// 滤镜预设配置
const FILTER_PRESETS = [
  { key: 'origin', label: '原图', params: { brightness: 100, contrast: 100, saturation: 100, gray: 0, retro: 0, hue: 0, blur: 0 } },
  { key: 'blackWhite', label: '黑白', params: { brightness: 100, contrast: 100, saturation: 0, gray: 100, retro: 0, hue: 0, blur: 0 } },
  { key: 'nostalgia', label: '怀旧', params: { brightness: 105, contrast: 105, saturation: 90, gray: 20, retro: 80, hue: 10, blur: 0 } },
  { key: 'fresh', label: '清新', params: { brightness: 105, contrast: 95, saturation: 110, gray: 0, retro: 0, hue: -5, blur: 0 } },
  { key: 'cold', label: '冷色', params: { brightness: 100, contrast: 100, saturation: 90, gray: 0, retro: 0, hue: -20, blur: 0 } },
  { key: 'warm', label: '暖色', params: { brightness: 100, contrast: 100, saturation: 100, gray: 0, retro: 0, hue: 20, blur: 0 } },
];

// 核心状态
interface ImageEditState {
  activeTab: 'crop' | 'filter';
  cropRatio: string;
  cropRatioValue: number;
  isRemoveWhiteEdge: boolean;
  cropScale: number;
  rotateDegree: number;
  cropBox: { x: number; y: number; width: number; height: number };
  currentFilterPreset: string;
  imageVersion: number; // 用于追踪图片变化，触发 useEffect 重新执行
  croppedWidth: number; // 裁剪后的实际图片宽度
  croppedHeight: number; // 裁剪后的实际图片高度
  filterParams: {
    brightness: number;
    contrast: number;
    saturation: number;
    gray: number;
    retro: number;
    hue: number;
    blur: number;
  };
  editedImageBase64: string;
  saveModalVisible: boolean;
}

export interface ImageEditCanvasProps {
  imageUrl: string;
  onConfirm: (editedImageUrl: string, width?: number, height?: number) => void;
  onCancel: () => void;
}

export const ImageEditCanvas: React.FC<ImageEditCanvasProps> = ({
  imageUrl,
  onConfirm,
  onCancel
}) => {
  // 使用ref存储拖动状态，避免依赖问题
  const dragRef = useRef<{
    isDragging: boolean;
    dragType: 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-w' | 'resize-e' | null;
    dragStart: { x: number; y: number };
    cropBox: { x: number; y: number; width: number; height: number };
  }>({
    isDragging: false,
    dragType: null,
    dragStart: { x: 0, y: 0 },
    cropBox: { x: 0, y: 0, width: 0, height: 0 }
  });

  // 初始化完整状态
  const [editState, setEditState] = useState<ImageEditState>({
    activeTab: 'crop',
    cropRatio: 'free',
    cropRatioValue: 0,
    isRemoveWhiteEdge: false,
    cropScale: 1,
    rotateDegree: 0,
    cropBox: { x: 50, y: 50, width: 800, height: 450 },
    currentFilterPreset: 'origin',
    imageVersion: 0,
    croppedWidth: 0,
    croppedHeight: 0,
    filterParams: FILTER_PRESETS[0].params,
    editedImageBase64: '',
    saveModalVisible: false
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(new Image());
  const containerRef = useRef<HTMLDivElement>(null);
  const imageLoadedRef = useRef(false);
  const isAfterCropRef = useRef(false); // 追踪是否是裁剪后的图片加载

  // 计算初始缩放比例，让图片完整显示在容器内
  const calculateInitialScale = useCallback((imgWidth: number, imgHeight: number): number => {
    const rotatedWidth = imgHeight;
    const rotatedHeight = imgWidth;
    
    const finalWidth = editState.rotateDegree % 180 !== 0 ? rotatedWidth : imgWidth;
    const finalHeight = editState.rotateDegree % 180 !== 0 ? rotatedHeight : imgHeight;
    
    const scaleX = (CONTAINER_WIDTH - 40) / finalWidth;
    const scaleY = (CONTAINER_HEIGHT - 40) / finalHeight;
    
    return Math.min(scaleX, scaleY, 1);
  }, [editState.rotateDegree]);

  // 初始化图片
  useEffect(() => {
    imageRef.current.src = imageUrl;
    imageRef.current.crossOrigin = 'anonymous';
    
    imageRef.current.onload = () => {
      // 如果是裁剪后的图片加载，不重新初始化 cropBox
      if (isAfterCropRef.current) {
        isAfterCropRef.current = false;
        imageLoadedRef.current = true;
        return;
      }
      
      // 只有当 imageLoadedRef 为 false 时才初始化
      if (!imageLoadedRef.current) {
        imageLoadedRef.current = true;
        
        const initialScale = calculateInitialScale(imageRef.current.width, imageRef.current.height);
        
        setEditState(prev => ({
          ...prev,
          cropScale: initialScale,
          cropBox: {
            x: 0,
            y: 0,
            width: imageRef.current.width,
            height: imageRef.current.height
          }
        }));
        
        dragRef.current.cropBox = {
          x: 0,
          y: 0,
          width: imageRef.current.width,
          height: imageRef.current.height
        };
      }
    };
  }, [imageUrl, calculateInitialScale]);

  // 核心：绘制画布（含旋转+滤镜+裁剪框）
  useEffect(() => {
    if (!canvasRef.current || !imageRef.current.complete) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CONTAINER_WIDTH;
    canvas.height = CONTAINER_HEIGHT;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    const scale = editState.cropScale;
    const imgWidth = imageRef.current.width;
    const imgHeight = imageRef.current.height;

    let rotatedWidth = imgWidth;
    let rotatedHeight = imgHeight;
    if (editState.rotateDegree % 180 !== 0) {
      rotatedWidth = imgHeight;
      rotatedHeight = imgWidth;
    }

    const offsetX = (canvas.width - rotatedWidth * scale) / 2;
    const offsetY = (canvas.height - rotatedHeight * scale) / 2;

    ctx.translate(offsetX + (rotatedWidth * scale) / 2, offsetY + (rotatedHeight * scale) / 2);
    ctx.rotate((editState.rotateDegree * Math.PI) / 180);
    ctx.translate(-(imgWidth * scale) / 2, -(imgHeight * scale) / 2);

    applyFilter(ctx, imageRef.current, scale, editState.filterParams);
    ctx.restore();

    if (editState.activeTab === 'crop') {
      drawCropBox(ctx, offsetX, offsetY, scale);
    }

  }, [imageUrl, editState.filterParams, editState.cropScale, editState.rotateDegree, editState.cropBox, editState.activeTab, editState.imageVersion]);

  // 鼠标事件处理
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (editState.activeTab !== 'crop') return;
      
      const canvas = canvasRef.current!;
      const displayWidth = canvas.width;
      const displayHeight = canvas.height;
      
      const mouseX = e.offsetX;
      const mouseY = e.offsetY;
      
      const cropBox = editState.cropBox;
      const scale = editState.cropScale;
      const rotateDegree = editState.rotateDegree;
      
      const imgWidth = imageRef.current.width;
      const imgHeight = imageRef.current.height;
      
      let rotatedWidth = imgWidth;
      let rotatedHeight = imgHeight;
      if (editState.rotateDegree % 180 !== 0) {
        rotatedWidth = imgHeight;
        rotatedHeight = imgWidth;
      }
      
      const offsetX = (displayWidth - rotatedWidth * scale) / 2;
      const offsetY = (displayHeight - rotatedHeight * scale) / 2;

      let boxX = offsetX + cropBox.x * scale;
      let boxY = offsetY + cropBox.y * scale;
      let boxWidth = cropBox.width * scale;
      let boxHeight = cropBox.height * scale;

      if (editState.rotateDegree % 180 !== 0) {
        [boxWidth, boxHeight] = [boxHeight, boxWidth];
      }

      const cornerTolerance = 80;
      const edgeTolerance = 100;
      let dragType: typeof dragRef.current.dragType = null;

      // 4个角 - 使用80像素容差
      const rightEdge = boxX + boxWidth;
      const bottomEdge = boxY + boxHeight;
      if (Math.abs(mouseX - rightEdge) < cornerTolerance && Math.abs(mouseY - bottomEdge) < cornerTolerance) {
        dragType = 'resize-se';
      }
      else if (Math.abs(mouseX - boxX) < cornerTolerance && Math.abs(mouseY - boxY) < cornerTolerance) {
        dragType = 'resize-nw';
      }
      else if (Math.abs(mouseX - rightEdge) < cornerTolerance && Math.abs(mouseY - boxY) < cornerTolerance) {
        dragType = 'resize-ne';
      }
      else if (Math.abs(mouseX - boxX) < cornerTolerance && Math.abs(mouseY - bottomEdge) < cornerTolerance) {
        dragType = 'resize-sw';
      }
      // 4个边 - 只在靠近边框中心时触发（避免角点被误识别为边）
      // 上边：Y坐标靠近上边，X坐标在边框中心区域
      else if (Math.abs(mouseY - boxY) < edgeTolerance && 
               mouseX >= boxX + boxWidth * 0.2 && mouseX <= boxX + boxWidth * 0.8) {
        dragType = 'resize-n';
      }
      // 下边
      else if (Math.abs(mouseY - (boxY + boxHeight)) < edgeTolerance && 
               mouseX >= boxX + boxWidth * 0.2 && mouseX <= boxX + boxWidth * 0.8) {
        dragType = 'resize-s';
      }
      // 左边
      else if (Math.abs(mouseX - boxX) < edgeTolerance && 
               mouseY >= boxY + boxHeight * 0.2 && mouseY <= boxY + boxHeight * 0.8) {
        dragType = 'resize-w';
      }
      // 右边
      else if (Math.abs(mouseX - (boxX + boxWidth)) < edgeTolerance && 
               mouseY >= boxY + boxHeight * 0.2 && mouseY <= boxY + boxHeight * 0.8) {
        dragType = 'resize-e';
      }
      // 移动裁剪框 - 包含边框上的情况
      else if (mouseX >= boxX && mouseX <= boxX + boxWidth && mouseY >= boxY && mouseY <= boxY + boxHeight) {
        dragType = 'move';
      }

      if (dragType) {
        dragRef.current.isDragging = true;
        dragRef.current.dragType = dragType;
        dragRef.current.dragStart = { x: mouseX, y: mouseY };
        dragRef.current.cropBox = { ...cropBox };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current!;
      const mouseX = e.offsetX;
      const mouseY = e.offsetY;
      
      // 当不处于拖动状态时，检测鼠标悬停位置并设置光标
      if (!dragRef.current.isDragging && editState.activeTab === 'crop') {
        const cropBox = editState.cropBox;
        const scale = editState.cropScale;
        
        const imgWidth = imageRef.current.width;
        const imgHeight = imageRef.current.height;
        
        let rotatedWidth = imgWidth;
        let rotatedHeight = imgHeight;
        if (editState.rotateDegree % 180 !== 0) {
          rotatedWidth = imgHeight;
          rotatedHeight = imgWidth;
        }
        
        const displayWidth = canvas.width;
        const displayHeight = canvas.height;
        const offsetX = (displayWidth - rotatedWidth * scale) / 2;
        const offsetY = (displayHeight - rotatedHeight * scale) / 2;
        
        let boxX = offsetX + cropBox.x * scale;
        let boxY = offsetY + cropBox.y * scale;
        let boxWidth = cropBox.width * scale;
        let boxHeight = cropBox.height * scale;
        
        if (editState.rotateDegree % 180 !== 0) {
          [boxWidth, boxHeight] = [boxHeight, boxWidth];
        }
        
        const tolerance = 80;
        let cursor = 'default';
        
        // 角检测优先于边检测（角需要更精确的匹配）
        // 4个角
        if (Math.abs(mouseX - (boxX + boxWidth)) < tolerance && Math.abs(mouseY - (boxY + boxHeight)) < tolerance) {
          cursor = 'nwse-resize';
        }
        else if (Math.abs(mouseX - boxX) < tolerance && Math.abs(mouseY - boxY) < tolerance) {
          cursor = 'nwse-resize';
        }
        else if (Math.abs(mouseX - (boxX + boxWidth)) < tolerance && Math.abs(mouseY - boxY) < tolerance) {
          cursor = 'nesw-resize';
        }
        else if (Math.abs(mouseX - boxX) < tolerance && Math.abs(mouseY - (boxY + boxHeight)) < tolerance) {
          cursor = 'nesw-resize';
        }
        // 4个边（使用更大的容差100像素）
        else if (Math.abs(mouseY - boxY) < 100 && mouseX >= boxX - 100 && mouseX <= boxX + boxWidth + 100) {
          cursor = 'ns-resize';
        }
        else if (Math.abs(mouseY - (boxY + boxHeight)) < 100 && mouseX >= boxX - 100 && mouseX <= boxX + boxWidth + 100) {
          cursor = 'ns-resize';
        }
        else if (Math.abs(mouseX - boxX) < 100 && mouseY >= boxY - 100 && mouseY <= boxY + boxHeight + 100) {
          cursor = 'ew-resize';
        }
        else if (Math.abs(mouseX - (boxX + boxWidth)) < 100 && mouseY >= boxY - 100 && mouseY <= boxY + boxHeight + 100) {
          cursor = 'ew-resize';
        }
        // 移动裁剪框内部 - 包含边框上的情况
        else if (mouseX >= boxX && mouseX <= boxX + boxWidth && mouseY >= boxY && mouseY <= boxY + boxHeight) {
          cursor = 'move';
        }
        
        canvas.style.cursor = cursor;
      }
      
      if (!dragRef.current.isDragging || editState.activeTab !== 'crop') return;
      
      const dx = mouseX - dragRef.current.dragStart.x;
      const dy = mouseY - dragRef.current.dragStart.y;
      const scale = editState.cropScale;
      const currentBox = { ...dragRef.current.cropBox };
      
      const imgWidth = imageRef.current.width;
      const imgHeight = imageRef.current.height;

      const dxOriginal = dx / scale;
      const dyOriginal = dy / scale;

      switch (dragRef.current.dragType) {
        case 'move':
          // 移动裁剪框（严格边界限制：不能超出图片范围）
          currentBox.x = Math.max(0, Math.min(imgWidth - currentBox.width, currentBox.x + dxOriginal));
          currentBox.y = Math.max(0, Math.min(imgHeight - currentBox.height, currentBox.y + dyOriginal));
          break;
        case 'resize-se':
          // 调整右下角
          currentBox.width = Math.max(50, currentBox.width + dxOriginal);
          if (editState.cropRatioValue > 0) {
            currentBox.height = currentBox.width / editState.cropRatioValue;
          } else {
            currentBox.height = Math.max(50, currentBox.height + dyOriginal);
          }
          // 严格边界限制：不能超出图片
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          break;
        case 'resize-nw':
          // 调整左上角
          currentBox.x = Math.max(0, currentBox.x + dxOriginal);
          currentBox.y = Math.max(0, currentBox.y + dyOriginal);
          currentBox.width = Math.max(50, currentBox.width - dxOriginal);
          if (editState.cropRatioValue > 0) {
            currentBox.height = currentBox.width / editState.cropRatioValue;
          } else {
            currentBox.height = Math.max(50, currentBox.height - dyOriginal);
          }
          // 严格边界限制：不能超出图片
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          break;
        case 'resize-ne':
          // 调整右上角
          currentBox.width = Math.max(50, currentBox.width + dxOriginal);
          currentBox.y = Math.max(0, currentBox.y + dyOriginal);
          // 严格边界限制：不能超出图片
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          if (editState.cropRatioValue > 0) {
            currentBox.height = currentBox.width / editState.cropRatioValue;
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          } else {
            currentBox.height = Math.max(50, currentBox.height - dyOriginal);
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          }
          break;
        case 'resize-sw':
          // 调整左下角
          currentBox.x = Math.max(0, currentBox.x + dxOriginal);
          currentBox.width = Math.max(50, currentBox.width - dxOriginal);
          // 严格边界限制：不能超出图片
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          if (editState.cropRatioValue > 0) {
            currentBox.height = currentBox.width / editState.cropRatioValue;
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          } else {
            currentBox.height = Math.max(50, currentBox.height + dyOriginal);
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          }
          break;
        case 'resize-n':
          // 调整上边
          currentBox.y = Math.max(0, currentBox.y + dyOriginal);
          if (editState.cropRatioValue > 0) {
            currentBox.height = currentBox.width / editState.cropRatioValue;
          } else {
            currentBox.height = Math.max(50, currentBox.height - dyOriginal);
          }
          // 严格边界限制：不能超出图片
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          break;
        case 'resize-s':
          // 调整下边
          if (editState.cropRatioValue > 0) {
            currentBox.height = currentBox.width / editState.cropRatioValue;
          } else {
            currentBox.height = Math.max(50, currentBox.height + dyOriginal);
          }
          // 严格边界限制：不能超出图片
          currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          break;
        case 'resize-w':
          // 调整左边
          currentBox.x = Math.max(0, currentBox.x + dxOriginal);
          currentBox.width = Math.max(50, currentBox.width - dxOriginal);
          // 严格边界限制：不能超出图片
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          if (editState.cropRatioValue > 0) {
            currentBox.height = currentBox.width / editState.cropRatioValue;
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          }
          break;
        case 'resize-e':
          // 调整右边
          currentBox.width = Math.max(50, currentBox.width + dxOriginal);
          // 严格边界限制：不能超出图片
          currentBox.width = Math.min(currentBox.width, imgWidth - currentBox.x);
          if (editState.cropRatioValue > 0) {
            currentBox.height = currentBox.width / editState.cropRatioValue;
            currentBox.height = Math.min(currentBox.height, imgHeight - currentBox.y);
          }
          break;
      }

      setEditState(prev => ({
        ...prev,
        cropBox: currentBox
      }));
      
      dragRef.current.cropBox = currentBox;
      dragRef.current.dragStart = { x: mouseX, y: mouseY };
    };

    const handleMouseUp = () => {
      dragRef.current.isDragging = false;
      dragRef.current.dragType = null;
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', () => {
      canvas.style.cursor = 'default';
    });

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseleave', () => {
        canvas.style.cursor = 'default';
      });
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [editState.activeTab, editState.cropScale, editState.cropRatioValue, editState.rotateDegree, editState.cropBox]);

  // 应用滤镜到画布
  const applyFilter = (
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    scale: number,
    params: ImageEditState['filterParams']
  ) => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    tempCtx.drawImage(image, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

      const brightness = params.brightness / 100;
      r *= brightness; g *= brightness; b *= brightness;

      const contrast = params.contrast / 100;
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;

      const saturation = params.saturation / 100;
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;

      const grayValue = params.gray / 100;
      r = r * (1 - grayValue) + gray * grayValue;
      g = g * (1 - grayValue) + gray * grayValue;
      b = b * (1 - grayValue) + gray * grayValue;

      const retro = params.retro / 100;
      r = r * (1 - retro) + r * 0.9 * retro;
      g = g * (1 - retro) + g * 0.85 * retro;
      b = b * (1 - retro) + b * 0.7 * retro;

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = a;
    }

    tempCtx.putImageData(imageData, 0, 0);
    tempCtx.filter = `hue-rotate(${params.hue}deg) blur(${params.blur}px)`;
    tempCtx.drawImage(tempCanvas, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width * scale, tempCanvas.height * scale);
  };

    // 绘制裁剪框（含调整控制点）
    const drawCropBox = (
        ctx: CanvasRenderingContext2D,
        offsetX: number,
        offsetY: number,
        scale: number
    ) => {
        const cropBox = editState.cropBox;
        let boxX = offsetX + cropBox.x * scale;
        let boxY = offsetY + cropBox.y * scale;
        let boxWidth = cropBox.width * scale;
        let boxHeight = cropBox.height * scale;

    if (editState.rotateDegree % 180 !== 0) {
      [boxWidth, boxHeight] = [boxHeight, boxWidth];
    }

    // 裁剪框遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, boxX, canvasRef.current!.height);
    ctx.fillRect(boxX + boxWidth, 0, canvasRef.current!.width - (boxX + boxWidth), canvasRef.current!.height);
    ctx.fillRect(boxX, 0, boxWidth, boxY);
    ctx.fillRect(boxX, boxY + boxHeight, boxWidth, canvasRef.current!.height - (boxY + boxHeight));

    // 裁剪框边框
    ctx.strokeStyle = '#4096ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    // 裁剪框网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
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

    // 裁剪框调整控制点（8个：4角+4边中点）
    ctx.fillStyle = '#4096ff';
    const controlSize = 6;
    
    // 4个角
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
    
    // 4个边中点
    ctx.beginPath();
    ctx.arc(boxX + boxWidth / 2, boxY, controlSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(boxX + boxWidth / 2, boxY + boxHeight, controlSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(boxX, boxY + boxHeight / 2, controlSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(boxX + boxWidth, boxY + boxHeight / 2, controlSize, 0, Math.PI * 2);
    ctx.fill();
  };

  // 智能去白边核心方法
  const removeWhiteEdge = (image: HTMLImageElement) => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return { x: 0, y: 0, width: image.width, height: image.height };
    
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    tempCtx.drawImage(image, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    const width = tempCanvas.width;
    const height = tempCanvas.height;

    const WHITE_THRESHOLD = 240;
    const ALPHA_THRESHOLD = 250;

    let minX = width, minY = height, maxX = 0, maxY = 0;
    let hasNonWhitePixel = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];

        const isWhitePixel = 
          r >= WHITE_THRESHOLD && 
          g >= WHITE_THRESHOLD && 
          b >= WHITE_THRESHOLD && 
          a >= ALPHA_THRESHOLD;

        if (!isWhitePixel) {
          hasNonWhitePixel = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasNonWhitePixel) {
      return { x: 0, y: 0, width: image.width, height: image.height };
    }

    minX = Math.max(0, minX - 1);
    minY = Math.max(0, minY - 1);
    maxX = Math.min(width - 1, maxX + 1);
    maxY = Math.min(height - 1, maxY + 1);

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;

    return {
      x: minX,
      y: minY,
      width: cropWidth,
      height: cropHeight
    };
  };

  // 切换裁剪比例
  const handleRatioChange = (ratioKey: string, ratioValue: number) => {
    const imgWidth = imageRef.current.width;
    const imgHeight = imageRef.current.height;
    let newBox = { ...editState.cropBox };

    if (ratioValue > 0) {
      newBox.width = Math.min(imgWidth, imgWidth);
      newBox.height = newBox.width / ratioValue;
      newBox.x = (imgWidth - newBox.width) / 2;
      newBox.y = (imgHeight - newBox.height) / 2;
    } else {
      newBox = { ...editState.cropBox };
    }

    setEditState(prev => ({
      ...prev,
      cropRatio: ratioKey,
      cropRatioValue: ratioValue,
      cropBox: newBox
    }));
    
    dragRef.current.cropBox = newBox;
  };

  // 旋转图片
  const handleRotate = () => {
    const newDegree = (editState.rotateDegree + 90) % 360;
    setEditState(prev => ({ ...prev, rotateDegree: newDegree }));
  };

  // 应用裁剪（含智能去白边）
  const handleApplyCrop = () => {
    if (!canvasRef.current || !imageRef.current) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    let cropWidth = editState.cropBox.width;
    let cropHeight = editState.cropBox.height;
    if (editState.rotateDegree % 180 !== 0) {
      [cropWidth, cropHeight] = [cropHeight, cropWidth];
    }

    // 先计算智能去白边后的实际内容区域
    let cropX = editState.cropBox.x;
    let cropY = editState.cropBox.y;
    let finalCropWidth = cropWidth;
    let finalCropHeight = cropHeight;

    // 智能去白边 - 必须在创建 tempCanvas 之前计算
    if (editState.isRemoveWhiteEdge) {
      const { x, y, width, height } = removeWhiteEdge(imageRef.current);
      cropX = x;
      cropY = y;
      finalCropWidth = width;
      finalCropHeight = height;
    }

    // 使用实际内容区域的大小创建 tempCanvas，避免周围有空白
    tempCanvas.width = finalCropWidth;
    tempCanvas.height = finalCropHeight;
    tempCtx.save();

    if (editState.rotateDegree !== 0) {
      // 旋转时需要调整裁剪坐标
      const rotatedFinalWidth = editState.rotateDegree % 180 !== 0 ? finalCropHeight : finalCropWidth;
      const rotatedFinalHeight = editState.rotateDegree % 180 !== 0 ? finalCropWidth : finalCropHeight;
      tempCtx.translate(rotatedFinalWidth / 2, rotatedFinalHeight / 2);
      tempCtx.rotate((editState.rotateDegree * Math.PI) / 180);
      tempCtx.translate(-rotatedFinalHeight / 2, -rotatedFinalWidth / 2);
    }

    const filterTempCanvas = document.createElement('canvas');
    const filterTempCtx = filterTempCanvas.getContext('2d');
    filterTempCanvas.width = imageRef.current.width;
    filterTempCanvas.height = imageRef.current.height;
    applyFilter(filterTempCtx!, imageRef.current, 1, editState.filterParams);
    tempCtx.drawImage(
      filterTempCanvas,
      cropX,
      cropY,
      finalCropWidth,
      finalCropHeight,
      0,
      0,
      tempCanvas.width,
      tempCanvas.height
    );

    tempCtx.restore();

    // 保存裁剪后的图片
    const croppedImageBase64 = tempCanvas.toDataURL('image/png');

    // 创建新图片对象来获取正确的尺寸
    const newImage = new Image();
    newImage.src = croppedImageBase64;
    newImage.onload = () => {
      const newWidth = newImage.width;
      const newHeight = newImage.height;

      // 直接计算缩放比例（不依赖 editState.rotateDegree，避免闭包问题）
      const scaleX = (CONTAINER_WIDTH - 40) / newWidth;
      const scaleY = (CONTAINER_HEIGHT - 40) / newHeight;
      const newScale = Math.min(scaleX, scaleY, 1);

      // 重置图片加载状态，确保 useEffect 重新执行
      imageLoadedRef.current = false;
      isAfterCropRef.current = true; // 标记为裁剪后的图片加载

      // 更新imageRef指向裁剪后的图片（会触发useEffect重新加载）
      imageRef.current.src = croppedImageBase64;

      setEditState(prev => ({
        ...prev,
        activeTab: 'filter', // 切换到滤镜标签页，隐藏裁剪框
        cropScale: newScale,
        rotateDegree: 0,
        imageVersion: prev.imageVersion + 1, // 更新版本号，触发 useEffect 重新执行
        croppedWidth: newWidth, // 存储裁剪后的实际宽度
        croppedHeight: newHeight, // 存储裁剪后的实际高度
        cropBox: {
          x: 0,
          y: 0,
          width: newWidth,
          height: newHeight
        },
        editedImageBase64: croppedImageBase64,
        saveModalVisible: false
      }));

      dragRef.current.cropBox = {
        x: 0,
        y: 0,
        width: newWidth,
        height: newHeight
      };
    };
  };

  // 保存弹窗回调
  const handleCoverOriginal = () => {
    imageRef.current.src = editState.editedImageBase64;
  };

  const handleInsertNew = () => {
    // 插入新图片逻辑
  };

  const handleDownloadLocal = () => {
    // 下载到本地逻辑
  };

  // 确认编辑并返回结果（显示保存弹窗）
  const handleConfirm = () => {
    if (!canvasRef.current) return;
    const base64 = canvasRef.current.toDataURL('image/png');
    setEditState(prev => ({
      ...prev,
      editedImageBase64: base64,
      saveModalVisible: true
    }));
  };

  return (
    <div className="image-edit-full-container" ref={containerRef}>
      <div className="edit-sidebar">
        <div className="sidebar-tabs">
          <button
            className={`tab ${editState.activeTab === 'crop' ? 'active' : ''}`}
            onClick={() => setEditState(prev => ({ ...prev, activeTab: 'crop' }))}
          >
            裁剪
          </button>
          <button
            className={`tab ${editState.activeTab === 'filter' ? 'active' : ''}`}
            onClick={() => setEditState(prev => ({ ...prev, activeTab: 'filter' }))}
          >
            滤镜
          </button>
        </div>

        {editState.activeTab === 'crop' && (
          <div className="crop-panel full-panel">
            <div className="sidebar-section">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={editState.isRemoveWhiteEdge}
                  onChange={(e) => setEditState(prev => ({ ...prev, isRemoveWhiteEdge: e.target.checked }))}
                />
                <span className="slider round"></span>
                <span className="switch-label">智能去白边</span>
              </label>
            </div>

            <div className="sidebar-section">
              <div className="section-title flex-between">
                <span>裁剪比例</span>
                <span className="ratio-lock">
                  {editState.cropRatio === 'free' ? <UnlockIcon /> : <LockIcon />}
                </span>
              </div>
              <div className="ratio-buttons">
                {CROP_RATIOS.map(ratio => (
                  <button
                    key={ratio.key}
                    className={`ratio-btn ${editState.cropRatio === ratio.key ? 'active' : ''}`}
                    onClick={() => handleRatioChange(ratio.key, ratio.value)}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <button
                className="apply-crop-btn"
                onClick={handleApplyCrop}
              >
                <Check /> 应用裁剪
              </button>
            </div>

            <div className="sidebar-tip">
              <p>✦ 拖动裁剪框调整位置</p>
              <p>✦ 拖动控制点调整大小</p>
              <p>✦ 自由裁剪可任意调整比例</p>
            </div>
          </div>
        )}

        {editState.activeTab === 'filter' && (
          <div className="filter-panel full-panel">
            <div className="sidebar-section">
              <div className="section-title">滤镜预设</div>
              <div className="filter-preset-buttons">
                {FILTER_PRESETS.map(preset => (
                  <button
                    key={preset.key}
                    className={`filter-preset-btn ${editState.currentFilterPreset === preset.key ? 'active' : ''}`}
                    onClick={() => setEditState(prev => ({
                      ...prev,
                      currentFilterPreset: preset.key,
                      filterParams: preset.params
                    }))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <div className="section-title">参数调节</div>
              <div className="filter-params">
                {Object.entries(editState.filterParams).map(([key, value]) => (
                  <div className="filter-param-item" key={key}>
                    <label className="param-label">
                      {key === 'brightness' && '亮度'}
                      {key === 'contrast' && '对比度'}
                      {key === 'saturation' && '饱和度'}
                      {key === 'gray' && '灰度'}
                      {key === 'retro' && '复古'}
                      {key === 'hue' && '色相'}
                      {key === 'blur' && '模糊'}
                    </label>
                    <input
                      type="range"
                      min={key === 'hue' ? -180 : (key === 'blur' ? 0 : 0)}
                      max={key === 'hue' ? 180 : (key === 'blur' ? 20 : (key === 'gray' || key === 'retro' ? 100 : 200))}
                      value={value}
                      onChange={(e) => setEditState(prev => ({
                        ...prev,
                        filterParams: { ...prev.filterParams, [key]: Number(e.target.value) },
                        currentFilterPreset: 'custom'
                      }))}
                      className="param-slider"
                    />
                    <span className="param-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="edit-main">
        <div className="top-toolbar">
          <span className="toolbar-title">编辑图片</span>
          <button className="toolbar-btn" title="撤销"><UndoIcon /></button>
          <button className="toolbar-btn" title="重做"><RedoIcon /></button>
          <button className="toolbar-btn" title="旋转" onClick={handleRotate}><RotateRightIcon /></button>
          <button className="toolbar-btn close-btn" title="关闭" onClick={onCancel}><CloseIcon /></button>
          <button className="toolbar-btn confirm-btn" title="确认" onClick={handleConfirm}><Check /></button>
        </div>

        <div className="canvas-wrapper">
          <canvas ref={canvasRef} className="edit-canvas"></canvas>
        </div>

        <div className="scale-control">
          <button className="scale-btn" title="缩小" onClick={() => setEditState(prev => ({ ...prev, cropScale: Math.max(0.2, prev.cropScale - 0.1) }))}>
            <ZoomOutIcon />
          </button>
          <span className="scale-text">{Math.round(editState.cropScale * 100)}%</span>
          <button className="scale-btn" title="放大" onClick={() => setEditState(prev => ({ ...prev, cropScale: Math.min(3, prev.cropScale + 0.1) }))}>
            <ZoomInIcon />
          </button>
        </div>
      </div>

      {/* 保存图片弹窗 */}
      <ImageSaveModal
        visible={editState.saveModalVisible}
        onClose={() => setEditState(prev => ({ ...prev, saveModalVisible: false }))}
        editedImageBase64={editState.editedImageBase64}
        onCoverOriginal={() => { handleCoverOriginal(); onConfirm(editState.editedImageBase64, editState.croppedWidth || imageRef.current.width, editState.croppedHeight || imageRef.current.height); }}
        onInsertNew={() => { handleInsertNew(); onConfirm(editState.editedImageBase64, editState.croppedWidth || imageRef.current.width, editState.croppedHeight || imageRef.current.height); }}
        onDownloadLocal={handleDownloadLocal}
      />
    </div>
  );
};

export default ImageEditCanvas;
