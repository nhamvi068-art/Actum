/**
 * A React context for sharing the board object, in a way that re-renders the
 * context whenever changes occur.
 */
import { PlaitBoard, PlaitPointerType } from '@plait/core';
import { createContext, useContext } from 'react';
import { MindPointerType } from '@plait/mind';
import { DrawPointerType } from '@plait/draw';
import { FreehandShape } from '../plugins/freehand/type';
import { LineStyle, BrushShape } from '../plugins/freehand/freehand-settings';
import { Editor } from 'slate';
import { LinkElement } from '@plait/common';

export enum SidebarPanelType {
  MEDIA_LIBRARY = 'media_library',
}

export enum DialogType {
  mermaidToDrawnix = 'mermaidToDrawnix',
  markdownToDrawnix = 'markdownToDrawnix',
}

export type DrawnixPointerTypeValue =
  | PlaitPointerType
  | MindPointerType
  | DrawPointerType
  | FreehandShape;

export interface DrawnixBoard extends PlaitBoard {
  appState: DrawnixState;
}

export type LinkState = {
  targetDom: HTMLElement;
  editor: Editor;
  targetElement: LinkElement;
  isEditing: boolean;
  isHovering: boolean;
  isHoveringOrigin: boolean;
};

export interface PencilSettings {
  color: string;
  strokeWidth: number;
  opacity: number;
  lineStyle: LineStyle;
  shape: BrushShape;
}

export type DrawnixState = {
  pointer: DrawnixPointerTypeValue;
  isMobile: boolean;
  isPencilMode: boolean;
  openDialogType: DialogType | null;
  openCleanConfirm: boolean;
  linkState?: LinkState | null;
  pencilSettings: PencilSettings;
};

export const DrawnixContext = createContext<{
  appState: DrawnixState;
  setAppState: (appState: DrawnixState) => void;
  setPencilSettings: (settings: PencilSettings) => void;
  isPencilTool: () => boolean;
  isEraserTool: () => boolean;
} | null>(null);

export const useDrawnix = (): {
  appState: DrawnixState;
  setAppState: (appState: DrawnixState) => void;
  setPencilSettings: (settings: PencilSettings) => void;
  isPencilTool: () => boolean;
  isEraserTool: () => boolean;
} => {
  const context = useContext(DrawnixContext);

  if (!context) {
    throw new Error(
      `The \`useDrawnix\` hook must be used inside the <Drawnix> component's context.`
    );
  }

  return context;
};

export const useSetPointer = () => {
  const { appState, setAppState } = useDrawnix();
  return (pointer: DrawnixPointerTypeValue) => {
    setAppState({ ...appState, pointer });
  };
};
