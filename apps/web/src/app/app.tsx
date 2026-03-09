import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Drawnix, boardToImage, ImageGenerateOptions, PlaceholderInfo as DrawnixPlaceholderInfo } from '@drawnix/drawnix';
import { PlaitBoard, PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import localforage from 'localforage';
import LZString from 'lz-string';
import { ApiConfigModal, ApiConfig } from '../components/ApiConfigModal/ApiConfigModal';
import { ImageGeneratingPanel } from '../components/ImageGeneratingPanel/ImageGeneratingPanel';
import { AnnouncementModal } from '../components/AnnouncementModal/AnnouncementModal';
import CustomDropdown from '../components/CustomDropdown/CustomDropdown';
import CardActionsDropdown from '../components/CardActionsDropdown/CardActionsDropdown';
import { generateImage, generateImageAsync, waitForTaskComplete, urlToBase64 } from '../services/imageGeneration';
import {
  createTask,
  updateTaskStatus,
  incrementRetryCount,
  getActiveTasks,
  getAllTasks,
  getTaskById as getTask,
  cancelTask,
  isTaskCancelled,
  ImageTask,
  PlaceholderInfo,
  markTaskAsInserted,
} from '../services/taskManager';
import TaskListButton from '../components/TaskNotificationPanel/TaskListButton';
import logo from '../assets/logo.png';
import {
  checkStorageQuota,
  isStorageNearFull,
  getStorageStatusText,
  clearThumbnails,
  cleanOldBoardContent,
  requestPersistentStorage,
} from './utils/storage';
import {
  drawnixServices,
  assetStorageService,
  resourceManager,
  storageMonitorService,
  canvasService,
  backupService,
  taskStorageService,
  useTaskQueue,
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

async function safeSetItem<T>(key: string, value: T, compress = false): Promise<boolean> {
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
async function safeGetItem<T>(key: string, compressed = false): Promise<T | null> {
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
  return (
    <div className="project-card-custom" onClick={onClick}>
      <div className={`card-preview-custom ${project.thumbnail ? 'has-thumbnail' : ''}`}>
        {project.thumbnail ? (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <img 
              src={project.thumbnail} 
              alt={project.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onLoad={() => console.log('Thumbnail loaded for:', project.name, 'length:', project.thumbnail?.length)}
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
  onOpenApiConfig,
  onOpenAnnouncement
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
  onOpenAnnouncement: () => void;
}) {
  console.log('ProjectListView rendering with projects:', projects.length);
  const [sortBy, setSortBy] = useState('recent');

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
      {/* Nebula 背景 */}
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
          <button className="header-announcement-btn" onClick={onOpenAnnouncement} title="Announcement">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
  const [value, setValue] = useState<AppValue>({ children: [] });
  const [tutorial, setTutorial] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
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
  // 根据 aspectRatio 计算占位符尺寸
  const calculatePlaceholderSize = (aspectRatio: string): { width: number; height: number } => {
    // 使用固定高度作为基准，根据比例计算宽度
    const CARD_HEIGHT = 130;
    const CARD_WIDTH = 180;

    // 解析 aspectRatio (如 "16:9")
    const parseRatio = (ratio: string): number => {
      const [w, h] = ratio.split(':').map(Number);
      return h > 0 ? w / h : 1;
    };

    const ratio = parseRatio(aspectRatio);

    // 根据比例计算宽度，保持基准高度
    // 如果比例大于1（宽图），使用基准宽度作为参考
    // 如果比例小于1（竖图），使用基准高度
    let width: number, height: number;

    if (ratio >= 1) {
      // 宽图或正方形：高度固定为 CARD_HEIGHT
      height = CARD_HEIGHT;
      width = Math.round(height * ratio);
    } else {
      // 竖图：宽度固定为 CARD_WIDTH
      width = CARD_WIDTH;
      height = Math.round(width / ratio);
    }

    return { width, height };
  };

  const [fillInputData, setFillInputData] = useState<{
    prompt: string;
    images: string[];
    model: string;
    aspectRatio: string;
    imageSize?: string;
  } | null>(null);
  const [isServicesReady, setIsServicesReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<PlaitBoard | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
      const storedProjects = (await safeGetItem<Project[]>(PROJECTS_KEY)) || (await localforage.getItem(PROJECTS_KEY)) as Project[] | null;
      if (storedProjects) {
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

  const updatePlaceholderProgress = (progress: number) => {
    if (boardRef.current && (boardRef.current as any).updatePlaceholderProgress) {
      (boardRef.current as any).updatePlaceholderProgress(progress);
    }
  };

  const clearPlaceholder = () => {
    if (boardRef.current && (boardRef.current as any).clearPlaceholder) {
      (boardRef.current as any).clearPlaceholder();
    }
  };
  // ===== helper functions end =====

  // 处理图片生成
  const handleGenerateImage = async (prompt: string, images: string[], options: ImageGenerateOptions) => {
    if (!apiConfig.apiKey || !apiConfig.baseUrl) {
      alert('请先在设置中配置 API Key 和 Base URL');
      setShowApiConfig(true);
      return;
    }

    if (!currentProjectId) {
      alert('请先创建一个项目');
      return;
    }

    // 设置当前生成信息
    setCurrentPrompt(prompt);
    setCurrentModel(options.model || 'nano-banana');
    setIsGenerating(true);

    // 创建占位符信息（根据 aspectRatio 计算正确尺寸）
    const aspectRatio = options.aspect_ratio || '1:1';
    const imageSize = options.image_size || '1K';
    const placeholderSize = calculatePlaceholderSize(aspectRatio);
    const placeholderInfo: DrawnixPlaceholderInfo = {
      id: `placeholder-${Date.now()}`,
      x: 0,
      y: 0,
      width: placeholderSize.width,
      height: placeholderSize.height,
      aspectRatio,
    };

    // 超时时间 1000 秒
    const TIMEOUT_MS = 1000 * 1000;
    const CHECK_INTERVAL_MS = 2000; // 每2秒检查一次

    // 创建任务并持久化
    const task = await createTask(
      prompt,
      options.model || 'nano-banana',
      aspectRatio,
      imageSize,
      placeholderInfo,
      currentProjectId,
      images.length > 0 ? images : undefined
    );
    setCurrentTaskId(task.id);

    // 更新占位符的 taskId
    updatePlaceholderStatus('generating', undefined, undefined, task.id);

    // 更新任务状态为生成中
    await updateTaskStatus(task.id, 'generating');

    // 启动超时检测
    const startTime = Date.now();
    const isCancelled = false;

    const checkTimeout = async (): Promise<string | null> => {
      // 检查是否已取消
      const cancelled = await isTaskCancelled(task.id);
      if (cancelled) {
        return '任务已取消';
      }

      // 检查是否超时
      if (Date.now() - startTime > TIMEOUT_MS) {
        return '生成超时（已超过1000秒）';
      }

      return null;
    };

    // 启动定时检查
    const checkInterval = setInterval(async () => {
      const timeoutError = await checkTimeout();
      if (timeoutError) {
        clearInterval(checkInterval);
        // 更新任务状态为失败
        await updateTaskStatus(task.id, 'failed', undefined, timeoutError);

        // 更新画布上的种子卡片状态为失败
        updatePlaceholderStatus('failed', timeoutError);

        // 不再自动清除占位符，让用户看到失败状态
        setIsGenerating(false);
        setCurrentTaskId(null);
      }
    }, CHECK_INTERVAL_MS);

    try {
      // 使用异步模式提交任务
      console.log('[App][ImageGen] submit async task', {
        localTaskId: task.id,
        projectId: currentProjectId,
        model: options.model,
        aspectRatio: options.aspect_ratio,
        imageSize: options.image_size,
        hasRefImages: images.length > 0,
      });

      // 更新任务状态为提交中
      await updateTaskStatus(task.id, 'submitting');

      // 如果是具体的 gemini 模型，image_size 已经包含在模型名中，不需要再传
      const isSpecificGeminiModel = options.model?.startsWith('gemini-3.1-flash-image-preview-');
      const taskResponse = await generateImageAsync({
        prompt,
        model: options.model,
        aspect_ratio: options.aspect_ratio,
        ...(isSpecificGeminiModel ? {} : { image_size: options.image_size as '1K' | '2K' | '4K' }),
        image: images.length > 0 ? images : undefined,
        response_format: 'url', // 用 url 格式快速返回，图片会后台转换
      });

      // 兼容两种返回格式：
      // 1) 旧格式：{ code: 'success', data: 'task_id', message?: string }
      // 2) 新格式：{ task_id: 'task_id' }
      const hasSuccessCode =
        taskResponse.code === 'success' || taskResponse.code === 'SUCCESS';
      const hasTaskId =
        !!(taskResponse as any).task_id || !!(taskResponse as any).data;

      if (!hasSuccessCode && !hasTaskId) {
        throw new Error(taskResponse.message || '提交任务失败');
      }

      const taskId =
        (taskResponse as any).task_id || (taskResponse as any).data;
      console.log('[App][ImageGen] async task accepted', { localTaskId: task.id, remoteTaskId: taskId });

      // 更新任务状态为生成中（开始轮询）
      await updateTaskStatus(task.id, 'generating');

      // 轮询等待任务完成
      const response = await waitForTaskComplete(
        taskId,
        (status, progress) => {
          console.log('[App][ImageGen] remote task progress', { remoteTaskId: taskId, status, progress });
          // 更新画布上的种子卡片进度
          updatePlaceholderProgress(progress);
        },
        TIMEOUT_MS, // 与本地超时保持一致（1000秒）
        3000, // 3秒轮询
        task.id // 传入本地任务ID用于更新 IndexedDB
      );
      console.log('[App][ImageGen] remote task done', { remoteTaskId: taskId, items: response?.data?.length });

      // 清除超时检查
      clearInterval(checkInterval);

      // 检查是否被取消
      const cancelled = await isTaskCancelled(task.id);
      if (cancelled) {
        // 清理占位符
        clearPlaceholder();
        setIsGenerating(false);
        setCurrentTaskId(null);
        return;
      }

      // 获取生成的图片URL或base64
      const imageUrl = response.data[0]?.url;
      const imageB64 = response.data[0]?.b64_json;

      // 保存原始URL（用于下载）
      const savedOriginalUrl = imageUrl || '';
      
      // 优先使用 URL 显示（快速），然后后台转 Base64 保存（永久）
      if (imageUrl || imageB64) {
        // 判断使用哪个作为显示源
        let displayImageSrc: string;
        let isPermanentBase64 = false;
        
        if (imageB64) {
          // 有 base64，直接使用（已经是永久的）
          displayImageSrc = normalizeImageSrcFromB64(imageB64);
          isPermanentBase64 = true;
        } else {
          // 只有 URL，先用 URL 显示
          displayImageSrc = imageUrl!;
        }
        
        console.log('[App][ImageGen] got imageSrc', { localTaskId: task.id, preview: displayImageSrc.slice(0, 60), isPermanentBase64 });

        // 不再自动插入画布，而是更新占位符为"已完成"状态，显示预览图
        // 用户点击"确定"按钮后才插入画布

        // 更新任务状态为 completed
        if (!isPermanentBase64 && imageUrl) {
          // 先用 URL 更新任务状态
          await updateTaskStatus(task.id, 'completed', displayImageSrc, undefined, savedOriginalUrl);
          console.log('[App][ImageGen] task updated -> completed (with URL)', { localTaskId: task.id });

          // 后台转换 URL 为 Base64（不阻塞用户）
          setTimeout(async () => {
            try {
              console.log('[App][ImageGen] converting URL to Base64 in background...', { localTaskId: task.id });
              const permanentBase64 = await urlToBase64(imageUrl);
              console.log('[App][ImageGen] URL converted to Base64', { localTaskId: task.id, preview: permanentBase64.slice(0, 60) });

              // 更新任务为永久 Base64
              await updateTaskStatus(task.id, 'completed', permanentBase64, undefined, savedOriginalUrl);
              console.log('[App][ImageGen] task updated -> completed (with Base64)', { localTaskId: task.id });
            } catch (error) {
              console.error('[App][ImageGen] background URL to Base64 conversion failed', { localTaskId: task.id }, error);
              // 转换失败，保留 URL 版本
            }
          }, 100);
        } else {
          // 本身就是 Base64，直接更新任务
          await updateTaskStatus(task.id, 'completed', displayImageSrc, undefined, savedOriginalUrl);
          console.log('[App][ImageGen] task updated -> completed (with Base64)', { localTaskId: task.id });
        }

        // 更新占位符状态为已完成，并传入预览图和任务ID
        updatePlaceholderStatus('completed', undefined, displayImageSrc, task.id);
        console.log('[App][ImageGen] placeholder updated to completed with preview', { localTaskId: task.id });

        // 清理生成状态
        setIsGenerating(false);
        setCurrentTaskId(null);
      } else {
        // 没有拿到任何图片（既没有 URL 也没有 Base64）
        console.error('[App][ImageGen] SUCCESS but empty imageSrc', {
          localTaskId: task.id,
          remoteTaskId: taskId,
          imageUrlExists: !!imageUrl,
          imageB64Exists: !!imageB64,
        });
        // 清理占位符
        clearPlaceholder();
      }
    } catch (error) {
      // 清除超时检查
      clearInterval(checkInterval);

      console.error('Image generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : '图片生成失败，请重试';

      // 更新任务状态为失败（使用 task.id 而不是 currentTaskId）
      if (task?.id) {
        await updateTaskStatus(task.id, 'failed', undefined, errorMessage);
      }

      // 更新画布上的种子卡片状态为失败
      updatePlaceholderStatus('failed', errorMessage);

      // 不再自动清除占位符，让用户看到失败状态
      setIsGenerating(false);
      setCurrentTaskId(null);
    }
  };

  const handleChange = (data: any) => {
    try {
      const children = Array.isArray(data) ? data : data.children;
      const newTheme = data.theme !== undefined ? data.theme : value.theme;
      const newViewport = data.viewport !== undefined ? data.viewport : value.viewport;
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

      // Debounced save - only save after 1 second of inactivity
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        if (currentProjectId && !storageFailed) {
          // 优先使用新存储服务（CanvasService）
          try {
            // 计算增量并保存
            const delta = canvasService.computeDelta(previousElements, children);
            await canvasService.saveDelta(currentProjectId, delta);
            previousElements = [...children];
            console.log('[App] Canvas saved via CanvasService (delta mode)');

            // 如果 theme 或 viewport 变化，单独保存
            if (themeChanged || viewportChanged) {
              await canvasService.saveThemeAndViewport(currentProjectId, newTheme, newViewport);
              console.log('[App] Theme/viewport saved via CanvasService');
            }
          } catch (e) {
            // 如果 CanvasService 失败，降级到 localforage
            console.warn('[App] CanvasService failed, falling back to localforage:', e);
            safeSetItem(`${MAIN_BOARD_CONTENT_KEY}_${currentProjectId}`, newAppValue, true);
          }
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  };

  const handleCreateProject = async () => {
    console.log('handleCreateProject called, current projects length:', projects.length);
    const newProject: Project = {
      id: `project_${Date.now()}`,
      name: 'Untitled Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updatedProjects = [newProject, ...projects];
    console.log('handleCreateProject updatedProjects:', updatedProjects.length);
    setProjects(updatedProjects);
    await safeSetItem(PROJECTS_KEY, updatedProjects);
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
    safeSetItem(PROJECTS_KEY, updatedProjects);
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
    await safeSetItem(PROJECTS_KEY, updatedProjects);
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
      safeSetItem(PROJECTS_KEY, updatedProjects);
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

  const handleBack = async () => {
    // Auto save screenshot before going back
    if (currentProjectId && boardRef.current) {
      try {
        const board = boardRef.current;
        console.log('handleBack: generating thumbnail from board...');
        
        // Use boardToImage to generate thumbnail
        // Increased ratio to 0.5 for better quality, relies on compression to keep size down
        const thumbnail = (await boardToImage(board, { 
          ratio: 0.5,
          padding: 10
        })) ?? undefined;
        
        if (thumbnail) {
          console.log('handleBack: thumbnail generated, length:', thumbnail.length);
          console.log('handleBack: thumbnail data:', thumbnail.substring(0, 100));
        }
        
        const updatedProjects = projects.map(p => 
          p.id === currentProjectId 
            ? { ...p, thumbnail: thumbnail ?? p.thumbnail, updatedAt: new Date().toISOString() }
            : p
        );
        setProjects(updatedProjects);
        await safeSetItem(PROJECTS_KEY, updatedProjects);
      } catch (error) {
        console.error('Failed to save thumbnail:', error);
      }
    }
    console.log('setCurrentProjectId(null) called in handleBack');
    setCurrentProjectId(null);
    await safeRemoveItem(CURRENT_PROJECT_ID_KEY);
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
    safeSetItem(PROJECTS_KEY, updatedProjects);
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
    console.log('[DEBUG app.tsx] handleTaskRedo called', { 
      taskId: task.id, 
      prompt: task.prompt,
      hasReferenceImages: !!(task.referenceImages && task.referenceImages.length > 0),
      model: task.model,
      aspectRatio: task.aspectRatio
    });
    // 将原有参数填充到输入栏
    setFillInputData({
      prompt: task.prompt,
      images: task.referenceImages || [],
      model: task.model,
      aspectRatio: task.aspectRatio,
      imageSize: task.imageSize,
    });
    console.log('[DEBUG app.tsx] fillInputData set');
  };

  // 处理占位符选中
  const handlePlaceholderSelect = useCallback((placeholderId: string) => {
    console.log('Placeholder selected:', placeholderId);
  }, []);

  // 处理占位符删除
  const handlePlaceholderDelete = useCallback(async (placeholderId: string) => {
    console.log('[DEBUG app.tsx] handlePlaceholderDelete called', { placeholderId, currentTaskId });
    console.log('Placeholder deleted:', placeholderId);
    // 清理占位符
    clearPlaceholder();
    // 如果有对应的任务，也删除任务
    if (currentTaskId) {
      await updateTaskStatus(currentTaskId, 'failed', undefined, '用户手动删除');
      setIsGenerating(false);
      setCurrentTaskId(null);
    }
  }, [currentTaskId, clearPlaceholder]);

  // 处理占位符重试 - 将原始参数填回输入框，让用户确认后重新生成
  const handlePlaceholderRetry = useCallback((placeholderId: string) => {
    console.log('[DEBUG app.tsx] handlePlaceholderRetry called', { placeholderId, hasActiveTask: !!activeTask });
    console.log('Placeholder retry:', placeholderId);
    // 清理当前占位符（删除卡片）
    clearPlaceholder();
    // 将原始参数填回输入框
    if (activeTask) {
      setFillInputData({
        prompt: activeTask.prompt,
        images: activeTask.referenceImages || [],
        model: activeTask.model,
        aspectRatio: activeTask.aspectRatio,
        imageSize: activeTask.imageSize,
      });
    }
  }, [activeTask, clearPlaceholder, setFillInputData]);

  // 处理占位符确认插入（用户点击确定按钮）
  const handlePlaceholderConfirmInsert = useCallback(async (placeholderId: string, taskIdFromPlaceholder?: string) => {
    console.log('Placeholder confirm insert:', placeholderId, taskIdFromPlaceholder);

    // 优先使用占位符中的 taskId，如果没有则使用 currentTaskId
    let targetTaskId = taskIdFromPlaceholder || currentTaskId;

    // 如果仍然没有 taskId，尝试从任务列表中查找
    if (!targetTaskId && placeholderId && currentProjectId) {
      const allTasks = await getAllTasks();
      const projectTasks = allTasks.filter(t => t.projectId === currentProjectId);
      // 查找状态为 completed 且 placeholderInfo.id 匹配的任务
      const completedTask = projectTasks.find(t => t.status === 'completed' && t.placeholderInfo?.id === placeholderId);
      if (completedTask) {
        targetTaskId = completedTask.id;
        console.log('[App] Found task by placeholderId:', targetTaskId);
      }
    }

    if (!targetTaskId) {
      console.warn('[App] No taskId for confirm insert');
      return;
    }

    // 获取任务的 resultImageUrl
    const task = await getTask(targetTaskId);
    if (!task) {
      console.warn('[App] Task not found for confirm insert:', targetTaskId);
      return;
    }

    const imageUrl = task.resultImageUrl;
    if (!imageUrl) {
      console.warn('[App] No result image for confirm insert:', targetTaskId);
      return;
    }

    // 插入图片到画布
    if (boardRef.current) {
      const board = boardRef.current;
      try {
        if ((board as any).handleImageGenerated) {
          console.log('[App] Confirm insert: inserting image to canvas', { taskId: targetTaskId, insertedToCanvas: task.insertedToCanvas });

          // 再次检查确保任务未被插入 (使用 !== true 以处理 undefined 的情况)
          if (task.insertedToCanvas === true) {
            console.warn('[App] Confirm insert: task already inserted, skipping');
            return;
          }

          await (board as any).handleImageGenerated(
            imageUrl,
            undefined,
            targetTaskId,
            {
              width: task.placeholderInfo?.width || 180,
              height: task.placeholderInfo?.height || 130,
              prompt: task.prompt,
              model: task.model,
              aspect_ratio: task.aspectRatio,
              image_size: task.imageSize,
              referenceImages: task.referenceImages
            }
          );
          console.log('[App] Confirm insert: image inserted successfully');

          // 标记任务为已插入画布，防止刷新后重复显示
          await markTaskAsInserted(targetTaskId);
          console.log('[App] Confirm insert: marked task as inserted');
        } else {
          console.warn('[App] Confirm insert: handleImageGenerated not available');
        }
      } catch (error) {
        console.error('[App] Confirm insert failed:', error);
      }
    }

    // 清理占位符
    clearPlaceholder();

    // 可选：更新任务状态为已插入（或保持 completed）
    // await updateTaskStatus(targetTaskId, 'completed', imageUrl);
  }, [currentTaskId, currentProjectId, clearPlaceholder, getAllTasks, getTask]);

  // 处理占位符更新（同步 taskId）
  const handlePlaceholderUpdate = useCallback((placeholderInfo: any) => {
    console.log('[App] Placeholder updated:', placeholderInfo);
    // 函数体内不需要使用 currentTaskId，移除不必要的依赖
  }, []); // 空依赖数组，确保函数引用始终稳定

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

  // 页面加载时恢复任务
  const handleRestoreTasks = async () => {
    if (!currentProjectId) return;
    const { getActiveTasks, updateTaskStatus } = await import('../services/taskManager');
    const activeTasks = await getActiveTasks(currentProjectId);
    console.log('Restoring active tasks:', activeTasks.length);

    // 检查是否有正在生成的任务
    const generatingTasks = activeTasks.filter(
      t => t.status === 'generating' || t.status === 'submitting'
    );

    if (generatingTasks.length > 0) {
      // 将这些任务标记为失败，因为页面刷新后无法恢复轮询
      // 用户需要重新生成
      for (const task of generatingTasks) {
        await updateTaskStatus(
          task.id,
          'failed',
          undefined,
          '页面刷新，任务已中断，请重新生成'
        );
      }
      console.log('Marked interrupted tasks as failed');
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

        // 恢复已完成但未插入画布的任务（用于显示"待确认"卡片）
        // 注意：需要明确检查 insertedToCanvas !== true，因为旧任务的 insertedToCanvas 可能是 undefined
        const allProjectTasksForRestore = await getAllTasks();
        console.log('[App] All tasks for restore:', allProjectTasksForRestore.map(t => ({
          id: t.id,
          status: t.status,
          insertedToCanvas: t.insertedToCanvas,
          projectId: t.projectId,
        })));
        const completedTasks = allProjectTasksForRestore
          .filter(t => t.projectId === currentProjectId && t.status === 'completed' && t.resultImageUrl && t.insertedToCanvas !== true)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        console.log('[App] Filtered completed tasks:', completedTasks.length, completedTasks.map(t => ({ id: t.id, insertedToCanvas: t.insertedToCanvas })));

        if (completedTasks.length > 0) {
          console.log('[App] Found completed tasks to restore:', completedTasks.length);
          // 恢复最近的一个已完成任务作为初始占位符
          const latestCompletedTask = completedTasks[0];
          setCurrentTaskId(latestCompletedTask.id);
          setInitialPlaceholder({
            ...latestCompletedTask.placeholderInfo,
            status: 'completed',
            imageUrl: latestCompletedTask.resultImageUrl,
            taskId: latestCompletedTask.id,
            prompt: latestCompletedTask.prompt,
            model: latestCompletedTask.model,
            aspect_ratio: latestCompletedTask.aspectRatio,
            image_size: latestCompletedTask.imageSize,
          });
        }
      } catch (error) {
        console.error('[App] Failed to restore tasks:', error);
      }
    };

    loadTasks();
  }, [currentProjectId]);

  // Project list view
  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
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
          onOpenAnnouncement={() => setShowAnnouncement(true)}
        />
        <AnnouncementModal
          isOpen={showAnnouncement}
          onClose={() => setShowAnnouncement(false)}
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
          onGenerateImage={handleGenerateImage}
          isGenerating={isGenerating}
          initialPlaceholder={initialPlaceholder}
          afterInit={(board) => {
            boardRef.current = board as PlaitBoard;
            console.log('Board initialized:', board);
          }}
          canvasRef={(el) => {
            canvasRef.current = el;
          }}
          headerRight={
            <div className="toolbar-header-right">
            </div>
          }
          onBack={handleBack}
          tasks={tasks}
          onTaskClick={handleTaskClick}
          onTaskRedo={handleTaskRedo}
          onPlaceholderSelect={handlePlaceholderSelect}
          onPlaceholderDelete={handlePlaceholderDelete}
          onPlaceholderRetry={handlePlaceholderRetry}
          onPlaceholderConfirmInsert={handlePlaceholderConfirmInsert}
          onPlaceholderUpdate={handlePlaceholderUpdate}
          fillInputData={fillInputData || undefined}
          headerLeft={
            <div className="canvas-header-left">
              <button className="canvas-back-btn" onClick={handleBack} title="Back to Home">
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
          />
        </div>
      </div>
    </div>
  );
}

export default App;
