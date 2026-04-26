import JSZip from 'jszip';

/**
 * 将 URL 转换为 Blob（用于绕过浏览器直接打开图片的行为）
 */
export const fetchUrlToBlob = async (url: string): Promise<Blob> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('网络请求失败');
  return await response.blob();
};

/**
 * 单文件安全下载（通过 Blob URL 绕过浏览器直接打开图片）
 */
export const downloadSingleFile = async (url: string, filename: string): Promise<void> => {
  try {
    const blob = await fetchUrlToBlob(url);
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'downloaded-image.png';
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (error) {
    console.error('[Download] Failed:', error);
    // 降级：直接通过 window.open 打开
    window.open(url, '_blank');
  }
};

/**
 * 批量打包下载（依赖 jszip）
 */
export const downloadBatchAsZip = async (
  assets: Array<{ url: string; name: string }>,
  zipFilename = 'assets-batch.zip'
): Promise<void> => {
  if (!assets || assets.length === 0) return;

  const zip = new JSZip();
  const folder = zip.folder('assets');
  if (!folder) return;

  const fetchPromises = assets.map(async (asset, index) => {
    try {
      const blob = await fetchUrlToBlob(asset.url);
      const ext = asset.name?.split('.').pop() || 'png';
      const baseName = asset.name?.replace(/\.[^.]+$/, '') || `image-${index}`;
      folder.file(`${index + 1}_${baseName}.${ext}`, blob);
    } catch (e) {
      console.warn(`[Download] 文件 ${asset.name} 获取失败，已跳过`, e);
    }
  });

  await Promise.all(fetchPromises);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipUrl = URL.createObjectURL(zipBlob);

  const a = document.createElement('a');
  a.href = zipUrl;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
};
