import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CloseIcon } from './icons';
import {
    detectAndSliceGridWithResult,
    loadImageFromBlob,
    revokeBlobUrl,
    blobToObjectURL,
    revokeObjectURL,
    revokeObjectURLs,
    SliceResult,
    SplitResult
} from '../utils/image-splitter';
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
  /** 【重构 v2】改用 Blob 替代 Base64，防止 OOM */
  imageBlob: Blob;
  imageWidth?: number;
  imageHeight?: number;
  onClose: () => void;
  /** 【重构 v2】回调参数改为 SliceResult[]，包含 Blob 和坐标 */
  onConfirm: (slices: SliceResult[], options: SplitImageOptions) => void;
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

/**
 * 【重构 v3】使用递归 XY-Cut 算法智能拆分
 *
 * @returns SplitResult 包含 success、slices、sliceCount、errorMessage
 */
const smartSplitWithResult = async (
    imageBlob: Blob,
    options?: {
        blankThreshold?: number;
        minSliceArea?: number;
        minGap?: number;
    }
): Promise<SplitResult> => {
    const image = await loadImageFromBlob(imageBlob);
    try {
        // 使用新的 detectAndSliceGridWithResult 获取带状态的结果
        return await detectAndSliceGridWithResult(image, {
            blankThreshold: options?.blankThreshold ?? 240,
            minSliceArea: options?.minSliceArea ?? 1000,
            minGap: options?.minGap ?? 5,
            enableTrim: true
        });
    } finally {
        revokeBlobUrl(image);
    }
};

/**
 * 【重构 v3】网格拆分
 * 使用智能检测 + 降级方案
 */
const splitImageByGrid = async (
    imageBlob: Blob,
    rows: number,
    cols: number
): Promise<{ slices: SliceResult[]; usedForceSplit: boolean }> => {
    // 先尝试智能检测
    const smartResult = await smartSplitWithResult(imageBlob);

    if (smartResult.success && smartResult.slices.length >= rows * cols) {
        // 智能检测成功且切片数量足够
        return { slices: smartResult.slices.slice(0, rows * cols), usedForceSplit: false };
    }

    // 降级：强制按网格分割
    const image = await loadImageFromBlob(imageBlob);
    try {
        const slices = await forceGridSplitWithBlobs(image, rows, cols);
        return { slices, usedForceSplit: true };
    } finally {
        revokeBlobUrl(image);
    }
};

/**
 * 同步版本的强制网格分割（返回带 blob 的结果）
 */
const forceGridSplitWithBlobs = async (
    image: HTMLImageElement,
    rows: number,
    cols: number
): Promise<SliceResult[]> => {
    const { width, height } = image;
    const cellWidth = Math.floor(width / cols);
    const cellHeight = Math.floor(height / rows);
    const results: SliceResult[] = [];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = c * cellWidth;
            const y = r * cellHeight;
            const w = c === cols - 1 ? width - x : cellWidth;
            const h = r === rows - 1 ? height - y : cellHeight;

            // 创建切片 canvas
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            ctx.drawImage(image, x, y, w, h, 0, 0, w, h);

            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), 'image/png');
            });

            if (blob) {
                results.push({
                    blob,
                    rect: { x, y, w, h, rowIndex: r, colIndex: c }
                });
            }
        }
    }

    return results;
};

/**
 * 【重构 v3】语义拆分
 */
const semanticSplit = async (
    imageBlob: Blob,
    count: number
): Promise<{ slices: SliceResult[]; usedForceSplit: boolean }> => {
    // 先尝试智能检测
    const smartResult = await smartSplitWithResult(imageBlob);

    if (smartResult.success && smartResult.slices.length >= count) {
        return { slices: smartResult.slices.slice(0, count), usedForceSplit: false };
    }

    // 降级：按 count 均分
    const image = await loadImageFromBlob(imageBlob);
    try {
        const sqrtCount = Math.ceil(Math.sqrt(count));
        const cols = sqrtCount;
        const rows = Math.ceil(count / cols);
        const slices = await forceGridSplitWithBlobs(image, rows, cols);
        return { slices, usedForceSplit: true };
    } finally {
        revokeBlobUrl(image);
    }
};

const SplitImageModal: React.FC<SplitImageModalProps> = ({
  visible,
  imageBlob,
  imageWidth,
  imageHeight,
  onClose,
  onConfirm,
}) => {
  const [mode, setMode] = useState<SplitMode>('grid');
  const [selectedGrid, setSelectedGrid] = useState(GRID_OPTIONS[1]); // 默认 3x3
  const [selectedCount, setSelectedCount] = useState(SEMANTIC_COUNT_OPTIONS[1]); // 默认 5

  /** 【重构 v2】使用 ObjectURL 数组替代 Base64 数组，防止 OOM */
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const previewUrlsRef = useRef<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slices, setSlices] = useState<SliceResult[]>([]);
  const [usedForceSplit, setUsedForceSplit] = useState(false);

  /** 生成预览 */
  const generatePreview = useCallback(async () => {
    if (!imageBlob) return;

    // 【重构 v2】清理之前的 ObjectURL
    revokeObjectURLs(previewUrlsRef.current);
    previewUrlsRef.current = [];
    setPreviewUrls([]);
    setSlices([]);
    setError(null);
    setUsedForceSplit(false);

    setIsLoading(true);

    try {
      let result: { slices: SliceResult[]; usedForceSplit: boolean };

      if (mode === 'grid') {
        result = await splitImageByGrid(imageBlob, selectedGrid.rows, selectedGrid.cols);
      } else {
        result = await semanticSplit(imageBlob, selectedCount.count);
      }

      const { slices: splitSlices, usedForceSplit: forceSplit } = result;
      setUsedForceSplit(forceSplit);
      setSlices(splitSlices);

      // 【重构 v3】结果校验
      if (splitSlices.length === 0) {
        setError('未能检测到有效的分割区域，图片可能不具备可拆分的宫格结构。');
        return;
      }

      // 如果使用了降级方案，提示用户
      if (forceSplit) {
        console.info('[SplitImageModal] 智能检测未能找到分割线，已使用均分方案替代');
      }

      // 将 Blob 转换为 ObjectURL 用于预览
      const urls = splitSlices.map(s => blobToObjectURL(s.blob));
      previewUrlsRef.current = urls;
      setPreviewUrls(urls);

    } catch (err) {
      // 【重构 v3】CORS 错误友好提示
      const errorMessage = (err as Error).message;
      if (errorMessage.includes('CORS_RESTRICTION') || errorMessage.includes('tainted')) {
        const friendlyMessage = '跨域图片限制：无法读取像素数据进行拆分分析。请先将图片下载至本地，再重新上传进行拆分。';
        setError(friendlyMessage);
        console.error('[SplitImageModal] 跨域图片限制，无法拆分');
      } else {
        setError(errorMessage);
        console.error(`[SplitImageModal] 拆分失败: ${errorMessage}`);
      }
      setPreviewUrls([]);
    } finally {
      setIsLoading(false);
    }
  }, [imageBlob, mode, selectedGrid, selectedCount]);

  // 模式或选项变化时重新生成预览
  useEffect(() => {
    if (visible) {
      generatePreview();
    }
  }, [visible, generatePreview]);

  /** 【重构 v2】组件卸载时释放所有 ObjectURL */
  useEffect(() => {
    return () => {
      revokeObjectURLs(previewUrlsRef.current);
      previewUrlsRef.current = [];
    };
  }, []);

  const handleConfirm = () => {
    if (slices.length === 0) {
      setError('没有可拆分的子图，请检查图片格式');
      return;
    }

    const options: SplitImageOptions = mode === 'grid'
      ? { mode: 'grid', rows: selectedGrid.rows, cols: selectedGrid.cols }
      : { mode: 'semantic', count: selectedCount.count };

    console.info(`[SplitImageModal] 智能拆图成功！已拆分为 ${slices.length} 个子图`);
    onConfirm(slices, options);
  };

  // 关闭时清理
  const handleClose = () => {
    revokeObjectURLs(previewUrlsRef.current);
    previewUrlsRef.current = [];
    setPreviewUrls([]);
    setSlices([]);
    onClose();
  };

  if (!visible) return null;

  return (
    <div className="split-modal-overlay" onClick={handleClose}>
      <div className="split-modal-container" onClick={e => e.stopPropagation()}>
        <div className="split-modal-header">
          <h3 className="modal-title">智能拆图</h3>
          <button className="modal-close-btn" onClick={handleClose}>
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
              <div className="preview-loading">正在分析图片并生成预览...</div>
            ) : error ? (
              <div className="preview-error">{error}</div>
            ) : previewUrls.length > 0 ? (
              <div className="preview-grid">
                {previewUrls.map((url, idx) => (
                  <div key={idx} className="preview-item">
                    <img src={url} alt={`片段 ${idx + 1}`} />
                    <span className="preview-index">{idx + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="preview-empty">无法生成预览</div>
            )}
            {previewUrls.length > 0 && (
              <div className="preview-count">将生成 {previewUrls.length} 张子图</div>
            )}
          </div>
        </div>

        <div className="split-modal-footer">
          <button className="cancel-btn" onClick={handleClose}>
            取消
          </button>
          <button
            className="confirm-btn"
            onClick={handleConfirm}
            disabled={slices.length === 0 || isLoading}
          >
            确认拆分
          </button>
        </div>
      </div>
    </div>
  );
};

export default SplitImageModal;
