import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Drawnix, type DrawnixRef, ImageGenerateOptions, PlaceholderInfo as DrawnixPlaceholderInfo, startPerformanceLogging, getCachedThumbnail, triggerSnapshotPod, BackgroundSnapshotService, canvasService, useThumbnailUpdate } from '@drawnix/drawnix';
import { PlaitBoard, PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import localforage from 'localforage';
import LZString from 'lz-string';
import { SettingsDialog as ApiConfigModal, ApiConfig } from '@drawnix/drawnix';
import { ImageGeneratingPanel } from '../components/ImageGeneratingPanel/ImageGeneratingPanel';
import CustomDropdown from '../components/CustomDropdown/CustomDropdown';
import CardActionsDropdown from '../components/CardActionsDropdown/CardActionsDropdown';
import { generateImage, getImageGenerationAdapter, waitForTaskComplete, urlToBase64, startTaskPolling, startGenerationWithPolling } from '@drawnix/drawnix';
import {
  createTask,
  updateTaskStatus,
  incrementRetryCount,
  getActiveTasks,
  getAllTasks,
  getTaskById,
  cancelTask,
  isTaskCancelled,
  markTaskConfirmed,
  ImageTask,
  PlaceholderInfo,
} from '@drawnix/drawnix';
import TaskListButton from '../components/TaskNotificationPanel/TaskListButton';
import logo from '../assets/logo.png';
import { MigrationScreen } from './migration-screen';
import {
  checkStorageQuota,
  isStorageNearFull,
  getStorageStatusText,
  clearThumbnails,
  cleanOldBoardContent,
  requestPersistentStorage,
  formatBytes,
} from '@drawnix/drawnix';
import {
  drawnixServices,
  assetStorageService,
  unifiedCacheService,
  resourceManager,
  storageMonitorService,
  backupService,
  taskStorageService,
  useTaskQueue,
  migrateLegacyBoardData,
  needsMigration,
} from '@drawnix/drawnix';

// 用于追踪上一次保存的元素（用于计算增量）
let previousElements: PlaitElement[] = [];

type AppValue = {
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
};

type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
};

const MAIN_BOARD_CONTENT_KEY = 'main_board_content';
const PROJECTS_KEY = 'projects_list';
const API_CONFIG_KEY = 'api_config';
const CURRENT_PROJECT_ID_KEY = 'current_project_id';

localforage.config({
  name: 'Drawnix',
  storeName: 'drawnix_store',
});

// 压缩数据（减少存储体积 30%-70%）
function compressData<T>(data: T): string {
  const jsonString = JSON.stringify(data);
  return LZString.compressToUTF16(jsonString);
}

// 解压缩数据
function decompressData<T>(compressed: string): T | null {
  try {
    const jsonString = LZString.decompressFromUTF16(compressed);
    if (jsonString) {
      return JSON.parse(jsonString) as T;
    }
    return null;
  } catch (error) {
    console.error('Failed to decompress data:', error);
    return null;
  }
}

// Helper function to handle localforage errors gracefully
// Track if storage is known to be unavailable
let storageFailed = false;
let storageFailCount = 0;
const MAX_STORAGE_FAILURES = 3;

// SessionStorage 降级方案
const sessionStorageCache = new Map<string, string>();

async function safeSetItem<T>(key: string, value: T, compress: boolean = false): Promise<boolean> {
  // If storage has repeatedly failed, stop trying to avoid infinite loops
  if (storageFailed && storageFailCount >= MAX_STORAGE_FAILURES) {
    // 降级到 sessionStorage
    return fallbackToSessionStorage(key, value, compress);
  }

  try {
    // 压缩数据以减少存储体积
    const dataToStore = compress ? compressData(value) : value;
    await localforage.setItem(key, dataToStore);
    storageFailCount = 0; // Reset on success
    return true;
  } catch (error: any) {
    console.error('Failed to save data:', error);

    // If quota exceeded, try to clear old data and retry
    if (error?.name === 'QuotaExceededError' || error?.code === 22) {
      storageFailCount++;
      console.warn(`Storage quota exceeded (attempt ${storageFailCount}), attempting to clear old data...`);

      try {
        // 使用新的清理函数
        await clearThumbnails();
        console.log('Cleared thumbnails, retrying save...');
        const dataToStore = compress ? compressData(value) : value;
        await localforage.setItem(key, dataToStore);
        storageFailCount = 0;
        return true;
      } catch (retryError: any) {
        // 尝试更激进的清理
        try {
          await cleanOldBoardContent(3);
          console.log('Cleared old board content, retrying save...');
          const dataToStore = compress ? compressData(value) : value;
          await localforage.setItem(key, dataToStore);
          storageFailCount = 0;
          return true;
        } catch (retryError2) {
          console.error('Failed to recover storage:', retryError2);
          // Mark storage as failed to stop trying
          if (storageFailCount >= MAX_STORAGE_FAILURES) {
            storageFailed = true;
            console.error('Storage permanently failed, disabling auto-save');
            // 降级到 sessionStorage
            return fallbackToSessionStorage(key, value, compress);
          }
        }
      }
    }
    return false;
  }
}

// 降级到 sessionStorage
function fallbackToSessionStorage<T>(key: string, value: T, compress: boolean): boolean {
  try {
    const dataToStore = compress ? compressData(value) : JSON.stringify(value);
    sessionStorageCache.set(key, dataToStore);
    // 尝试写入 sessionStorage 作为备份
    sessionStorage.setItem(`drawnix_backup_${key}`, dataToStore);
    console.warn('Fell back to sessionStorage for:', key);
    return true;
  } catch (sessionError) {
    console.error('SessionStorage also failed:', sessionError);
    // 最后尝试：通知用户导出数据
    if (typeof window !== 'undefined') {
      alert('存储空间不足！请导出您的数据以避免丢失。\n\n点击"设置" > "清理缓存"释放空间。');
    }
    return false;
  }
}

// 安全获取数据（支持解压缩）
async function safeGetItem<T>(key: string, compressed: boolean = false): Promise<T | null> {
  try {
    const data = await localforage.getItem<T>(key);
    if (data && compressed && typeof data === 'string') {
      return decompressData<T>(data);
    }
    return data;
  } catch (error) {
    console.error('Failed to get data:', error);
    return null;
  }
}

// 安全删除数据
async function safeRemoveItem(key: string): Promise<void> {
  try {
    await localforage.removeItem(key);
    sessionStorage.removeItem(`drawnix_backup_${key}`);
  } catch (error) {
    console.error('Failed to remove data:', error);
  }
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ];
  
  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
    }
  }
  return 'Just now';
}

function ProjectCard({ project, onClick, onDelete, onDuplicate }: { project: Project; onClick: () => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void }) {
  // 监听缩略图更新事件（后台服务完成后会收到通知）
  const pendingThumbnail = useThumbnailUpdate(project.id);

  // 优先显示待处理的缩略图（后台服务刚生成的）
  const displayThumbnail = pendingThumbnail || project.thumbnail;

  return (
    <div className="project-card-custom" onClick={onClick}>
      <div className={`card-preview-custom ${displayThumbnail ? 'has-thumbnail' : ''}`}>
        {displayThumbnail ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <img
              src={displayThumbnail}
              alt={project.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
              onLoad={() => console.log('Thumbnail loaded for:', project.name, 'length:', displayThumbnail?.length)}
              onError={() => console.log('Thumbnail ERROR for:', project.name)}
            />
          </div>
        ) : (
          <>
            <div className="preview-placeholder">🎨</div>
            <div className="preview-placeholder">📝</div>
            <div className="preview-placeholder">🧠</div>
            <div className="preview-placeholder">✨</div>
          </>
        )}
      </div>
      <div className="card-info-custom">
        <div className="card-info-left-custom">
          <h3 className="card-title-custom">{project.name}</h3>
          <span className="card-date-custom">
            {formatTimeAgo(project.updatedAt)}
          </span>
        </div>
        <div className="card-actions-custom" onClick={(e) => e.stopPropagation()}>
          <CardActionsDropdown
            onDelete={() => onDelete(project.id)}
            onDuplicate={() => onDuplicate(project.id)}
          />
        </div>
      </div>
    </div>
  );
}

function ProjectListView({
  projects,
  onSelectProject,
  onCreateProject,
  onDelete,
  onDuplicate,
  onBack,
  deleteConfirm,
  onConfirmDelete,
  onCancelDelete,
  onOpenApiConfig
}: {
  projects: Project[];
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onBack: () => void;
  deleteConfirm: string | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onOpenApiConfig: () => void;
}) {
  console.log('ProjectListView rendering with projects:', projects.length);
  const [sortBy, setSortBy] = useState('recent');
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  const sortOptions = [
    { value: 'recent', label: 'Recent' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'az', label: 'A-Z' },
  ];

  // 这里可以添加排序逻辑，如果有后端支持的话。
  // 目前前端只是展示。
  const sortedProjects = [...projects].sort((a, b) => {
    if (sortBy === 'recent') {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    } else if (sortBy === 'oldest') {
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    } else if (sortBy === 'az') {
      return a.name.localeCompare(b.name);
    }
    return 0;
  });

  return (
    <>
      {/* 简洁背景 */}
      <div className="page-background">
        <div className="nebula-container">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
        </div>
      </div>

      {/* Header */}
      <div className="page-header-custom">
        <div className="header-left-custom">
          <span className="logo-custom">Actum</span>
          <span className="logo-tag">EXPERIMENT</span>
        </div>
        <div className="header-right-custom">
          <button className="announcement-btn-custom" onClick={() => setShowAnnouncement(true)} title="Announcement">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
            </svg>
          </button>
          <button className="header-icon-custom" onClick={onOpenApiConfig} title="Settings">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          <img className="user-avatar" src={logo} alt="User" />
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content-custom">
        {/* Hero Section */}
        <div className="hero-section-custom">
          <h1 className="hero-title-custom">Welcome to Omni Canvas!</h1>
          <p className="hero-subtitle-custom">Explore, expand, and refine your ideas</p>
        </div>

        {/* Action Bar */}
        <div className="action-bar-custom">
          <button className="btn-new-project-custom" onClick={onCreateProject}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span>New project</span>
          </button>

          <div className="filter-dropdown">
            <CustomDropdown 
              options={sortOptions}
              value={sortBy}
              onChange={setSortBy}
            />
          </div>
        </div>

        {/* Project Grid */}
        {sortedProjects.length > 0 ? (
          <div className="project-grid-custom">
            {sortedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => onSelectProject(project.id)}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
              />
            ))}
          </div>
        ) : (
          <div className="project-card-custom empty-project-card" onClick={onCreateProject}>
            <div className="card-preview-custom empty-preview">
              <div className="add-icon-circle">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
            <div className="card-info-custom">
              <div className="card-info-left-custom">
                <span className="card-title-custom">New Project</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="page-footer-custom">
        <span>Omni2.0</span>
        <div className="footer-links-custom">
          <a href="#">Privacy</a>
          <a href="#">Terms of Service</a>
        </div>
      </div>

      {/* Announcement Modal */}
      {showAnnouncement && (
        <div className="announcement-modal-overlay" onClick={() => setShowAnnouncement(false)}>
          <div className="announcement-modal-content" onClick={e => e.stopPropagation()}>
            <button className="announcement-close-btn" onClick={() => setShowAnnouncement(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
            <div className="announcement-content">
              <div className="announcement-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <h2 className="announcement-title">Welcome to Omni Canvas!</h2>
              <p className="announcement-text">
                This is your AI-powered creative canvas. Draw, sketch, and generate amazing images with the power of AI.
              </p>
              <div className="announcement-features">
                <div className="announcement-feature">
                  <span className="feature-icon">🎨</span>
                  <span>Draw & Sketch</span>
                </div>
                <div className="announcement-feature">
                  <span className="feature-icon">🤖</span>
                  <span>AI Generation</span>
                </div>
                <div className="announcement-feature">
                  <span className="feature-icon">💾</span>
                  <span>Auto Save</span>
                </div>
              </div>
              <button className="announcement-got-btn" onClick={() => setShowAnnouncement(false)}>Got it!</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={onCancelDelete}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Delete Project</h3>
            <p className="modal-message">
              Are you sure you want to delete this project? This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={onCancelDelete}>Cancel</button>
              <button className="btn-confirm-delete" onClick={onConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function App() {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState(0);
  // 用于取消迁移的 AbortController
  const migrationAbortRef = useRef<AbortController | null>(null);
  const [value, setValue] = useState<AppValue>({ children: [] });
  const [tutorial, setTutorial] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiConfig, setApiConfig] = useState<ApiConfig>({ apiKey: '', baseUrl: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [currentModel, setCurrentModel] = useState('');
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [initialPlaceholder, setInitialPlaceholder] = useState<any>(null);
  const [activeTask, setActiveTask] = useState<ImageTask | null>(null);
  const [storageWarning, setStorageWarning] = useState<{ show: boolean; percentage: number } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [tasks, setTasks] = useState<ImageTask[]>([]);
  // 用于填充输入栏的数据（重做功能）
  const [fillInputData, setFillInputData] = useState<{
    prompt: string;
    images: string[];
    model: string;
    aspectRatio: string;
    imageSize?: string;
  } | null>(null);
  const [isServicesReady, setIsServicesReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // 用于防止返回时截图导致竞态条件
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 【新增】drawnixRef 用于在 handleBack 时强制刷新快照
  // forwardRef + useImperativeHandle 让 App 可以 await 快照完成后再读缓存
  const drawnixRef = useRef<DrawnixRef>(null);
  const boardRef = useRef<PlaitBoard | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 监听图层顺序变化事件，立即保存（绕过 debounce）
  useEffect(() => {
    const handleLayerOrderChanged = async (e: CustomEvent<{ children: any[] }>) => {
      if (currentProjectId && !storageFailed) {
        try {
          const children = e.detail.children;
          const workspace = await canvasService.getWorkspace(currentProjectId);
          await canvasService.saveFull(
            currentProjectId,
            children,
            workspace?.theme || value.theme,
            workspace?.viewport || value.viewport
          );
          console.log('[App] Layer order saved immediately');
        } catch (error) {
          console.warn('[App] Failed to save layer order:', error);
        }
      }
    };

    window.addEventListener('layer-order-changed', handleLayerOrderChanged as EventListener);
    return () => {
      window.removeEventListener('layer-order-changed', handleLayerOrderChanged as EventListener);
    };
  }, [currentProjectId, storageFailed, value.theme, value.viewport]);

  // 应用启动时检测存储配额
  useEffect(() => {
    const checkStorage = async () => {
      const quota = await checkStorageQuota();
      if (quota.percentage > 80) {
        setStorageWarning({ show: true, percentage: quota.percentage });
      }
      // 请求持久化存储
      requestPersistentStorage();
    };
    checkStorage();

    // 初始化 drawnix 存储服务
    const initDrawnixServices = async () => {
      try {
        await drawnixServices.init();
        console.log('[App] Drawnix services initialized');

        // 迁移旧任务数据从 localforage 到 IndexedDB
        const { migrateFromLocalforage } = await import('../services/taskManager');
        const migrated = await migrateFromLocalforage();
        if (migrated > 0) {
          console.log(`[App] Migrated ${migrated} tasks from localforage`);
        }
      } catch (error) {
        console.error('[App] Failed to init drawnix services:', error);
      } finally {
        setIsServicesReady(true);
      }
    };
    initDrawnixServices();

    // 监听存储告警
    const channel = new BroadcastChannel('drawnix_storage_alert');
    channel.onmessage = (event) => {
      if (event.data.type === 'STORAGE_ALERT') {
        const alert = event.data.alert;
        setStorageWarning({
          show: true,
          percentage: Math.round(alert.percentage * 100)
        });
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  // 提取数据加载逻辑为独立的回调函数
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      let storedProjects = (await safeGetItem<Project[]>(PROJECTS_KEY, false)) || (await localforage.getItem(PROJECTS_KEY)) as Project[] | null;

      // ── 脏数据清洗：确保是合法的 Project[] 数组 ──────────────────────────
      // 污染来源：调试期间可能把字符串 / 序列化值写入 projects_list
      // 导致 ProjectListView 收到 678 个无意义子项并崩溃
      const isValidProjectList = (
        Array.isArray(storedProjects) &&
        storedProjects.every(p => p && typeof p === 'object' && typeof p.id === 'string' && p.id.length > 0)
      );

      if (!isValidProjectList) {
        if (storedProjects !== null && storedProjects !== undefined) {
          console.warn('[loadData] Detected corrupted projects list, resetting to empty array. Raw type:', typeof storedProjects, 'length:', (storedProjects as any)?.length);
        }
        storedProjects = [];
        // 清除脏数据，防止下次加载再次污染
        await safeRemoveItem(PROJECTS_KEY);
      }

      if (storedProjects && storedProjects.length > 0) {
        setProjects(storedProjects);
      }

      // 加载 API 配置
      const storedApiConfig = (await safeGetItem<ApiConfig>(API_CONFIG_KEY)) || (await localforage.getItem(API_CONFIG_KEY)) as ApiConfig | null;
      if (storedApiConfig) {
        setApiConfig(storedApiConfig);
      }

      // 加载当前项目 ID（页面刷新后保持在画布页面）
      const storedProjectId = await safeGetItem<string>(CURRENT_PROJECT_ID_KEY);
      const projectId = storedProjectId || currentProjectId;
      if (projectId) {
        if (storedProjectId) {
          setCurrentProjectId(storedProjectId);
        }

        // 优先从 CanvasService（IndexedDB）加载，与 handleSelectProject 保持一致
        try {
          const fullData = await canvasService.getFullCanvas(projectId);

          // ── 从 CanvasService 恢复 projects state 中的缩略图 ─────────────
          // PROJECTS_KEY 可能为空/丢失，但 CanvasService 的 WorkspaceData 里有 thumbnail
          // 【修复】添加有效性检查：只有当 CanvasService 的缩略图有效（>= 1000字节）时才更新
          const isValidThumbnail = fullData.thumbnail && fullData.thumbnail.length >= 1000;
          if (isValidThumbnail) {
            const projectInList = storedProjects?.find(p => p.id === projectId);
            if (projectInList) {
              // 合并 thumbnail 到现有项目（即使已有缩略图，如果新缩略图更有效也更新）
              const needsUpdate = !projectInList.thumbnail || projectInList.thumbnail.length < 1000;
              if (needsUpdate) {
                const mergedProjects = storedProjects!.map(p =>
                  p.id === projectId ? { ...p, thumbnail: fullData.thumbnail } : p
                );
                setProjects(mergedProjects);
                console.log('[loadData] Thumbnail restored from CanvasService for project:', projectId);
              }
            } else if (!storedProjects || storedProjects.length === 0) {
              // PROJECTS_KEY 完全为空，从 CanvasService 构建项目对象
              const projectFromWorkspace: Project = {
                id: projectId,
                name: 'Untitled Project',
                createdAt: new Date(fullData.thumbnail.length > 0 ? Date.now() : Date.now()).toISOString(),
                updatedAt: new Date().toISOString(),
                thumbnail: fullData.thumbnail,
              };
              setProjects([projectFromWorkspace]);
              await safeSetItem(PROJECTS_KEY, [projectFromWorkspace], false);
              console.log('[loadData] Project created from CanvasService with thumbnail:', projectId);
            }
          } else if (fullData.thumbnail) {
            console.log('[loadData] Skipping invalid thumbnail from CanvasService (length:', fullData.thumbnail.length, ')');
          }

          // 检查是否需要迁移旧 Base64 数据
          if (needsMigration(fullData)) {
            console.log('[App] Detected legacy Base64 data, starting migration...');
            setIsMigrating(true);
            setMigrationProgress(0);

            // 创建 AbortController 用于取消迁移
            migrationAbortRef.current = new AbortController();

            try {
              const migratedData = await migrateLegacyBoardData(
                fullData,
                (percent) => setMigrationProgress(percent),
                { abortSignal: migrationAbortRef.current.signal }
              );

              // 迁移成功，保存数据
              await canvasService.saveFull(projectId, migratedData.children || [], fullData.theme, fullData.viewport, fullData.thumbnail);

              setValue({
                children: migratedData.children || [],
                theme: fullData.theme,
                viewport: fullData.viewport
              });
              previousElements = [...(migratedData.children || [])];
              console.log('[App] Canvas loaded and migrated from CanvasService on refresh');
            } catch (migrationError) {
              // 迁移被取消或出错
              console.error('[App] Migration failed or cancelled:', migrationError);

              // 中止迁移
              migrationAbortRef.current?.abort();
              migrationAbortRef.current = null;

              // 清除状态并跳转首页
              await safeRemoveItem(CURRENT_PROJECT_ID_KEY);
              setCurrentProjectId(null);
              window.location.href = '/';
              return;
            }

            // 清除 AbortController
            migrationAbortRef.current = null;
            setIsMigrating(false);
            setIsLoading(false);
            return;
          }

          if (fullData.elements && fullData.elements.length > 0) {
            setValue({
              children: fullData.elements,
              theme: fullData.theme,
              viewport: fullData.viewport
            });
            previousElements = [...fullData.elements];
            console.log('[App] Canvas loaded from CanvasService on refresh');
            setIsLoading(false);
            return;
          } else if (fullData.theme || fullData.viewport) {
            // 即使没有元素，也恢复 theme 和 viewport
            setValue({
              children: [],
              theme: fullData.theme,
              viewport: fullData.viewport
            });
            console.log('[App] Theme/viewport restored from CanvasService on refresh');
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.warn('[App] Failed to load from CanvasService on refresh:', e);
        }

        // 降级到 localforage
        const storedData = (await safeGetItem<AppValue>(
          `${MAIN_BOARD_CONTENT_KEY}_${projectId}`,
          true
        )) || (await localforage.getItem(
          `${MAIN_BOARD_CONTENT_KEY}_${projectId}`
        )) as AppValue | null;

        if (storedData) {
          setValue(storedData);
          if (storedData.children && storedData.children.length === 0) {
            setTutorial(true);
          }
          setIsLoading(false);
          return;
        }
        setTutorial(true);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setIsLoading(false);
  }, [currentProjectId]);

  useEffect(() => {
    if (isServicesReady) {
      loadData();
    }
  }, [isServicesReady, loadData]);

  // ── 启动后台截图服务 ──
  // 在服务就绪后启动 BackgroundSnapshotService
  // 它会轮询检测 SnapshotPodManager 中的遗舱并异步处理截图
  useEffect(() => {
    if (isServicesReady) {
      console.log('[App] Starting BackgroundSnapshotService...');
      BackgroundSnapshotService.start();
    }

    // App 卸载时停止服务
    return () => {
      console.log('[App] Stopping BackgroundSnapshotService...');
      BackgroundSnapshotService.stop();
    };
  }, [isServicesReady]);

  // 页面加载时恢复活动任务
  useEffect(() => {
    const restoreTasks = async () => {
      if (!currentProjectId) return;

      try {
        const activeTasks = await getActiveTasks(currentProjectId);
        if (activeTasks.length > 0) {
          console.log('[App] Found active tasks to restore:', activeTasks.length);
          // 恢复最近的一个进行中的任务
          const generatingTask = activeTasks.find(t => t.status === 'generating');
          if (generatingTask) {
            setActiveTask(generatingTask);
            setCurrentPrompt(generatingTask.prompt);
            setCurrentModel(generatingTask.model);
            setIsGenerating(true);
            setCurrentTaskId(generatingTask.id);
          }
        }
      } catch (error) {
        console.error('[App] Failed to restore tasks:', error);
      }
    };

    restoreTasks();
  }, [currentProjectId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleSaveApiConfig = async (config: ApiConfig) => {
    setApiConfig(config);
    await safeSetItem(API_CONFIG_KEY, config);
  };

  // 规范化从 b64_json 获得的图片地址，避免重复 data: 前缀
  const normalizeImageSrcFromB64 = (imageB64: string | undefined | null): string => {
    if (!imageB64) return '';
    const trimmed = imageB64.trim();
    if (!trimmed) return '';
    // 已经是 data URL，直接返回
    if (trimmed.startsWith('data:image/')) {
      return trimmed;
    }
    // 否则认为是裸 base64，补上前缀
    return `data:image/png;base64,${trimmed}`;
  };

  // ===== placeholder 操作辅助函数 =====
  const updatePlaceholderStatus = (status: 'pending' | 'generating' | 'completed' | 'failed', errorMessage?: string, imageUrl?: string, taskId?: string) => {
    if (boardRef.current && (boardRef.current as any).updatePlaceholderStatus) {
      (boardRef.current as any).updatePlaceholderStatus(status, errorMessage, imageUrl, taskId);
    }
  };

  const updatePlaceholderProgress = (progress: number, taskId?: string) => {
    if (boardRef.current && (boardRef.current as any).updatePlaceholderProgress) {
      (boardRef.current as any).updatePlaceholderProgress(progress, taskId);
    }
  };

  const clearPlaceholder = () => {
    if (boardRef.current && (boardRef.current as any).clearPlaceholder) {
      (boardRef.current as any).clearPlaceholder();
    }
  };
  // ===== helper functions end =====

  // 处理图片生成
  // 注意：drawnix 内部已经完整处理了任务创建、提交、轮询和状态同步
  // 这里只需要处理 API Key 检查和可选的回调逻辑
  const handleGenerateImage = async (prompt: string, images: string[], options: ImageGenerateOptions) => {
    // API Key 检查由 drawnix 内部处理，这里只做日志记录
    console.log('[App] handleGenerateImage called (drawnix handles task lifecycle)', { prompt, options });
    // drawnix 的 handleGenerateImageWithContext + handleGenerateImage 会处理：
    // 1. 创建占位符
    // 2. 创建任务
    // 3. 提交到 AI
    // 4. 轮询结果
    // 5. 同步到 IndexedDB
  };

  const handleChange = (data: any) => {
    try {
      const children = Array.isArray(data) ? data : data.children;
      const newTheme = data.theme !== undefined ? data.theme : value.theme;
      const newViewport = data.viewport !== undefined ? data.viewport : value.viewport;

      // 【调试】打印变更前的顺序
      console.log('[App] handleChange children order:', children?.map((c: any) => `${c.id?.slice(0,8)}:${c.type}`));

      const newAppValue: AppValue = {
        ...value,
        children,
        theme: newTheme,
        viewport: newViewport
      };
      setValue(newAppValue);
      if (children && children.length > 0) {
        setTutorial(false);
      }

      // 检测 theme 或 viewport 是否有变化
      const themeChanged = newTheme !== value.theme;
      const viewportChanged = JSON.stringify(newViewport) !== JSON.stringify(value.viewport);

      // Debounced save - reduced to 300ms for faster persistence
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // 【关键修复】立即更新 previousElements，确保即使 debounce 失败也不会导致增量计算错误
      previousElements = [...children];

      saveTimeoutRef.current = setTimeout(async () => {
        if (currentProjectId && !storageFailed) {
          // 优先使用新存储服务（CanvasService）
          try {
            // 计算增量
            const delta = canvasService.computeDelta(previousElements, children);

            // 检测是否是纯顺序变化：没有增删，只有顺序改变
            const isOrderOnlyChange =
              delta.added.length === 0 &&
              delta.removed.length === 0 &&
              delta.modified.length > 0;

            if (isOrderOnlyChange) {
              // 纯顺序变化：使用 saveFull 保存全量数据，绕过增量合并
              await canvasService.saveFull(currentProjectId, children, newTheme, newViewport);
              console.log('[App] Order change saved via saveFull (full snapshot)');
            } else {
              // 正常增量保存
              await canvasService.saveDelta(currentProjectId, delta);
              console.log('[App] Canvas saved via CanvasService (delta mode)');
            }

            // 如果 theme 或 viewport 变化，单独保存
            if (themeChanged || viewportChanged) {
              await canvasService.saveThemeAndViewport(currentProjectId, newTheme, newViewport);
              console.log('[App] Theme/viewport saved via CanvasService');
            }
          } catch (e) {
            // 【关键修复】等待并处理 localforage fallback 的结果
            console.warn('[App] CanvasService failed, falling back to localforage:', e);
            try {
              const result = await safeSetItem(`${MAIN_BOARD_CONTENT_KEY}_${currentProjectId}`, newAppValue, true);
              if (!result) {
                console.error('[App] localforage fallback also failed');
              }
            } catch (fallbackError) {
              console.error('[App] All storage backends failed:', fallbackError);
            }
          }
        }
      }, 300);
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  };

  const handleCreateProject = async () => {
    console.log('handleCreateProject called, current projects length:', projects.length);

    // 生成确定性渐变占位缩略图（不依赖画布内容）
    function generatePlaceholderThumbnail(projectId: string): string {
      const hue = projectId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:hsl(${hue},70%,60%)"/>
            <stop offset="100%" style="stop-color:hsl(${(hue + 40) % 360},70%,45%)"/>
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#bg)"/>
        <text x="200" y="145" font-family="sans-serif" font-size="18" fill="white" text-anchor="middle" opacity="0.9">Untitled Project</text>
        <text x="200" y="170" font-family="sans-serif" font-size="12" fill="white" text-anchor="middle" opacity="0.6">New Canvas</text>
      </svg>`;
      return `data:image/svg+xml;base64,${btoa(svg)}`;
    }

    const newProjectId = `project_${Date.now()}`;
    const newProject: Project = {
      id: newProjectId,
      name: 'Untitled Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnail: generatePlaceholderThumbnail(newProjectId),
    };
    const updatedProjects = [newProject, ...projects];
    console.log('handleCreateProject updatedProjects:', updatedProjects.length);
    // 先存入 CanvasService（让 thumbnail 随 canvas 数据一起持久化，不依赖 PROJECTS_KEY）
    await canvasService.saveFull(newProjectId, [], undefined, undefined, newProject.thumbnail);
    setProjects(updatedProjects);
    await safeSetItem(PROJECTS_KEY, updatedProjects, false);
    setCurrentProjectId(newProject.id);
    await safeSetItem(CURRENT_PROJECT_ID_KEY, newProject.id);
    setValue({ children: [] });
    setTutorial(true);
  };

  const handleSelectProject = async (projectId: string) => {
    // 切换项目时，释放之前项目的资源
    if (currentProjectId) {
      resourceManager.releaseAllForWorkspace(currentProjectId);
    }

    setCurrentProjectId(projectId);
    await safeSetItem(CURRENT_PROJECT_ID_KEY, projectId);

    // 尝试从 CanvasService 加载画布
    try {
      const fullData = await canvasService.getFullCanvas(projectId);

      // 从 CanvasService 恢复 projects state 中的缩略图
      if (fullData.thumbnail) {
        setProjects(prevProjects => {
          const exists = prevProjects.some(p => p.id === projectId);
          if (exists) {
            return prevProjects.map(p => p.id === projectId ? { ...p, thumbnail: fullData.thumbnail! } : p);
          } else {
            const projectFromWorkspace: Project = {
              id: projectId,
              name: 'Untitled Project',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              thumbnail: fullData.thumbnail!,
            };
            return [projectFromWorkspace, ...prevProjects];
          }
        });
      }

      // 检查是否需要迁移旧 Base64 数据
      if (needsMigration(fullData)) {
        console.log('[App] Detected legacy Base64 data in handleSelectProject, starting migration...');
        setIsMigrating(true);
        setMigrationProgress(0);

        // 创建 AbortController 用于取消迁移
        migrationAbortRef.current = new AbortController();

        try {
          const migratedData = await migrateLegacyBoardData(
            fullData,
            (percent) => setMigrationProgress(percent),
            { abortSignal: migrationAbortRef.current.signal }
          );

          // 迁移成功，保存数据
          await canvasService.saveFull(projectId, migratedData.children || [], fullData.theme, fullData.viewport, fullData.thumbnail);

          setValue({
            children: migratedData.children || [],
            theme: fullData.theme,
            viewport: fullData.viewport
          });
          previousElements = [...(migratedData.children || [])];
          console.log('[App] Canvas loaded and migrated from CanvasService');
        } catch (migrationError) {
          // 迁移被取消或出错
          console.error('[App] Migration failed or cancelled:', migrationError);

          // 中止迁移
          migrationAbortRef.current?.abort();
          migrationAbortRef.current = null;

          // 清除状态并跳转首页
          await safeRemoveItem(CURRENT_PROJECT_ID_KEY);
          setCurrentProjectId(null);
          window.location.href = '/';
          return;
        }

        // 清除 AbortController
        migrationAbortRef.current = null;
        setIsMigrating(false);
        return;
      }

      if (fullData.elements && fullData.elements.length > 0) {
        setValue({
          children: fullData.elements,
          theme: fullData.theme,
          viewport: fullData.viewport
        });
        previousElements = [...fullData.elements];
        console.log('[App] Canvas loaded from CanvasService');
        return;
      } else if (fullData.theme || fullData.viewport) {
        // 即使没有元素，也恢复 theme 和 viewport
        setValue({
          children: [],
          theme: fullData.theme,
          viewport: fullData.viewport
        });
        console.log('[App] Theme/viewport restored from CanvasService');
        return;
      }
    } catch (e) {
      console.warn('[App] Failed to load from CanvasService:', e);
    }

    // 降级到 localforage
    // (后续可以在 loadData 中处理)
  };

  const handleDeleteProject = (projectId: string) => {
    const updatedProjects = projects.filter(p => p.id !== projectId);
    setProjects(updatedProjects);
    safeSetItem(PROJECTS_KEY, updatedProjects, false);
    // Also delete the project content
    localforage.removeItem(`${MAIN_BOARD_CONTENT_KEY}_${projectId}`);

    // 同时删除 Dexie 中的数据
    canvasService.deleteWorkspace(projectId).catch(e => {
      console.warn('[App] Failed to delete workspace from Dexie:', e);
    });
  };

  const handleDuplicateProject = async (projectId: string) => {
    const projectToDuplicate = projects.find(p => p.id === projectId);
    if (!projectToDuplicate) return;

    const newProject: Project = {
      ...projectToDuplicate,
      id: `project_${Date.now()}`,
      name: `${projectToDuplicate.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Duplicate content
    const contentKeyToDuplicate = `${MAIN_BOARD_CONTENT_KEY}_${projectId}`;
    const contentToDuplicate = await localforage.getItem(contentKeyToDuplicate);
    if (contentToDuplicate) {
        await localforage.setItem(`${MAIN_BOARD_CONTENT_KEY}_${newProject.id}`, contentToDuplicate);
    }

    const updatedProjects = [newProject, ...projects];
    setProjects(updatedProjects);
    await safeSetItem(PROJECTS_KEY, updatedProjects, false);
  };

  const handleStartEditName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setEditingProjectId(projectId);
      setEditingName(project.name);
    }
  };

  const handleSaveName = () => {
    if (editingProjectId && editingName.trim()) {
      const updatedProjects = projects.map(p =>
        p.id === editingProjectId
          ? { ...p, name: editingName.trim(), updatedAt: new Date().toISOString() }
          : p
      );
      setProjects(updatedProjects);
      safeSetItem(PROJECTS_KEY, updatedProjects, false);
    }
    setEditingProjectId(null);
    setEditingName('');
     };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setEditingProjectId(null);
      setEditingName('');
    }
  };

  /**
   * 返回首页处理函数
   *
   * 优化策略：
   * 1. 从 drawnixRef.forceSnapshot() 获取最新截图（绕过 2 秒防抖）
   * 2. 多层兜底：从缓存、projects state 依次尝试获取缩略图
   * 3. 有效性检查：只保存 >= 1000 字节的有效缩略图
   * 4. 双重持久化：同时保存到 CanvasService（IndexedDB）和 PROJECTS_KEY（localforage）
   *
   * 防护措施：
   * A. 防抖 flush：forceSnapshot() 同步等待截图完成，确保捕获最新状态
   * B. try/finally 保证锁：无论任何异常，setIsSaving(false) 一定会执行
   * C. 有效性检查：过滤无效的透明 GIF 或空数据
   */
  const handleBack = async () => {
    // ── 零延迟退出：防止重复点击 ──
    if (isSaving) {
      console.log('handleBack: already saving, ignoring duplicate click');
      return;
    }

    setIsSaving(true);

    const projectId = currentProjectId;
    const board = boardRef.current;

    // ── Step 0 [FIX]: 立即保存画布元素，防止 debounce 延迟导致数据丢失 ──
    // 清除待执行的 debounce 保存
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = undefined;
    }

    // ── Step 1: 读取缓存的缩略图（在 setCurrentProjectId 之前执行）──
    const cachedThumbnail = projectId ? getCachedThumbnail(projectId) : null;
    if (cachedThumbnail) {
      console.log('[handleBack] Found cached thumbnail:', cachedThumbnail.length, 'bytes');
    }

    // ── Step 2: 同步保存画布元素和缩略图到 IndexedDB（同步读取后再写入）──
    if (projectId && board) {
      try {
        const children = board.children;
        const workspace = await canvasService.getWorkspace(projectId);
        await canvasService.saveFull(
          projectId,
          children,
          workspace?.theme || value.theme,
          workspace?.viewport || value.viewport,
          cachedThumbnail || undefined
        );
        console.log('[App handleBack] Canvas elements saved immediately');
        // 更新 previousElements 以便下次正确计算增量
        previousElements = [...children];
      } catch (e) {
        console.warn('[App handleBack] Failed to save canvas elements:', e);
        // 降级到 localforage
        try {
          const currentAppValue: AppValue = {
            ...value,
            children: board.children
          };
          await safeSetItem(`${MAIN_BOARD_CONTENT_KEY}_${projectId}`, currentAppValue, true);
          console.log('[App handleBack] Canvas elements saved via localforage fallback');
        } catch (fallbackError) {
          console.error('[App handleBack] All storage backends failed for canvas:', fallbackError);
        }
      }
    }

    // ── Step 3: 触发快照遗舱创建（不阻塞，用于后续可能的异步更新）──
    if (board && projectId) {
      triggerSnapshotPod(board, projectId).then(success => {
        if (success && !BackgroundSnapshotService.serviceIsRunning) {
          BackgroundSnapshotService.start();
        }
      }).catch(e => {
        console.warn('[App handleBack] Failed to create snapshot pod:', e);
      });
    }

    // ── Step 4: 立即执行跳转（在缩略图已写入 IndexedDB 之后）──
    safeRemoveItem(CURRENT_PROJECT_ID_KEY).catch(e => {
      console.warn('handleBack: failed to remove project ID', e);
    });
    setFillInputData(null);
    setCurrentProjectId(null);

    setIsSaving(false);
  };

  const handleRename = () => {
    const currentProject = projects.find(p => p.id === currentProjectId);
    setEditedName(currentProject?.name || 'Untitled');
    setIsEditingName(true);
  };

  const handleNameChange = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      saveName();
    }
  };

  const saveName = () => {
    if (!currentProjectId || !editedName.trim()) {
      setIsEditingName(false);
      return;
    }
    const updatedProjects = projects.map(p => 
      p.id === currentProjectId 
        ? { ...p, name: editedName.trim(), updatedAt: new Date().toISOString() }
        : p
    );
    setProjects(updatedProjects);
    safeSetItem(PROJECTS_KEY, updatedProjects, false);
    setIsEditingName(false);
  };

  // 处理任务重试
  const handleTaskRetry = async (task: ImageTask) => {
    console.log('Retrying task:', task.id);
    // 更新重试次数
    await incrementRetryCount(task.id);
    // 重新触发图片生成
    await handleGenerateImage(
      task.prompt,
      task.referenceImages || [],
      {
        model: task.model,
        aspect_ratio: task.aspectRatio,
        image_size: task.imageSize as '1K' | '2K' | '4K',
      }
    );
  };

  // 处理任务重做（已完成任务填充回输入栏）
  const handleTaskRedo = (task: ImageTask) => {
    console.log('Redoing task - fill input:', task.id);
    // 将原有参数填充到输入栏
    setFillInputData({
      prompt: task.prompt,
      images: task.referenceImages || [],
      model: task.model,
      aspectRatio: task.aspectRatio,
      imageSize: task.imageSize,
    });
  };

  // 处理占位符选中
  const handlePlaceholderSelect = (placeholderId: string) => {
    console.log('Placeholder selected:', placeholderId);
  };

  // 处理占位符删除
  const handlePlaceholderDelete = async (placeholderId: string) => {
    console.log('Placeholder deleted:', placeholderId);
    // 清理占位符
    clearPlaceholder();
    // 如果有对应的任务，也删除任务
    if (currentTaskId) {
      await updateTaskStatus(currentTaskId, 'failed', undefined, '用户手动删除');
      setIsGenerating(false);
      setCurrentTaskId(null);
    }
  };

  // 处理占位符重试 - 将原始参数填回输入框，让用户确认后重新生成
  const handlePlaceholderRetry = (placeholderId: string) => {
    console.log('Placeholder retry:', placeholderId);
    // 清理当前占位符（删除卡片）
    clearPlaceholder();
    // 将原始参数填回输入框
    const placeholder = placeholderMapRef.current?.get(placeholderId);
    const task = placeholder?.task;
    if (task) {
      setFillInputData({
        prompt: task.prompt,
        images: task.referenceImages || [],
        model: task.model,
        aspectRatio: task.aspectRatio,
        imageSize: task.imageSize,
      });
    }
  };

  // 处理占位符确认插入（用户点击确定按钮）
  // 注意：placeholder 的 taskId 会被正确传入，这里优先使用传入的 taskId
  const handlePlaceholderConfirmInsert = async (placeholderId: string, taskId?: string) => {
    console.log('Placeholder confirm insert:', placeholderId, taskId);

    // 找到对应的任务：优先使用从 placeholder 传入的 taskId（这是正确的路径）
    // currentTaskId 可能在异步多任务场景下已被清空，不能作为唯一依据
    const targetTaskId = taskId || currentTaskId;
    if (!targetTaskId) {
      console.warn('[App] No taskId for confirm insert');
      // 尝试从 IndexedDB 查找该 placeholderId 对应的任务（兜底逻辑）
      const allProjectTasks = await getAllTasks();
      const matchedTask = allProjectTasks.find(t =>
        t.projectId === currentProjectId && t.placeholderInfo?.id === placeholderId
      );
      if (!matchedTask) {
        console.warn('[App] No matched task found for placeholderId:', placeholderId);
        clearPlaceholder();
        return;
      }
      // 使用匹配到的任务
      const imageUrl = matchedTask.resultImageUrl || (matchedTask as any).result?.remoteUrl;
      const assetId = matchedTask.localAssetId;
      if (!imageUrl) {
        console.warn('[App] No result image for confirm insert');
        return;
      }
      if (boardRef.current) {
        const board = boardRef.current;
        if ((board as any).handleImageGenerated) {
          const CARD_WIDTH = 280;
          const CARD_HEIGHT = 130;
          const fallbackBounds = {
            width: matchedTask.placeholderInfo?.width ?? CARD_WIDTH,
            height: matchedTask.placeholderInfo?.height ?? CARD_HEIGHT,
            prompt: matchedTask.prompt,
            model: matchedTask.model,
            aspect_ratio: matchedTask.aspectRatio,
            image_size: matchedTask.imageSize,
            referenceImages: matchedTask.referenceImages,
          };
          await (board as any).handleImageGenerated(imageUrl, undefined, matchedTask.id, fallbackBounds, assetId);
        }
      }
      // 标记任务已确认到 IndexedDB，防止下次加载时重复恢复
      await markTaskConfirmed(matchedTask.id);
      setInitialPlaceholder(null);
      clearPlaceholder();
      return;
    }

    // 获取任务的 resultImageUrl 和 localAssetId
    const task = await getTaskById(targetTaskId);
    if (!task) {
      console.warn('[App] Task not found for confirm insert:', targetTaskId);
      setInitialPlaceholder(null);
      clearPlaceholder();
      return;
    }

    // 优先从 resultImageUrl 获取图片 URL，兼容旧数据从 result.remoteUrl 读取
    const imageUrl = task.resultImageUrl || (task as any).result?.remoteUrl;
    if (!imageUrl) {
      console.warn('[App] No result image for confirm insert:', targetTaskId);
      setInitialPlaceholder(null);
      clearPlaceholder();
      return;
    }

    // 【新增】获取已缓存的 assetId（用于永久存储）
    const assetId = task.localAssetId;

    // 插入图片到画布
    if (boardRef.current) {
      const board = boardRef.current;
      try {
        if ((board as any).handleImageGenerated) {
          console.log('[App] Confirm insert: inserting image to canvas', { taskId: targetTaskId, assetId });

          // task.placeholderInfo 是 camelCase，不符合 fallbackBounds 期望的 snake_case
          // x/y 留 undefined，让 handleImageGenerated 自行计算当前视口中心
          // 如果 placeholderInfo 缺失（Phase 2 内存任务同步场景），使用默认值
          const CARD_WIDTH = 280;
          const CARD_HEIGHT = 130;
          const fallbackBounds = {
            width: task.placeholderInfo?.width ?? CARD_WIDTH,
            height: task.placeholderInfo?.height ?? CARD_HEIGHT,
            prompt: task.prompt,
            model: task.model,
            aspect_ratio: task.aspectRatio,
            image_size: task.imageSize,
            referenceImages: task.referenceImages,
          };

          await (board as any).handleImageGenerated(
            imageUrl,
            undefined,
            targetTaskId,
            fallbackBounds,
            assetId
          );

          console.log('[App] Confirm insert: image inserted successfully');
        } else {
          console.warn('[App] Confirm insert: handleImageGenerated not available');
        }
      } catch (error) {
        console.error('[App] Confirm insert failed:', error);
      }
    }

    // 标记任务已确认到 IndexedDB，防止下次加载时重复恢复
    await markTaskConfirmed(targetTaskId);

    // 清理占位符并清除初始占位符状态，防止退出页面后再进来重复显示
    setInitialPlaceholder(null);
    clearPlaceholder();
  };

  // 处理从历史记录「发送到画布」
  const handleSendTaskToCanvas = async (task: ImageTask) => {
    console.log('[App] Send task to canvas:', task.id);

    // 若 board 上有占位符，先清理（避免重复占位）
    clearPlaceholder();

    // 从 IndexedDB 拉取最新数据（含 resultImageUrl / localAssetId / placeholderInfo）
    const fullTask = await getTaskById(task.id);
    if (!fullTask) {
      console.warn('[App] Task not found for send to canvas:', task.id);
      return;
    }

    // 优先从 resultImageUrl 获取图片 URL，兼容旧数据从 result.remoteUrl 读取
    const imageUrl = fullTask.resultImageUrl || (fullTask as any).result?.remoteUrl;
    if (!imageUrl) {
      console.warn('[App] No result image for send to canvas:', task.id);
      return;
    }

    // 【关键修复】如果存在 localAssetId，先将 blob 预加载到内存缓存
    // 这样 handleImageGenerated 可以直接用本地 blob 测量真实尺寸，
    // 而不依赖 placeholderInfo 中可能过时的占位符尺寸
    if (fullTask.localAssetId && !unifiedCacheService.hasAsset(fullTask.localAssetId)) {
      try {
        const asset = await assetStorageService.getAsset(fullTask.localAssetId);
        if (asset && asset.blob) {
          unifiedCacheService.setAssetInMemory(fullTask.localAssetId, asset.blob);
          console.log('[App] Send to canvas: preloaded asset to memory cache:', fullTask.localAssetId);
        }
      } catch (loadErr) {
        console.warn('[App] Send to canvas: failed to preload asset (non-critical):', loadErr);
      }
    }

    if (boardRef.current) {
      const board = boardRef.current;
      try {
        if ((board as any).handleImageGenerated) {
          console.log('[App] Send to canvas: inserting image', { taskId: task.id, assetId: fullTask.localAssetId });

          // 将 placeholderInfo 转换为 fallbackBounds 格式（snake_case）
          // x/y 留 undefined，让 handleImageGenerated 自行计算当前视口中心
          // 如果 placeholderInfo 缺失（Phase 2 内存任务同步场景），使用默认值
          const CARD_WIDTH = 280;
          const CARD_HEIGHT = 130;
          const fallbackBounds = {
            width: fullTask.placeholderInfo?.width ?? CARD_WIDTH,
            height: fullTask.placeholderInfo?.height ?? CARD_HEIGHT,
            prompt: fullTask.prompt,
            model: fullTask.model,
            aspect_ratio: fullTask.aspectRatio,
            image_size: fullTask.imageSize,
            referenceImages: fullTask.referenceImages,
          };

          await (board as any).handleImageGenerated(
            imageUrl,
            undefined,
            fullTask.id,
            fallbackBounds,
            fullTask.localAssetId
          );
          console.log('[App] Send to canvas: image inserted successfully');
        } else {
          console.warn('[App] Send to canvas: handleImageGenerated not available');
        }
      } catch (error) {
        console.error('[App] Send to canvas failed:', error);
      }
    }

    // 标记任务已确认，防止下次加载时重复恢复
    await markTaskConfirmed(task.id);
  };

  // 处理占位符更新（同步 taskId）
  const handlePlaceholderUpdate = (placeholderInfo: any) => {
    console.log('[App] Placeholder updated:', placeholderInfo);
    // 如果当前有任务 ID，更新占位符的 taskId
    if (currentTaskId && placeholderInfo) {
      // 这里可以通过更新任务来持久化占位符位置等信息
      // 但当前任务 ID 已经在 handleGenerateImage 中创建任务时关联
    }
  };

  // 处理任务点击（跳转到对应占位符）
  const handleTaskClick = (task: ImageTask) => {
    console.log('Task clicked:', task.id);

    // 如果任务有占位符信息，聚焦到画布上的对应位置
    if (task.placeholderInfo && boardRef.current) {
      const board = boardRef.current;
      if ((board as any).focusOnPlaceholder) {
        const { x, y, width, height } = task.placeholderInfo;
        (board as any).focusOnPlaceholder(x, y, width, height);
        console.log('[App] Focusing on task placeholder:', task.placeholderInfo);
      }
    }
  };

  // 处理任务取消
  const handleTaskCancel = async (task: ImageTask) => {
    // 弹出确认对话框
    const confirmed = window.confirm('确定要取消当前任务吗？取消后需要重新生成。');
    if (!confirmed) return;

    console.log('Cancelling task:', task.id);
    // 清理占位符
    clearPlaceholder();
    // 如果当前正在生成的任务被取消，重置状态
    if (currentTaskId === task.id) {
      setIsGenerating(false);
      setCurrentTaskId(null);
    }
  };

  // 加载任务列表
  // 使用新的响应式 Hook 替代轮询
  const { allTasks } = useTaskQueue();
  
  // 暂时禁用任务同步，避免无限循环
  // TODO: 后续需要修复这个逻辑
  // const prevTasksRef = useRef<string>('');
  // useEffect(() => {
  //   if (!currentProjectId || !allTasks) return;
  //   
  //   const projectTasks = allTasks
  //     .filter(t => t.workspaceId === currentProjectId || (t as any).projectId === currentProjectId)
  //     .map(t => ({
  //       ...t,
  //       projectId: t.workspaceId || (t as any).projectId || currentProjectId,
  //       createdAt: new Date(t.createdAt).toISOString(),
  //       updatedAt: new Date(t.updatedAt).toISOString(),
  //       placeholderInfo: {
  //         id: t.id,
  //         x: 0,
  //         y: 0,
  //         width: 200,
  //         height: 200,
  //         aspectRatio: t.params?.aspect_ratio || '1:1'
  //       }
  //     })) as ImageTask[];
  //   projectTasks.sort((a, b) => 
  //     new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  //   );
  //   
  //   const tasksJson = JSON.stringify(projectTasks.map(t => ({ id: t.id, status: t.status, updatedAt: t.updatedAt })));
  //   
  //   if (prevTasksRef.current !== tasksJson) {
  //     prevTasksRef.current = tasksJson;
  //     setTasks(projectTasks);
  //   }
  // }, [allTasks, currentProjectId]);

  // 加载任务（仅用于初始加载）
  useEffect(() => {
    const loadTasks = async () => {
      if (!currentProjectId) return;

      try {
        // 加载所有任务（包括失败和完成的任务），用于显示在任务列表中
        const allProjectTasks = await getAllTasks();
        const projectTasks = allProjectTasks.filter(t => t.projectId === currentProjectId);
        // 按创建时间倒序排列，最新的在前
        projectTasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTasks(projectTasks);

        // 同时加载活动任务用于恢复
        const activeTasks = await getActiveTasks(currentProjectId);
        if (activeTasks.length > 0) {
          console.log('[App] Found active tasks to restore:', activeTasks.length);
          // 恢复最近的一个进行中的任务
          const generatingTask = activeTasks.find(t => t.status === 'generating');
          if (generatingTask) {
            setActiveTask(generatingTask);
            setCurrentPrompt(generatingTask.prompt);
            setCurrentModel(generatingTask.model);
            setIsGenerating(true);
            setCurrentTaskId(generatingTask.id);
          }
        }

        // 恢复已完成但未确认的任务（用于显示"待确认"卡片）
        // 过滤条件：status=completed、有图片、且没有被确认插入过
        const allProjectTasksForRestore = await getAllTasks();
        const completedTasks = allProjectTasksForRestore
          .filter(t =>
            t.projectId === currentProjectId &&
            t.status === 'completed' &&
            t.resultImageUrl &&
            !(t as any).confirmed  // 排除已确认插入的任务
          )
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (completedTasks.length > 0) {
          console.log('[App] Found completed tasks to restore:', completedTasks.length);
          // 恢复最近的一个已完成任务作为初始占位符
          const latestCompletedTask = completedTasks[0];
          setCurrentTaskId(latestCompletedTask.id);
          setInitialPlaceholder({
            ...(latestCompletedTask.placeholderInfo || {}),
            status: 'completed',
            imageUrl: latestCompletedTask.resultImageUrl,
            taskId: latestCompletedTask.id,
            prompt: latestCompletedTask.prompt,
            model: latestCompletedTask.model,
            aspect_ratio: latestCompletedTask.aspectRatio,
            image_size: latestCompletedTask.imageSize,
          });
        } else {
          // 没有待确认任务，清除初始占位符
          setInitialPlaceholder(null);
          setCurrentTaskId(null);
        }
      } catch (error) {
        console.error('[App] Failed to restore tasks:', error);
      }
    };

    loadTasks();
  }, [currentProjectId]);

  // 处理迁移取消 - 用户点击取消按钮时调用
  const handleMigrationCancel = async () => {
    console.log('[App] Migration cancelled by user');

    // 1. 中止迁移
    if (migrationAbortRef.current) {
      migrationAbortRef.current.abort();
      migrationAbortRef.current = null;
    }

    // 2. 清除导致崩溃的状态
    await safeRemoveItem(CURRENT_PROJECT_ID_KEY);
    setCurrentProjectId(null);

    // 3. 重置状态
    setIsMigrating(false);
    setMigrationProgress(0);
    setValue({ children: [] });

    // 4. 强制跳转首页
    window.location.href = '/';
  };

  // Project list view
  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  // 迁移过渡界面
  if (isMigrating) {
    return <MigrationScreen progress={migrationProgress} onCancel={handleMigrationCancel} />;
  }

  if (!currentProjectId) {
    return (
      <>
        {/* 存储空间警告弹窗 */}
        {storageWarning?.show && (
          <div className="modal-overlay" onClick={() => setStorageWarning(null)}>
            <div className="modal-content storage-warning-modal" onClick={e => e.stopPropagation()}>
              <div className="storage-warning-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h3 className="modal-title">存储空间不足</h3>
              <p className="modal-message">
                当前存储空间已使用 {storageWarning.percentage.toFixed(1)}%，建议清理缓存以确保数据正常保存。
              </p>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setStorageWarning(null)}>稍后提醒</button>
                <button className="btn-confirm" onClick={() => {
                  setStorageWarning(null);
                  setShowApiConfig(true);
                }}>立即清理</button>
              </div>
            </div>
          </div>
        )}
        
        <ProjectListView
          projects={projects}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onDelete={(id) => setDeleteConfirm(id)}
          onDuplicate={handleDuplicateProject}
          onBack={() => window.history.back()}
          deleteConfirm={deleteConfirm}
          onConfirmDelete={() => {
            if (deleteConfirm) {
              handleDeleteProject(deleteConfirm);
              setDeleteConfirm(null);
            }
          }}
          onCancelDelete={() => setDeleteConfirm(null)}
          onOpenApiConfig={() => setShowApiConfig(true)}
        />
        <ApiConfigModal
          isOpen={showApiConfig}
          onClose={() => setShowApiConfig(false)}
          config={apiConfig}
          onSave={handleSaveApiConfig}
          onClearCache={() => {
            // 清理缓存后重新加载数据
            loadData();
          }}
        />
        <ImageGeneratingPanel
          isGenerating={isGenerating}
          prompt={currentPrompt}
          model={currentModel}
        />
      </>
    );
  }

  // 画布视图
  return (
    <div className="canvas-page">
      <div className="canvas-main">
        <Drawnix
          value={value.children}
          viewport={value.viewport}
          theme={value.theme}
          onChange={handleChange}
          tutorial={tutorial}
          isGenerating={isGenerating}
          projectId={currentProjectId ?? undefined}
          initialPlaceholder={initialPlaceholder}
          afterInit={(board) => {
            boardRef.current = board as PlaitBoard;
            console.log('Board initialized:', board);
            startPerformanceLogging(board);
          }}
          canvasRef={(el) => {
            canvasRef.current = el;
          }}
          headerRight={
            <div className="toolbar-header-right">
            </div>
          }
          onBack={handleBack}
          onBeforeBack={undefined}
          onPlaceholderSelect={handlePlaceholderSelect}
          onPlaceholderDelete={handlePlaceholderDelete}
          onPlaceholderRetry={handlePlaceholderRetry}
          onPlaceholderConfirmInsert={handlePlaceholderConfirmInsert}
          onPlaceholderUpdate={handlePlaceholderUpdate}
          fillInputData={fillInputData || undefined}
          ref={drawnixRef}
          onThumbnailGenerated={(thumbnail, projectId) => {
            // 跳过极小的缩略图，避免透明 GIF 覆盖已有的渐变 SVG 缩略图
            if (thumbnail.length < 1000) return;

            const updated = projects.map(p =>
              p.id === projectId
                ? { ...p, thumbnail, updatedAt: new Date().toISOString() }
                : p
            );
            setProjects(updated);
            safeSetItem(PROJECTS_KEY, updated, false);
          }}
          headerLeft={
            <div className="canvas-header-left">
              <button className="canvas-back-btn" onClick={() => handleBack()} title="Back to Home">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
              </button>
              {isEditingName ? (
                <input
                  className="canvas-project-name-input"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleNameChange}
                  onBlur={saveName}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span 
                  className="canvas-project-name"
                  onDoubleClick={handleRename}
                >
                  {projects.find(p => p.id === currentProjectId)?.name || 'Untitled'}
                </span>
              )}
              <div className="canvas-header-divider"></div>
            </div>
          }
        />
        <div className="canvas-page-header-right">
          <TaskListButton
            projectId={currentProjectId || ''}
            onTaskRedo={handleTaskRedo}
            onTaskClick={handleTaskClick}
            onSendToCanvas={handleSendTaskToCanvas}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
