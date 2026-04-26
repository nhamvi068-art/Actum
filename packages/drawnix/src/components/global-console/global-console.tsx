import React, { useState, KeyboardEvent, ChangeEvent, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { Palette, Bot, ChevronDown } from 'lucide-react';
import './global-console.scss';
import { PreviewImageItem, SelectedImageMeta } from '../bottom-input-bar/preview-image-item';
import RatioIcon, { ASPECT_RATIO_OPTIONS } from '../aspect-ratio/aspect-ratio';
import { unifiedCacheService } from '../../services/unified-cache-service';
import { compressBlobToBase64 } from '../../utils/common';

// --- 类型定义 ---
interface ImageFile {
  url: string;
  name: string;
  id: string;
}

// 选中图片元数据类型（与 SelectionTracker 保持一致）
interface SelectedImageMeta {
  id: string;
  assetId?: string;
  url?: string;
}

interface Skill {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface PresetAgent {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prompt: string;
}

interface ImageGenerateOptions {
  model?: string;
  aspect_ratio?: string;
  image_size?: string;
}

// --- 常量配置数据 ---
const SKILLS: Skill[] = [
  {
    id: 'auto',
    label: '自动规划 (默认)',
    icon: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    id: 'cutout',
    label: '一键抠图',
    icon: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3"/>
        <path d="M6 9v12"/>
        <path d="M13 6a3 3 0 0 1 3 3v9"/>
        <circle cx="18" cy="18" r="3"/>
        <path d="M18 15V3"/>
      </svg>
    ),
  },
  {
    id: 'upscale',
    label: '高清放大',
    icon: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h6v6"/>
        <path d="M9 21H3v-6"/>
        <path d="M21 3l-7 7"/>
        <path d="M3 21l7-7"/>
      </svg>
    ),
  },
  {
    id: 'erase',
    label: '智能消除',
    icon: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 20H7L3 16c-1-1-1-2.5 0-3.5l10-10c1-1 2.5-1 3.5 0l6 6c1 1 1 2.5 0 3.5L13 22"/>
        <path d="M7 13l5 5"/>
      </svg>
    ),
  },
];

const PRESET_AGENTS: PresetAgent[] = [
  {
    icon: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    label: '写营销文案',
    prompt: '帮我针对这张图片写一段吸引人的小红书营销文案，突出质感和高级感。',
  },
  {
    icon: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    label: '提取核心卖点',
    prompt: '分析这张图片的视觉元素，提取出3个核心产品卖点。',
  },
  {
    icon: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
      </svg>
    ),
    label: '分析设计风格',
    prompt: '从色彩搭配、光影和排版角度，分析这张图片的设计风格。',
  },
];

// 模型选项
const MODEL_OPTIONS = [
  { value: 'nano-banana', label: 'Nano Banana' },
  { value: 'nano-banana-pro', label: 'Nano Banana Pro' },
  { value: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2' },
  { value: 'gpt-image-2', label: 'GPT Image 2' },
];

// 尺寸选项
const SIZE_OPTIONS = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

// 模型映射函数
const mapToActualModel = (model: string, size: string): string => {
  if (model.startsWith('gemini-3.1-flash-image-preview-')) {
    return model;
  }
  if (model === 'gemini-3.1-flash-image-preview') {
    if (size === '1K') return 'gemini-3.1-flash-image-preview-512px';
    if (size === '2K') return 'gemini-3.1-flash-image-preview-2k';
    if (size === '4K') return 'gemini-3.1-flash-image-preview-4k';
    return 'gemini-3.1-flash-image-preview-512px';
  }
  if (model === 'nano-banana-pro') {
    if (size === '1K') return 'nano-banana-pro';
    if (size === '2K') return 'nano-banana-pro-2k';
    if (size === '4K') return 'nano-banana-pro-4k';
  }
  if (model === 'gpt-image-2') {
    return 'gpt-image-2';
  }
  if (size === '1K') return 'nano-banana';
  if (size === '4K') return 'nano-banana-hd';
  return 'nano-banana';
};

// --- Props 定义 ---
export interface GlobalConsoleProps {
  placeholder?: string;
  onSubmit?: (value: string, images: string[]) => void;
  onGenerateImage?: (value: string, images: string[], options: ImageGenerateOptions) => void;
  onGenerateImageWithContext?: (value: string, images: string[], options: ImageGenerateOptions) => void;
  onAgentSubmit?: (value: string, images: string[], skill: Skill) => void;
  onSendStart?: () => void;
  className?: string;
  // 支持多张引用图片（元数据数组，由组件自管理 Blob 生命周期）
  imageUrls?: SelectedImageMeta[];
  onImagesClear?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  stopPropagation?: boolean;
  imageGenerateOptions?: ImageGenerateOptions;
  isGenerating?: boolean;
  credits?: number;
  initialPrompt?: string;
  initialImages?: string[];
  initialModel?: string;
  initialAspectRatio?: string;
  initialImageSize?: string;
  onImageUploadedToCanvas?: (imageUrl: string) => void;
  onFillInput?: (data: { prompt: string; images: string[]; model: string; aspectRatio: string; imageSize?: string }) => void;
}

export { MODEL_OPTIONS, SIZE_OPTIONS, SKILLS };
export type { Skill, ImageGenerateOptions };

export const GlobalConsole: React.FC<GlobalConsoleProps> = ({
  placeholder = '今天你想创作什么',
  onSubmit,
  onGenerateImage,
  onGenerateImageWithContext,
  onAgentSubmit,
  onSendStart,
  className,
  imageUrls = [],
  onImagesClear,
  onFocus,
  onBlur,
  stopPropagation = true,
  imageGenerateOptions,
  isGenerating = false,
  credits = 10,
  initialPrompt,
  initialImages,
  initialModel,
  initialAspectRatio,
  initialImageSize,
  onImageUploadedToCanvas,
  onFillInput,
}) => {
  // --- 组件状态 ---
  const [consoleMode, setConsoleMode] = useState<'generate' | 'agent'>('generate');
  const [inputValue, setInputValue] = useState('');
  const [uploadedImages, setUploadedImages] = useState<ImageFile[]>([]);
  // 选中的图片（元数据，来自画布）
  const [selectedImages, setSelectedImages] = useState<SelectedImageMeta[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const [selectedModel, setSelectedModel] = useState(initialModel || 'nano-banana-pro');
  const [selectedSize, setSelectedSize] = useState(initialImageSize || '1K');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(initialAspectRatio || '1:1');
  const [selectedSkill, setSelectedSkill] = useState<Skill>(SKILLS[0]);

  // assetId -> dataURL 缓存，避免 getAllImagesAsync 时重复获取 blob
  const [assetUrlCache] = useState<Map<string, string>>(() => new Map());

  // 下拉菜单状态
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Nano Banana 不支持 2K
  const isNanoBanana = selectedModel === 'nano-banana';
  const availableSizes = isNanoBanana
    ? SIZE_OPTIONS.filter(s => s.value !== '2K')
    : SIZE_OPTIONS;

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null);
    if (openDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openDropdown]);

  // 如果当前选中的是 Nano Banana + 2K，自动切换到 1K
  useEffect(() => {
    if (isNanoBanana && selectedSize === '2K') {
      setSelectedSize('1K');
    }
  }, [isNanoBanana, selectedSize]);

  // 同步外部传入的图片（元数据）
  useEffect(() => {
    if (!imageUrls || imageUrls.length === 0) {
      if (selectedImages.length > 0) {
        setSelectedImages([]);
        // 清空选择时重置用户手动选择状态，允许下次自动检测
        setHasUserManuallySelectedRatio(false);
      }
      return;
    }

    // 通过 id 比对判断是否真的变化了
    const newIds = imageUrls.map(img => img?.id).join(',') || '(空)';
    const prevIds = selectedImages.map(img => img?.id).join(',') || '(空)';

    if (newIds !== prevIds) {
      setSelectedImages(imageUrls);
      // 图片变化时重置用户手动选择状态，允许自动检测新图片的比例
      setHasUserManuallySelectedRatio(false);
    }
  }, [imageUrls]);

  // 追踪用户是否手动选择过比例（用于自动比例检测功能）
  // 当用户手动点击比例选项时设置为 true
  // 注意：这个状态必须在任何使用它的 useEffect 之前定义
  const [hasUserManuallySelectedRatio, setHasUserManuallySelectedRatio] = useState(false);

  // 处理初始值
  useEffect(() => {
    if (initialPrompt !== undefined) setInputValue(initialPrompt);
    if (initialImages && initialImages.length > 0) {
      const imageFiles: ImageFile[] = initialImages.map((url, index) => ({
        url,
        name: `image_${index}`,
        id: `generated_${index}`,
      }));
      setUploadedImages(imageFiles);
    }
    if (initialModel) setSelectedModel(initialModel);
    if (initialImageSize) setSelectedSize(initialImageSize);
    if (initialAspectRatio) setSelectedAspectRatio(initialAspectRatio);
  }, [initialPrompt, initialImages, initialModel, initialImageSize, initialAspectRatio]);

  // 监听外部传入的 aspectRatio 变化（用于自动比例检测功能）
  // 只有当用户没有手动选择过比例时才自动更新
  useEffect(() => {
    console.log('[GlobalConsole] initialAspectRatio 变化:', initialAspectRatio, '用户手动选择过:', hasUserManuallySelectedRatio);
    if (initialAspectRatio && !hasUserManuallySelectedRatio) {
      if (selectedAspectRatio !== initialAspectRatio) {
        console.log('[GlobalConsole] 自动更新 aspectRatio:', initialAspectRatio);
        setSelectedAspectRatio(initialAspectRatio);
      }
    }
  }, [initialAspectRatio, hasUserManuallySelectedRatio]);

  // 计算最接近的比例
  const findClosestAspectRatio = (width: number, height: number): string => {
    const imageRatio = width / height;
    let closestRatio = '1:1';
    let minDiff = Infinity;
    const ASPECT_RATIOS = ['1:1', '2:3', '3:4', '4:5', '9:16', '3:2', '4:3', '5:4', '16:9', '21:9'];
    ASPECT_RATIOS.forEach(ratio => {
      const [w, h] = ratio.split(':').map(Number);
      const optionRatio = w / h;
      const diff = Math.abs(imageRatio - optionRatio);
      if (diff < minDiff) {
        minDiff = diff;
        closestRatio = ratio;
      }
    });
    return closestRatio;
  };

  // 处理输入变化
  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  // 处理图片压缩上传
  const processImageFile = (file: File, fileName?: string) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        const closestRatio = findClosestAspectRatio(img.width, img.height);
        setSelectedAspectRatio(closestRatio);
        const maxSize = 1024;
        let width = img.width;
        let height = img.height;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height / width) * maxSize);
            width = maxSize;
          } else {
            width = Math.round((width / height) * maxSize);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedUrl = canvas.toDataURL('image/jpeg', 0.8);
          const newImage: ImageFile = {
            id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: compressedUrl,
            name: fileName || file.name,
          };
          setUploadedImages(prev => [...prev, newImage]);
          if (onImageUploadedToCanvas) {
            onImageUploadedToCanvas(compressedUrl);
          }
        }
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  // 拖拽处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
          processImageFile(file);
        }
      });
    }
  };

  // 粘贴处理
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          processImageFile(file, `粘贴图片_${Date.now()}`);
        }
        break;
      }
    }
  };

  // 触发参考图上传
  const handleRefImageClick = () => {
    refImageInputRef.current?.click();
  };

  // 处理参考图上传
  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        const closestRatio = findClosestAspectRatio(img.width, img.height);
        setSelectedAspectRatio(closestRatio);

        const maxSize = 1024;
        let width = img.width;
        let height = img.height;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height / width) * maxSize);
            width = maxSize;
          } else {
            width = Math.round((width / height) * maxSize);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedUrl = canvas.toDataURL('image/jpeg', 0.8);

          const newImage: ImageFile = {
            id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: compressedUrl,
            name: file.name,
          };
          setUploadedImages(prev => [...prev, newImage]);

          if (onImageUploadedToCanvas) {
            onImageUploadedToCanvas(compressedUrl);
          }
        }
      };
      img.src = url;
    };
    reader.readAsDataURL(file);

    e.target.value = '';
  };

  // 移除图片
  const handleRemoveUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    if (uploadedImages.length === 1 && onImagesClear) {
      onImagesClear();
    }
  };

  // 收集所有图片 - 异步版本，将 assetId 转换为实际 URL
  // 添加重试逻辑，确保 blob 加载完成后再提交
  const getAllImagesAsync = async (): Promise<string[]> => {
    const uploadedImageUrls = uploadedImages.map(img => img.url).filter(Boolean);

    // 处理选中的图片：将 assetId 转换为实际 URL
    const selectedImageUrls = await Promise.all(
      selectedImages.map(async (img) => {
        // 优先使用已有的 url（但排除 blob: URLs，强制走 blob 转换）
        if (img.url && img.url.trim()) return img.url;
        
        // 优先从缓存获取（PreviewImageItem 已加载并缓存）
        if (img.assetId && assetUrlCache.has(img.assetId)) {
          const cachedUrl = assetUrlCache.get(img.assetId)!;
          return cachedUrl;
        }
        
        // 兜底：从 unifiedCacheService 获取，带重试
        if (img.assetId) {
          let lastError: Error | null = null;
          const maxRetries = 5;
          const retryDelay = 500; // 500ms
          
          for (let retry = 0; retry < maxRetries; retry++) {
            try {
              const blob = await unifiedCacheService.getAssetBlob(img.assetId);
              if (blob) {
                const dataUrl = await compressBlobToBase64(blob);
                // 回填缓存
                assetUrlCache.set(img.assetId, dataUrl);
                return dataUrl;
              }
              // Blob 未就绪，等待后重试
              if (retry < maxRetries - 1) {
                console.log(`[GlobalConsole] Blob not ready for ${img.assetId}, retry ${retry + 1}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            } catch (e) {
              lastError = e instanceof Error ? e : new Error(String(e));
              console.warn('[GlobalConsole] Retry error for asset blob:', img.assetId, e);
              if (retry < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            }
          }
          
          if (lastError) {
            console.warn('[GlobalConsole] Failed to get asset blob after retries:', img.assetId, lastError);
          }
        }
        return null;
      })
    );
    
    const validSelectedUrls = selectedImageUrls.filter(Boolean) as string[];
    const allImages = [...uploadedImageUrls, ...validSelectedUrls];
    
    console.log('[GlobalConsole] getAllImagesAsync result:', {
      uploadedCount: uploadedImageUrls.length,
      selectedCount: selectedImages.length,
      validSelectedCount: validSelectedUrls.length,
      totalCount: allImages.length
    });

    return allImages;
  };

  // 处理提交
  const handleSubmit = async () => {
    const allImages = await getAllImagesAsync();
    const trimmedValue = inputValue.trim();
    
    console.log('[GlobalConsole] handleSubmit:', {
      hasPrompt: !!trimmedValue,
      imageCount: allImages.length,
      hasOnGenerateImage: !!onGenerateImage,
      hasOnGenerateImageWithContext: !!onGenerateImageWithContext
    });
    
    if (consoleMode === 'generate') {
      if (trimmedValue && (onGenerateImage || onGenerateImageWithContext)) {
        if (onSendStart) onSendStart();
        const actualModel = mapToActualModel(selectedModel, selectedSize);
        const isSpecificGeminiModel = selectedModel.startsWith('gemini-3.1-flash-image-preview-');
        const isGptImage2 = selectedModel === 'gpt-image-2';
        const options = {
          model: actualModel,
          aspect_ratio: selectedAspectRatio,
          ...(isSpecificGeminiModel || isGptImage2 ? {} : { image_size: selectedSize }),
        };
        // 先调用 onGenerateImageWithContext（创建占位块）
        if (onGenerateImageWithContext) {
          onGenerateImageWithContext(trimmedValue, allImages, options);
        }
        // 再调用 onGenerateImage（触发AI服务）
        if (onGenerateImage) {
          onGenerateImage(trimmedValue, allImages, options);
        }
        setInputValue('');
        setSelectedImages([]);
      } else if (allImages.length > 0 && onSubmit) {
        onSubmit('', allImages);
        setInputValue('');
        setSelectedImages([]);
      }
    } else {
      // Agent 模式
      if ((trimmedValue || allImages.length > 0) && onAgentSubmit) {
        onAgentSubmit(trimmedValue, allImages, selectedSkill);
        setInputValue('');
        setSelectedImages([]);
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 快捷键提交
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [inputValue, uploadedImages, selectedImages, consoleMode, selectedSkill]);

  const hasContent = inputValue.trim().length > 0 || uploadedImages.length > 0 || selectedImages.length > 0;
  const currentModelLabel = MODEL_OPTIONS.find(m => m.value === selectedModel)?.label || 'Nano Banana Pro';

  return (
    <div
      className={classNames('global-console', className, {
        'global-console--dragging': isDragging,
      })}
      // 【区域级追踪】在容器层统一管理焦点状态
      onFocus={() => onFocus?.()}
      onBlur={(e) => {
        // 【核心】只有当焦点真正移出整个控制台面板时，才解除锁定
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onBlur?.();
        }
      }}
      onPointerDown={(e) => stopPropagation && e.stopPropagation()}
      onMouseDown={(e) => stopPropagation && e.stopPropagation()}
      onClick={(e) => stopPropagation && e.stopPropagation()}
      onDoubleClick={(e) => stopPropagation && e.stopPropagation()}
      onMouseMove={(e) => stopPropagation && e.stopPropagation()}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 拖拽覆盖层 */}
      {isDragging && (
        <div className="global-console__drop-overlay">
          <div className="global-console__drop-overlay-content">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
              <path d="M12 8v8"/>
              <path d="M8 12l4-4 4 4"/>
            </svg>
            <span>拖放图片到此处上传</span>
            <span className="global-console__drop-overlay-hint">支持拖入或粘贴图片</span>
          </div>
        </div>
      )}

      {/* 主容器 */}
      <div className="global-console__container">
        {/* 顶部扩展区 - 选中图片预览 */}
        <div className={`global-console__context-area ${(selectedImages.length > 0 || uploadedImages.length > 0) ? 'global-console__context-area--visible' : ''}`}>
          <div className="global-console__context-content">
            {/* 来自画布的图片 - 使用 PreviewImageItem */}
            {selectedImages.length > 0 && selectedImages.map((img) => (
                <PreviewImageItem
                  key={img.id}
                  image={img}
                  isSelected={true}
                  onImageLoaded={(_dataUrl) => {
                    // Do NOT cache blob: URLs from PreviewImageItem — assetUrlCache is read by
                    // getAllImagesAsync and blob: URLs are invalid outside this session.
                    // The fallback path in getAllImagesAsync handles blob→dataUrl conversion.
                  }}
                  onClick={() => {
                    if (onFillInput) {
                      onFillInput({
                        prompt: inputValue || '',
                        images: selectedImages.map(s => s.assetId || s.url || '').filter(Boolean),
                        model: selectedModel,
                        aspectRatio: selectedAspectRatio,
                        imageSize: selectedSize,
                      });
                    }
                  }}
                />
              ))}
            {/* 上传的图片 - 使用 PreviewImageItem */}
            {uploadedImages.length > 0 && uploadedImages.map((img, index) => (
              <PreviewImageItem
                key={img.id}
                image={img}
                isSelected={false}
                onRemove={() => handleRemoveUploadedImage(index)}
              />
            ))}
          </div>
        </div>

        {/* 柔和分割线 */}
        {(selectedImages.length > 0 || uploadedImages.length > 0) && (
          <div className="global-console__divider"></div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="global-console__form">
          {/* 核心输入区 */}
          <div className="global-console__input-row">
            <textarea
              className="global-console__input"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                stopPropagation && e.stopPropagation();
                handleKeyDown(e);
              }}
              onPaste={handlePaste}
              placeholder={consoleMode === 'generate' ? (hasContent ? "描述你想如何修改或参考这张图片..." : "今天你想创作什么") : "给 Agent 下达指令..."}
              rows={1}
            />

            {/* 预设提示词菜单 */}
            <div className="global-console__more-menu-container">
              <button
                type="button"
                className={`global-console__icon-btn ${openDropdown === 'presets' ? 'global-console__icon-btn--active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === 'presets' ? null : 'presets');
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="1"/>
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="12" cy="19" r="1"/>
                </svg>
              </button>
              {openDropdown === 'presets' && (
                <div className="global-console__dropdown global-console__dropdown--presets" onClick={(e) => e.stopPropagation()}>
                  <div className="global-console__dropdown-header">预设提示词</div>
                  {PRESET_AGENTS.map((agent, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="global-console__dropdown-item"
                      onClick={() => {
                        setInputValue(agent.prompt);
                        setOpenDropdown(null);
                      }}
                    >
                      <span className="global-console__dropdown-item-icon">
                        <agent.icon />
                      </span>
                      <span className="global-console__dropdown-item-label">{agent.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 底部动态工具栏区 */}
          <div className="global-console__toolbar">
            {/* 左侧：模式与模型/技能 */}
            <div className="global-console__toolbar-left">
              {/* 模式切换下拉菜单 */}
              <div className="global-console__dropdown-wrapper">
                <button
                  type="button"
                  className={`global-console__mode-btn ${openDropdown === 'mode' ? 'global-console__mode-btn--active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === 'mode' ? null : 'mode');
                  }}
                >
                  <span className={`global-console__mode-icon ${consoleMode === 'generate' ? 'global-console__mode-icon--generate' : 'global-console__mode-icon--agent'}`}>
                    {consoleMode === 'generate' ? (
                      <Palette size={15} strokeWidth={2} />
                    ) : (
                      <Bot size={15} strokeWidth={2} />
                    )}
                  </span>
                  <span className="global-console__mode-label">
                    {consoleMode === 'generate' ? '图片模式' : 'Agent模式'}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>

                {openDropdown === 'mode' && (
                  <div className="global-console__dropdown global-console__dropdown--mode" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`global-console__dropdown-item ${consoleMode === 'generate' ? 'global-console__dropdown-item--selected' : ''}`}
                      onClick={() => { setConsoleMode('generate'); setOpenDropdown(null); }}
                    >
                      <span className="global-console__dropdown-item-icon global-console__dropdown-item-icon--generate">
                        <Palette size={16} strokeWidth={2} />
                      </span>
                      <span className="global-console__dropdown-item-label">图片模式</span>
                      {consoleMode === 'generate' && (
                        <span className="global-console__dropdown-item-check">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 6L9 17l-5-5"/>
                          </svg>
                        </span>
                      )}
                    </button>
                    <button
                      className={`global-console__dropdown-item ${consoleMode === 'agent' ? 'global-console__dropdown-item--selected' : ''}`}
                      onClick={() => { setConsoleMode('agent'); setOpenDropdown(null); }}
                    >
                      <span className="global-console__dropdown-item-icon global-console__dropdown-item-icon--agent">
                        <Bot size={16} strokeWidth={2} />
                      </span>
                      <span className="global-console__dropdown-item-label">Agent模式</span>
                      {consoleMode === 'agent' && (
                        <span className="global-console__dropdown-item-check">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 6L9 17l-5-5"/>
                          </svg>
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* 参考图上传按钮 */}
              <button
                type="button"
                className="global-console__icon-btn global-console__ref-image-btn"
                onClick={handleRefImageClick}
                title="上传参考图"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
              <input
                ref={refImageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleRefImageUpload}
                className="global-console__ref-image-input"
              />

              <div className="global-console__toolbar-divider"></div>

              {/* 模型 / 技能选择区 */}
              {consoleMode === 'generate' ? (
                <div className="global-console__dropdown-wrapper">
                  <button
                    type="button"
                    className={`global-console__selector-btn ${openDropdown === 'model' ? 'global-console__selector-btn--active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenDropdown(openDropdown === 'model' ? null : 'model');
                    }}
                  >
                    <span className="global-console__selector-icon">🍌</span>
                    <span className="global-console__selector-label">{currentModelLabel}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>

                  {openDropdown === 'model' && (
                    <div className="global-console__dropdown global-console__dropdown--model" onClick={(e) => e.stopPropagation()}>
                      {MODEL_OPTIONS.map(model => (
                        <button
                          key={model.value}
                          className={`global-console__dropdown-item ${selectedModel === model.value ? 'global-console__dropdown-item--selected' : ''}`}
                          onClick={() => { setSelectedModel(model.value); setOpenDropdown(null); }}
                        >
                          <span className="global-console__dropdown-item-icon">🍌</span>
                          <span className="global-console__dropdown-item-label">{model.label}</span>
                          {selectedModel === model.value && (
                            <span className="global-console__dropdown-item-check">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 6L9 17l-5-5"/>
                              </svg>
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="global-console__dropdown-wrapper">
                  <button
                    type="button"
                    className={`global-console__selector-btn ${openDropdown === 'skill' ? 'global-console__selector-btn--active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenDropdown(openDropdown === 'skill' ? null : 'skill');
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                      <path d="M2 17l10 5 10-5"/>
                      <path d="M2 12l10 5 10-5"/>
                    </svg>
                    <span className="global-console__selector-label">{selectedSkill.label}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>

                  {openDropdown === 'skill' && (
                    <div className="global-console__dropdown global-console__dropdown--skill" onClick={(e) => e.stopPropagation()}>
                      {SKILLS.map(skill => (
                        <button
                          key={skill.id}
                          className={`global-console__dropdown-item ${selectedSkill.id === skill.id ? 'global-console__dropdown-item--selected-skill' : ''}`}
                          onClick={() => { setSelectedSkill(skill); setOpenDropdown(null); }}
                        >
                          <span className={`global-console__dropdown-item-icon ${selectedSkill.id === skill.id ? 'global-console__dropdown-item-icon--active' : ''}`}>
                            <skill.icon />
                          </span>
                          <span className="global-console__dropdown-item-label">{skill.label}</span>
                          {selectedSkill.id === skill.id && (
                            <span className="global-console__dropdown-item-check">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 6L9 17l-5-5"/>
                              </svg>
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 右侧：生成参数与提交按钮 */}
            <div className="global-console__toolbar-right">
              {consoleMode === 'generate' && (
                <div className="global-console__params-group">
                  {/* 分辨率 */}
                  <div className="global-console__dropdown-wrapper">
                    <button
                      type="button"
                      className={`global-console__param-btn ${openDropdown === 'resolution' ? 'global-console__param-btn--active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdown(openDropdown === 'resolution' ? null : 'resolution');
                      }}
                    >
                      {selectedSize}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </button>

                    {openDropdown === 'resolution' && (
                      <div className="global-console__dropdown global-console__dropdown--resolution" onClick={(e) => e.stopPropagation()}>
                        {availableSizes.map(size => (
                          <button
                            key={size.value}
                            className={`global-console__dropdown-item ${selectedSize === size.value ? 'global-console__dropdown-item--selected' : ''}`}
                            onClick={() => { setSelectedSize(size.value); setOpenDropdown(null); }}
                          >
                            <span className="global-console__dropdown-item-label">{size.label}</span>
                            {selectedSize === size.value && (
                              <span className="global-console__dropdown-item-check">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M20 6L9 17l-5-5"/>
                                </svg>
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 比例 */}
                  <div className="global-console__dropdown-wrapper">
                    <button
                      type="button"
                      className={`global-console__param-btn ${openDropdown === 'ratio' ? 'global-console__param-btn--active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdown(openDropdown === 'ratio' ? null : 'ratio');
                      }}
                    >
                      {selectedAspectRatio}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </button>

                    {openDropdown === 'ratio' && (
                      <div className="global-console__dropdown global-console__dropdown--ratio" onClick={(e) => e.stopPropagation()}>
                        {(['square', 'portrait', 'landscape', 'ultrawide'] as const).map(group => (
                          <div key={group}>
                            <div className="global-console__dropdown-group-title">
                              {ASPECT_RATIO_OPTIONS.find(o => o.group === group)?.groupLabel}
                            </div>
                            {ASPECT_RATIO_OPTIONS.filter(o => o.group === group).map(option => (
                              <button
                                key={option.value}
                                className={`global-console__dropdown-item global-console__dropdown-item--ratio ${selectedAspectRatio === option.value ? 'global-console__dropdown-item--selected' : ''}`}
                                onClick={() => { setSelectedAspectRatio(option.value); setHasUserManuallySelectedRatio(true); setOpenDropdown(null); }}
                              >
                                <RatioIcon ratio={option.value} />
                                <span className="global-console__dropdown-item-label">{option.label}</span>
                                <span className="global-console__dropdown-item-desc">({option.desc})</span>
                                <span className="global-console__dropdown-item-check">
                                  {selectedAspectRatio === option.value ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M20 6L9 17l-5-5"/>
                                    </svg>
                                  ) : (
                                    <span style={{ width: 14, height: 14, display: 'block' }}/>
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 提交按钮 */}
              <button
                type="submit"
                className={classNames('global-console__submit-btn', {
                  'global-console__submit-btn--active': hasContent,
                  'global-console__submit-btn--generating': isGenerating,
                })}
                disabled={!hasContent}
              >
                {isGenerating ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="global-console__spinning">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
