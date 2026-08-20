// 搜索：氛围词（精确匹配）+ 全文（包含匹配），结果随机顺序

export function fragmentText(f) {
  if (!f) return '';
  return [
    f.text,
    f.note,
    f.transcription,
    f.linkTitle,
    f.linkDesc,
    f.link,
    ...(Array.isArray(f.moods) ? f.moods : []),
  ]
    .filter((s) => s != null && String(s).trim() !== '')
    .join(' ')
    .toLowerCase();
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function matchesFragment(f, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return false;
  if (Array.isArray(f.moods) && f.moods.some((m) => String(m).trim().toLowerCase() === q)) {
    return true;
  }
  return fragmentText(f).includes(q);
}

export function searchFragments(fragments, query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const matched = fragments.filter((f) => matchesFragment(f, q));
  return shuffle(matched);
}
