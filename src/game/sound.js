/**
 * 游戏音频系统
 * - 合成短音效（发牌/翻牌/过牌/弃牌/胜负/全押/提示）：Web Audio 振荡器
 * - 真实采样：筹码下注声（poker_chips.wav）
 * - 背景音乐：菜单 BGM（welcom_bgm.wav）、游戏内 BGM（gaming.mp3），循环 + 淡入淡出
 * 开关：localStorage key "poker_sound_enabled"，摸鱼模式下由调用方静音
 */

const SOUND_KEY = 'poker_sound_enabled';

const AUDIO_SRC = {
  chip: '/audio/poker_chips.wav',
  win: '/audio/win.wav',
  yourturn: '/audio/your_turn.mp3',
  menu: '/audio/welcom_bgm.wav',
  game: '/audio/gaming.mp3',
  // 表情音效
  ewww: '/audio/ewwwww.mp3',
  laugh: '/audio/laugh.mp3',
  ohmygod: '/audio/oh_my_god.mp3',
  ohno: '/audio/oh_no.mp3',
  saywhat: '/audio/say_what.mp3',
  gg: '/audio/GG.mp3',
  nice: '/audio/nice.mp3',
  think: '/audio/think.mp3'
};

// 各 BGM 目标音量（游戏内压低，让牌桌音效穿透）
const MUSIC_VOLUME = {
  menu: 0.35,
  game: 0.20
};

let audioCtx = null;

const getCtx = () => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

export const isSoundEnabled = () => {
  const raw = localStorage.getItem(SOUND_KEY);
  return raw === null ? true : raw === 'true';
};

export const setSoundEnabled = (enabled) => {
  localStorage.setItem(SOUND_KEY, String(enabled));
};

// ============ 合成音效辅助 ============
const tone = (freq, duration, type = 'sine', gainPeak = 0.15, delay = 0) => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
};

const sweep = (freqStart, freqEnd, duration, type = 'sine', gainPeak = 0.15, delay = 0) => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
};

// PLACEHOLDER_SAMPLE_AND_MUSIC

// ============ 采样音效（筹码） ============
const sampleBuffers = {}; // name -> AudioBuffer
const sampleLoading = {};  // name -> Promise

const loadSample = (name, url) => {
  if (sampleBuffers[name]) return Promise.resolve(sampleBuffers[name]);
  if (sampleLoading[name]) return sampleLoading[name];
  const ctx = getCtx();
  if (!ctx) return Promise.resolve(null);
  sampleLoading[name] = fetch(url)
    .then(r => r.arrayBuffer())
    .then(buf => ctx.decodeAudioData(buf))
    .then(decoded => {
      sampleBuffers[name] = decoded;
      return decoded;
    })
    .catch(() => null);
  return sampleLoading[name];
};

const playSample = (name, url, gainPeak = 0.6) => {
  const ctx = getCtx();
  if (!ctx) return;
  const buffer = sampleBuffers[name];
  if (!buffer) {
    // 未加载完则先加载，加载完成后立即播放
    loadSample(name, url).then(loaded => {
      if (loaded) {
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = loaded;
        gain.gain.value = gainPeak;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start();
      }
    });
    return;
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buffer;
  gain.gain.value = gainPeak;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
};

// ============ 背景音乐管理 ============
const musicEls = {}; // key -> HTMLAudioElement
let currentMusic = null;
let musicMuted = false;

const getMusicEl = (key) => {
  if (musicEls[key]) return musicEls[key];
  if (typeof Audio === 'undefined') return null;
  const el = new Audio(AUDIO_SRC[key]);
  el.loop = true;
  el.preload = 'auto';
  el.volume = 0;
  musicEls[key] = el;
  return el;
};

// 简单音量淡变
const fadeTo = (el, target, ms = 600) => {
  if (!el) return;
  const start = el.volume;
  const startT = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - startT) / ms);
    const newVolume = start + (target - start) * t;
    el.volume = Math.max(0, Math.min(1, newVolume)); // 限制在 [0, 1] 范围
    if (t < 1) requestAnimationFrame(step);
    else if (target === 0) el.pause();
  };
  requestAnimationFrame(step);
};

// 切换背景音乐：'menu' | 'game' | null（停止）
export const playMusic = (key) => {
  if (currentMusic === key) return;

  // 淡出旧的
  if (currentMusic && musicEls[currentMusic]) {
    fadeTo(musicEls[currentMusic], 0, 500);
  }
  currentMusic = key;

  if (!key) return;
  if (musicMuted || !isSoundEnabled()) return;

  const el = getMusicEl(key);
  if (!el) return;
  el.currentTime = el.currentTime || 0;
  const target = MUSIC_VOLUME[key] ?? 0.3;
  el.play().then(() => fadeTo(el, target, 700)).catch(() => {
    // 自动播放被拦截：等待首次用户手势后重试
  });
};

// 静音/恢复所有音乐（摸鱼模式 / 设置开关用）
export const setMusicMuted = (muted) => {
  musicMuted = muted;
  if (muted) {
    Object.values(musicEls).forEach(el => fadeTo(el, 0, 300));
  } else if (currentMusic) {
    const el = getMusicEl(currentMusic);
    if (el && isSoundEnabled()) {
      const target = MUSIC_VOLUME[currentMusic] ?? 0.3;
      el.play().then(() => fadeTo(el, target, 500)).catch(() => {});
    }
  }
};

// 首次用户手势解锁音频（浏览器自动播放策略）
let unlocked = false;
export const unlockAudio = () => {
  if (unlocked) return;
  unlocked = true;
  getCtx();
  // 预加载所有采样音效
  loadSample('chip', AUDIO_SRC.chip);
  loadSample('win', AUDIO_SRC.win);
  loadSample('yourturn', AUDIO_SRC.yourturn);
  // 若已有待播放的音乐，重试
  if (currentMusic && !musicMuted && isSoundEnabled()) {
    const el = getMusicEl(currentMusic);
    if (el && el.paused) {
      const target = MUSIC_VOLUME[currentMusic] ?? 0.3;
      el.play().then(() => fadeTo(el, target, 500)).catch(() => {});
    }
  }
};

// PLACEHOLDER_SFX

// ============ 短音效集合 ============
export const sfx = {
  deal: () => tone(420, 0.08, 'triangle', 0.08),          // 发牌：短促轻响
  chip: () => playSample('chip', AUDIO_SRC.chip, 0.7),     // 下注：真实筹码采样
  flip: () => sweep(300, 600, 0.15, 'triangle', 0.1),      // 翻公共牌
  check: () => tone(500, 0.1, 'sine', 0.08),               // 过牌：敲桌
  fold: () => sweep(400, 200, 0.18, 'sine', 0.08),         // 弃牌：下行
  win: () => playSample('win', AUDIO_SRC.win, 0.6),        // 获胜：使用真实音频
  lose: () => sweep(440, 220, 0.4, 'sine', 0.1),           // 失败：低沉下行
  allin: () => {                                           // 全押：戏剧重音
    tone(180, 0.3, 'sawtooth', 0.12);
    sweep(400, 900, 0.3, 'square', 0.08, 0.05);
  },
  click: () => tone(600, 0.04, 'square', 0.05),            // 按钮点击
  yourturn: () => playSample('yourturn', AUDIO_SRC.yourturn, 0.7),  // 轮到你了：使用真实音频
  // 表情音效
  ewww: () => playSample('ewww', AUDIO_SRC.ewww, 0.7),
  laugh: () => playSample('laugh', AUDIO_SRC.laugh, 0.7),
  ohmygod: () => playSample('ohmygod', AUDIO_SRC.ohmygod, 0.7),
  ohno: () => playSample('ohno', AUDIO_SRC.ohno, 0.7),
  saywhat: () => playSample('saywhat', AUDIO_SRC.saywhat, 0.7),
  gg: () => playSample('gg', AUDIO_SRC.gg, 0.7),
  nice: () => playSample('nice', AUDIO_SRC.nice, 0.7),
  think: () => playSample('think', AUDIO_SRC.think, 0.7)
};

// 统一播放入口：尊重静音设置
export const playSound = (name, muted = false) => {
  if (muted || !isSoundEnabled()) return;
  const fn = sfx[name];
  if (fn) {
    try { fn(); } catch { /* ignore */ }
  }
};


