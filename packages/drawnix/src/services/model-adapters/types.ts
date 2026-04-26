/**
 * Model Adapter 模式 - 核心类型定义
 *
 * 废弃"万能 JSON 适配所有模型"的旧架构，
 * 改为每个大模型使用专门的 Adapter 来组装符合其 API 规范的 Payload。
 */

/**
 * 统一的图片生成请求参数
 * UI 层传入此格式，由具体 Adapter 转换为各模型所需的 Payload
 */
export interface GenerateImageRequest {
  /** 生成提示词 */
  prompt: string;
  /** 参考图（Base64 data URL），可选 */
  referenceImage?: string;
  /** 宽高比，如 '1:1', '16:9' */
  aspectRatio?: string;
  /** 图片尺寸，如 '1K', '2K', '4K' 或 '1024x1024' */
  size?: string;
  /** 模型名称，如 'nano-banana', 'nano-banana-2' */
  model?: string;
  /** 响应格式，默认 'url' */
  response_format?: 'url' | 'b64_json';
}

/**
 * 任务状态查询结果
 */
export interface TaskStatusResult {
  status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
  progress: number;
  imageUrl?: string;
  b64Json?: string;
  error?: string;
}

/**
 * 异步任务提交响应
 */
export interface AsyncTaskResponse {
  code: string;
  message: string;
  data: string; // task_id
}

/**
 * 图片模型适配器接口
 * 每个具体的大模型都实现此接口，在 generate() 中组装符合其 API 规范的请求体
 */
export interface ImageModelAdapter {
  /** 适配器对应的模型名称 */
  readonly modelName: string;
  /**
   * 发起图片生成请求
   * @param request 统一的请求参数
   * @returns 远端 taskId
   */
  generate(request: GenerateImageRequest): Promise<string>;
  /**
   * 查询任务状态
   * @param taskId 远端任务 ID
   */
  checkStatus(taskId: string): Promise<TaskStatusResult>;
}
