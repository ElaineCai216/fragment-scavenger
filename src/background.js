// 动态背景：随时间变化的色温 + 极慢的光影呼吸（CSS 动画负责动效）
// 色温时间线（小时 -> [纸色, 墨色, 光色]）：深夜沉静 -> 清晨微冷 -> 正午明亮 -> 黄昏暖橙 -> 深夜

const STOPS = [
  { h: 0, paper: '#2b2b36', ink: '#cfc8b8', light: 'rgba(150,160,200,0.16)' },
  { h: 5, paper: '#34333f', ink: '#d8d0bd', light: 'rgba(160,170,210,0.18)' },
  { h: 7, paper: '#e9e2d2', ink: '#5d5140', light: 'rgba(255,244,214,0.22)' },
  { h: 12, paper: '#f6efdf', ink: '#5b4f3c', light: 'rgba(255,250,226,0.30)' },
  { h: 17, paper: '#f0dcc0', ink: '#6a4f33', light: 'rgba(255,214,150,0.32)' },
  { h: 19, paper: '#cbbda6', ink: '#443c30', light: 'rgba(255,190,120,0.22)' },
  { h: 21, paper: '#3a3847', ink: '#d6cfc0', light: 'rgba(120,130,180,0.16)' },
  { h: 24, paper: '#2b2b36', ink: '#cfc8b8', light: 'rgba(150,160,200,0.16)' },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

function rgbToCss(c) {
  return `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToCss({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) });
}

function applyTone(root, date) {
  const h = date.getHours() + date.getMinutes() / 60;
  let i = 0;
  while (i < STOPS.length - 1 && STOPS[i + 1].h <= h) i++;
  const a = STOPS[i];
  const b = STOPS[Math.min(i + 1, STOPS.length - 1)];
  const span = b.h - a.h || 1;
  const t = Math.max(0, Math.min(1, (h - a.h) / span));
  root.style.setProperty('--bg-paper', mix(a.paper, b.paper, t));
  root.style.setProperty('--bg-ink', mix(a.ink, b.ink, t));
  // 光色直接取两个停靠点的中间色（rgba 简化处理）
  root.style.setProperty('--bg-light', a.light);
}

export function initBackground(root) {
  if (!root) root = document.documentElement;
  applyTone(root, new Date());
  const timer = setInterval(() => applyTone(root, new Date()), 60000);
  return () => clearInterval(timer);
}
