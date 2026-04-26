/**
 * Photo Wall Layout Tests
 */

import {
  calculatePhotoWallLayout,
  calculateCoverCrop,
  calculateContainDraw,
  getRecommendedLayout,
  GridLayoutOptions,
} from './photo-wall-layout';

describe('PhotoWallLayout', () => {
  describe('calculatePhotoWallLayout', () => {
    it('should return empty layout for empty array', () => {
      const result = calculatePhotoWallLayout([]);

      expect(result.totalWidth).toBe(0);
      expect(result.totalHeight).toBe(0);
      expect(result.columns).toBe(0);
      expect(result.rows).toBe(0);
      expect(result.layout).toHaveLength(0);
    });

    it('should calculate correct layout for 1 image', () => {
      const images = [{ id: '1', width: 100, height: 100, url: 'http://example.com/1.jpg' }];
      const result = calculatePhotoWallLayout(images);

      expect(result.columns).toBe(1);
      expect(result.rows).toBe(1);
      expect(result.layout).toHaveLength(1);
      expect(result.layout[0].x).toBe(0);
      expect(result.layout[0].y).toBe(0);
    });

    it('should calculate correct layout for 2 images', () => {
      const images = [
        { id: '1', width: 100, height: 100, url: 'http://example.com/1.jpg' },
        { id: '2', width: 200, height: 200, url: 'http://example.com/2.jpg' },
      ];
      const result = calculatePhotoWallLayout(images);

      expect(result.columns).toBe(2);
      expect(result.rows).toBe(1);
      expect(result.layout).toHaveLength(2);

      // First image at (0, 0)
      expect(result.layout[0].x).toBe(0);
      expect(result.layout[0].y).toBe(0);

      // Second image at (310, 0) - 300 cell size + 10 gap
      expect(result.layout[1].x).toBe(310);
      expect(result.layout[1].y).toBe(0);
    });

    it('should calculate correct layout for 4 images (2x2 grid)', () => {
      const images = [
        { id: '1', width: 100, height: 100, url: 'http://example.com/1.jpg' },
        { id: '2', width: 200, height: 200, url: 'http://example.com/2.jpg' },
        { id: '3', width: 150, height: 150, url: 'http://example.com/3.jpg' },
        { id: '4', width: 180, height: 180, url: 'http://example.com/4.jpg' },
      ];
      const result = calculatePhotoWallLayout(images);

      expect(result.columns).toBe(2);
      expect(result.rows).toBe(2);
      expect(result.layout).toHaveLength(4);

      // Total width: 2 * 300 + 10 = 610
      expect(result.totalWidth).toBe(610);

      // Total height: 2 * 300 + 10 = 610
      expect(result.totalHeight).toBe(610);
    });

    it('should calculate correct layout for 9 images (3x3 grid)', () => {
      const images = Array.from({ length: 9 }, (_, i) => ({
        id: String(i + 1),
        width: 100,
        height: 100,
        url: `http://example.com/${i + 1}.jpg`,
      }));
      const result = calculatePhotoWallLayout(images);

      expect(result.columns).toBe(3);
      expect(result.rows).toBe(3);
      expect(result.layout).toHaveLength(9);
    });

    it('should respect custom cellSize option', () => {
      const images = [{ id: '1', width: 100, height: 100, url: 'http://example.com/1.jpg' }];
      const result = calculatePhotoWallLayout(images, { cellSize: 200 });

      expect(result.cellSize).toBe(200);
      expect(result.layout[0].width).toBe(200);
      expect(result.layout[0].height).toBe(200);
    });

    it('should respect custom gap option', () => {
      const images = [
        { id: '1', width: 100, height: 100, url: 'http://example.com/1.jpg' },
        { id: '2', width: 200, height: 200, url: 'http://example.com/2.jpg' },
      ];
      const result = calculatePhotoWallLayout(images, { gap: 20 });

      expect(result.gap).toBe(20);
      expect(result.layout[1].x).toBe(320); // 300 + 20
    });

    it('should respect maxColumns option', () => {
      const images = Array.from({ length: 6 }, (_, i) => ({
        id: String(i + 1),
        width: 100,
        height: 100,
        url: `http://example.com/${i + 1}.jpg`,
      }));
      const result = calculatePhotoWallLayout(images, { maxColumns: 3 });

      expect(result.columns).toBe(3);
      expect(result.rows).toBe(2);
    });

    it('should respect maxRows option', () => {
      const images = Array.from({ length: 6 }, (_, i) => ({
        id: String(i + 1),
        width: 100,
        height: 100,
        url: `http://example.com/${i + 1}.jpg`,
      }));
      const result = calculatePhotoWallLayout(images, { maxRows: 2 });

      expect(result.rows).toBe(2);
      expect(result.columns).toBe(3);
    });
  });

  describe('calculateCoverCrop', () => {
    it('should crop wider image to fit target', () => {
      const result = calculateCoverCrop(400, 200, 100, 100);

      expect(result.sWidth).toBe(200);
      expect(result.sHeight).toBe(200);
      expect(result.sx).toBe(100); // (400 - 200) / 2
      expect(result.sy).toBe(0);
    });

    it('should crop taller image to fit target', () => {
      const result = calculateCoverCrop(200, 400, 100, 100);

      expect(result.sWidth).toBe(200);
      expect(result.sHeight).toBe(200);
      expect(result.sx).toBe(0);
      expect(result.sy).toBe(100); // (400 - 200) / 2
    });

    it('should handle square image to square target', () => {
      const result = calculateCoverCrop(200, 200, 100, 100);

      expect(result.sWidth).toBe(200);
      expect(result.sHeight).toBe(200);
      expect(result.sx).toBe(0);
      expect(result.sy).toBe(0);
    });
  });

  describe('calculateContainDraw', () => {
    it('should fit wider image inside target with padding', () => {
      const result = calculateContainDraw(400, 200, 100, 100);

      expect(result.dWidth).toBe(100);
      expect(result.dHeight).toBe(50);
      expect(result.dx).toBe(0);
      expect(result.dy).toBe(25); // (100 - 50) / 2
    });

    it('should fit taller image inside target with padding', () => {
      const result = calculateContainDraw(200, 400, 100, 100);

      expect(result.dWidth).toBe(50);
      expect(result.dHeight).toBe(100);
      expect(result.dx).toBe(25); // (100 - 50) / 2
      expect(result.dy).toBe(0);
    });

    it('should center square image inside square target', () => {
      const result = calculateContainDraw(200, 200, 100, 100);

      expect(result.dWidth).toBe(100);
      expect(result.dHeight).toBe(100);
      expect(result.dx).toBe(0);
      expect(result.dy).toBe(0);
    });
  });

  describe('getRecommendedLayout', () => {
    it('should return correct recommendations for common counts', () => {
      expect(getRecommendedLayout(1)).toEqual({ cols: 1, rows: 1, description: '单图展示' });
      expect(getRecommendedLayout(2)).toEqual({ cols: 2, rows: 1, description: '并排两图' });
      expect(getRecommendedLayout(4)).toEqual({ cols: 2, rows: 2, description: '2x2 网格' });
      expect(getRecommendedLayout(9)).toEqual({ cols: 3, rows: 3, description: '3x3 网格' });
    });

    it('should auto-calculate for uncommon counts', () => {
      const result = getRecommendedLayout(7);

      expect(result.cols).toBe(3);
      expect(result.rows).toBe(3);
      expect(result.description).toBe('7 图网格');
    });
  });
});
