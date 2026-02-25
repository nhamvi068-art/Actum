import { useState, useEffect, useRef } from 'react';
import { Drawnix, boardToImage, ImageGenerateOptions } from '@drawnix/drawnix';
import { PlaitBoard, PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import localforage from 'localforage';
import { ApiConfigModal, ApiConfig } from '../components/ApiConfigModal/ApiConfigModal';
import { ImageGeneratingPanel } from '../components/ImageGeneratingPanel/ImageGeneratingPanel';
import { generateImage } from '../services/imageGeneration';

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

localforage.config({
  name: 'Drawnix',
  storeName: 'drawnix_store',
  driver: localforage.LOCALSTORAGE,
});

// Helper function to handle localforage errors gracefully
async function safeSetItem<T>(key: string, value: T): Promise<boolean> {
  try {
    await localforage.setItem(key, value);
    return true;
  } catch (error: any) {
    console.error('Failed to save data:', error);
    
    // If quota exceeded, try to clear old thumbnails and retry
    if (error?.name === 'QuotaExceededError' || error?.code === 22) {
      console.warn('Storage quota exceeded, attempting to clear old data...');
      try {
        // Clear all thumbnails to free up space
        const projects = await localforage.getItem<Project[]>(PROJECTS_KEY);
        if (projects) {
          const updatedProjects = projects.map(p => ({ ...p, thumbnail: undefined }));
          await localforage.setItem(PROJECTS_KEY, updatedProjects);
          console.log('Cleared old thumbnails, retrying save...');
          await localforage.setItem(key, value);
          return true;
        }
      } catch (retryError) {
        console.error('Failed to recover storage:', retryError);
      }
    }
    return false;
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

function ProjectCard({ project, onClick, onDelete }: { project: Project; onClick: () => void; onDelete: (id: string) => void }) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(project.id);
  };

  return (
    <div className="project-card" onClick={onClick}>
      <div className="card-actions">
        <button className="btn-delete" onClick={handleDelete} title="Delete project">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
      <div className={`card-preview ${project.thumbnail ? 'has-thumbnail' : ''}`}>
        {project.thumbnail ? (
          <div style={{ width: '100%', height: '180px', position: 'relative' }}>
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
      <div className="card-info">
        <h3 className="card-title">{project.name}</h3>
        <p className="card-meta">
          {formatTimeAgo(project.updatedAt)}
        </p>
      </div>
    </div>
  );
}

function ProjectListView({
  projects,
  onSelectProject,
  onCreateProject,
  onDelete,
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
  onBack: () => void;
  deleteConfirm: string | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onOpenApiConfig: () => void;
}) {
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
      
      <div className="page-container">
        {/* Header */}
        <div className="page-header">
        <div className="header-left">
          <span className="logo">Omni Canvas</span>
        </div>
        <div className="header-right">
          <button className="header-icon" onClick={onOpenApiConfig} title="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="hero-section">
          <h1 className="hero-title">Welcome to Omni Canvas!</h1>
          <p className="hero-subtitle">Explore, expand, and refine your ideas</p>
        </div>

        <div className="action-bar">
          <button className="btn-new-project" onClick={onCreateProject}>
            <span>+</span>
            <span>New Project</span>
          </button>
          <button className="btn-filter">
            <span>Recent</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>

        {projects.length > 0 ? (
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => onSelectProject(project.id)}
                onDelete={onDelete}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <h3 className="empty-title">No projects yet</h3>
            <p className="empty-desc">Create your first project to get started</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="page-footer">
        <span>Omni | © 2026</span>
        <div className="footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
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
    </div>
    </>
  );
}

export function App() {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<PlaitBoard | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const storedProjects = (await localforage.getItem(PROJECTS_KEY)) as Project[] | null;
        if (storedProjects) {
          setProjects(storedProjects);
        }

        // 加载 API 配置
        const storedApiConfig = (await localforage.getItem(API_CONFIG_KEY)) as ApiConfig | null;
        if (storedApiConfig) {
          setApiConfig(storedApiConfig);
        }

        if (currentProjectId) {
          const storedData = (await localforage.getItem(
            `${MAIN_BOARD_CONTENT_KEY}_${currentProjectId}`
          )) as AppValue | null;
          if (storedData) {
            setValue(storedData);
            if (storedData.children && storedData.children.length === 0) {
              setTutorial(true);
            }
            return;
          }
          setTutorial(true);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    loadData();
  }, [currentProjectId]);

  const handleSaveApiConfig = async (config: ApiConfig) => {
    setApiConfig(config);
    await safeSetItem(API_CONFIG_KEY, config);
  };

  // 处理图片生成
  const handleGenerateImage = async (prompt: string, images: string[], options: ImageGenerateOptions) => {
    if (!apiConfig.apiKey || !apiConfig.baseUrl) {
      alert('请先在设置中配置 API Key 和 Base URL');
      setShowApiConfig(true);
      return;
    }

    // 设置当前生成信息
    setCurrentPrompt(prompt);
    setCurrentModel(options.model || 'nano-banana');
    setIsGenerating(true);

    try {
      const response = await generateImage({
        prompt,
        model: options.model,
        aspect_ratio: options.aspect_ratio,
        image_size: options.image_size as '1K' | '2K' | '4K',
        image: images.length > 0 ? images : undefined,
      });

      // 获取生成的图片URL或base64
      const imageUrl = response.data[0]?.url;
      const imageB64 = response.data[0]?.b64_json;
      
      let imageSrc = imageUrl;
      if (!imageSrc && imageB64) {
        // 如果没有URL但有base64，转换为data URL
        imageSrc = `data:image/png;base64,${imageB64}`;
      }
      
      if (imageSrc) {
        // 将生成的图片添加到画布
        // 使用占位符机制，在占位符上显示生成的图片
        if (boardRef.current) {
          const board = boardRef.current;
          // 调用 board 上的 handleImageGenerated 方法，直接在占位符上渲染图片
          if ((board as any).handleImageGenerated) {
            await (board as any).handleImageGenerated(imageSrc);
          } else {
            // 兼容：如果没有 handleImageGenerated，使用原来的方式
            const { addImageFromUrl } = await import('@drawnix/drawnix');
            await addImageFromUrl(board, imageSrc);
          }
        }
      } else {
        alert('未能获取生成的图片，请重试');
      }
    } catch (error) {
      console.error('Image generation failed:', error);
      alert(error instanceof Error ? error.message : '图片生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleChange = (data: any) => {
    try {
      const children = Array.isArray(data) ? data : data.children;
      const newAppValue: AppValue = { ...value, children };
      if (currentProjectId) {
        safeSetItem(`${MAIN_BOARD_CONTENT_KEY}_${currentProjectId}`, newAppValue);
      }
      setValue(newAppValue);
      if (children && children.length > 0) {
        setTutorial(false);
      }
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  };

  const handleCreateProject = () => {
    const newProject: Project = {
      id: `project_${Date.now()}`,
      name: 'Untitled Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updatedProjects = [newProject, ...projects];
    setProjects(updatedProjects);
    safeSetItem(PROJECTS_KEY, updatedProjects);
    setCurrentProjectId(newProject.id);
    setValue({ children: [] });
    setTutorial(true);
  };

  const handleSelectProject = (projectId: string) => {
    setCurrentProjectId(projectId);
  };

  const handleDeleteProject = (projectId: string) => {
    const updatedProjects = projects.filter(p => p.id !== projectId);
    setProjects(updatedProjects);
    safeSetItem(PROJECTS_KEY, updatedProjects);
      // Also delete the project content
      localforage.removeItem(`${MAIN_BOARD_CONTENT_KEY}_${projectId}`);
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
        // Use smaller ratio to avoid exceeding localStorage quota (5-10MB)
        const thumbnail = await boardToImage(board, { 
          ratio: 0.25,
          padding: 10
        });
        
        console.log('handleBack: thumbnail generated, length:', thumbnail.length);
        console.log('handleBack: thumbnail data:', thumbnail.substring(0, 100));
        
        const updatedProjects = projects.map(p => 
          p.id === currentProjectId 
            ? { ...p, thumbnail, updatedAt: new Date().toISOString() }
            : p
        );
        setProjects(updatedProjects);
        await safeSetItem(PROJECTS_KEY, updatedProjects);
      } catch (error) {
        console.error('Failed to save thumbnail:', error);
      }
    }
    setCurrentProjectId(null);
  };

  // Project list view
  if (!currentProjectId) {
    return (
      <>
        <ProjectListView
          projects={projects}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onDelete={(id) => setDeleteConfirm(id)}
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
          afterInit={(board) => {
            boardRef.current = board as PlaitBoard;
            console.log('Board initialized:', board);
          }}
          canvasRef={(el) => {
            canvasRef.current = el;
          }}
          headerRight={
            <div className="toolbar-header-right">
              {editingProjectId === currentProjectId ? (
                <input
                  className="project-name-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={handleNameKeyDown}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="project-name"
                  onDoubleClick={() => currentProjectId && handleStartEditName(currentProjectId)}
                >
                  {projects.find(p => p.id === currentProjectId)?.name || 'Untitled'}
                </span>
              )}
            </div>
          }
          onBack={handleBack}
        />
      </div>
    </div>
  );
}

export default App;
