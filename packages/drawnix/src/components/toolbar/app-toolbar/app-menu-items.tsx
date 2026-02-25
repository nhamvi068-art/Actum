import {
  ExportImageIcon,
  GithubIcon,
  OpenFileIcon,
  SaveFileIcon,
  TrashIcon,
  UndoIcon,
  RedoIcon,
} from '../../icons';
import { useBoard, useListRender } from '@plait-board/react-board';
import {
  BoardTransforms,
  PlaitBoard,
  PlaitElement,
  PlaitTheme,
  ThemeColorMode,
  Viewport,
} from '@plait/core';
import { loadFromJSON, saveAsJSON } from '../../../data/json';
import MenuItem from '../../menu/menu-item';
import MenuItemLink from '../../menu/menu-item-link';
import { saveAsImage, saveAsSvg } from '../../../utils/image';
import { useDrawnix } from '../../../hooks/use-drawnix';
import { useI18n } from '../../../i18n';
import Menu from '../../menu/menu';
import { useContext } from 'react';
import { MenuContentPropsContext } from '../../menu/common';
import { EVENT } from '../../../constants';
import { getShortcutKey } from '../../../utils/common';

export const SaveToFile = () => {
  const board = useBoard();
  const { t } = useI18n();
  return (
    <MenuItem
      data-testid="save-button"
      onSelect={() => {
        saveAsJSON(board);
      }}
      icon={SaveFileIcon}
      aria-label={t('menu.saveFile')}
      shortcut={getShortcutKey('CtrlOrCmd+S')}
    >{t('menu.saveFile')}</MenuItem>
  );
};
SaveToFile.displayName = 'SaveToFile';

export const OpenFile = () => {
  const board = useBoard();
  const listRender = useListRender();
  const { t } = useI18n();
  const clearAndLoad = (
    value: PlaitElement[],
    viewport?: Viewport,
    theme?: PlaitTheme
  ) => {
    board.children = value;
    board.viewport = viewport || { zoom: 1 };
    if (theme) {
      board.theme = theme;
    }
    listRender.update(board.children, {
      board: board,
      parent: board,
      parentG: PlaitBoard.getElementHost(board),
    });
    BoardTransforms.fitViewport(board);
  };
  return (
    <MenuItem
      data-testid="open-button"
      onSelect={() => {
        loadFromJSON(board).then((data) => {
          clearAndLoad(data.elements, data.viewport, data.theme);
        });
      }}
      icon={OpenFileIcon}
      aria-label={t('menu.open')}
    >{t('menu.open')}</MenuItem>
  );
};
OpenFile.displayName = 'OpenFile';

export const SaveAsImage = () => {
  const board = useBoard();
  const menuContentProps = useContext(MenuContentPropsContext);
  const { t } = useI18n();
  return (
    <MenuItem
      icon={ExportImageIcon}
      data-testid="image-export-button"
      onSelect={() => {
        saveAsImage(board, true);
      }}
      submenu={
        <Menu onSelect={() => {
          const itemSelectEvent = new CustomEvent(EVENT.MENU_ITEM_SELECT, {
            bubbles: true,
            cancelable: true,
          });
          menuContentProps.onSelect?.(itemSelectEvent);
        }}>
          <MenuItem
            onSelect={() => {
              saveAsSvg(board);
            }}
            aria-label={t('menu.exportImage.svg')}
          >
            {t('menu.exportImage.svg')}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              saveAsImage(board, true);
            }}
            aria-label={t('menu.exportImage.png')}
          >
            {t('menu.exportImage.png')}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              saveAsImage(board, false);
            }}
            aria-label={t('menu.exportImage.jpg')}
          >
            {t('menu.exportImage.jpg')}
          </MenuItem>
        </Menu>
      }
      shortcut={getShortcutKey('CtrlOrCmd+Shift+E')}
      aria-label={t('menu.exportImage')}
    >
      {t('menu.exportImage')}
    </MenuItem>
  );
};
SaveAsImage.displayName = 'SaveAsImage';

export const CleanBoard = () => {
  const { appState, setAppState } = useDrawnix();
  const { t } = useI18n();
  return (
    <MenuItem
      icon={TrashIcon}
      data-testid="reset-button"
      onSelect={() => {
        setAppState({
          ...appState,
          openCleanConfirm: true,
        });
      }}
      shortcut={getShortcutKey('CtrlOrCmd+Backspace')}
      aria-label={t('menu.cleanBoard')}
    >
      {t('menu.cleanBoard')}
    </MenuItem>
  );
};
CleanBoard.displayName = 'CleanBoard';

export const Socials = () => {
  return (
    <MenuItemLink
      icon={GithubIcon}
      href="https://github.com/plait-board/drawnix"
      aria-label="GitHub"
    >
      GitHub
    </MenuItemLink>
  );
};
Socials.displayName = 'Socials';

export const UndoMenuItem = () => {
  const board = useBoard();
  const { t } = useI18n();
  const isUndoDisabled = board.history.undos.length <= 0;
  return (
    <MenuItem
      icon={UndoIcon}
      onSelect={() => {
        board.undo();
      }}
      disabled={isUndoDisabled}
      shortcut={getShortcutKey('CtrlOrCmd+Z')}
    >
      {t('general.undo')}
    </MenuItem>
  );
};
UndoMenuItem.displayName = 'UndoMenuItem';

export const RedoMenuItem = () => {
  const board = useBoard();
  const { t } = useI18n();
  const isRedoDisabled = board.history.redos.length <= 0;
  return (
    <MenuItem
      icon={RedoIcon}
      onSelect={() => {
        board.redo();
      }}
      disabled={isRedoDisabled}
      shortcut={getShortcutKey('CtrlOrCmd+Shift+Z')}
    >
      {t('general.redo')}
    </MenuItem>
  );
};
RedoMenuItem.displayName = 'RedoMenuItem';

export const ThemeMenuItem = () => {
  const board = useBoard();
  const { t } = useI18n();
  const theme = board.theme;
  const themes = [
    { value: 'default', label: t('theme.default') },
    { value: 'colorful', label: t('theme.colorful') },
    { value: 'soft', label: t('theme.soft') },
    { value: 'retro', label: t('theme.retro') },
    { value: 'dark', label: t('theme.dark') },
    { value: 'starry', label: t('theme.starry') },
  ];

  return (
    <MenuItem
      onSelect={() => {}}
      submenu={
        <Menu>
          {themes.map((themeOption) => (
            <MenuItem
              key={themeOption.value}
              onSelect={() => {
                BoardTransforms.updateThemeColor(board, themeOption.value as ThemeColorMode);
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {theme.themeColorMode === themeOption.value && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
                <span>{themeOption.label}</span>
              </div>
            </MenuItem>
          ))}
        </Menu>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        {t('theme.title')}
      </div>
    </MenuItem>
  );
};
ThemeMenuItem.displayName = 'ThemeMenuItem';
