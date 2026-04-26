import React from 'react';
import { EditOutlined, ResizeOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { CanvasImageItem } from '../types/ImageItem';

// 原Props类型（仅保留编辑相关）
export interface CanvasImageToolbarProps {
  image: CanvasImageItem; // 当前编辑的图片
  isLocked: boolean; // 是否锁定（编辑时禁止调整）
  onEditPrompt: (id: string, newPrompt: string) => void; // 编辑Prompt回调
  onResize: (id: string) => void; // 调整尺寸回调
  onToggleLock: (id: string) => void; // 锁定/解锁（编辑权限控制）
}

const CanvasImageToolbar: React.FC<CanvasImageToolbarProps> = ({
  image,
  isLocked,
  onEditPrompt,
  onResize,
  onToggleLock
}) => {
  // 原编辑Prompt的临时状态（原文件核心逻辑）
  const [editPrompt, setEditPrompt] = React.useState(image.prompt);
  const [showEditModal, setShowEditModal] = React.useState(false);

  // 原确认修改Prompt的逻辑
  const handleConfirmEdit = () => {
    onEditPrompt(image.id, editPrompt);
    setShowEditModal(false);
  };

  return (
    <>
      {/* 原工具栏中编辑相关按钮（仅保留编辑功能） */}
      <div className="canvas-image-toolbar">
        {/* 编辑Prompt按钮（原文件核心编辑功能） */}
        <button 
          className="toolbar-btn" 
          title="编辑生成prompt" 
          onClick={() => setShowEditModal(true)}
          disabled={isLocked} // 锁定时禁止编辑
        >
          <EditOutlined />
        </button>

        {/* 调整尺寸按钮（原文件核心编辑功能） */}
        <button 
          className="toolbar-btn" 
          title="调整图片尺寸" 
          onClick={() => onResize(image.id)}
          disabled={isLocked} // 锁定时禁止调整
        >
          <ResizeOutlined />
        </button>

        {/* 锁定/解锁按钮（编辑权限控制，原文件逻辑） */}
        <button 
          className="toolbar-btn" 
          title={isLocked ? "解锁图片（可编辑）" : "锁定图片（禁止编辑）"} 
          onClick={() => onToggleLock(image.id)}
        >
          {isLocked ? <UnlockOutlined /> : <LockOutlined />}
        </button>
      </div>

      {/* 原编辑Prompt弹窗（原文件完整逻辑） */}
      {showEditModal && (
        <div className="prompt-edit-modal">
          <div className="modal-header">
            <h3>编辑生成Prompt</h3>
            <button onClick={() => setShowEditModal(false)}>×</button>
          </div>
          <textarea
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            placeholder="输入新的prompt（支持中英文）..."
            rows={4}
            className="prompt-textarea"
          />
          <div className="modal-footer">
            <button onClick={() => setShowEditModal(false)} className="modal-btn cancel-btn">取消</button>
            <button onClick={handleConfirmEdit} className="modal-btn confirm-btn">确认修改</button>
          </div>
        </div>
      )}
    </>
  );
};

export default CanvasImageToolbar;










