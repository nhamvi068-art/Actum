import React, { useState, useEffect } from 'react';
import {
  Search, LayoutGrid, List, CheckSquare, Upload,
  FileImage, FileVideo, Music, Layers, CheckCircle2, X, Edit2, ArrowLeft
} from 'lucide-react';

// 素材数据接口
interface Asset {
  id: number;
  name: string;
  type: string;
  size: string;
  date: string;
  source: string;
  url: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

// Tab 配置
interface TabConfig {
  name: string;
  icon: React.ElementType;
  count: number;
}

interface MediaLibraryPanelProps {
  onClose?: () => void;
}

export const MediaLibraryPanel: React.FC<MediaLibraryPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('全部');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [imageDimensions, setImageDimensions] = useState<Record<number, { width: number; height: number }>>({});

  const tabs: TabConfig[] = [
    { name: '全部', icon: Layers, count: 3 },
    { name: '图片', icon: FileImage, count: 3 },
    { name: '视频', icon: FileVideo, count: 0 },
    { name: '音频', icon: Music, count: 0 },
  ];

  const assets: Asset[] = [
    {
      id: 1,
      name: 'vr_family.jpg',
      type: '图片',
      size: '1.2 MB',
      date: '2026-03-24 10:30',
      source: '本地上传',
      url: 'https://images.unsplash.com/photo-1593508512255-86ab42a8e620?q=80&w=300&auto=format&fit=crop',
    },
    {
      id: 2,
      name: '89.jpg',
      type: '图片',
      size: '625.14 KB',
      date: '2026-03-24 11:56:06',
      source: '本地上传',
      url: 'https://images.unsplash.com/photo-1585241936939-f9250567e914?q=80&w=300&auto=format&fit=crop',
    },
    {
      id: 3,
      name: 'shaver_model.jpg',
      type: '图片',
      size: '840.5 KB',
      date: '2026-03-24 12:10',
      source: '本地上传',
      url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=300&auto=format&fit=crop',
    },
  ];

  const filteredAssets = activeTab === '全部'
    ? assets
    : assets.filter(asset => asset.type === activeTab);

  const handleSelectAsset = (asset: Asset) => {
    setSelectedAsset(selectedAsset?.id === asset.id ? null : asset);
  };

  const handleInsert = () => {
    if (selectedAsset) {
      console.log('[MediaLibrary] 插入素材:', selectedAsset.name);
    }
  };

  const handleUpload = () => {
    console.log('[MediaLibrary] 上传素材');
  };

  // 加载所有图片的原始尺寸
  useEffect(() => {
    const loadDimensions = async () => {
      const newDimensions: Record<number, { width: number; height: number }> = {};
      for (const asset of assets) {
        if (asset.naturalWidth && asset.naturalHeight) {
          newDimensions[asset.id] = { width: asset.naturalWidth, height: asset.naturalHeight };
          continue;
        }
        try {
          const img = new Image();
          img.src = asset.url;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              newDimensions[asset.id] = { width: img.naturalWidth, height: img.naturalHeight };
              resolve();
            };
            img.onerror = () => resolve();
          });
        } catch (e) {
          // ignore
        }
      }
      setImageDimensions(newDimensions);
    };
    loadDimensions();
  }, [assets]);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-xl w-96 border border-gray-100 overflow-hidden relative">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
          )}
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">素材库</h2>
        </div>
      </div>

      {/* 搜索和工具栏 */}
      <div className="px-4 pt-4 pb-2 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索素材..."
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-xl text-sm outline-none transition-all"
          />
        </div>
        <div className="flex items-center justify-between">
          {/* 视图切换 */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List size={14} />
            </button>
          </div>
          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors">
              <CheckSquare size={14} />批量选择
            </button>
            <button
              onClick={handleUpload}
              className="px-3 py-1.5 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Upload size={14} />上传
            </button>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="px-4 pb-2 flex items-center justify-between border-b border-gray-100">
        <div className="flex gap-2 overflow-x-auto custom-scrollbar py-1">
          {tabs.map(tab => (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${activeTab === tab.name ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
            >
              <tab.icon size={14} />
              <span className="opacity-80">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 素材列表 */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative bg-gray-50/50">
        {filteredAssets.length > 0 ? (
          viewMode === 'grid' ? (
            <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2' : 'grid-cols-1'} gap-3 content-start pb-40`}>
              {filteredAssets.map((asset) => {
                const dimensions = imageDimensions[asset.id];
                const aspectRatio = dimensions
                  ? dimensions.width / dimensions.height
                  : undefined;
                return (
                  <div
                    key={asset.id}
                    onClick={() => handleSelectAsset(asset)}
                    className={`group relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer transition-all ${selectedAsset?.id === asset.id ? 'ring-2 ring-orange-400 ring-offset-2 scale-[0.98]' : 'border border-gray-200 hover:border-blue-300 shadow-sm hover:shadow'}`}
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm p-1 rounded-md shadow-sm">
                      <FileImage size={12} className="text-gray-600" />
                    </div>
                    <div className={`absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity ${selectedAsset?.id === asset.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <p className="text-white text-xs font-medium truncate drop-shadow-md">{asset.name}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-40">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => handleSelectAsset(asset)}
                  className={`flex items-center gap-3 p-2.5 bg-white border rounded-xl cursor-pointer transition-all ${selectedAsset?.id === asset.id ? 'border-orange-300 bg-orange-50/50' : 'border-gray-200 hover:border-blue-300'}`}
                >
                  <img src={asset.url} alt={asset.name} className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{asset.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{asset.type} · {asset.size}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Layers size={48} className="opacity-40 mb-2" />
            <p className="text-sm">暂无{activeTab === '全部' ? '' : activeTab}素材</p>
          </div>
        )}
      </div>

      {/* 底部详情面板 */}
      <div className={`absolute bottom-0 left-0 right-0 bg-white shadow-[0_-8px_20px_rgb(0,0,0,0.08)] border-t border-gray-100 transition-transform duration-300 ease-in-out z-20 ${selectedAsset ? 'translate-y-0' : 'translate-y-full'}`}>
        {selectedAsset && (
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex gap-3 items-center w-full">
                <img src={selectedAsset.url} className="w-12 h-12 rounded-lg object-cover border border-gray-100 shadow-sm" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 truncate">
                    {selectedAsset.name}
                    <Edit2 size={12} className="text-gray-400 cursor-pointer hover:text-gray-700 flex-shrink-0" />
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">图片素材</p>
                </div>
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                <span className="text-gray-400">大小：</span>{selectedAsset.size}
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                <span className="text-gray-400">来源：</span>{selectedAsset.source}
              </div>
            </div>
            <button onClick={handleInsert} className="w-full py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-md">
              <CheckCircle2 size={16} />插入
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaLibraryPanel;
