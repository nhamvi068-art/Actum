import { useLiveQuery } from 'dexie-react-hooks';
import { db, TaskData } from '../services/db/app-database';

/**
 * 任务队列 Hook - 响应式监听 IndexedDB 中的任务
 * 使用 Dexie 的 useLiveQuery 实现响应式更新
 */
export const useTaskQueue = () => {
  // 监听所有任务的变化
  const allTasks = useLiveQuery(
    () => db.tasks.orderBy('updatedAt').reverse().toArray(),
    []
  );

  // 筛选活跃任务 (pending, submitting, generating)
  const activeTasks = allTasks?.filter(
    t => t.status === 'pending' || t.status === 'submitting' || t.status === 'generating'
  ) || [];

  // 获取特定工作区的任务
  const getTasksByWorkspace = (workspaceId: string) => {
    return allTasks?.filter(t => t.workspaceId === workspaceId) || [];
  };

  // 获取单个任务
  const getTask = (taskId: string) => {
    return allTasks?.find(t => t.id === taskId);
  };

  return {
    allTasks: allTasks || [],
    activeTasks,
    totalCount: allTasks?.length || 0,
    getTasksByWorkspace,
    getTask,
  };
};

/**
 * 使用工作区 ID 过滤的任务队列 Hook
 */
export const useTaskQueueByWorkspace = (workspaceId?: string) => {
  const tasks = useLiveQuery(
    () => {
      if (!workspaceId) {
        return db.tasks.orderBy('updatedAt').reverse().toArray();
      }
      return db.tasks
        .where('workspaceId')
        .equals(workspaceId)
        .reverse()
        .sortBy('updatedAt');
    },
    [workspaceId]
  );

  const activeTasks = tasks?.filter(
    t => t.status === 'pending' || t.status === 'submitting' || t.status === 'generating'
  ) || [];

  return {
    tasks: tasks || [],
    activeTasks,
    totalCount: tasks?.length || 0,
  };
};

/**
 * 活跃任务 Hook - 只返回正在处理的任务
 */
export const useActiveTasks = () => {
  const tasks = useLiveQuery(
    () => db.tasks
      .where('status')
      .anyOf(['pending', 'submitting', 'generating'])
      .toArray(),
    []
  );

  return tasks || [];
};

/**
 * 单个任务 Hook - 监听特定任务的变化
 */
export const useTask = (taskId: string | undefined) => {
  const task = useLiveQuery(
    () => taskId ? db.tasks.get(taskId) : undefined,
    [taskId]
  );

  return task;
};

/**
 * 任务操作 Hook - 提供创建、更新、取消、重试等功能
 */
export const useTaskActions = () => {
  // 创建新任务
  const createTask = async (
    type: TaskData['type'],
    prompt: string,
    workspaceId?: string,
    params?: TaskData['params'],
    model?: string
  ): Promise<string> => {
    const now = Date.now();
    const taskId = `task_${now}_${Math.random().toString(36).substring(2, 9)}`;
    
    await db.tasks.add({
      id: taskId,
      type,
      status: 'pending',
      prompt,
      model,
      params,
      progress: 0,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      workspaceId
    });

    return taskId;
  };

  // 更新任务状态
  const updateTaskStatus = async (
    taskId: string,
    status: TaskData['status'],
    result?: TaskData['result'],
    error?: string
  ) => {
    await db.tasks.update(taskId, {
      status,
      result,
      error,
      progress: status === 'completed' ? 100 : undefined,
      updatedAt: Date.now()
    });
  };

  // 更新任务进度
  const updateTaskProgress = async (taskId: string, progress: number) => {
    await db.tasks.update(taskId, {
      progress: Math.min(100, Math.max(0, progress)),
      updatedAt: Date.now()
    });
  };

  // 取消任务
  const cancelTask = async (taskId: string) => {
    await db.tasks.update(taskId, {
      status: 'failed',
      error: 'Cancelled by user',
      updatedAt: Date.now()
    });
  };

  // 重试任务
  const retryTask = async (taskId: string) => {
    const task = await db.tasks.get(taskId);
    if (task) {
      await db.tasks.update(taskId, {
        status: 'pending',
        error: undefined,
        progress: 0,
        retryCount: task.retryCount + 1,
        updatedAt: Date.now()
      });
    }
  };

  // 删除任务
  const deleteTask = async (taskId: string) => {
    console.log('[DEBUG useTaskActions] deleteTask called', { taskId });
    try {
      await db.tasks.delete(taskId);
      console.log('[DEBUG useTaskActions] Task deleted from DB:', taskId);
    } catch (error) {
      console.error('[DEBUG useTaskActions] Failed to delete task:', error);
      throw error;
    }
  };

  // 清理已完成/失败的任务
  const cleanOldTasks = async (daysOld = 7) => {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const oldTasks = await db.tasks
      .where('updatedAt')
      .below(cutoffTime)
      .and(t => t.status === 'completed' || t.status === 'failed')
      .toArray();

    const ids = oldTasks.map(t => t.id);
    if (ids.length > 0) {
      await db.tasks.bulkDelete(ids);
    }

    return ids.length;
  };

  return {
    createTask,
    updateTaskStatus,
    updateTaskProgress,
    cancelTask,
    retryTask,
    deleteTask,
    cleanOldTasks
  };
};
