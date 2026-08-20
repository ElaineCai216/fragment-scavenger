import { describe, it, expect } from 'vitest';
import { buildBackup, parseBackup } from '../src/backup.js';
import { blobToDataURL, dataURLToBlob } from '../src/media.js';

function f(over = {}) {
  return {
    id: 'x',
    type: 'text',
    moods: ['治愈'],
    text: '一句书摘',
    note: '',
    transcription: '',
    imageBlob: null,
    audioBlob: null,
    link: null,
    linkTitle: '',
    linkDesc: '',
    createdAt: '2026-08-21T00:00:00.000Z',
    ...over,
  };
}

describe('备份', () => {
  it('导出包含全部碎片与自定义词', async () => {
    const backup = await buildBackup({
      fragments: [f({ id: 'a' }), f({ id: 'b', type: 'voice' })],
      customMoods: ['松弛'],
    });
    expect(backup.app).toBe('fragment-scavenger');
    expect(backup.fragments).toHaveLength(2);
    expect(backup.customMoods).toContain('松弛');
  });

  it('导出 -> 导入往返一致', async () => {
    const photoBlob = new Blob(['photo-bytes'], { type: 'image/jpeg' });
    const audioBlob = new Blob(['audio-bytes'], { type: 'audio/webm' });
    const backup = await buildBackup({
      fragments: [
        f({ id: 'p', type: 'photo', moods: ['怀念'], imageBlob: photoBlob }),
        f({ id: 'v', type: 'voice', moods: ['孤独'], transcription: '你好', audioBlob }),
      ],
      customMoods: [],
    });
    const json = JSON.stringify(backup);
    const restored = await parseBackup(json);
    expect(restored.fragments).toHaveLength(2);

    const photo = restored.fragments.find((x) => x.id === 'p');
    expect(photo.imageBlob).not.toBeNull();
    expect(photo.imageBlob.type).toBe('image/jpeg');
    expect(await photo.imageBlob.text()).toBe('photo-bytes');

    const voice = restored.fragments.find((x) => x.id === 'v');
    expect(voice.transcription).toBe('你好');
    expect(voice.audioBlob.type).toBe('audio/webm');
    expect(await voice.audioBlob.text()).toBe('audio-bytes');
  });

  it('非法备份抛出错误', async () => {
    await expect(parseBackup('{"foo":1}')).rejects.toThrow('invalid-backup');
    await expect(parseBackup('not json')).rejects.toThrow();
  });

  it('DataURL <-> Blob 往返一致', async () => {
    const blob = new Blob(['abc'], { type: 'text/plain' });
    const dataUrl = await blobToDataURL(blob);
    expect(dataUrl.startsWith('data:text/plain;base64,')).toBe(true);
    const back = dataURLToBlob(dataUrl);
    expect(back.type).toBe('text/plain');
    expect(await back.text()).toBe('abc');
  });
});
