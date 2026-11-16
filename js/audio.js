// 効果音（WebAudioで合成。音声ファイル不要）
export const Sfx = {
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
  },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.8; return this.muted; },
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
