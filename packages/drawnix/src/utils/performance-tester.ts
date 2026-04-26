import { PlaitBoard, isSetViewportOperation, PlaitOperation, BOARD_TO_ON_CHANGE } from '@plait/core';

let fpsFrameCount = 0;
let lastFpsTime = 0;
let currentFps = 0;
let animationFrameId: number | null = null;
let isUserInteracting = false;
let lastReportTime = 0;
let onChangeUnsubscribe: (() => void) | null = null;

function throttle<T extends (...args: any[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          func.apply(this, lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

function updateFps() {
  const now = performance.now();
  fpsFrameCount++;

  if (now - lastFpsTime >= 1000) {
    currentFps = fpsFrameCount;
    fpsFrameCount = 0;
    lastFpsTime = now;
  }

  animationFrameId = requestAnimationFrame(updateFps);
}

function getDomStats(board: PlaitBoard): { imageCount: number; rectCount: number; totalElements: number } {
  const host = board.children && board.children.length > 0 ? PlaitBoard.getHost(board) : null;
  if (!host) {
    return { imageCount: 0, rectCount: 0, totalElements: 0 };
  }

  const images = host.querySelectorAll('img');
  const rects = host.querySelectorAll('rect.image-placeholder');

  return {
    imageCount: images.length,
    rectCount: rects.length,
    totalElements: board.children.length
  };
}

function getMemoryUsage(): number | null {
  if (performance.memory) {
    return performance.memory.usedJSHeapSize / (1024 * 1024);
  }
  return null;
}

function detectActionType(operations: PlaitOperation[]): string {
  if (!operations || operations.length === 0) return 'Idle';

  const hasViewportChange = operations.some(op => isSetViewportOperation(op));

  if (hasViewportChange) {
    const viewportOp = operations.find(op => isSetViewportOperation(op));
    const newZoom = viewportOp?.newProperties?.zoom;
    const oldZoom = viewportOp?.properties?.zoom;

    if (newZoom !== undefined && oldZoom !== undefined && newZoom !== oldZoom) {
      return 'Zooming';
    }
    return 'Panning';
  }

  return 'Other';
}

const logPerformanceReport = throttle((board: PlaitBoard, action: string) => {
  const domStats = getDomStats(board);
  const memory = getMemoryUsage();
  const memoryStr = memory !== null ? `${memory.toFixed(1)} MB` : 'N/A';

  console.log(`[Performance Report]
- Action: ${action}
- FPS: ${currentFps}
- Visible DOM Images: ${domStats.imageCount} (Total Elements: ${domStats.totalElements})
- Memory (JS Heap): ${memoryStr}`);
}, 2000);

export function startPerformanceLogging(board: PlaitBoard): () => void {
  if (!board) {
    console.error('Invalid board instance');
    return () => {};
  }

  fpsFrameCount = 0;
  lastFpsTime = performance.now();
  currentFps = 0;
  isUserInteracting = false;
  lastReportTime = 0;

  animationFrameId = requestAnimationFrame(updateFps);

  let previousOperations: PlaitOperation[] = [];
  let lastBoardChildrenCount = 0;

  const handleBoardChange = () => {
    const operations = board.operations || [];
    const action = detectActionType(operations);

    if (action !== 'Idle' && action !== 'Other') {
      isUserInteracting = true;
      logPerformanceReport(board, action);
    }

    previousOperations = operations;
  };

  const originalHandler = BOARD_TO_ON_CHANGE.get(board);

  BOARD_TO_ON_CHANGE.set(board, () => {
    handleBoardChange();
    if (originalHandler) {
      originalHandler();
    }
  });

  const checkForChanges = () => {
    const domStats = getDomStats(board);
    const currentChildrenCount = board.children?.length || 0;

    let action = 'Idle';

    if (domStats.imageCount > 0 || currentChildrenCount !== lastBoardChildrenCount) {
      if (currentChildrenCount > lastBoardChildrenCount) {
        action = 'Image Added';
      } else if (currentChildrenCount < lastBoardChildrenCount) {
        action = 'Element Removed';
      } else {
        action = 'Content Changed';
      }
    }

    if (action !== 'Idle' && Date.now() - lastReportTime > 2000) {
      lastReportTime = Date.now();
      logPerformanceReport(board, action);
    }

    lastBoardChildrenCount = currentChildrenCount;
  };

  setInterval(checkForChanges, 1000);

  onChangeUnsubscribe = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    BOARD_TO_ON_CHANGE.delete(board);
  };

  console.log('[Performance Logger] Started monitoring. Drag, zoom, or add images to see reports.');

  return onChangeUnsubscribe;
}