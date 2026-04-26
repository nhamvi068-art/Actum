import localforage from 'localforage';

const API_CONFIG_KEY = 'api_config';

// Async task response
export interface AsyncTaskResponse {
  code: string;
  message: string;
  data: string; // task_id
}

// Task status response
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
  image?: string[]; // Reference image array, url or b64_json
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

// Get saved API config
async function getApiConfig(): Promise<ApiConfig> {
  const config = await localforage.getItem<ApiConfig>(API_CONFIG_KEY);
  if (!config || !config.apiKey || !config.baseUrl) {
    throw new Error('Please configure API Key and Base URL in settings first');
  }
  return config;
}

// Build complete API URL
function buildApiUrl(baseUrl: string, endpoint: string): string {
  let url = baseUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  // Remove trailing slash
  url = url.replace(/\/$/, '');
  return `${url}${endpoint}`;
}

// Build request headers
function buildRequestHeaders(apiKey: string): HeadersInit {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

// Build image request body
function buildImageRequestBody(params: GenerateImageParams): object {
  const body: Record<string, unknown> = {
    model: params.model || 'nano-banana',
    prompt: params.prompt,
    aspect_ratio: params.aspect_ratio || '1:1',
    response_format: params.response_format || 'url',
  };

  if (params.image_size) body.image_size = params.image_size;
  if (params.image && params.image.length > 0) {
    body.image = params.image; // 直接赋值为 string[] 数组
  }

  return body;
}

// Validate API connection
export async function validateApiConnection(): Promise<{ success: boolean; message: string; quota?: number }> {
  try {
    const config = await getApiConfig();
    const baseUrl = (config.baseUrl || '').trim();
    if (!baseUrl) {
      return {
        success: false,
        message: '[ImageGeneration] config.baseUrl is empty or undefined — cannot build request URL',
      };
    }
    const url = buildApiUrl(baseUrl, '/v1/token/quota');

    console.debug('[ImageGeneration] validateApiConnection request:', url);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: buildRequestHeaders(config.apiKey),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '(无法读取响应体)');
        console.error('[ImageGeneration] HTTP error:', response.status, errText);
        return {
          success: false,
          message: `HTTP ${response.status}: ${errText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        message: 'API connection successful',
        quota: data.quota,
      };
    } catch (error: any) {
      console.error('[ImageGeneration] Fetch failed:', error.name, error.message);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Network error',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// Generate image
export async function generateImage(params: GenerateImageParams): Promise<ImageGenerationResponse> {
  const config = await getApiConfig();
  const baseUrl = (config.baseUrl || '').trim();
  if (!baseUrl) {
    throw new Error('[ImageGeneration] config.baseUrl is empty or undefined — cannot build request URL');
  }
  const url = buildApiUrl(baseUrl, '/v1/images/generations');

  const requestBody = buildImageRequestBody(params);
  console.debug('[ImageGeneration] generateImage request:', url);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: buildRequestHeaders(config.apiKey),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '(无法读取响应体)');
      console.error('[ImageGeneration] HTTP error:', response.status, errText);
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }
  } catch (error: any) {
      console.error('[ImageGeneration] Fetch failed:', error.name, error.message);
      throw error;
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
    // 打印完整的原始响应，帮助定位后端返回的差异
    console.error('[normalizeAsyncSubmitResponse] API 真实返回（非成功）:', JSON.stringify(r, null, 2));
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

// Generate image (async mode)
export async function generateImageAsync(params: GenerateImageParams): Promise<AsyncTaskResponse> {
  const config = await getApiConfig();
  const baseUrl = (config.baseUrl || '').trim();
  if (!baseUrl) {
    throw new Error('[ImageGeneration] config.baseUrl is empty or undefined — cannot build request URL');
  }
  const url = buildApiUrl(baseUrl, '/v1/images/generations?async=true');

  const requestBody = buildImageRequestBody(params);
  console.debug('[ImageGeneration] generateImageAsync request:', url);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: buildRequestHeaders(config.apiKey),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '(无法读取响应体)');
      console.error('[ImageGeneration] HTTP error:', response.status, errText);
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }
  } catch (error: any) {
    console.error('[ImageGeneration] Fetch failed:', error.name, error.message);
    throw error;
  }

  return normalizeAsyncSubmitResponse(await response.json());
}

// Query task status
export async function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  const config = await getApiConfig();
  const baseUrl = (config.baseUrl || '').trim();
  if (!baseUrl) {
    throw new Error('[ImageGeneration] config.baseUrl is empty or undefined — cannot build request URL');
  }
  const url = buildApiUrl(baseUrl, `/v1/images/tasks/${taskId}`);

  console.debug('[ImageGeneration] getTaskStatus request:', url);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: buildRequestHeaders(config.apiKey),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '(无法读取响应体)');
      console.error('[ImageGeneration] HTTP error:', response.status, errText);
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }
  } catch (error: any) {
    console.error('[ImageGeneration] Fetch failed:', error.name, error.message);
    throw error;
  }

  const raw = await response.json() as Record<string, unknown>;
  // Normalize: coerce SUCCESS -> success so downstream adapters always see lowercase
  const normalized: TaskStatusResponse = {
    ...(raw as TaskStatusResponse),
    code: (raw.code as string)?.toLowerCase() === 'success' ? 'success' : String(raw.code ?? ''),
  };
  return normalized;
}

// Poll and wait for task completion
export async function waitForTaskComplete(
  taskId: string,
  onProgress?: (status: string, progress: number) => void,
  timeoutMs: number = 300000,
  pollIntervalMs: number = 3000
): Promise<ImageGenerationResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await getTaskStatus(taskId);
    const status = result.data.status;
    const progress = parseInt(result.data.progress || '0');

    onProgress?.(status, progress);

    if (status === 'SUCCESS') {
      const nestedData: any = result.data.data;
      const imageData = nestedData?.data || nestedData;

      if (imageData && Array.isArray(imageData)) {
        return {
          created: nestedData?.created || Math.floor(Date.now() / 1000),
          data: imageData,
        };
      }
    }

    if (status === 'FAILURE') {
      throw new Error(result.data.fail_reason || 'Image generation failed');
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Image generation timeout');
}

// Available aspect ratios
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

// Available quality options
export const IMAGE_SIZES = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K (HD)' },
];

// Available models
export const MODELS = [
  { value: 'nano-banana', label: 'nano-banana (default)' },
  { value: 'nano-banana-hd', label: 'nano-banana-hd (HD)' },
  { value: 'nano-banana-2', label: 'nano-banana-2' },
  { value: 'nano-banana-2-2k', label: 'nano-banana-2-2k (2K)' },
  { value: 'nano-banana-2-4k', label: 'nano-banana-2-4k (4K)' },
  { value: 'gemini-3.1-flash-image-preview-512px', label: 'gemini-3.1-flash-image-preview-512px (1K)' },
  { value: 'gemini-3.1-flash-image-preview-2k', label: 'gemini-3.1-flash-image-preview-2k (2K)' },
  { value: 'gemini-3.1-flash-image-preview-4k', label: 'gemini-3.1-flash-image-preview-4k (4K)' },
  { value: 'gpt-image-2', label: 'gpt-image-2' },
];

// Convert URL image to Base64 (for permanent storage)
// Handles CORS issues gracefully with fallback to Image element approach
export async function urlToBase64(url: string): Promise<string> {
  // If already a data URL, return as-is
  if (url.startsWith('data:')) {
    return url;
  }

  // Strategy 1: Try fetch with blob response (fastest, works if CORS headers present)
  try {
    console.debug('[ImageGeneration] urlToBase64 fetch:', url);

    let response: Response;
    response = await fetch(url);

    if (!response.ok) {
      const errText = await response.text().catch(() => '(无法读取响应体)');
      console.error('[ImageGeneration] HTTP error:', response.status, errText);
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(new Error('FileReader failed'));
      };
      reader.readAsDataURL(blob);
    });
  } catch (fetchError) {
    console.warn('[urlToBase64] Fetch approach failed, trying Image element fallback:', fetchError);

    // Strategy 2: Fallback to Image element (works with CORS tainted images if crossOrigin="anonymous")
    try {
      const base64FromImage = await urlToBase64ViaImage(url);
      return base64FromImage;
    } catch (imageError) {
      console.error('[urlToBase64] All conversion strategies failed:', imageError);
      throw new Error(`URL to Base64 failed: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`);
    }
  }
}

/**
 * Fallback: Convert URL to Base64 using Image element and Canvas
 * Works even for CORS-tainted images when crossOrigin cannot be used
 */
function urlToBase64ViaImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        // Create canvas and draw image
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');

        // Clean up
        canvas.width = 0;
        canvas.height = 0;

        resolve(dataUrl);
      } catch (canvasError) {
        reject(new Error(`Canvas conversion failed: ${canvasError instanceof Error ? canvasError.message : 'Unknown'}`));
      }
    };

    img.onerror = () => {
      reject(new Error(`Image load failed for URL: ${url}`));
    };

    img.src = url;
  });
}
