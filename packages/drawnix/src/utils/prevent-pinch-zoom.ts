/**
 * 阻止浏览器原生缩放行为
 * 防止触控板捏合操作和 Ctrl+滚轮触发浏览器缩放导致卡顿
 */

let isInitialized = false;

/**
 * 初始化缩放阻止器
 * 必须在 DOM 加载完成后调用
 */
export function initPreventPinchZoom(): void {
    if (isInitialized || typeof window === 'undefined') {
        return;
    }

    isInitialized = true;

    // 阻止 Ctrl+滚轮 和触控板捏合缩放
    const handleWheel = (e: WheelEvent): void => {
        // Ctrl + 滚轮 = 浏览器缩放
        // 触控板捏合也会触发 ctrlKey = true
        if (e.ctrlKey) {
            e.preventDefault();
        }
    };

    // 阻止双指捏合手势
    const handleGesture = (e: GestureEvent): void => {
        e.preventDefault();
    };

    // 使用捕获阶段确保先于其他监听器执行
    const options: AddEventListenerOptions = {
        passive: false,
        capture: true,
    };

    // 监听 wheel 事件
    document.addEventListener('wheel', handleWheel, options);

    // 阻止 pinch-zoom（部分浏览器支持）
    document.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length > 1) {
            // 多指触摸（可能是捏合）
            e.preventDefault();
        }
    }, { passive: false, capture: true });

    // iOS Safari 阻止双击缩放
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e: TouchEvent) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            // 双击间隔小于 300ms，阻止默认双击缩放
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false, capture: true });

    // 阻止 contextmenu 长时间按住（可能是缩放）
    document.addEventListener('contextmenu', (e: MouseEvent) => {
        // 检测是否是双指/双击
        const hasTwoFingers = (e as any).pointerType === 'touch';
        if (hasTwoFingers) {
            e.preventDefault();
        }
    });

    console.log('[PreventPinchZoom] Initialized');
}

/**
 * 移除缩放阻止器
 */
export function removePreventPinchZoom(): void {
    if (!isInitialized) {
        return;
    }

    isInitialized = false;
    // 注意：由于是匿名函数，这里无法完全移除
    // 如需完全移除，需要保存函数引用
    console.log('[PreventPinchZoom] Removed (note: listeners may still be active)');
}
