// 忠臣蔵 赤穂浪士の討ち入り — メイン
import * as THREE from 'three';
import { buildWorld, RAIL, P, roomAtWorld, clampToRoom, WALL_H } from './world.js';
import { Character, setCharacterShadows } from './characters.js';
import * as TX from './textures.js';
import { Sfx } from './audio.js';

// =====================================================================
// 初期化
// =====================================================================
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const lowEnd = isTouch && Math.min(screen.width, screen.height) < 500;
const quality = { shadows: true, shadowSize: lowEnd ? 1024 : 2048, pixelRatio: Math.min(devicePixelRatio, lowEnd ? 1.5 : 2) };
setCharacterShadows(quality.shadows);
if (isTouch) document.body.classList.add('touch');

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(quality.pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const sky = TX.skyTex();
scene.background = sky;
scene.environment = sky;
scene.environmentIntensity = 0.5;
scene.backgroundIntensity = 1;
scene.fog = new THREE.FogExp2(0x0c1424, 0.03);

const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 400);

const overlay = document.getElementById('fx');
const octx = overlay.getContext('2d');

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 72 : 58;
  camera.updateProjectionMatrix();
  overlay.width = w * devicePixelRatio; overlay.height = h * devicePixelRatio;
  overlay.style.width = w + 'px'; overlay.style.height = h + 'px';
}
addEventListener('resize', resize);
resize();

// 光源
const hemi = new THREE.HemisphereLight(0x8fa3d6, 0x1c2433, 0.55);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xb8c8ff, 1.25);
moon.castShadow = quality.shadows;
moon.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
const sc = moon.shadow.camera;
sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 120;
moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.03;
scene.add(moon, moon.target);

const world = buildWorld(scene, quality);

// 近くの灯りだけを点光源に割り当てる
const lightPool = [];
for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffa860, 0, 10, 1.6); scene.add(l); lightPool.push(l); }
let lightPoolT = 0;
function updateLightPool(center, dt) {
  lightPoolT -= dt;
  if (lightPoolT > 0) return;
  lightPoolT = 0.25;
  const cands = world.lights.filter((l) => l.intensity > 0).map((l) => ({ l, d: l.pos.distanceToSquared(center) })).sort((a, b) => a.d - b.d);
  lightPool.forEach((pl, i) => {
    const c = cands[i];
    if (!c || c.d > 900) { pl.intensity = 0; return; }
    pl.position.copy(c.l.pos); pl.color.setHex(c.l.color); pl.intensity = c.l.intensity; pl.distance = c.l.distance;
  });
}
// 提灯の灯り（同志が掲げる）
const lanternLight = new THREE.PointLight(0xffb870, 9, 11, 1.5);
scene.add(lanternLight);

// 雪
const SNOW_N = lowEnd ? 1800 : 3500;
const snowGeo = new THREE.BufferGeometry();
const snowPos = new Float32Array(SNOW_N * 3), snowVel = new Float32Array(SNOW_N);
for (let i = 0; i < SNOW_N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 40; snowPos[i * 3 + 1] = Math.random() * 16; snowPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  snowVel[i] = 0.6 + Math.random() * 0.9;
}
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: TX.snowflakeTex(), size: 0.09, transparent: true, depthWrite: false, opacity: 0.9, color: 0xdfe8ff }));
snow.frustumCulled = false;
scene.add(snow);
function updateSnow(dt, t) {
  const c = camera.position;
  for (let i = 0; i < SNOW_N; i++) {
    let x = snowPos[i * 3], y = snowPos[i * 3 + 1], z = snowPos[i * 3 + 2];
    y -= snowVel[i] * dt;
    x += Math.sin(t * 0.7 + i) * 0.15 * dt + 0.12 * dt;
    if (y < 0) y += 16;
    snowPos[i * 3] = x; snowPos[i * 3 + 1] = y; snowPos[i * 3 + 2] = z;
  }
  snow.position.set(Math.round(c.x / 40) * 40, 0, Math.round(c.z / 40) * 40);
  // 視点の周りに雪を再配置
  for (let i = 0; i < SNOW_N; i++) {
    const wx = snowPos[i * 3] + snow.position.x - c.x, wz = snowPos[i * 3 + 2] + snow.position.z - c.z;
    if (wx > 20) snowPos[i * 3] -= 40; else if (wx < -20) snowPos[i * 3] += 40;
    if (wz > 20) snowPos[i * 3 + 2] -= 40; else if (wz < -20) snowPos[i * 3 + 2] += 40;
  }
  snowGeo.attributes.position.needsUpdate = true;
  // 屋内では雪を降らせない
  snow.visible = !roomAtWorld(c.x, c.z);
}

// 火花パーティクル
const SPARK_N = 300;
const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new Float32Array(SPARK_N * 3), sparkCol = new Float32Array(SPARK_N * 3);
const sparks = [];
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparkPts = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, map: TX.snowflakeTex() }));
sparkPts.frustumCulled = false;
scene.add(sparkPts);
let sparkIdx = 0;
function emitSparks(p, n, color, speed = 4) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const s = { i: sparkIdx, p: p.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4, (Math.random() - 0.5) * 2).multiplyScalar(speed), life: 0.4 + Math.random() * 0.4, c };
    sparks[sparkIdx] = s;
    sparkIdx = (sparkIdx + 1) % SPARK_N;
  }
}
function updateSparks(dt) {
  for (let i = 0; i < SPARK_N; i++) {
    const s = sparks[i];
    if (!s || s.life <= 0) { sparkPos[i * 3 + 1] = -100; continue; }
    s.life -= dt; s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt);
    sparkPos[i * 3] = s.p.x; sparkPos[i * 3 + 1] = s.p.y; sparkPos[i * 3 + 2] = s.p.z;
    const k = Math.max(0, s.life * 2);
    sparkCol[i * 3] = s.c.r * k; sparkCol[i * 3 + 1] = s.c.g * k; sparkCol[i * 3 + 2] = s.c.b * k;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
}

// 刀の軌跡（リボン）
const TRAIL_N = 14;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(TRAIL_N * 2 * 3), trailCol = new Float32Array(TRAIL_N * 2 * 3);
const trailIdx = [];
for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; trailIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
trailGeo.setIndex(trailIdx);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
const trailMesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
trailMesh.frustumCulled = false;
scene.add(trailMesh);
const trailHist = [];
const _tipV = new THREE.Vector3(), _baseV = new THREE.Vector3();
function updateTrail(ch, active) {
  if (active) {
    ch.root.updateMatrixWorld(true);
    trailHist.unshift({ t: ch.tipWorld(new THREE.Vector3()), b: ch.baseWorld(new THREE.Vector3()) });
  } else if (trailHist.length) trailHist.pop();
  if (trailHist.length > TRAIL_N) trailHist.length = TRAIL_N;
  for (let i = 0; i < TRAIL_N; i++) {
    const h = trailHist[Math.min(i, trailHist.length - 1)];
    const k = trailHist.length ? Math.max(0, 1 - i / TRAIL_N) : 0;
    const t = h ? h.t : _tipV.set(0, -50, 0), b = h ? h.b : _baseV.set(0, -50, 0);
    // 根元側は細く
    const bb = new THREE.Vector3().lerpVectors(t, b, 0.55);
    trailPos.set([t.x, t.y, t.z], i * 6); trailPos.set([bb.x, bb.y, bb.z], i * 6 + 3);
    trailCol.set([0.75 * k, 0.85 * k, 1.0 * k], i * 6); trailCol.set([0, 0, 0], i * 6 + 3);
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
}

// =====================================================================
// 進路（レール）
// =====================================================================
const railPts = RAIL.map(([x, y]) => { const p = P(x, y); return new THREE.Vector3(p.x, 0, p.z); });
const railLen = [0];
for (let i = 1; i < railPts.length; i++) railLen.push(railLen[i - 1] + railPts[i].distanceTo(railPts[i - 1]));
const RAIL_TOTAL = railLen[railLen.length - 1];
function railAt(s, outPos, outDir) {
  s = THREE.MathUtils.clamp(s, 0, RAIL_TOTAL);
  let i = 1;
  while (i < railLen.length - 1 && railLen[i] < s) i++;
  const a = railPts[i - 1], b = railPts[i];
  const t = (s - railLen[i - 1]) / (railLen[i] - railLen[i - 1] || 1);
  outPos.lerpVectors(a, b, t);
  if (outDir) outDir.subVectors(b, a).normalize();
  return outPos;
}
// 曲がり角でなめらかに向きを変えるための先読み方向
function railDirSmooth(s, out) {
  const a = railAt(s - 0.8, new THREE.Vector3()), b = railAt(s + 1.6, new THREE.Vector3());
  return out.subVectors(b, a).setY(0).normalize();
}

// =====================================================================
// 場面（戦闘・イベント）
// =====================================================================
const STOPS = [
  { wp: 1, title: '前庭', intro: '吉良家の家臣が長屋から飛び出してきた！', tutorial: true, enemies: [
    { at: [1082, 450], t: 'r' }, { at: [1040, 525], t: 'r' }, { at: [1022, 458], t: 'r2' },
    { at: [1090, 532], t: 'r', ally: true }, { at: [1048, 432], t: 'r', ally: true }] },
  { wp: 4, title: '取次の間', enemies: [
    { at: [950, 460], t: 'r2' }, { at: [992, 458], t: 'r' }, { at: [948, 492], t: 'r2', ally: true }] },
  { wp: 5, title: '槍の間', intro: '槍を構えた家臣が待ち受ける！', enemies: [
    { at: [950, 418], t: 's' }, { at: [972, 415], t: 's' }, { at: [992, 420], t: 's', ally: true }] },
  { wp: 7, title: '広間', enemies: [
    { at: [865, 492], t: 'r2' }, { at: [920, 493], t: 'r2' }, { at: [860, 466], t: 'r' }, { at: [928, 462], t: 'r2', ally: true }] },
  { wp: 8, title: '通り道の間', enemies: [
    { at: [756, 462], t: 'r2' }, { at: [760, 490], t: 's' }, { at: [782, 458], t: 'r' }, { at: [836, 490], t: 'r', ally: true }] },
  { wp: 11, title: '左兵衛居間', intro: '吉良左兵衛の居間。家臣が立ち塞がる！', enemies: [
    { at: [668, 497], t: 'r2' }, { at: [672, 535], t: 'r2' }, { at: [690, 540], t: 'r', ally: true }] },
  { wp: 12, title: '奥の間', intro: '吉良家家老・小林平八郎が立ちはだかる！', enemies: [
    { at: [545, 510], t: 'b1', name: '小林平八郎' }, { at: [560, 485], t: 'r2' }, { at: [560, 535], t: 'r2' },
    { at: [640, 540], t: 'r', ally: true }, { at: [645, 490], t: 'r', ally: true }] },
  { wp: 13, title: '上野介寝所', event: 'futon' },
  { wp: 14, title: '中の間', intro: '山吉新八郎、見参！', enemies: [
    { at: [548, 418], t: 'b3', name: '山吉新八郎' }, { at: [560, 408], t: 'r2' }, { at: [630, 410], t: 's' }, { at: [650, 426], t: 'r', ally: true }] },
  { wp: 17, title: '土間', intro: '剣の達人・清水一学が斬りかかる！', enemies: [
    { at: [456, 416], t: 'b2', name: '清水一学' }, { at: [470, 405], t: 'r2' }, { at: [522, 426], t: 'r', ally: true }] },
  { wp: 18, title: '炭部屋', event: 'finale', enemies: [
    { at: [482, 469], t: 'r2' }, { at: [518, 469], t: 'r2' }] },
];
STOPS.forEach((st) => { st.s = railLen[st.wp]; });

const ETYPES = {
  r: { outfit: 'retainer', hp: 1, guard: false, speed: 2.6, windup: 1.15 },
  r2: { outfit: 'retainer2', hp: 1, guard: true, speed: 2.5, windup: 1.05 },
  s: { outfit: 'retainer', hp: 1, guard: true, speed: 2.2, windup: 1.15, weapon: 'spear', range: 2.6 },
  b1: { outfit: 'boss1', hp: 3, guard: true, speed: 2.8, windup: 0.95, boss: true },
  b2: { outfit: 'boss2', hp: 4, guard: true, speed: 3.0, windup: 0.85, boss: true },
  b3: { outfit: 'boss3', hp: 2, guard: true, speed: 2.8, windup: 0.95, boss: true },
};
const GUARD_ANGLES = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4];

// =====================================================================
// 登場人物
// =====================================================================
const player = new Character('oishi', { name: '大石内蔵助' });
scene.add(player.root);
const ALLY_NAMES = ['吉田忠左衛門', '堀部安兵衛', '原惣右衛門', '間十次郎', '武林唯七'];
const allies = ALLY_NAMES.map((n, i) => {
  const c = new Character('ronin', { name: n, lantern: i === 0, weapon: i === 3 ? 'spear' : 'katana' });
  scene.add(c.root);
  return { ch: c, i, duel: null, duelT: 0 };
});

let enemies = [];
let kira = null;

// =====================================================================
// ゲーム状態
// =====================================================================
const G = {
  state: 'title', // title, intro, walk, fight, event, kira, dead, win, paused
  s: 0, stopIdx: 0, t: 0, playTime: 0, stateT: 0,
  attackCD: 0, kills: 0, retries: 0, maxCombo: 0, blocks: 0,
  slowmo: 1, camShake: 0, redFlash: 0, whiteFlash: 0,
  room: null, lastRoomName: '', facing: 0, tutorialShown: false,
  prevState: null,
};

const $ = (id) => document.getElementById(id);
const hud = { loc: $('hudLoc'), prog: $('hudProg'), msg: $('hudMsg'), sub: $('hudSub'), combo: $('hudCombo'), hint: $('hudHint') };
let msgTimer = 0;
function banner(text, sub = '', dur = 2.4) {
  hud.msg.textContent = text; hud.sub.textContent = sub;
  hud.msg.parentElement.classList.remove('show'); void hud.msg.offsetWidth;
  hud.msg.parentElement.classList.add('show');
  msgTimer = dur;
}
function hint(text) { hud.hint.textContent = text; hud.hint.classList.toggle('show', !!text); }
let comboTimer = 0;
function comboText(text) {
  hud.combo.textContent = text;
  hud.combo.classList.remove('pop'); void hud.combo.offsetWidth; hud.combo.classList.add('pop');
  comboTimer = 1.2;
}

// =====================================================================
// 敵の生成とAI
// =====================================================================
function spawnStop(st) {
  for (const def of st.enemies || []) {
    const ty = ETYPES[def.t];
    const ch = new Character(ty.outfit, { name: def.name || '', weapon: ty.weapon || 'katana', scale: ty.boss ? 0.97 : 0.92 });
    const p = P(def.at[0], def.at[1]);
    ch.setPosition(p.x, p.z);
    ch.setMode('ready');
    scene.add(ch.root);
    enemies.push({
      ch, def, ty, stop: st, hp: ty.hp, maxHp: ty.hp, ally: !!def.ally, alive: true,
      state: 'wait', t: 0, guard: null, slot: null, duelT: 3 + Math.random() * 3, swingT: Math.random(),
      cutId: -1, deadT: 0,
    });
  }
  st.spawned = true;
}
function clearStopEnemies(st) {
  enemies = enemies.filter((e) => { if (e.stop === st) { scene.remove(e.ch.root); return false; } return true; });
  st.spawned = false;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
function engageStop(st) {
  let i = 0;
  const foes = enemies.filter((e) => e.stop === st && e.alive);
  // 主人公の向き＝敵の重心方向
  const c = new THREE.Vector3();
  const mains = foes.filter((e) => !e.ally);
  (mains.length ? mains : foes).forEach((e) => c.add(e.ch.pos));
  c.divideScalar(Math.max(1, (mains.length ? mains : foes).length));
  G.facing = Math.atan2(c.x - player.pos.x, c.z - player.pos.z);
  const slotAngles = [0, -0.62, 0.62, -1.15, 1.15];
  let si = 0, ai = 0;
  for (const e of foes) {
    e.state = 'approach'; e.t = -0.25 * i++;
    if (e.ally) {
      e.duelAlly = allies[(ai++ + 1) % allies.length];
      e.duelAlly.duel = e;
    } else {
      const a = G.facing + slotAngles[si++ % slotAngles.length];
      const r = e.ty.range || 1.9;
      e.slot = new THREE.Vector3(player.pos.x + Math.sin(a) * r, 0, player.pos.z + Math.cos(a) * r);
      clampToRoom(G.room, e.slot, 0.5);
    }
  }
}

function pickGuard(e) {
  if (!e.ty.guard) return null;
  let g;
  do { g = GUARD_ANGLES[Math.floor(Math.random() * GUARD_ANGLES.length)]; } while (g === e.guard && Math.random() < 0.8);
  return g;
}

function anyAttacking() { return enemies.some((e) => e.alive && (e.state === 'windup' || e.state === 'strike')); }

function updateEnemy(e, dt) {
  const ch = e.ch;
  if (!e.alive) {
    e.deadT += dt;
    ch.update(dt);
    if (e.deadT > 8) { scene.remove(ch.root); e.removed = true; }
    return;
  }
  e.t += dt;
  const moveTo = (target, speed) => {
    _v.subVectors(target, ch.pos).setY(0);
    const d = _v.length();
    if (d > 0.05) {
      const step = Math.min(d, speed * dt);
      ch.pos.addScaledVector(_v.normalize(), step);
      ch.walk = THREE.MathUtils.lerp(ch.walk, Math.min(1, speed / 2.6), 0.2);
    } else ch.walk = THREE.MathUtils.lerp(ch.walk, 0, 0.2);
    return d;
  };

  switch (e.state) {
    case 'wait':
      ch.walk = 0; ch.faceTo(player.pos.x, player.pos.z, 0.5, dt);
      ch.setMode(e.ty.weapon === 'spear' ? 'ready' : 'ready');
      break;
    case 'approach': {
      if (e.t < 0) { ch.faceTo(player.pos.x, player.pos.z, 1, dt); break; }
      if (e.ally) {
        const a = e.duelAlly.ch;
        _v2.subVectors(ch.pos, a.pos).setY(0).normalize().multiplyScalar(1.7).add(a.pos);
        const d = moveTo(_v2, e.ty.speed);
        ch.faceTo(a.pos.x, a.pos.z, 1, dt);
        if (d < 0.2) { e.state = 'duel'; e.t = 0; }
      } else {
        const d = moveTo(e.slot, e.ty.speed);
        ch.faceTo(player.pos.x, player.pos.z, 1, dt);
        if (d < 0.15) {
          e.state = 'guard'; e.t = 0; e.guard = pickGuard(e);
          e.wait = (G.stopIdx === 0 ? 2.6 : 1.1) + Math.random() * 1.4;
        }
      }
      break;
    }
    case 'guard': {
      ch.walk = THREE.MathUtils.lerp(ch.walk, 0, 0.2);
      ch.faceTo(player.pos.x, player.pos.z, 1, dt);
      if (e.guard !== null) { ch.setMode('guard'); ch.guardAngle = e.guard; } else ch.setMode('ready');
      if (e.t > e.wait && G.attackCD <= 0 && !anyAttacking() && G.state === 'fight') {
        e.state = 'windup'; e.t = 0; e.windup = e.ty.windup * (G.stopIdx === 0 ? 1.3 : 1);
        Sfx.shing();
        if (Math.random() < 0.6) Sfx.voice('oa', 0.5, 120 + Math.random() * 30, 160, 0.3, 0.7, 0.1);
      }
      break;
    }
    case 'windup': {
      ch.faceTo(player.pos.x, player.pos.z, 1, dt);
      ch.setMode('windup');
      ch.setGlint(Math.min(1, e.t / e.windup));
      // 間合いを詰める
      _v.subVectors(ch.pos, player.pos).setY(0);
      const want = (e.ty.range || 1.9) * 0.82;
      if (_v.length() > want) moveTo(_v2.copy(player.pos).add(_v.normalize().multiplyScalar(want)), 1.5);
      if (e.t >= e.windup) {
        e.state = 'strike'; e.t = 0;
        const dirs = [[0, -1], [0.7, -0.7], [-0.7, -0.7], [1, 0]];
        const d = dirs[Math.floor(Math.random() * dirs.length)];
        ch.startSlash(d[0], d[1], 0.45);
        Sfx.swing(); Sfx.roar();
      }
      break;
    }
    case 'strike': {
      ch.setGlint(0);
      if (e.t > 0.12 && !e.struck) {
        e.struck = true;
        if (G.state === 'fight' || G.state === 'kira') playerKilled(e);
      }
      break;
    }
    case 'stagger': {
      ch.setGlint(0);
      ch.walk = 0;
      if (e.t > 0.55) { e.state = 'guard'; e.t = 0; e.guard = pickGuard(e); e.wait = 0.9 + Math.random() * 1.2; }
      break;
    }
    case 'duel': {
      // 同志と斬り結ぶ
      const a = e.duelAlly.ch;
      ch.faceTo(a.pos.x, a.pos.z, 1, dt); ch.walk = 0;
      e.swingT -= dt;
      if (e.swingT <= 0) {
        e.swingT = 0.7 + Math.random() * 0.6;
        const who = Math.random() < 0.5 ? ch : a;
        const ang = Math.random() * Math.PI * 2;
        who.startSlash(Math.cos(ang), Math.sin(ang), 0.5);
        later(0.14, () => {
          if (!e.alive) return;
          Sfx.clang(0.4);
          a.chestWorld(_v3); emitSparks(_v3.lerp(ch.chestWorld(new THREE.Vector3()), 0.5), 8, 0xffe0a0, 3);
        });
      }
      if (e.t > e.duelT) {
        a.startSlash(Math.random() - 0.5, -1, 0.5);
        later(0.14, () => killEnemy(e, a, true));
        e.t = -99;
      }
      break;
    }
  }
  ch.update(dt);
}

function killEnemy(e, by, quiet = false) {
  if (!e.alive) return;
  e.alive = false; e.state = 'dead';
  if (e.duelAlly) e.duelAlly.duel = null;
  e.ch.setGlint(0);
  _v.subVectors(e.ch.pos, by.pos);
  e.ch.die(1);
  e.ch.chestWorld(_v2);
  emitSparks(_v2, quiet ? 10 : 22, 0xff3b30, 4);
  if (!quiet) G.kills++;
  Sfx.cut(quiet ? 0.5 : 1);
  Sfx.cry();
}

function playerKilled(e) {
  G.state = 'dead'; G.stateT = 0;
  player.die(1);
  G.redFlash = 1; G.camShake = 0.6; G.slowmo = 0.25;
  Sfx.cut(1); Sfx.gameover(); Sfx.groan();
  player.chestWorld(_v); emitSparks(_v, 30, 0xff2a20, 3);
  banner('無念……', `${e.def.name || '吉良家家臣'}の刃に倒れた`, 3);
  hint('');
  later(0.6, () => showResult(false));
}

// =====================================================================
// 斬撃入力（フルーツニンジャ式：なぞった軌跡で斬る）
// =====================================================================
const swipe = { active: false, pts: [], id: 0, cuts: 0, blocked: false, whiffed: false, lastCutT: 0 };
const trailPts = []; // 画面上の残光
let pointerId = null;

function screenOf(v3) {
  const p = _v3.copy(v3).project(camera);
  return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, z: p.z };
}
function screenRadius(ch, r = 0.38) {
  ch.chestWorld(_v);
  const a = screenOf(_v);
  _v2.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(r).add(_v);
  const b = screenOf(_v2);
  return { x: a.x, y: a.y, r: Math.hypot(b.x - a.x, b.y - a.y), z: a.z };
}
function segCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((cx - ax) * dx + (cy - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t - cx, py = ay + dy * t - cy;
  return px * px + py * py <= r * r;
}

function onDown(x, y) {
  Sfx.init();
  if (G.state === 'dead' || G.state === 'win' || G.state === 'title') return;
  swipe.active = true; swipe.pts = [{ x, y, t: performance.now() }];
  swipe.id++; swipe.cuts = 0; swipe.blocked = false; swipe.whiffed = false;
  trailPts.push({ x, y, t: performance.now(), br: true });
}
function onMove(x, y) {
  if (!swipe.active) return;
  const now = performance.now();
  const prev = swipe.pts[swipe.pts.length - 1];
  if (Math.hypot(x - prev.x, y - prev.y) < 2) return;
  swipe.pts.push({ x, y, t: now });
  trailPts.push({ x, y, t: now });
  processSegment(prev, { x, y, t: now });
}
function onUp() { swipe.active = false; if (trailPts.length) trailPts[trailPts.length - 1].end = true; }

function swipeDir() {
  const pts = swipe.pts;
  const a = pts[Math.max(0, pts.length - 5)], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = -(b.y - a.y);
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

function cuttables() {
  const list = enemies.filter((e) => e.alive && e.state !== 'wait' && (e.state !== 'approach' || e.t > 0.2));
  if (kira && G.state === 'kira') list.push(kira);
  return list;
}

function processSegment(a, b) {
  if (!(G.state === 'fight' || G.state === 'kira' || G.state === 'walk')) return;
  const dt = Math.max(1, b.t - a.t);
  const speed = Math.hypot(b.x - a.x, b.y - a.y) / dt; // px/ms
  if (speed < 0.45 || swipe.blocked) return;
  const dir = swipeDir();
  let hitAny = false;
  for (const e of cuttables()) {
    if (e.cutId === swipe.id) continue;
    const dist = e.ch.pos.distanceTo(player.pos);
    if (dist > 6.5) continue;
    const sr = screenRadius(e.ch, 0.42);
    if (sr.z > 1) continue;
    // 胴と頭・腰の3点で判定
    const r = Math.max(sr.r, 26);
    if (segCircle(a.x, a.y, b.x, b.y, sr.x, sr.y, r) ||
        segCircle(a.x, a.y, b.x, b.y, sr.x, sr.y - r * 1.1, r * 0.8) ||
        segCircle(a.x, a.y, b.x, b.y, sr.x, sr.y + r * 1.2, r * 0.8)) {
      e.cutId = swipe.id;
      hitAny = true;
      doCut(e, dir, speed);
      if (swipe.blocked) break;
    }
  }
  // 空振り（大きく速いフリックなら刀を振る）
  if (!hitAny && !swipe.whiffed && player.mode !== 'slash') {
    const p0 = swipe.pts[0];
    if (Math.hypot(b.x - p0.x, b.y - p0.y) > 90 && speed > 0.8) {
      swipe.whiffed = true;
      player.startSlash(-dir.x, dir.y, 0.56);
      Sfx.swing();
    }
  }
}

function angleDiffMod180(a, b) {
  let d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

const pendingCuts = [];
function later(t, fn) { pendingCuts.push({ t, fn }); }
function doCut(e, dir, speed) {
  // 斬る方向に身体ごと踏み込む
  const target = e.ch.pos;
  _v.subVectors(player.pos, target).setY(0);
  const d = _v.length();
  const stand = e.ty && e.ty.weapon === 'spear' ? 1.25 : 1.15;
  if (d > stand) player.lungeTo = target.clone().add(_v.normalize().multiplyScalar(stand));
  clampToRoom(G.room, player.lungeTo || _v2.copy(player.pos), 0.4);
  player.lungeT = 0.13;
  G.facing = Math.atan2(target.x - player.pos.x, target.z - player.pos.z);
  player.startSlash(-dir.x, dir.y, 0.56);
  Sfx.swing();
  if (swipe.cuts === 0 && (speed > 2.6 || Math.random() < 0.6)) Sfx.kiai(speed > 2.6);

  const sAng = Math.atan2(dir.y, dir.x);
  if (e !== kira && e.state === 'guard' && e.guard !== null && angleDiffMod180(sAng, e.guard) < 0.5) {
    // 受け止められた
    swipe.blocked = true;
    pendingCuts.push({ t: 0.13, fn: () => {
      Sfx.clang(1);
      e.ch.chestWorld(_v2); emitSparks(_v2, 26, 0xffd27a, 5);
      G.camShake = 0.15; G.blocks++;
      comboText('弾かれた！');
      if (e.alive && e.state === 'guard') {
        // 反撃が来る
        e.state = 'windup'; e.t = 0; e.windup = Math.max(0.7, e.ty.windup * 0.75);
        G.attackCD = 0;
        Sfx.shing();
      }
    } });
    return;
  }
  const dmg = speed > 2.6 ? 2 : 1;
  swipe.cuts++;
  const combo = swipe.cuts;
  pendingCuts.push({ t: 0.14, fn: () => {
    if (e === kira) { finishKira(); return; }
    if (!e.alive) return;
    e.hp -= dmg;
    e.ch.hit();
    G.camShake = Math.max(G.camShake, 0.12);
    G.hitStop = 0.05;
    if (e.hp <= 0) {
      killEnemy(e, player);
      if (combo >= 2) { comboText(['', '', '二人斬り！', '三人斬り！', '四人斬り！', '五人斬り！'][Math.min(5, combo)]); G.maxCombo = Math.max(G.maxCombo, combo); }
      else comboText(dmg === 2 ? '剛斬！' : slashName(dir));
    } else {
      Sfx.cut(0.6);
      e.ch.chestWorld(_v2); emitSparks(_v2, 12, 0xff5a40, 3);
      comboText(dmg === 2 ? '剛斬！' : '浅い！');
      e.state = 'stagger'; e.t = 0;
      e.ch.setGlint(0);
    }
  } });
}

function slashName(dir) {
  const a = Math.atan2(dir.y, dir.x) * 180 / Math.PI;
  const ab = Math.abs(a);
  if (ab < 25 || ab > 155) return '横一文字';
  if (a > 65 && a < 115) return '斬り上げ';
  if (a < -65 && a > -115) return '唐竹割り';
  if (a > 0) return '逆袈裟';
  return '袈裟斬り';
}

// ポインタ
canvas.addEventListener('pointerdown', (ev) => { if (pointerId !== null) return; pointerId = ev.pointerId; canvas.setPointerCapture(ev.pointerId); onDown(ev.clientX, ev.clientY); });
canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerId !== pointerId) return;
  const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
  for (const c of (evs.length ? evs : [ev])) onMove(c.clientX, c.clientY);
});
const up = (ev) => { if (ev.pointerId !== pointerId) return; pointerId = null; onUp(); };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);

// キーボード：矢印キーの向きに、最も近い敵をなぞる
addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' || ev.key === 'p') { togglePause(); return; }
  const map = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], d: [1, 0], a: [-1, 0], w: [0, -1], s: [0, 1] };
  const k = map[ev.key];
  if (!k) return;
  ev.preventDefault();
  Sfx.init();
  const list = cuttables().filter((e) => e.ch.pos.distanceTo(player.pos) < 6.5);
  let cx = innerWidth / 2, cy = innerHeight / 2;
  if (list.length) {
    list.sort((p, q) => p.ch.pos.distanceTo(player.pos) - q.ch.pos.distanceTo(player.pos));
    const target = list.find((e) => e.state === 'windup') || list[0];
    const sr = screenRadius(target.ch);
    cx = sr.x; cy = sr.y;
  }
  const L = 160, now = performance.now();
  onDown(cx - k[0] * L, cy - k[1] * L);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    swipe.pts.push({ x: cx - k[0] * L + k[0] * 2 * L * i / steps, y: cy - k[1] * L + k[1] * 2 * L * i / steps, t: now + i * 12 });
    trailPts.push({ ...swipe.pts[swipe.pts.length - 1], t: now });
    processSegment(swipe.pts[swipe.pts.length - 2], swipe.pts[swipe.pts.length - 1]);
  }
  onUp();
});

// =====================================================================
// 進行
// =====================================================================
function resetAll() {
  enemies.forEach((e) => scene.remove(e.ch.root));
  enemies = [];
  if (kira) { scene.remove(kira.ch.root); kira = null; }
  STOPS.forEach((s) => { s.spawned = false; s.done = false; });
  Object.assign(G, { s: 0, stopIdx: 0, playTime: 0, kills: 0, retries: 0, maxCombo: 0, blocks: 0, slowmo: 1, redFlash: 0, whiteFlash: 0, attackCD: 0, lastRoomName: '' });
  player.mode = 'ready'; player.body.rotation.set(0, 0, 0);
  placeAtRail(0);
}
function placeAtRail(s) {
  G.s = s;
  const pos = railAt(s, new THREE.Vector3()), dir = railDirSmooth(s, new THREE.Vector3());
  player.setPosition(pos.x, pos.z);
  player.setYaw(Math.atan2(dir.x, dir.z));
  G.facing = player.facingYaw;
  allies.forEach((a, i) => {
    const ap = railAt(s - 4.4 - i * 1.0, new THREE.Vector3());
    a.ch.setPosition(ap.x + (i % 2 ? 0.8 : -0.8), ap.z);
    a.ch.setYaw(player.facingYaw);
    a.ch.mode = 'ready';
    a.duel = null;
  });
  railAt(Math.max(0, s - 3.5), _v);
  camera.position.set(_v.x, 2.4, _v.z);
  camera.lookAt(player.pos.x, 1.3, player.pos.z);
}

function startGame() {
  Sfx.init();
  resetAll();
  document.body.classList.add('playing');
  $('title').classList.remove('show'); $('result').classList.remove('show');
  G.state = 'intro'; G.stateT = 0;
  banner('元禄十五年十二月十四日', '寅の上刻　本所松坂町・吉良邸', 3.2);
  Sfx.drum(0); Sfx.drum(0.6); Sfx.drum(1.1);
  Sfx.windStart();
}

function retryStop() {
  const st = STOPS[G.stopIdx];
  clearStopEnemies(st);
  if (kira) { scene.remove(kira.ch.root); kira = null; }
  // 次の場面の先行配置も消す
  STOPS.forEach((s, i) => { if (i > G.stopIdx && s.spawned) clearStopEnemies(s); });
  G.retries++;
  player.mode = 'ready'; player.body.rotation.set(0, 0, 0); player.body.position.set(0, 0, 0);
  placeAtRail(Math.max(0, st.s - 4));
  G.slowmo = 1; G.redFlash = 0; G.attackCD = 1;
  $('result').classList.remove('show');
  G.state = 'walk'; G.stateT = 0;
  st.done = false;
}

function arriveStop(st) {
  G.stateT = 0;
  G.room = roomAtWorld(player.pos.x, player.pos.z);
  if (st.event === 'futon') {
    G.state = 'event';
    banner('夜具に手を差し入れる……', 'まだ温かい！ 遠くへは逃げておらぬ、探せ！', 3);
    st.eventEnd = 3;
    return;
  }
  if (!st.spawned) spawnStop(st);
  if (st.event === 'finale') {
    G.state = 'event';
    banner('炭俵の陰に人の気配……', '曲者が潜んでおるぞ！', 2.2);
    st.eventEnd = 1.6;
    st.thenFight = true;
    return;
  }
  G.state = 'fight';
  if (st.intro) banner(st.title, st.intro, 2.2);
  if (st.enemies && st.enemies.some((d) => d.name)) Sfx.voice('ao', 0.7, 110, 150, 0.45, 0.8, 0.3);
  else banner(st.title, '', 1.6);
  engageStop(st);
  G.attackCD = 1.2;
  if (st.tutorial && !G.tutorialShown) {
    G.tutorialShown = true;
    hint('敵をなぞるようにフリックして斬れ！\n点線「受」と同じ向きは弾かれる／刀が赤く光ったら先に斬れ');
  }
}

function stopCleared(st) {
  st.done = true;
  if (st.event === 'finale') { revealKira(); return; }
  hint('');
  G.state = 'walk';
  Sfx.drum(0.2);
  G.stopIdx++;
}

function revealKira() {
  G.state = 'event'; G.stateT = 0;
  const ch = new Character('kira', { name: '吉良上野介' });
  const p = P(500, 471);
  ch.setPosition(p.x, p.z);
  ch.setYaw(Math.PI);
  ch.setMode('cower');
  scene.add(ch.root);
  kira = { ch, alive: true, isKira: true, ty: {}, state: 'cower', cutId: -1 };
  banner('白綾の小袖の老人……', '眉間の古傷――吉良上野介に相違なし！', 3.2);
  G.facing = Math.atan2(p.x - player.pos.x, p.z - player.pos.z);
  later(3.3, () => {
    if (G.state !== 'event') return;
    G.state = 'kira';
    banner('吉良上野介、覚悟！', '亡き殿の無念、今こそ晴らす――', 2.6);
    Sfx.say('吉良上野介、覚悟！', { pitch: 0.5, rate: 1.0 });
    hint('吉良をフリックで斬れ！');
  });
}

function finishKira() {
  if (!kira || !kira.alive) return;
  kira.alive = false;
  G.state = 'win'; G.stateT = 0;
  G.slowmo = 0.2; G.whiteFlash = 1;
  kira.ch.die(1);
  kira.ch.chestWorld(_v); emitSparks(_v, 30, 0xff3b30, 3);
  Sfx.cut(1); Sfx.kiai(true); Sfx.cry(true);
  later(1.2, () => Sfx.say('えい、えい、おう！', { pitch: 0.7, rate: 0.9 }));
  Sfx.drum(0.6); Sfx.drum(1.2); Sfx.drum(1.7);
  hint('');
  banner('本懐成就', '元禄十五年十二月十五日　未明', 4);
  later(0.9, () => showResult(true));
}

function showResult(win) {
  const t = G.playTime;
  const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
  $('resultTitle').textContent = win ? '本懐成就' : '無念';
  $('resultText').innerHTML = win
    ? '<p>赤穂浪士四十七士は吉良上野介を討ち取り、主君・浅野内匠頭の無念を晴らした。</p><p>一行は雪の江戸の町を、亡君の眠る<b>泉岳寺</b>へと引き揚げていった。</p>'
    : '<p>大石内蔵助は敵の刃に倒れた……。</p><p>刀が赤く光った敵を先に斬れ。構えた刀と同じ向きに斬ると弾かれるぞ。</p>';
  const rank = !win ? '' : G.retries === 0 && t < 240 ? '天晴れ　義士の鑑' : G.retries <= 2 ? '見事なり' : '本懐を遂げたり';
  $('resultStats').innerHTML =
    `<dt>討ち入り時間</dt><dd>${mm}分${String(ss).padStart(2, '0')}秒</dd>` +
    `<dt>斬り伏せた敵</dt><dd>${G.kills}人</dd>` +
    `<dt>最大連斬</dt><dd>${G.maxCombo || 1}人</dd>` +
    `<dt>やり直し</dt><dd>${G.retries}回</dd>` +
    (win ? `<dt>評価</dt><dd>${rank}</dd>` : '');
  $('retryHere').style.display = win ? 'none' : '';
  $('result').classList.add('show');
  if (win) {
    try {
      const best = +localStorage.getItem('ako-best') || Infinity;
      if (t < best) localStorage.setItem('ako-best', String(t));
    } catch (e) { /* 保存不可 */ }
  }
}

function togglePause() {
  if (G.state === 'title' || G.state === 'win' || G.state === 'dead') return;
  if (G.state === 'paused') { G.state = G.prevState; $('pause').classList.remove('show'); }
  else { G.prevState = G.state; G.state = 'paused'; $('pause').classList.add('show'); }
}

$('startBtn').onclick = startGame;
$('howtoBtn').onclick = () => { $('title').classList.remove('show'); $('howto').classList.add('show'); };
$('howtoBack').onclick = () => { $('howto').classList.remove('show'); $('title').classList.add('show'); };
addEventListener('pointerdown', () => { Sfx.init(); if (G.state === 'title') Sfx.music('title'); }, { once: true });
$('retryBtn').onclick = startGame;
$('retryHere').onclick = retryStop;
$('resumeBtn').onclick = togglePause;
$('pauseBtn').onclick = togglePause;
$('muteBtn').onclick = () => { $('muteBtn').classList.toggle('off', Sfx.toggle()); };
try {
  const best = +localStorage.getItem('ako-best');
  if (best) $('bestTime').textContent = `最速の本懐成就：${Math.floor(best / 60)}分${String(Math.floor(best % 60)).padStart(2, '0')}秒`;
} catch (e) { /* 保存不可 */ }

// =====================================================================
// 更新
// =====================================================================
const camTarget = new THREE.Vector3(), camLook = new THREE.Vector3(), camLookCur = new THREE.Vector3(0, 1.2, 0);
const tmpDir = new THREE.Vector3();

function update(dt) {
  G.t += dt;
  if (G.state === 'paused') return;
  if (G.hitStop > 0) { G.hitStop -= dt; dt *= 0.15; }
  G.slowmo = Math.min(1, G.slowmo + dt * 0.5);
  dt *= G.slowmo;
  G.stateT += dt;
  if (['walk', 'fight', 'event', 'kira'].includes(G.state)) G.playTime += dt;
  G.attackCD = Math.max(0, G.attackCD - dt);

  for (let i = pendingCuts.length - 1; i >= 0; i--) {
    pendingCuts[i].t -= dt;
    if (pendingCuts[i].t <= 0) { const f = pendingCuts[i].fn; pendingCuts.splice(i, 1); f(); }
  }

  const st = STOPS[G.stopIdx];

  // ---- 主人公の移動 ----
  if (G.state === 'intro') {
    if (G.stateT > 2.6) { G.state = 'walk'; G.stateT = 0; banner('かかれっ！', '大石内蔵助、表門より討ち入る', 1.8); Sfx.shout(); Sfx.say('かかれーっ！', { pitch: 0.55, rate: 1.1 }); }
  }
  if (G.state === 'walk') {
    const target = st ? st.s : RAIL_TOTAL;
    const speed = 3.2;
    const prevS = G.s;
    G.s = Math.min(target, G.s + speed * dt);
    railAt(G.s, _v);
    player.setPosition(_v.x, _v.z);
    railDirSmooth(G.s, tmpDir);
    G.facing = Math.atan2(tmpDir.x, tmpDir.z);
    player.walk = THREE.MathUtils.lerp(player.walk, (G.s - prevS) / dt / 3.2, 0.2);
    // 次の場面の敵を先に配置
    if (st && !st.spawned && st.enemies && st.s - G.s < 9 && st.event !== 'finale') spawnStop(st);
    if (st && G.s >= st.s - 0.001) arriveStop(st);
  } else {
    player.walk = THREE.MathUtils.lerp(player.walk, 0, 0.15);
  }
  if (player.lungeT > 0 && player.lungeTo) {
    const k = Math.min(1, dt / player.lungeT);
    player.pos.lerp(player.lungeTo, k);
    player.lungeT -= dt;
    if (player.lungeT <= 0) player.lungeTo = null;
  }
  if (G.state !== 'dead') {
    let d = G.facing - player.facingYaw;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    player.setYaw(player.facingYaw + d * Math.min(1, dt * 9));
  }
  if (G.state === 'fight' || G.state === 'kira') {
    // 戦闘中は自然体で中段に構える
    if (player.mode !== 'slash') player.setMode('ready');
  }
  player.update(dt);
  updateTrail(player, player.swinging || (player.mode === 'slash' && player.modeT < player.modeDur * 0.45));

  G.room = roomAtWorld(player.pos.x, player.pos.z);
  const roomName = G.room ? G.room.name : (player.pos.x > 50 ? '表門' : '前庭');
  if (roomName !== G.lastRoomName) { G.lastRoomName = roomName; hud.loc.textContent = roomName; }
  hud.prog.style.width = (100 * G.s / RAIL_TOTAL).toFixed(1) + '%';

  // ---- 同志 ----
  allies.forEach((a, i) => {
    const ch = a.ch;
    let target;
    if (a.duel && a.duel.alive && a.duel.state === 'duel') {
      target = null;
      ch.faceTo(a.duel.ch.pos.x, a.duel.ch.pos.z, 1, dt);
      ch.walk = THREE.MathUtils.lerp(ch.walk, 0, 0.2);
    } else if (G.state === 'walk' || G.state === 'intro') {
      // 歩行中はカメラの後ろ（視界を塞がない位置）に続く
      const back = 4.4 + i * 1.0;
      target = railAt(Math.max(-6, G.s - back), new THREE.Vector3());
      railDirSmooth(G.s - back, tmpDir);
      if (G.s - back < 0) target.addScaledVector(tmpDir, G.s - back);
      const side = (i % 2 ? 1 : -1) * 0.85;
      target.x += tmpDir.z * side; target.z -= tmpDir.x * side;
      clampToRoom(roomAtWorld(target.x, target.z), target, 0.45);
    } else {
      const offs = [[-1.3, -0.7], [1.3, -0.7], [-0.9, -1.8], [0.9, -1.8], [0, -2.5]][i];
      const f = G.facing;
      target = new THREE.Vector3(player.pos.x + Math.cos(f) * offs[0] + Math.sin(f) * offs[1], 0, player.pos.z - Math.sin(f) * offs[0] + Math.cos(f) * offs[1]);
      clampToRoom(G.room, target, 0.45);
    }
    if (target) {
      _v.subVectors(target, ch.pos).setY(0);
      const d = _v.length();
      const sp = Math.min(d * 3, 4.2);
      if (d > 0.05) {
        ch.pos.addScaledVector(_v.normalize(), Math.min(d, sp * dt));
        if (d > 0.3) ch.faceTo(target.x, target.z, 0.8, dt);
      }
      if (d < 0.6 && (G.state === 'fight' || G.state === 'kira')) {
        const foe = enemies.find((e) => e.alive && !e.ally) || kira;
        if (foe) ch.faceTo(foe.ch.pos.x, foe.ch.pos.z, 0.5, dt);
      }
      ch.walk = THREE.MathUtils.lerp(ch.walk, Math.min(1, sp / 3.2), 0.15);
    }
    ch.update(dt);
  });
  if (allies[0].ch.lantern) {
    allies[0].ch.root.updateMatrixWorld(true);
    allies[0].ch.lantern.getWorldPosition(lanternLight.position);
    lanternLight.intensity = 8 + Math.sin(G.t * 13) * 0.6 + Math.sin(G.t * 7.3) * 0.5;
  }

  // ---- 敵 ----
  for (const e of enemies) updateEnemy(e, dt);
  enemies = enemies.filter((e) => !e.removed);
  if (kira) kira.ch.update(dt);

  if (G.state === 'fight' && st && st.enemies && enemies.filter((e) => e.stop === st && e.alive).length === 0 && G.stateT > 0.5) {
    stopCleared(st);
  }
  if (G.state === 'event' && st && st.eventEnd && G.stateT > st.eventEnd) {
    if (st.thenFight) {
      st.thenFight = false; st.eventEnd = 0;
      G.state = 'fight'; G.stateT = 0;
      engageStop(st);
      G.attackCD = 0.6;
      banner('曲者！', '吉良家の家臣が斬りかかる！', 1.6);
      Sfx.say('曲者！', { pitch: 0.8, rate: 1.2 });
    } else if (st.event === 'futon') {
      st.eventEnd = 0;
      st.done = true; G.stopIdx++; G.state = 'walk';
    }
  }

  // ---- カメラ ----
  updateCamera(dt);
  moon.position.set(player.pos.x - 25, 40, player.pos.z - 18);
  moon.target.position.set(player.pos.x, 0, player.pos.z);
  updateLightPool(player.pos, dt);
  updateSnow(dt, G.t);
  updateSparks(dt);
  Sfx.update(G);
  Sfx.music(musicFor());

  msgTimer -= dt / Math.max(0.2, G.slowmo);
  if (msgTimer <= 0) hud.msg.parentElement.classList.remove('show');
  comboTimer -= dt;
  if (comboTimer <= 0) hud.combo.classList.remove('pop');
}

function musicFor() {
  switch (G.state) {
    case 'title': return 'title';
    case 'fight': return 'fight';
    case 'kira': return 'kira';
    case 'event': return kira ? 'kira' : 'walk';
    case 'dead': return 'dead';
    case 'win': return 'win';
    case 'paused': return null;
    default: return 'walk';
  }
}

function updateCamera(dt) {
  const indoor = !!G.room;
  if (G.state === 'title') {
    const t = G.t * 0.05;
    camTarget.set(Math.cos(t) * 30 + 40, 14, Math.sin(t) * 12);
    camLook.set(30, 0, 0);
  } else if (G.state === 'walk' || G.state === 'intro') {
    railAt(Math.max(-4, G.s - 3.4), camTarget);
    if (G.s < 3.4) { railDirSmooth(0, tmpDir); camTarget.copy(railPts[0]).addScaledVector(tmpDir, G.s - 3.4); }
    camTarget.y = indoor ? 2.05 : 2.5;
    railDirSmooth(G.s, tmpDir);
    camLook.copy(player.pos).addScaledVector(tmpDir, 3).setY(1.25);
  } else {
    const f = G.facing;
    const back = G.state === 'kira' || (G.state === 'event' && kira) ? 2.4 : 3.0;
    camTarget.set(player.pos.x - Math.sin(f) * back - Math.cos(f) * 0.55, indoor ? 2.0 : 2.3, player.pos.z - Math.cos(f) * back + Math.sin(f) * 0.55);
    // 敵の重心を注視
    const foes = enemies.filter((e) => e.alive && !e.ally && e.state !== 'wait');
    camLook.copy(player.pos).add(_v.set(Math.sin(f), 0, Math.cos(f)).multiplyScalar(2.2));
    if (foes.length) {
      const c = new THREE.Vector3();
      foes.forEach((e) => c.add(e.ch.pos)); c.divideScalar(foes.length);
      camLook.lerp(c, 0.5);
    }
    if (kira && (G.state === 'kira' || G.state === 'event' || G.state === 'win')) camLook.lerp(kira.ch.pos, 0.6);
    camLook.y = G.state === 'kira' || G.state === 'win' ? 0.8 : 1.15;
    if (G.state === 'dead') { camTarget.y = 3.2; camLook.copy(player.pos).setY(0.4); }
    if (indoor) clampToRoom(G.room, camTarget, 0.25);
  }
  if (indoor) camTarget.y = Math.min(camTarget.y, WALL_H - 0.3);
  const k = 1 - Math.exp(-dt * (G.state === 'walk' ? 5 : 3.5));
  camera.position.lerp(camTarget, k);
  camLookCur.lerp(camLook, 1 - Math.exp(-dt * 6));
  if (G.camShake > 0) {
    G.camShake = Math.max(0, G.camShake - dt);
    camera.position.x += (Math.random() - 0.5) * G.camShake * 0.4;
    camera.position.y += (Math.random() - 0.5) * G.camShake * 0.4;
  }
  camera.lookAt(camLookCur);
}

// =====================================================================
// 2Dオーバーレイ（なぞった残光・構え・危険表示）
// =====================================================================
function drawOverlay() {
  const dpr = devicePixelRatio;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, innerWidth, innerHeight);
  const now = performance.now();

  // 構えと振りかぶりの表示
  if (G.state === 'fight' || G.state === 'kira' || G.state === 'event') {
    for (const e of enemies) {
      if (!e.alive || e.ally || e.state === 'wait') continue;
      e.ch.root.updateMatrixWorld(true);
      const sr = screenRadius(e.ch, 0.42);
      if (sr.z > 1) continue;
      const r = Math.max(sr.r, 22);
      if (e.state === 'guard' && e.guard !== null) {
        // 受けの向き（この向きの斬撃は弾かれる）
        const a = -e.guard;
        octx.save();
        octx.translate(sr.x, sr.y);
        octx.rotate(a);
        octx.strokeStyle = 'rgba(160,200,255,.55)'; octx.lineWidth = 3; octx.setLineDash([6, 6]);
        octx.beginPath(); octx.moveTo(-r * 1.6, 0); octx.lineTo(r * 1.6, 0); octx.stroke();
        octx.setLineDash([]);
        octx.restore();
        octx.fillStyle = 'rgba(200,225,255,.85)'; octx.font = `bold ${Math.round(r * 0.5)}px "Shippori Mincho", serif`;
        octx.textAlign = 'center'; octx.fillText('受', sr.x + r * 1.1, sr.y - r * 1.4);
      }
      if (e.state === 'windup') {
        const k = Math.min(1, e.t / e.windup);
        octx.strokeStyle = `rgba(255,${80 - 60 * k},${60 - 50 * k},${0.5 + 0.5 * k})`;
        octx.lineWidth = 3 + 3 * k;
        octx.beginPath(); octx.arc(sr.x, sr.y, r * (2.6 - 1.4 * k), 0, Math.PI * 2); octx.stroke();
        octx.fillStyle = '#ff3b30'; octx.font = `bold ${Math.round(r * 1.1)}px "Shippori Mincho", serif`; octx.textAlign = 'center';
        octx.fillText('!', sr.x, sr.y - r * 2.2);
      }
      if (e.def.name) {
        octx.fillStyle = 'rgba(255,240,220,.9)'; octx.font = `bold ${Math.max(12, Math.round(r * 0.45))}px "Shippori Mincho", serif`; octx.textAlign = 'center';
        octx.fillText(e.def.name, sr.x, sr.y - r * 2.9);
        // 体力
        for (let i = 0; i < e.maxHp; i++) {
          octx.fillStyle = i < e.hp ? '#e33' : 'rgba(255,255,255,.2)';
          octx.fillRect(sr.x - e.maxHp * 7 + i * 14, sr.y - r * 2.75, 11, 4);
        }
      }
    }
    if (kira && G.state === 'kira') {
      const sr = screenRadius(kira.ch, 0.42);
      const pulse = 1 + Math.sin(now / 150) * 0.1;
      octx.strokeStyle = 'rgba(255,220,120,.8)'; octx.lineWidth = 2;
      octx.beginPath(); octx.arc(sr.x, sr.y, Math.max(sr.r, 30) * 1.8 * pulse, 0, Math.PI * 2); octx.stroke();
      octx.fillStyle = 'rgba(255,240,220,.95)'; octx.font = 'bold 18px "Shippori Mincho", serif'; octx.textAlign = 'center';
      octx.fillText('吉良上野介', sr.x, sr.y - Math.max(sr.r, 30) * 2.3);
    }
  }

  // なぞった軌跡（刀光）
  while (trailPts.length && now - trailPts[0].t > 220) trailPts.shift();
  if (trailPts.length > 1) {
    octx.lineCap = 'round'; octx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < trailPts.length; i++) {
        const a = trailPts[i - 1], b = trailPts[i];
        if (a.end || b.br) continue;
        const age = (now - b.t) / 220;
        const w = (1 - age) * (pass ? 4 : 14);
        if (w <= 0) continue;
        octx.strokeStyle = pass ? `rgba(255,255,255,${1 - age})` : `rgba(140,190,255,${0.35 * (1 - age)})`;
        octx.lineWidth = w;
        octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(b.x, b.y); octx.stroke();
      }
    }
  }

  // 画面効果
  if (G.redFlash > 0) {
    octx.fillStyle = `rgba(160,0,0,${G.redFlash * 0.45})`; octx.fillRect(0, 0, innerWidth, innerHeight);
    G.redFlash = Math.max(0.35, G.redFlash - 0.01);
  }
  if (G.whiteFlash > 0) {
    octx.fillStyle = `rgba(255,255,255,${G.whiteFlash})`; octx.fillRect(0, 0, innerWidth, innerHeight);
    G.whiteFlash = Math.max(0, G.whiteFlash - 0.015);
  }
  // 危険が迫ると画面の縁が赤く
  const danger = enemies.find((e) => e.alive && e.state === 'windup');
  if (danger) {
    const k = Math.min(1, danger.t / danger.windup);
    const grd = octx.createRadialGradient(innerWidth / 2, innerHeight / 2, Math.min(innerWidth, innerHeight) * 0.35, innerWidth / 2, innerHeight / 2, Math.max(innerWidth, innerHeight) * 0.75);
    grd.addColorStop(0, 'rgba(180,0,0,0)'); grd.addColorStop(1, `rgba(180,0,0,${0.15 + 0.3 * k})`);
    octx.fillStyle = grd; octx.fillRect(0, 0, innerWidth, innerHeight);
  }
}

// =====================================================================
// ループ
// =====================================================================
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  renderer.render(scene, camera);
  drawOverlay();
  requestAnimationFrame(frame);
}
placeAtRail(0);
G.state = 'title';
frame();

// デバッグ・テスト用
function sim(sec, step = 1 / 30) {
  for (let t = 0; t < sec; t += step) { update(step); scene.updateMatrixWorld(); camera.updateMatrixWorld(); }
}
window.__ako = { sim, G, STOPS, enemies: () => enemies, player, startGame, retryStop, camera, kira: () => kira, RAIL_TOTAL };
