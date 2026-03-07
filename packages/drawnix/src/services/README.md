# Drawnix Service Worker 系统

本目录包含 Drawnix 画布编辑器的 Service Worker 后台任务系统实现。

## 功能概述

- **IndexedDB 持久化存储**: 使用 Dexie.js 管理图片、任务等数据
- **Service Worker 后台任务**: 支持页面关闭后继续执行 AI 生成任务
- **实时状态同步**: 使用 liveQuery 监听任务状态变化
- **自动插入画布**: 任务完成后自动将生成的图片插入画布

## 目录结构

```
src/
├── services/
│   ├── db/
│   │   ├── app-database.ts         # IndexedDB 数据库定义
│   │   ├── asset-storage-service.ts  # 资产存储服务
│   │   └── task-storage-service.ts   # 任务存储服务
│   ├── unified-cache-service.ts   # URL 转 Blob 缓存服务
│   ├── sw-register.ts             # Service Worker 注册
│   ├── initializer.ts             # 服务初始化入口
│   └── index.ts                   # 导出入口
├── hooks/
│   ├── useWorkflowStatusSync.ts   # 任务状态同步 Hook
│   └── useAutoInsertToCanvas.ts   # 自动插入画布 Hook
└── ai-integration.tsx             # AI 集成示例组件
```

## 快速开始

### 1. 初始化服务

```tsx
import { drawnixServices } from '@drawnix/drawnix';

function App() {
  useEffect(() => {
    drawnixServices.init();
    return () => drawnixServices.cleanup();
  }, []);
  
  return <YourDrawnixComponent />;
}
```

### 2. 监听任务状态

```tsx
import { useWorkflowStatusSync } from '@drawnix/drawnix';

function TaskList() {
  const { tasks, lastCompletedTask } = useWorkflowStatusSync();
  
  return (
    <ul>
      {tasks.map(task => (
        <li key={task.id}>
          {task.prompt} - {task.status}
        </li>
      ))}
    </ul>
  );
}
```

### 3. 自动插入生成结果

```tsx
import { useAutoInsertToCanvas } from '@drawnix/drawnix';

function ImageGenerator() {
  const board = useBoard();
  const { insertImageToCanvas } = useAutoInsertToCanvas(board);
  
  const handleGenerate = async () => {
    // 生成图片后自动插入画布
    await insertImageToCanvas(imageUrl, assetId, { width: 512, height: 512 });
  };
}
```

## 数据库 Schema

| 表名 | 说明 |
|------|------|
| `workspaces` | 画布/工作区数据 |
| `assets` | 图片、视频等二进制资产 |
| `tasks` | AI 生成任务 |
| `chatSessions` | 聊天会话 |

## Service Worker

Service Worker 文件位于 `public/sw.js`，需要部署到生产环境才能生效。

功能：
- 后台任务轮询
- 图片资源缓存
- 消息推送

## 注意事项

1. Service Worker 需要 HTTPS 或 localhost 环境
2. 首次使用需用户授权通知权限
3. 大量图片存储建议定期清理

## 相关类型

```typescript
// 任务状态
type TaskStatus = 'pending' | 'submitting' | 'generating' | 'completed' | 'failed';

// 任务类型
type TaskType = 'image_generation' | 'video_generation' | 'text_generation';
```
