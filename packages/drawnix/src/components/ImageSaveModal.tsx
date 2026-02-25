import React from 'react';
import { 
  UploadOutlined, 
  FileAddOutlined, 
  DownloadOutlined,
  CloseIcon
} from './icons';
import '../styles/ImageSaveModal.css';

interface ImageSaveModalProps {
  visible: boolean;
  onClose: () => void;
  editedImageBase64: string;
  onCoverOriginal: () => void;
  onInsertNew: () => void;
  onDownloadLocal: () => void;
}

const ImageSaveModal: React.FC<ImageSaveModalProps> = ({
  visible,
  onClose,
  editedImageBase64,
  onCoverOriginal,
  onInsertNew,
  onDownloadLocal
}) => {
  if (!visible) return null;

  const handleDownload = () => {
    if (!editedImageBase64) return;
    const link = document.createElement('a');
    link.href = editedImageBase64;
    link.download = `edited-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onDownloadLocal();
    onClose();
  };

  return (
    <div className="save-modal-overlay">
      <div className="save-modal-container">
        <div className="save-modal-header">
          <h3 className="modal-title">保存图片</h3>
          <button className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="save-modal-content">
          <button 
            className="save-option-btn"
            onClick={() => { onCoverOriginal(); onClose(); }}
          >
            <div className="option-icon">
              <UploadOutlined />
            </div>
            <div className="option-text">
              <div className="option-title">覆盖原图</div>
              <div className="option-desc">替换画布中的原图片</div>
            </div>
          </button>

          <button 
            className="save-option-btn"
            onClick={() => { onInsertNew(); onClose(); }}
          >
            <div className="option-icon">
              <FileAddOutlined />
            </div>
            <div className="option-text">
              <div className="option-title">插入新图片</div>
              <div className="option-desc">在画布中插入编辑后的图片</div>
            </div>
          </button>

          <button 
            className="save-option-btn"
            onClick={handleDownload}
          >
            <div className="option-icon">
              <DownloadOutlined />
            </div>
            <div className="option-text">
              <div className="option-title">下载到本地</div>
              <div className="option-desc">保存编辑后的图片到本地</div>
            </div>
          </button>
        </div>

        <div className="save-modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageSaveModal;

