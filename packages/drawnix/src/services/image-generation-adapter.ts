/**
 * 图片生成 API 适配器 (Adapter Pattern) — 重构版
 *
 * 变更说明 (v2):
 * - 移除不稳定的 SMMS 图床上传逻辑
 * - 移除 `public-url` 策略
 * - 直接使用 `pure-base64` 策略：将 blob: URL 或 data: URL 转换为纯 Base64
 * - 通过 `image` 字段传递参考图给后端
 * - 不再尝试将图片 URL 嵌入 prompt
 *
 * 接口不变，保持对现有调用方的向后兼容
 */

import {
  GenerateImageParams,
  generateImageAsync,
  getTaskStatus,
} from './image-generation';

export type RemoteTaskStatus = 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';

export interface TaskStatusResult {
  status: RemoteTaskStatus;
  progress: number;
  imageUrl?: string;
  b64Json?: string;
  error?: string;
}

export interface ImageGenerationAdapter {
  /**
   * 发起生图请求，返回远端 API 的 taskId
   */
  generate(params: GenerateImageParams): Promise<string>;

  /**
   * 检查远端任务进度
   */
  checkStatus(remoteTaskId: string): Promise<TaskStatusResult>;
}

/**
 * 将 blob: URL 或 data: URL 转换为完整 Data URL（保留 MIME 前缀）
 *
 * @param img 图片 URL（支持 blob: URL、data: URL）
 * @returns 完整 data:image/...;base64,... 前缀字符串；转换失败时返回原值
 */
async function convertToDataUrl(img: string): Promise<string> {
  // 已经是 data: URL，原样返回
  if (img.startsWith('data:')) {
    return img;
  }

  // 已经是公网 HTTPS URL，原样返回
  if (img.startsWith('https://') || img.startsWith('http://')) {
    return img;
  }

  // blob: URL → fetch → FileReader → dataUrl（保留完整前缀）
  if (img.startsWith('blob:')) {
    try {
      const response = await fetch(img);
      if (!response.ok) {
        console.warn('[Adapter] Failed to fetch blob URL:', img, response.status);
        return img;
      }
      const blob = await response.blob();
      const dataUrl: string = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      });
      return dataUrl; // 保留完整前缀，不剥离
    } catch (e) {
      console.warn('[Adapter] Failed to convert blob URL to dataUrl:', img, e);
      return '';
    }
  }

  // 未知格式，原样返回
  return img;
}

/**
 * 将图片 URL 数组转换为 API 所需的 Base64 格式
 * @param images 图片 URL 数组
 * @returns 转换后的字符串数组（纯 Base64）；无效输入返回 undefined
 */
async function convertImagesForApi(
  images: string[] | undefined
): Promise<string[] | undefined> {
  if (!images || images.length === 0) return undefined;

  const results = await Promise.all(images.map(convertToDataUrl));
  const filtered = results.filter(img => img.length > 0);
  return filtered.length > 0 ? filtered : undefined;
}

/**
 * 默认的图片生成适配器
 * 直接使用纯 Base64 传递参考图，废弃 SMMS 图床
 */
export class DefaultImageGenerationAdapter implements ImageGenerationAdapter {
  /**
   * 发起生图请求
   *
   * 图片处理逻辑：
   * 1. 调用 convertImagesForApi，将 blob: URL / data: URL 转换为 Data URL
   * 2. 将完整字符串数组通过 `image` 字段传递给 API（API 要求数组格式）
   * 3. 不再将图片 URL 嵌入 prompt
   */
  async generate(params: GenerateImageParams): Promise<string> {
    try {
      const t0 = Date.now();
      // 转换为 Data URL（保留完整前缀）
      const convertedImages = await convertImagesForApi(params.image);
      console.log('[Adapter] convertedImages in', Date.now() - t0, 'ms, count:', convertedImages?.length);

      const t1 = Date.now();
      const response = await generateImageAsync({
        ...params,
        // 如果有参考图，取第一张传给 image 字段
        image: convertedImages,
      });
      console.log('[Adapter] generateImageAsync in', Date.now() - t1, 'ms');

      if (response.code !== 'success') {
        throw new Error(response.message || 'Failed to submit generation task');
      }

      console.log('[Adapter] 提交成功，taskId:', response.data);
      return response.data; // task_id
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        message.includes('Unexpected async response')
          ? message
          : `[Adapter] Generate failed: ${message}`
      );
    }
  }

  async checkStatus(remoteTaskId: string): Promise<TaskStatusResult> {
    try {
      const response = await getTaskStatus(remoteTaskId);

      if (response.code !== 'success') {
        throw new Error(response.message || 'Failed to query task status');
      }

      const { status, progress, fail_reason, data } = response.data;
      const progressValue = parseInt(progress || '0', 10);

      let imageUrl: string | undefined;
      let b64Json: string | undefined;

      if (data) {
        const imageData = data.data || data;
        if (Array.isArray(imageData) && imageData.length > 0) {
          imageUrl = imageData[0].url;
          b64Json = imageData[0].b64_json;
        }
      }

      const result: TaskStatusResult = {
        status,
        progress: progressValue,
      };

      if (status === 'SUCCESS' && imageUrl) {
        result.imageUrl = imageUrl;
      }

      if (status === 'SUCCESS' && b64Json) {
        result.b64Json = b64Json;
      }

      if (status === 'FAILURE') {
        result.error = fail_reason || 'Generation failed';
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`[Adapter] Check status failed: ${message}`);
    }
  }
}

// 单例实例
let adapterInstance: ImageGenerationAdapter | null = null;

/**
 * 获取适配器单例
 */
export function getImageGenerationAdapter(): ImageGenerationAdapter {
  if (!adapterInstance) {
    adapterInstance = new DefaultImageGenerationAdapter();
  }
  return adapterInstance;
}

/**
 * 创建新的适配器实例（用于测试或特殊场景）
 */
export function createImageGenerationAdapter(): ImageGenerationAdapter {
  return new DefaultImageGenerationAdapter();
}
