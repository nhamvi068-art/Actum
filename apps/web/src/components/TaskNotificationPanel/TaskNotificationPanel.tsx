import React, { useState, useEffect, useCallback } from 'react';
import './TaskNotificationPanel.scss';
import {
  ImageTask,
  getAllTasks,
  deleteTask,
  clearFinishedTasks,
  subscribeToTasks,
} from '../../services/taskManager';

export interface TaskNotificationPanelProps {
  projectId: string;
  onTaskRetry?: (task: ImageTask) => void;
  onTaskClick?: (task: ImageTask) => void;
}

export const TaskNotificationPanel: React.FC<TaskNotificationPanelProps> = ({
  projectId,
  onTaskRetry,
  onTaskClick,
}) => {
  const [tasks, setTasks] = useState<ImageTask[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

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

  const getStatusIcon = (status: ImageTask['status']) => {
    switch (status) {
      case 'pending':
        return (
          <svg className="task-status-icon task-status-icon--pending" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        );
      case 'generating':
        return (
          <svg className="task-status-icon task-status-icon--generating" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
          </svg>
        );
      case 'completed':
        return (
          <svg className="task-status-icon task-status-icon--completed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="9 12 12 15 16 10"/>
          </svg>
        );
      case 'failed':
        return (
          <svg className="task-status-icon task-status-icon--failed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        );
    }
  };

  const getStatusText = (status: ImageTask['status']) => {
    switch (status) {
      case 'pending':
        return '等待中';
      case 'generating':
        return '生成中...';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
    }
  };

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

  const handleRetry = async (task: ImageTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onTaskRetry) {
      onTaskRetry(task);
    }
  };

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

  const handleClearFinished = async () => {
    await clearFinishedTasks(projectId);
    const allTasks = await getAllTasks();
    const projectTasks = allTasks.filter(t => t.projectId === projectId);
    projectTasks.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setTasks(projectTasks);
  };

  const activeCount = tasks.filter(t => t.status === 'pending' || t.status === 'generating').length;
  const failedCount = tasks.filter(t => t.status === 'failed').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className={`task-notification-panel ${isExpanded ? 'task-notification-panel--expanded' : ''}`}>
      <div 
        className="task-notification-panel__header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="task-notification-panel__title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>任务列表</span>
          {activeCount > 0 && (
            <span className="task-notification-panel__badge">{activeCount}</span>
          )}
        </div>
        <div className="task-notification-panel__toggle">
          <svg 
            className={`task-notification-panel__chevron ${isExpanded ? 'task-notification-panel__chevron--up' : ''}`}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {isExpanded && (
        <div className="task-notification-panel__content">
          {tasks.length === 0 ? (
            <div className="task-notification-panel__empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>暂无任务</span>
            </div>
          ) : (
            <div className="task-list">
              {tasks.map((task) => (
                <div 
                  key={task.id} 
                  className={`task-item task-item--${task.status}`}
                  onClick={() => onTaskClick && onTaskClick(task)}
                >
                  <div className="task-item__status">
                    {getStatusIcon(task.status)}
                  </div>
                  
                  <div className="task-item__info">
                    <div className="task-item__prompt">
                      {task.prompt.length > 30 ? `${task.prompt.substring(0, 30)}...` : task.prompt}
                    </div>
                    <div className="task-item__meta">
                      <span className={`task-item__status-text task-item__status-text--${task.status}`}>
                        {getStatusText(task.status)}
                      </span>
                      <span className="task-item__time">
                        {formatTimeAgo(task.createdAt)}
                      </span>
                    </div>
                    
                    {task.status === 'failed' && task.error && (
                      <div className="task-item__error">
                        {task.error}
                      </div>
                    )}
                  </div>

                  <div className="task-item__actions">
                    {task.status === 'generating' && (
                      <div className="task-item__progress">
                        <div className="task-item__progress-bar"></div>
                      </div>
                    )}
                    
                    {task.status === 'failed' && (
                      <>
                        <button 
                          className="task-item__btn task-item__btn--retry"
                          onClick={(e) => handleRetry(task, e)}
                          title="重试"
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
                      <div className="task-item__completed-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(failedCount > 0 || completedCount > 0) && (
            <div className="task-notification-panel__footer">
              <button 
                className="task-notification-panel__clear-btn"
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

export default TaskNotificationPanel;
