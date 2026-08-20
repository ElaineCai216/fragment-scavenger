// Cloudflare Worker 调用（可配置地址；未配置/失败时由调用方回落为手动模式）

const DEFAULT_TIMEOUT = 30000;

async function postJSON(url, body, timeout = DEFAULT_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  } finally {
    clearTimeout(timer);
  }
}

export function isWorkerConfigured(settings) {
  return Boolean(settings && settings.workerUrl && /^https?:\/\//.test(settings.workerUrl));
}

export async function checkHealth(workerUrl) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(workerUrl.replace(/\/+$/, '') + '/health', { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: {} };
  }
}

// 氛围识别：文字 / 照片 / 语音转写 / 链接 均可
export async function analyzeMood(settings, payload) {
  const base = settings.workerUrl.replace(/\/+$/, '');
  const { ok, data } = await postJSON(base + '/analyze', {
    accessCode: settings.accessCode || '',
    type: payload.type,
    text: payload.text || '',
    note: payload.note || '',
    transcription: payload.transcription || '',
    link: payload.link || '',
    linkTitle: payload.linkTitle || '',
    linkDesc: payload.linkDesc || '',
    imageDataUrl: payload.imageDataUrl || null,
    allowedMoods: payload.allowedMoods || [],
  });
  if (!ok) return { ok: false, error: data.error || 'network' };
  const moods = Array.isArray(data.moods) ? data.moods : [];
  return { ok: true, moods };
}

// 语音转写：上游不支持时返回 not-supported，前端只保留原声
export async function transcribeAudio(settings, audioDataUrl, mime) {
  const base = settings.workerUrl.replace(/\/+$/, '');
  const { ok, data } = await postJSON(base + '/transcribe', {
    accessCode: settings.accessCode || '',
    audioDataUrl,
    mime: mime || 'audio/webm',
  });
  if (!ok) return { ok: false, error: data.error || 'network' };
  return { ok: true, text: data.text || '' };
}

// 链接抓取标题/简介
export async function fetchLink(settings, url) {
  const base = settings.workerUrl.replace(/\/+$/, '');
  const { ok, data } = await postJSON(base + '/fetch', { accessCode: settings.accessCode || '', url });
  if (!ok) return { ok: false, error: data.error || 'network' };
  return { ok: true, title: data.title || '', description: data.description || '' };
}
