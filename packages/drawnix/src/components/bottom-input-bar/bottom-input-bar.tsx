import { useState, KeyboardEvent, ChangeEvent, useRef, useEffect } from 'react';
import classNames from 'classnames';
import './bottom-input-bar.scss';
import { PreviewImageItem, SelectedImageMeta, ImageFile } from './preview-image-item';
import RatioIcon, { ASPECT_RATIO_OPTIONS, AspectRatioOption } from '../aspect-ratio/aspect-ratio';
import { unifiedCacheService } from '../../services/unified-cache-service';
import { compressBlobToBase64 } from '../../utils/common';
export { ASPECT_RATIO_OPTIONS };
export type { AspectRatioOption };

// 常用提示词类型
interface SavedPrompt {
  id: string;
  text: string;
}

// localStorage key
const STORAGE_KEY = 'saved-prompts';

export interface BottomInputBarProps {
  placeholder?: string;
  onSubmit?: (value: string, images: string[]) => void;
  onGenerateImage?: (value: string, images: string[], options: ImageGenerateOptions) => void;
  // 带上下文的图片生成回调，会传递比例信息用于创建占位块
  onGenerateImageWithContext?: (value: string, images: string[], options: ImageGenerateOptions) => void;
  // 发射开始回调 - 点击发送按钮时触发，用于动画效果
  onSendStart?: () => void;
  className?: string;
  // 支持多张引用图片（元数据数组，由组件自管理 Blob 生命周期）
  imageUrls?: SelectedImageMeta[];
  onImagesClear?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onInput?: () => void;
  stopPropagation?: boolean;
  // 图片生成选项
  imageGenerateOptions?: ImageGenerateOptions;
  isGenerating?: boolean;
  // 消耗的 credits
  credits?: number;
  // 初始值（用于重做功能）
  initialPrompt?: string;
  initialImages?: string[];
  initialModel?: string;
  initialAspectRatio?: string;
  initialImageSize?: string;
  // 上传参考图时，自动插入画布（让缩略图能看到上传的图片）
  onImageUploadedToCanvas?: (imageUrl: string) => void;
}

// 图片生成选项
export interface ImageGenerateOptions {
  model?: string;
  aspect_ratio?: string;
  image_size?: string;
}

// 前端显示的模型选项
export const MODEL_OPTIONS = [
  { value: 'nano-banana', label: 'Nano Banana' },
  { value: 'nano-banana-pro', label: 'Nano Banana Pro' },
  { value: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2' },
  { value: 'gpt-image-2', label: 'GPT Image 2' },
];

// 尺寸选项
export const SIZE_OPTIONS = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

// 将前端选项映射到实际的模型
// gemini-3.1-flash-image-preview (Nano Banana 2) + 1K → gemini-3.1-flash-image-preview-512px
// gemini-3.1-flash-image-preview (Nano Banana 2) + 2K → gemini-3.1-flash-image-preview-2k
// gemini-3.1-flash-image-preview (Nano Banana 2) + 4K → gemini-3.1-flash-image-preview-4k
// Nano Banana + 1K → nano-banana
// Nano Banana + 4K → nano-banana-hd
// Nano Banana Pro + 1K → nano-banana-pro
// Nano Banana Pro + 2K → nano-banana-pro-2k
// Nano Banana Pro + 4K → nano-banana-pro-4k
const mapToActualModel = (model: string, size: string): string => {
  // 如果已经是具体的 gemini 模型，直接返回（不再映射）
  if (model.startsWith('gemini-3.1-flash-image-preview-')) {
    return model;
  }
  
  // gemini-3.1-flash-image-preview 需要根据尺寸映射
  if (model === 'gemini-3.1-flash-image-preview') {
    if (size === '1K') return 'gemini-3.1-flash-image-preview-512px';
    if (size === '2K') return 'gemini-3.1-flash-image-preview-2k';
    if (size === '4K') return 'gemini-3.1-flash-image-preview-4k';
    return 'gemini-3.1-flash-image-preview-512px'; // 默认
  }
  
  if (model === 'nano-banana-pro') {
    if (size === '1K') return 'nano-banana-pro';
    if (size === '2K') return 'nano-banana-pro-2k';
    if (size === '4K') return 'nano-banana-pro-4k';
  }
  // GPT Image 2 系列
  if (model === 'gpt-image-2') {
    return 'gpt-image-2';
  }

  // Nano Banana 系列 - 不支持 2K
  if (size === '1K') return 'nano-banana';
  if (size === '4K') return 'nano-banana-hd';
  return 'nano-banana';
};

export const BottomInputBar: React.FC<BottomInputBarProps> = ({
  placeholder = '今天我们要创作什么',
  onSubmit,
  onGenerateImage,
  onGenerateImageWithContext,
  onSendStart,
  className,
  imageUrls = [],
  onImagesClear,
  onFocus,
  onBlur,
  onInput,
  stopPropagation = true,
  imageGenerateOptions,
  isGenerating = false,
  credits = 10,
  initialPrompt,
  initialImages,
  initialModel,
  initialAspectRatio,
  initialImageSize,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [uploadedImages, setUploadedImages] = useState<ImageFile[]>([]);
  // 用于在输入框上方显示的图片列表（来自画布选择，元数据）
  const [selectedImages, setSelectedImages] = useState<SelectedImageMeta[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  // 当前选择的模型（前端显示的）和尺寸
  const [selectedModel, setSelectedModel] = useState(initialModel || 'nano-banana-pro');
  const [selectedSize, setSelectedSize] = useState(initialImageSize || '1K');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(initialAspectRatio || '1:1');

  // 常用提示词相关状态
  const [promptsMenuOpen, setPromptsMenuOpen] = useState(false);
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [newPromptText, setNewPromptText] = useState('');

  // 从 localStorage 加载保存的提示词
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSavedPrompts(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load saved prompts:', e);
    }
  }, []);

  // 保存提示词到 localStorage
  const savePromptsToStorage = (prompts: SavedPrompt[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    } catch (e) {
      console.error('Failed to save prompts:', e);
    }
  };

  // 添加新提示词
  const handleAddPrompt = () => {
    const text = newPromptText.trim();
    if (!text) return;

    const newPrompt: SavedPrompt = {
      id: `prompt-${Date.now()}`,
      text: text,
    };
    const updated = [...savedPrompts, newPrompt];
    setSavedPrompts(updated);
    savePromptsToStorage(updated);
    setNewPromptText('');
  };

  // 删除提示词
  const handleDeletePrompt = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedPrompts.filter(p => p.id !== id);
    setSavedPrompts(updated);
    savePromptsToStorage(updated);
  };

  // 点击提示词填充到输入框
  const handleSelectPrompt = (text: string) => {
    setInputValue(text);
    setPromptsMenuOpen(false);
  };

  // 当任意初始值变化时，统一处理
  useEffect(() => {
    if (initialPrompt !== undefined) {
      setInputValue(initialPrompt);
    }
    if (initialImages && initialImages.length > 0) {
      const imageFiles: ImageFile[] = initialImages.map((url, index) => ({
        url,
        name: `image_${index}`,
        id: `generated_${index}`,
      }));
      setUploadedImages(imageFiles);
    }
    if (initialModel) {
      setSelectedModel(initialModel);
    }
    if (initialImageSize) {
      setSelectedSize(initialImageSize);
    }
    if (initialAspectRatio) {
      setSelectedAspectRatio(initialAspectRatio);
    }
  }, [initialPrompt, initialImages, initialModel, initialImageSize, initialAspectRatio]);

  // Nano Banana 不支持 2K 分辨率
  // gemini-3.1-flash-image-preview 支持所有尺寸
  const isNanoBanana = selectedModel === 'nano-banana';
  const isGeminiModel = selectedModel === 'gemini-3.1-flash-image-preview';
  const availableSizes = isNanoBanana 
    ? SIZE_OPTIONS.filter(s => s.value !== '2K')
    : SIZE_OPTIONS;

  // 下拉菜单状态
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const [ratioDropdownOpen, setRatioDropdownOpen] = useState(false);

  const sizeDropdownAnchorRef = useRef<HTMLDivElement>(null);
  const sizeDropdownMenuRef = useRef<HTMLDivElement>(null);

  // #region agent log
  useEffect(() => {
    if (!sizeDropdownOpen) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const anchor = sizeDropdownAnchorRef.current;
        const menu = sizeDropdownMenuRef.current;
        const bar = anchor?.closest('.bottom-input-bar') as HTMLElement | null;
        const viewportW = window.innerWidth;
        const anchorRect = anchor ? anchor.getBoundingClientRect() : null;
        const menuRect = menu ? menu.getBoundingClientRect() : null;
        const barRect = bar ? bar.getBoundingClientRect() : null;
        const cs = menu ? window.getComputedStyle(menu) : null;
        const log = {
          viewportW,
          anchor: anchorRect ? { left: anchorRect.left, right: anchorRect.right, width: anchorRect.width, top: anchorRect.top } : null,
          menu: menuRect ? { left: menuRect.left, right: menuRect.right, width: menuRect.width } : null,
          bar: barRect ? { left: barRect.left, right: barRect.right, width: barRect.width } : null,
          menuOffsetFromAnchor: anchorRect && menuRect ? menuRect.left - anchorRect.left : null,
          menuOffsetFromBar: barRect && menuRect ? menuRect.left - barRect.left : null,
          csLeft: cs?.left,
          csTransform: cs?.transform,
          csTransition: cs?.transition,
          csAnimation: cs?.animationName,
        };
        console.log('[sizeDropdown] geometry:', JSON.stringify(log, null, 2));
      });
    });
  }, [sizeDropdownOpen]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setModelDropdownOpen(false);
      setSizeDropdownOpen(false);
      setRatioDropdownOpen(false);
      setPromptsMenuOpen(false);
    };

    if (modelDropdownOpen || sizeDropdownOpen || ratioDropdownOpen || promptsMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [modelDropdownOpen, sizeDropdownOpen, ratioDropdownOpen, promptsMenuOpen]);

  // 如果当前选中的是 Nano Banana + 2K，自动切换到 1K
  useEffect(() => {
    if (isNanoBanana && selectedSize === '2K') {
      setSelectedSize('1K');
    }
  }, [isNanoBanana, selectedSize]);

  // 当 props 中的 imageUrls 变化时，同步更新 selectedImages
  useEffect(() => {
    console.log('[BottomInputBar] 🔔 useEffect 触发，imageUrls 变化检测');
    console.log('[BottomInputBar] 📦 接收到的 imageUrls:', imageUrls);
    console.log('[BottomInputBar] 📊 当前 imageUrls 类型:', typeof imageUrls, Array.isArray(imageUrls));

    // imageUrls 现在是 SelectedImageMeta[] 类型
    if (imageUrls === undefined || imageUrls === null) {
      console.log('[BottomInputBar] ⛔ imageUrls 为空或 undefined，跳过');
      return;
    }

    if (!Array.isArray(imageUrls)) {
      console.log('[BottomInputBar] ⚠️ imageUrls 不是数组:', imageUrls);
      return;
    }

    console.log('[BottomInputBar] 🖼️ imageUrls 长度:', imageUrls.length);

    // 检查 imageUrls 是否真的发生了变化（通过 id 序列比对）
    const currentIds = imageUrls.map(img => img?.id).join(',') || '(空)';
    const prevIds = selectedImages.map(img => img?.id).join(',') || '(空)';

    console.log('[BottomInputBar] 🔄 当前 IDs:', currentIds);
    console.log('[BottomInputBar] 🔄 上次 IDs:', prevIds);

    if (currentIds !== prevIds || selectedImages.length !== imageUrls.length) {
      console.log('[BottomInputBar] ✅ 检测到变化，更新 selectedImages');
      setSelectedImages(imageUrls);

      // 如果有新增的图片，获取尺寸并自动匹配最接近的比例
      if (imageUrls.length > 0 && imageUrls.length > selectedImages.length) {
        const firstNewImage = imageUrls[0];
        console.log('[BottomInputBar] 📸 第一张新图片:', firstNewImage);
        // 优先使用 url（可能是 data: 或 http: URL）
        const imgSrc = firstNewImage.url || firstNewImage.assetId;
        if (imgSrc) {
          const img = new Image();
          img.onload = () => {
            const closestRatio = findClosestAspectRatio(img.width, img.height);
            console.log('[BottomInputBar] 📐 图片尺寸:', img.width, 'x', img.height, '最接近比例:', closestRatio);
            setSelectedAspectRatio(closestRatio);
          };
          // assetId 没有直链，需要先获取 Blob
          if (firstNewImage.assetId && !firstNewImage.url) {
            console.log('[BottomInputBar] ⏳ assetId 模式，需要异步加载 Blob');
            // assetId 需要异步加载，这里不阻塞
          } else {
            img.src = imgSrc;
          }
        }
      }
    } else {
      console.log('[BottomInputBar] ⏭️ 无变化，跳过更新');
    }
  }, [imageUrls]);

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // 自动调整textarea高度
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  // 处理提交
  const handleSubmit = async () => {
    const allImages = await getAllImagesAsync();

    let submitValue = inputValue.trim();
    if (submitValue && onSubmit) {
      onSubmit(submitValue, allImages);
      setInputValue('');
      setSelectedImages([]);
    } else if (allImages.length > 0 && onSubmit) {
      // 如果没有文字但有图片，也可以提交
      onSubmit('', allImages);
      setInputValue('');
      setSelectedImages([]);
    }
  };

  // 收集所有图片 - 异步版本，将 assetId 转换为实际 URL
  const getAllImagesAsync = async (): Promise<string[]> => {
    const uploadedImageUrls = uploadedImages.map(img => img.url).filter(Boolean);

    // 处理选中的图片：将 assetId 转换为实际 URL
    const selectedImageUrls = await Promise.all(
      selectedImages.map(async (img) => {
        if (img.url && img.url.trim()) return img.url;
        if (img.assetId) {
          try {
            const blob = await unifiedCacheService.getAssetBlob(img.assetId);
            if (blob) {
              return await compressBlobToBase64(blob);
            }
          } catch (e) {
            console.warn('[BottomInputBar] Failed to get asset blob for:', img.assetId, e);
          }
        }
        return null;
      })
    );
    const validSelectedUrls = selectedImageUrls.filter(Boolean) as string[];

    return [...uploadedImageUrls, ...validSelectedUrls];
  };

  // 处理图片生成 - 使用映射逻辑
  const handleGenerateImage = async () => {
    const allImages = await getAllImagesAsync();

    let submitValue = inputValue.trim();
    if (submitValue && (onGenerateImage || onGenerateImageWithContext)) {
      // 触发发射动画
      if (onSendStart) {
        onSendStart();
      }
      
      // 根据选择的模型和尺寸，映射到实际的模型
      const actualModel = mapToActualModel(selectedModel, selectedSize);
      // image_size 仅对具体的 gemini 模型需要排除（模型名已包含尺寸）
      const isSpecificGeminiModel = selectedModel.startsWith('gemini-3.1-flash-image-preview-');
      const options = {
        model: actualModel,
        aspect_ratio: selectedAspectRatio,
        image_size: selectedSize,
      };
      if (isSpecificGeminiModel) {
        delete (options as any).image_size;
      }
      
      // 先调用带上下文的回调（用于创建占位块）
      if (onGenerateImageWithContext) {
        onGenerateImageWithContext(submitValue, allImages, options);
      }
      
      // 再调用原有的回调
      if (onGenerateImage) {
        onGenerateImage(submitValue, allImages, options);
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // 有内容时优先触发生图（有 onGenerateImage 的情况下）
      if (onGenerateImage && hasContent) {
        handleGenerateImage();
      } else if (onSubmit && (inputValue.trim() || uploadedImages.length > 0)) {
        handleSubmit();
      }
    }
  };

  const handleKeyDownSend = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onGenerateImage && inputValue.trim()) {
        handleGenerateImage();
      } else {
        handleSubmit();
      }
    }
  };

  // 移除选中的图片
  const handleRemoveSelectedImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    // 如果所有图片都删除了，调用 onImagesClear
    if (selectedImages.length === 1 && onImagesClear) {
      onImagesClear();
    }
  };

  // 移除上传的图片
  const handleRemoveUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  // 处理参考图上传
  // 计算最接近图片宽高比的比例
  const findClosestAspectRatio = (width: number, height: number): string => {
    const imageRatio = width / height;
    let closestRatio = '1:1';
    let minDiff = Infinity;

    ASPECT_RATIO_OPTIONS.forEach(option => {
      const [w, h] = option.value.split(':').map(Number);
      const optionRatio = w / h;
      const diff = Math.abs(imageRatio - optionRatio);
      if (diff < minDiff) {
        minDiff = diff;
        closestRatio = option.value;
      }
    });

    return closestRatio;
  };

  // 统一的图片处理函数：压缩图片并添加到上传列表
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
          const compressedUrl = canvas.toDataURL('image/png'); // PNG 保留透明度，质量足够

          const newImage: ImageFile = {
            id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: compressedUrl,
            name: fileName || file.name,
          };
          setUploadedImages(prev => [...prev, newImage]);

          // 【核心】上传参考图时，同时将其插入画布（让缩略图能看到）
          if (onImageUploadedToCanvas) {
            onImageUploadedToCanvas(compressedUrl);
          }
        }
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  // 处理拖拽上传
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
    // 只有当鼠标离开整个容器时才取消拖拽状态
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

  // 处理粘贴上传
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

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 只取第一张图片来匹配比例
    const file = files[0];
    if (!file.type.startsWith('image/')) return;

    // 使用 Canvas 压缩图片
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;

      // 创建 Image 对象
      const img = new Image();
      img.onload = async () => {
        const closestRatio = findClosestAspectRatio(img.width, img.height);
        setSelectedAspectRatio(closestRatio);

        // 压缩图片：限制最长边为 1024px，质量 0.8
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
          const compressedUrl = canvas.toDataURL('image/png'); // PNG 保留透明度，质量足够

          const newImage: ImageFile = {
            id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: compressedUrl,
            name: file.name,
          };
          setUploadedImages(prev => [...prev, newImage]);

          // 【核心】上传参考图时，同时将其插入画布（让缩略图能看到）
          if (onImageUploadedToCanvas) {
            onImageUploadedToCanvas(compressedUrl);
          }
        }
      };
      img.src = url;
    };
    reader.readAsDataURL(file);

    // 清空 input 以便下次选择相同文件
    e.target.value = '';
  };

  // 触发参考图上传
  const handleRefImageClick = () => {
    refImageInputRef.current?.click();
  };

  // 快捷键提交（Ctrl+Enter）
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (onGenerateImage && inputValue.trim()) {
          handleGenerateImage();
        } else {
          handleSubmit();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [inputValue, uploadedImages, selectedImages]);

  const hasContent = inputValue.trim().length > 0 || uploadedImages.length > 0 || selectedImages.length > 0;

  // 获取当前模型显示名称
  const currentModelLabel = MODEL_OPTIONS.find(m => m.value === selectedModel)?.label || 'Nano Banana Pro';

  return (
    <div
      className={classNames('bottom-input-bar', 'global-console', className, {
        'bottom-input-bar--dragging': isDragging,
      })}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 拖拽时的覆盖层 */}
      {isDragging && (
        <div className="bottom-input-bar__drop-overlay">
          <div className="bottom-input-bar__drop-overlay-content">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
              <path d="M12 8v8"/>
              <path d="M8 12l4-4 4 4"/>
            </svg>
            <span>拖放图片到此处上传</span>
            <span className="bottom-input-bar__drop-overlay-hint">支持拖入或粘贴图片</span>
          </div>
        </div>
      )}
      {/* 主容器 */}
      <div className="bottom-input-bar__container">
        {/* 输入框上方的图片预览区域 - 选中的图片和上传的图片 */}
        {(selectedImages.length > 0 || uploadedImages.length > 0) && (
          <div className="bottom-input-bar__preview-images">
            {/* 选中的图片（来自画布） */}
            {selectedImages.length > 0 && selectedImages.map((img) => (
              <PreviewImageItem
                key={img.id}
                image={img}
                isSelected={true}
              />
            ))}
            {/* 上传的图片 */}
            {uploadedImages.length > 0 && uploadedImages.map((img, index) => (
              <PreviewImageItem
                key={img.id}
                image={img}
                isSelected={false}
                onRemove={() => handleRemoveUploadedImage(index)}
              />
            ))}
          </div>
        )}

        {/* 输入区域 */}
        <div className="bottom-input-bar__input-wrapper" onClick={(e) => stopPropagation && e.stopPropagation()}>
          <textarea
            className="bottom-input-bar__input"
            value={inputValue}
            onChange={handleInputChange}
            onInput={(e) => {
              stopPropagation && e.stopPropagation();
              onInput?.();
            }}
            onKeyDown={(e) => {
              stopPropagation && e.stopPropagation();
              handleKeyDown(e);
            }}
            onFocus={(e) => {
              stopPropagation && e.stopPropagation();
              onFocus?.();
            }}
            onBlur={(e) => {
              stopPropagation && e.stopPropagation();
              onBlur?.();
            }}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={1}
          />

          {/* 常用提示词按钮和菜单 */}
          <div className="bottom-input-bar__prompts-container">
            <button
              type="button"
              className="bottom-input-bar__prompts-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setPromptsMenuOpen(!promptsMenuOpen);
                setModelDropdownOpen(false);
                setSizeDropdownOpen(false);
                setRatioDropdownOpen(false);
              }}
              title="常用提示词"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="12" cy="19" r="2"/>
              </svg>
            </button>

            {promptsMenuOpen && (
              <div className="bottom-input-bar__prompts-menu" onClick={(e) => e.stopPropagation()}>
                {/* 已保存的提示词列表 */}
                {savedPrompts.length > 0 && (
                  <div className="bottom-input-bar__prompts-list">
                    {savedPrompts.map((prompt) => (
                      <div
                        key={prompt.id}
                        className="bottom-input-bar__prompts-item"
                        onClick={() => handleSelectPrompt(prompt.text)}
                      >
                        <span className="bottom-input-bar__prompts-item-text">{prompt.text}</span>
                        <button
                          type="button"
                          className="bottom-input-bar__prompts-delete"
                          onClick={(e) => handleDeletePrompt(prompt.id, e)}
                          title="删除"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 添加新提示词 */}
                <div className="bottom-input-bar__prompts-add">
                  <input
                    type="text"
                    className="bottom-input-bar__prompts-add-input"
                    value={newPromptText}
                    onChange={(e) => setNewPromptText(e.target.value)}
                    placeholder="添加常用提示词..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddPrompt();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="bottom-input-bar__prompts-add-btn"
                    onClick={handleAddPrompt}
                    disabled={!newPromptText.trim()}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部工具栏 - 左右对齐 */}
        <div className="bottom-input-bar__toolbar">
          {/* 左侧：模型选择器 */}
          <div className="bottom-input-bar__toolbar-left">
            {onGenerateImage && (
              <div 
                className="bottom-input-bar__dropdown"
                onClick={(e) => {
                  e.stopPropagation();
                  setModelDropdownOpen(!modelDropdownOpen);
                  setSizeDropdownOpen(false);
                  setRatioDropdownOpen(false);
                }}
              >
                <div className="bottom-input-bar__dropdown-trigger">
                  <span className="bottom-input-bar__dropdown-icon">🍌</span>
                  <span className="bottom-input-bar__dropdown-value">{currentModelLabel}</span>
                  <span className="bottom-input-bar__dropdown-arrow">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </span>
                </div>
                {modelDropdownOpen && (
                  <div className="bottom-input-bar__dropdown-menu">
                    {MODEL_OPTIONS.map(option => (
                      <div
                        key={option.value}
                        className={`bottom-input-bar__dropdown-item ${selectedModel === option.value ? 'bottom-input-bar__dropdown-item--selected' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedModel(option.value);
                          setModelDropdownOpen(false);
                        }}
                      >
                        <span className="bottom-input-bar__dropdown-item-icon">🍌</span>
                        <span className="bottom-input-bar__dropdown-item-label">{option.label}</span>
                        {selectedModel === option.value && (
                          <span className="bottom-input-bar__dropdown-item-check">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 6L9 17l-5-5"/>
                            </svg>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* 参考图上传按钮 */}
            <button 
              type="button" 
              className="bottom-input-bar__ref-image-btn"
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
              className="bottom-input-bar__ref-image-input"
            />
          </div>

          {/* 右侧：尺寸、比例和生成按钮 */}
          <div className="bottom-input-bar__toolbar-right">
            {onGenerateImage && (
              <>
                {/* 尺寸选择 - 自定义下拉菜单 */}
                <div
                  ref={sizeDropdownAnchorRef}
                  className="bottom-input-bar__dropdown"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.warn('[BOTTOM-INPUT-BAR] 🔧 new code loaded, sizeDropdownOpen:', !sizeDropdownOpen);
                    setSizeDropdownOpen(!sizeDropdownOpen);
                    setModelDropdownOpen(false);
                    setRatioDropdownOpen(false);
                  }}
                >
                  <div className="bottom-input-bar__dropdown-trigger" style={{ background: sizeDropdownOpen ? '#00ff0040' : undefined }}>
                    <span className="bottom-input-bar__dropdown-value">{selectedSize}</span>
                    <span className="bottom-input-bar__dropdown-arrow">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </span>
                  </div>
                  {sizeDropdownOpen && (
                    <div ref={sizeDropdownMenuRef} className="bottom-input-bar__dropdown-menu">
                      {availableSizes.map(option => (
                        <div
                          key={option.value}
                          className={`bottom-input-bar__dropdown-item ${selectedSize === option.value ? 'bottom-input-bar__dropdown-item--selected' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSize(option.value);
                            setSizeDropdownOpen(false);
                          }}
                        >
                          <span className="bottom-input-bar__dropdown-item-label">{option.label}</span>
                          {selectedSize === option.value && (
                            <span className="bottom-input-bar__dropdown-item-check">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 6L9 17l-5-5"/>
                              </svg>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 比例选择 - 自定义下拉菜单 */}
                <div 
                  className="bottom-input-bar__dropdown bottom-input-bar__dropdown--ratio"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRatioDropdownOpen(!ratioDropdownOpen);
                    setModelDropdownOpen(false);
                    setSizeDropdownOpen(false);
                  }}
                >
                  <div className="bottom-input-bar__dropdown-trigger">
                    <span className="bottom-input-bar__dropdown-value">{selectedAspectRatio}</span>
                    <span className="bottom-input-bar__dropdown-arrow">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </span>
                  </div>
                  {ratioDropdownOpen && (
                    <div className="bottom-input-bar__dropdown-menu bottom-input-bar__dropdown-menu--ratio">
                      {(['square', 'portrait', 'landscape', 'ultrawide'] as const).map(group => (
                        <div key={group}>
                          <div className="bottom-input-bar__dropdown-group-title">
                            {ASPECT_RATIO_OPTIONS.find(o => o.group === group)?.groupLabel}
                          </div>
                          {ASPECT_RATIO_OPTIONS.filter(o => o.group === group).map(option => (
                            <div
                              key={option.value}
                              className={`bottom-input-bar__dropdown-item bottom-input-bar__dropdown-item--ratio ${selectedAspectRatio === option.value ? 'bottom-input-bar__dropdown-item--selected' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAspectRatio(option.value);
                                setRatioDropdownOpen(false);
                              }}
                            >
                              <RatioIcon ratio={option.value} />
                              <span className="bottom-input-bar__dropdown-item-label">{option.label}</span>
                              <span className="bottom-input-bar__dropdown-item-desc">({option.desc})</span>
                              <span className="bottom-input-bar__dropdown-item-check">
                                {selectedAspectRatio === option.value ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 6L9 17l-5-5"/>
                                  </svg>
                                ) : (
                                  <span style={{ width: 14, height: 14, display: 'block' }}/>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 生成按钮 */}
                <button
                  className={classNames('bottom-input-bar__generate-btn', {
                    'bottom-input-bar__generate-btn--active': hasContent,
                    'bottom-input-bar__generate-btn--generating': isGenerating,
                  })}
                  onClick={handleGenerateImage}
                  onKeyDown={handleKeyDownSend}
                  disabled={!hasContent}
                  aria-label={isGenerating ? "生成中" : "生成图片"}
                >
                  {isGenerating ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinning">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5M5 12l7-7 7 7"/>
                    </svg>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
