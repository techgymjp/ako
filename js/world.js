// 吉良邸の3D再現（間取り図の座標から生成）
import * as THREE from 'three';
import * as TX from './textures.js';

// 間取り図（画像 1200×900px）上の座標 → ワールド座標（m）
// 屋敷全体（東西約130m×南北約54m）を 1px = 0.125m とする
export const S = 0.125;
export const P = (ix, iy) => ({ x: (ix - 620) * S, z: (iy - 490) * S });

export const WALL_H = 2.7;
const DOOR_HALF = 7; // px（≒0.9m）

// ---- 母屋・隠居屋敷の部屋（間取り図の座標 x0,y0,x1,y1） ----
export const ROOMS = [
  { id: 'inkyo', name: '隠居屋敷', r: [255, 355, 395, 545], floor: 'tatami' },
  { id: 'iriguchi', name: '入口', r: [395, 355, 440, 460], floor: 'wood' },
  { id: 'chashitsu', name: '茶室', r: [440, 355, 490, 400], floor: 'tatami' },
  { id: 'nagarouka', name: '長廊下', r: [490, 370, 740, 400], floor: 'wood' },
  { id: 'daidokoro', name: '台所', r: [705, 310, 740, 370], floor: 'wood' },
  { id: 'doma2', name: '台所土間', r: [740, 310, 790, 345], floor: 'earth' },
  { id: 'ryori', name: '料理間', r: [740, 345, 790, 450], floor: 'wood' },
  { id: 'tsumesho', name: '家臣詰所', r: [790, 345, 850, 450], floor: 'tatami' },
  { id: 'doma', name: '土間', r: [440, 400, 530, 430], floor: 'earth' },
  { id: 'roukaW', name: '廊下', r: [440, 430, 470, 545], floor: 'wood' },
  { id: 'sumibeya', name: '炭部屋', r: [470, 430, 530, 475], floor: 'earth' },
  { id: 'monooki', name: '物置', r: [470, 475, 530, 545], floor: 'wood' },
  { id: 'nakanoma', name: '中の間', r: [530, 400, 660, 435], floor: 'tatami' },
  { id: 'shinjo', name: '上野介寝所', r: [530, 435, 660, 470], floor: 'tatami' },
  { id: 'okunoma', name: '奥の間', r: [530, 470, 660, 545], floor: 'tatami' },
  { id: 'nando', name: '納戸', r: [660, 400, 705, 485], floor: 'wood' },
  { id: 'tsuginoma', name: '次の間', r: [705, 400, 740, 485], floor: 'tatami' },
  { id: 'sahyoe', name: '左兵衛居間', r: [660, 485, 740, 545], floor: 'tatami' },
  { id: 'toorimichi', name: '通り道の間', r: [740, 450, 850, 500], floor: 'tatami' },
  { id: 'roukaE', name: '廊下', r: [850, 410, 935, 450], floor: 'wood' },
  { id: 'hiroma', name: '広間', r: [850, 450, 935, 500], floor: 'tatami' },
  { id: 'yarinoma', name: '槍の間', r: [935, 410, 1000, 450], floor: 'wood' },
  { id: 'toritsugi', name: '取次の間', r: [935, 450, 1000, 500], floor: 'tatami' },
  { id: 'genkan', name: '玄関', r: [960, 500, 1000, 540], floor: 'wood' },
  { id: 'younin', name: '用人部屋', r: [740, 500, 850, 560], floor: 'tatami' },
  { id: 'shoin', name: '書院', r: [850, 500, 960, 545], floor: 'tatami' },
];

// 長屋・土蔵など（中に入らない建物）
const SOLIDS = [
  { name: '長屋', r: [100, 275, 300, 318], h: 3.4 },
  { name: '長屋', r: [100, 362, 142, 665], h: 3.4 },
  { name: '長屋', r: [100, 665, 1060, 705], h: 3.4 },
  { name: '長屋', r: [1098, 290, 1140, 463], h: 3.4 },
  { name: '長屋', r: [1098, 507, 1140, 705], h: 3.4 },
  { name: '隠居長屋', r: [255, 325, 395, 355], h: 3.2 },
  { name: '新土蔵', r: [935, 300, 975, 410], h: 5.2, kura: true },
];

// ---- 討ち入りの進路（表門 → 炭部屋） ----
export const RAIL = [
  [1215, 485], [1065, 485], [1030, 520], [980, 520], [980, 475], [980, 430],
  [892, 430], [892, 475], [795, 475], [722, 465], [722, 505], [700, 515],
  [595, 515], [595, 452], [595, 418], [595, 385], [500, 385], [500, 415], [500, 455],
];

// ---------- ジオメトリ補助 ----------
function boxUV(w, h, d, tw, th, fullHeight = true) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // 面の順：+x,-x,+y,-y,+z,-z（各4頂点）
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setX(k, uv.getX(k) * du / tw);
      uv.setY(k, fullHeight && f !== 2 && f !== 3 ? uv.getY(k) : uv.getY(k) * dv / th);
    }
  }
  return g;
}

function planeUV(w, d, tw, td) {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { uv.setX(i, uv.getX(i) * w / tw); uv.setY(i, uv.getY(i) * d / td); }
  return g;
}

// 寄棟屋根
function hipRoof(w, d, h) {
  const W = w / 2, D = d / 2;
  let a, b;
  if (W >= D) { a = [-(W - D), h, 0]; b = [W - D, h, 0]; }
  else { a = [0, h, -(D - W)]; b = [0, h, D - W]; }
  const c0 = [-W, 0, -D], c1 = [W, 0, -D], c2 = [W, 0, D], c3 = [-W, 0, D];
  const tris = W >= D
    ? [c3, c2, b, c3, b, a, c1, c0, a, c1, a, b, c0, c3, a, c2, c1, b]
    : [c0, c3, b, c0, b, a, c2, c1, a, c2, a, b, c1, c0, a, c3, c2, b];
  const pos = new Float32Array(tris.flat());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function inRect(r, ix, iy, m = 0) { return ix > r[0] + m && ix < r[2] - m && iy > r[1] + m && iy < r[3] - m; }

export function roomAtPx(ix, iy) {
  for (const room of ROOMS) if (inRect(room.r, ix, iy)) return room;
  return null;
}
export function roomAtWorld(x, z) {
  return roomAtPx(x / S + 620, z / S + 490);
}
export function clampToRoom(room, v, margin = 0.45) {
  if (!room) return v;
  const a = P(room.r[0], room.r[1]), b = P(room.r[2], room.r[3]);
  v.x = THREE.MathUtils.clamp(v.x, a.x + margin, b.x - margin);
  v.z = THREE.MathUtils.clamp(v.z, a.z + margin, b.z - margin);
  return v;
}

// ---------- 構築 ----------
export function buildWorld(scene, quality) {
  const lights = []; // 動的点光源の候補
  const shadows = quality.shadows;
  const std = (o) => new THREE.MeshStandardMaterial(o);

  const mats = {
    shoji: std({ map: TX.shojiTex(), roughness: 0.9 }),
    amado: std({ map: TX.amadoTex(), roughness: 0.9 }),
    plaster: std({ map: TX.plasterTex(), roughness: 0.95 }),
    tatami: std({ map: TX.tatamiTex(), roughness: 0.95 }),
    wood: std({ map: TX.woodFloorTex(), roughness: 0.7 }),
    earth: std({ map: TX.earthTex(), roughness: 1 }),
    ceiling: std({ map: TX.ceilingTex(), roughness: 0.9 }),
    beam: std({ color: '#3a2818', roughness: 0.8 }),
    roof: std({ color: '#d5dce6', roughness: 0.92, side: THREE.DoubleSide, flatShading: true }),
    eave: std({ color: '#1c1a1a', roughness: 0.9 }),
    snow: std({ map: TX.snowTex(), bumpMap: TX.snowBump(), bumpScale: 0.6, roughness: 0.95 }),
    stone: std({ map: TX.stoneTex(), roughness: 0.95 }),
    bark: std({ map: TX.barkTex(), roughness: 1 }),
    pine: std({ color: '#1d2e22', roughness: 0.95, flatShading: true }),
    pineSnow: std({ color: '#e6ebf2', roughness: 0.9, flatShading: true }),
    water: std({ color: '#0b1622', roughness: 0.08, metalness: 0.3 }),
    lampPaper: std({ map: TX.paperLampTex(), emissive: '#ffb45c', emissiveMap: TX.paperLampTex(), emissiveIntensity: 2.2, roughness: 1 }),
    fire: std({ color: '#ffcc80', emissive: '#ff9a3c', emissiveIntensity: 3 }),
    darkWood: std({ color: '#2a1c12', roughness: 0.8 }),
    straw: std({ map: TX.strawTex(), roughness: 1 }),
    futon: std({ color: '#d9d3c5', roughness: 0.95 }),
    futonRed: std({ color: '#6b2428', roughness: 0.95 }),
    neighbor: std({ color: '#141821', roughness: 1 }),
    window: std({ color: '#ffbb66', emissive: '#ff9a40', emissiveIntensity: 1.6 }),
  };

  const add = (geo, mat, x, y, z, { cast = true, receive = true, ry = 0 } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = cast && shadows; m.receiveShadow = receive && shadows;
    scene.add(m);
    return m;
  };

  // 地面（雪）
  {
    const g = planeUV(320, 200, 8, 8);
    const m = add(g, mats.snow, 0, 0, 0, { cast: false });
    m.rotation.x = -Math.PI / 2;
  }

  // ---- 部屋の床・天井・屋根 ----
  for (const room of ROOMS) {
    const a = P(room.r[0], room.r[1]), b = P(room.r[2], room.r[3]);
    const w = b.x - a.x, d = b.z - a.z, cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
    room.cx = cx; room.cz = cz; room.w = w; room.d = d;
    const fm = mats[room.floor];
    const fg = room.floor === 'tatami' ? planeUV(w, d, 0.9, 1.8) : planeUV(w, d, 2, 2);
    const f = add(fg, fm, cx, 0.02, cz, { cast: false });
    f.rotation.x = -Math.PI / 2;
    const c = add(planeUV(w, d, 2, 2), mats.ceiling, cx, WALL_H, cz, { cast: false });
    c.rotation.x = Math.PI / 2;
    const roof = add(hipRoof(w + 0.9, d + 0.9, Math.min(w, d) * 0.32 + 0.6), mats.roof, cx, WALL_H + 0.25, cz);
    roof.receiveShadow = false;
    add(new THREE.BoxGeometry(w + 0.9, 0.25, d + 0.9), mats.eave, cx, WALL_H + 0.13, cz, { receive: false });
    // 行灯
    if (room.floor !== 'earth' || room.id === 'sumibeya') {
      const lx = a.x + 0.6, lz = a.z + 0.6;
      if (room.id !== 'sumibeya') {
        add(new THREE.BoxGeometry(0.28, 0.5, 0.28), mats.lampPaper, lx, 0.45, lz, { cast: false });
        add(new THREE.BoxGeometry(0.34, 0.04, 0.34), mats.darkWood, lx, 0.72, lz);
        add(new THREE.BoxGeometry(0.06, 0.2, 0.06), mats.darkWood, lx, 0.1, lz);
      }
      lights.push({ pos: new THREE.Vector3(lx, 0.8, lz), color: 0xffa860, intensity: room.id === 'sumibeya' ? 0 : 7, distance: 9 });
    }
  }

  // ---- 壁（間取りの辺を統合し、進路が通る所に戸口を開ける） ----
  const hLines = new Map(), vLines = new Map();
  const pushLine = (map, key, a, b) => { if (!map.has(key)) map.set(key, []); map.get(key).push([Math.min(a, b), Math.max(a, b)]); };
  for (const room of ROOMS) {
    const [x0, y0, x1, y1] = room.r;
    pushLine(hLines, y0, x0, x1); pushLine(hLines, y1, x0, x1);
    pushLine(vLines, x0, y0, y1); pushLine(vLines, x1, y0, y1);
  }
  const merge = (list) => {
    list.sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const it of list) {
      if (out.length && it[0] <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], it[1]);
      else out.push([...it]);
    }
    return out;
  };
  // 進路との交点
  const gapsFor = (horizontal, c) => {
    const gaps = [];
    for (let i = 0; i < RAIL.length - 1; i++) {
      const [ax, ay] = RAIL[i], [bx, by] = RAIL[i + 1];
      const pa = horizontal ? ay : ax, pb = horizontal ? by : bx;
      if ((pa - c) * (pb - c) < 0) {
        const t = (c - pa) / (pb - pa);
        gaps.push(horizontal ? ax + (bx - ax) * t : ay + (by - ay) * t);
      }
    }
    return gaps;
  };
  const isInside = (ix, iy) => ROOMS.some((r) => inRect(r.r, ix, iy));
  const T = 0.14;
  const wallPiece = (horizontal, c, s0, s1, exterior) => {
    if (s1 - s0 < 0.5) return;
    const p0 = horizontal ? P(s0, c) : P(c, s0), p1 = horizontal ? P(s1, c) : P(c, s1);
    const len = horizontal ? p1.x - p0.x : p1.z - p0.z;
    const mat = exterior ? mats.amado : mats.shoji;
    const g = horizontal ? boxUV(len + T, WALL_H, T, 1.8, WALL_H) : boxUV(T, WALL_H, len + T, 1.8, WALL_H);
    add(g, mat, (p0.x + p1.x) / 2, WALL_H / 2, (p0.z + p1.z) / 2);
    // 柱
    for (const p of [p0, p1]) add(new THREE.BoxGeometry(0.16, WALL_H, 0.16), mats.beam, p.x, WALL_H / 2, p.z);
  };
  const lintel = (horizontal, c, s) => {
    const p = horizontal ? P(s, c) : P(c, s);
    const w = DOOR_HALF * 2 * S;
    add(horizontal ? new THREE.BoxGeometry(w, 0.5, T) : new THREE.BoxGeometry(T, 0.5, w), mats.beam, p.x, WALL_H - 0.25, p.z);
  };
  for (const [horizontal, lines] of [[true, hLines], [false, vLines]]) {
    for (const [c, list] of lines) {
      for (const [s0, s1] of merge(list)) {
        const gaps = gapsFor(horizontal, c).filter((g) => g > s0 && g < s1);
        let cuts = [[s0, s1]];
        for (const g of gaps) {
          lintel(horizontal, c, g);
          cuts = cuts.flatMap(([a, b]) => (g + DOOR_HALF <= a || g - DOOR_HALF >= b) ? [[a, b]] : [[a, g - DOOR_HALF], [g + DOOR_HALF, b]]);
        }
        for (const [a, b] of cuts) {
          // 外壁（片側が屋外）かどうかで雨戸／障子を切り替え
          let start = a, prev = null;
          for (let s = a; s <= b; s += 5) {
            const t = Math.min(s, b);
            const sideA = horizontal ? isInside(t, c - 3) : isInside(c - 3, t);
            const sideB = horizontal ? isInside(t, c + 3) : isInside(c + 3, t);
            const ext = !(sideA && sideB);
            if (prev !== null && ext !== prev) { wallPiece(horizontal, c, start, t, prev); start = t; }
            prev = ext;
          }
          wallPiece(horizontal, c, start, b, prev ?? true);
        }
      }
    }
  }

  // ---- 長屋・土蔵 ----
  for (const s of SOLIDS) {
    const a = P(s.r[0], s.r[1]), b = P(s.r[2], s.r[3]);
    const w = b.x - a.x, d = b.z - a.z, cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
    add(boxUV(w, s.h, d, 2.2, s.h), mats.plaster, cx, s.h / 2, cz);
    add(hipRoof(w + 1.0, d + 1.0, Math.min(w, d) * (s.kura ? 0.5 : 0.35) + 0.4), mats.roof, cx, s.h + 0.25, cz);
    add(new THREE.BoxGeometry(w + 1.0, 0.25, d + 1.0), mats.eave, cx, s.h + 0.13, cz);
    if (!s.kura) {
      // 長屋の戸口（鎹で打ち付けられた戸）
      const long = w > d;
      const n = Math.max(1, Math.floor((long ? w : d) / 9));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const inward = long ? (cz < 0 ? 1 : -1) : (cx < 0 ? 1 : -1);
        const x = long ? a.x + w * t : (inward > 0 ? b.x + 0.02 : a.x - 0.02);
        const z = long ? (inward > 0 ? b.z + 0.02 : a.z - 0.02) : a.z + d * t;
        add(long ? new THREE.BoxGeometry(1.3, 2.0, 0.08) : new THREE.BoxGeometry(0.08, 2.0, 1.3), mats.amado, x, 1.0, z);
        for (const dy of [0.6, 1.4]) add(long ? new THREE.BoxGeometry(1.5, 0.08, 0.1) : new THREE.BoxGeometry(0.1, 0.08, 1.5), mats.darkWood, x, dy, z);
      }
    }
  }

  // ---- 外塀と門 ----
  const fence = (x0, z0, x1, z1, h = 2.6) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    const m = add(boxUV(len, h, 0.35, 2.2, h), mats.plaster, (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    m.rotation.y = -ang;
    const cap = add(new THREE.BoxGeometry(len + 0.2, 0.18, 0.75), mats.eave, (x0 + x1) / 2, h + 0.09, (z0 + z1) / 2, { receive: false });
    cap.rotation.y = -ang;
    const sn = add(new THREE.BoxGeometry(len + 0.2, 0.12, 0.6), mats.pineSnow, (x0 + x1) / 2, h + 0.22, (z0 + z1) / 2);
    sn.rotation.y = -ang;
  };
  const fpx = (a, b, c, d, h) => { const p = P(a, b), q = P(c, d); fence(p.x, p.z, q.x, q.z, h); };
  fpx(100, 275, 1140, 275); fpx(100, 705, 1140, 705);
  fpx(100, 275, 100, 315); fpx(100, 355, 100, 705);
  fpx(1140, 275, 1140, 465); fpx(1140, 505, 1140, 705);
  // 庭の塀（間取り図の斜線部）
  fpx(290, 545, 290, 620, 1.8); fpx(290, 620, 730, 620, 1.8);
  fpx(435, 545, 435, 605, 1.8); fpx(530, 545, 530, 600, 1.8); fpx(660, 545, 660, 600, 1.8);
  fpx(965, 575, 1060, 575, 2.0); fpx(900, 605, 1060, 605, 2.0); fpx(1075, 620, 1098, 620, 2.0);

  // 門
  const gate = (ix, iy0, iy1, big) => {
    const p0 = P(ix, iy0), p1 = P(ix, iy1);
    const h = big ? 4.2 : 3.4;
    for (const p of [p0, p1]) add(new THREE.BoxGeometry(0.6, h, 0.6), mats.darkWood, p.x, h / 2, p.z);
    const len = p1.z - p0.z;
    add(new THREE.BoxGeometry(0.7, 0.4, len + 0.6), mats.darkWood, p0.x, h - 0.2, (p0.z + p1.z) / 2);
    const r = add(hipRoof(3.2, len + 3.0, 1.4), mats.roof, p0.x, h + 0.1, (p0.z + p1.z) / 2);
    r.receiveShadow = false;
    add(new THREE.BoxGeometry(3.2, 0.2, len + 3.0), mats.eave, p0.x, h, (p0.z + p1.z) / 2);
    // 開いた門扉
    for (const [p, s] of [[p0, 1], [p1, -1]]) {
      const door = add(new THREE.BoxGeometry(0.12, h - 0.6, len / 2), mats.amado, p.x - len / 4, (h - 0.6) / 2, p.z + s * 0.3);
      door.rotation.y = s * 1.3;
    }
    // 門の提灯
    for (const p of [p0, p1]) {
      const lp = add(new THREE.SphereGeometry(0.25, 12, 10), mats.lampPaper, p.x + 0.6, h - 0.9, p.z, { cast: false });
      lp.scale.y = 1.3;
      lights.push({ pos: new THREE.Vector3(p.x + 0.8, h - 0.9, p.z), color: 0xffa050, intensity: 10, distance: 12 });
    }
  };
  gate(1140, 465, 505, true);
  gate(100, 315, 355, false);
  // 表門に掛けた梯子（討ち入りの際に門を越えた）
  {
    const p = P(1150, 455);
    const lad = new THREE.Group();
    for (const s of [-0.25, 0.25]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 4.6, 0.07), mats.darkWood); r.position.x = s; lad.add(r); }
    for (let y = -2; y <= 2; y += 0.4) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), mats.darkWood); r.position.y = y; lad.add(r); }
    lad.position.set(p.x + 0.6, 2.1, p.z); lad.rotation.z = 0.28; lad.rotation.y = Math.PI / 2;
    lad.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
    scene.add(lad);
  }

  // ---- 祠（弁天・稲荷） ----
  for (const ix of [410, 432]) {
    const p = P(ix, 290);
    add(new THREE.BoxGeometry(1.6, 1.4, 1.6), mats.darkWood, p.x, 0.7, p.z);
    add(hipRoof(2.2, 2.2, 0.8), mats.roof, p.x, 1.4, p.z);
  }

  // ---- 庭：泉水・松・石灯籠 ----
  {
    const p = P(600, 580);
    const pond = add(new THREE.CircleGeometry(1, 40), mats.water, p.x, 0.03, p.z, { cast: false });
    pond.rotation.x = -Math.PI / 2; pond.scale.set(4.8, 3.4, 1);
    const r = TX.mulberry32(5);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const s = 0.25 + r() * 0.35;
      const rock = add(new THREE.DodecahedronGeometry(s, 0), mats.stone, p.x + Math.cos(a) * 4.9, s * 0.4, p.z + Math.sin(a) * 3.5);
      rock.rotation.set(r() * 3, r() * 3, 0);
    }
  }
  const pine = (ix, iy, sc = 1) => {
    const p = P(ix, iy);
    const g = new THREE.Group();
    const r = TX.mulberry32(ix * 7 + iy);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * sc, 0.22 * sc, 4.2 * sc, 8), mats.bark);
    trunk.position.y = 2.1 * sc; trunk.rotation.z = (r() - 0.5) * 0.3; g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const y = (2.2 + i * 0.75) * sc;
      const rad = (1.8 - i * 0.28) * sc;
      const ox = (r() - 0.5) * 0.8 * sc, oz = (r() - 0.5) * 0.8 * sc;
      const f = new THREE.Mesh(new THREE.SphereGeometry(rad, 9, 5), mats.pine);
      f.scale.y = 0.32; f.position.set(ox, y, oz); g.add(f);
      const sn = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.92, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.45), mats.pineSnow);
      sn.scale.y = 0.3; sn.position.set(ox, y + 0.06 * sc, oz); g.add(sn);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = shadows; } });
    g.position.set(p.x, 0, p.z);
    scene.add(g);
  };
  [[330, 580], [480, 590], [700, 575], [390, 560], [820, 640], [960, 645], [1040, 650], [170, 450], [200, 610],
   [610, 330], [860, 325], [1060, 375], [500, 320], [660, 300], [230, 380], [180, 340], [1075, 560], [1020, 300]]
    .forEach(([x, y], i) => pine(x, y, 0.8 + (i % 3) * 0.15));

  const ishidoro = (ix, iy) => {
    const p = P(ix, iy);
    add(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 6), mats.stone, p.x, 0.12, p.z);
    add(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8), mats.stone, p.x, 0.7, p.z);
    add(new THREE.BoxGeometry(0.5, 0.12, 0.5), mats.stone, p.x, 1.2, p.z);
    add(new THREE.BoxGeometry(0.34, 0.34, 0.34), mats.fire, p.x, 1.43, p.z, { cast: false });
    const rf = add(new THREE.ConeGeometry(0.55, 0.38, 4), mats.stone, p.x, 1.8, p.z);
    rf.rotation.y = Math.PI / 4;
    add(new THREE.SphereGeometry(0.1, 8, 6), mats.stone, p.x, 2.05, p.z);
    add(new THREE.ConeGeometry(0.5, 0.12, 4), mats.pineSnow, p.x, 2.0, p.z).rotation.y = Math.PI / 4;
    lights.push({ pos: new THREE.Vector3(p.x, 1.5, p.z), color: 0xff9a50, intensity: 8, distance: 10 });
  };
  [[1090, 445], [1045, 560], [640, 595], [350, 600], [880, 640], [560, 330]].forEach(([x, y]) => ishidoro(x, y));

  // ---- 部屋の小道具 ----
  // 上野介寝所の夜具（まだ温かい）
  {
    const p = P(632, 452);
    add(new THREE.BoxGeometry(1.0, 0.16, 2.0), mats.futon, p.x, 0.1, p.z);
    const k = add(new THREE.BoxGeometry(1.05, 0.1, 1.3), mats.futonRed, p.x, 0.22, p.z + 0.3);
    k.rotation.y = 0.12;
    add(new THREE.BoxGeometry(0.35, 0.12, 0.18), mats.darkWood, p.x, 0.22, p.z - 0.8);
  }
  // 炭部屋の炭俵
  {
    const r = TX.mulberry32(77);
    const a = P(470, 430), b = P(530, 475);
    const bag = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10);
    for (let i = 0; i < 26; i++) {
      const side = i % 3;
      let x, z;
      if (side === 0) { x = a.x + 0.5 + r() * (b.x - a.x - 1); z = b.z - 0.45 - r() * 0.6; }
      else if (side === 1) { x = a.x + 0.45 + r() * 0.5; z = a.z + 0.8 + r() * (b.z - a.z - 1.6); }
      else { x = b.x - 0.45 - r() * 0.5; z = a.z + 0.8 + r() * (b.z - a.z - 1.6); }
      if (Math.abs(x - P(500, 0).x) < 1.2 && z < a.z + 2.6) continue; // 入口付近は空ける
      const kp = P(500, 465);
      if (Math.hypot(x - kp.x, z - kp.z) < 1.5) continue; // 吉良がうずくまる隙間を空ける
      const m = add(bag, mats.straw, x, 0.3 + (i > 16 ? 0.6 : 0), z);
      m.rotation.z = Math.PI / 2; m.rotation.y = r() * Math.PI;
    }
  }
  // 槍の間の槍掛け
  {
    const a = P(935, 410), b = P(1000, 410);
    for (let i = 0; i < 6; i++) {
      const x = a.x + 1 + i * 0.9;
      const s = add(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 6), mats.darkWood, x, 1.5, a.z + 0.2);
      s.rotation.z = 0.08;
    }
  }
  // 台所の竈
  {
    const p = P(722, 330);
    add(new THREE.BoxGeometry(1.6, 0.8, 0.9), mats.earth, p.x, 0.4, p.z);
    add(new THREE.BoxGeometry(0.35, 0.2, 0.2), mats.fire, p.x - 0.4, 0.35, p.z + 0.46, { cast: false });
  }

  // ---- 屋敷の外：隣家と町屋 ----
  const out = (x0, z0, x1, z1, h, wins) => {
    const w = x1 - x0, d = z1 - z0;
    add(new THREE.BoxGeometry(w, h, d), mats.neighbor, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, { receive: false });
    add(hipRoof(w + 1, d + 1, Math.min(w, d) * 0.3 + 0.5), mats.roof, (x0 + x1) / 2, h, (z0 + z1) / 2, { cast: false, receive: false });
    const r = TX.mulberry32(Math.floor(x0 * 13 + z0));
    for (let i = 0; i < wins; i++) {
      if (r() < 0.5) continue;
      const x = x0 + 1 + r() * (w - 2);
      add(new THREE.BoxGeometry(0.9, 0.6, 0.05), mats.window, x, 1.4, d > 0 && z0 > 0 ? z0 - 0.03 : z1 + 0.03, { cast: false, receive: false });
    }
  };
  for (let x = -66; x < 66; x += 9) out(x, 32, x + 8, 38, 3.8, 3);        // 町屋（南）
  out(-50, -48, -5, -30, 6, 0); out(0, -46, 45, -30, 6, 0);               // 土屋邸・本多邸（北）
  out(68, -40, 90, -4, 5, 0); out(68, 4, 90, 40, 5, 0);                   // 鳥居邸・牧野邸（東）
  out(-95, -40, -70, 40, 5, 0);                                            // 回向院（西）

  return { lights, mats };
}
