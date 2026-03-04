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
import { useState, useRef, useEffect } from 'react';
import { CleanBoard, OpenFile, SaveAsImage, SaveToFile, Socials, UndoMenuItem, RedoMenuItem, ThemeMenuItem } from './app-menu-items';
import { LanguageSwitcherMenu } from './language-switcher-menu';
import Menu from '../../menu/menu';
import MenuItem from '../../menu/menu-item';
import MenuSeparator from '../../menu/menu-separator';
import { useI18n } from '../../../i18n';

// 简化的任务列表按钮组件
const TaskListButton: React.FC<{
  tasks: any[];
  onTaskClick?: (task: any) => void;
}> = ({ tasks, onTaskClick }) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [_, setPopupAnchor] = useState<HTMLElement | null>(null);

  const activeCount = tasks.filter(t => t.status === 'pending' || t.status === 'generating').length;

  return (
    <div className="task-list-button-container">
      <button
        ref={buttonRef}
        className={`task-list-button ${isPopupOpen ? 'task-list-button--active' : ''}`}
        onClick={(e) => {
          setIsPopupOpen(!isPopupOpen);
          setPopupAnchor(e.currentTarget);
        }}
        title="任务列表"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        {activeCount > 0 && (
          <span className="task-list-button__badge">{activeCount}</span>
        )}
      </button>

      {isPopupOpen && (
        <div ref={popupRef} className="task-list-popup">
          <div className="task-list-popup__header">
            <span>任务列表</span>
            {activeCount > 0 && <span className="task-list-popup__badge">{activeCount}</span>}
          </div>
          <div className="task-list-popup__content">
            {tasks.length === 0 ? (
              <div className="task-list-popup__empty">暂无任务</div>
            ) : (
              <div className="task-list-popup__items">
                {tasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className={`task-item task-item--${task.status}`}
                    onClick={() => onTaskClick && onTaskClick(task)}
                  >
                    <div className="task-item__info">
                      <div className="task-item__prompt">
                        {task.prompt?.length > 20 ? `${task.prompt.substring(0, 20)}...` : task.prompt}
                      </div>
                      <div className="task-item__meta">
                        <span>{task.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface AppToolbarProps {
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  onBack?: () => void;
  showMenuButton?: boolean;
  // Task list props
  tasks?: any[];
  onTaskClick?: (task: any) => void;
  onTaskRedo?: (task: any) => void;
}

export const AppToolbar = ({ headerLeft, headerRight, onBack, showMenuButton = true, tasks = [], onTaskClick, onTaskRedo }: AppToolbarProps) => {
  const board = useBoard();
  const { t } = useI18n();
  const container = PlaitBoard.getBoardContainer(board);
  const selectedElements = getSelectedElements(board);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarWidth, setToolbarWidth] = useState(0);

  useEffect(() => {
    if (!toolbarRef.current) return;

    const updateWidth = () => {
      if (toolbarRef.current) {
        setToolbarWidth(toolbarRef.current.offsetWidth);
      }
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });

    resizeObserver.observe(toolbarRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={toolbarRef} className="app-toolbar-wrapper">
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
        {showMenuButton && (
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
        )}
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
    {/* Task list popup - placed outside Island for full-width popup */}
    {tasks && tasks.length > 0 && toolbarWidth > 0 && (
      <div className="task-list-popup-container" style={{ width: toolbarWidth }}>
        <div className="task-list-popup">
          <div className="task-list-popup__header">
            <span>任务列表</span>
            <span className="task-list-popup__badge">
              {tasks.filter(t => t.status === 'pending' || t.status === 'generating').length}
            </span>
          </div>
          <div className="task-list-popup__content">
            {tasks.length === 0 ? (
              <div className="task-list-popup__empty">暂无任务</div>
            ) : (
              <div className="task-list-popup__items">
                {tasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className={`task-item task-item--${task.status}`}
                    onClick={() => onTaskClick && onTaskClick(task)}
                  >
                    <div className="task-item__info">
                      <div className="task-item__prompt">
                        {task.prompt?.length > 20 ? `${task.prompt.substring(0, 20)}...` : task.prompt}
                      </div>
                      <div className="task-item__meta">
                        <span>{task.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
  );
};
