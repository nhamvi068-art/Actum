import React, { useContext, useRef, useCallback, useState } from 'react';
import { EVENT } from '../../constants';
import { composeEventHandlers } from '../../utils/common';

export const MenuContentPropsContext = React.createContext<{
  onSelect?: (event: Event) => void;
}>({});

// Menu-level context for coordinating submenus
interface SubmenuContextValue {
  openSubmenuId: string | null;
  setOpenSubmenuId: (id: string | null) => void;
  registerSubmenu: (id: string) => void;
  unregisterSubmenu: (id: string) => void;
}
export const MenuSubmenuContext = React.createContext<SubmenuContextValue | null>(null);

export const getMenuItemClassName = (
  className = '',
  active = false,
) => {
  return `menu-item menu-item-base ${className} ${
    active ? 'menu-item--active' : ''
  }`.trim();
};

export const useHandleMenuItemClick = (
  origOnClick:
    | React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>
    | undefined,
  onSelect: ((event: Event) => void) | undefined
) => {
  const menuContentProps = useContext(MenuContentPropsContext);

  return composeEventHandlers(origOnClick, (event) => {
    const itemSelectEvent = new CustomEvent(EVENT.MENU_ITEM_SELECT, {
      bubbles: true,
      cancelable: true,
    });
    onSelect?.(itemSelectEvent);
    if (!itemSelectEvent.defaultPrevented) {
      menuContentProps.onSelect?.(itemSelectEvent);
    }
    // Submenus use FloatingPortal, so DOM event bubbling cannot reach outer menus.
    // Also dispatch on window so all Menu layers (including outer ones via useEffect)
    // can respond to item selection and close themselves.
    window.dispatchEvent(itemSelectEvent);
  });
};
