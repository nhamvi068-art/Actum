import { Island } from '../island';
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { MenuContentPropsContext, MenuSubmenuContext } from './common';
import { EVENT } from '../../constants';
import classNames from 'classnames';
import './menu.scss';

const Menu = ({
  children,
  className = '',
  onSelect,
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  /**
   * Called when any menu item is selected (clicked on).
   */
  onSelect?: (event: Event) => void;
  style?: React.CSSProperties;
}) => {
  const newClassName = classNames(`menu ${className}`).trim();
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const submenuIdsRef = useRef<Set<string>>(new Set());

  const registerSubmenu = useCallback((id: string) => {
    submenuIdsRef.current.add(id);
  }, []);

  const unregisterSubmenu = useCallback((id: string) => {
    submenuIdsRef.current.delete(id);
    if (openSubmenuId === id) {
      setOpenSubmenuId(null);
    }
  }, [openSubmenuId]);

  useEffect(() => {
    const handleMenuItemSelect = (e: Event) => {
      if (!e.defaultPrevented) {
        onSelect?.(e);
      }
    };
    window.addEventListener(EVENT.MENU_ITEM_SELECT, handleMenuItemSelect);
    return () => {
      window.removeEventListener(EVENT.MENU_ITEM_SELECT, handleMenuItemSelect);
    };
  }, [onSelect]);

  return (
    <MenuSubmenuContext.Provider value={{ openSubmenuId, setOpenSubmenuId, registerSubmenu, unregisterSubmenu }}>
      <MenuContentPropsContext.Provider value={{ onSelect }}>
        <div className={newClassName} style={style} data-testid="menu">
          {
            <Island className="menu-container" padding={2}>
              {children}
            </Island>
          }
        </div>
      </MenuContentPropsContext.Provider>
    </MenuSubmenuContext.Provider>
  );
};
Menu.displayName = 'Menu';

export default Menu;
