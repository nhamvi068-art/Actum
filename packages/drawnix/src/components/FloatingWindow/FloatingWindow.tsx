import React, { useState, useRef, CSSProperties } from 'react';

type Direction = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface FloatingWindowProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

export const FloatingWindow: React.FC<FloatingWindowProps> = ({
  title,
  isOpen,
  onClose,
  children,
  defaultPosition = { x: 100, y: 100 },
  defaultWidth = 400,
  defaultHeight = 500,
  minWidth = 280,
  minHeight = 200,
}) => {
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [activeResizeDir, setActiveResizeDir] = useState<Direction | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    initWidth: number;
    initHeight: number;
    initX: number;
    initY: number;
  } | null>(null);
  const titleBarRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-resize-handle]')) return;
    if (target.closest('button')) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: position.x,
      initY: position.y,
    };
    setIsDragging(true);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (isResizing && resizeRef.current && activeResizeDir) {
      const dx = e.clientX - resizeRef.current.startX;
      const dy = e.clientY - resizeRef.current.startY;
      let newWidth = resizeRef.current.initWidth;
      let newHeight = resizeRef.current.initHeight;
      let newX = resizeRef.current.initX;
      let newY = resizeRef.current.initY;

      if (activeResizeDir.includes('e')) newWidth = Math.max(minWidth, resizeRef.current.initWidth + dx);
      if (activeResizeDir.includes('w')) {
        newWidth = Math.max(minWidth, resizeRef.current.initWidth - dx);
        newX = resizeRef.current.initX + resizeRef.current.initWidth - newWidth;
      }
      if (activeResizeDir.includes('s')) newHeight = Math.max(minHeight, resizeRef.current.initHeight + dy);
      if (activeResizeDir.includes('n')) {
        newHeight = Math.max(minHeight, resizeRef.current.initHeight - dy);
        newY = resizeRef.current.initY + resizeRef.current.initHeight - newHeight;
      }

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
      return;
    }

    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPosition({
      x: dragRef.current.initX + dx,
      y: dragRef.current.initY + dy,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setActiveResizeDir(null);
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    dragRef.current = null;
    resizeRef.current = null;
  };

  const handleResizeStart = (e: React.PointerEvent, dir: Direction) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initWidth: size.width,
      initHeight: size.height,
      initX: position.x,
      initY: position.y,
    };
    setIsResizing(true);
    setActiveResizeDir(dir);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  const resizeHandleStyle = (dir: Direction): CSSProperties => {
    const thickness = 6;
    const base: CSSProperties = {
      position: 'absolute',
      zIndex: 10,
    };
    const cursorMap: Record<Direction, string> = {
      n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize',
      ne: 'ne-resize', nw: 'nw-resize', se: 'se-resize', sw: 'sw-resize',
    };
    const styleMap: Record<Direction, CSSProperties> = {
      n:  { top: -thickness / 2, left: thickness, right: thickness, height: thickness, cursor: cursorMap.n },
      s:  { bottom: -thickness / 2, left: thickness, right: thickness, height: thickness, cursor: cursorMap.s },
      e:  { right: -thickness / 2, top: thickness, bottom: thickness, width: thickness, cursor: cursorMap.e },
      w:  { left: -thickness / 2, top: thickness, bottom: thickness, width: thickness, cursor: cursorMap.w },
      ne: { top: -thickness / 2, right: -thickness / 2, width: thickness * 2.5, height: thickness * 2.5, cursor: cursorMap.ne },
      nw: { top: -thickness / 2, left: -thickness / 2, width: thickness * 2.5, height: thickness * 2.5, cursor: cursorMap.nw },
      se: { bottom: -thickness / 2, right: -thickness / 2, width: thickness * 2.5, height: thickness * 2.5, cursor: cursorMap.se },
      sw: { bottom: -thickness / 2, left: -thickness / 2, width: thickness * 2.5, height: thickness * 2.5, cursor: cursorMap.sw },
    };
    return { ...base, ...styleMap[dir] };
  };

  return (
    <div
      className="drawnix-floating-window pointer-events-auto"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        backgroundColor: 'var(--island-bg-color)',
        borderRadius: 'var(--border-radius-md)',
        boxShadow: 'var(--shadow-island)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--island-border-color)',
        overflow: 'visible',
        backdropFilter: 'blur(8px)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 边缘拖拽调整大小的热区 */}
      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as Direction[]).map(dir => (
        <div
          key={dir}
          data-resize-handle={dir}
          style={resizeHandleStyle(dir)}
          onPointerDown={(e) => handleResizeStart(e, dir)}
        />
      ))}
      {/* 标题栏（拖拽区） */}
      <div
        ref={titleBarRef}
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--island-border-color)',
          backgroundColor: 'var(--color-surface-mid)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
        onPointerDown={handlePointerDown}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: '14px',
            color: 'var(--color-on-surface)',
            letterSpacing: '0.01em',
          }}
        >
          {title}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: 'var(--color-on-surface)',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.6,
            transition: 'opacity 0.15s',
            borderRadius: 'var(--border-radius-sm)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {/* 内容区 */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
};
