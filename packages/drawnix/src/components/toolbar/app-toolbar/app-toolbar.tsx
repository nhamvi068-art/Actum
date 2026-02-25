import { useBoard } from '@plait-board/react-board';
import Stack from '../../stack';
import { ToolButton } from '../../tool-button';
import {
  DuplicateIcon,
  MenuIcon,
  HomeIcon,
} from '../../icons';
import classNames from 'classnames';
import {
  ATTACHED_ELEMENT_CLASS_NAME,
  getSelectedElements,
  PlaitBoard,
} from '@plait/core';
import { Island } from '../../island';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { useState } from 'react';
import { CleanBoard, OpenFile, SaveAsImage, SaveToFile, Socials, UndoMenuItem, RedoMenuItem, ThemeMenuItem } from './app-menu-items';
import { LanguageSwitcherMenu } from './language-switcher-menu';
import Menu from '../../menu/menu';
import MenuItem from '../../menu/menu-item';
import MenuSeparator from '../../menu/menu-separator';
import { useI18n } from '../../../i18n';

interface AppToolbarProps {
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  onBack?: () => void;
}

export const AppToolbar = ({ headerLeft, headerRight, onBack }: AppToolbarProps) => {
  const board = useBoard();
  const { t } = useI18n();
  const container = PlaitBoard.getBoardContainer(board);
  const selectedElements = getSelectedElements(board);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  return (
    <Island
      padding={1}
      className={classNames('app-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}
    >
      <Stack.Row gap={1}>
        {headerLeft}
        <Popover
          key={0}
          sideOffset={12}
          open={appMenuOpen}
          onOpenChange={(open) => {
            setAppMenuOpen(open);
          }}
          placement="bottom-start"
        >
          <PopoverTrigger asChild>
            <ToolButton
              type="icon"
              visible={true}
              selected={appMenuOpen}
              icon={MenuIcon}
              title={t('general.menu')}
              aria-label={t('general.menu')}
              onPointerDown={() => {
                setAppMenuOpen(!appMenuOpen);
              }}
            />
          </PopoverTrigger>
          <PopoverContent container={container}>
            <Menu
              onSelect={() => {
                setAppMenuOpen(false);
              }}
            >
              {onBack && (
                <MenuItem
                  icon={HomeIcon}
                  onSelect={() => {
                    onBack();
                    setAppMenuOpen(false);
                  }}
                >
                  首页
                </MenuItem>
              )}
              <UndoMenuItem></UndoMenuItem>
              <RedoMenuItem></RedoMenuItem>
              <MenuSeparator />
              <OpenFile></OpenFile>
              <SaveToFile></SaveToFile>
              <SaveAsImage></SaveAsImage>
              <CleanBoard></CleanBoard>
              <MenuSeparator />
              <ThemeMenuItem />
              <LanguageSwitcherMenu />
              <Socials />
            </Menu>
          </PopoverContent>
        </Popover>
        <div style={{ flex: 1 }} />
        {headerRight}
        
      </Stack.Row>
    </Island>
  );
};
