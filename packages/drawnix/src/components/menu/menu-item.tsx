import React, { useRef, useId, useEffect, useContext } from 'react';
import { useBoard } from '@plait-board/react-board';
import { PlaitBoard } from '@plait/core';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  FloatingPortal,
} from '@floating-ui/react';
import {
  getMenuItemClassName,
  useHandleMenuItemClick,
  MenuSubmenuContext,
} from './common';
import { EVENT } from '../../constants';
import MenuItemContent from './menu-item-content';

const MenuItem = ({
  icon,
  onSelect,
  children,
  shortcut,
  className,
  selected,
  submenu,
  ...rest
}: {
  icon?: React.ReactNode;
  onSelect: (event: Event) => void;
  children: React.ReactNode;
  shortcut?: string;
  selected?: boolean;
  className?: string;
  submenu?: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'>) => {
  const closeTimeoutRef = useRef<number | undefined>(undefined);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const board = useBoard();
  const container = PlaitBoard.getBoardContainer(board);
  const handleClick = useHandleMenuItemClick(rest.onClick, onSelect);
  const submenuId = useId();
  const submenuContext = useContext(MenuSubmenuContext);

  // Register this submenu with the parent menu
  useEffect(() => {
    if (submenu && submenuContext) {
      submenuContext.registerSubmenu(submenuId);
      return () => submenuContext.unregisterSubmenu(submenuId);
    }
  }, [submenu, submenuContext, submenuId]);

  // Derive isOpen from shared state
  const isOpen = submenuContext?.openSubmenuId === submenuId;

  const float = useFloating({
    placement: 'right-start',
    open: isOpen,
    onOpenChange: (next) => {
      if (!next) {
        closeTimeoutRef.current = undefined;
        if (submenuContext?.openSubmenuId === submenuId) {
          submenuContext.setOpenSubmenuId(null);
        }
      }
    },
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ crossAxis: true, fallbackAxisSideDirection: 'end', padding: 5 }), shift({ padding: 5 })],
  });

  const { refs, floatingStyles } = float;

  const menuItemContent = (
    <MenuItemContent icon={icon} shortcut={shortcut}>
      {children}
    </MenuItemContent>
  );

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current !== undefined) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = undefined;
    }
    if (submenuContext) {
      submenuContext.setOpenSubmenuId(submenuId);
    }
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = window.setTimeout(() => {
      if (submenuContext?.openSubmenuId === submenuId) {
        submenuContext.setOpenSubmenuId(null);
      }
    }, 80);
  };

  const handleMenuItemClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (submenu) {
      if (submenuContext?.openSubmenuId === submenuId) {
        submenuContext.setOpenSubmenuId(null);
      } else {
        submenuContext!.setOpenSubmenuId(submenuId);
      }
      rest.onClick?.(event as any);
    } else {
      handleClick(event as any);
    }
  };

  if (submenu) {
    return (
      <>
        <button
          ref={(node) => {
            buttonRef.current = node;
            refs.setReference(node);
          }}
          {...rest}
          type="button"
          className={getMenuItemClassName(className, selected || isOpen)}
          title={rest.title ?? rest['aria-label']}
          onClick={handleMenuItemClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {menuItemContent}
        </button>
        {isOpen && (
          <FloatingPortal root={container}>
            <div
              ref={refs.setFloating}
              style={{ ...floatingStyles, zIndex: 10000 }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {submenu}
            </div>
          </FloatingPortal>
        )}
      </>
    );
  }

  return (
    <button
      {...rest}
      type="button"
      onClick={(e) => handleClick(e as any)}
      className={getMenuItemClassName(className, selected)}
      title={rest.title ?? rest['aria-label']}
    >
      {menuItemContent}
    </button>
  );
};
MenuItem.displayName = 'MenuItem';

export const DropDownMenuItemBadge = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <div
      style={{
        display: 'inline-flex',
        marginLeft: 'auto',
        padding: '2px 4px',
        background: 'var(--color-promo)',
        color: 'var(--color-surface-lowest)',
        borderRadius: 6,
        fontSize: 9,
        fontFamily: 'Cascadia, monospace',
      }}
    >
      {children}
    </div>
  );
};
DropDownMenuItemBadge.displayName = 'MenuItemBadge';

MenuItem.Badge = DropDownMenuItemBadge;

export default MenuItem;
