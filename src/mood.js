// 氛围词库：固定十词 + 可扩展自定义词
export const BASE_MOODS = [
  '治愈', '孤独', '浪漫', '热烈', '平静', '怀念', '好奇', '疲惫', '明亮', '荒诞',
];

// 每种氛围一套纸色/墨色/点缀色（剪贴簿风）
export const MOOD_THEMES = {
  治愈: { paper: '#f4e8d3', ink: '#8a5a3b', accent: '#7fa56f' },
  孤独: { paper: '#e8e2ee', ink: '#5d5570', accent: '#8f86a8' },
  浪漫: { paper: '#f7e3e6', ink: '#a0566a', accent: '#d9899b' },
  热烈: { paper: '#f9e0d0', ink: '#a84a2f', accent: '#e07a4f' },
  平静: { paper: '#e2ede4', ink: '#47635a', accent: '#6f9a86' },
  怀念: { paper: '#e4e9f0', ink: '#4f5f7a', accent: '#8297b8' },
  好奇: { paper: '#f6efd2', ink: '#8a6f2f', accent: '#d8b64f' },
  疲惫: { paper: '#e7e4df', ink: '#6b6a66', accent: '#a3a098' },
  明亮: { paper: '#fbf6e8', ink: '#7a6a3a', accent: '#e8c95a' },
  荒诞: { paper: '#ece5f0', ink: '#5d4a7a', accent: '#b08fd0' },
};

const DEFAULT_THEME = { paper: '#f1e9d9', ink: '#6b5a44', accent: '#b08d5f' };

export function moodTheme(word) {
  return MOOD_THEMES[word] || DEFAULT_THEME;
}

// 合并基础词库与自定义词库（去重、过滤空词）
export function getMoods(customMoods = []) {
  const custom = (Array.isArray(customMoods) ? customMoods : [])
    .map((w) => String(w).trim())
    .filter(Boolean);
  const seen = new Set(BASE_MOODS);
  for (const w of custom) seen.add(w);
  return [...seen];
}

export function isValidMoodCount(n) {
  return Number.isInteger(n) && n >= 1 && n <= 3;
}

export function normalizeMoods(moods, customMoods = []) {
  const all = new Set(getMoods(customMoods));
  const picked = (Array.isArray(moods) ? moods : [])
    .map((w) => String(w).trim())
    .filter((w) => all.has(w));
  return [...new Set(picked)].slice(0, 3);
}
