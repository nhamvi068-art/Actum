# Drawnix 工具插件架构重构方案

## 一、架构概览

### 1.1 目标架构（遵循 Aitu/Excalidraw 规范）

```
┌─────────────────────────────────────────────────────────────────┐
│                        PlaitBoard                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Plugin Chain (高阶函数包装)                 │   │
│  │                                                          │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │   │
│  │  │withPen   │→ │withLaser │→ │withFree- │→ │withE- │  │   │
│  │  │(钢笔)    │  │(激光笔)  │  │handCreate│  │raser   │  │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────┘  │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Data Tree (JSON) + Transforms API            │   │
│  │    - Transforms.insertNode() - 落库                      │   │
│  │    - CoreTransforms.removeElements() - 删除              │   │
│  │    - Transforms.setNode() - 更新属性                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  React/SVG Re-render                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心原则

1. **插件化事件拦截**：所有工具通过高阶函数包装 `pointerDown`、`pointerMove`、`pointerUp`
2. **数据驱动视图**：工具只负责修改数据，通过 Transforms API 驱动 React/SVG 重新渲染
3. **瞬态与持久分离**：激光笔使用 RAF 直接操作 DOM 不落库；其他工具落库计入历史

---

## 二、四大工具核心链路

### 2.1 画笔工具 (Freehand)

**文件**: `packages/drawnix/src/plugins/tools/freehand-tool.ts`

```
pointerDown → 开始绘制
    ↓
pointerMove → 节流采集坐标 + 平滑算法 → 临时预览 (SVG DOM)
    ↓
pointerUp → Transforms.insertNode() → 落库 → React 重渲染
```

**关键特性**:
- `FreehandSmoother`: 均值滤波平滑算法
- `FreehandGenerator`: roughjs 生成手绘风格 SVG
- 临时预览直接操作 SVG DOM，避免 React setState 卡顿
- 支持闭合检测（首尾点距离 < 8px）

### 2.2 橡皮擦工具 (Eraser)

**文件**: `packages/drawnix/src/plugins/tools/eraser-tool.ts`

```
pointerDown → 开始擦除模式
    ↓
pointerMove → throttleRAF 节流 → 碰撞检测 → 标记元素 (opacity: 0.2)
    ↓
pointerUp → CoreTransforms.removeElements() → 删除标记元素
```

**关键特性**:
- 元素级擦除（命中整个元素即删除）
- `throttleRAF`: 防止碰撞检测过于频繁
- 视觉反馈：命中的元素先变半透明
- `LaserPointer`: 渲染擦除轨迹（复用现有实现）

### 2.3 激光笔工具 (Laser Pointer) ⭐ 重点

**文件**: `packages/drawnix/src/plugins/tools/laser-tool.ts`

```
pointerDown → 初始化 Canvas
    ↓
pointerMove → 记录 {x, y, timestamp} → RAF 渲染循环
    ↓
    ├── 过滤: now - timestamp < 500ms
    ├── 绘制: 头部实心圆 + 尾部渐变透明
    └── pointerUp → 清空 Canvas
```

**关键特性**:
- **绝对不落库**: 不调用 `Transforms.insertNode()`
- **时间戳过滤**: 通过 `requestAnimationFrame` + timestamp 实现尾迹消失
- **直接操作 DOM**: Canvas 2D API，不走 React setState
- **可选颜色/宽度/透明度配置**

### 2.4 钢笔工具 (Pen) - 贝塞尔曲线

**文件**:
- `packages/drawnix/src/plugins/tools/pen-tool.ts` - 核心逻辑
- `packages/drawnix/src/plugins/tools/pen-type.ts` - 类型定义
- `packages/drawnix/src/plugins/tools/pen-component.tsx` - 渲染组件

**状态机**:
```
Idle → pointerDown → 添加锚点 → Drawing
Drawing → pointerMove → 拖拽控制柄 (handleOut/handleIn)
Drawing → pointerUp → 结束当前节点
Drawing → dblClick → 闭合路径 → Transforms.insertNode() → Idle
```

**数据结构**:
```typescript
interface PenPoint {
  point: Point;           // 锚点
  handleIn?: Point;        // 入控制柄
  handleOut?: Point;      // 出控制柄
}
```

---

## 三、文件结构

```
packages/drawnix/src/plugins/tools/
├── index.ts                    # 统一导出
├── base-tool.ts                # 基础工具架构
├── freehand-tool.ts            # 画笔工具
├── eraser-tool.ts              # 橡皮擦工具
├── laser-tool.ts               # 激光笔工具
├── pen-tool.ts                 # 钢笔工具核心逻辑
├── pen-type.ts                 # Pen 元素类型定义
└── pen-component.tsx           # Pen 渲染组件
```

---

## 四、使用方式

### 4.1 在 drawnix.tsx 中注册插件

```typescript
import { createLaserToolPlugin } from './plugins/tools/laser-tool';
import { createPenToolPlugin } from './plugins/tools/pen-tool';

const plugins: PlaitPlugin[] = [
  // ... 其他插件
  createLaserToolPlugin(),
  createPenToolPlugin(),
];
```

### 4.2 切换工具模式

```typescript
import { DrawnixPointerType } from './hooks/use-drawnix';

// 切换到钢笔模式
setPointer(DrawnixPointerType.pen);

// 切换到激光笔模式
setPointer(DrawnixPointerType.laser);
```

### 4.3 激光笔工具配置

```typescript
createLaserToolPlugin({
  color: '211, 211, 211',      // RGB 格式
  maxWidth: 10,                  // 最大线宽
  minWidth: 0,                  // 最小线宽
  opacity: 0.6,                 // 透明度
  delay: 500,                    // 尾迹延迟 (ms)
  roundCap: true,               // 圆角线帽
})
```

### 4.4 钢笔工具配置

```typescript
createPenToolPlugin({
  handleSensitivity: 1,         // 控制柄灵敏度
  closeThreshold: 15,            // 闭合阈值 (px)
  autoClose: true,               // 是否自动闭合
})
```

---

## 五、与现有架构的集成

### 5.1 指针类型扩展

在 `use-drawnix.tsx` 中添加了新的指针类型:

```typescript
export enum DrawnixPointerType {
  pen = 'pen',
  laser = 'laser',
}

export type DrawnixPointerType =
  | PlaitPointerType
  | MindPointerType
  | DrawPointerType
  | FreehandShape
  | 'pen'      // 新增
  | 'laser';   // 新增
```

### 5.2 工具检测

各工具通过 `board.appState.pointer` 检测当前模式:

```typescript
const isLaserMode = (): boolean => {
  const appState = (board as any).appState;
  return appState?.pointer === DrawnixPointerType.laser;
};
```

### 5.3 图标扩展

在 `components/icons.tsx` 中添加了新图标:
- `LaserPointerIcon` - 激光笔图标
- `BezierPenIcon` - 钢笔图标
- `StylusIcon` - 触控笔图标

---

## 六、性能优化

### 6.1 激光笔
- 直接操作 Canvas 2D，不触发 React 重渲染
- 使用 `requestAnimationFrame` 实现平滑动画
- 时间戳过滤避免内存泄漏

### 6.2 画笔/橡皮擦
- `throttleRAF`: 节流碰撞检测
- 临时预览直接操作 SVG DOM
- 平滑算法减少采样点

### 6.3 通用
- 插件链式调用，避免重复逻辑
- 状态复用，减少内存分配
- 事件拦截按需消费，减少不必要的传递

---

## 七、后续扩展

### 7.1 可添加的功能
- 钢笔工具：拖拽已有锚点调整曲线
- 激光笔：多种颜色/形状选择
- 手势识别：长按切换工具

### 7.2 性能监控
- 监控 `pointerMove` 事件频率
- 监控 Canvas 渲染帧率
- 监控碰撞检测耗时

---

## 八、迁移指南

### 8.1 从旧版迁移
旧版 `with-freehand-create.ts` 和 `with-freehand-erase.ts` 已保留为别名:

```typescript
// 旧版导入（仍可用）
import { withFreehandCreate } from './freehand/with-freehand-create';
import { withFreehandErase } from './freehand/with-freehand-erase';

// 新版导入
import { createFreehandToolPlugin } from './tools/freehand-tool';
import { createEraserToolPlugin } from './tools/eraser-tool';
```

### 8.2 推荐做法
1. 优先使用新版 API (`createXXXToolPlugin`)
2. 旧版 API 保持向后兼容
3. 新工具只需实现核心链路即可

---

## 九、参考文档

- [Aitu Canvas Architecture](https://github.com/nickmangge/aitu)
- [Excalidraw Plugin System](https://github.com/excalidraw/excalidraw)
- [Slate.js Transforms](https://docs.slatejs.org/libraries/slate/transforms)
- [Plait Board](https://github.com/PlaitBoard/plait)
