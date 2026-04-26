import React from 'react';
import { useDrawnix, SidebarPanelType } from '../../hooks/use-drawnix';
import { MediaLibraryPanel } from './MediaLibraryPanel';
import { CloseIcon } from '../icons';

export const SidebarDrawer: React.FC = () => {
  const { appState, setAppState } = useDrawnix();
  const activePanel = appState.activeSidebarPanel;

  if (!activePanel) return null;

  return (
    <div
      className="sidebar-drawer pointer-events-auto"
      onPointerDownCapture={(e) => e.stopPropagation()}
      onClickCapture={(e) => e.stopPropagation()}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      <div className="sidebar-drawer__header">
        <h3 className="sidebar-drawer__header-title">
          {activePanel === SidebarPanelType.MEDIA_LIBRARY && '素材库'}
        </h3>
        <button
          className="sidebar-drawer__header-close"
          onClick={() => setAppState({ ...appState, activeSidebarPanel: null })}
          aria-label="关闭面板"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="sidebar-drawer__body">
        {activePanel === SidebarPanelType.MEDIA_LIBRARY && <MediaLibraryPanel />}
      </div>
    </div>
  );
};
