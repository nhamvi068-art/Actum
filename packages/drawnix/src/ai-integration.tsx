import React, { useEffect, useState } from 'react';
import { useBoard } from '@plait-board/react-board';
import { drawnixServices, unifiedCacheService } from './services';
import { useWorkflowStatusSync } from './hooks/useWorkflowStatusSync';
import { useAutoInsertToCanvas } from './hooks/useAutoInsertToCanvas';

/**
 * Drawnix AI 集成组件
 * 用于展示如何集成 AI 图片生成功能
 * 
 * 使用示例：
 * 
 * ```tsx
 * import { DrawnixAIProvider } from '@drawnix/drawnix';
 * 
 * function App() {
 *   return (
 *     <DrawnixAIProvider>
 *       <YourDrawnixComponent />
 *     </DrawnixAIProvider>
 *   );
 * }
 * ```
 */
export const DrawnixAIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 初始化服务
    drawnixServices.init()
      .then(() => setIsReady(true))
      .catch(err => console.error('Failed to init Drawnix services:', err));

    // 清理
    return () => {
      drawnixServices.cleanup();
    };
  }, []);

  if (!isReady) {
    return null; // 或返回一个加载指示器
  }

  return <>{children}</>;
};

/**
 * AI 生成面板组件
 * 用于在画布中触发 AI 图片生成
 */
export const AIGeneratePanel: React.FC = () => {
  const board = useBoard();
  const { insertImageToCanvas } = useAutoInsertToCanvas(board);
  const { createTask, updateTask, tasks } = useWorkflowStatusSync();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);

    try {
      // 1. 创建任务
      const taskId = await createTask('image_generation', prompt);

      // 2. 更新为提交中
      await updateTask(taskId, 'submitting');

      // 3. 模拟调用 AI API（实际项目中替换为真实 API）
      const result = await mockAIImageGeneration(prompt);

      // 4. 缓存结果图片
      const assetId = await unifiedCacheService.cacheRemoteUrl(result.imageUrl);

      // 5. 更新任务为完成
      await updateTask(taskId, 'completed', {
        assetId,
        type: 'image',
        metadata: {
          width: result.width,
          height: result.height
        }
      });

      // 6. 自动插入画布
      await insertImageToCanvas(result.imageUrl, assetId, {
        width: result.width,
        height: result.height
      });

      setPrompt('');
    } catch (error) {
      console.error('Generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="ai-panel">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="输入图片描述..."
        disabled={isGenerating}
      />
      <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}>
        {isGenerating ? '生成中...' : '生成图片'}
      </button>
      
      <div className="task-list">
        {tasks.map((task: any) => (
          <div key={task.id} className={`task-item ${task.status}`}>
            <span>{task.prompt}</span>
            <span>{task.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 模拟 AI 图片生成（实际项目中替换为真实 API）
 */
async function mockAIImageGeneration(prompt: string): Promise<{
  imageUrl: string;
  width: number;
  height: number;
}> {
  // 模拟 API 延迟
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 返回一个示例图片 URL
  return {
    imageUrl: `https://picsum.photos/512/512?random=${Date.now()}`,
    width: 512,
    height: 512
  };
}
