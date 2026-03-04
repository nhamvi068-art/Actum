import React, { useState, useEffect, useRef } from 'react';
import './TaskNotificationPanel.scss';
import TaskListIcon from './TaskListIcon';
import {
  ImageTask,
  getAllTasks,
  deleteTask,
  clearFinishedTasks,
  subscribeToTasks,
  cancelTask,
} from '../../services/taskManager';

export interface TaskListButtonProps {
  projectId: string;
  onTaskRetry?: (task: ImageTask) => void;
  onTaskRedo?: (task: ImageTask) => void;
  onTaskClick?: (task: ImageTask) => void;
  onTaskCancel?: (task: ImageTask) => void;
}

export const TaskListButton: React.FC<TaskListButtonProps> = ({
  projectId,
  onTaskRetry,
  onTaskRedo,
  onTaskClick,
  onTaskCancel,
}) => {
  const [tasks, setTasks] = useState<ImageTask[]>([]);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load tasks and subscribe to changes
  useEffect(() => {
    const loadTasks = async () => {
      const allTasks = await getAllTasks();
      const projectTasks = allTasks.filter(t => t.projectId === projectId);
      projectTasks.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setTasks(projectTasks);
    };

    loadTasks();

    const unsubscribe = subscribeToTasks((allTasks) => {
      const projectTasks = allTasks.filter(t => t.projectId === projectId);
      projectTasks.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setTasks(projectTasks);
    }, 2000);

    return () => {
      unsubscribe();
    };
  }, [projectId]);

  // Handle click outside to close popup
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsPopupOpen(false);
      }
    };

    if (isPopupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPopupOpen]);

  // Get status icon
  const getStatusIcon = (status: ImageTask['status']) => {
    switch (status) {
      case 'pending':
        return (
          <svg className="task-status-icon task-status-icon--pending" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        );
      case 'generating':
        return (
          <svg className="task-status-icon task-status-icon--generating" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
          </svg>
        );
      case 'completed':
        return (
          <svg className="task-status-icon task-status-icon--completed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="9 12 12 15 16 10"/>
          </svg>
        );
      case 'failed':
        return (
          <svg className="task-status-icon task-status-icon--failed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        );
    }
  };

  // Get status text
  const getStatusText = (status: ImageTask['status']) => {
    switch (status) {
      case 'pending': return '等待中';
      case 'generating': return '生成中...';
      case 'completed': return '已完成';
      case 'failed': return '失败';
    }
  };

  // Format time ago
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

  // Handle task retry
  const handleRetry = async (task: ImageTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onTaskRetry) {
      onTaskRetry(task);
    }
  };

  // Handle task redo
  const handleRedo = async (task: ImageTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onTaskRedo) {
      onTaskRedo(task);
    }
  };

  // Handle task cancel
  const handleCancel = async (task: ImageTask, e: React.MouseEvent) => {
    e.stopPropagation();
    await cancelTask(task.id);
    if (onTaskCancel) {
      onTaskCancel(task);
    }
    // Reload tasks to update UI
    const allTasks = await getAllTasks();
    const projectTasks = allTasks.filter(t => t.projectId === projectId);
    projectTasks.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setTasks(projectTasks);
  };

  // Handle task delete
  const handleDelete = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteTask(taskId);
    const allTasks = await getAllTasks();
    const projectTasks = allTasks.filter(t => t.projectId === projectId);
    projectTasks.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setTasks(projectTasks);
  };

  // Handle clear finished
  const handleClearFinished = async () => {
    await clearFinishedTasks(projectId);
    const allTasks = await getAllTasks();
    const projectTasks = allTasks.filter(t => t.projectId === projectId);
    projectTasks.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setTasks(projectTasks);
  };

  // Count tasks by status
  const activeCount = tasks.filter(t => t.status === 'pending' || t.status === 'generating').length;
  const failedCount = tasks.filter(t => t.status === 'failed').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="task-list-button-container">
      <button
        ref={buttonRef}
        className={`task-list-button ${isPopupOpen ? 'task-list-button--active' : ''}`}
        onClick={() => setIsPopupOpen(!isPopupOpen)}
        title="任务列表"
      >
        <span className="task-list-button__icon">
          <TaskListIcon />
        </span>
        <span className="task-list-button__label">任务列表</span>
        {activeCount > 0 && (
          <span className="task-list-button__badge">{activeCount}</span>
        )}
      </button>

      {isPopupOpen && (
        <div ref={popupRef} className="task-list-popup">
          {/* Header */}
          <div className="task-list-popup__header">
            <span className="task-list-popup__title">任务列表</span>
            {activeCount > 0 && (
              <span className="task-list-popup__badge">{activeCount}</span>
            )}
          </div>

          {/* Task List */}
          <div className="task-list-popup__content">
            {tasks.length === 0 ? (
              <div className="task-list-popup__empty">
                <TaskListIcon size={32} strokeWidth={1.5} />
                <span>暂无任务</span>
              </div>
            ) : (
              <div className="task-list-popup__items">
                {tasks.map((task) => (
                  <div 
                    key={task.id} 
                    className={`task-item task-item--${task.status}`}
                    onClick={() => onTaskClick && onTaskClick(task)}
                  >
                    {/* Thumbnail */}
                    <div className="task-item__thumbnail">
                      {task.status === 'completed' && task.resultImageUrl ? (
                        <img src={task.resultImageUrl} alt="thumbnail" />
                      ) : (
                        <div className="task-item__thumbnail-placeholder">
                          {getStatusIcon(task.status)}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="task-item__info">
                      <div className="task-item__prompt">
                        {task.prompt.length > 25 ? `${task.prompt.substring(0, 25)}...` : task.prompt}
                      </div>
                      <div className="task-item__meta">
                        <span className={`task-item__status-text task-item__status-text--${task.status}`}>
                          {getStatusText(task.status)}
                        </span>
                        <span className="task-item__time">
                          {formatTimeAgo(task.createdAt)}
                        </span>
                      </div>
                      
                      {/* Error message */}
                      {task.status === 'failed' && task.error && (
                        <div className="task-item__error">
                          {task.error}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="task-item__actions">
                      {task.status === 'generating' && (
                        <>
                          <div className="task-item__progress">
                            <div className="task-item__progress-bar"></div>
                          </div>
                          <button
                            className="task-item__btn task-item__btn--cancel"
                            onClick={(e) => handleCancel(task, e)}
                            title="取消"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </>
                      )}
                      
                      {task.status === 'failed' && (
                        <>
                          <button 
                            className="task-item__btn task-item__btn--redo"
                            onClick={(e) => handleRedo(task, e)}
                            title="重做"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="23 4 23 10 17 10"/>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                          </button>
                          <button 
                            className="task-item__btn task-item__btn--delete"
                            onClick={(e) => handleDelete(task.id, e)}
                            title="删除"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </>
                      )}
                      
                      {task.status === 'completed' && (
                        <>
                          <button
                            className="task-item__btn task-item__btn--redo"
                            onClick={(e) => handleRedo(task, e)}
                            title="重做"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="23 4 23 10 17 10"/>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                          </button>
                          <div className="task-item__completed-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {(failedCount > 0 || completedCount > 0) && (
            <div className="task-list-popup__footer">
              <button 
                className="task-list-popup__clear-btn"
                onClick={handleClearFinished}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                清除已完成任务
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskListButton;
