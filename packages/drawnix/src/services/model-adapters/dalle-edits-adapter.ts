/**
 * DALL-E Edits 格式适配器
 *
 * 遵循 DALL-E edits API 规范，支持图生图功能：
 * - 将前端传来的 dataUrl (data:image/xxx;base64,...) 转换为纯 Base64
 * - 通过 `image` 字段传递给后端
 * - 支持异步模式 (async=true)
 */

import localforage from 'localforage';
import type {
  GenerateImageRequest,
  ImageModelAdapter,
  TaskStatusResult,
  AsyncTaskResponse,
} from './types';

const API_CONFIG_KEY = 'api_config';

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
}

interface TaskStatusResponse {
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
  url = url.replace(/\/$/, '');
  return `${url}${endpoint}`;
}

// 构建请求头
function buildRequestHeaders(apiKey: string): HeadersInit {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

// 宽高比转换为 DALL-E 尺寸
function mapAspectRatioToSize(aspectRatio?: string, size?: string): string {
  // 如果直接传了 DALL-E 尺寸格式 (如 1024x1024)，直接返回
  if (size && /^\d+x\d+$/.test(size)) {
    return size;
  }

  // 将项目内部的尺寸 (1K/2K/4K) 映射到 DALL-E 尺寸
  const sizeMap: Record<string, string> = {
    '1K': '1024x1024',
    '2K': '1792x1024',
    '4K': '1792x1024',
  };

  if (size && sizeMap[size]) {
    return sizeMap[size];
  }

  // 根据宽高比映射
  const ratioMap: Record<string, string> = {
    '1:1': '1024x1024',
    '2:3': '1024x1792',
    '3:2': '1792x1024',
    '3:4': '1024x1366',
    '4:3': '1366x1024',
    '4:5': '1024x1280',
    '5:4': '1280x1024',
    '9:16': '1024x1792',
    '16:9': '1792x1024',
    '21:9': '1792x768',
  };

  if (aspectRatio && ratioMap[aspectRatio]) {
    return ratioMap[aspectRatio];
  }

  // 默认正方形
  return '1024x1024';
}

// 剥离 data:image/xxx;base64, 前缀，转换为纯 Base64
function extractPureBase64(dataUrl: string | undefined): string | undefined {
  if (!dataUrl) return undefined;
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  return match ? match[1] : dataUrl;
}

// 规范化异步响应
function normalizeAsyncSubmitResponse(raw: unknown): AsyncTaskResponse {
  const r = raw as Record<string, unknown>;

  const rawCode = typeof r.code === 'string' ? r.code : '';
  const isSuccess =
    rawCode.toLowerCase() === 'success' ||
    rawCode === '';

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
    (typeof r.task_id === 'number' ? String(r.task_id) : '') ||
    (typeof r.id === 'number' ? String(r.id) : '') ||
    '';

  const rawMessage = String(
    r.message ?? r.msg ?? r.error?.message ?? r.error?.msg ?? ''
  );

  if (!isSuccess || !taskId) {
    throw new Error(
      rawMessage ||
        `Unexpected async response (code=${JSON.stringify(rawCode)}, taskId=${JSON.stringify(taskId)})`
    );
  }

  return { code: 'success', message: '', data: taskId };
}

// 解析任务状态响应
function parseTaskStatusResponse(raw: unknown): TaskStatusResult {
  const r = raw as TaskStatusResponse;
  const status = r.data?.status ?? 'FAILURE';
  const progress = parseInt(r.data?.progress || '0', 10);

  let imageUrl: string | undefined;
  let b64Json: string | undefined;
  const imageData = r.data?.data?.data || r.data?.data;

  if (Array.isArray(imageData) && imageData.length > 0) {
    imageUrl = imageData[0].url;
    b64Json = imageData[0].b64_json;
  }

  return {
    status,
    progress,
    imageUrl,
    b64Json,
    error: status === 'FAILURE' ? (r.data?.fail_reason || 'Generation failed') : undefined,
  };
}

/**
 * DALL-E Edits 格式适配器
 *
 * 符合 DALL-E edits API 规范，Payload 格式：
 * {
 *   "model": "nano-banana",
 *   "prompt": "...",
 *   "image": "<纯 Base64 字符串>",
 *   "size": "1024x1024"
 * }
 */
export class DalleEditsAdapter implements ImageModelAdapter {
  readonly modelName = 'dalle-edits';

  async generate(request: GenerateImageRequest): Promise<string> {
    const config = await getApiConfig();
    const baseUrl = (config.baseUrl || '').trim();
    if (!baseUrl) {
      throw new Error('[DalleEditsAdapter] config.baseUrl is empty — cannot build request URL');
    }
    const url = buildApiUrl(baseUrl, '/v1/images/generations?async=true');

    // 将参考图转换为纯 Base64
    const baseImage = extractPureBase64(request.referenceImage);

    // 组装 DALL-E edits 格式的请求体
    const body: Record<string, unknown> = {
      model: request.model || 'nano-banana',
      prompt: request.prompt,
      size: mapAspectRatioToSize(request.aspectRatio, request.size),
      response_format: request.response_format || 'url',
    };

    // 如果有参考图，添加到请求体中
    if (baseImage) {
      body.image = baseImage;
      console.log('[DalleEditsAdapter] 参考图已转换为纯 Base64，长度:', baseImage.length);
    }

    console.log('[DalleEditsAdapter] 提交 Payload:', JSON.stringify(body).substring(0, 500) + '...');

    console.warn('🚀 === 即将发起大模型网络请求 ===');
    console.warn('👉 目标 URL:', url);
    const safeHeaders = { ...buildRequestHeaders(config.apiKey) };
    if (safeHeaders['Authorization']) {
      safeHeaders['Authorization'] = (safeHeaders['Authorization'] as string).substring(0, 30) + '...[REDACTED]';
    }
    console.warn('👉 Headers:', JSON.stringify(safeHeaders));

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: buildRequestHeaders(config.apiKey),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '(无法读取响应体)');
        console.error('❌ === HTTP 状态异常 ===');
        console.error('状态码:', response.status);
        console.error('返回体:', errText);
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
    } catch (error: any) {
      console.error('💥 === Fetch 彻底崩盘（未到达网络层或网络阻断）===');
      console.error('错误名称:', error.name);
      console.error('错误信息:', error.message);
      console.error('完整 error 对象:', error);
      throw error;
    }

    const result = normalizeAsyncSubmitResponse(await response.json());
    return result.data;
  }

  async checkStatus(taskId: string): Promise<TaskStatusResult> {
    const config = await getApiConfig();
    const baseUrl = (config.baseUrl || '').trim();
    if (!baseUrl) {
      throw new Error('[DalleEditsAdapter] config.baseUrl is empty — cannot build request URL');
    }
    const url = buildApiUrl(baseUrl, `/v1/images/tasks/${taskId}`);

    console.warn('🚀 === 即将发起大模型网络请求 ===');
    console.warn('👉 目标 URL:', url);
    const safeHeaders = { ...buildRequestHeaders(config.apiKey) };
    if (safeHeaders['Authorization']) {
      safeHeaders['Authorization'] = (safeHeaders['Authorization'] as string).substring(0, 30) + '...[REDACTED]';
    }
    console.warn('👉 Headers:', JSON.stringify(safeHeaders));

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: buildRequestHeaders(config.apiKey),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '(无法读取响应体)');
        console.error('❌ === HTTP 状态异常 ===');
        console.error('状态码:', response.status);
        console.error('返回体:', errText);
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
    } catch (error: any) {
      console.error('💥 === Fetch 彻底崩盘（未到达网络层或网络阻断）===');
      console.error('错误名称:', error.name);
      console.error('错误信息:', error.message);
      console.error('完整 error 对象:', error);
      throw error;
    }

    const raw = await response.json();
    const normalized: TaskStatusResult = parseTaskStatusResponse(raw);

    // 规范化状态码为小写
    if (normalized.status) {
      normalized.status = normalized.status.toUpperCase() as TaskStatusResult['status'];
    }

    return normalized;
  }
}

// 导出单例
let adapterInstance: ImageModelAdapter | null = null;

export function getDalleEditsAdapter(): ImageModelAdapter {
  if (!adapterInstance) {
    adapterInstance = new DalleEditsAdapter();
  }
  return adapterInstance;
}
