import { useState, useEffect, useCallback, useRef } from 'react';
import { liveQuery, Subscription } from 'dexie';
import { TaskData } from '../services/db/app-database';
import { taskStorageService } from '../services/db/task-storage-service';

/**
 * 任务状态同步 Hook
 * 监听 IndexedDB 中任务状态的变化
 */
export const useWorkflowStatusSync = () => {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [lastCompletedTask, setLastCompletedTask] = useState<TaskData | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);

  // 使用 Dexie liveQuery 监听任务变化
  useEffect(() => {
    const initLiveQuery = async () => {
      try {
        // liveQuery 会自动监听 IndexedDB 变化
        const observable = liveQuery(() => 
          taskStorageService.getAllTasks()
        );
        
        subscriptionRef.current = observable.subscribe({
          next: (updatedTasks: TaskData[]) => {
            setTasks(updatedTasks);
            
            // 查找最新完成的任务
            const completed = updatedTasks.find(
              (t: TaskData) => t.status === 'completed' && t.result
            );
            if (completed) {
              setLastCompletedTask(completed);
            }
          },
          error: (error: Error) => {
            console.error('[useWorkflowStatusSync] Query error:', error);
          }
        });
      } catch (error) {
        console.error('[useWorkflowStatusSync] Failed to init liveQuery:', error);
        // 降级到轮询模式
        startPolling();
      }
    };

    initLiveQuery();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // 降级轮询模式
  const startPolling = useCallback(() => {
    setIsPolling(true);
    
    const poll = async () => {
      try {
        const updatedTasks = await taskStorageService.getAllTasks();
        setTasks(updatedTasks);
        
        const completed = updatedTasks.find(
          t => t.status === 'completed' && t.result
        );
        if (completed) {
          setLastCompletedTask(completed);
        }
      } catch (error) {
        console.error('[useWorkflowStatusSync] Polling error:', error);
      }
    };

    pollingIntervalRef.current = setInterval(poll, 2000);
  }, []);

  // 刷新任务列表
  const refreshTasks = useCallback(async () => {
    try {
      const updatedTasks = await taskStorageService.getAllTasks();
      setTasks(updatedTasks);
    } catch (error) {
      console.error('[useWorkflowStatusSync] Refresh error:', error);
    }
  }, []);

  // 创建新任务
  const createTask = useCallback(async (
    type: TaskData['type'],
    prompt: string,
    workspaceId?: string
  ): Promise<string> => {
    const taskId = await taskStorageService.createTask({
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type,
      status: 'pending',
      prompt,
      workspaceId
    });
    await refreshTasks();
    return taskId;
  }, [refreshTasks]);

  // 更新任务状态
  const updateTask = useCallback(async (
    id: string,
    status: TaskData['status'],
    result?: TaskData['result'],
    error?: string
  ) => {
    await taskStorageService.updateTaskStatus(id, status, { result, error });
    await refreshTasks();
  }, [refreshTasks]);

  // 清除最后完成的任务状态
  const clearLastCompleted = useCallback(() => {
    setLastCompletedTask(null);
  }, []);

  return {
    tasks,
    lastCompletedTask,
    isPolling,
    refreshTasks,
    createTask,
    updateTask,
    clearLastCompleted
  };
};
