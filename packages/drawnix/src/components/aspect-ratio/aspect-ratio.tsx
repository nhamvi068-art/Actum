/**
 * 共享的比例选项数据与图标组件
 * 由 BottomInputBar 和 GlobalConsole 共用
 */

import React from 'react';

// 单个比例选项
export interface AspectRatioOption {
  value: string;
  label: string;
  group: 'square' | 'portrait' | 'landscape' | 'ultrawide';
  groupLabel: string;
  desc: string;
}

// 可用的比例选项 - 带分组信息
export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  // 方形
  { value: '1:1', label: '1:1', group: 'square', groupLabel: '方形', desc: '1024×1024' },
  // 竖向
  { value: '2:3', label: '2:3', group: 'portrait', groupLabel: '竖向', desc: '1024×1536' },
  { value: '3:4', label: '3:4', group: 'portrait', groupLabel: '竖向', desc: '1024×1366' },
  { value: '4:5', label: '4:5', group: 'portrait', groupLabel: '竖向', desc: '1024×1280' },
  { value: '9:16', label: '9:16', group: 'portrait', groupLabel: '竖向', desc: '1024×1820' },
  // 横向
  { value: '3:2', label: '3:2', group: 'landscape', groupLabel: '横向', desc: '1536×1024' },
  { value: '4:3', label: '4:3', group: 'landscape', groupLabel: '横向', desc: '1366×1024' },
  { value: '5:4', label: '5:4', group: 'landscape', groupLabel: '横向', desc: '1280×1024' },
  { value: '16:9', label: '16:9', group: 'landscape', groupLabel: '横向', desc: '1820×1024' },
  // 宽幅
  { value: '21:9', label: '21:9', group: 'ultrawide', groupLabel: '宽幅', desc: '2104×968' },
];

// 比例形状渲染组件 - 根据比例值返回对应形状的 SVG
// 所有 SVG 统一在最外层 22×22 viewBox 内布局，图标槽位固定宽高，对齐整齐
const RatioIcon: React.FC<{ ratio: string }> = ({ ratio }) => {
  const renderIcon = () => {
    // 固定 22×22 viewBox，深灰实心块
    const fill = '#555';

    switch (ratio) {
      case '1:1':
        return (
          <svg width="16" height="16" viewBox="0 0 22 22">
            <rect x="3" y="3" width="16" height="16" rx="2" fill={fill}/>
          </svg>
        );
      case '2:3':
        return (
          <svg width="12" height="18" viewBox="0 0 22 22">
            <rect x="5" y="2" width="12" height="18" rx="2" fill={fill}/>
          </svg>
        );
      case '3:4':
        return (
          <svg width="13" height="16" viewBox="0 0 22 22">
            <rect x="4" y="3" width="14" height="16" rx="2" fill={fill}/>
          </svg>
        );
      case '4:5':
        return (
          <svg width="13" height="15" viewBox="0 0 22 22">
            <rect x="4" y="3" width="14" height="16" rx="2" fill={fill}/>
          </svg>
        );
      case '9:16':
        return (
          <svg width="10" height="17" viewBox="0 0 22 22">
            <rect x="6" y="2" width="10" height="18" rx="2" fill={fill}/>
          </svg>
        );
      case '3:2':
        return (
          <svg width="18" height="12" viewBox="0 0 22 22">
            <rect x="2" y="5" width="18" height="12" rx="2" fill={fill}/>
          </svg>
        );
      case '4:3':
        return (
          <svg width="17" height="13" viewBox="0 0 22 22">
            <rect x="2" y="4" width="18" height="14" rx="2" fill={fill}/>
          </svg>
        );
      case '5:4':
        return (
          <svg width="16" height="13" viewBox="0 0 22 22">
            <rect x="3" y="4" width="16" height="14" rx="2" fill={fill}/>
          </svg>
        );
      case '16:9':
        return (
          <svg width="18" height="10" viewBox="0 0 22 22">
            <rect x="2" y="6" width="18" height="10" rx="2" fill={fill}/>
          </svg>
        );
      case '21:9':
        return (
          <svg width="20" height="8" viewBox="0 0 22 22">
            <rect x="1" y="7" width="20" height="8" rx="2" fill={fill}/>
          </svg>
        );
      default:
        return (
          <svg width="16" height="16" viewBox="0 0 22 22">
            <rect x="3" y="3" width="16" height="16" rx="2" fill={fill}/>
          </svg>
        );
    }
  };

  // 外层 span 固定宽高，左列对齐；内容居中
  // class 与 bottom-input-bar.scss 的 &__dropdown-item-icon-ratio 对应
  return (
    <span className="bottom-input-bar__dropdown-item-icon-ratio">
      {renderIcon()}
    </span>
  );
};

export default RatioIcon;
