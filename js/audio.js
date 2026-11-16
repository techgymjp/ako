// 効果音・声・BGM（WebAudioで合成。音声ファイル不要）
// 合成はゲーム開始前にオフラインで波形へ焼き込み、プレイ中は再生するだけにする
const Synth = {
  ctx: null, master: null, muted: false, noiseBuf: null, wind: null,
  init() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
  },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.8; if (this.muted && 'speechSynthesis' in window) speechSynthesis.cancel(); return this.muted; },
  // ---- 人の声（フォルマント合成による叫び声） ----
  // vowels: 母音の並び、f0: 声の高さ [開始, 終了]
  voice(vowels, dur, f0a, f0b, vol = 0.5, rough = 0.4, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = this.now() + delay;
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0a, t);
    src.frequency.linearRampToValueAtTime(f0a + (f0b - f0a) * 0.3 + 15, t + dur * 0.25);
    src.frequency.exponentialRampToValueAtTime(f0b, t + dur);
    // 声のゆらぎ
    const jit = ctx.createOscillator(); jit.frequency.value = 7 + Math.random() * 4;
    const jg = ctx.createGain(); jg.gain.value = f0a * 0.03; jit.connect(jg); jg.connect(src.frequency);
    // 叫びの荒れ（歪み）
    const sh = ctx.createWaveShaper(); sh.curve = this.shoutCurve || (this.shoutCurve = (() => { const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 3); } return c; })());
    const pre = ctx.createGain(); pre.gain.value = 0.6 + rough;
    src.connect(pre); pre.connect(sh);
    // 息の成分
    const nz = ctx.createBufferSource(); nz.buffer = this.noiseBuf;
    const nzg = ctx.createGain(); nzg.gain.value = 0.25 + rough * 0.4;
    nz.connect(nzg);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    out.gain.setValueAtTime(vol, t + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // 3つのフォルマント
    const V = { a: [750, 1200, 2600], i: [300, 2200, 3000], u: [330, 1300, 2400], e: [500, 1850, 2550], o: [520, 880, 2500], n: [280, 1000, 2300] };
    const amps = [1, 0.55, 0.25];
    for (let k = 0; k < 3; k++) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = k === 0 ? 6 : 9;
      vowels.split('').forEach((vw, i) => {
        const tt = t + dur * (vowels.length === 1 ? 0 : i / (vowels.length - 1)) * 0.75;
        if (i === 0) bp.frequency.setValueAtTime(V[vw][k], tt); else bp.frequency.linearRampToValueAtTime(V[vw][k], tt);
      });
      const g = ctx.createGain(); g.gain.value = amps[k] * 2.2;
      sh.connect(bp); nzg.connect(bp); bp.connect(g); g.connect(out);
    }
    out.connect(this.master);
    src.start(t); jit.start(t); nz.start(t, Math.random());
    src.stop(t + dur + 0.05); jit.stop(t + dur + 0.05); nz.stop(t + dur + 0.05);
  },
  // 掛け声（大石）
  kiai(strong) {
    const v = [['ei', 0.26, 170, 210], ['ia', 0.3, 160, 190], ['ea', 0.28, 175, 150], ['ou', 0.24, 150, 180]][Math.floor(Math.random() * 4)];
    this.voice(v[0], strong ? v[1] + 0.12 : v[1], v[2], v[3], strong ? 0.6 : 0.42, strong ? 0.7 : 0.45);
  },
  // 斬られた悲鳴
  cry(old) {
    const r = Math.random();
    if (old) { this.voice('ia', 0.7, 260, 180, 0.45, 0.6); return; }
    const v = r < 0.33 ? ['ua', 0.55, 190, 95] : r < 0.66 ? ['oa', 0.5, 210, 100] : ['ao', 0.45, 175, 90];
    this.voice(v[0], v[1] * (0.9 + Math.random() * 0.3), v[2] * (0.85 + Math.random() * 0.3), v[3], 0.5, 0.75);
  },
  // 斬りかかる敵の怒声
  roar() {
    const v = Math.random() < 0.5 ? ['oa', 0.42, 130, 175] : ['ia', 0.38, 140, 185];
    this.voice(v[0], v[1], v[2] * (0.9 + Math.random() * 0.2), v[3], 0.4, 0.8);
  },
  groan() { this.voice('uo', 0.9, 140, 70, 0.45, 0.6); },
  // 台詞（ブラウザの日本語音声合成）
  say(text, { pitch = 0.6, rate = 1.15, volume = 1 } = {}) {
    if (this.muted || !('speechSynthesis' in window)) return;
    try {
      const ss = window.speechSynthesis;
      const voices = ss.getVoices();
      const ja = voices.filter((v) => /^ja/i.test(v.lang));
      if (!ja.length) return;
      const male = ja.find((v) => /otoya|ichiro|keita|male|男/i.test(v.name)) || ja[0];
      ss.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP'; u.voice = male; u.pitch = pitch; u.rate = rate; u.volume = volume;
      ss.speak(u);
    } catch (e) { /* 音声合成なし */ }
  },
  now() { return this.ctx.currentTime; },
  noise(dur, freq, q, gain, delay = 0, type = 'bandpass', sweepTo = null) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  },
  tone(freq, dur, type, gain, delay = 0, slideTo = null) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  swing() { this.noise(0.18, 900, 1.5, 0.35, 0, 'bandpass', 3800); },
  cut(k = 1) { this.noise(0.12, 2500, 0.8, 0.5 * k); this.tone(140, 0.18, 'triangle', 0.35 * k, 0, 50); this.noise(0.3, 400, 0.7, 0.25 * k, 0.03, 'lowpass'); },
  clang(k = 1) {
    this.tone(1850, 0.5, 'triangle', 0.22 * k); this.tone(2730, 0.35, 'sine', 0.12 * k); this.tone(4100, 0.25, 'sine', 0.06 * k);
    this.noise(0.06, 5000, 1, 0.3 * k);
  },
  clatter() { this.tone(2400, 0.18, 'triangle', 0.08); this.tone(3700, 0.12, 'sine', 0.05, 0.03); this.noise(0.05, 4000, 2, 0.12); this.tone(2100, 0.12, 'triangle', 0.05, 0.12); },
  // 斬り伏せた音：空気を裂く音＋刃鳴り＋重い手応え
  slay() {
    this.noise(0.09, 7000, 0.7, 0.55, 0, 'highpass');
    this.noise(0.16, 1800, 1.2, 0.45, 0, 'bandpass', 5200);
    this.tone(3150, 0.75, 'sine', 0.09, 0.015); this.tone(4730, 0.55, 'sine', 0.06, 0.015); this.tone(6290, 0.35, 'sine', 0.035, 0.015);
    this.tone(95, 0.22, 'sine', 0.7, 0.01, 45); this.noise(0.18, 300, 0.8, 0.45, 0.01, 'lowpass');
  },
  // 連斬の響き（再生速度で音程を上げる）
  chime() { this.tone(1320, 0.4, 'sine', 0.12); this.tone(1980, 0.35, 'sine', 0.08, 0.01); this.tone(2640, 0.25, 'triangle', 0.04, 0.02); },
  // 納刀「チャキン」
  noto() {
    this.noise(0.22, 2500, 2, 0.12, 0, 'bandpass', 4200);
    this.tone(2650, 0.12, 'triangle', 0.16, 0.24); this.tone(5300, 0.1, 'sine', 0.08, 0.24); this.noise(0.03, 6000, 1, 0.25, 0.24, 'highpass');
  },
  // 決着の大太鼓
  boom() { this.tone(70, 1.1, 'sine', 1.0, 0, 34); this.noise(0.3, 180, 0.7, 0.6, 0, 'lowpass'); },
  shing() { this.tone(3000, 0.35, 'sine', 0.06, 0, 4200); this.noise(0.3, 6000, 4, 0.08, 0, 'bandpass', 9000); },
  drum(delay = 0) {
    this.tone(85, 0.7, 'sine', 0.9, delay, 42);
    this.noise(0.18, 220, 0.8, 0.5, delay, 'lowpass');
  },
  shout() { this.noise(0.45, 600, 3, 0.18, 0, 'bandpass', 380); this.tone(180, 0.4, 'sawtooth', 0.04, 0, 140); },
  gameover() { this.tone(220, 1.6, 'sine', 0.25, 0.2, 110); this.tone(330, 1.6, 'sine', 0.12, 0.2, 165); },
  windStart() {
    if (!this.ctx || this.wind) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = this.ctx.createGain(); g.gain.value = 0.06;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.wind = { src, f, g };
  },
  update(G) {
    if (!this.wind) return;
    this.wind.f.frequency.value = 300 + Math.sin(G.t * 0.3) * 120 + Math.sin(G.t * 1.1) * 40;
  },
};

// =====================================================================
// BGM（和楽器を合成：尺八・箏・和太鼓・締太鼓。都節音階）
// =====================================================================
const BASE = 146.83; // D3
const SCALE = [0, 1, 5, 7, 8]; // 都節音階 D Eb G A Bb
const fq = (deg, oct = 0) => BASE * Math.pow(2, (SCALE[((deg % 5) + 5) % 5] + 12 * (Math.floor(deg / 5) + oct)) / 12);

// 曲データ：stepは16分音符。melodyは [step, 音度, 長さ(step)]
const TRACKS = {
  title: {
    bpm: 60, bars: 4, drone: [0, 3], droneVol: 0.05,
    koto: { pat: [[0, 0], [6, 3], [8, 4], [12, 3]], oct: 1, vol: 0.12, everyBar: [0, 2] },
    shaku: [[0, 7, 10], [12, 8, 4], [16, 7, 8], [24, 6, 8], [32, 5, 6], [38, 6, 2], [40, 7, 14], [56, 4, 6]],
    shakuOct: 0, taiko: [[0, 0.5]], taikoEvery: 2,
  },
  walk: {
    bpm: 96, bars: 4, drone: [0], droneVol: 0.05,
    koto: { pat: [[0, 0], [2, 3], [4, 4], [6, 3], [8, 0], [10, 3], [12, 2], [14, 1]], oct: 0, vol: 0.13 },
    shaku: [[0, 8, 6], [8, 7, 6], [16, 6, 12], [32, 8, 4], [36, 9, 4], [40, 8, 8], [48, 7, 12]],
    shakuOct: 0, taiko: [[0, 0.8], [8, 0.4]], shime: [4, 12], shimeVol: 0.12,
  },
  fight: {
    bpm: 140, bars: 2, drone: [0, 3], droneVol: 0.06,
    koto: { pat: [[0, 0], [1, 3], [2, 5], [3, 3], [4, 4], [5, 3], [6, 5], [7, 3], [8, 0], [9, 3], [10, 5], [11, 3], [12, 7], [13, 6], [14, 5], [15, 3]], oct: 0, vol: 0.1 },
    shaku: [[0, 10, 3], [4, 9, 2], [6, 8, 6], [16, 10, 3], [20, 11, 2], [22, 10, 8]],
    shakuOct: 0, taiko: [[0, 1], [3, 0.6], [4, 0.9], [8, 1], [11, 0.6], [12, 0.9], [14, 0.7]],
    shime: [0, 2, 4, 6, 8, 10, 12, 14], shimeVol: 0.1,
  },
  kira: {
    bpm: 70, bars: 2, drone: [0, 1], droneVol: 0.09,
    koto: { pat: [[0, 5], [8, 6]], oct: 0, vol: 0.12 },
    shaku: [[0, 11, 14], [16, 10, 14]], shakuOct: 0, taiko: [[0, 1], [8, 0.7]],
  },
  win: {
    bpm: 84, bars: 4, drone: [0, 2], droneVol: 0.05,
    koto: { pat: [[0, 0], [1, 2], [2, 3], [3, 5], [4, 7], [8, 5], [10, 3], [12, 2]], oct: 0, vol: 0.12 },
    shaku: [[0, 7, 8], [8, 8, 4], [12, 7, 4], [16, 5, 12], [32, 7, 6], [38, 8, 2], [40, 10, 16], [56, 7, 8]],
    shakuOct: 0, taiko: [[0, 1], [6, 0.5], [8, 0.8], [12, 0.5]],
  },
  dead: {
    bpm: 50, bars: 4, drone: [0], droneVol: 0.05,
    shaku: [[4, 5, 8], [12, 4, 4], [16, 3, 16], [36, 1, 6], [42, 0, 18]], shakuOct: 0,
  },
};

const MusicSynth = {
  cur: null, next: null, step: 0, nextTime: 0, timer: null, bus: null, droneNodes: [],
  play(sfx, name) {
    if (!sfx.ctx || name === this.cur || !TRACKS[name]) return;
    this.sfx = sfx;
    const ctx = sfx.ctx;
    if (!this.bus) {
      this.bus = ctx.createGain(); this.bus.gain.value = 0.55;
      // 簡易リバーブ（遅延の帰還）
      const d = ctx.createDelay(1); d.delayTime.value = 0.23;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      this.bus.connect(sfx.master);
      this.bus.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(sfx.master);
    }
    const now = ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(0.0001, now + 0.35);
    this.bus.gain.linearRampToValueAtTime(0.55, now + 0.9);
    this.stopDrone(now + 0.35);
    this.cur = name;
    this.step = 0;
    this.nextTime = now + 0.4;
    this.startDrone(TRACKS[name], now + 0.4);
    if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
  },
  startDrone(tr, t) {
    const ctx = this.sfx.ctx;
    for (const deg of tr.drone || []) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = fq(deg, -1); o.detune.value = det;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(tr.droneVol, t + 1.5);
        o.connect(f); f.connect(g); g.connect(this.bus);
        o.start(t);
        this.droneNodes.push({ o, g });
      }
    }
  },
  stopDrone(t) {
    for (const { o, g } of this.droneNodes) {
      g.gain.cancelScheduledValues(t - 0.3); g.gain.setTargetAtTime(0.0001, t - 0.3, 0.1);
      o.stop(t + 0.5);
    }
    this.droneNodes = [];
  },
  tick() {
    const sfx = this.sfx;
    if (!sfx || !sfx.ctx || !this.cur) return;
    const ctx = sfx.ctx;
    const tr = TRACKS[this.cur];
    const spb = 60 / tr.bpm / 4; // 16分音符の長さ
    const total = tr.bars * 16;
    while (this.nextTime < ctx.currentTime + 0.12) this.scheduleStep(tr, spb, total);
  },
  scheduleStep(tr, spb, total) {
    {
      const st = this.step % total, t = this.nextTime;
      const inBar = st % 16, bar = Math.floor(st / 16);
      if (tr.koto && (!tr.koto.everyBar || tr.koto.everyBar.includes(bar))) {
        for (const [s, deg] of tr.koto.pat) if (s === inBar) this.koto(fq(deg, tr.koto.oct), t, tr.koto.vol);
      }
      if (tr.taiko && (!tr.taikoEvery || bar % tr.taikoEvery === 0)) {
        for (const [s, v] of tr.taiko) if (s === inBar) this.taiko(t, v);
      }
      if (tr.shime && tr.shime.includes(inBar)) this.shime(t, tr.shimeVol * (inBar % 4 === 0 ? 1.4 : 1));
      if (tr.shaku) for (const [s, deg, len] of tr.shaku) if (s === st) this.shakuhachi(fq(deg, tr.shakuOct), t, len * spb);
      this.nextTime += spb;
      this.step++;
    }
  },
  // 箏：撥弦（鋭い立ち上がりと減衰、わずかな音程の揺れ）
  koto(f, t, vol) {
    const ctx = this.sfx.ctx;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'triangle'; o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(f * 1.01, t); o1.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    o2.frequency.value = f * 2.003;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass';
    f2.frequency.setValueAtTime(f * 9, t); f2.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o1.connect(f2); o2.connect(g2); g2.connect(f2); f2.connect(g); g.connect(this.bus);
    o1.start(t); o2.start(t); o1.stop(t + 1.4); o2.stop(t + 1.4);
  },
  // 尺八：息の音＋ゆっくり立ち上がる音、ビブラートと「メリ」からの持ち上げ
  shakuhachi(f, t, dur) {
    const ctx = this.sfx.ctx, sfx = this.sfx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.18);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + dur * 0.6);
    vib.connect(vg); vg.connect(o.frequency);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2; // 倍音
    const g2 = ctx.createGain(); g2.gain.value = 0.08;
    const g = ctx.createGain();
    const peak = 0.11, end = t + dur;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.12);
    g.gain.setValueAtTime(peak, Math.max(t + 0.12, end - 0.25)); g.gain.linearRampToValueAtTime(0.0001, end + 0.15);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.bus);
    // 息の音
    const n = ctx.createBufferSource(); n.buffer = sfx.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.09, t + 0.06); ng.gain.linearRampToValueAtTime(0.025, t + 0.3); ng.gain.linearRampToValueAtTime(0.0001, end + 0.15);
    n.connect(bp); bp.connect(ng); ng.connect(this.bus);
    for (const x of [o, o2, vib]) { x.start(t); x.stop(end + 0.2); }
    n.start(t, Math.random()); n.stop(end + 0.2);
  },
  // 和太鼓（大太鼓）
  taiko(t, v) {
    const ctx = this.sfx.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.75 * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.75);
    const n = ctx.createBufferSource(); n.buffer = this.sfx.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.004); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(lp); lp.connect(ng); ng.connect(this.bus); n.start(t, Math.random()); n.stop(t + 0.15);
  },
  // 締太鼓
  shime(t, v) {
    const ctx = this.sfx.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.05);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.1);
    const n = ctx.createBufferSource(); n.buffer = this.sfx.noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(v * 0.6, t + 0.002); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    n.connect(hp); hp.connect(ng); ng.connect(this.bus); n.start(t, Math.random()); n.stop(t + 0.05);
  },
};


// =====================================================================
// 焼き込み（OfflineAudioContext）
// =====================================================================
const SR = 44100;
function noiseBuffer(ctx) {
  const len = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
async function renderSfx(dur, fn) {
  const off = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
  const A = Object.create(Synth);
  A.ctx = off; A.master = off.destination; A.noiseBuf = noiseBuffer(off); A.muted = false; A.now = () => 0.005;
  fn(A);
  return off.startRendering();
}
// BGM：一周分＋つなぎ目の分を書き出し、頭と尻をクロスフェードして継ぎ目のないループにする
async function renderTrack(name) {
  const tr = TRACKS[name];
  const spb = 60 / tr.bpm / 4, total = tr.bars * 16, L = total * spb, X = 0.6;
  const off = new OfflineAudioContext(1, Math.ceil((L + X) * SR), SR);
  const A = Object.create(Synth);
  A.ctx = off; A.noiseBuf = noiseBuffer(off); A.muted = false;
  const M = Object.create(MusicSynth);
  M.sfx = A; M.droneNodes = [];
  M.bus = off.createGain(); M.bus.gain.value = 1;
  const d = off.createDelay(1); d.delayTime.value = 0.23;
  const fb = off.createGain(); fb.gain.value = 0.32;
  const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  M.bus.connect(off.destination); M.bus.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(off.destination);
  // 持続音（ドローン）は最初から鳴らしておく
  for (const deg of tr.drone || []) for (const det of [-4, 4]) {
    const o = off.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fq(deg, -1); o.detune.value = det;
    const f = off.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = off.createGain(); g.gain.value = tr.droneVol;
    o.connect(f); f.connect(g); g.connect(M.bus); o.start(0);
  }
  M.step = 0; M.nextTime = 0.005;
  while (M.nextTime < L + X) M.scheduleStep(tr, spb, total);
  const buf = await off.startRendering();
  const src = buf.getChannelData(0);
  const nL = Math.floor(L * SR), nX = Math.floor(X * SR);
  const out = new AudioBuffer({ length: nL, numberOfChannels: 1, sampleRate: SR });
  const o = out.getChannelData(0);
  o.set(src.subarray(0, nL));
  for (let i = 0; i < nX; i++) { const w = i / nX; o[i] = src[i] * w + src[nL + i] * (1 - w); }
  return out;
}
async function renderWind() {
  const dur = 6, X = 0.8;
  const off = new OfflineAudioContext(1, Math.ceil((dur + X) * SR), SR);
  const n = off.createBufferSource(); n.buffer = noiseBuffer(off); n.loop = true;
  const f = off.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(260, 0); f.frequency.linearRampToValueAtTime(420, 2.2); f.frequency.linearRampToValueAtTime(300, 4.5); f.frequency.linearRampToValueAtTime(260, dur);
  f.frequency.linearRampToValueAtTime(420, dur + 2.2);
  const g = off.createGain(); g.gain.value = 0.5;
  n.connect(f); f.connect(g); g.connect(off.destination); n.start(0);
  const buf = await off.startRendering();
  const src = buf.getChannelData(0), nL = Math.floor(dur * SR), nX = Math.floor(X * SR);
  const out = new AudioBuffer({ length: nL, numberOfChannels: 1, sampleRate: SR });
  const o = out.getChannelData(0);
  o.set(src.subarray(0, nL));
  for (let i = 0; i < nX; i++) { const w = i / nX; o[i] = src[i] * w + src[nL + i] * (1 - w); }
  return out;
}

// 焼き込む音の一覧：[名前, 長さ(秒), 合成方法, バリエーション数]
const BAKE = [
  ['swing', 0.3, (A) => A.swing(), 2],
  ['cut', 0.5, (A) => A.cut(1), 2],
  ['cutSoft', 0.5, (A) => A.cut(0.55), 1],
  ['clang', 0.7, (A) => A.clang(1), 2],
  ['clangSoft', 0.7, (A) => A.clang(0.4), 1],
  ['clatter', 0.35, (A) => A.clatter(), 1],
  ['shing', 0.45, (A) => A.shing(), 1],
  ['slay', 0.9, (A) => A.slay(), 2],
  ['chime', 0.5, (A) => A.chime(), 1],
  ['noto', 0.5, (A) => A.noto(), 1],
  ['boom', 1.2, (A) => A.boom(), 1],
  ['drum', 0.85, (A) => A.drum(0), 1],
  ['shout', 0.55, (A) => A.shout(), 1],
  ['gameover', 2.0, (A) => A.gameover(), 1],
  ['kiai', 0.5, (A) => A.kiai(false), 5],
  ['kiaiStrong', 0.6, (A) => A.kiai(true), 3],
  ['cry', 0.85, (A) => A.cry(false), 5],
  ['cryOld', 0.85, (A) => A.cry(true), 1],
  ['roar', 0.55, (A) => A.roar(), 3],
  ['growl', 0.6, (A) => A.voice('oa', 0.5, 125, 160, 0.3, 0.7), 2],
  ['bossRoar', 0.8, (A) => A.voice('ao', 0.7, 110, 150, 0.45, 0.8), 1],
  ['groan', 1.0, (A) => A.groan(), 1],
];
const TRACK_NAMES = Object.keys(TRACKS);

// =====================================================================
// 再生（プレイ中はバッファを鳴らすだけ）
// =====================================================================
export const Sfx = {
  ctx: null, master: null, musicBus: null, muted: false, bufs: {}, tracks: {}, ready: false,
  active: 0, MAX_VOICES: 14, curMusic: null, musicSrc: null, musicGain: null, windSrc: null,

  // 読み込み画面で呼ぶ。onProgress(0..1)
  async preload(onProgress = () => {}) {
    if (this.ready) return;
    if (typeof OfflineAudioContext === 'undefined') { this.ready = true; return; }
    const jobs = [];
    for (const [name, dur, fn, n] of BAKE) for (let i = 0; i < n; i++) jobs.push(['s', name, dur, fn]);
    // 最初に必要な曲だけ先に作り、残りはタイトル表示後に裏で作る
    const first = ['title', 'walk', 'fight'];
    for (const name of first) jobs.push(['m', name]);
    jobs.push(['w']);
    let done = 0;
    // 端末に負担をかけないよう少しずつ順番に
    for (const j of jobs) {
      try {
        if (j[0] === 's') (this.bufs[j[1]] ||= []).push(await renderSfx(j[2], j[3]));
        else if (j[0] === 'm') this.tracks[j[1]] = await renderTrack(j[1]);
        else this.windBuf = await renderWind();
      } catch (e) { console.warn('audio bake failed', j[1], e); }
      onProgress(++done / jobs.length);
    }
    this.ready = true;
    (async () => {
      for (const name of TRACK_NAMES) if (!this.tracks[name]) {
        try { this.tracks[name] = await renderTrack(name); } catch (e) { console.warn('audio bake failed', name, e); }
      }
    })();
  },

  init() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        // 音割れ防止のリミッター
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.2;
        comp.connect(this.ctx.destination);
        this.master = this.ctx.createGain(); this.master.gain.value = 0.75; this.master.connect(comp);
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.45; this.musicBus.connect(this.master);
      } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
  },
  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.75;
    if (this.muted && 'speechSynthesis' in window) speechSynthesis.cancel();
    return this.muted;
  },

  play(name, { vol = 1, delay = 0, rate = 1, vary = 0.06 } = {}) {
    if (!this.ctx || this.muted) return;
    const list = this.bufs[name];
    if (!list || !list.length) return;
    if (this.active >= this.MAX_VOICES) return; // 同時発音数の上限
    const src = this.ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    let node = src;
    if (vol !== 1) { const g = this.ctx.createGain(); g.gain.value = vol; src.connect(g); node = g; }
    node.connect(this.master);
    this.active++;
    src.onended = () => { this.active--; };
    src.start(this.ctx.currentTime + delay);
  },

  swing() { this.play('swing', { vary: 0.1 }); },
  cut(k = 1) { this.play(k < 0.8 ? 'cutSoft' : 'cut'); },
  clang(k = 1) { this.play(k < 0.7 ? 'clangSoft' : 'clang', { vary: 0.04 }); },
  clatter() { this.play('clatter', { vary: 0.15 }); },
  shing() { this.play('shing'); },
  slay() { this.play('slay', { vary: 0.05 }); },
  chime(n) { this.play('chime', { rate: Math.pow(2, Math.min(5, n - 1) * 2 / 12), vary: 0 }); },
  noto() { this.play('noto', { delay: 0.25, vary: 0.02 }); },
  boom() { this.play('boom', { vary: 0 }); },
  drum(delay = 0) { this.play('drum', { delay, vary: 0.02 }); },
  shout() { this.play('shout'); },
  gameover() { this.play('gameover', { vary: 0 }); },
  kiai(strong) { this.play(strong ? 'kiaiStrong' : 'kiai', { vary: 0.05 }); },
  cry(old) { this.play(old ? 'cryOld' : 'cry', { vary: 0.08 }); },
  roar() { this.play('roar'); },
  growl() { this.play('growl', { delay: 0.1 }); },
  bossRoar() { this.play('bossRoar', { delay: 0.3 }); },
  groan() { this.play('groan', { vary: 0 }); },

  windStart() {
    if (!this.ctx || this.windSrc || !this.windBuf) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.windBuf; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0.12;
    src.connect(g); g.connect(this.master); src.start();
    this.windSrc = src;
  },
  update() {},

  // BGM：焼き込んだループを切り替える（0.6秒のクロスフェード）
  music(name) {
    if (!name || !this.ctx || name === this.curMusic || !this.tracks[name]) return;
    this.curMusic = name;
    const now = this.ctx.currentTime;
    if (this.musicSrc) {
      const { src, g } = this.musicSrc;
      g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + 0.6);
      src.stop(now + 0.7);
    }
    const src = this.ctx.createBufferSource(); src.buffer = this.tracks[name]; src.loop = true;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + 0.6);
    src.connect(g); g.connect(this.musicBus); src.start(now);
    this.musicSrc = { src, g };
  },

  // 台詞（ブラウザの日本語音声合成）
  say(text, opts) { Synth.say.call(this, text, opts); },
};
