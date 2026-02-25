import localforage from 'localforage';

const API_CONFIG_KEY = 'api_config';

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

// 验证 API 连接
export async function validateApiConnection(): Promise<{ success: boolean; message: string; quota?: number }> {
  try {
    const config = await getApiConfig();
    const url = buildApiUrl(config.baseUrl, '/v1/token/quota');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
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

  const requestBody = {
    model: params.model || 'nano-banana',
    prompt: params.prompt,
    aspect_ratio: params.aspect_ratio || '1:1',
    response_format: params.response_format || 'url',
    image_size: params.image_size,
    image: params.image,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
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
];

