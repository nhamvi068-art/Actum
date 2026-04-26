import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import 'winbox/src/css/winbox.css';

let WinBoxConstructor: any = null;

const DRAWNIX_WB_STYLE_ID = 'drawnix-wb-override-styles';

const injectOverrideStyles = () => {
  if (document.getElementById(DRAWNIX_WB_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DRAWNIX_WB_STYLE_ID;
  style.textContent = `
    /* WinBox root — white island card */
    .drawnix-wb {
      background: var(--island-bg-color, #ffffff) !important;
      border: 1px solid var(--island-border-color, #e5e7eb) !important;
      border-radius: 10px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.10) !important;
    }
    /* Body — flush with root, no gaps */
    .drawnix-wb .wb-body {
      background: var(--island-bg-color, #ffffff) !important;
      background-image: none !important;
      margin: 0 !important;
      padding: 0 !important;
      top: 42px !important;
      overflow: hidden !important;
    }
    /* Header */
    .drawnix-wb .wb-header {
      background: #f5f5f5 !important;
      border-bottom: 1px solid #e5e7eb !important;
      color: #1a1a1a !important;
      height: 42px !important;
      line-height: 42px !important;
      padding: 0 8px 0 14px !important;
    }
    /* Drag area + title */
    .drawnix-wb .wb-drag {
      height: 100% !important;
      padding: 0 !important;
      cursor: move !important;
    }
    .drawnix-wb .wb-title {
      font-family: system-ui, -apple-system, sans-serif !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      color: #1a1a1a !important;
      letter-spacing: 0 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      line-height: 42px !important;
      height: 42px !important;
      padding: 0 10px !important;
    }
    /* Control bar */
    .drawnix-wb .wb-control {
      height: 28px !important;
      margin: auto 0 !important;
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      padding: 0 !important;
      background: transparent !important;
      float: right !important;
    }
    .drawnix-wb .wb-control * {
      width: 28px !important;
      height: 28px !important;
      max-width: 28px !important;
      background: transparent !important;
      background-image: none !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      opacity: 0.5 !important;
      transition: opacity 0.15s, background 0.15s !important;
      position: relative !important;
      flex-shrink: 0 !important;
    }
    /* Replace icon bg-image with inline SVG */
    .drawnix-wb .wb-min::before,
    .drawnix-wb .wb-max::before,
    .drawnix-wb .wb-close::before {
      content: '' !important;
      position: absolute !important;
      inset: 0 !important;
      margin: auto !important;
      background-image: none !important;
      background-size: contain !important;
      background-repeat: no-repeat !important;
      background-position: center !important;
    }
    /* Minimize — horizontal line */
    .drawnix-wb .wb-min::before {
      width: 12px !important;
      height: 2px !important;
      background: #555 !important;
      border-radius: 1px !important;
    }
    /* Maximize — square outline */
    .drawnix-wb .wb-max::before {
      width: 10px !important;
      height: 10px !important;
      border: 2px solid #555 !important;
      border-radius: 2px !important;
      background: transparent !important;
    }
    /* Close — X with two lines */
    .drawnix-wb .wb-close::before {
      width: 12px !important;
      height: 12px !important;
      background:
        linear-gradient(to bottom left, transparent 45%, #555 45%, #555 55%, transparent 55%),
        linear-gradient(to bottom right, transparent 45%, #555 45%, #555 55%, transparent 55%) !important;
      border-radius: 0 !important;
    }
    .drawnix-wb .wb-close:hover::before {
      background:
        linear-gradient(to bottom left, transparent 45%, #fff 45%, #fff 55%, transparent 55%),
        linear-gradient(to bottom right, transparent 45%, #fff 45%, #fff 55%, transparent 55%) !important;
    }
    /* Hover states */
    .drawnix-wb .wb-min:hover,
    .drawnix-wb .wb-max:hover { opacity: 1 !important; background: #e0e0e0 !important; }
    .drawnix-wb .wb-close:hover { opacity: 1 !important; background: #ff5f57 !important; }
    .drawnix-wb .wb-close:hover::before { background:
      linear-gradient(to bottom left, transparent 45%, #fff 45%, #fff 55%, transparent 55%),
      linear-gradient(to bottom right, transparent 45%, #fff 45%, #fff 55%, transparent 55%) !important;
    }
    /* Resize handles */
    .drawnix-wb .wb-n, .drawnix-wb .wb-s,
    .drawnix-wb .wb-w, .drawnix-wb .wb-e,
    .drawnix-wb .wb-nw, .drawnix-wb .wb-ne,
    .drawnix-wb .wb-se, .drawnix-wb .wb-sw {
      background: transparent !important;
    }
  `;
  document.head.appendChild(style);
};

export const WinBoxWindow = ({
  title,
  children,
  onClose,
  width = 800,
  height = 600,
  boardBackground,
  id,
  className,
  x,
  y,
  minWidth,
  minHeight,
}: {
  title?: string;
  children?: React.ReactNode;
  onClose?: () => void;
  width?: number;
  height?: number;
  boardBackground?: string;
  id?: string;
  className?: string;
  x?: string | number;
  y?: string | number;
  minWidth?: number;
  minHeight?: number;
} = {}) => {
  const [isMounted, setIsMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const winboxRef = useRef<any>(null);

  useEffect(() => {
    let isCancelled = false;

    injectOverrideStyles();

    const mountEl = document.createElement('div');
    mountEl.style.width = '100%';
    mountEl.style.height = '100%';
    containerRef.current = mountEl;

    import('winbox/src/js/winbox.js').then((module) => {
      if (isCancelled) return;

      try {
        WinBoxConstructor = module.default;

        const winbox = new WinBoxConstructor({
          title,
          width,
          height,
          x: x ?? 'center',
          y: y ?? 'center',
          id: id,
          class: ['drawnix-wb', ...(className ? [className] : [])],
          mount: containerRef.current,
          minheight: minHeight ?? 400,
          minwidth: minWidth ?? 300,
          onclose: () => {
            if (onClose) onClose();
            return false;
          },
          onmousedown: (e: any) => e.stopPropagation(),
          ontouchstart: (e: any) => e.stopPropagation(),
        });

        winboxRef.current = winbox;
      } catch (err) {
        console.error('[WinBoxWindow] Failed to initialize WinBox:', err);
      }

      if (!isCancelled) {
        setIsMounted(true);
      }
    });

    return () => {
      isCancelled = true;
      const wb = winboxRef.current;
      if (wb) {
        try {
          if (wb.body?.parentElement) {
            wb.close();
          }
        } catch (_) {
          // ignore
        }
        winboxRef.current = null;
      }
    };
  }, [title, width, height, boardBackground]);

  if (!isMounted) return null;

  return createPortal(
    <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
      {children}
    </div>,
    containerRef.current
  );
};
