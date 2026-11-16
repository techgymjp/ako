// 手続き生成テクスチャ（外部画像を使わずにCanvasで描く）
import * as THREE from 'three';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map();
function make(key, w, h, draw, { srgb = true, repeat = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

function noise(g, w, h, n, color, alpha, size, seed = 1) {
  const r = mulberry32(seed);
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * r();
    const s = size * (0.5 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

// 障子（幅1.8m×高さ2.7mで1枚分。上に長押、下に腰板）
export const shojiTex = () => make('shoji', 256, 384, (g, w, h) => {
  g.fillStyle = '#4a3423'; g.fillRect(0, 0, w, h);
  const top = 40, bottom = h - 70;
  // 和紙
  const grd = g.createLinearGradient(0, top, 0, bottom);
  grd.addColorStop(0, '#efe8d6'); grd.addColorStop(1, '#e2d8bf');
  g.fillStyle = grd; g.fillRect(6, top, w - 12, bottom - top);
  noise(g, w, h, 900, '#b9ab8a', 0.25, 2, 3);
  g.fillStyle = '#4a3423'; g.fillRect(0, 0, w, top); g.fillRect(0, bottom, w, h - bottom);
  // 組子
  g.strokeStyle = '#5b412b'; g.lineWidth = 3;
  for (let i = 1; i < 4; i++) { const x = 6 + (w - 12) * i / 4; g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke(); }
  for (let j = 1; j < 7; j++) { const y = top + (bottom - top) * j / 7; g.beginPath(); g.moveTo(6, y); g.lineTo(w - 6, y); g.stroke(); }
  // 中央の框
  g.lineWidth = 7; g.beginPath(); g.moveTo(w / 2, top); g.lineTo(w / 2, bottom); g.stroke();
  g.lineWidth = 8; g.strokeRect(4, top, w - 8, bottom - top);
  // 腰板の木目
  g.strokeStyle = '#3a281a'; g.lineWidth = 1;
  for (let y = bottom + 6; y < h; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
});

// 雨戸（外壁の夜の戸締まり）
export const amadoTex = () => make('amado', 256, 384, (g, w, h) => {
  g.fillStyle = '#3d2c1f'; g.fillRect(0, 0, w, h);
  const r = mulberry32(7);
  for (let x = 0; x < w; x += 32) {
    g.fillStyle = `rgb(${55 + r() * 18},${40 + r() * 12},${28 + r() * 8})`;
    g.fillRect(x + 1, 30, 30, h - 60);
    g.strokeStyle = 'rgba(0,0,0,.35)';
    for (let i = 0; i < 12; i++) { g.beginPath(); const xx = x + 3 + r() * 26; g.moveTo(xx, 30); g.bezierCurveTo(xx + 4, h * 0.4, xx - 4, h * 0.6, xx + r() * 4, h - 30); g.stroke(); }
  }
  g.fillStyle = '#21170f'; g.fillRect(0, 0, w, 30); g.fillRect(0, h - 30, w, 30);
  for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 6, h);
});

// 漆喰壁（長屋・土蔵・塀）。下部は焼杉の下見板
export const plasterTex = () => make('plaster', 256, 256, (g, w, h) => {
  g.fillStyle = '#e4e1d8'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 1500, '#9a958a', 0.18, 3, 11);
  const b = h * 0.62;
  g.fillStyle = '#231c17'; g.fillRect(0, b, w, h - b);
  g.strokeStyle = '#3a2f27'; g.lineWidth = 2;
  for (let y = b + 10; y < h; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = '#16110d';
  for (let x = 0; x < w; x += 64) g.fillRect(x, b, 5, h - b);
  g.fillStyle = '#4b3a2c'; g.fillRect(0, b - 6, w, 6);
});

export const tatamiTex = () => make('tatami', 128, 256, (g, w, h) => {
  g.fillStyle = '#b8ad73'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 2) {
    g.fillStyle = `rgba(${100 + Math.random() * 60},${100 + Math.random() * 50},40,0.25)`;
    g.fillRect(x, 0, 1, h);
  }
  noise(g, w, h, 400, '#6e6638', 0.25, 2, 5);
  g.fillStyle = '#26301f'; g.fillRect(0, 0, 9, h); g.fillRect(w - 9, 0, 9, h);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2);
});

export const woodFloorTex = () => make('woodfloor', 256, 256, (g, w, h) => {
  const r = mulberry32(21);
  for (let y = 0; y < h; y += 32) {
    g.fillStyle = `rgb(${92 + r() * 20},${64 + r() * 14},${40 + r() * 10})`;
    g.fillRect(0, y, w, 32);
    g.strokeStyle = 'rgba(30,18,10,.35)';
    for (let i = 0; i < 6; i++) { g.beginPath(); const yy = y + 4 + r() * 24; g.moveTo(0, yy); g.bezierCurveTo(w * .3, yy + 3, w * .6, yy - 3, w, yy + r() * 2); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, y, w, 1.5);
  }
});

export const ceilingTex = () => make('ceiling', 256, 256, (g, w, h) => {
  g.fillStyle = '#3b2a1d'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2a1d13';
  for (let x = 0; x < w; x += 42) g.fillRect(x, 0, 6, h);
  noise(g, w, h, 300, '#000', 0.3, 3, 9);
});

export const earthTex = () => make('earth', 256, 256, (g, w, h) => {
  g.fillStyle = '#5b4c3e'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 3000, '#2f261d', 0.35, 3, 13);
  noise(g, w, h, 800, '#8a7764', 0.3, 2, 14);
});

export const snowTex = () => make('snow', 512, 512, (g, w, h) => {
  g.fillStyle = '#d9e0ea'; g.fillRect(0, 0, w, h);
  const r = mulberry32(31);
  for (let i = 0; i < 60; i++) {
    const x = r() * w, y = r() * h, rad = 30 + r() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(160,175,200,.18)'); grd.addColorStop(1, 'rgba(160,175,200,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  noise(g, w, h, 5000, '#ffffff', 0.6, 1.5, 32);
  noise(g, w, h, 2000, '#9aa8bd', 0.25, 1.5, 33);
});

export const snowBump = () => make('snowbump', 256, 256, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 4000, '#ffffff', 0.5, 3, 41);
  noise(g, w, h, 4000, '#000000', 0.5, 3, 42);
}, { srgb: false });

export const stoneTex = () => make('stone', 128, 128, (g, w, h) => {
  g.fillStyle = '#6d6c68'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 1500, '#3b3a38', 0.4, 2, 51);
  noise(g, w, h, 600, '#a19f98', 0.3, 2, 52);
});

export const barkTex = () => make('bark', 64, 256, (g, w, h) => {
  g.fillStyle = '#3a2a20'; g.fillRect(0, 0, w, h);
  const r = mulberry32(61);
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(${20 + r() * 40},${15 + r() * 25},${10 + r() * 15},.8)`; g.fillRect(r() * w, r() * h, 4 + r() * 10, 6 + r() * 14); }
});

export const strawTex = () => make('straw', 128, 128, (g, w, h) => {
  g.fillStyle = '#7b6439'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(40,30,10,.5)';
  for (let x = 0; x < w; x += 3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + Math.random() * 4 - 2, h); g.stroke(); }
  g.fillStyle = '#3c2f18'; g.fillRect(0, 30, w, 6); g.fillRect(0, 92, w, 6);
});

// ===== 衣装 =====
// 赤穂浪士の火事装束：黒地に白の山形（だんだら）
export const dandaraTex = () => make('dandara', 256, 256, (g, w, h) => {
  g.fillStyle = '#16171b'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 1500, '#2c2e35', 0.5, 2, 71);
  const band = h * 0.24, y0 = h - band;
  g.fillStyle = '#f2efe6'; g.fillRect(0, y0, w, band);
  g.fillStyle = '#16171b';
  const n = 8, tw = w / n;
  for (let i = 0; i < n; i++) {
    g.beginPath(); g.moveTo(i * tw, y0); g.lineTo(i * tw + tw / 2, y0 + band * 0.62); g.lineTo(i * tw + tw, y0); g.fill();
    g.beginPath(); g.moveTo(i * tw, h); g.lineTo(i * tw + tw / 2, h - band * 0.25); g.lineTo(i * tw + tw, h); g.fill();
  }
  // 白い襟（前中央 = u0 / u1）
  g.fillStyle = '#e9e5da';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(22, 0); g.lineTo(0, 70); g.fill();
  g.beginPath(); g.moveTo(w, 0); g.lineTo(w - 22, 0); g.lineTo(w, 70); g.fill();
});

// 寝間着の着物（吉良家家臣）
export function kimonoTex(base, stripe, key) {
  return make('kimono' + key, 128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (stripe) {
      g.fillStyle = stripe;
      for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 2, h);
    }
    noise(g, w, h, 600, '#000', 0.08, 2, 81);
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(14, 0); g.lineTo(0, 40); g.fill();
    g.beginPath(); g.moveTo(w, 0); g.lineTo(w - 14, 0); g.lineTo(w, 40); g.fill();
  });
}

export const hakamaTex = (key = 'h', base = '#2b2c33') => make('hakama' + key, 64, 128, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.08)';
  for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 1, h);
  noise(g, w, h, 300, '#000', 0.2, 2, 91);
});

// 顔（球体UV：u=0.25が正面、v=0.5が赤道）
export function faceTex(kind) {
  return make('face' + kind, 512, 256, (g, w, h) => {
    const old = kind === 'kira';
    const skin = old ? '#d8b7a0' : kind === 'enemy' ? '#d3a582' : '#c99574';
    g.fillStyle = skin; g.fillRect(0, 0, w, h);
    const cx = w * 0.25, ey = h * 0.47;
    // 陰影
    const sh = g.createRadialGradient(cx, ey + 10, 10, cx, ey + 10, w * 0.3);
    sh.addColorStop(0, 'rgba(255,230,210,.25)'); sh.addColorStop(1, 'rgba(60,30,20,.35)');
    g.fillStyle = sh; g.fillRect(0, 0, w, h);
    const S = 2; // scale
    // 眉
    g.strokeStyle = old ? '#d9d6d0' : '#1d1612'; g.lineCap = 'round';
    g.lineWidth = old ? 5 : 4.5;
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx + s * 9 * S, ey - 9 * S); g.quadraticCurveTo(cx + s * 16 * S, ey - (old ? 10 : 13) * S, cx + s * 22 * S, ey - (old ? 6 : 9) * S); g.stroke();
    }
    // 目
    for (const s of [-1, 1]) {
      const x = cx + s * 15 * S, y = ey;
      g.fillStyle = '#e8e2d8';
      g.beginPath(); g.ellipse(x, y, 6 * S, 2.2 * S, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a120d';
      g.beginPath(); g.arc(x + s * -0.5, y, 2.1 * S, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(x - 1, y - 2, 2, 2);
      g.strokeStyle = '#2a1a12'; g.lineWidth = 2.2;
      g.beginPath(); g.ellipse(x, y, 6 * S, 2.4 * S, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      if (old) { g.strokeStyle = 'rgba(80,50,40,.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + s * 7 * S, y + 1 * S); g.lineTo(x + s * 11 * S, y + 3 * S); g.stroke(); }
    }
    // 鼻
    const ng = g.createLinearGradient(cx - 8, 0, cx + 8, 0);
    ng.addColorStop(0, 'rgba(90,50,30,.0)'); ng.addColorStop(0.5, 'rgba(90,50,30,.25)'); ng.addColorStop(1, 'rgba(90,50,30,0)');
    g.fillStyle = ng; g.fillRect(cx - 8, ey + 2, 16, 14 * S);
    g.fillStyle = 'rgba(70,35,25,.6)';
    g.beginPath(); g.ellipse(cx - 4, ey + 15 * S, 2.5, 1.6, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + 4, ey + 15 * S, 2.5, 1.6, 0, 0, Math.PI * 2); g.fill();
    // 口
    g.strokeStyle = old ? '#7a4a40' : '#6e3a2c'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - 9 * S, ey + 24 * S); g.quadraticCurveTo(cx, ey + (kind === 'ronin' ? 23 : 25.5) * S, cx + 9 * S, ey + 24 * S); g.stroke();
    // 無精髭・皺
    if (kind === 'ronin') {
      noise(g, w, h, 0, '#000', 0, 1);
      const r = mulberry32(5);
      g.fillStyle = 'rgba(30,20,15,.28)';
      for (let i = 0; i < 500; i++) { const a = r() * Math.PI, rr = 22 * S + r() * 18; g.fillRect(cx + Math.cos(a) * rr * 0.9, ey + 8 * S + Math.sin(a) * rr * 0.75, 1.5, 1.5); }
    }
    if (old) {
      g.strokeStyle = 'rgba(90,55,45,.45)'; g.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(cx - 18 * S, ey - (17 + i * 4) * S); g.quadraticCurveTo(cx, ey - (19 + i * 4) * S, cx + 18 * S, ey - (17 + i * 4) * S); g.stroke(); }
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 8 * S, ey + 12 * S); g.quadraticCurveTo(cx + s * 14 * S, ey + 20 * S, cx + s * 12 * S, ey + 27 * S); g.stroke(); }
      // 眉間の古傷（松之大廊下の刃傷）
      g.strokeStyle = 'rgba(130,40,40,.7)'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(cx - 3 * S, ey - 22 * S); g.lineTo(cx + 5 * S, ey - 12 * S); g.stroke();
      // 白い顎鬚
      g.fillStyle = 'rgba(235,232,225,.85)';
      g.beginPath(); g.ellipse(cx, ey + 34 * S, 10 * S, 7 * S, 0, 0, Math.PI * 2); g.fill();
    }
    // 耳
    for (const ux of [0, 0.5]) {
      g.fillStyle = 'rgba(120,70,50,.35)';
      g.beginPath(); g.ellipse(ux * w, ey + 4, 8, 14, 0, 0, Math.PI * 2); g.fill();
    }
  });
}

export const hairTex = (color) => make('hair' + color, 64, 64, (g, w, h) => {
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.08)';
  for (let x = 0; x < w; x += 2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 3, h); g.stroke(); }
});

export const tsukaTex = () => make('tsuka', 32, 128, (g, w, h) => {
  g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#121212';
  for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 8); g.lineTo(0, y + 16); g.fill(); g.beginPath(); g.moveTo(w, y); g.lineTo(0, y + 8); g.lineTo(w, y + 16); g.fill(); }
});

// 月夜の空（環境マップ兼背景）
export const skyTex = () => {
  const t = make('sky', 1024, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#02040b'); grd.addColorStop(0.45, '#0b1328'); grd.addColorStop(0.52, '#1b2540'); grd.addColorStop(1, '#0d1018');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const mx = w * 0.62, my = h * 0.22;
    const mg = g.createRadialGradient(mx, my, 0, mx, my, 90);
    mg.addColorStop(0, 'rgba(230,236,255,1)'); mg.addColorStop(0.12, 'rgba(220,228,255,.9)'); mg.addColorStop(0.2, 'rgba(150,170,220,.25)'); mg.addColorStop(1, 'rgba(60,80,140,0)');
    g.fillStyle = mg; g.fillRect(mx - 90, my - 90, 180, 180);
    // 町の灯り（地平線付近）
    const r = mulberry32(99);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,${150 + r() * 60},80,${0.2 + r() * 0.4})`; g.fillRect(r() * w, h * 0.5 + r() * 8, 2, 2); }
  }, { repeat: false });
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
};

export const snowflakeTex = () => make('flake', 32, 32, (g, w, h) => {
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
}, { repeat: false });

export const glowTex = () => make('glow', 64, 64, (g, w, h) => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,210,150,1)'); grd.addColorStop(0.3, 'rgba(255,170,90,.5)'); grd.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
}, { repeat: false });

export const paperLampTex = () => make('andon', 64, 128, (g, w, h) => {
  g.fillStyle = '#ffe2a8'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3b2716'; g.lineWidth = 3;
  g.strokeRect(1, 1, w - 2, h - 2);
  g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
});

// 提灯（丸に「大」の字）
export const chochinTex = () => make('chochin', 128, 128, (g, w, h) => {
  g.fillStyle = '#fff1d0'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,80,40,.4)';
  for (let y = 0; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = '#111'; g.font = 'bold 54px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('義', w * 0.25, h / 2);
  g.fillText('義', w * 0.75, h / 2);
});
