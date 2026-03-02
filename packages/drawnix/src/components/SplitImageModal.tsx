import React, { useState, useEffect, useCallback } from 'react';
import { CloseIcon } from './icons';
import { splitImageByGrid, smartSplit } from '../utils/smartSplit';
import '../styles/SplitImageModal.css';

export type SplitMode = 'grid' | 'semantic';

export interface SplitImageOptions {
  mode: SplitMode;
  rows?: number;
  cols?: number;
  count?: number;
}

interface SplitImageModalProps {
  visible: boolean;
  imageBase64: string;
  onClose: () => void;
  onConfirm: (subImages: string[], options: SplitImageOptions) => void;
}

const GRID_OPTIONS = [
  { rows: 2, cols: 2, label: '2×2 (4格)' },
  { rows: 3, cols: 3, label: '3×3 九宫格' },
  { rows: 4, cols: 4, label: '4×4 (16格)' },
  { rows: 2, cols: 3, label: '2×3 (6格)' },
  { rows: 3, cols: 2, label: '3×2 (6格)' },
];

const SEMANTIC_COUNT_OPTIONS = [
  { count: 3, label: '3块' },
  { count: 5, label: '5块' },
  { count: 8, label: '8块' },
  { count: 10, label: '10块' },
];

const SplitImageModal: React.FC<SplitImageModalProps> = ({
  visible,
  imageBase64,
  onClose,
  onConfirm,
}) => {
  const [mode, setMode] = useState<SplitMode>('grid');
  const [selectedGrid, setSelectedGrid] = useState(GRID_OPTIONS[1]); // 默认 3x3
  const [selectedCount, setSelectedCount] = useState(SEMANTIC_COUNT_OPTIONS[1]); // 默认 5
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 生成预览
  const generatePreview = useCallback(async () => {
    if (!imageBase64) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      let results: string[];
      
      if (mode === 'grid') {
        results = await splitImageByGrid(imageBase64, selectedGrid.rows, selectedGrid.cols);
      } else {
        results = await smartSplit(imageBase64, { 
          mode: 'semantic', 
          count: selectedCount.count 
        });
      }
      
      setPreviewImages(results);
    } catch (err) {
      setError((err as Error).message);
      setPreviewImages([]);
    } finally {
      setIsLoading(false);
    }
  }, [imageBase64, mode, selectedGrid, selectedCount]);

  // 模式或选项变化时重新生成预览
  useEffect(() => {
    if (visible) {
      generatePreview();
    }
  }, [visible, generatePreview]);

  const handleConfirm = () => {
    if (previewImages.length === 0) return;
    
    const options: SplitImageOptions = mode === 'grid' 
      ? { mode: 'grid', rows: selectedGrid.rows, cols: selectedGrid.cols }
      : { mode: 'semantic', count: selectedCount.count };
    
    onConfirm(previewImages, options);
  };

  if (!visible) return null;

  return (
    <div className="split-modal-overlay" onClick={onClose}>
      <div className="split-modal-container" onClick={e => e.stopPropagation()}>
        <div className="split-modal-header">
          <h3 className="modal-title">智能拆图</h3>
          <button className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="split-modal-content">
          {/* 拆分模式选择 */}
          <div className="mode-selector">
            <button 
              className={`mode-btn ${mode === 'grid' ? 'active' : ''}`}
              onClick={() => setMode('grid')}
            >
              网格拆分
            </button>
            <button 
              className={`mode-btn ${mode === 'semantic' ? 'active' : ''}`}
              onClick={() => setMode('semantic')}
            >
              语义拆分
            </button>
          </div>

          {/* 网格拆分选项 */}
          {mode === 'grid' && (
            <div className="options-section">
              <label className="section-label">选择网格</label>
              <div className="grid-options">
                {GRID_OPTIONS.map((opt, idx) => (
                  <button
                    key={idx}
                    className={`option-btn ${selectedGrid.rows === opt.rows && selectedGrid.cols === opt.cols ? 'active' : ''}`}
                    onClick={() => setSelectedGrid(opt)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 语义拆分选项 */}
          {mode === 'semantic' && (
            <div className="options-section">
              <label className="section-label">拆分数量</label>
              <div className="count-options">
                {SEMANTIC_COUNT_OPTIONS.map((opt, idx) => (
                  <button
                    key={idx}
                    className={`option-btn ${selectedCount.count === opt.count ? 'active' : ''}`}
                    onClick={() => setSelectedCount(opt)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 预览区域 */}
          <div className="preview-section">
            <label className="section-label">预览效果</label>
            {isLoading ? (
              <div className="preview-loading">正在生成预览...</div>
            ) : error ? (
              <div className="preview-error">{error}</div>
            ) : previewImages.length > 0 ? (
              <div className="preview-grid">
                {previewImages.map((img, idx) => (
                  <div key={idx} className="preview-item">
                    <img src={img} alt={`片段 ${idx + 1}`} />
                    <span className="preview-index">{idx + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="preview-empty">无法生成预览</div>
            )}
            {previewImages.length > 0 && (
              <div className="preview-count">将生成 {previewImages.length} 张子图</div>
            )}
          </div>
        </div>

        <div className="split-modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            取消
          </button>
          <button 
            className="confirm-btn" 
            onClick={handleConfirm}
            disabled={previewImages.length === 0 || isLoading}
          >
            确认拆分
          </button>
        </div>
      </div>
    </div>
  );
};

export default SplitImageModal;

