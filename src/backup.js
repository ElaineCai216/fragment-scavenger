// 备份：碎片（含 Blob）<-> 单文件 JSON（媒体转 base64），纯函数可在 Node 中测试
import { blobToDataURL, dataURLToBlob } from './media.js';

export async function buildBackup({ fragments, customMoods, version = 1 }) {
  const items = await Promise.all(
    (fragments || []).map(async (f) => {
      const { imageBlob, audioBlob, ...rest } = f;
      const imageData = imageBlob ? await blobToDataURL(imageBlob) : null;
      const audioData = audioBlob ? await blobToDataURL(audioBlob) : null;
      return { ...rest, imageData, audioData };
    })
  );
  return {
    app: 'fragment-scavenger',
    version,
    exportedAt: new Date().toISOString(),
    customMoods: customMoods || [],
    fragments: items,
  };
}

export async function parseBackup(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  if (!obj || !Array.isArray(obj.fragments)) {
    throw new Error('invalid-backup');
  }
  const fragments = await Promise.all(
    obj.fragments.map(async (item) => {
      const { imageData, audioData, ...rest } = item;
      return {
        ...rest,
        imageBlob: imageData ? dataURLToBlob(imageData) : null,
        audioBlob: audioData ? dataURLToBlob(audioData) : null,
      };
    })
  );
  return {
    customMoods: Array.isArray(obj.customMoods) ? obj.customMoods : [],
    fragments,
  };
}
