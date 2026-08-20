// 内置自检：index.html?selftest 运行。与 Vitest 共用同一批纯函数。
import { BASE_MOODS, getMoods, normalizeMoods, isValidMoodCount } from './mood.js';
import { searchFragments, matchesFragment, shuffle } from './search.js';
import { buildBackup, parseBackup } from './backup.js';
import { blobToDataURL, dataURLToBlob } from './media.js';

function sampleFragment(over = {}) {
  return {
    id: 't-' + Math.random().toString(36).slice(2, 8),
    type: 'text',
    moods: ['治愈'],
    text: '今天傍晚的海很安静',
    note: '',
    transcription: '',
    imageBlob: null,
    audioBlob: null,
    link: null,
    linkTitle: '',
    linkDesc: '',
    createdAt: new Date().toISOString(),
    ...over,
  };
}

export async function runSelftest() {
  const results = [];
  const check = (name, pass, extra = '') => {
    results.push(`${pass ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  };

  // 1. 词库
  check('基础氛围词库为 10 个且不重复', BASE_MOODS.length === 10 && new Set(BASE_MOODS).size === 10, `(${BASE_MOODS.length})`);
  check('固定十词齐全', ['治愈', '孤独', '浪漫', '热烈', '平静', '怀念', '好奇', '疲惫', '明亮', '荒诞'].every((w) => BASE_MOODS.includes(w)));
  check('自定义词可扩展', getMoods(['松弛']).includes('松弛'));
  check('多氛围数量限制 1-3', isValidMoodCount(1) && isValidMoodCount(3) && !isValidMoodCount(0) && !isValidMoodCount(4));

  // 2. 搜索
  const frags = [
    sampleFragment({ id: 'a', moods: ['治愈'], text: '一杯热牛奶' }),
    sampleFragment({ id: 'b', moods: ['平静'], text: '雨落在窗台' }),
    sampleFragment({ id: 'c', moods: ['治愈', '平静'], text: '午后晒太阳' }),
  ];
  check('按氛围词搜索', searchFragments(frags, '治愈').map((f) => f.id).sort().join() === 'a,c');
  check('按全文搜索', searchFragments(frags, '牛奶').map((f) => f.id).join() === 'a');
  check('多氛围碎片出现在多个搜索中', searchFragments(frags, '平静').map((f) => f.id).sort().join() === 'b,c');
  check('空查询返回空', searchFragments(frags, '  ').length === 0);
  check('无匹配返回空', searchFragments(frags, '不存在xyz').length === 0);
  const shuffled = searchFragments(frags, '治愈');
  check('搜索结果包含全部匹配项', shuffled.length === 2 && new Set(shuffled.map((f) => f.id)).has('a') && new Set(shuffled.map((f) => f.id)).has('c'));
  check('shuffle 不改变集合', (() => { const s = shuffle([1, 2, 3, 4, 5]); return s.length === 5 && s.every((n) => [1, 2, 3, 4, 5].includes(n)); })());

  // 3. 语音转写与链接字段参与搜索
  const voice = sampleFragment({ id: 'v', type: 'voice', moods: ['孤独'], text: '', transcription: '一个人的电影院' });
  const link = sampleFragment({ id: 'l', type: 'link', moods: ['好奇'], text: '', linkTitle: '云朵的形成', link: 'https://example.com' });
  check('语音转写可被搜索', matchesFragment(voice, '电影院'));
  check('链接标题可被搜索', matchesFragment(link, '云朵'));

  // 4. 备份往返
  const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
  const photo = sampleFragment({ id: 'p', type: 'photo', moods: ['怀念'], imageBlob: blob });
  const backup = await buildBackup({ fragments: [photo, voice, link], customMoods: ['松弛'] });
  check('备份包含全部碎片与自定义词', backup.fragments.length === 3 && backup.customMoods.includes('松弛'));
  const restored = await parseBackup(JSON.stringify(backup));
  check('还原后碎片数量一致', restored.fragments.length === 3);
  const p0 = restored.fragments.find((f) => f.id === 'p');
  const text0 = await p0.imageBlob.text();
  check('照片 Blob 往返一致', p0.imageBlob.type === 'image/jpeg' && text0 === 'fake-image-bytes');
  check('还原后自定义词一致', restored.customMoods.includes('松弛'));

  // 5. normalizeMoods
  check('normalizeMoods 去重且最多 3 个', normalizeMoods(['治愈', '治愈', '平静', '孤独', '浪漫'], []).join() === '治愈,平静,孤独');
  check('normalizeMoods 忽略非法词', normalizeMoods(['不存在', '治愈'], []).join() === '治愈');

  // 6. dataURL 往返
  const round = dataURLToBlob(await blobToDataURL(blob));
  const roundText = await round.text();
  check('DataURL <-> Blob 往返一致', round.type === 'image/jpeg' && roundText === 'fake-image-bytes');

  const passCount = results.filter((r) => r.startsWith('✓')).length;
  const failCount = results.length - passCount;
  const lines = ['碎片拾荒者 · 自检报告', '='.repeat(30), ...results, '', `通过 ${passCount} / ${results.length}${failCount ? `，失败 ${failCount}` : '，全部通过 ✓'}`];
  return lines.join('\n');
}
