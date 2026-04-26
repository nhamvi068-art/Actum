/**
 * 图片生成适配器管理器 (Adapter Manager)
 *
 * 职责：
 * 1. 接收 UI 层的统一请求参数
 * 2. 根据 model 名称路由到对应的 Adapter
 * 3. 调用 Adapter 完成网络请求
 *
 * 这是一个门面 (Facade)，对上层隐藏具体的 Adapter 选择逻辑
 */

import type { GenerateImageRequest, ImageModelAdapter, TaskStatusResult } from './types';
import { DalleEditsAdapter, getDalleEditsAdapter } from './dalle-edits-adapter';

/**
 * 支持的模型名称列表
 * 用于调试和文档
 */
export const SUPPORTED_MODELS = [
  // Nano Banana 系列
  { name: 'nano-banana', adapter: 'dalle-edits', label: 'nano-banana (默认)' },
  { name: 'nano-banana-hd', adapter: 'dalle-edits', label: 'nano-banana-hd (高清)' },
  { name: 'nano-banana-2', adapter: 'dalle-edits', label: 'nano-banana-2' },
  { name: 'nano-banana-2-2k', adapter: 'dalle-edits', label: 'nano-banana-2-2k (2K)' },
  { name: 'nano-banana-2-4k', adapter: 'dalle-edits', label: 'nano-banana-2-4k (4K)' },
  // Gemini 系列
  { name: 'gemini-3.1-flash-image-preview-512px', adapter: 'dalle-edits', label: 'gemini-flash-512px (1K)' },
  { name: 'gemini-3.1-flash-image-preview-2k', adapter: 'dalle-edits', label: 'gemini-flash-2k (2K)' },
  { name: 'gemini-3.1-flash-image-preview-4k', adapter: 'dalle-edits', label: 'gemini-flash-4k (4K)' },
  // GPT Image 2
  { name: 'gpt-image-2', adapter: 'dalle-edits', label: 'gpt-image-2' },
];

/**
 * 获取指定模型对应的适配器
 * @param modelName 模型名称
 * @returns 对应的适配器实例
 *
 * 当前所有模型都使用 DalleEditsAdapter。
 * 后续可以在这里添加新的适配器分支来支持其他模型。
 */
function getAdapterForModel(modelName?: string): ImageModelAdapter {
  // 当前所有模型都走 DalleEditsAdapter
  // 后续扩展：可以根据 modelName 返回不同的 Adapter
  console.log(`[AdapterManager] 路由模型: ${modelName || 'default'} -> DalleEditsAdapter`);
  return getDalleEditsAdapter();
}

/**
 * 图片生成管理器
 * 封装适配器选择逻辑，提供统一的生成接口
 */
export class ImageGenerationManager {
  private adapter: ImageModelAdapter;

  constructor(modelName?: string) {
    this.adapter = getAdapterForModel(modelName);
    console.log(`[ImageGenerationManager] 初始化，适配器: ${this.adapter.modelName}`);
  }

  /**
   * 切换到指定模型的适配器
   */
  switchModel(modelName: string): void {
    this.adapter = getAdapterForModel(modelName);
    console.log(`[ImageGenerationManager] 切换模型: ${modelName}`);
  }

  /**
   * 发起图片生成请求
   * @param request 统一的请求参数
   * @returns 远端 taskId
   */
  async generate(request: GenerateImageRequest): Promise<string> {
    console.log('[ImageGenerationManager] 生成请求:', {
      prompt: request.prompt.substring(0, 50) + '...',
      hasReferenceImage: !!request.referenceImage,
      model: request.model,
      aspectRatio: request.aspectRatio,
      size: request.size,
    });

    try {
      const taskId = await this.adapter.generate(request);
      console.log('[ImageGenerationManager] 生成成功，taskId:', taskId);
      return taskId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ImageGenerationManager] 生成失败:', message);
      throw error;
    }
  }

  /**
   * 查询任务状态
   * @param taskId 远端任务 ID
   */
  async checkStatus(taskId: string): Promise<TaskStatusResult> {
    return this.adapter.checkStatus(taskId);
  }
}

// 单例实例
let managerInstance: ImageGenerationManager | null = null;

/**
 * 获取 Manager 单例
 */
export function getImageGenerationManager(): ImageGenerationManager {
  if (!managerInstance) {
    managerInstance = new ImageGenerationManager();
  }
  return managerInstance;
}

/**
 * 创建新的 Manager 实例（用于测试或特殊场景）
 */
export function createImageGenerationManager(modelName?: string): ImageGenerationManager {
  return new ImageGenerationManager(modelName);
}
