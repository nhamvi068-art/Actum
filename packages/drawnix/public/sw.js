/// <reference lib="webworker" />

/**
 * Drawnix Service Worker
 * 负责后台任务处理和资源缓存
 * 直接操作 IndexedDB 实现任务状态同步
 */

const SW_VERSION = '1.1.0';
const CACHE_NAME = `drawnix-cache-${SW_VERSION}`;

// 任务轮询间隔
const TASK_POLL_INTERVAL = 3000;

// IndexedDB 数据库名称和版本
const DB_NAME = 'DrawnixDB';
const DB_VERSION = 3;
const TASKS_STORE_NAME = 'tasks';

declare const self: ServiceWorkerGlobalScope;

// 存储任务状态
const taskStates = new Map<string, {
  status: string;
  endpoint?: string;
  payload?: any;
  timerId?: number;
  taskId?: string;
}>();

let db: IDBDatabase | null = null;

/**
 * 打开 IndexedDB 数据库
 */
async function openDatabase(): Promise<IDBDatabase> {
  if (db) return db;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      // 确保 tasks 表存在
      if (!database.objectStoreNames.contains(TASKS_STORE_NAME)) {
        const taskStore = database.createObjectStore(TASKS_STORE_NAME, { keyPath: 'id' });
        taskStore.createIndex('status', 'status', { unique: false });
        taskStore.createIndex('workspaceId', 'workspaceId', { unique: false });
        taskStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        taskStore.createIndex('progress', 'progress', { unique: false });
      }
    };
  });
}

/**
 * 更新 IndexedDB 中的任务
 */
async function updateTaskInDB(taskId: string, updates: Record<string, any>): Promise<void> {
  const database = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([TASKS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(TASKS_STORE_NAME);
    
    const getRequest = store.get(taskId);
    
    getRequest.onsuccess = () => {
      const task = getRequest.result;
      if (!task) {
        resolve();
        return;
      }
      
      const updatedTask = { ...task, ...updates, updatedAt: Date.now() };
      const putRequest = store.put(updatedTask);
      
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * 发送消息到客户端
 */
function sendMessage(message: any) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(message);
    });
  });
}

/**
 * 轮询任务状态
 */
async function pollTaskStatus(taskId: string, endpoint: string): Promise<void> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ taskId })
    });

    if (!response.ok) {
      throw new Error(`Poll failed: ${response.status}`);
    }

    const data = await response.json();

    // 更新状态
    const taskState = taskStates.get(taskId);
    if (taskState) {
      taskState.status = data.status;

      // 计算进度
      let progress = 0;
      if (data.progress !== undefined) {
        progress = data.progress;
      } else if (data.status === 'processing' || data.status === 'generating') {
        progress = 50;
      }

      // 实时更新 IndexedDB（触发 UI 响应式更新）
      await updateTaskInDB(taskId, {
        status: mapStatus(data.status),
        progress,
        error: data.error
      });

      // 发送进度更新到客户端
      sendMessage({
        type: 'TASK_PROGRESS',
        taskId,
        status: mapStatus(data.status),
        progress,
        error: data.error
      });

      // 任务完成
      if (data.status === 'completed' || data.status === 'SUCCESS') {
        clearInterval(taskState.timerId);
        taskStates.delete(taskId);

        // 下载并缓存图片
        if (data.result?.url) {
          try {
            const assetId = await downloadAndCacheImage(data.result.url, taskId);
            await updateTaskInDB(taskId, {
              status: 'completed',
              progress: 100,
              result: {
                assetId,
                remoteUrl: data.result.url,
                type: 'image',
                metadata: data.result.metadata
              }
            });
          } catch (downloadError) {
            console.error('[SW] Failed to download image:', downloadError);
            await updateTaskInDB(taskId, {
              status: 'completed',
              progress: 100,
              result: {
                remoteUrl: data.result.url,
                type: 'image'
              }
            });
          }
        }

        // 通知客户端
        sendMessage({
          type: 'TASK_COMPLETED',
          taskId,
          result: data.result
        });
      }
      // 任务失败
      else if (data.status === 'failed' || data.status === 'FAILED') {
        clearInterval(taskState.timerId);
        taskStates.delete(taskId);

        await updateTaskInDB(taskId, {
          status: 'failed',
          error: data.error || 'Generation failed'
        });

        sendMessage({
          type: 'TASK_FAILED',
          taskId,
          error: data.error
        });
      }
    }
  } catch (error) {
    console.error('[SW] Poll error:', error);
  }
}

/**
 * 将 API 状态映射到内部状态
 */
function mapStatus(apiStatus: string): string {
  const statusMap: Record<string, string> = {
    'pending': 'pending',
    'processing': 'generating',
    'generating': 'generating',
    'completed': 'completed',
    'success': 'completed',
    'failed': 'failed',
    'failure': 'failed'
  };
  return statusMap[apiStatus?.toLowerCase()] || 'generating';
}

/**
 * 下载并缓存图片到 IndexedDB
 */
async function downloadAndCacheImage(imageUrl: string, taskId: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const blob = await response.blob();
  const assetId = `asset_${taskId}_${Date.now()}`;
  
  // 存储到 IndexedDB
  const database = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['assets'], 'readwrite');
    const store = transaction.objectStore('assets');
    
    const asset = {
      id: assetId,
      type: 'image',
      mimeType: blob.type,
      blob,
      size: blob.size,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspaceId: null
    };
    
    const request = store.add(asset);
    
    request.onsuccess = () => resolve(assetId);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 开始轮询任务
 */
function startPolling(taskId: string, endpoint: string) {
  // 如果已在轮询，先停止
  stopPolling(taskId);

  const timerId = setInterval(() => {
    pollTaskStatus(taskId, endpoint);
  }, TASK_POLL_INTERVAL);

  taskStates.set(taskId, {
    status: 'polling',
    endpoint,
    timerId
  });

  // 立即执行一次
  pollTaskStatus(taskId, endpoint);
}

/**
 * 停止轮询任务
 */
function stopPolling(taskId: string) {
  const taskState = taskStates.get(taskId);
  if (taskState?.timerId) {
    clearInterval(taskState.timerId);
    taskStates.delete(taskId);
  }
}

// 监听消息
self.addEventListener('message', (event) => {
  const message = event.data as TaskMessage;

  switch (message.type) {
    case 'START_TASK':
      if (message.taskId && message.endpoint) {
        startPolling(message.taskId, message.endpoint);
      }
      break;

    case 'STOP_TASK':
      if (message.taskId) {
        stopPolling(message.taskId);
      }
      break;

    case 'CHECK_STATUS':
      sendMessage({
        type: 'STATUS',
        tasks: Array.from(taskStates.keys())
      });
      break;
  }
});

// 缓存策略：Cache First
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 只缓存同源资源
  if (url.origin !== self.location.origin) {
    return;
  }

  // 图片资源使用 Cache First
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
    event.respondWith(
      caches.match(event.request).then(response => {
        if (response) {
          return response;
        }

        return fetch(event.request).then(networkResponse => {
          // 可选：缓存新资源
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        });
      })
    );
  }
});

// 安装事件
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', SW_VERSION);
  self.skipWaiting();
});

// 激活事件
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', SW_VERSION);

  // 清理旧缓存
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('drawnix-cache-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => {
      self.clients.claim();
    })
  );
});

export {};
