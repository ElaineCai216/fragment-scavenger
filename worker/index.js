/**
 * 碎片拾荒者 · AI 代理（Cloudflare Worker）
 * 模式与「苏格拉底提问词」的 Worker 一致：
 *   - POST /analyze    文字/图片/语音转写/链接 -> 建议氛围（1-3 个）
 *   - POST /transcribe 语音 -> 文本（上游不支持时返回 not-supported，前端保留原声）
 *   - POST /fetch      服务端抓取链接标题/简介（绕过浏览器 CORS）
 *   - GET  /health     设置页连通性自检
 *
 * 环境变量 / Secrets：
 *   - API_KEY        （secret，必填）上游模型的 API Key（OpenAI 兼容）
 *   - BASE_URL       （可选）OpenAI 兼容接口地址，默认 https://api.openai.com/v1
 *   - MODEL          （可选）视觉/文本模型，默认 gpt-4o-mini（需支持图片）
 *   - TRANSCRIBE_MODEL（可选）语音转写模型，默认 whisper-1
 *   - ACCESS_CODE    （可选）访问码，设置了则 /analyze /transcribe /fetch 必须携带
 *   - ALLOWED_ORIGINS 或 ALLOWED_ORIGIN（可选）允许的 CORS 来源，逗号分隔；留空则允许所有
 */
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const MAX_BODY = 2_500_000;   // 请求体上限 ~2.5MB
const FETCH_TIMEOUT_MS = 20000;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function corsHeaders(env) {
  const origins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = origins.length ? origins.join(', ') : '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function apiKey(env) {
  return env.API_KEY || env.OPENAI_API_KEY || env.DEEPSEEK_API_KEY || '';
}

function baseUrl(env) {
  return (env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
  try {
    return JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
}

function checkAccess(env, body) {
  if (env.ACCESS_CODE && (!body || body.accessCode !== env.ACCESS_CODE)) {
    return json({ ok: false, error: 'access_denied', message: '访问码错误或无权限' }, 403);
  }
  return null;
}

// ---------- /analyze ----------
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
    for (const w of allowed) {
      if (text.includes(w)) moods.push(w);
    }
  }
  const valid = moods.map((w) => String(w).trim()).filter((w) => allowed.includes(w));
  return [...new Set(valid)].slice(0, 3);
}

async function handleAnalyze(env, body) {
  const key = apiKey(env);
  if (!key) return json({ ok: false, error: 'missing-api-key', message: 'Worker 尚未配置 API Key' }, 503);
  const { system, userContent } = buildAnalyzeMessages(body);
  let res;
  try {
    res = await fetch(`${baseUrl(env)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env.MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });
  } catch {
    return json({ ok: false, error: 'upstream-network', message: '无法连接上游模型' }, 502);
  }
  if (!res.ok) return json({ ok: false, error: `upstream-${res.status}`, message: `上游模型返回 ${res.status}` }, 502);
  const data = await res.json().catch(() => ({}));
  const raw = data?.choices?.[0]?.message?.content || '';
  const moods = parseMoods(raw, body.allowedMoods || []);
  if (!moods.length) return json({ ok: false, error: 'empty', message: '没有识别出氛围' }, 502);
  return json({ ok: true, moods });
}

// ---------- /transcribe ----------
async function handleTranscribe(env, body) {
  const key = apiKey(env);
  if (!key) return json({ ok: false, error: 'missing-api-key', message: 'Worker 尚未配置 API Key' }, 503);
  if (!body.audioDataUrl) return json({ ok: false, error: 'missing-audio' }, 400);
  const model = env.TRANSCRIBE_MODEL || 'whisper-1';
  const mime = body.mime || 'audio/webm';
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : mime.includes('wav') ? 'wav' : 'webm';
  const base64 = String(body.audioDataUrl).split(',')[1] || '';
  if (!base64) return json({ ok: false, error: 'bad-audio-data' }, 400);
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
    return json({ ok: false, error: 'upstream-network', message: '无法连接上游模型' }, 502);
  }
  if (res.status === 404 || res.status === 400) {
    return json({ ok: false, error: 'not-supported', message: '上游不支持语音转写' }, 502);
  }
  if (!res.ok) return json({ ok: false, error: `upstream-${res.status}`, message: `上游返回 ${res.status}` }, 502);
  const data = await res.json().catch(() => ({}));
  const text = (data?.text || '').trim();
  if (!text) return json({ ok: false, error: 'empty' }, 502);
  return json({ ok: true, text });
}

// ---------- /fetch ----------
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

async function handleFetch(env, body) {
  let url = String(body.url || '').trim();
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error('protocol');
    url = u.href;
  } catch {
    return json({ ok: false, error: 'bad_url', message: '请输入合法的 http/https 网址' }, 400);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,text/plain,*/*',
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!res.ok) return json({ ok: false, error: `http-${res.status}`, message: `目标站点返回 ${res.status}` }, 502);
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('text/html') && !type.includes('application/xhtml')) {
      return json({ ok: false, error: 'not-html', message: '该链接不是网页内容' }, 415);
    }
    const html = (await res.text()).slice(0, 200000);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const desc =
      (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] ||
      (html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1] ||
      '';
    return json({ ok: true, title: stripHtml(title).slice(0, 160), description: stripHtml(desc).slice(0, 300) });
  } catch (e) {
    if (e.name === 'AbortError') return json({ ok: false, error: 'timeout', message: '抓取超时' }, 504);
    return json({ ok: false, error: 'fetch-failed', message: '无法访问该网址' }, 502);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 路由 ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, app: 'fragment-scavenger-ai', hasKey: Boolean(apiKey(env)), configured: Boolean(apiKey(env)) }, 200, cors);
      }

      if (request.method !== 'POST') {
        return json({ ok: false, error: 'method-not-allowed' }, 405, cors);
      }

      const body = await readJson(request);
      if (body instanceof Response) {
        for (const [k, v] of Object.entries(cors)) body.headers.set(k, v);
        return body;
      }
      const denied = checkAccess(env, body);
      if (denied) {
        for (const [k, v] of Object.entries(cors)) denied.headers.set(k, v);
        return denied;
      }

      let result;
      if (url.pathname === '/analyze') {
        result = await handleAnalyze(env, body);
      } else if (url.pathname === '/transcribe') {
        result = await handleTranscribe(env, body);
      } else if (url.pathname === '/fetch') {
        result = await handleFetch(env, body);
      } else {
        return json({ ok: false, error: 'not_found', message: '未知路径' }, 404, cors);
      }
      for (const [k, v] of Object.entries(cors)) result.headers.set(k, v);
      return result;
    } catch (e) {
      return json({ ok: false, error: 'internal', message: 'Worker 内部错误：' + (e && e.message ? e.message : e) }, 500, cors);
    }
  },
};
