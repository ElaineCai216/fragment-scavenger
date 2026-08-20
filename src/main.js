// 碎片拾荒者 · 主逻辑
import './style.css';
import { initBackground } from './background.js';
import { createAudioEngine } from './audio.js';
import * as store from './store.js';
import * as api from './api.js';
import { BASE_MOODS, getMoods, moodTheme, normalizeMoods } from './mood.js';
import { searchFragments, shuffle } from './search.js';
import { blobToDataURL, compressImage, formatDuration } from './media.js';
import { runSelftest } from './selftest.js';

const $ = (sel) => document.querySelector(sel);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const TYPE_LABEL = { text: '文字', photo: '照片', voice: '语音', link: '链接' };

const audio = createAudioEngine();
const state = {
  settings: store.loadSettings(),
  fragments: [],
  query: '',
};

// ---------- 添加碎片面板状态 ----------
const addState = {
  type: 'text',
  photoBlob: null,
  audioBlob: null,
  transcription: '',
  linkTitle: '',
  linkDesc: '',
  selectedMoods: new Set(),
};

// 幻灯片状态
let slideList = [];
let slideIdx = 0;
let slideTimer = null;
let slidePaused = false;
let editingId = null;

// ============ 初始化 ============
async function init() {
  audio.setSound(state.settings.sound);
  audio.setMusic(state.settings.music);
  initBackground(document.documentElement);

  const isSelftest = new URLSearchParams(location.search).has('selftest');
  if (isSelftest) {
    $('#selftest-overlay').classList.remove('hidden');
    $('#selftest-output').textContent = '自检运行中…\n';
    const out = await runSelftest();
    $('#selftest-output').textContent = out;
    bindOverlayClose();
    return;
  }

  state.fragments = await store.getAllFragments();
  bindEvents();
  renderWall();
  bindOverlayClose();
}

function bindOverlayClose() {
  document.querySelectorAll('.overlay .js-close').forEach((btn) => {
    btn.onclick = () => btn.closest('.overlay').classList.add('hidden');
  });
}

function bindEvents() {
  // 搜索
  $('#search-input').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderWall();
  });
  $('#search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') playSearch();
  });
  $('#btn-play-search').addEventListener('click', playSearch);

  // 拾一片 / 添加 / 设置
  $('#btn-scavenge').addEventListener('click', () => {
    if (!state.fragments.length) return;
    audio.playClick();
    const f = state.fragments[Math.floor(Math.random() * state.fragments.length)];
    openSlideShow([f]);
  });
  $('#btn-add').addEventListener('click', openAdd);
  $('#btn-settings').addEventListener('click', openSettings);

  // 添加面板
  $('#add-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) switchAddTab(tab.dataset.type);
  });
  $('#add-file').addEventListener('change', onPhotoPicked);
  $('#btn-photo-clear').addEventListener('click', () => {
    addState.photoBlob = null;
    $('#add-file').value = '';
    $('#photo-preview-wrap').classList.add('hidden');
    $('#photo-drop-hint').classList.remove('hidden');
  });
  $('#btn-record').addEventListener('click', toggleRecord);
  $('#btn-ai').addEventListener('click', aiGuess);
  $('#btn-save').addEventListener('click', saveAdd);
  $('#add-link').addEventListener('input', debounce(onLinkInput, 900));

  // 设置
  $('#set-sound').addEventListener('change', (e) => {
    state.settings.sound = e.target.checked;
    audio.setSound(e.target.checked);
    store.saveSettings(state.settings);
  });
  $('#set-music').addEventListener('change', (e) => {
    state.settings.music = e.target.checked;
    audio.setMusic(e.target.checked);
    store.saveSettings(state.settings);
  });
  $('#set-worker-url').addEventListener('input', (e) => {
    state.settings.workerUrl = e.target.value.trim();
    store.saveSettings(state.settings);
  });
  $('#btn-test-worker').addEventListener('click', testWorker);
  $('#btn-add-mood').addEventListener('click', addCustomMood);
  $('#set-new-mood').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustomMood();
  });
  $('#btn-export').addEventListener('click', exportBackup);
  $('#import-file').addEventListener('change', onImportFile);
  $('#btn-clear').addEventListener('click', clearAll);

  // 编辑
  $('#btn-edit-save').addEventListener('click', saveEdit);
  $('#btn-delete').addEventListener('click', deleteEditing);

  // 幻灯片
  $('#btn-slide-close').addEventListener('click', closeSlide);
  $('#btn-prev').addEventListener('click', () => { audio.playClick(); prevSlide(); });
  $('#btn-next').addEventListener('click', () => { audio.playClick(); nextSlide(); });
  $('#btn-playpause').addEventListener('click', () => { audio.playClick(); togglePause(); });
  $('#btn-slide-edit').addEventListener('click', () => {
    const f = slideList[slideIdx];
    if (f) openEdit(f);
  });
  document.addEventListener('keydown', onKeydown);
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ============ 碎片墙 ============
function renderWall() {
  const wall = $('#wall');
  wall.innerHTML = '';
  const count = state.fragments.length;
  $('#foot-count').textContent = count ? `共 ${count} 片碎片` : '还没有碎片';

  const q = state.query.trim();
  $('#btn-play-search').hidden = !q;

  if (q) {
    const results = searchFragments(state.fragments, q);
    const bar = el('div', 'search-result-bar');
    const info = el('span', null, `找到 ${results.length} 片「${q}」`);
    const playBtn = el('button', 'primary-btn', '▶ 开始播放');
    playBtn.onclick = () => {
      if (results.length) { audio.playClick(); openSlideShow(results); }
    };
    bar.append(info, playBtn);
    wall.append(bar);
    if (results.length) {
      wall.append(renderScrapGrid(results));
    } else {
      const empty = el('div', 'empty', `没有找到「${q}」\n换个词试试，比如：治愈`);
      wall.append(empty);
    }
    return;
  }

  if (!count) {
    const empty = el('div', 'empty');
    empty.innerHTML = '<span class="empty-big">🪙</span>还没有碎片<br />丢一张电影票根、一句书摘进来吧';
    wall.append(empty);
    return;
  }

  for (const mood of getMoods(state.settings.customMoods)) {
    const list = state.fragments.filter((f) => f.moods.includes(mood));
    if (!list.length) continue;
    const drawer = el('section', 'mood-drawer');
    const head = el('div', 'mood-drawer-head');
    head.append(el('h2', null, mood));
    head.append(el('span', 'count', `${list.length} 片`));
    drawer.append(head);
    drawer.append(renderScrapGrid(shuffle(list)));
    wall.append(drawer);
  }

  // 兜底：没有氛围的碎片
  const orphans = state.fragments.filter((f) => !f.moods || !f.moods.length);
  if (orphans.length) {
    const drawer = el('section', 'mood-drawer');
    const head = el('div', 'mood-drawer-head');
    head.append(el('h2', null, '未分类'));
    head.append(el('span', 'count', `${orphans.length} 片`));
    drawer.append(head);
    drawer.append(renderScrapGrid(shuffle(orphans)));
    wall.append(drawer);
  }
}

function renderScrapGrid(list) {
  const grid = el('div', 'scrap-grid');
  for (const f of list) grid.append(renderCard(f));
  return grid;
}

function renderCard(f) {
  const card = el('article', 'scrap-card');
  card.style.setProperty('--tilt', `${(Math.random() * 3 - 1.5).toFixed(2)}deg`);
  const theme = moodTheme(f.moods && f.moods[0]);
  card.style.setProperty('--paper', theme.paper);
  card.style.setProperty('--mood-ink', theme.ink);

  if (f.type === 'photo' && f.imageBlob) {
    const img = el('img');
    img.src = URL.createObjectURL(f.imageBlob);
    img.alt = '照片碎片';
    const wrap = el('div', 'scrap-photo');
    wrap.append(img);
    card.append(wrap);
  } else if (f.type === 'text' && f.text) {
    card.append(el('div', 'scrap-text', f.text));
  } else if (f.type === 'voice') {
    const t = f.transcription || '一段语音';
    const shown = t.length > 44 ? t.slice(0, 44) + '…' : t;
    card.append(el('div', 'scrap-voice', `🎵 ${shown}`));
  } else if (f.type === 'link') {
    const t = f.linkTitle || f.link || '一个链接';
    const linkDiv = el('div', 'scrap-link');
    linkDiv.append(document.createTextNode(t));
    if (f.linkDesc) linkDiv.append(el('small', null, f.linkDesc.length > 60 ? f.linkDesc.slice(0, 60) + '…' : f.linkDesc));
    card.append(linkDiv);
  }
  if (f.note) card.append(el('div', 'scrap-note', f.note));

  const meta = el('div', 'scrap-meta');
  meta.append(el('span', 'scrap-mood', (f.moods && f.moods.length ? f.moods.join(' · ') : '未分类')));
  meta.append(el('span', 'scrap-type', TYPE_LABEL[f.type] || f.type));
  card.append(meta);

  card.onclick = () => {
    audio.playClick();
    openSlideShow([f]);
  };
  return card;
}

function playSearch() {
  const q = state.query.trim();
  if (!q) return;
  const results = searchFragments(state.fragments, q);
  if (!results.length) return;
  audio.playClick();
  openSlideShow(results);
}

// ============ 添加碎片 ============
function openAdd() {
  addState.type = 'text';
  addState.photoBlob = null;
  addState.audioBlob = null;
  addState.transcription = '';
  addState.linkTitle = '';
  addState.linkDesc = '';
  addState.selectedMoods = new Set();
  $('#add-text').value = '';
  $('#add-note').value = '';
  $('#add-file').value = '';
  $('#photo-preview-wrap').classList.add('hidden');
  $('#photo-drop-hint').classList.remove('hidden');
  $('#add-link').value = '';
  $('#add-link-title').value = '';
  $('#add-link-desc').value = '';
  $('#link-meta-field').classList.add('hidden');
  $('#link-desc-field').classList.add('hidden');
  $('#add-transcription').value = '';
  $('#transcription-field').classList.add('hidden');
  $('#voice-preview').classList.add('hidden');
  $('#record-timer').classList.add('hidden');
  $('#btn-record').textContent = '● 开始录音';
  $('#btn-record').classList.remove('recording');
  setStatus('#ai-status', '');
  switchAddTab('text');
  $('#add-overlay').classList.remove('hidden');
  audio.playRustle();
}

function switchAddTab(type) {
  addState.type = type;
  document.querySelectorAll('#add-tabs .tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.type === type);
  });
  ['text', 'photo', 'voice', 'link'].forEach((t) => {
    $(`#tab-${t}`).classList.toggle('hidden', t !== type);
  });
  renderMoodChips('#add-mood-chips', addState.selectedMoods);
}

async function onPhotoPicked(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const blob = await compressImage(file);
    addState.photoBlob = blob;
    $('#photo-preview').src = URL.createObjectURL(blob);
    $('#photo-preview-wrap').classList.remove('hidden');
    $('#photo-drop-hint').classList.add('hidden');
    audio.playRustle();
  } catch {
    setStatus('#ai-status', '这张照片读不了，换一张试试', 'err');
  }
}

// ---- 语音 ----
let mediaRecorder = null;
let recordedChunks = [];
let recTimer = null;
let recStart = 0;

function pickMime() {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of cands) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

async function toggleRecord() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('#ai-status', '这个浏览器不支持录音', 'err');
    return;
  }
  const mime = pickMime();
  if (!mime) {
    setStatus('#ai-status', '这个浏览器不支持录音格式', 'err');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(recTimer);
      $('#btn-record').classList.remove('recording');
      $('#btn-record').textContent = '● 开始录音';
      $('#record-timer').classList.add('hidden');
      const blob = new Blob(recordedChunks, { type: mime });
      if (!blob.size) {
        setStatus('#ai-status', '没录到声音，再试一次', 'err');
        return;
      }
      addState.audioBlob = blob;
      const vp = $('#voice-preview');
      vp.src = URL.createObjectURL(blob);
      vp.classList.remove('hidden');
      audio.playChime();
      // 尝试转写
      if (api.isWorkerConfigured(state.settings)) {
        $('#transcription-field').classList.remove('hidden');
        $('#add-transcription').value = 'AI 转写中…';
        const dataUrl = await blobToDataURL(blob);
        const res = await api.transcribeAudio(state.settings, dataUrl, mime);
        if (res.ok && res.text) {
          addState.transcription = res.text;
          $('#add-transcription').value = res.text;
        } else {
          addState.transcription = '';
          $('#add-transcription').value = '';
          $('#add-transcription').placeholder = '（AI 没连上，可手动填写或留空）';
        }
      }
    };
    mediaRecorder.start();
    $('#btn-record').classList.add('recording');
    $('#btn-record').textContent = '■ 停止';
    recStart = Date.now();
    recTimer = setInterval(() => {
      const sec = Math.round((Date.now() - recStart) / 1000);
      $('#record-timer').textContent = formatDuration(sec);
      $('#record-timer').classList.remove('hidden');
    }, 250);
  } catch {
    setStatus('#ai-status', '麦克风被拒绝了', 'err');
  }
}

// ---- 链接 ----
async function onLinkInput() {
  const url = $('#add-link').value.trim();
  if (!/^https?:\/\//.test(url) || !api.isWorkerConfigured(state.settings)) return;
  const res = await api.fetchLink(state.settings, url);
  if (res.ok) {
    addState.linkTitle = res.title;
    addState.linkDesc = res.description;
    if (res.title) {
      $('#add-link-title').value = res.title;
      $('#link-meta-field').classList.remove('hidden');
    }
    if (res.description) {
      $('#add-link-desc').value = res.description;
      $('#link-desc-field').classList.remove('hidden');
    }
  }
}

// ---- AI 猜氛围 ----
async function aiGuess() {
  const payload = {
    type: addState.type,
    text: $('#add-text').value.trim(),
    note: $('#add-note').value.trim(),
    transcription: $('#add-transcription').value.trim(),
    link: $('#add-link').value.trim(),
    linkTitle: $('#add-link-title').value.trim(),
    linkDesc: $('#add-link-desc').value.trim(),
    imageDataUrl: null,
    allowedMoods: getMoods(state.settings.customMoods),
  };
  if (addState.type === 'photo' && addState.photoBlob) {
    try {
      payload.imageDataUrl = await blobToDataURL(addState.photoBlob);
    } catch {}
  }
  if (!api.isWorkerConfigured(state.settings)) {
    setStatus('#ai-status', '还没有配 Worker，先手动选一个氛围吧', 'err');
    return;
  }
  setStatus('#ai-status', '✨ 正在看这片碎片…');
  const res = await api.analyzeMood(state.settings, payload);
  if (res.ok && res.moods.length) {
    addState.selectedMoods = new Set(res.moods);
    renderMoodChips('#add-mood-chips', addState.selectedMoods);
    setStatus('#ai-status', `猜到了：${res.moods.join('、')}（可以再改）`, 'ok');
    audio.playChime();
  } else {
    setStatus('#ai-status', 'AI 没连上，手动选一个吧', 'err');
  }
}

// ---- 氛围 chips ----
function renderMoodChips(containerSel, selectedSet) {
  const container = $(containerSel);
  if (!container) return;
  container.innerHTML = '';
  for (const mood of getMoods(state.settings.customMoods)) {
    const chip = el('button', 'chip' + (selectedSet.has(mood) ? ' selected' : ''), mood);
    chip.type = 'button';
    chip.onclick = () => {
      audio.playClick();
      if (selectedSet.has(mood)) selectedSet.delete(mood);
      else if (selectedSet.size >= 3) return;
      else selectedSet.add(mood);
      renderMoodChips(containerSel, selectedSet);
    };
    container.append(chip);
  }
}

function setStatus(sel, text, kind) {
  const node = $(sel);
  if (!node) return;
  node.textContent = text || '';
  node.className = 'ai-status' + (kind ? ` ${kind}` : '');
}

// ---- 保存 ----
async function saveAdd() {
  const type = addState.type;
  const text = $('#add-text').value.trim();
  const note = $('#add-note').value.trim();

  if (type === 'text' && !text) {
    setStatus('#ai-status', '写点什么再收', 'err');
    return;
  }
  if (type === 'photo' && !addState.photoBlob) {
    setStatus('#ai-status', '先选一张照片', 'err');
    return;
  }
  if (type === 'voice' && !addState.audioBlob) {
    setStatus('#ai-status', '先录一段语音', 'err');
    return;
  }
  const link = type === 'link' ? $('#add-link').value.trim() : '';
  if (type === 'link' && !/^https?:\/\//.test(link)) {
    setStatus('#ai-status', '填一个有效的链接（https://…）', 'err');
    return;
  }

  const moods = normalizeMoods([...addState.selectedMoods], state.settings.customMoods);
  if (!moods.length) {
    setStatus('#ai-status', '选 1–3 个氛围再收', 'err');
    return;
  }

  const f = {
    id: store.newId(),
    type,
    moods,
    text,
    note,
    imageBlob: addState.photoBlob,
    audioBlob: addState.audioBlob,
    transcription: type === 'voice' ? $('#add-transcription').value.trim() : '',
    link: type === 'link' ? link : null,
    linkTitle: addState.linkTitle.trim(),
    linkDesc: addState.linkDesc.trim(),
    createdAt: new Date().toISOString(),
  };
  await store.putFragment(f);
  state.fragments = await store.getAllFragments();
  $('#add-overlay').classList.add('hidden');
  renderWall();
  audio.playRustle();
  audio.playChime();
}

// ============ 设置 ============
function openSettings() {
  $('#set-sound').checked = state.settings.sound;
  $('#set-music').checked = state.settings.music;
  $('#set-worker-url').value = state.settings.workerUrl || '';
  renderCustomMoodChips();
  setStatus('#settings-status', '');
  $('#settings-overlay').classList.remove('hidden');
  audio.playClick();
}

function renderCustomMoodChips() {
  const box = $('#custom-mood-chips');
  box.innerHTML = '';
  const customs = (state.settings.customMoods || []).filter((w) => !BASE_MOODS.includes(w));
  for (const w of customs) {
    const chip = el('span', 'custom-chip', w);
    const rm = el('button', null, '✕');
    rm.onclick = () => {
      state.settings.customMoods = state.settings.customMoods.filter((x) => x !== w);
      store.saveSettings(state.settings);
      renderCustomMoodChips();
      renderWall();
      audio.playClick();
    };
    chip.append(rm);
    box.append(chip);
  }
}

function addCustomMood() {
  const input = $('#set-new-mood');
  const w = input.value.trim();
  if (!w) return;
  if (state.settings.customMoods.includes(w) || BASE_MOODS.includes(w)) {
    setStatus('#settings-status', '这个词已经有了', 'err');
    return;
  }
  state.settings.customMoods = [...(state.settings.customMoods || []), w];
  store.saveSettings(state.settings);
  input.value = '';
  renderCustomMoodChips();
  renderWall();
  setStatus('#settings-status', `已添加「${w}」`, 'ok');
  audio.playChime();
}

async function testWorker() {
  const url = state.settings.workerUrl;
  if (!url) {
    setStatus('#worker-status', '先填 Worker 地址', 'err');
    return;
  }
  setStatus('#worker-status', '测试中…');
  const res = await api.checkHealth(url);
  if (res.ok) {
    setStatus('#worker-status', res.data.configured ? '✓ 连接正常，已配置 AI' : '✓ 连接正常（未配置 API Key）', 'ok');
  } else {
    setStatus('#worker-status', '连不上，检查地址或网络', 'err');
  }
}

async function exportBackup() {
  const backup = await store.exportBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = URL.createObjectURL(blob);
  a.download = `碎片拾荒者备份-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('#settings-status', '已导出备份文件', 'ok');
  audio.playChime();
}

async function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  e.target.value = '';
  const mode = await confirmDialog('导入备份：合并会保留现有碎片（重复的跳过）；覆盖会先清空当前所有碎片。', [
    { label: '合并导入', value: 'merge' },
    { label: '覆盖导入', value: 'overwrite', danger: true },
    { label: '取消', value: null },
  ]);
  if (!mode) return;
  try {
    const res = await store.importBackup(text, mode);
    state.fragments = await store.getAllFragments();
    renderWall();
    setStatus('#settings-status', `已${mode === 'merge' ? '合并' : '覆盖'}导入 ${res.imported} 片碎片`, 'ok');
    audio.playChime();
  } catch {
    setStatus('#settings-status', '备份文件读不了', 'err');
  }
}

async function clearAll() {
  const ok = await confirmDialog('确定清空全部碎片吗？建议先导出一份备份。', [
    { label: '清空', value: true, danger: true },
    { label: '再想想', value: false },
  ]);
  if (!ok) return;
  await store.clearAllFragments();
  state.fragments = [];
  renderWall();
  setStatus('#settings-status', '已清空', 'ok');
}

// ============ 编辑 ============
function openEdit(f) {
  editingId = f.id;
  $('#edit-text').value = f.text || '';
  $('#edit-note').value = f.note || '';
  $('#edit-text-field').style.display = f.type === 'text' ? '' : 'none';
  $('#edit-transcription').value = f.transcription || '';
  $('#edit-trans-field').classList.toggle('hidden', f.type !== 'voice');

  const media = $('#edit-media');
  media.innerHTML = '';
  if (f.type === 'photo' && f.imageBlob) {
    const img = el('img');
    img.src = URL.createObjectURL(f.imageBlob);
    media.append(img);
  } else if (f.type === 'voice' && f.audioBlob) {
    const au = el('audio');
    au.controls = true;
    au.src = URL.createObjectURL(f.audioBlob);
    media.append(au);
  } else if (f.type === 'link') {
    const p = el('p', 'hint', `链接：${f.link}`);
    media.append(p);
  }

  const sel = new Set(f.moods || []);
  renderEditMoodChips(sel);
  $('#edit-overlay').classList.remove('hidden');
  audio.playClick();
}

function renderEditMoodChips(selectedSet) {
  const container = $('#edit-mood-chips');
  container.innerHTML = '';
  for (const mood of getMoods(state.settings.customMoods)) {
    const chip = el('button', 'chip' + (selectedSet.has(mood) ? ' selected' : ''), mood);
    chip.type = 'button';
    chip.onclick = () => {
      audio.playClick();
      if (selectedSet.has(mood)) selectedSet.delete(mood);
      else if (selectedSet.size >= 3) return;
      else selectedSet.add(mood);
      renderEditMoodChips(selectedSet);
    };
    container.append(chip);
  }
}

async function saveEdit() {
  const f = state.fragments.find((x) => x.id === editingId);
  if (!f) return;
  const moods = normalizeMoods(
    [...document.querySelectorAll('#edit-mood-chips .chip.selected')].map((c) => c.textContent),
    state.settings.customMoods
  );
  if (!moods.length) return;
  f.text = $('#edit-text').value.trim();
  f.note = $('#edit-note').value.trim();
  f.transcription = $('#edit-transcription').value.trim();
  f.moods = moods;
  await store.putFragment(f);
  state.fragments = await store.getAllFragments();
  $('#edit-overlay').classList.add('hidden');
  renderWall();
  // 如果正在播放幻灯片，同步当前片
  if (!document.getElementById('slide-overlay').classList.contains('hidden')) {
    const idx = slideList.findIndex((x) => x.id === f.id);
    if (idx >= 0) slideList[idx] = f;
    if (slideList[slideIdx] && slideList[slideIdx].id === f.id) renderSlide();
  }
  audio.playChime();
}

async function deleteEditing() {
  const ok = await confirmDialog('确定删掉这片碎片吗？', [
    { label: '删除', value: true, danger: true },
    { label: '再想想', value: false },
  ]);
  if (!ok) return;
  await store.deleteFragment(editingId);
  state.fragments = await store.getAllFragments();
  $('#edit-overlay').classList.add('hidden');
  renderWall();
  audio.playRustle();
  // 若幻灯片开着，同步移除该片
  if (!document.getElementById('slide-overlay').classList.contains('hidden')) {
    slideList = slideList.filter((x) => x.id !== editingId);
    if (!slideList.length) closeSlide();
    else {
      if (slideIdx >= slideList.length) slideIdx = slideList.length - 1;
      renderSlide();
    }
  }
}

// ============ 幻灯片 ============
function openSlideShow(list, idx = 0) {
  if (!list.length) return;
  slideList = list;
  slideIdx = idx;
  slidePaused = false;
  $('#slide-overlay').classList.remove('hidden');
  $('#slide-overlay').classList.remove('paused');
  renderSlide();
  if (state.settings.music) audio.startMusic();
}

function closeSlide() {
  clearTimeout(slideTimer);
  audio.stopMusic();
  $('#slide-overlay').classList.add('hidden');
}

function renderSlide() {
  const f = slideList[slideIdx];
  if (!f) return;
  const theme = moodTheme(f.moods && f.moods[0]);
  const ov = $('#slide-overlay');
  ov.style.setProperty('--slide-paper', theme.paper);
  ov.style.setProperty('--slide-ink', theme.ink);
  $('#slide-mood').textContent = f.moods && f.moods.length ? f.moods.join(' · ') : '未分类';
  $('#slide-count').textContent = `${slideIdx + 1} / ${slideList.length}`;

  const body = $('#slide-body');
  body.innerHTML = '';

  if (f.type === 'photo' && f.imageBlob) {
    const img = el('img', 'slide-photo');
    img.src = URL.createObjectURL(f.imageBlob);
    img.alt = '照片碎片';
    body.append(img);
  } else if (f.type === 'text' && f.text) {
    body.append(el('p', 'slide-text', f.text));
  } else if (f.type === 'voice') {
    const wrap = el('div', 'slide-voice');
    wrap.append(el('div', 'v-icon', '🎵'));
    wrap.append(el('p', 'v-text', f.transcription || '一段没说出口的语音'));
    if (f.audioBlob) {
      const au = el('audio');
      au.controls = true;
      au.src = URL.createObjectURL(f.audioBlob);
      wrap.append(au);
    }
    body.append(wrap);
  } else if (f.type === 'link') {
    const wrap = el('div', 'slide-link');
    wrap.append(el('div', 'l-icon', '🔗'));
    wrap.append(el('h3', null, f.linkTitle || f.link || ''));
    if (f.linkDesc) wrap.append(el('p', null, f.linkDesc));
    if (f.link) {
      const a = el('a', null, f.link);
      a.href = f.link;
      a.target = '_blank';
      a.rel = 'noreferrer';
      wrap.append(a);
    }
    body.append(wrap);
  }

  if (f.note) body.append(el('p', 'slide-note', f.note));

  $('#btn-playpause').textContent = slidePaused ? '▶' : '⏸';
  startSlideTimer();
}

function startSlideTimer() {
  clearTimeout(slideTimer);
  const bar = $('#slide-progress-bar');
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = '';
  slideTimer = setTimeout(() => {
    if (!slidePaused) nextSlide();
  }, 8000);
}

function nextSlide() {
  slideIdx = slideIdx < slideList.length - 1 ? slideIdx + 1 : 0;
  renderSlide();
}

function prevSlide() {
  slideIdx = slideIdx > 0 ? slideIdx - 1 : slideList.length - 1;
  renderSlide();
}

function togglePause() {
  slidePaused = !slidePaused;
  $('#slide-overlay').classList.toggle('paused', slidePaused);
  $('#btn-playpause').textContent = slidePaused ? '▶' : '⏸';
  if (slidePaused) {
    clearTimeout(slideTimer);
  } else {
    startSlideTimer();
  }
}

function onKeydown(e) {
  if (!$('#slide-overlay').classList.contains('hidden')) {
    if (e.key === 'Escape') closeSlide();
    else if (e.key === 'ArrowRight') nextSlide();
    else if (e.key === 'ArrowLeft') prevSlide();
    else if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      togglePause();
    }
    return;
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay:not(.hidden)').forEach((o) => o.classList.add('hidden'));
  }
}

// ============ 确认框 ============
function confirmDialog(message, buttons) {
  return new Promise((resolve) => {
    $('#confirm-text').textContent = message;
    const foot = $('#confirm-overlay .panel-foot');
    foot.innerHTML = '';
    buttons.forEach((b, i) => {
      const btn = el('button', 'mini-btn' + (b.danger ? ' danger' : ''), b.label);
      btn.id = 'btn-confirm-' + i;
      btn.onclick = () => {
        $('#confirm-overlay').classList.add('hidden');
        resolve(b.value);
      };
      foot.append(btn);
    });
    $('#confirm-overlay').classList.remove('hidden');
  });
}

// 进度条动画（覆盖上面的 transition 定义）
const style = document.createElement('style');
style.textContent = `
  .slide-progress-bar { transition: none; animation: slideProgress 8s linear forwards; }
  @keyframes slideProgress { from { width: 0%; } to { width: 100%; } }
  #slide-overlay.paused .slide-progress-bar { animation-play-state: paused; }
`;
document.head.append(style);

init();
