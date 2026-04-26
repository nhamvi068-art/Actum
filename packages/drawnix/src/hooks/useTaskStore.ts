/**
 * useTaskStore Hook
 *
 * 封装对全局 Task Store 的响应式订阅和操作
 * 供 React 组件使用
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GenerationTask,
  TaskStatus,
  addTask,
  updateTaskMemory,
  updateTaskProgressMemory,
  updateTaskStatusMemory,
  completeTaskMemory,
  failTaskMemory,
  removeTaskMemory,
  getTask,
  getAllTasksMemory,
  getActiveTasksMemory,
  getCompletedTasksMemory,
  getFailedTasksMemory,
  clearAllTasksMemory,
  clearFinishedTasksMemory,
  createTaskMemory,
  generateTaskIdMemory,
  onTaskAdded,
  onTaskUpdated,
  onTaskRemoved,
  onAnyTaskChange,
  CreateTaskParams,
} from '../services/task-store';

/**
 * useTaskStore - 订阅全局任务状态
 */
export function useTaskStore() {
  const [tasks, setTasks] = useState<GenerationTask[]>(() => getAllTasksMemory());
  const [activeTasks, setActiveTasks] = useState<GenerationTask[]>(() => getActiveTasksMemory());
  const [completedTasks, setCompletedTasks] = useState<GenerationTask[]>(() => getCompletedTasksMemory());
  const [failedTasks, setFailedTasks] = useState<GenerationTask[]>(() => getFailedTasksMemory());

  useEffect(() => {
    // 订阅任务变化事件
    const unsubAdded = onTaskAdded(() => {
      setTasks(getAllTasksMemory());
      setActiveTasks(getActiveTasksMemory());
      setCompletedTasks(getCompletedTasksMemory());
      setFailedTasks(getFailedTasksMemory());
    });

    const unsubUpdated = onTaskUpdated(() => {
      setTasks(getAllTasksMemory());
      setActiveTasks(getActiveTasksMemory());
      setCompletedTasks(getCompletedTasksMemory());
      setFailedTasks(getFailedTasksMemory());
    });

    const unsubRemoved = onTaskRemoved(() => {
      setTasks(getAllTasksMemory());
      setActiveTasks(getActiveTasksMemory());
      setCompletedTasks(getCompletedTasksMemory());
      setFailedTasks(getFailedTasksMemory());
    });

    return () => {
      unsubAdded();
      unsubUpdated();
      unsubRemoved();
    };
  }, []);

  return {
    tasks,
    activeTasks,
    completedTasks,
    failedTasks,
    addTask,
    updateTask: updateTaskMemory,
    updateTaskProgress: updateTaskProgressMemory,
    updateTaskStatus: updateTaskStatusMemory,
    completeTask: completeTaskMemory,
    failTask: failTaskMemory,
    removeTask: removeTaskMemory,
    getTask,
    createTask: createTaskMemory,
    clearAllTasks: clearAllTasksMemory,
    clearFinishedTasks: clearFinishedTasksMemory,
    generateTaskId: generateTaskIdMemory,
  };
}

/**
 * useTask - 订阅单个任务
 */
export function useTask(taskId: string | undefined) {
  const [task, setTask] = useState<GenerationTask | undefined>(() =>
    taskId ? getTask(taskId) : undefined
  );

  useEffect(() => {
    if (!taskId) {
      setTask(undefined);
      return;
    }

    const unsub = onAnyTaskChange((updatedTask) => {
      if (updatedTask?.id === taskId) {
        setTask(updatedTask);
      }
    });

    return unsub;
  }, [taskId]);

  return task;
}

/**
 * useActiveTasks - 只返回活跃任务
 */
export function useActiveTasks() {
  const [activeTasks, setActiveTasks] = useState<GenerationTask[]>(() => getActiveTasksMemory());

  useEffect(() => {
    const unsubAdded = onTaskAdded(() => setActiveTasks(getActiveTasksMemory()));
    const unsubUpdated = onTaskUpdated(() => setActiveTasks(getActiveTasksMemory()));
    const unsubRemoved = onTaskRemoved(() => setActiveTasks(getActiveTasksMemory()));

    return () => {
      unsubAdded();
      unsubUpdated();
      unsubRemoved();
    };
  }, []);

  return activeTasks;
}

/**
 * useInMemoryTaskActions - 提供内存任务存储的操作函数（不订阅状态变化）
 */
export function useInMemoryTaskActions() {
  return {
    addTask,
    updateTask: updateTaskMemory,
    updateTaskProgress: updateTaskProgressMemory,
    updateTaskStatus: updateTaskStatusMemory,
    completeTask: completeTaskMemory,
    failTask: failTaskMemory,
    removeTask: removeTaskMemory,
    getTask,
    createTask: createTaskMemory,
    clearAllTasks: clearAllTasksMemory,
    clearFinishedTasks: clearFinishedTasksMemory,
    generateTaskId: generateTaskIdMemory,
  };
}

/**
 * useTaskStats - 任务统计信息
 */
export function useTaskStats() {
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    failed: 0,
  });

  useEffect(() => {
    const update = () => {
      setStats({
        total: getAllTasksMemory().length,
        active: getActiveTasksMemory().length,
        completed: getCompletedTasksMemory().length,
        failed: getFailedTasksMemory().length,
      });
    };

    update();

    const unsubAdded = onTaskAdded(update);
    const unsubUpdated = onTaskUpdated(update);
    const unsubRemoved = onTaskRemoved(update);

    return () => {
      unsubAdded();
      unsubUpdated();
      unsubRemoved();
    };
  }, []);

  return stats;
}

/**
 * useTaskSubscription - 高级订阅，支持自定义过滤
 */
export function useTaskSubscription(
  filter?: (task: GenerationTask) => boolean
) {
  const [filteredTasks, setFilteredTasks] = useState<GenerationTask[]>(() =>
    filter ? getAllTasksMemory().filter(filter) : getAllTasksMemory()
  );

  useEffect(() => {
    const unsub = onAnyTaskChange(() => {
      setFilteredTasks(filter ? getAllTasksMemory().filter(filter) : getAllTasksMemory());
    });

    return unsub;
  }, [filter]);

  return filteredTasks;
}
