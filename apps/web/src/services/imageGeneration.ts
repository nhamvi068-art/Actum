import localforage from 'localforage';
import { taskStorageService } from '@drawnix/drawnix';

const API_CONFIG_KEY = 'api_config';

// 异步任务响应
export interface AsyncTaskResponse {
  code: string;
  message: string;
  data: string; // task_id
}

// 任务状态响应
export interface TaskStatusResponse {
  code: string;
  message: string;
  data: {
    task_id: string;
    status: 'IN_PROGRESS' | 'FAILURE' | 'SUCCESS';
    fail_reason?: string;
    progress: string;
    data?: {
      data?: Array<{ url?: string; b64_json?: string }>;
      created?: number;
    };
  };
}

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
}

export interface GenerateImageParams {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  response_format?: 'url' | 'b64_json';
  image_size?: '1K' | '2K' | '4K';
  image?: string[]; // 参考图数组，url 或 b64_json
}

export interface ImageGenerationResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
  }>;
}

export interface ImageGenerationError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

// 获取保存的 API 配置
async function getApiConfig(): Promise<ApiConfig> {
  const config = await localforage.getItem<ApiConfig>(API_CONFIG_KEY);
  if (!config || !config.apiKey || !config.baseUrl) {
    throw new Error('请先在设置中配置 API Key 和 Base URL');
  }
  return config;
}

// 构建完整的 API URL
function buildApiUrl(baseUrl: string, endpoint: string): string {
  let url = baseUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  // 移除末尾的斜杠
  url = url.replace(/\/$/, '');
  return `${url}${endpoint}`;
}

// ===== 内部辅助函数 =====

// 构建请求头
function buildRequestHeaders(apiKey: string): HeadersInit {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

// 构建生图请求体
function buildImageRequestBody(params: GenerateImageParams): object {
  const body: Record<string, unknown> = {
    model: params.model || 'nano-banana',
    prompt: params.prompt,
    aspect_ratio: params.aspect_ratio || '1:1',
    response_format: params.response_format || 'url',
  };

  if (params.image_size) body.image_size = params.image_size;
  if (params.image && params.image.length > 0) {
    body.image = params.image; // 传递完整数组，后端支持多张参考图
  }

  return body;
}

// ===== 内部辅助函数结束 =====

// 验证 API 连接
export async function validateApiConnection(): Promise<{ success: boolean; message: string; quota?: number }> {
  try {
    const config = await getApiConfig();
    const url = buildApiUrl(config.baseUrl, '/v1/token/quota');

    const response = await fetch(url, {
      method: 'GET',
      headers: buildRequestHeaders(config.apiKey),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: 'API 连接成功',
        quota: data.quota,
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        message: errorData.error?.message || `验证失败: ${response.statusText}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '网络错误',
    };
  }
}

// 生成图片
export async function generateImage(params: GenerateImageParams): Promise<ImageGenerationResponse> {
  const config = await getApiConfig();
  const url = buildApiUrl(config.baseUrl, '/v1/images/generations');

  const requestBody = buildImageRequestBody(params);
  console.log('[DEBUG] generateImage Payload (web):', JSON.stringify(requestBody).substring(0, 500) + '...');

  const response = await fetch(url, {
    method: 'POST',
    headers: buildRequestHeaders(config.apiKey),
    body: JSON.stringify(buildImageRequestBody(params)),
  });

  if (!response.ok) {
    const errorData: ImageGenerationError = await response.json().catch(() => ({
      error: {
        message: response.statusText || '请求失败',
        type: 'unknown_error',
      },
    }));
    throw new Error(errorData.error?.message || '图像生成失败');
  }

  const data: ImageGenerationResponse = await response.json();
  return data;
}

// Normalize async submit response to always return { code: 'success', data: taskId, message: '' }.
// Handles gateway responses that use SUCCESS (uppercase), or nest task_id / data differently.
function normalizeAsyncSubmitResponse(raw: unknown): AsyncTaskResponse {
  const r = raw as Record<string, unknown>;

  console.log('[normalizeAsyncSubmitResponse] raw response:', JSON.stringify(raw));

  // Check success: accept 'success' (any case) or truthy boolean/success codes
  const rawCode = typeof r.code === 'string' ? r.code : '';
  const isSuccess =
    rawCode.toLowerCase() === 'success' ||
    rawCode === ''; // some gateways omit code on success — fall through to taskId check

  // Try all known task ID paths
  const taskId: string =
    (typeof r.task_id === 'string' && r.task_id ? r.task_id : '') ||
    (typeof r.data === 'string' && r.data ? r.data : '') ||
    (typeof r.id === 'string' && r.id ? r.id : '') ||
    (typeof r.job_id === 'string' && r.job_id ? r.job_id : '') ||
    (typeof r.jobId === 'string' && r.jobId ? r.jobId : '') ||
    (typeof r.data === 'object' && r.data !== null
      ? (typeof (r.data as Record<string, unknown>).task_id === 'string'
          ? String((r.data as Record<string, unknown>).task_id)
          : typeof (r.data as Record<string, unknown>).id === 'string'
          ? String((r.data as Record<string, unknown>).id)
          : typeof (r.data as Record<string, unknown>).job_id === 'string'
          ? String((r.data as Record<string, unknown>).job_id)
          : '')
      : '') ||
    // Some gateways return bare task ID as a top-level number
    (typeof r.task_id === 'number' ? String(r.task_id) : '') ||
    (typeof r.id === 'number' ? String(r.id) : '') ||
    '';

  // Extract a human-readable message
  const rawMessage = String(
    r.message ?? r.msg ?? r.error?.message ?? r.error?.msg ?? ''
  );

  if (!isSuccess || !taskId) {
    // Build a rich diagnostic message so the user can report it
    const diag = {
      rawCode,
      taskIdFound: !!taskId,
      topLevelKeys: Object.keys(r),
      dataType: typeof r.data,
    };
    console.warn('[normalizeAsyncSubmitResponse] Not recognized as success:', diag, '| raw:', raw);
    throw new Error(
      rawMessage
        || `Unexpected async response (code=${JSON.stringify(rawCode)}, taskId=${JSON.stringify(taskId)}). Check console for details.`
    );
  }

  return { code: 'success', message: '', data: taskId };
}

// 生成图片（异步模式）
export async function generateImageAsync(params: GenerateImageParams): Promise<AsyncTaskResponse> {
  const config = await getApiConfig();
  const url = buildApiUrl(config.baseUrl, '/v1/images/generations?async=true');

  const requestBody = buildImageRequestBody(params);
  console.log('[DEBUG] Final Image Generation Payload (web):', JSON.stringify(requestBody).substring(0, 1000) + '...');
  console.log('[DEBUG] image field (web):', requestBody.image, 'type:', typeof requestBody.image, 'isArray:', Array.isArray(requestBody.image), 'length:', Array.isArray(requestBody.image) ? requestBody.image.length : 'N/A');

  const response = await fetch(url, {
    method: 'POST',
    headers: buildRequestHeaders(config.apiKey),
    body: JSON.stringify(buildImageRequestBody(params)),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || errorData.message || '请求失败');
  }

  return normalizeAsyncSubmitResponse(await response.json());
}

// 查询任务状态
export async function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  const config = await getApiConfig();
  const url = buildApiUrl(config.baseUrl, `/v1/images/tasks/${taskId}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: buildRequestHeaders(config.apiKey),
  });

  if (!response.ok) {
    throw new Error('查询任务状态失败');
  }

  const raw = await response.json() as Record<string, unknown>;
  const normalized: TaskStatusResponse = {
    ...(raw as TaskStatusResponse),
    code: (raw.code as string)?.toLowerCase() === 'success' ? 'success' : String(raw.code ?? ''),
  };
  return normalized;
}

// 轮询等待任务完成
export async function waitForTaskComplete(
  taskId: string,
  onProgress?: (status: string, progress: number) => void,
  timeoutMs: number = 300000,
  pollIntervalMs: number = 3000,
  localTaskId?: string // 可选：本地任务ID，用于更新 IndexedDB
): Promise<ImageGenerationResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await getTaskStatus(taskId);
    const status = result.data.status;
    const progress = parseInt(result.data.progress || '0');

    onProgress?.(status, progress);

    // 如果传入了本地任务ID，同时更新 IndexedDB
    if (localTaskId && taskStorageService) {
      try {
        await taskStorageService.updateTaskProgress(localTaskId, progress);
      } catch (e) {
        console.warn('[waitForTaskComplete] Failed to update progress in IDB:', e);
      }
    }

    if (status === 'SUCCESS') {
      // 尝试兼容不同的后端返回结构：
      // 1) result.data.data.data 为真正的图片数组
      // 2) 或者 result.data.data 直接就是图片数组
      const nestedData: any = result.data.data;
      const imageData = nestedData?.data || nestedData;

      if (imageData && Array.isArray(imageData)) {
        return {
          created: nestedData?.created || Math.floor(Date.now() / 1000),
          data: imageData,
        };
      }

      // 任务成功但没有拿到图片数据：打出结构，便于定位后端返回差异
      console.error('[waitForTaskComplete] SUCCESS but no image data', {
        taskId,
        status,
        progress: result.data.progress,
        resultData: result.data,
      });
    }

    if (status === 'FAILURE') {
      throw new Error(result.data.fail_reason || '图片生成失败');
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  console.error('[waitForTaskComplete] timeout', {
    taskId,
    timeoutMs,
  });
  throw new Error('图片生成超时');
}

// 可用的图片比例
export const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' },
];

// 可用的画质选项
export const IMAGE_SIZES = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K (高清)' },
];

// 可用的模型
export const MODELS = [
  { value: 'nano-banana', label: 'nano-banana (默认)' },
  { value: 'nano-banana-hd', label: 'nano-banana-hd (高清)' },
  { value: 'nano-banana-2', label: 'nano-banana-2' },
  { value: 'nano-banana-2-2k', label: 'nano-banana-2-2k (2K)' },
  { value: 'nano-banana-2-4k', label: 'nano-banana-2-4k (4K)' },
  { value: 'gemini-3.1-flash-image-preview-512px', label: 'gemini-3.1-flash-image-preview-512px (1K)' },
  { value: 'gemini-3.1-flash-image-preview-2k', label: 'gemini-3.1-flash-image-preview-2k (2K)' },
  { value: 'gemini-3.1-flash-image-preview-4k', label: 'gemini-3.1-flash-image-preview-4k (4K)' },
  { value: 'gpt-image-2', label: 'gpt-image-2' },
];

// 将URL图片转换为Base64（用于永久保存）
export async function urlToBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw new Error(`URL转Base64失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

