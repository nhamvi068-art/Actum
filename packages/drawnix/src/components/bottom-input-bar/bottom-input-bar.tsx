import { useState, KeyboardEvent, ChangeEvent, useRef, useEffect } from 'react';
import classNames from 'classnames';
import './bottom-input-bar.scss';

// 图片文件类型
interface ImageFile {
  url: string;
  name: string;
  id: string;
}

export interface BottomInputBarProps {
  placeholder?: string;
  onSubmit?: (value: string, images: string[]) => void;
  onGenerateImage?: (value: string, images: string[], options: ImageGenerateOptions) => void;
  // 带上下文的图片生成回调，会传递比例信息用于创建占位块
  onGenerateImageWithContext?: (value: string, images: string[], options: ImageGenerateOptions) => void;
  className?: string;
  // 支持多张引用图片
  imageUrls?: string[];
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
];

// 尺寸选项
export const SIZE_OPTIONS = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

// 比例形状渲染组件 - 根据比例值返回对应形状的SVG
const RatioIcon: React.FC<{ ratio: string }> = ({ ratio }) => {
  const getIcon = () => {
    switch (ratio) {
      // 方形
      case '1:1':
        return (
          <svg width="18" height="18" viewBox="0 0 18 18">
            <rect x="2" y="2" width="14" height="14" rx="2" fill="#666"/>
          </svg>
        );
      // 竖向比例 - 宽度一致，通过高度体现差异
      case '2:3':
        return (
          <svg width="14" height="18" viewBox="0 0 14 18">
            <rect x="1" y="1" width="12" height="16" rx="2" fill="#666"/>
          </svg>
        );
      case '3:4':
        return (
          <svg width="14" height="16" viewBox="0 0 14 16">
            <rect x="1" y="1" width="12" height="14" rx="2" fill="#666"/>
          </svg>
        );
      case '4:5':
        return (
          <svg width="14" height="14" viewBox="0 0 14 14">
            <rect x="1" y="1" width="12" height="12" rx="2" fill="#666"/>
          </svg>
        );
      case '9:16':
        return (
          <svg width="12" height="18" viewBox="0 0 12 18">
            <rect x="1" y="1" width="10" height="16" rx="2" fill="#666"/>
          </svg>
        );
      // 横向比例 - 高度一致，通过宽度体现差异
      case '3:2':
        return (
          <svg width="18" height="14" viewBox="0 0 18 14">
            <rect x="1" y="1" width="16" height="12" rx="2" fill="#666"/>
          </svg>
        );
      case '4:3':
        return (
          <svg width="16" height="14" viewBox="0 0 16 14">
            <rect x="1" y="1" width="14" height="12" rx="2" fill="#666"/>
          </svg>
        );
      case '5:4':
        return (
          <svg width="14" height="14" viewBox="0 0 14 14">
            <rect x="1" y="1" width="12" height="12" rx="2" fill="#666"/>
          </svg>
        );
      case '16:9':
        return (
          <svg width="18" height="12" viewBox="0 0 18 12">
            <rect x="1" y="1" width="16" rx="2" height="10" fill="#666"/>
          </svg>
        );
      // 宽幅
      case '21:9':
        return (
          <svg width="20" height="10" viewBox="0 0 20 10">
            <rect x="1" y="1" width="18" height="8" rx="2" fill="#666"/>
          </svg>
        );
      default:
        return (
          <svg width="18" height="18" viewBox="0 0 18 18">
            <rect x="2" y="2" width="14" height="14" rx="2" fill="#666"/>
          </svg>
        );
    }
  };

  return <span className="bottom-input-bar__dropdown-item-icon-ratio">{getIcon()}</span>;
};

// 可用的比例选项 - 带分组信息
export const ASPECT_RATIO_OPTIONS = [
  // 方形
  { value: '1:1', label: '1:1', group: 'square', groupLabel: '方形', desc: '1024×1024' },
  // 竖向
  { value: '2:3', label: '2:3', group: 'portrait', groupLabel: '竖向', desc: '1024×1536' },
  { value: '3:4', label: '3:4', group: 'portrait', groupLabel: '竖向', desc: '1024×1366' },
  { value: '4:5', label: '4:5', group: 'portrait', groupLabel: '竖向', desc: '1024×1280' },
  { value: '9:16', label: '9:16', group: 'portrait', groupLabel: '竖向', desc: '1024×1820' },
  // 横向
  { value: '3:2', label: '3:2', group: 'landscape', groupLabel: '横向', desc: '1536×1024' },
  { value: '4:3', label: '4:3', group: 'landscape', groupLabel: '横向', desc: '1366×1024' },
  { value: '5:4', label: '5:4', group: 'landscape', groupLabel: '横向', desc: '1280×1024' },
  { value: '16:9', label: '16:9', group: 'landscape', groupLabel: '横向', desc: '1820×1024' },
  // 宽幅
  { value: '21:9', label: '21:9', group: 'ultrawide', groupLabel: '宽幅', desc: '2104×968' },
];

// 模型映射：将前端选项映射到实际的模型
// Nano Banana + 1K → nano-banana
// Nano Banana + 4K → nano-banana-hd
// Nano Banana Pro + 1K → nano-banana-2
// Nano Banana Pro + 2K → nano-banana-2-2k
// Nano Banana Pro + 4K → nano-banana-2-4k
const mapToActualModel = (model: string, size: string): string => {
  if (model === 'nano-banana-pro') {
    // Pro 系列
    if (size === '1K') return 'nano-banana-2';
    if (size === '2K') return 'nano-banana-2-2k';
    if (size === '4K') return 'nano-banana-2-4k';
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
}) => {
  const [inputValue, setInputValue] = useState('');
  const [uploadedImages, setUploadedImages] = useState<ImageFile[]>([]);
  // 用于在输入框上方显示的图片列表（来自画布选择）
  const [selectedImages, setSelectedImages] = useState<ImageFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  // 当前选择的模型（前端显示的）和尺寸
  const [selectedModel, setSelectedModel] = useState('nano-banana-pro');
  const [selectedSize, setSelectedSize] = useState('1K');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('1:1');

  // Nano Banana 不支持 2K 分辨率
  const isNanoBanana = selectedModel === 'nano-banana';
  const availableSizes = isNanoBanana 
    ? SIZE_OPTIONS.filter(s => s.value !== '2K')
    : SIZE_OPTIONS;

  // 下拉菜单状态
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const [ratioDropdownOpen, setRatioDropdownOpen] = useState(false);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setModelDropdownOpen(false);
      setSizeDropdownOpen(false);
      setRatioDropdownOpen(false);
    };

    if (modelDropdownOpen || sizeDropdownOpen || ratioDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [modelDropdownOpen, sizeDropdownOpen, ratioDropdownOpen]);

  // 如果当前选中的是 Nano Banana + 2K，自动切换到 1K
  useEffect(() => {
    if (isNanoBanana && selectedSize === '2K') {
      setSelectedSize('1K');
    }
  }, [isNanoBanana, selectedSize]);

  // 当 props 中的 imageUrls 变化时，同步更新 selectedImages
  useEffect(() => {
    // 检查 imageUrls 是否真的发生了变化
    const hasUrlsChanged = imageUrls.some(
      (url, index) => selectedImages[index]?.url !== url
    ) || imageUrls.length !== selectedImages.length;

    if (hasUrlsChanged || selectedImages.length === 0) {
      const newImages = imageUrls.map((url, index) => ({
        url,
        name: `引用图片 ${index + 1}`,
        // 保持已有的 id 不变，避免重新渲染导致状态丢失
        id: selectedImages[index]?.id || `selected-${index}`
      }));
      setSelectedImages(newImages);

      // 如果有新增的图片第一张图片的，获取尺寸并自动匹配最接近的比例
      if (imageUrls.length > 0) {
        const img = new Image();
        img.onload = () => {
          const closestRatio = findClosestAspectRatio(img.width, img.height);
          setSelectedAspectRatio(closestRatio);
        };
        img.src = imageUrls[0];
      }
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
  const handleSubmit = () => {
    // 收集所有图片URL（包括上传的和选中的）
    const allImages = [
      ...uploadedImages.map(img => img.url),
      ...selectedImages.map(img => img.url),
    ].filter(Boolean);

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

  // 处理图片生成 - 使用映射逻辑
  const handleGenerateImage = () => {
    const allImages = [
      ...uploadedImages.map(img => img.url),
      ...selectedImages.map(img => img.url),
    ].filter(Boolean);

    let submitValue = inputValue.trim();
    if (submitValue && (onGenerateImage || onGenerateImageWithContext)) {
      // 根据选择的模型和尺寸，映射到实际的模型
      const actualModel = mapToActualModel(selectedModel, selectedSize);
      const options = {
        model: actualModel,
        aspect_ratio: selectedAspectRatio,
        image_size: selectedSize,
      };
      
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
      if (onGenerateImage && inputValue.trim()) {
        handleGenerateImage();
      } else {
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

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 只取第一张图片来匹配比例
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      
      // 创建 Image 对象获取尺寸
      const img = new Image();
      img.onload = () => {
        const closestRatio = findClosestAspectRatio(img.width, img.height);
        setSelectedAspectRatio(closestRatio);
        
        const newImage: ImageFile = {
          id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url,
          name: file.name,
        };
        setUploadedImages(prev => [...prev, newImage]);
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
    <div className={classNames('bottom-input-bar', className)} onClick={(e) => stopPropagation && e.stopPropagation()}>
      {/* 主容器 */}
      <div className="bottom-input-bar__container">
        {/* 输入框上方的图片预览区域 - 选中的图片和上传的图片 */}
        {(selectedImages.length > 0 || uploadedImages.length > 0) && (
          <div className="bottom-input-bar__preview-images">
            {/* 选中的图片（来自画布） */}
            {selectedImages.map((img) => (
              <div
                key={img.id}
                className="bottom-input-bar__preview-image-item bottom-input-bar__preview-image-item--selected"
              >
                <img src={img.url} alt={img.name} />
                <div className="bottom-input-bar__preview-tooltip">
                  <img src={img.url} alt={img.name} />
                </div>
              </div>
            ))}
            {/* 上传的图片 */}
            {uploadedImages.map((img, index) => (
              <div
                key={img.id}
                className="bottom-input-bar__preview-image-item"
              >
                <img src={img.url} alt={img.name} />
                <div className="bottom-input-bar__preview-tooltip">
                  <img src={img.url} alt={img.name} />
                </div>
                <button 
                  type="button"
                  className="bottom-input-bar__remove-btn"
                  onClick={() => handleRemoveUploadedImage(index)}
                  title="删除"
                >
                  ×
                </button>
              </div>
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
            placeholder={placeholder}
            rows={1}
          />
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
                  className="bottom-input-bar__dropdown"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSizeDropdownOpen(!sizeDropdownOpen);
                    setModelDropdownOpen(false);
                    setRatioDropdownOpen(false);
                  }}
                >
                  <div className="bottom-input-bar__dropdown-trigger">
                    <span className="bottom-input-bar__dropdown-value">{selectedSize}</span>
                    <span className="bottom-input-bar__dropdown-arrow">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </span>
                  </div>
                  {sizeDropdownOpen && (
                    <div className="bottom-input-bar__dropdown-menu">
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
                      {/* 方形 */}
                      <div className="bottom-input-bar__dropdown-group-title">方形</div>
                      {ASPECT_RATIO_OPTIONS.filter(o => o.group === 'square').map(option => (
                        <div
                          key={option.value}
                          className={`bottom-input-bar__dropdown-item ${selectedAspectRatio === option.value ? 'bottom-input-bar__dropdown-item--selected' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAspectRatio(option.value);
                            setRatioDropdownOpen(false);
                          }}
                        >
                          <RatioIcon ratio={option.value} />
                          <span className="bottom-input-bar__dropdown-item-label">{option.label}</span>
                          <span className="bottom-input-bar__dropdown-item-desc">{option.desc}</span>
                          {selectedAspectRatio === option.value && (
                            <span className="bottom-input-bar__dropdown-item-check">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 6L9 17l-5-5"/>
                              </svg>
                            </span>
                          )}
                        </div>
                      ))}
                      {/* 竖向 */}
                      <div className="bottom-input-bar__dropdown-group-title">竖向</div>
                      {ASPECT_RATIO_OPTIONS.filter(o => o.group === 'portrait').map(option => (
                        <div
                          key={option.value}
                          className={`bottom-input-bar__dropdown-item ${selectedAspectRatio === option.value ? 'bottom-input-bar__dropdown-item--selected' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAspectRatio(option.value);
                            setRatioDropdownOpen(false);
                          }}
                        >
                          <RatioIcon ratio={option.value} />
                          <span className="bottom-input-bar__dropdown-item-label">{option.label}</span>
                          <span className="bottom-input-bar__dropdown-item-desc">{option.desc}</span>
                          {selectedAspectRatio === option.value && (
                            <span className="bottom-input-bar__dropdown-item-check">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 6L9 17l-5-5"/>
                              </svg>
                            </span>
                          )}
                        </div>
                      ))}
                      {/* 横向 */}
                      <div className="bottom-input-bar__dropdown-group-title">横向</div>
                      {ASPECT_RATIO_OPTIONS.filter(o => o.group === 'landscape').map(option => (
                        <div
                          key={option.value}
                          className={`bottom-input-bar__dropdown-item ${selectedAspectRatio === option.value ? 'bottom-input-bar__dropdown-item--selected' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAspectRatio(option.value);
                            setRatioDropdownOpen(false);
                          }}
                        >
                          <RatioIcon ratio={option.value} />
                          <span className="bottom-input-bar__dropdown-item-label">{option.label}</span>
                          <span className="bottom-input-bar__dropdown-item-desc">{option.desc}</span>
                          {selectedAspectRatio === option.value && (
                            <span className="bottom-input-bar__dropdown-item-check">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 6L9 17l-5-5"/>
                              </svg>
                            </span>
                          )}
                        </div>
                      ))}
                      {/* 宽幅 */}
                      <div className="bottom-input-bar__dropdown-group-title">宽幅</div>
                      {ASPECT_RATIO_OPTIONS.filter(o => o.group === 'ultrawide').map(option => (
                        <div
                          key={option.value}
                          className={`bottom-input-bar__dropdown-item ${selectedAspectRatio === option.value ? 'bottom-input-bar__dropdown-item--selected' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAspectRatio(option.value);
                            setRatioDropdownOpen(false);
                          }}
                        >
                          <RatioIcon ratio={option.value} />
                          <span className="bottom-input-bar__dropdown-item-label">{option.label}</span>
                          <span className="bottom-input-bar__dropdown-item-desc">{option.desc}</span>
                          {selectedAspectRatio === option.value && (
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

                {/* 生成按钮 */}
                <button
                  className={classNames('bottom-input-bar__generate-btn', {
                    'bottom-input-bar__generate-btn--active': hasContent,
                    'bottom-input-bar__generate-btn--generating': isGenerating,
                  })}
                  onClick={handleGenerateImage}
                  onKeyDown={handleKeyDownSend}
                  disabled={!hasContent || isGenerating}
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
