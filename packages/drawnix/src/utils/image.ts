import {
  PlaitBoard,
  toSvgData,
} from '@plait/core';
import { base64ToBlob, boardToImage, download } from './common';
import { fileOpen } from '../data/filesystem';
import { IMAGE_MIME_TYPES } from '../constants';
import { insertImage } from '../data/image';
import { DrawTransforms } from '@plait/draw';
import { getBackgroundColor, isWhite } from './color';
import { TRANSPARENT } from '../constants/color';
import { insertStandardImage } from '../services/image-element-factory';

export const saveAsSvg = (board: PlaitBoard) => {
  const selectedElements = board.getSelectedElements();
  const backgroundColor = getBackgroundColor(board);

  return toSvgData(board, {
    fillStyle: isWhite(backgroundColor) ? TRANSPARENT : backgroundColor,
    padding: 20,
    ratio: 4,
    elements: selectedElements.length > 0 ? selectedElements : undefined,
    inlineStyleClassNames: '.plait-text-container',
    styleNames: ['position'],
  }).then((svgData) => {
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const imageName = `drawnix-${new Date().getTime()}.svg`;
    download(blob, imageName);
  });
};

export const saveAsImage = (board: PlaitBoard, isTransparent: boolean) => {
  const selectedElements = board.getSelectedElements();
  const backgroundColor = getBackgroundColor(board) || 'white';
  boardToImage(board, {
    elements: selectedElements.length > 0 ? selectedElements : undefined,
    fillStyle: isTransparent ? 'transparent' : backgroundColor,
  }).then((image) => {
    if (image) {
      const ext = isTransparent ? 'png' : 'jpg';
      const pngImage = base64ToBlob(image);
      const imageName = `drawnix-${new Date().getTime()}.${ext}`;
      download(pngImage, imageName);
    }
  });
};

export const addImage = async (board: PlaitBoard) => {
  const imageFile = await fileOpen({
    description: 'Image',
    extensions: Object.keys(
      IMAGE_MIME_TYPES
    ) as (keyof typeof IMAGE_MIME_TYPES)[],
  });
  insertImage(board, imageFile);
};

// 从 URL 或 base64 添加图片
// 【强制收敛】所有来源图片统一走工厂管线：fetch/解码 → Blob → 压缩 → assetId → 落盘
export const addImageFromUrl = async (board: PlaitBoard, imageSrc: string) => {
  try {
    console.log('[addImageFromUrl] Starting factory pipeline for source:', imageSrc.substring(0, 60));

    // 调用全局工厂服务，统一口径：
    // - string (http/https): fetch 下载 → Blob → 压缩 → assetId
    // - string (data:image/...): Base64 解码 → Blob → 压缩 → assetId
    // 工厂函数返回严格符合 CanvasImageItem 接口的数据，assetId 必有，url 永远为空
    await insertStandardImage(board, imageSrc);

    console.log('[addImageFromUrl] Factory pipeline complete — no url field in model');
  } catch (error) {
    console.error('[addImageFromUrl] Factory pipeline failed:', error);
    throw error;
  }
};

// 将外部 URL 转换为 Base64
export const convertUrlToBase64 = async (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl);
    };
    img.onerror = () => {
      reject(new Error(`Failed to load image from URL: ${url}`));
    };
    img.src = url;
  });
};

// 下载原始尺寸图片（用于AI生成的图片）
export const downloadOriginalImage = async (url: string, filename?: string): Promise<void> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    // 从URL中提取文件扩展名
    const urlExt = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    const validExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const ext = validExts.includes(urlExt || '') ? urlExt : 'png';

    const imageName = filename || `generated-image-${Date.now()}.${ext}`;
    download(blob, imageName);
  } catch (error) {
    console.error('Failed to download original image:', error);
    // 兜底：使用URL直接下载
    window.open(url, '_blank');
  }
};
