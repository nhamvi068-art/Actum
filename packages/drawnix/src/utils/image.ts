import {
  getHitElementByPoint,
  getSelectedElements,
  PlaitBoard,
  Point,
  toSvgData,
} from '@plait/core';
import { base64ToBlob, boardToImage, download } from './common';
import { fileOpen } from '../data/filesystem';
import { IMAGE_MIME_TYPES } from '../constants';
import { insertImage, loadHTMLImageElement, buildImage } from '../data/image';
import { DrawTransforms } from '@plait/draw';
import { getBackgroundColor, isWhite } from './color';
import { TRANSPARENT } from '../constants/color';

export const saveAsSvg = (board: PlaitBoard) => {
  const selectedElements = getSelectedElements(board);
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
  const selectedElements = getSelectedElements(board);
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
export const addImageFromUrl = async (board: PlaitBoard, imageSrc: string) => {
  try {
    // 将 URL 转换为 Base64（如果是外部 URL）
    let finalImageSrc = imageSrc;
    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
      finalImageSrc = await convertUrlToBase64(imageSrc);
    }
    // 将 URL/base64 转换为 Image 对象
    const image = await loadHTMLImageElement(finalImageSrc);
    // 构建图片项
    const defaultImageWidth = 400;
    const imageItem = buildImage(image, finalImageSrc, defaultImageWidth);
    // 使用 DrawTransforms 添加图片到画布
    DrawTransforms.insertImage(board, imageItem);
  } catch (error) {
    console.error('Failed to add image from URL:', error);
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
