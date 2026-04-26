import { CommonSizeItem } from '../types/CommonSize';

/**
 * 常用尺寸预设
 */
export const COMMON_SIZES: CommonSizeItem[] = [
  // 1. 打印类尺寸
  {
    sizeId: 'print-a4-portrait',
    sizeName: 'A4 竖版',
    width: 794,
    height: 1123,
    unit: 'px',
    category: 'print',
    isDefault: true
  },
  {
    sizeId: 'print-a4-landscape',
    sizeName: 'A4 横版',
    width: 1123,
    height: 794,
    unit: 'px',
    category: 'print'
  },
  {
    sizeId: 'print-a3-portrait',
    sizeName: 'A3 竖版',
    width: 1191,
    height: 1684,
    unit: 'px',
    category: 'print'
  },

  // 2. 社交类尺寸
  {
    sizeId: 'social-wechat-moments',
    sizeName: '朋友圈海报',
    width: 1080,
    height: 1920,
    unit: 'px',
    category: 'social'
  },
  {
    sizeId: 'social-wechat-avatar',
    sizeName: '微信头像',
    width: 512,
    height: 512,
    unit: 'px',
    category: 'social'
  },
  {
    sizeId: 'social-instagram-post',
    sizeName: 'Instagram 帖子',
    width: 1080,
    height: 1080,
    unit: 'px',
    category: 'social'
  },
  {
    sizeId: 'social-instagram-story',
    sizeName: 'Instagram 故事',
    width: 1080,
    height: 1920,
    unit: 'px',
    category: 'social'
  },

  // 3. 电商类尺寸
  {
    sizeId: 'ecommerce-taobao-main',
    sizeName: '淘宝主图',
    width: 800,
    height: 800,
    unit: 'px',
    category: 'ecommerce'
  },
  {
    sizeId: 'ecommerce-taobao-detail',
    sizeName: '淘宝详情页',
    width: 750,
    height: 1000,
    unit: 'px',
    category: 'ecommerce'
  },
  {
    sizeId: 'ecommerce-amazon-main',
    sizeName: '亚马逊主图',
    width: 1000,
    height: 1000,
    unit: 'px',
    category: 'ecommerce'
  },
  {
    sizeId: 'ecommerce-douyin-product',
    sizeName: '抖音商品图',
    width: 1080,
    height: 1920,
    unit: 'px',
    category: 'ecommerce'
  }
];


