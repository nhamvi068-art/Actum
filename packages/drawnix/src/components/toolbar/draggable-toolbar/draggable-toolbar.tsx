/**
 * 可拖拽工具栏容器 (Draggable Toolbar Container)
 *
 * 提供可自由拖拽定位的工具栏面板，类似 Aitu 的交互体验
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useBoard } from '@plait-board/react-board';
import { PlaitBoard } from '@plait/core';
import classNames from 'classnames';
import './draggable-toolbar.scss';

export interface DraggableToolbarProps {
  children: React.ReactNode;
  /** 初始位置 */
  initialPosition?: { x: number; y: number };
  /** 边界限制 */
  bounds?: 'parent' | 'viewport' | 'none';
  /** 自定义类名 */
  className?: string;
  /** 是否可见 */
  visible?: boolean;
  /** 拖拽手柄元素（如果不提供，整个面板可拖拽） */
  handleSelector?: string;
  /** 位置变化回调 */
  onPositionChange?: (position: { x: number; y: number }) => void;
  /** 存储 key（用于 localStorage 持久化） */
  storageKey?: string;
}

interface Position {
  x: number;
  y: number;
}

export const DraggableToolbar: React.FC<DraggableToolbarProps> = ({
  children,
  initialPosition = { x: 100, y: 100 },
  bounds = 'parent',
  className,
  visible = true,
  handleSelector,
  onPositionChange,
  storageKey,
}) => {
  const board = useBoard();
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>(() => {
    // 尝试从 localStorage 读取保存的位置
    if (storageKey) {
      const saved = localStorage.getItem(`draggable-toolbar-${storageKey}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // ignore
        }
      }
    }
    return initialPosition;
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  /**
   * 保存位置到 localStorage
   */
  const savePosition = useCallback(
    (pos: Position) => {
      if (storageKey) {
        localStorage.setItem(`draggable-toolbar-${storageKey}`, JSON.stringify(pos));
      }
    },
    [storageKey]
  );

  /**
   * 更新位置
   */
  const updatePosition = useCallback(
    (newPos: Position) => {
      setPosition(newPos);
      savePosition(newPos);
      onPositionChange?.(newPos);
    },
    [savePosition, onPositionChange]
  );

  /**
   * 限制边界
   */
  const constrainPosition = useCallback(
    (pos: Position): Position => {
      if (!containerRef.current || bounds === 'none') return pos;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const containerRect = (board as any).host?.getBoundingClientRect();

      if (!containerRect) return pos;

      let { x, y } = pos;

      if (bounds === 'parent' || bounds === 'viewport') {
        // 限制在容器内
        x = Math.max(0, Math.min(x, containerRect.width - rect.width));
        y = Math.max(0, Math.min(y, containerRect.height - rect.height));
      }

      return { x, y };
    },
    [bounds, board]
  );

  /**
   * 开始拖拽
   */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 如果指定了 handleSelector，检查是否点击在 handle 上
      if (handleSelector) {
        const handle = containerRef.current?.querySelector(handleSelector);
        if (handle && !handle.contains(e.target as Node)) {
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y,
      };
    },
    [position, handleSelector]
  );

  /**
   * 拖拽中
   */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      const newPos = constrainPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY,
      });

      updatePosition(newPos);
    },
    [isDragging, constrainPosition, updatePosition]
  );

  /**
   * 结束拖拽
   */
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const target = e.currentTarget as HTMLElement;
      target.releasePointerCapture(e.pointerId);

      setIsDragging(false);
      dragStartRef.current = null;
    },
    []
  );

  // 添加全局事件监听，确保拖拽时不会丢失事件
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      const newPos = constrainPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY,
      });

      updatePosition(newPos);
    };

    const handleGlobalUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('pointermove', handleGlobalMove);
    document.addEventListener('pointerup', handleGlobalUp);

    return () => {
      document.removeEventListener('pointermove', handleGlobalMove);
      document.removeEventListener('pointerup', handleGlobalUp);
    };
  }, [isDragging, constrainPosition, updatePosition]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      className={classNames(
        'draggable-toolbar',
        {
          'draggable-toolbar--dragging': isDragging,
        },
        className
      )}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 1000,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {children}
    </div>
  );
};
