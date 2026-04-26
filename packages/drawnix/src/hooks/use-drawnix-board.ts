import { createContext, useContext } from 'react';
import type { DrawnixBoard } from './use-drawnix';

export const DrawnixBoardContext = createContext<DrawnixBoard | null>(null);

export const useDrawnixBoard = (): DrawnixBoard | null => {
  return useContext(DrawnixBoardContext);
};
