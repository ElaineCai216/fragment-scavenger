// 碎片拾荒者 · AI 代理（Cloudflare Worker）
// 隐藏大模型 API Key；前端只调用本 Worker。可选部署，不部署不影响网页。
//
// 环境变量（在 Cloudflare 中配置）：
//   API_KEY（或 OPENAI_API_KEY / DEEPSEEK_API_KEY）  大模型密钥
//   BASE_URL      （可选）OpenAI 兼容接口地址，默认 https://api.openai.com/v1
//   MODEL         （可选）视觉/文本模型，默认 gpt-4o-mini
//   TRANSCRIBE_MODEL （可选）语音转写模型，默认 whisper-1
//   ALLOWED_ORIGIN （可选）允许的前端来源，逗号分隔；留空则允许所有来源

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin = allowed.length === 0 ? '*' : origin && allowed.includes(origin) ? origin : '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
  return headers;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function apiKey(env) {
  return env.API_KEY || env.OPENAI_API_KEY || env.DEEPSEEK_API_KEY || '';
}

function baseUrl(env) {
  return (env.BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// ---------- /analyze：文字/图片/语音转写/链接 -> 建议氛围 ----------
function buildAnalyzeMessages(body) {
  const allowed = Array.isArray(body.allowedMoods) && body.allowedMoods.length
    ? body.allowedMoods
    : ['治愈', '孤独', '浪漫', '热烈', '平静', '怀念', '好奇', '疲惫', '明亮', '荒诞'];
  const parts = [];
  if (body.text) parts.push(`文字：${body.text}`);
  if (body.note) parts.push(`备注：${body.note}`);
  if (body.transcription) parts.push(`语音转写：${body.transcription}`);
  if (body.link) parts.push(`链接：${body.link}`);
  if (body.linkTitle) parts.push(`链接标题：${body.linkTitle}`);
  if (body.linkDesc) parts.push(`链接简介：${body.linkDesc}`);
  if (parts.length === 0 && !body.imageDataUrl) parts.push('（只有一张图片）');

  const system = `你是「碎片拾荒者」的氛围判断者。用户随手收藏了一块生活碎片，请你判断它给人的「感觉/氛围」。
只允许从下面这些氛围词中选择 1-3 个最贴切的：
${JSON.stringify(allowed)}
只输出 JSON，格式为 {"moods":["词1","词2"]}，不要任何其他文字、解释或标点。`;

  const userContent = [];
  if (parts.length) userContent.push({ type: 'text', text: parts.join('\n') });
  if (body.imageDataUrl) {
    userContent.push({ type: 'image_url', image_url: { url: body.imageDataUrl } });
  }
  return { system, userContent };
}

function parseMoods(raw, allowed) {
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let moods = [];
  try {
    const obj = JSON.parse(text);
    if (Array.isArray(obj.moods)) moods = obj.moods;
    else if (typeof obj === 'string') moods = JSON.parse(obj);
  } catch {
    // 宽松解析：从返回文本里找氛围词
    for (const w of allowed) {
      if (text.includes(w)) moods.push(w);
    }
  }
  const valid = moods
    .map((w) => String(w).trim())
    .filter((w) => allowed.includes(w));
  return [...new Set(valid)].slice(0, 3);
}

async function analyze(env, body) {
  const key = apiKey(env);
  if (!key) return { ok: false, error: 'missing-api-key' };
  const { system, userContent } = buildAnalyzeMessages(body);
  const { base, model } = { base: baseUrl(env), model: env.MODEL || 'gpt-4o-mini' };
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });
  } catch {
    return { ok: false, error: 'upstream-network' };
  }
  if (!res.ok) return { ok: false, error: `upstream-${res.status}` };
  const data = await res.json().catch(() => ({}));
  const raw = data?.choices?.[0]?.message?.content || '';
  const moods = parseMoods(raw, body.allowedMoods || []);
  return { ok: true, moods };
}

// ---------- /transcribe：语音转写 ----------
async function transcribe(env, body) {
  const key = apiKey(env);
  if (!key) return { ok: false, error: 'missing-api-key' };
  if (!body.audioDataUrl) return { ok: false, error: 'missing-audio' };
  const model = env.TRANSCRIBE_MODEL || 'whisper-1';
  const mime = body.mime || 'audio/webm';
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : mime.includes('wav') ? 'wav' : 'webm';
  const base64 = String(body.audioDataUrl).split(',')[1] || '';
  if (!base64) return { ok: false, error: 'bad-audio-data' };
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append('file', new Blob([bin], { type: mime }), `voice.${ext}`);
  form.append('model', model);
  let res;
  try {
    res = await fetch(`${baseUrl(env)}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch {
    return { ok: false, error: 'upstream-network' };
  }
  if (res.status === 404 || res.status === 400) return { ok: false, error: 'not-supported' };
  if (!res.ok) return { ok: false, error: `upstream-${res.status}` };
  const data = await res.json().catch(() => ({}));
  const text = (data?.text || '').trim();
  return text ? { ok: true, text } : { ok: false, error: 'empty' };
}

// ---------- /fetch：链接抓标题/简介 ----------
function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchMeta(url) {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'bad-url' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!res.ok) return { ok: false, error: `http-${res.status}` };
    const type = res.headers.get('content-type') || '';
    if (!type.includes('text/html') && !type.includes('application/xhtml')) {
      return { ok: false, error: 'not-html' };
    }
    const html = (await res.text()).slice(0, 200000);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const desc =
      (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] ||
      (html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1] ||
      '';
    return { ok: true, title: stripHtml(title), description: stripHtml(desc).slice(0, 300) };
  } catch {
    return { ok: false, error: 'fetch-failed' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 路由 ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (request.method === 'GET' && url.pathname === '/health') {
      return json(
        { ok: true, app: 'fragment-scavenger-ai', configured: Boolean(apiKey(env)) },
        200,
        cors
      );
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method-not-allowed' }, 405, cors);
    }

    const body = await readBody(request);
    if (!body) return json({ ok: false, error: 'bad-body' }, 400, cors);

    let result;
    if (url.pathname === '/analyze') {
      result = await analyze(env, body);
    } else if (url.pathname === '/transcribe') {
      result = await transcribe(env, body);
    } else if (url.pathname === '/fetch') {
      result = await fetchMeta(body.url);
    } else {
      return json({ ok: false, error: 'not-found' }, 404, cors);
    }

    return json(result.ok ? { ok: true, ...result } : { ok: false, error: result.error }, result.ok ? 200 : 502, cors);
  },
};
