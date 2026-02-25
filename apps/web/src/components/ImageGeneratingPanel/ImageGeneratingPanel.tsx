import React from 'react';
import './ImageGeneratingPanel.scss';

export interface ImageGeneratingPanelProps {
  isGenerating: boolean;
  prompt: string;
  model: string;
  onCancel?: () => void;
}

export const ImageGeneratingPanel: React.FC<ImageGeneratingPanelProps> = ({
  isGenerating,
  prompt,
  model,
  onCancel,
}) => {
  if (!isGenerating) return null;

  return (
    <div className="image-generating-panel">
      <div className="image-generating-panel__content">
        <div className="image-generating-panel__header">
          <div className="image-generating-panel__spinner">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
          </div>
          <span className="image-generating-panel__title">AI 正在生成图片...</span>
        </div>
        
        <div className="image-generating-panel__info">
          <div className="image-generating-panel__row">
            <span className="image-generating-panel__label">模型:</span>
            <span className="image-generating-panel__value">{model}</span>
          </div>
          <div className="image-generating-panel__row">
            <span className="image-generating-panel__label">提示词:</span>
            <span className="image-generating-panel__value image-generating-panel__prompt">{prompt}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

