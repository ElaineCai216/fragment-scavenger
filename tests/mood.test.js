import { describe, it, expect } from 'vitest';
import { BASE_MOODS, getMoods, moodTheme, normalizeMoods, isValidMoodCount } from '../src/mood.js';

describe('氛围词库', () => {
  it('基础词库为 10 个且不重复', () => {
    expect(BASE_MOODS).toHaveLength(10);
    expect(new Set(BASE_MOODS).size).toBe(10);
  });

  it('包含约定的十词', () => {
    for (const w of ['治愈', '孤独', '浪漫', '热烈', '平静', '怀念', '好奇', '疲惫', '明亮', '荒诞']) {
      expect(BASE_MOODS).toContain(w);
    }
  });

  it('可扩展自定义词并去重', () => {
    expect(getMoods(['松弛'])).toContain('松弛');
    expect(getMoods(['治愈', '治愈', '  '])).toHaveLength(10);
    const moods = getMoods(['松弛', '松弛']);
    expect(moods.filter((m) => m === '松弛')).toHaveLength(1);
  });

  it('每个氛围词都有主题色', () => {
    for (const w of getMoods([])) {
      const t = moodTheme(w);
      expect(t.paper).toMatch(/^#/);
      expect(t.ink).toMatch(/^#/);
      expect(t.accent).toMatch(/^#/);
    }
  });

  it('多氛围数量限制 1-3', () => {
    expect(isValidMoodCount(1)).toBe(true);
    expect(isValidMoodCount(3)).toBe(true);
    expect(isValidMoodCount(0)).toBe(false);
    expect(isValidMoodCount(4)).toBe(false);
  });

  it('normalizeMoods 去重、截断 3、忽略非法词', () => {
    expect(normalizeMoods(['治愈', '治愈', '平静', '孤独', '浪漫'], [])).toEqual(['治愈', '平静', '孤独']);
    expect(normalizeMoods(['不存在', '治愈'], [])).toEqual(['治愈']);
    expect(normalizeMoods(['松弛'], ['松弛'])).toEqual(['松弛']);
    expect(normalizeMoods([], [])).toEqual([]);
  });
});
