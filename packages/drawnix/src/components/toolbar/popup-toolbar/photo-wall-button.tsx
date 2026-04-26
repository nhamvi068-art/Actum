/**
 * Photo Wall Button Component
 * 照片墙合并按钮
 */

import React, { useState } from 'react';
import { ToolButton } from '../../tool-button';
import { PhotoWallIcon } from '../../icons';
import { PlaitBoard, PlaitElement } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { mergeImagesToPhotoWall, canMergeToPhotoWall, PhotoWallMergeResult } from '../../../services/photo-wall-service';
import { MessagePlugin } from 'tdesign-react';
import { useI18n } from '../../../i18n';

export interface PhotoWallButtonProps {
  /** 画板实例 */
  board: PlaitBoard;
  /** 选中的元素 */
  selectedElements: PlaitElement[];
  /** 是否禁用 */
  disabled?: boolean;
  /** 点击回调 */
  onMerge?: (result: PhotoWallMergeResult) => void;
}

export const PhotoWallButton: React.FC<PhotoWallButtonProps> = ({
  board,
  selectedElements,
  disabled = false,
  onMerge,
}) => {
  const { t } = useI18n();
  const [isMerging, setIsMerging] = useState(false);

  const imageCount = selectedElements.filter(PlaitDrawElement.isImage).length;
  const { canMerge, reason } = canMergeToPhotoWall(selectedElements);

  const handleMerge = async () => {
    if (!canMerge || isMerging) {
      if (reason) {
        MessagePlugin.warning(reason);
      }
      return;
    }

    setIsMerging(true);

    try {
      const result = await mergeImagesToPhotoWall(board, selectedElements, {
        onProgress: (progress) => {
          // 可以在这里更新进度状态
          console.log(`Merging: ${progress.percentage}%`);
        },
      });

      MessagePlugin.success(
        `照片墙合并成功！已合并 ${imageCount} 张图片`
      );

      onMerge?.(result);
    } catch (error: any) {
      console.error('[PhotoWall] Merge failed:', error);

      if (error.message?.includes('CORS') || error.message?.includes('tainted')) {
        MessagePlugin.error(
          '跨域图片限制：无法读取部分图片数据。请将所有图片下载至本地后重新上传，再进行合并。',
          5000
        );
      } else {
        MessagePlugin.error(`照片墙合并失败: ${error.message || '未知错误'}`);
      }
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <ToolButton
      type="icon"
      icon={PhotoWallIcon}
      visible={true}
      title={t('popupToolbar.mergeToPhotoWall')}
      aria-label={t('popupToolbar.mergeToPhotoWall')}
      disabled={disabled || isMerging || !canMerge}
      onPointerUp={handleMerge}
    />
  );
};
