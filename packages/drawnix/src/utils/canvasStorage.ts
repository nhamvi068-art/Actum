/**
 * 画布存储核心模块
 * 参考模板实现：本地持久化存储、历史记录、导出/导入
 */
import { ImageEditState } from '../types/ImageEdit';

// 存储键名
const IMAGE_EDIT_STORAGE_KEY = 'drawnix_image_edit_data';
const IMAGE_EDIT_HISTORY_KEY = 'drawnix_image_edit_history';

// 画布数据类型
export interface ImageEditStorageData {
  imageUrl: string; // 图片URL（Base64或Blob URL）
  editState: ImageEditState; // 编辑状态
  createTime: number;
  updateTime: number;
}

// 历史记录类型
interface HistoryEntry {
  editState: ImageEditState;
  timestamp: number;
}

// 最大历史记录数
const MAX_HISTORY_LENGTH = 50;

/**
 * 序列化画布数据（转换为可存储的JSON）
 */
export const serializeEditData = (imageUrl: string, editState: ImageEditState): string => {
  const data: ImageEditStorageData = {
    imageUrl,
    editState: {
      // 过滤掉无需存储的临时属性
      activeTab: editState.activeTab,
      cropRatio: editState.cropRatio,
      cropRatioValue: editState.cropRatioValue,
      isRemoveWhiteEdge: editState.isRemoveWhiteEdge,
      cropScale: editState.cropScale,
      cropBox: editState.cropBox,
      currentFilterPreset: editState.currentFilterPreset,
      filterParams: { ...editState.filterParams },
    },
    createTime: Date.now(),
    updateTime: Date.now(),
  };
  return JSON.stringify(data);
};

/**
 * 反序列化画布数据（从JSON恢复）
 */
export const deserializeEditData = (jsonStr: string): ImageEditStorageData | null => {
  if (!jsonStr) return null;
  try {
    const data = JSON.parse(jsonStr);
    if (data.imageUrl && data.editState) {
      return data as ImageEditStorageData;
    }
    return null;
  } catch (e) {
    console.error('画布数据反序列化失败：', e);
    return null;
  }
};

/**
 * 保存画布数据到本地存储（持久化）
 */
export const saveImageEditToLocalStorage = (imageUrl: string, editState: ImageEditState): void => {
  try {
    const jsonStr = serializeEditData(imageUrl, editState);
    localStorage.setItem(IMAGE_EDIT_STORAGE_KEY, jsonStr);
  } catch (e) {
    console.warn('本地存储失败：', e);
  }
};

/**
 * 从本地存储加载画布数据
 */
export const loadImageEditFromLocalStorage = (): ImageEditStorageData | null => {
  const jsonStr = localStorage.getItem(IMAGE_EDIT_STORAGE_KEY);
  return jsonStr ? deserializeEditData(jsonStr) : null;
};

/**
 * 清除画布本地存储数据
 */
export const clearImageEditStorage = (): void => {
  localStorage.removeItem(IMAGE_EDIT_STORAGE_KEY);
  localStorage.removeItem(IMAGE_EDIT_HISTORY_KEY);
};

// 历史记录管理
let historyStack: HistoryEntry[] = [];
let historyIndex = -1;

/**
 * 记录画布当前状态到历史栈
 */
export const recordImageEditHistory = (editState: ImageEditState): void => {
  // 截断撤销后的历史记录（重做逻辑）
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
  }

  // 添加新历史记录
  historyStack.push({
    editState: JSON.parse(JSON.stringify(editState)),
    timestamp: Date.now(),
  });

  // 限制历史记录长度（防内存溢出）
  if (historyStack.length > MAX_HISTORY_LENGTH) {
    historyStack.shift();
  }

  historyIndex = historyStack.length - 1;

  // 持久化历史记录
  saveHistoryToStorage();
};

/**
 * 撤销操作（恢复上一步状态）
 */
export const undoImageEdit = (): ImageEditState | null => {
  if (historyIndex <= 0) return null;
  historyIndex--;
  const entry = historyStack[historyIndex];
  saveHistoryToStorage();
  return entry ? entry.editState : null;
};

/**
 * 重做操作（恢复下一步状态）
 */
export const redoImageEdit = (): ImageEditState | null => {
  if (historyIndex >= historyStack.length - 1) return null;
  historyIndex++;
  const entry = historyStack[historyIndex];
  saveHistoryToStorage();
  return entry ? entry.editState : null;
};

/**
 * 是否可以撤销
 */
export const canUndoImageEdit = (): boolean => {
  return historyIndex > 0;
};

/**
 * 是否可以重做
 */
export const canRedoImageEdit = (): boolean => {
  return historyIndex < historyStack.length - 1;
};

/**
 * 保存历史记录到存储
 */
const saveHistoryToStorage = (): void => {
  try {
    const data = JSON.stringify({
      history: historyStack,
      index: historyIndex,
    });
    localStorage.setItem(IMAGE_EDIT_HISTORY_KEY, data);
  } catch (e) {
    console.warn('历史记录存储失败：', e);
  }
};

/**
 * 从存储加载历史记录
 */
export const loadHistoryFromStorage = (): void => {
  try {
    const jsonStr = localStorage.getItem(IMAGE_EDIT_HISTORY_KEY);
    if (jsonStr) {
      const data = JSON.parse(jsonStr);
      historyStack = data.history || [];
      historyIndex = data.index ?? -1;
    }
  } catch (e) {
    console.warn('历史记录加载失败：', e);
    historyStack = [];
    historyIndex = -1;
  }
};

/**
 * 清除历史记录
 */
export const clearHistory = (): void => {
  historyStack = [];
  historyIndex = -1;
  localStorage.removeItem(IMAGE_EDIT_HISTORY_KEY);
};

// 自动保存防抖
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_SAVE_DELAY = 1000; // 1秒防抖

/**
 * 自动保存画布数据（防抖）
 */
export const autoSaveImageEdit = (
  imageUrl: string,
  editState: ImageEditState,
  delay: number = AUTO_SAVE_DELAY
): void => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(() => {
    saveImageEditToLocalStorage(imageUrl, editState);
    // 同时记录历史
    recordImageEditHistory(editState);
  }, delay);
};

/**
 * 立即保存画布数据（取消防抖）
 */
export const immediateSaveImageEdit = (
  imageUrl: string,
  editState: ImageEditState
): void => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  saveImageEditToLocalStorage(imageUrl, editState);
  recordImageEditHistory(editState);
};
