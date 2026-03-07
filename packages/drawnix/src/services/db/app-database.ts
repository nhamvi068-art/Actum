import Dexie, { Table } from 'dexie';

/**
 * 画布/工作区数据
 */
export interface WorkspaceData {
  id: string;
  name: string;
  elements: any[];
  viewport?: any;
  theme?: any;
  createdAt: number;
  updatedAt: number;
  version: number;  // 用于增量同步
}

/**
 * 画布快照（全量备份，用于增量存储优化）
 */
export interface CanvasSnapshot {
  id: string;
  workspaceId: string;
  elements: any[];
  version: number;
  createdAt: number;
}

/**
 * 画布增量变更
 */
export interface CanvasDelta {
  id: string;
  workspaceId: string;
  baseVersion: number;  // 基于的快照版本
  added: any[];
  removed: any[];
  modified: any[];
  timestamp: number;
}

/**
 * 资产数据（图片、视频等 Blob）
 */
export interface AssetData {
  id: string;
  type: 'image' | 'video' | 'audio' | 'file';
  mimeType: string;
  blob?: Blob;
  dataUrl?: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: number;
  updatedAt: number;
  workspaceId?: string;  // 关联到工作区
}

/**
 * 任务数据
 */
export interface TaskData {
  id: string;
  type: 'image_generation' | 'video_generation' | 'text_generation';
  status: 'pending' | 'submitting' | 'generating' | 'completed' | 'failed';
  prompt?: string;
  model?: string;
  progress?: number;  // 进度百分比 0-100
  params?: {
    aspect_ratio?: string;
    image_size?: string;
    images?: string[];
  };
  result?: {
    assetId?: string;
    remoteUrl?: string;
    type: string;
    metadata?: any;
  };
  error?: string;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  workspaceId?: string;
}

/**
 * 聊天会话数据
 */
export interface ChatSessionData {
  id: string;
  workspaceId: string;
  messages: any[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Drawnix IndexedDB 数据库
 * 使用 Dexie.js 进行类型安全的 IndexedDB 操作
 */
export class AppDatabase extends Dexie {
  workspaces!: Table<WorkspaceData>;
  canvasSnapshots!: Table<CanvasSnapshot>;
  canvasDeltas!: Table<CanvasDelta>;
  assets!: Table<AssetData>;
  tasks!: Table<TaskData>;
  chatSessions!: Table<ChatSessionData>;

  constructor() {
    super('DrawnixDB');

    this.version(3).stores({
      // workspaces: id, name, updatedAt, version
      workspaces: 'id, name, updatedAt, version',
      // canvasSnapshots: id, workspaceId, version
      canvasSnapshots: 'id, workspaceId, version',
      // canvasDeltas: id, workspaceId, baseVersion, timestamp
      canvasDeltas: 'id, workspaceId, baseVersion, timestamp',
      // assets: id, type, mimeType, workspaceId, createdAt
      assets: 'id, type, mimeType, workspaceId, createdAt',
      // tasks: id, status, type, createdAt, updatedAt, workspaceId
      tasks: 'id, status, type, createdAt, updatedAt, workspaceId, progress',
      // chatSessions: id, workspaceId, updatedAt
      chatSessions: 'id, workspaceId, updatedAt'
    }).upgrade(tx => {
      // v2 to v3: add progress field to tasks
      return tx.table('tasks').toCollection().modify(task => {
        if (task.progress === undefined) {
          task.progress = 0;
        }
      });
    });
  }
}

export const db = new AppDatabase();
