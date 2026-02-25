import React from 'react';

const MenuItemContent = ({
  icon,
  shortcut,
  children,
}: {
  icon?: React.ReactNode;
  shortcut?: string;
  children: React.ReactNode;
}) => {
  // 处理 icon，既可以是 React 元素，也可以是函数组件
  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return icon;
    }
    // 如果是函数组件，调用它
    if (typeof icon === 'function') {
      const IconComponent = icon as React.ComponentType;
      return <IconComponent />;
    }
    return icon;
  };

  return (
    <>
      {icon && <div className="menu-item__icon">{renderIcon()}</div>}
      <div className="menu-item__text">{children}</div>
      {shortcut && (
        <div className="menu-item__shortcut">{shortcut}</div>
      )}
    </>
  );
};
export default MenuItemContent;
