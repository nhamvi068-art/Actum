import React, { useState, useEffect, useRef, useMemo } from 'react';
import './TaskNotificationPanel.scss';
import { useTaskQueue, useTaskActions } from '@drawnix/drawnix';
import {
  History,
  Copy,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  AlertCircle,
  X,
  CheckCircle2,
  Loader2,
  Download,
} from 'lucide-react';

// 兼容旧的 ImageTask 类型
interface ImageTask {
  id: string;
  status: 'pending' | 'submitting' | 'generating' | 'completed' | 'failed';
  prompt: string;
  model?: string;
  aspectRatio?: string;
  imageSize?: string;
  referenceImages?: string[];
  placeholderInfo?: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    aspectRatio: string;
    imageUrl?: string;
  };
  resultImageUrl?: string;
  originalUrl?: string;
  localAssetId?: string;
  error?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  progress?: number;
  cancelled?: boolean;
}

// 映射状态到模板状态
type FilterStatus = 'all' | 'success' | 'generating' | 'failed';

const mapStatusToFilter = (status: ImageTask['status']): FilterStatus => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'generating':
    case 'submitting':
    case 'pending':
      return 'generating';
    case 'failed':
      return 'failed';
    default:
      return 'all';
  }
};

export interface TaskListButtonProps {
  projectId: string;
  onTaskRedo?: (task: ImageTask) => void;
  onTaskClick?: (task: ImageTask) => void;
}

export const TaskListButton: React.FC<TaskListButtonProps> = ({
  projectId,
  onTaskRedo,
  onTaskClick,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { allTasks } = useTaskQueue();
  const { deleteTask: deleteTaskAction } = useTaskActions();

  // 获取所有任务（不筛选状态）
  const tasks = useMemo(() => {
    const projectTasks = allTasks
      .filter(t => t.workspaceId === projectId)
      .map(t => ({
        ...t,
        projectId: t.workspaceId || projectId,
        createdAt: new Date(t.createdAt).toISOString(),
        updatedAt: new Date(t.updatedAt).toISOString(),
        resultImageUrl: t.result?.remoteUrl
      }));
    return projectTasks.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [allTasks, projectId]);

  // 筛选逻辑
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const filterStatus = mapStatusToFilter(task.status);
      return filter === 'all' || filterStatus === filter;
    });
  }, [tasks, filter]);

  // 处理点击外部关闭弹窗
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 格式化时间
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    const intervals = [
      { label: '年', seconds: 31536000 },
      { label: '月', seconds: 2592000 },
      { label: '周', seconds: 604800 },
      { label: '天', seconds: 86400 },
      { label: '小时', seconds: 3600 },
      { label: '分钟', seconds: 60 },
      { label: '秒', seconds: 1 },
    ];

    for (const interval of intervals) {
      const count = Math.floor(seconds / interval.seconds);
      if (count >= 1) {
        return `${count}${interval.label}前`;
      }
    }
    return '刚刚';
  };

  // 处理重做
  const handleRedo = async (task: ImageTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onTaskRedo) {
      onTaskRedo(task);
    }
  };

  // 处理删除
  const handleDelete = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteTaskAction(taskId);
  };

  // 处理复制提示词
  const handleCopyPrompt = (task: ImageTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.prompt) {
      navigator.clipboard.writeText(task.prompt);
    }
  };

  // 处理下载图片
  const handleDownload = async (task: ImageTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.resultImageUrl) {
      try {
        const response = await fetch(task.resultImageUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `generated-image-${task.id}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Download failed:', error);
      }
    }
  };

  // 清空全部
  const handleClearAll = () => {
    tasks.forEach(task => {
      deleteTaskAction(task.id);
    });
  };

  // 获取显示状态
  const getDisplayStatus = (task: ImageTask) => {
    return mapStatusToFilter(task.status);
  };

  return (
    <div className="history-panel-container">
      {/* 触发按钮 */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="history-trigger-btn"
      >
        <History className="history-icon" />
        <span className="history-label">历史记录</span>
        {tasks.length > 0 && (
          <span className="history-badge">{tasks.length}</span>
        )}
      </button>

      {/* 弹窗面板 */}
      {isOpen && (
        <div ref={popupRef} className="history-popup">
          {/* 头部与筛选 */}
          <div className="history-popup-header">
            <div className="history-popup-title-row">
              <div className="history-popup-title-wrap">
                <h3 className="history-popup-title">生成记录</h3>
                <span className="history-popup-count">{tasks.length}</span>
              </div>
              <button
                onClick={handleClearAll}
                className="history-clear-btn"
              >
                清空全部
              </button>
            </div>

            {/* 状态筛选 Tabs */}
            <div className="history-filter-tabs">
              {(['all', 'success', 'generating', 'failed'] as FilterStatus[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`history-filter-tab ${filter === type ? 'history-filter-tab--active' : ''}`}
                >
                  {type === 'all' && '全部'}
                  {type === 'success' && '成功'}
                  {type === 'generating' && '生成中'}
                  {type === 'failed' && '失败'}
                </button>
              ))}
            </div>
          </div>

          {/* 列表区域 */}
          <div className="history-popup-content">
            {filteredTasks.length === 0 ? (
              <div className="history-empty">
                <History className="history-empty-icon" />
                <p className="history-empty-text">暂无符合条件的记录</p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const displayStatus = getDisplayStatus(task);
                return (
                  <div
                    key={task.id}
                    className={`history-item ${displayStatus === 'failed' ? 'history-item--failed' : ''}`}
                    onClick={() => onTaskClick && onTaskClick(task)}
                  >
                    {/* 上半部分：图片 + 提示词 + 操作 */}
                    <div className="history-item-main">
                      {/* 动态缩略图展示 */}
                      <div className={`history-item-thumb ${displayStatus === 'failed' ? 'history-item-thumb--failed' : displayStatus === 'success' ? 'history-item-thumb--success' : 'history-item-thumb--generating'}`}>
                        {displayStatus === 'success' && task.resultImageUrl ? (
                          <img src={task.resultImageUrl} alt="Generated" className="history-item-thumb-img" />
                        ) : displayStatus === 'generating' ? (
                          <Loader2 className="history-item-spinner" />
                        ) : (
                          <ImageIcon className="history-item-thumb-icon" />
                        )}
                      </div>

                      {/* 内容区 */}
                      <div className="history-item-content">
                        <p className={`history-item-prompt ${displayStatus === 'failed' ? 'history-item-prompt--failed' : ''}`} title={task.prompt}>
                          {task.prompt}
                        </p>

                        <div className="history-item-meta">
                          <div className="history-item-status-wrap">
                            {displayStatus === 'failed' && (
                              <span className="history-item-status history-item-status--failed">
                                <X className="history-item-status-icon" />
                                失败
                              </span>
                            )}
                            {displayStatus === 'success' && (
                              <span className="history-item-status history-item-status--success">
                                <CheckCircle2 className="history-item-status-icon" />
                                成功
                              </span>
                            )}
                            {displayStatus === 'generating' && (
                              <span className="history-item-status history-item-status--generating">
                                <Loader2 className="history-item-status-icon history-item-status-icon--spinning" />
                                {task.status === 'pending' ? '等待中' : '生成中'}
                              </span>
                            )}
                            <span className="history-item-time">{formatTimeAgo(task.createdAt)}</span>
                          </div>

                          {/* 悬浮显示的操作按钮组 */}
                          <div className="history-item-actions">
                            {displayStatus === 'success' && (
                              <button
                                onClick={(e) => handleDownload(task, e)}
                                className="history-item-action-btn"
                                title="下载图片"
                              >
                                <Download className="history-item-action-icon" />
                              </button>
                            )}
                            <button
                              onClick={(e) => handleCopyPrompt(task, e)}
                              className="history-item-action-btn"
                              title="复制提示词"
                            >
                              <Copy className="history-item-action-icon" />
                            </button>
                            {displayStatus === 'failed' && (
                              <button
                                onClick={(e) => handleRedo(task, e)}
                                className="history-item-action-btn history-item-action-btn--success"
                                title="重试"
                              >
                                <RefreshCw className="history-item-action-icon" />
                              </button>
                            )}
                            <button
                              onClick={(e) => handleDelete(task.id, e)}
                              className="history-item-action-btn history-item-action-btn--danger"
                              title="删除"
                            >
                              <Trash2 className="history-item-action-icon" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 下半部分：错误提示与引导 (仅失败状态可见) */}
                    {displayStatus === 'failed' && task.error && (
                      <div className="history-item-error">
                        <div className="history-item-error-content">
                          <AlertCircle className="history-item-error-icon" />
                          <span className="history-item-error-text">{task.error}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskListButton;
