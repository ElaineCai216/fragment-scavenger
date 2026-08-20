import { describe, it, expect } from 'vitest';
import { searchFragments, matchesFragment, shuffle, fragmentText } from '../src/search.js';

function f(over = {}) {
  return {
    id: 'x',
    type: 'text',
    moods: ['治愈'],
    text: '今天傍晚的海很安静',
    note: '',
    transcription: '',
    link: null,
    linkTitle: '',
    linkDesc: '',
    ...over,
  };
}

describe('搜索', () => {
  const frags = [
    f({ id: 'a', moods: ['治愈'], text: '一杯热牛奶' }),
    f({ id: 'b', moods: ['平静'], text: '雨落在窗台' }),
    f({ id: 'c', moods: ['治愈', '平静'], text: '午后晒太阳' }),
    f({ id: 'v', type: 'voice', moods: ['孤独'], text: '', transcription: '一个人的电影院' }),
    f({ id: 'l', type: 'link', moods: ['好奇'], text: '', linkTitle: '云朵的形成', link: 'https://example.com' }),
  ];

  it('按氛围词精确匹配', () => {
    const ids = searchFragments(frags, '治愈').map((x) => x.id).sort();
    expect(ids).toEqual(['a', 'c']);
  });

  it('按全文包含匹配', () => {
    expect(searchFragments(frags, '牛奶').map((x) => x.id)).toEqual(['a']);
    expect(searchFragments(frags, '窗台').map((x) => x.id)).toEqual(['b']);
  });

  it('语音转写可被搜索', () => {
    expect(searchFragments(frags, '电影院').map((x) => x.id)).toEqual(['v']);
  });

  it('链接标题可被搜索', () => {
    expect(searchFragments(frags, '云朵').map((x) => x.id)).toEqual(['l']);
  });

  it('多氛围碎片出现在多个搜索结果中', () => {
    const ids = searchFragments(frags, '平静').map((x) => x.id).sort();
    expect(ids).toEqual(['b', 'c']);
  });

  it('空查询 / 无匹配返回空数组', () => {
    expect(searchFragments(frags, '   ')).toEqual([]);
    expect(searchFragments(frags, '不存在的词xyz')).toEqual([]);
  });

  it('结果包含全部匹配项（顺序随机但集合不变）', () => {
    const set = new Set(searchFragments(frags, '治愈').map((x) => x.id));
    expect(set.has('a')).toBe(true);
    expect(set.has('c')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('fragmentText 汇总所有可搜字段', () => {
    const t = fragmentText(f({ moods: ['治愈'], text: '海', note: '海边', transcription: '风', linkTitle: '浪' }));
    expect(t).toContain('海');
    expect(t).toContain('海边');
    expect(t).toContain('风');
    expect(t).toContain('浪');
    expect(t).toContain('治愈');
  });

  it('shuffle 不改变元素集合', () => {
    const src = [1, 2, 3, 4, 5, 6];
    const out = shuffle(src);
    expect(out).toHaveLength(src.length);
    for (const n of src) expect(out).toContain(n);
  });
});
