// 声音：全部 Web Audio 合成，离线可用。
// 钢琴曲 = 很慢的 C–G–Am–F 和弦琶音循环；音效 = 轻纸嗒 + 微纸沙。

const NOTE_FREQ = {
  C3: 130.81, 'D#3': 155.56, F3: 174.61, G3: 196.0, A3: 220.0, 'A#3': 233.08,
  C4: 261.63, 'D#4': 311.13, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25,
};

// [低音, 中音三音] —— C–G–Am–F
const CHORDS = [
  ['C3', ['C4', 'E4', 'G4']],
  ['G3', ['B4', 'G4', 'D4']],
  ['A3', ['A4', 'C4', 'E4']],
  ['F3', ['A4', 'C4', 'F4']],
];

function freq(note) {
  const f = NOTE_FREQ[note];
  if (f) return f;
  const m = note.match(/^([A-G]#?)(\d)$/);
  if (!m) return 440;
  const semis = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const midi = (parseInt(m[2], 10) + 1) * 12 + semis[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createAudioEngine() {
  let ctx = null;
  let musicTimer = null;
  let musicGain = null;
  let musicIndex = 0;
  let playing = false;
  let soundOn = true;
  let musicOn = true;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function playTone(freqVal, t, dur, type, vol) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freqVal, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // 轻「纸嗒」点击音
  function playClick() {
    if (!soundOn) return;
    const ac = ensureCtx();
    if (!ac) return;
    try {
      const t = ac.currentTime;
      playTone(1500, t, 0.07, 'triangle', 0.08);
      playTone(900, t + 0.02, 0.06, 'sine', 0.05);
    } catch {}
  }

  // 微「纸沙」声（丢碎片/翻页时）
  function playRustle() {
    if (!soundOn) return;
    const ac = ensureCtx();
    if (!ac) return;
    try {
      const dur = 0.18;
      const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2400;
      filter.Q.value = 0.8;
      const g = ac.createGain();
      g.gain.value = 0.06;
      src.connect(filter).connect(g).connect(ac.destination);
      src.start();
    } catch {}
  }

  function playChime() {
    if (!soundOn) return;
    const ac = ensureCtx();
    if (!ac) return;
    try {
      const t = ac.currentTime;
      playTone(880, t, 0.8, 'sine', 0.05);
      playTone(1320, t + 0.12, 0.7, 'sine', 0.03);
    } catch {}
  }

  // ---- 钢琴循环 ----
  function playChord(chord, when) {
    const [bass, notes] = chord;
    playTone(freq(bass), when, 3.6, 'sine', 0.045);
    notes.forEach((n, i) => {
      playTone(freq(n), when + 0.6 + i * 0.9, 2.8, 'triangle', 0.035);
    });
  }

  function scheduleMusic() {
    if (!playing || !ctx) return;
    const t = ctx.currentTime + 0.1;
    playChord(CHORDS[musicIndex % CHORDS.length], t);
    musicIndex++;
    musicTimer = setTimeout(scheduleMusic, 3500);
  }

  function startMusic() {
    if (!musicOn || playing) return;
    const ac = ensureCtx();
    if (!ac) return;
    playing = true;
    musicIndex = 0;
    scheduleMusic();
  }

  function stopMusic() {
    playing = false;
    if (musicTimer) clearTimeout(musicTimer);
    musicTimer = null;
  }

  function setSound(on) {
    soundOn = on;
    if (!on) stopMusic();
  }

  function setMusic(on) {
    musicOn = on;
    if (!on) stopMusic();
  }

  return { playClick, playRustle, playChime, startMusic, stopMusic, setSound, setMusic, ensureCtx };
}
