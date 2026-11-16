// 忠臣蔵 赤穂浪士の討ち入り — メイン
import * as THREE from 'three';
import { buildWorld, RAIL, P, roomAtWorld, clampToRoom, WALL_H } from './world.js';
import { Character, setCharacterShadows, loadAssets } from './characters.js';
import { loadMocap } from './mocap.js';
import * as TX from './textures.js';
import { Sfx } from './audio.js';
import { T, lang, setLang, applyStatic } from './i18n.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';

// =====================================================================
// 初期化
// =====================================================================
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
// スマホ・タブレット（アプリを含む）は軽い設定：影は足元の丸い影だけ、解像度を抑え、光のにじみ等の仕上げを省く
const lowEnd = isTouch;
const quality = {
  shadows: !lowEnd, shadowSize: 2048,
  pixelRatio: Math.min(devicePixelRatio, lowEnd ? 1.25 : 2),
  post: !lowEnd, lights: lowEnd ? 3 : 6, snow: lowEnd ? 700 : 3500,
};
if (lowEnd) document.body.classList.add('lite');
setCharacterShadows(quality.shadows);
if (isTouch) document.body.classList.add('touch');

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowEnd, powerPreference: 'high-performance' });
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

// ---- 映像の仕上げ：灯りのにじみ・周辺減光・色調・フィルムの粒子 ----
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.55, 0.82);
composer.addPass(bloom);
const filmPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRed: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uRed; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // 色調：暗部は青く、明部は暖かく
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(c.rgb * vec3(0.86, 0.95, 1.12), c.rgb * vec3(1.08, 1.0, 0.9), smoothstep(0.05, 0.6, l));
      c.rgb = mix(vec3(l), c.rgb, 0.88);              // 彩度を少し落とす
      // 周辺減光
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - smoothstep(0.35, 0.85, length(d * vec2(1.1, 1.0))) * 0.62;
      c.rgb = mix(c.rgb, c.rgb * vec3(1.5, 0.35, 0.3), uRed);
      // フィルムの粒子
      c.rgb += (rnd(vUv * 731.0) - 0.5) * 0.035;
      gl_FragColor = c;
    }`,
});
composer.addPass(filmPass);
composer.addPass(new OutputPass());

const overlay = document.getElementById('fx');
const octx = overlay.getContext('2d');

let baseFov = 58;
const OVERLAY_DPR = Math.min(devicePixelRatio, lowEnd ? 1.5 : 2);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  if (typeof composer !== 'undefined') { composer.setPixelRatio(quality.pixelRatio); composer.setSize(w, h); }
  camera.aspect = w / h;
  camera.fov = w < h ? 72 : 58;
  baseFov = camera.fov;
  camera.updateProjectionMatrix();
  overlay.width = w * OVERLAY_DPR; overlay.height = h * OVERLAY_DPR;
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
for (let i = 0; i < quality.lights; i++) { const l = new THREE.PointLight(0xffa860, 0, 10, 1.6); scene.add(l); lightPool.push(l); }
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
const SNOW_N = quality.snow;
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

// 血しぶきと血の跡
const BLOOD_N = 400;
const bloodGeo = new THREE.BufferGeometry();
const bloodPos = new Float32Array(BLOOD_N * 3).fill(-100);
bloodGeo.setAttribute('position', new THREE.BufferAttribute(bloodPos, 3));
const bloodPts = new THREE.Points(bloodGeo, new THREE.PointsMaterial({ size: 0.045, color: 0x6e0a0a, transparent: true, opacity: 0.95, depthWrite: false, map: TX.snowflakeTex() }));
bloodPts.frustumCulled = false;
scene.add(bloodPts);
const bloodP = [];
let bloodIdx = 0;
const STAIN_N = 220;
const stainMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3d0606, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), STAIN_N);
stainMesh.count = 0; stainMesh.frustumCulled = false;
scene.add(stainMesh);
let stainIdx = 0;
const _m4 = new THREE.Matrix4(), _sq = new THREE.Quaternion(), _sv = new THREE.Vector3();
function addStain(x, z, r) {
  _m4.compose(_sv.set(x, 0.03 + (stainIdx % 7) * 0.001, z), _sq.identity(), new THREE.Vector3(r * (0.7 + Math.random() * 0.6), 1, r));
  stainMesh.setMatrixAt(stainIdx % STAIN_N, _m4);
  stainIdx++;
  stainMesh.count = Math.min(STAIN_N, stainIdx);
  stainMesh.instanceMatrix.needsUpdate = true;
}
function clearBlood() { stainIdx = 0; stainMesh.count = 0; bloodP.length = 0; bloodPos.fill(-100); }
// 斬撃の向き（画面座標）に沿って血が飛ぶ
function emitBlood(p, dir, n) {
  const right = _v3.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().addScaledVector(right, dir.x * (1 + Math.random() * 2.2)).addScaledVector(up, dir.y * (0.8 + Math.random() * 1.6) + 0.8 + Math.random())
      .add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 1.4));
    bloodP[bloodIdx] = { p: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.2)), v, i: bloodIdx };
    bloodIdx = (bloodIdx + 1) % BLOOD_N;
  }
}
function updateBlood(dt) {
  for (let i = 0; i < BLOOD_N; i++) {
    const b = bloodP[i];
    if (!b) continue;
    b.v.y -= 9.8 * dt;
    b.p.addScaledVector(b.v, dt);
    if (b.p.y <= 0.03) {
      if (Math.random() < 0.5) addStain(b.p.x, b.p.z, 0.03 + Math.random() * 0.06);
      bloodP[i] = null; bloodPos[i * 3 + 1] = -100; continue;
    }
    bloodPos[i * 3] = b.p.x; bloodPos[i * 3 + 1] = b.p.y; bloodPos[i * 3 + 2] = b.p.z;
  }
  bloodGeo.attributes.position.needsUpdate = true;
}
// 斬り口の閃光（なぞった角度で一瞬光る）
const slashMarks = [];
const slashMarkGeo = new THREE.PlaneGeometry(1.6, 0.09);
function woundFx(p, dir, k = 1) {
  const m = new THREE.Mesh(slashMarkGeo, new THREE.MeshBasicMaterial({ map: TX.slashFlashTex(), color: 0xffd0c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  m.position.copy(p);
  m.quaternion.copy(camera.quaternion);
  m.rotateZ(Math.atan2(dir.y, dir.x));
  m.renderOrder = 10;
  scene.add(m);
  slashMarks.push({ m, t: 0 });
  emitBlood(p, dir, Math.round(26 * k));
  emitSparks(p, Math.round(8 * k), 0xff4a3a, 2.5);
  // 倒れた後に亡骸の下へ血だまり
}
// ---- 斬った手応えの演出 ----
const strokes = [];   // 画面を走る斬線
const stamps = [];    // 「斬」の印
function slayFx(e, dir, combo, strong) {
  Sfx.slay();
  if (combo >= 2) Sfx.chime(combo);
  e.ch.root.updateMatrixWorld(true);
  e.ch.chestWorld(_v);
  const sp = screenOf(_v);
  const now = performance.now();
  const ang = Math.atan2(dir.y, dir.x);
  strokes.push({ x: sp.x, y: sp.y, ang, len: Math.max(innerWidth, innerHeight) * (strong ? 0.75 : 0.55), t: now, w: strong ? 18 : 12 });
  stamps.push({ x: sp.x + 40 * (Math.random() < 0.5 ? 1 : -1), y: sp.y - 60, t: now, rot: (Math.random() - 0.5) * 0.4, n: combo });
  G.hitStop = Math.max(G.hitStop || 0, strong || combo >= 2 ? 0.12 : 0.08);
  G.whiteFlash = Math.max(G.whiteFlash, combo >= 2 || strong ? 0.35 : 0.18);
  G.fovKick = 1;
  G.camShake = Math.max(G.camShake, strong ? 0.3 : 0.18);
}
function drawSlayFx(now) {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const st = strokes[i];
    const age = (now - st.t) / 1000;
    if (age > 0.55) { strokes.splice(i, 1); continue; }
    const grow = Math.min(1, age / 0.06);
    const fade = age < 0.1 ? 1 : Math.max(0, 1 - (age - 0.1) / 0.45);
    const L = st.len * grow, W = st.w * (1 + age * 1.5);
    octx.save();
    octx.translate(st.x, st.y);
    octx.rotate(-st.ang);
    const lens = (w) => { octx.beginPath(); octx.moveTo(-L, 0); octx.quadraticCurveTo(0, -w, L, 0); octx.quadraticCurveTo(0, w, -L, 0); octx.fill(); };
    octx.shadowColor = 'rgba(255,40,30,.9)'; octx.shadowBlur = 24;
    octx.fillStyle = `rgba(200,20,20,${0.55 * fade})`; lens(W);
    octx.shadowBlur = 0;
    octx.fillStyle = `rgba(255,245,235,${fade})`; lens(W * 0.3);
    // 飛沫
    octx.fillStyle = `rgba(150,10,10,${0.8 * fade})`;
    for (let k = 0; k < 6; k++) { const x = (k / 5 - 0.5) * L * 1.2, y = Math.sin(k * 7.3) * W * 1.6; octx.beginPath(); octx.arc(x, y, 2 + (k % 3) * 1.5, 0, Math.PI * 2); octx.fill(); }
    octx.restore();
  }
  for (let i = stamps.length - 1; i >= 0; i--) {
    const sp = stamps[i];
    const age = (now - sp.t) / 1000;
    if (age > 0.9) { stamps.splice(i, 1); continue; }
    const sc = age < 0.08 ? 1.8 - age * 10 : 1;
    const a = age < 0.55 ? 1 : Math.max(0, 1 - (age - 0.55) / 0.35);
    const S = 46;
    octx.save();
    octx.translate(sp.x, sp.y); octx.rotate(sp.rot); octx.scale(sc, sc);
    octx.globalAlpha = a;
    octx.fillStyle = '#b3261e'; octx.strokeStyle = '#fff'; octx.lineWidth = 2;
    octx.beginPath(); octx.roundRect(-S / 2, -S / 2, S, S, 6); octx.fill(); octx.stroke();
    octx.fillStyle = '#fff'; octx.font = `800 ${S * 0.72}px "Shippori Mincho", serif`; octx.textAlign = 'center'; octx.textBaseline = 'middle';
    octx.fillText('斬', 0, 2);
    octx.restore();
  }
}

function updateSlashMarks(dt) {
  for (let i = slashMarks.length - 1; i >= 0; i--) {
    const s = slashMarks[i];
    s.t += dt;
    const k = s.t / 0.35;
    s.m.scale.set(0.5 + k * 0.8, 1 - k * 0.6, 1);
    s.m.material.opacity = Math.max(0, 1 - k);
    s.m.material.color.setRGB(1, 0.8 - k * 0.6, 0.75 - k * 0.6);
    if (k >= 1) { scene.remove(s.m); s.m.material.dispose(); slashMarks.splice(i, 1); }
  }
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
    { at: [865, 492], t: 'k' }, { at: [920, 493], t: 'r2' }, { at: [860, 466], t: 'r' }, { at: [928, 462], t: 'r2', ally: true }] },
  { wp: 8, title: '通り道の間', enemies: [
    { at: [756, 462], t: 'k' }, { at: [760, 490], t: 's' }, { at: [782, 458], t: 'r' }, { at: [836, 490], t: 'r', ally: true }] },
  { wp: 11, title: '左兵衛居間', intro: '吉良左兵衛の居間。家臣が立ち塞がる！', enemies: [
    { at: [668, 497], t: 'k' }, { at: [672, 535], t: 's' }, { at: [690, 540], t: 'r', ally: true }] },
  { wp: 12, title: '奥の間', intro: '吉良家家老・小林平八郎が立ちはだかる！', enemies: [
    { at: [545, 510], t: 'b1', name: '小林平八郎' }, { at: [560, 485], t: 'r2' }, { at: [560, 535], t: 'r2' },
    { at: [640, 540], t: 'r', ally: true }, { at: [645, 490], t: 'r', ally: true }] },
  { wp: 13, title: '上野介寝所', event: 'futon' },
  { wp: 14, title: '中の間', intro: '山吉新八郎、見参！', enemies: [
    { at: [548, 418], t: 'b3', name: '山吉新八郎' }, { at: [560, 408], t: 'k' }, { at: [630, 410], t: 's' }, { at: [650, 426], t: 'r', ally: true }] },
  { wp: 17, title: '土間', intro: '剣の達人・清水一学が斬りかかる！', enemies: [
    { at: [456, 416], t: 'b2', name: '清水一学' }, { at: [470, 405], t: 'r2' }, { at: [522, 426], t: 'r', ally: true }] },
  { wp: 18, title: '炭部屋', event: 'finale', enemies: [
    { at: [482, 469], t: 'r2' }, { at: [518, 469], t: 'r2' }] },
];
STOPS.forEach((st) => { st.s = railLen[st.wp]; });

// feint: 振りかぶって途中でやめる確率 / shift: 構えを変える間隔(秒) / thrust: 槍の突き
const ETYPES = {
  r: { outfit: 'retainer', hp: 1, guard: false, speed: 2.6, windup: 1.15 },
  r2: { outfit: 'retainer2', hp: 1, guard: true, speed: 2.5, windup: 1.05, feint: 0.12 },
  k: { outfit: 'retainer2', hp: 1, guard: true, speed: 2.7, windup: 1.0, feint: 0.3, shift: 1.6, name: '剣客' },
  s: { outfit: 'retainer', hp: 1, guard: true, speed: 2.2, windup: 1.05, weapon: 'spear', range: 3.0, thrust: true },
  b1: { outfit: 'boss1', hp: 3, guard: true, speed: 2.8, windup: 0.95, boss: true, feint: 0.3, shift: 2.2 },
  b2: { outfit: 'boss2', hp: 4, guard: true, speed: 3.0, windup: 0.85, boss: true, feint: 0.4, shift: 1.5 },
  b3: { outfit: 'boss3', hp: 2, guard: true, speed: 2.8, windup: 0.95, boss: true, feint: 0.25, shift: 2.4 },
};
// 難しさ（自動操作で腕前の違うプレイヤーを再現して決めた値）
const DIFF = {
  windupMul: 0.55,       // 振りかぶりの長さの倍率
  open: 0.2,          // 振りかぶりの初めのこの割合までは「隙」：普通に斬れば止められる
  counterWin: 0.35,   // 返し技を受け付ける時間（斬撃の直前、秒）
  counterDot: -0.75,  // 返し技の向きの許容（-1 に近いほど厳しい）
  attackers: 2,       // 同時に斬りかかってくる敵の数（4場面目から）
  gap: 0,             // 斬撃のあと次の敵が斬りかかるまでの間（秒）
  waitBase: 0.4, waitRand: 0.6,  // 構えてから斬りかかるまでの時間
  redo: 1,            // やり直しの回数（Web版）
  appRedo: 5,         // アプリ版：広告を見てやり直せる回数
  bossHp: 2,          // 強敵の体力の倍率
  hp: 2,              // ふつうの家臣の体力（何太刀で倒れるか）
  guardTol: 0.9,      // 受けの構えで弾かれる向きの幅（ラジアン）
};
const DAWN = 420;           // 夜明けまで（秒）
const STRIKE_DIRS = [[0, -1], [0.7, -0.7], [-0.7, -0.7], [1, 0], [-1, 0]];
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
  return { ch: c, i, name: n, duel: null, duelT: 0, hp: 2, down: false };
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
  score: 0, counters: 0, scoreParts: { kill: 0, counter: 0, clear: 0 }, stopStartT: 0, snap: null, dawnShown: false,
  swings: 0, hits: 0, whiffRow: 0, tired: 0,
};

const $ = (id) => document.getElementById(id);
const hud = { dawn: $('hudDawn'), score: $('hudScore'), allies: $('hudAllies'), loc: $('hudLoc'), prog: $('hudProg'), msg: $('hudMsg'), sub: $('hudSub'), combo: $('hudCombo'), hint: $('hudHint') };
let msgTimer = 0;
function banner(text, sub = '', dur = 2.4) {
  hud.msg.textContent = T(text); hud.sub.textContent = T(sub);
  hud.msg.parentElement.classList.remove('show'); void hud.msg.offsetWidth;
  hud.msg.parentElement.classList.add('show');
  msgTimer = dur;
}
function hint(text) { hud.hint.textContent = T(text); hud.hint.classList.toggle('show', !!text); }
let comboTimer = 0;
function comboText(text) {
  hud.combo.textContent = T(text);
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
      ch, def, ty, stop: st, hp: ty.boss ? Math.round(ty.hp * DIFF.bossHp) : Math.max(ty.hp, DIFF.hp), maxHp: ty.boss ? Math.round(ty.hp * DIFF.bossHp) : Math.max(ty.hp, DIFF.hp), ally: !!def.ally, alive: true,
      state: 'wait', t: 0, guard: null, slot: null, duelT: 6 + Math.random() * 3, swingT: Math.random(),
      cutId: -1, deadT: 0, nextShift: 0, strikeDir: null, feint: false, allyAtkT: 1.5 + Math.random() * 2, allyWind: -1,
    });
  }
  st.spawned = true;
}
function clearStopEnemies(st) {
  enemies = enemies.filter((e) => { if (e.stop === st) { e.ch.removeFrom(scene); return false; } return true; });
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
    const standing = allies.filter((a) => !a.down && !a.duel);
    if (e.ally && standing.length) {
      e.duelAlly = standing[(ai++ + 1) % standing.length];
      e.duelAlly.duel = e;
    } else {
      e.ally = false;
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

function startWindup(e) {
  e.state = 'windup'; e.t = 0; e.windup = e.ty.windup * (G.stopIdx === 0 ? 1.3 : DIFF.windupMul);
  e.feint = G.stopIdx >= 2 && Math.random() < (e.ty.feint || 0);
  if (e.ty.thrust) e.strikeDir = null;
  else { const d = STRIKE_DIRS[Math.floor(Math.random() * STRIKE_DIRS.length)]; e.strikeDir = { x: d[0], y: d[1] }; }
  Sfx.shing();
  if (Math.random() < 0.6) Sfx.growl();
}

// 同志が斬られる
function woundAlly(al, e) {
  al.hp--;
  al.ch.hit(0.6, -0.8);
  al.ch.chestWorld(_v); woundFx(_v, { x: 0.6, y: -0.8 }, 0.5);
  Sfx.cut(0.6); Sfx.groan();
  if (al.hp <= 0) {
    al.down = true; al.duel = null;
    al.ch.die('down', 1);
    banner(lang === 'en' ? `${T(al.name)} is cut down!` : al.name + '、斬られる！', '', 1.8);
    // 同志を斬った敵は大石に向かってくる
    e.ally = false; e.duelAlly = null;
    e.slot = new THREE.Vector3().subVectors(e.ch.pos, player.pos).setY(0).normalize().multiplyScalar(1.9).add(player.pos);
    clampToRoom(G.room, e.slot, 0.5);
    e.state = 'approach'; e.t = 0;
  } else {
    comboText(lang === 'en' ? `${T(al.name)} wounded!` : al.name + '手傷！');
  }
  updateAlliesHud();
}

// 得点
const popups = [];
function addScore(pts, label, worldPos) {
  if (!pts) return;
  G.score = Math.max(0, G.score + pts);
  hud.score.textContent = G.score.toLocaleString();
  hud.score.classList.remove('bump'); void hud.score.offsetWidth; hud.score.classList.add('bump');
  let x = innerWidth / 2, y = innerHeight * 0.32;
  if (worldPos) { const sp = screenOf(worldPos); x = sp.x; y = sp.y - 70; }
  popups.push({ x, y, text: `${pts > 0 ? '+' : ''}${pts}${label ? ' ' + T(label) : ''}`, t: performance.now(), neg: pts < 0 });
}
function updateAlliesHud() {
  hud.allies.innerHTML = allies.map((a) => `<i class="${a.down ? 'down' : a.hp < 2 ? 'hurt' : ''}"></i>`).join('');
}

// 画面にしっかり映っているか（映っていない敵は斬りかかってこない）
function onScreen(ch, margin = 0.82) {
  ch.root.updateMatrixWorld(true);
  ch.chestWorld(_v3);
  const p = _v3.project(camera);
  return p.z < 1 && Math.abs(p.x) < margin && Math.abs(p.y) < 0.9;
}

// 戦闘中に注目する敵：斬りかかってくる敵 → 同志に斬りかかる敵 → 一番近い敵
function focusFoe() {
  const live = enemies.filter((e) => e.alive && e.state !== 'wait');
  if (!live.length) return null;
  const d = (e) => e.ch.pos.distanceToSquared(player.pos);
  return live.find((e) => e.state === 'windup' || e.state === 'strike')
    || live.find((e) => e.allyWind >= 0)
    || live.filter((e) => !e.ally).sort((a, b) => d(a) - d(b))[0]
    || live.sort((a, b) => d(a) - d(b))[0];
}

function anyAttacking() {
  const n = enemies.filter((e) => e.alive && !e.ally && (e.state === 'windup' || e.state === 'strike')).length;
  return n >= (G.stopIdx >= 3 ? DIFF.attackers : 1);
}

function updateEnemy(e, dt) {
  const ch = e.ch;
  if (!e.alive) {
    e.deadT += dt;
    if (!e.pooled && e.deadT > 1.3) {
      e.pooled = true;
      e.ch.root.updateMatrixWorld(true);
      e.ch.chestWorld(_v);
      for (let i = 0; i < 5; i++) addStain(_v.x + (Math.random() - 0.5) * 0.4, _v.z + (Math.random() - 0.5) * 0.4, 0.12 + Math.random() * 0.14);
    }
    ch.update(dt);
    // 亡骸は二つ先の場面まで残す
    if (STOPS.indexOf(e.stop) < G.stopIdx - (lowEnd ? 0 : 1)) { ch.removeFrom(scene); e.removed = true; }
    return;
  }
  e.t += dt;
  if (e.shiftFlash > 0) e.shiftFlash -= dt;
  if (e.feintFlash > 0) e.feintFlash -= dt;
  if (e.kb) {
    const k = Math.min(1, dt * 8);
    e.ch.pos.addScaledVector(e.kb, k);
    e.kb.multiplyScalar(1 - k);
    clampToRoom(G.room, e.ch.pos, 0.4);
    if (e.kb.lengthSq() < 1e-4) e.kb = null;
  }
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
          e.wait = (G.stopIdx === 0 ? 2.6 : DIFF.waitBase) + Math.random() * DIFF.waitRand;
        }
      }
      break;
    }
    case 'guard': {
      ch.walk = THREE.MathUtils.lerp(ch.walk, 0, 0.2);
      ch.faceTo(player.pos.x, player.pos.z, 1, dt);
      if (e.guard !== null) { ch.setMode('guard'); ch.guardAngle = e.guard; } else ch.setMode('ready');
      // 剣客や強敵は構えを途中で変える
      if (e.ty.shift && e.t > e.nextShift) {
        if (e.nextShift > 0) { e.guard = pickGuard(e); e.shiftFlash = 0.35; Sfx.clatter(); }
        e.nextShift = e.t + e.ty.shift * (0.7 + Math.random() * 0.6);
      }
      if (e.t > e.wait && G.attackCD <= 0 && !anyAttacking() && G.state === 'fight' && onScreen(e.ch)) startWindup(e);
      break;
    }
    case 'windup': {
      ch.faceTo(player.pos.x, player.pos.z, 1, dt);
      ch.setMode('windup');
      ch.setGlint(Math.min(1, e.t / e.windup));
      // フェイント：振りかぶったと見せて構えに戻る
      if (e.feint && e.t > e.windup * 0.55) {
        e.feint = false; e.state = 'guard'; e.t = 0; e.guard = pickGuard(e) ?? 0; e.wait = 0.5 + Math.random() * 0.5;
        e.feintFlash = 0.8; ch.setGlint(0); G.attackCD = 0.3;
        break;
      }
      // 間合いを詰める
      _v.subVectors(ch.pos, player.pos).setY(0);
      const want = (e.ty.range || 1.9) * 0.82;
      if (_v.length() > want) moveTo(_v2.copy(player.pos).add(_v.normalize().multiplyScalar(want)), 1.5);
      if (e.t >= e.windup) {
        e.state = 'strike'; e.t = 0; e.struck = false;
        G.attackCD = Math.max(G.attackCD, DIFF.gap);
        const d = e.strikeDir || { x: 0, y: -1 };
        ch.startSlash(d.x, d.y, 0.45);
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
      if (e.t > 0.55) { e.state = 'guard'; e.t = 0; e.guard = pickGuard(e); e.wait = DIFF.waitBase * 0.8 + Math.random() * DIFF.waitRand; G.attackCD = Math.max(G.attackCD, DIFF.gap); }
      break;
    }
    case 'duel': {
      // 同志と斬り結ぶ。時々同志に斬りかかる（助太刀しないと同志が斬られる）
      const al = e.duelAlly, a = al.ch;
      ch.faceTo(a.pos.x, a.pos.z, 1, dt); ch.walk = 0;
      if (e.allyWind >= 0) {
        e.allyWind += dt;
        ch.setMode('windup'); ch.setGlint(Math.min(1, e.allyWind / 1.5));
        if (e.allyWind >= 1.5) {
          e.allyWind = -1; ch.setGlint(0);
          ch.startSlash(0.5, -0.8, 0.45); Sfx.swing();
          later(0.12, () => { if (e.alive && !al.down) woundAlly(al, e); });
          e.allyAtkT = 2.5 + Math.random() * 2;
        }
        break;
      }
      if (ch.mode === 'windup') ch.setMode('ready');
      e.allyAtkT -= dt;
      if (e.allyAtkT <= 0 && G.state === 'fight' && onScreen(ch)) { e.allyWind = 0; Sfx.shing(); break; }
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

// 斬撃の向き（画面上：x右+, y上+）から斬られ方を決める
function deathKindOf(dir) {
  if (dir.y > 0.45) return 'up';
  if (Math.abs(dir.y) < 0.45) return 'side';
  return 'down';
}

function killEnemy(e, by, quiet = false, dir = null) {
  if (!e.alive) return;
  e.alive = false; e.state = 'dead';
  if (e.duelAlly) e.duelAlly.duel = null;
  e.ch.setGlint(0);
  if (!dir) { const a = Math.random() * Math.PI * 2; dir = { x: Math.cos(a), y: -Math.abs(Math.sin(a)) }; }
  e.ch.die(deathKindOf(dir), dir.x >= 0 ? 1 : -1);
  e.ch.onClatter = () => Sfx.clatter();
  e.ch.chestWorld(_v2);
  woundFx(_v2, dir, quiet ? 0.6 : 1);
  if (!quiet) G.kills++;
  // その場の最後の一人はスローモーション
  if (!quiet && !enemies.some((o) => o.alive && o.stop === e.stop && !o.ally)) {
    G.slowmo = 0.3; G.camShake = Math.max(G.camShake, 0.25);
  }
  Sfx.cut(quiet ? 0.5 : 1);
  Sfx.cry();
}

function playerKilled(e) {
  G.state = 'dead'; G.stateT = 0;
  player.die('up', Math.random() < 0.5 ? 1 : -1);
  G.redFlash = 1; G.camShake = 0.6; G.slowmo = 0.25;
  Sfx.cut(1); Sfx.gameover(); Sfx.groan();
  player.chestWorld(_v); emitSparks(_v, 30, 0xff2a20, 3);
  banner('無念……', lang === 'en' ? `Fell to the blade of ${T(e.def.name || '吉良家家臣')}` : `${e.def.name || '吉良家家臣'}の刃に倒れた`, 3);
  hint('');
  later(0.6, () => { if (canRevive()) offerRevive(); else showResult(false); });
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
  swipe.id++; swipe.cuts = 0; swipe.blocked = false; swipe.whiffed = false; swipe.counted = false;
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
function onUp() {
  swipe.active = false;
  if (trailPts.length) trailPts[trailPts.length - 1].end = true;
  // 空振りが続くと太刀筋が乱れる
  if (swipe.counted && (G.state === 'fight' || G.state === 'kira')) {
    if (swipe.cuts === 0 && !swipe.blocked) {
      // 空振り：続けて3回、または短い間に3回で乱れる（当たった振りは数えない）
      const now = performance.now();
      swingTimes.push(now);
      while (swingTimes.length && now - swingTimes[0] > 1500) swingTimes.shift();
      if (++G.whiffRow >= 3 || swingTimes.length >= 3) disorder();
    } else G.whiffRow = 0;
  }
}
// 太刀筋が乱れる：しばらく斬っても当たらない（めちゃくちゃに振り回すと起きる）
const swingTimes = [];
function disorder() {
  if (G.tired > 0) return;
  G.tired = 0.9; G.whiffRow = 0; swingTimes.length = 0;
  comboText('太刀筋が乱れた！');
  Sfx.clatter();
}

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
  // 1回のなぞりを「一振り」として数える。短い間に振りすぎると太刀筋が乱れる
  if (G.tired > 0) return;
  if (!swipe.counted && (G.state === 'fight' || G.state === 'kira')) { swipe.counted = true; G.swings++; }
  const dir = swipeDir();
  let hitAny = false;
  // 斬りかかってくる敵（返し技の対象）を先に判定する
  const pri = (e) => (e.state === 'windup' || e.state === 'strike' ? 0 : e.allyWind >= 0 ? 1 : 2);
  const list = cuttables().sort((p, q) => pri(p) - pri(q));
  for (const e of list) {
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
  player.startSlash(-dir.x, dir.y, 0.56, true);
  Sfx.swing();
  if (swipe.cuts === 0 && (speed > 2.6 || Math.random() < 0.6)) Sfx.kiai(speed > 2.6);

  const sAng = Math.atan2(dir.y, dir.x);
  // 返し技：斬りかかる直前に、斬撃と逆向きにフリック（槍の突きは横に払う）
  if (e !== kira && (e.state === 'windup' && e.t >= e.windup - DIFF.counterWin && !e.feint || e.state === 'strike' && e.t < 0.1)) {
    const sd = e.strikeDir || { x: 0, y: -1 };
    const ok = e.ty.thrust ? Math.abs(dir.y) < 0.6 : (dir.x * sd.x + dir.y * sd.y) < DIFF.counterDot;
    if (ok) { if (swipe.cuts === 0) G.hits++; doCounter(e, dir); return; }
  }
  // 刀を振り上げた後の敵には、普通に斬っても受け止められる（止めるなら振りかぶりの初めか、返し技）
  if (e !== kira && ((e.state === 'windup' && !e.feint && e.t >= e.windup * DIFF.open) || e.state === 'strike')) {
    swipe.blocked = true;
    later(0.13, () => {
      Sfx.clang(0.8);
      e.ch.chestWorld(_v2); emitSparks(_v2, 18, 0xffd27a, 4);
      G.camShake = 0.12; G.blocks++;
      comboText('受け止められた！');
    });
    return;
  }
  if (e !== kira && e.state === 'guard' && e.guard !== null && angleDiffMod180(sAng, e.guard) < DIFF.guardTol) {
    // 受け止められた
    swipe.blocked = true;
    pendingCuts.push({ t: 0.13, fn: () => {
      Sfx.clang(1);
      e.ch.chestWorld(_v2); emitSparks(_v2, 26, 0xffd27a, 5);
      G.camShake = 0.15; G.blocks++;
      comboText('弾かれた！');
      if (e.alive && e.state === 'guard') {
        // 反撃が来る
        startWindup(e); e.feint = false; e.windup = Math.max(0.7, e.ty.windup * 0.75);
        G.attackCD = 0;
      }
    } });
    return;
  }
  const dmg = speed > 2.6 ? 2 : 1;
  if (swipe.cuts === 0) G.hits++;
  swipe.cuts++;
  const combo = swipe.cuts;
  pendingCuts.push({ t: 0.14, fn: () => {
    if (e === kira) { finishKira(); return; }
    if (!e.alive) return;
    e.hp -= dmg;
    e.ch.hit(dir.x, dir.y);
    G.camShake = Math.max(G.camShake, 0.12);
    G.hitStop = 0.05;
    if (e.hp <= 0) {
      killEnemy(e, player, false, dir);
      slayFx(e, dir, combo, dmg === 2);
      const pts = (100 + (dmg === 2 ? 50 : 0) + (e.duelAlly ? 50 : 0)) * combo;
      e.ch.chestWorld(_v2);
      addScore(pts, combo >= 2 ? '連斬' : e.duelAlly ? '助太刀' : '', _v2);
      G.scoreParts.kill += pts;
      if (combo >= 2) { comboText(['', '', '二人斬り！', '三人斬り！', '四人斬り！', '五人斬り！'][Math.min(5, combo)]); G.maxCombo = Math.max(G.maxCombo, combo); }
      else comboText(dmg === 2 ? '剛斬！' : slashName(dir));
    } else {
      Sfx.cut(0.6);
      e.ch.chestWorld(_v2); woundFx(_v2, dir, 0.45);
      // 押し戻される
      e.kb = new THREE.Vector3().subVectors(e.ch.pos, player.pos).setY(0).normalize().multiplyScalar(0.5);
      comboText(dmg === 2 ? '剛斬！' : '浅い！');
      e.state = 'stagger'; e.t = 0;
      e.ch.setGlint(0);
    }
  } });
}

function doCounter(e, dir) {
  swipe.cuts++;
  e.state = 'stagger'; e.t = -0.3; e.ch.setGlint(0); e.struck = true;
  G.slowmo = 0.25; G.counters++;
  later(0.1, () => {
    if (!e.alive) return;
    Sfx.clang(1); Sfx.slay();
    e.ch.chestWorld(_v2); emitSparks(_v2, 34, 0xffe08a, 6);
    e.hp -= 2;
    e.ch.hit(dir.x, dir.y);
    if (e.hp <= 0) {
      killEnemy(e, player, false, dir);
      slayFx(e, dir, 1, true);
    } else {
      e.kb = new THREE.Vector3().subVectors(e.ch.pos, player.pos).setY(0).normalize().multiplyScalar(0.7);
      woundFx(_v2, dir, 0.6);
    }
    comboText('返し技！');
    e.ch.chestWorld(_v2);
    addScore(500, '返し技', _v2);
    G.scoreParts.counter += 500;
  });
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
    const target = list.find((e) => e.state === 'windup') || list.find((e) => e.allyWind >= 0) || list[0];
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
  enemies.forEach((e) => e.ch.removeFrom(scene));
  enemies = [];
  if (kira) { kira.ch.removeFrom(scene); kira = null; }
  clearBlood();
  STOPS.forEach((s) => { s.spawned = false; s.done = false; });
  Object.assign(G, { s: 0, stopIdx: 0, playTime: 0, kills: 0, retries: 0, maxCombo: 0, blocks: 0, slowmo: 1, redFlash: 0, whiteFlash: 0, attackCD: 0, lastRoomName: '',
    score: 0, counters: 0, scoreParts: { kill: 0, counter: 0, clear: 0 }, stopStartT: 0, snap: null, dawnShown: false,
    swings: 0, hits: 0, whiffRow: 0, tired: 0 });
  allies.forEach((a) => { if (a.down) a.ch.revive(); a.hp = 2; a.down = false; a.duel = null; });
  hud.score.textContent = '0';
  updateAlliesHud();
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
    if (a.down) return;
    const back = s - 4.4 - i * 1.0;
    const ap = railAt(back, new THREE.Vector3());
    railDirSmooth(Math.max(0, back), tmpDir);
    if (back < 0) ap.addScaledVector(tmpDir, back);   // 進路の手前（門の外）に並ぶ
    const side = (i % 2 ? 1 : -1) * 0.85;
    a.ch.setPosition(ap.x + tmpDir.z * side, ap.z - tmpDir.x * side);
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
  ['title', 'howto', 'result', 'pause', 'revive'].forEach((id) => $(id).classList.remove('show'));
  G.state = 'intro'; G.stateT = 0;
  banner('元禄十五年十二月十四日', '寅の上刻　本所松坂町・吉良邸', 3.2);
  Sfx.drum(0); Sfx.drum(0.6); Sfx.drum(1.1);
  Sfx.windStart();
}

function retryStop() {
  const st = STOPS[G.stopIdx];
  clearStopEnemies(st);
  if (kira) { kira.ch.removeFrom(scene); kira = null; }
  // 次の場面の先行配置も消す
  STOPS.forEach((s, i) => { if (i > G.stopIdx && s.spawned) clearStopEnemies(s); });
  G.retries++;
  if (G.snap) {
    G.score = G.snap.score; G.swings = G.snap.swings; G.hits = G.snap.hits; G.scoreParts = { ...G.snap.parts }; G.kills = G.snap.kills; G.counters = G.snap.counters;
    allies.forEach((a, i) => { const sa = G.snap.allies[i]; a.hp = sa.hp; if (a.down && !sa.down) a.ch.revive(); a.down = sa.down; });
  }
  addScore(-1000, 'やり直し');
  updateAlliesHud();
  player.mode = 'ready'; player.body.rotation.set(0, 0, 0); player.body.position.set(0, 0, 0);
  placeAtRail(Math.max(0, st.s - 4));
  G.slowmo = 1; G.redFlash = 0; G.attackCD = 1;
  $('result').classList.remove('show'); $('revive').classList.remove('show');
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
    takeSnapshot();
    return;
  }
  G.state = 'fight';
  takeSnapshot();
  if (st.intro) banner(st.title, st.intro, 2.2);
  if (st.enemies && st.enemies.some((d) => d.name)) Sfx.bossRoar();
  else banner(st.title, '', 1.6);
  engageStop(st);
  G.attackCD = 1.2;
  if (st.tutorial && !G.tutorialShown) {
    G.tutorialShown = true;
    hint('敵をなぞるようにフリックして斬れ！\n点線「受」と同じ向きは弾かれる／刀が赤く光ったら先に斬れ');
  }
}

function takeSnapshot() {
  G.stopStartT = G.playTime;
  G.snap = { swings: G.swings, hits: G.hits, score: G.score, parts: { ...G.scoreParts }, kills: G.kills, counters: G.counters, allies: allies.map((a) => ({ hp: a.hp, down: a.down })) };
}

function stopCleared(st) {
  st.done = true;
  if (st.event === 'finale') { revealKira(); return; }
  hint('');
  G.state = 'walk';
  Sfx.boom(); Sfx.noto();
  const bonus = Math.max(0, Math.round(500 - 25 * (G.playTime - G.stopStartT)));
  if (bonus) { later(1.0, () => addScore(bonus, '早業')); G.scoreParts.clear += bonus; }
  later(0.8, () => comboText('制圧！'));
  G.stopIdx++;
}

function revealKira() {
  G.state = 'event'; G.stateT = 0;
  const ch = new Character('kira', { name: '吉良上野介' });
  const p = P(500, 465);
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

function finalBonus() {
  const alive = allies.filter((a) => !a.down).length;
  const allyPts = alive * 500 + (alive === allies.length ? 2000 : 0);
  const timePts = Math.max(0, Math.floor(DAWN - G.playTime)) * 5;
  // 太刀筋：振った回数のうち当たった割合（30%で0点、90%以上で3,000点）
  const acc = G.swings ? G.hits / G.swings : 0;
  const accPts = Math.round(3000 * THREE.MathUtils.clamp((acc - 0.3) / 0.6, 0, 1));
  G.score += allyPts + timePts + accPts;
  hud.score.textContent = G.score.toLocaleString();
  return { alive, allyPts, timePts, acc, accPts };
}

function dawnOver() {
  G.state = 'dead'; G.stateT = 0;
  G.slowmo = 0.5;
  Sfx.gameover();
  banner('夜が明けた……', '吉良を討ち漏らした', 3.5);
  hint('');
  later(1.2, () => showResult(false, true));
}

function finishKira() {
  if (!kira || !kira.alive) return;
  kira.alive = false;
  G.state = 'win'; G.stateT = 0;
  G.slowmo = 0.2; G.whiteFlash = 1;
  kira.ch.die('down', 1);
  kira.ch.chestWorld(_v); woundFx(_v, { x: 0.7, y: -0.7 }, 1.2);
  Sfx.cut(1); Sfx.kiai(true); Sfx.cry(true);
  later(1.2, () => Sfx.say('えい、えい、おう！', { pitch: 0.7, rate: 0.9 }));
  Sfx.drum(0.6); Sfx.drum(1.2); Sfx.drum(1.7);
  hint('');
  banner('本懐成就', '元禄十五年十二月十五日　未明', 4);
  G.finalBonus = finalBonus();
  later(0.9, () => showResult(true));
}

function loadRanking() { try { return JSON.parse(localStorage.getItem('ako-rank') || '[]'); } catch (e) { return []; } }
function saveRanking(list) { try { localStorage.setItem('ako-rank', JSON.stringify(list)); } catch (e) { /* 保存不可 */ } }

function showResult(win, dawn = false) {
  const t = G.playTime;
  const en = lang === 'en';
  const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
  $('resultTitle').textContent = T(win ? '本懐成就' : '無念');
  $('resultText').innerHTML = T(win
    ? '<p>赤穂浪士四十七士は吉良上野介を討ち取り、主君・浅野内匠頭の無念を晴らした。</p><p>一行は雪の江戸の町を、亡君の眠る<b>泉岳寺</b>へと引き揚げていった。</p>'
    : dawn ? '<p>夜が明けてしまった。吉良上野介を討ち漏らした……。</p>'
      : '<p>大石内蔵助は敵の刃に倒れた……。</p><p>刀が赤く光った敵を先に斬れ。構えた刀と同じ向きに斬ると弾かれるぞ。</p>')
    + (!win && !dawn && G.retries >= redoMax() ? (lang === 'en' ? `<p>No retries left (${redoMax()} per raid).</p>` : `<p>やり直しは使い切った（1回の討ち入りで${redoMax()}回まで）。</p>`) : '');
  const time = en ? `${mm}m ${String(ss).padStart(2, '0')}s` : `${mm}分${String(ss).padStart(2, '0')}秒`;
  const fb = G.finalBonus || { alive: allies.filter((a) => !a.down).length, allyPts: 0, timePts: 0 };
  const P_ = G.scoreParts;
  const row = (ja, enL, v) => `<dt>${en ? enL : ja}</dt><dd>${v}</dd>`;
  let html = row('討ち入り時間', 'Time', time) +
    row('斬り伏せた敵', 'Enemies cut down', G.kills + (en ? '' : '人')) +
    row('返し技', 'Counters', G.counters + (en ? '' : '回')) +
    row('最大連斬', 'Best multi-cut', (G.maxCombo || 1) + (en ? '' : '人')) +
    row('生還した同志', 'Comrades alive', `${fb.alive} / ${allies.length}`) +
    row('やり直し', 'Retries', G.retries + (en ? '' : '回'));
  html += `<dt class="sep">${en ? 'Swordplay' : '剣技'}</dt><dd class="sep">${(P_.kill + P_.counter).toLocaleString()}</dd>` +
    row('早業', 'Speed', P_.clear.toLocaleString());
  if (win && fb.accPts !== undefined) html += row(`太刀筋（命中 ${Math.round(fb.acc * 100)}%）`, `Accuracy (${Math.round(fb.acc * 100)}%)`, fb.accPts.toLocaleString());
  if (win) html += row(fb.alive === allies.length ? '同志（全員生還）' : '同志', fb.alive === allies.length ? 'Comrades (all alive)' : 'Comrades', fb.allyPts.toLocaleString()) +
    row('夜明けまでの余裕', 'Time to dawn', fb.timePts.toLocaleString());
  html += `<dt class="total">${en ? 'Score' : '得点'}</dt><dd class="total">${G.score.toLocaleString()}</dd>`;
  const rank = !win ? '' : G.score >= 17000 ? '天晴れ　義士の鑑' : G.score >= 13000 ? '見事なり' : '本懐を遂げたり';
  if (win) html += row('評価', 'Rating', T(rank));
  $('resultStats').innerHTML = html;

  // ランキング（この端末に上位10件）
  let list = loadRanking(), mine = -1;
  if (win || dawn) {
    const now = new Date();
    const entry = { score: G.score, time: Math.round(t), win, d: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` };
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    list = list.slice(0, 10);
    mine = list.indexOf(entry);
    saveRanking(list);
  }
  $('ranking').innerHTML = list.length ? `<h3>${en ? 'Ranking (this device)' : 'ランキング（この端末）'}</h3><ol>` + list.slice(0, 5).map((r, i) =>
    `<li class="${i === mine ? 'me' : ''}"><span>${r.score.toLocaleString()}</span><small>${r.win ? (en ? 'Vengeance' : '本懐') : (en ? 'Dawn' : '夜明け')} · ${Math.floor(r.time / 60)}:${String(r.time % 60).padStart(2, '0')} · ${r.d}</small></li>`).join('') + '</ol>' : '';
  // web-only:start
  if ($('retryHere')) $('retryHere').style.display = win || dawn || G.retries >= redoMax() ? 'none' : '';
  // web-only:end
  G.lastResult = { win, dawn };
  $('result').classList.add('show');
  showBest();
  syncBanner();
}

function togglePause() {
  if (G.state === 'title' || G.state === 'win' || G.state === 'dead') return;
  if (G.state === 'paused') resumeGame();
  else pauseGame();
}
function pauseGame() {
  if (G.state === 'paused' || !['intro', 'walk', 'fight', 'event', 'kira'].includes(G.state)) return;
  G.prevState = G.state; G.state = 'paused'; $('pause').classList.add('show');
  syncBanner();
}
// ポーズからの再開（アプリでは全画面広告を挟む）
async function resumeGame() {
  if (G.state !== 'paused') return;
  $('pause').classList.remove('show');
  syncBanner();
  await Ads.showInterstitial(3000);
  G.state = G.prevState;
}

// ---- アプリ（Capacitor）の機能。Web 版では Capacitor がないので何もしない ----
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const plugin = (name) => (NATIVE && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null);
window.GameAudio = {
  suspend() { try { if (Sfx.ctx) Sfx.ctx.suspend(); if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) { /* 無視 */ } },
  resume() { try { if (Sfx.ctx && !document.hidden) Sfx.ctx.resume(); } catch (e) { /* 無視 */ } },
};

// バナー：トップ・遊び方・一時停止・結果の画面だけ（プレイ中は出さない）
function syncBanner() {
  const on = ['title', 'howto', 'pause', 'result'].some((id) => $(id).classList.contains('show')) && !$('loading').classList.contains('show');
  Ads.setBanner(on);
}

// トップ画面に戻る
function goTitle() {
  enemies.forEach((e) => e.ch.removeFrom(scene));
  enemies = [];
  if (kira) { kira.ch.removeFrom(scene); kira = null; }
  ['howto', 'result', 'pause', 'revive'].forEach((id) => $(id).classList.remove('show'));
  document.body.classList.remove('playing');
  hint('');
  G.state = 'title'; G.slowmo = 1; G.redFlash = 0; G.whiteFlash = 0;
  player.mode = 'ready'; player.body.rotation.set(0, 0, 0); player.body.position.set(0, 0, 0);
  placeAtRail(0);
  $('title').classList.add('show');
  showBest();
  syncBanner();
}
// 画面を切り替える前に全画面広告を出す
const withAd = (fn) => async () => { Ads.setBanner(false); await Ads.showInterstitial(3000); fn(); };

// リワード広告：斬られたら、広告を見てこの戦いからやり直せる（1 回の討ち入りで 5 回まで）
// やり直せる回数：アプリは広告を見れば多めに
function redoMax() { return NATIVE ? DIFF.appRedo : DIFF.redo; }
const canRevive = () => Ads.canReward && G.retries < redoMax();
let reviveTimer = null;
function offerRevive() {
  // 斬られた様子を見届けてから案内を出し、数秒で自動的に結果へ進む
  later(1.6, () => {
    if (G.state !== 'dead') return;
    const left = redoMax() - G.retries;
    $('reviveText').textContent = lang === 'en' ? `Watch an ad to retry this fight? (${left} left)` : `広告を見て、この戦いからやり直しますか？（残り ${left} 回）`;
    $('revive').classList.add('show');
    const t0 = performance.now(), LIMIT = 6000;
    clearInterval(reviveTimer);
    reviveTimer = setInterval(() => {
      const k = 1 - (performance.now() - t0) / LIMIT;
      $('reviveBar').style.width = Math.max(0, k * 100) + '%';
      if (k <= 0) closeRevive(false);
    }, 100);
  });
}
async function closeRevive(watch) {
  if (!$('revive').classList.contains('show')) return;
  clearInterval(reviveTimer);
  $('revive').classList.remove('show');
  if (watch) {
    const r = await Ads.showRewarded();
    if (r === 'rewarded') { retryStop(); return; }
  }
  showResult(false);
}
$('reviveBtn').onclick = () => closeRevive(true);
$('reviveSkip').onclick = () => closeRevive(false);

// シェア（アプリでは Android の共有メニュー、Web 版では端末の共有機能。なければ X の投稿画面）
const SHARE_URL = 'https://techgym.jp/column/claude-code-game-ako/';
async function shareResult() {
  const r = G.lastResult || {};
  const en = lang === 'en';
  const head = en ? 'Chushingura: 47 Ronin Raid' : '忠臣蔵 赤穂浪士の討ち入り';
  const what = r.win ? (en ? 'Vengeance fulfilled!' : '本懐成就！') : r.dawn ? (en ? 'Dawn broke...' : '夜が明けた……') : (en ? 'Fell in battle...' : '無念……');
  const text = `${head}｜${what} ${en ? 'Score' : '得点'} ${G.score.toLocaleString()}・${en ? `retries ${G.retries}` : `やり直し${G.retries}回`} #忠臣蔵`;
  try {
    const Share = plugin('Share');
    if (Share) await Share.share({ title: head, text, url: SHARE_URL, dialogTitle: en ? 'Share your result' : '結果をシェア' });
    else if (navigator.share) await navigator.share({ title: head, text, url: SHARE_URL });
    else window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SHARE_URL)}`, '_blank', 'noopener');
  } catch (e) { /* 閉じられた */ }
}

$('startBtn').onclick = withAd(startGame);
$('howtoStart').onclick = withAd(startGame);
$('howtoBtn').onclick = () => { $('title').classList.remove('show'); $('howto').classList.add('show'); syncBanner(); };
$('howtoBack').onclick = withAd(goTitle);
addEventListener('pointerdown', () => { Sfx.init(); if (G.state === 'title') Sfx.music('title'); }, { once: true });
$('retryBtn').onclick = withAd(startGame);
// web-only:start
if ($('retryHere')) $('retryHere').onclick = retryStop;
// web-only:end
$('resultTop').onclick = withAd(goTitle);
$('shareBtn').onclick = shareResult;
$('resumeBtn').onclick = resumeGame;
$('pauseTop').onclick = withAd(goTitle);
$('pauseBtn').onclick = togglePause;

// 戻るボタン：プレイ中はポーズ、ポーズ中は再開、遊び方はトップへ、トップと結果画面ではアプリを終了
if (plugin('App')) {
  plugin('App').addListener('backButton', () => {
    if (Ads.showing) return;
    if ($('revive').classList.contains('show')) { closeRevive(false); return; }
    if ($('howto').classList.contains('show')) { withAd(goTitle)(); return; }
    if (G.state === 'paused') { resumeGame(); return; }
    if (['intro', 'walk', 'fight', 'event', 'kira'].includes(G.state)) { pauseGame(); return; }
    if ($('title').classList.contains('show') || $('result').classList.contains('show')) plugin('App').exitApp();
  });
}
// 別のアプリに切り替えたら自動でポーズし、音も止める
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseGame(); window.GameAudio.suspend(); }
  else if (!Ads.showing) window.GameAudio.resume();
});

// タイトル画面：バージョンとプライバシーポリシー、（必要な地域では）広告の設定
if (window.APP_VERSION && window.APP_VERSION !== 'dev') $('buildInfo').textContent = window.APP_VERSION;
// 画面下のバナー広告とボタンが重ならないよう、アプリでは下に余白を空ける
if (Ads.available) document.body.classList.add('has-banner');
Ads.initDone.then(() => { if (Ads.privacyOptionsRequired) $('adPrivacy').hidden = false; });
$('adPrivacyLink').addEventListener('click', (e) => { e.preventDefault(); Ads.showPrivacyOptions(); });
const setPrivacyUrl = () => { $('privacyLink').href = lang === 'en' ? 'https://techgym.jp/privacy-policy-en/' : 'https://techgym.jp/privacy-policy/'; };
setPrivacyUrl();

$('muteBtn').onclick = () => { $('muteBtn').classList.toggle('off', Sfx.toggle()); };
function showBest() {
  const list = loadRanking();
  const best = list[0];
  $('bestTime').textContent = best ? (lang === 'en' ? `Best score: ${best.score.toLocaleString()}` : `最高得点：${best.score.toLocaleString()}`) : '';
}
applyStatic();
showBest();
$('langBtn').onclick = () => { setLang(lang === 'en' ? 'ja' : 'en'); showBest(); setPrivacyUrl(); };

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
  if (['walk', 'fight', 'event', 'kira'].includes(G.state)) {
    G.playTime += dt;
    if (G.playTime >= DAWN && G.state !== 'kira') { dawnOver(); }
  }
  updateDawn();
  G.attackCD = Math.max(0, G.attackCD - dt);
  if (G.tired > 0) G.tired = Math.max(0, G.tired - dt);

  for (let i = pendingCuts.length - 1; i >= 0; i--) {
    pendingCuts[i].t -= dt;
    if (pendingCuts[i].t <= 0) { const f = pendingCuts[i].fn; pendingCuts.splice(i, 1); f(); }
  }

  const st = STOPS[G.stopIdx];

  // ---- 主人公の移動 ----
  if (G.state === 'intro') {
    if (G.stateT > 2.6) { G.state = 'walk'; G.stateT = 0; banner('かかれっ！', '大石内蔵助、表門より討ち入る', 1.8); Sfx.command(); Sfx.say('かかれぇーっ！', { pitch: 0.95, rate: 1.4 }); Sfx.warcry(0.55); Sfx.drum(0.5); Sfx.drum(0.75); }
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
    // 斬っていない間は、一番危ない敵の方へ向き直る
    const f = G.state === 'fight' && player.mode !== 'slash' && !(player.lungeT > 0) ? focusFoe() : null;
    if (f) G.facing = Math.atan2(f.ch.pos.x - player.pos.x, f.ch.pos.z - player.pos.z);
  }
  player.update(dt);
  updateTrail(player, player.swinging || (player.mode === 'slash' && player.modeT < player.modeDur * 0.45));

  G.room = roomAtWorld(player.pos.x, player.pos.z);
  const roomName = G.room ? G.room.name : (player.pos.x > 50 ? '表門' : '前庭');
  if (roomName !== G.lastRoomName) { G.lastRoomName = roomName; hud.loc.textContent = T(roomName); }
  hud.prog.style.width = (100 * G.s / RAIL_TOTAL).toFixed(1) + '%';

  // ---- 同志 ----
  allies.forEach((a, i) => {
    const ch = a.ch;
    if (a.down) { ch.update(dt); return; }
    let target;
    if (a.duel && a.duel.alive && a.duel.state === 'duel' && a.duel.duelAlly === a) {
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
      const offs = [[-1.7, 0.3], [1.7, 0.3], [-2.6, -0.3], [2.6, -0.3], [0.2, -4.2]][i]; // 大石の両脇に並ぶ（カメラの視界を塞がない）
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
  updateBlood(dt);
  updateSlashMarks(dt);
  Sfx.update(G);
  Sfx.music(musicFor());

  msgTimer -= dt / Math.max(0.2, G.slowmo);
  if (msgTimer <= 0) hud.msg.parentElement.classList.remove('show');
  comboTimer -= dt;
  if (comboTimer <= 0) hud.combo.classList.remove('pop');
}

// 夜明けが近づくと空と霧が白んでいく
const fogNight = new THREE.Color(0x0c1424), fogDawn = new THREE.Color(0x5a5470);
let lastDawnSec = -1;
function updateDawn() {
  const r = THREE.MathUtils.clamp((G.playTime / DAWN - 0.45) / 0.55, 0, 1);
  scene.fog.color.copy(fogNight).lerp(fogDawn, r * r);
  hemi.intensity = 0.55 + r * 0.6;
  scene.backgroundIntensity = 1 + r * 1.6;
  const left = Math.max(0, Math.ceil(DAWN - G.playTime));
  if (left !== lastDawnSec && document.body.classList.contains('playing')) {
    lastDawnSec = left;
    const m = Math.floor(left / 60), sec = String(left % 60).padStart(2, '0');
    hud.dawn.textContent = (lang === 'en' ? 'Dawn in ' : '夜明けまで ') + `${m}:${sec}`;
    hud.dawn.classList.toggle('urgent', left <= 60);
    if (left === 60 && !G.dawnShown) { G.dawnShown = true; banner('東の空が白み始めた', '夜明けまで、あと一刻もない！', 2); }
  }
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
    G.camYaw = undefined;
    railAt(Math.max(-4, G.s - 3.4), camTarget);
    if (G.s < 3.4) { railDirSmooth(0, tmpDir); camTarget.copy(railPts[0]).addScaledVector(tmpDir, G.s - 3.4); }
    camTarget.y = indoor ? 2.05 : 2.5;
    railDirSmooth(G.s, tmpDir);
    camLook.copy(player.pos).addScaledVector(tmpDir, 3).setY(1.25);
  } else {
    const kiraScene = kira && (G.state === 'kira' || G.state === 'event' || G.state === 'win');
    // 生きている敵（同志と斬り合っている敵も含む）の方向を重み付きで平均して、カメラの向きを決める
    const foes = enemies.filter((e) => e.alive && e.state !== 'wait');
    let yaw = G.facing, spread = 0;
    if (foes.length && !kiraScene) {
      let sx = 0, sz = 0;
      for (const e of foes) {
        _v.subVectors(e.ch.pos, player.pos).setY(0);
        if (_v.lengthSq() < 1e-4) continue;
        _v.normalize();
        const w = e.state === 'windup' || e.state === 'strike' ? 3 : e.allyWind >= 0 ? 2.5 : e.ally ? 0.8 : 1;
        sx += _v.x * w; sz += _v.z * w;
      }
      if (sx * sx + sz * sz > 1e-4) yaw = Math.atan2(sx, sz);
      for (const e of foes) {
        let a = Math.atan2(e.ch.pos.x - player.pos.x, e.ch.pos.z - player.pos.z) - yaw;
        while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
        spread = Math.max(spread, Math.abs(a));
      }
    }
    // 向きはなめらかに追う
    if (G.camYaw === undefined) G.camYaw = yaw;
    let dy = yaw - G.camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    G.camYaw += dy * Math.min(1, dt * 3.5);
    const f = G.camYaw;
    // 敵が左右に広がっているほど、下がって高い位置から広く映す
    const wide = THREE.MathUtils.clamp((spread - 0.5) / 1.2, 0, 1);
    let back = 3.0 + wide * 1.6, side = 0.55, height = (indoor ? 2.0 : 2.3) + wide * (indoor ? 0.4 : 1.4);
    if (kiraScene) { back = 2.0; side = 1.35; height = indoor ? 2.35 : 2.5; }   // 吉良が大石の陰に隠れないよう肩越しに
    camTarget.set(player.pos.x - Math.sin(f) * back - Math.cos(f) * side, height, player.pos.z - Math.cos(f) * back + Math.sin(f) * side);
    // 注視点：大石の前方と敵の重心の間
    camLook.copy(player.pos).add(_v.set(Math.sin(f), 0, Math.cos(f)).multiplyScalar(2.2));
    if (foes.length && !kiraScene) {
      const c = new THREE.Vector3();
      foes.forEach((e) => c.add(e.ch.pos)); c.divideScalar(foes.length);
      camLook.lerp(c, 0.5);
    }
    if (kiraScene) camLook.copy(kira.ch.pos).lerp(player.pos, 0.25);
    camLook.y = G.state === 'kira' || G.state === 'win' ? 0.7 : 1.15;
    if (G.state === 'dead') { camTarget.y = 3.2; camLook.copy(player.pos).setY(0.4); }
    if (indoor) clampToRoom(G.room, camTarget, 0.25);
    // カメラが人物の体にめり込まないよう離す
    for (const c of [...enemies.filter((e) => e.alive).map((e) => e.ch), ...allies.filter((a) => !a.down).map((a) => a.ch), kira && kira.ch].filter(Boolean)) {
      _v.subVectors(camTarget, c.pos).setY(0);
      const dist = _v.length();
      if (dist < 0.9) {
        if (dist < 1e-3) _v.set(-Math.sin(f), 0, -Math.cos(f)); else _v.normalize();
        camTarget.addScaledVector(_v, 0.9 - dist);
        camTarget.y = Math.max(camTarget.y, indoor ? 2.35 : 2.6);
      }
    }
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
  // 斬った瞬間にぐっと寄る
  if (G.fovKick > 0.001 || camera.fov !== baseFov) {
    G.fovKick = Math.max(0, (G.fovKick || 0) - dt * 5);
    camera.fov = baseFov - 5 * Math.sin(G.fovKick * Math.PI * 0.5);
    camera.updateProjectionMatrix();
  }
}

// =====================================================================
// 2Dオーバーレイ（なぞった残光・構え・危険表示）
// =====================================================================
// 斬りかかってくる向きの矢印。返し技の好機には金色になる
function drawStrikeArrow(e, sr, r) {
  if (!e.ty.thrust && !e.strikeDir) e.strikeDir = { x: 0, y: -1 };
  const win = e.t >= e.windup - DIFF.counterWin;
  const col = win ? 'rgba(255,215,90,.95)' : `rgba(255,70,50,${0.35 + 0.4 * e.t / e.windup})`;
  octx.save();
  octx.translate(sr.x, sr.y);
  octx.strokeStyle = col; octx.fillStyle = col; octx.lineWidth = win ? 5 : 3;
  const L = r * 1.7;
  const arrow = (dx, dy) => {
    const ang = Math.atan2(-dy, dx);
    octx.save(); octx.rotate(ang);
    octx.beginPath(); octx.moveTo(-L, 0); octx.lineTo(L, 0); octx.stroke();
    octx.beginPath(); octx.moveTo(L + 8, 0); octx.lineTo(L - 12, -10); octx.lineTo(L - 12, 10); octx.fill();
    octx.restore();
  };
  if (e.ty.thrust) {
    // 槍の突き：横に払え
    if (win) { arrow(1, 0); arrow(-1, 0); }
    else { octx.beginPath(); octx.arc(0, 0, r * 0.6, 0, Math.PI * 2); octx.stroke(); }
  } else if (win) arrow(-e.strikeDir.x, -e.strikeDir.y);   // 返す向き
  else arrow(e.strikeDir.x, e.strikeDir.y);                // 敵が斬ってくる向き
  octx.restore();
  if (win) {
    octx.fillStyle = 'rgba(255,225,120,.98)'; octx.font = `800 ${Math.round(r * 0.75)}px "Shippori Mincho", serif`; octx.textAlign = 'center';
    octx.fillText(T(e.ty.thrust ? '払え！' : '返せ！'), sr.x, sr.y + r * 2.4);
  }
}
function drawAllyDanger(e) {
  e.ch.root.updateMatrixWorld(true);
  const sr = screenRadius(e.ch, 0.42);
  if (sr.z > 1) return;
  const r = Math.max(sr.r, 22), k = Math.min(1, e.allyWind / 1.5);
  // 画面外なら端に寄せて知らせる
  sr.x = THREE.MathUtils.clamp(sr.x, 60, innerWidth - 60); sr.y = THREE.MathUtils.clamp(sr.y, 110, innerHeight - 60);
  octx.strokeStyle = `rgba(255,90,60,${0.5 + 0.5 * k})`; octx.lineWidth = 3 + 3 * k;
  octx.beginPath(); octx.arc(sr.x, sr.y, r * (2.4 - 1.2 * k), 0, Math.PI * 2); octx.stroke();
  octx.fillStyle = '#ffb08a'; octx.font = `800 ${Math.max(14, Math.round(r * 0.6))}px "Shippori Mincho", serif`; octx.textAlign = 'center';
  octx.fillText(T('助太刀！'), sr.x, sr.y - r * 2.4);
}
function drawPopups(now) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i], age = (now - p.t) / 1000;
    if (age > 1.1) { popups.splice(i, 1); continue; }
    octx.globalAlpha = age < 0.8 ? 1 : 1 - (age - 0.8) / 0.3;
    octx.font = '800 20px "Shippori Mincho", serif'; octx.textAlign = 'center';
    octx.lineWidth = 4; octx.strokeStyle = 'rgba(0,0,0,.7)';
    octx.strokeText(p.text, p.x, p.y - age * 40);
    octx.fillStyle = p.neg ? '#ff8080' : '#ffe08a';
    octx.fillText(p.text, p.x, p.y - age * 40);
    octx.globalAlpha = 1;
  }
}

function drawOverlay() {
  const dpr = OVERLAY_DPR;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, innerWidth, innerHeight);
  const now = performance.now();

  // 構えと振りかぶりの表示
  if (G.state === 'fight' || G.state === 'kira' || G.state === 'event') {
    for (const e of enemies) {
      if (e.alive && e.ally && e.state === 'duel' && e.allyWind >= 0) drawAllyDanger(e);
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
        octx.textAlign = 'center'; octx.fillText(T('受'), sr.x + r * 1.1, sr.y - r * 1.4);
        if (e.shiftFlash > 0 || e.feintFlash > 0) {
          octx.fillStyle = 'rgba(255,230,160,.95)'; octx.font = `800 ${Math.round(r * 0.55)}px "Shippori Mincho", serif`;
          octx.fillText(T(e.feintFlash > 0 ? 'フェイント！' : '構え替え'), sr.x, sr.y + r * 2.3);
        }
      }
      if (e.state === 'windup' && !e.feint) drawStrikeArrow(e, sr, r);
      if (e.state === 'windup' && !e.feint && e.t < e.windup * DIFF.open) {
        // 振りかぶり始めは隙：普通に斬れば止められる
        octx.fillStyle = 'rgba(255,255,255,.95)'; octx.font = `800 ${Math.round(r * 0.7)}px "Shippori Mincho", serif`; octx.textAlign = 'center';
        octx.fillText(T('隙！'), sr.x, sr.y + r * 2.4);
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
        octx.fillText(T(e.def.name), sr.x, sr.y - r * 2.9);
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
      octx.fillText(T('吉良上野介'), sr.x, sr.y - Math.max(sr.r, 30) * 2.3);
    }
  }

  drawSlayFx(now);
  drawPopups(now);

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
let frameErrors = 0;
// 動きが重い端末では解像度を自動で下げる（軽ければ少しずつ戻す）
let frameAcc = 0, frameN = 0, frameLast = performance.now();
function adaptResolution() {
  const now = performance.now();
  frameAcc += now - frameLast; frameLast = now; frameN++;
  if (frameAcc < 2000) return;
  const avg = frameAcc / frameN; frameAcc = 0; frameN = 0;
  if (document.hidden || !lowEnd) return;
  const pr = renderer.getPixelRatio();
  let next = pr;
  if (avg > 26 && pr > 0.6) next = Math.max(0.6, pr - 0.15);
  else if (avg < 17 && pr < quality.pixelRatio) next = Math.min(quality.pixelRatio, pr + 0.1);
  if (next !== pr) { renderer.setPixelRatio(next); renderer.setSize(innerWidth, innerHeight, false); }
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  try { update(dt); } catch (e) { if (frameErrors++ < 5) console.error(e); }
  filmPass.uniforms.uTime.value = G.t % 100;
  if (quality.post) composer.render(); else renderer.render(scene, camera);
  adaptResolution();
  try { drawOverlay(); } catch (e) { if (frameErrors++ < 5) console.error(e); }
}
placeAtRail(0);
G.state = 'title';
frame();

// =====================================================================
// 読み込み：フォント・シェーダー・人物モデル・音を準備してからタイトルを出す
// =====================================================================
async function boot() {
  const bar = $('loadBar'), msg = $('loadMsg');
  const step = (p, text) => { bar.style.width = (p * 100).toFixed(0) + '%'; if (text) msg.textContent = text; };
  const L = (ja, en) => (lang === 'en' ? en : ja);
  step(0.02, L('文字を読み込み中……', 'Loading fonts...'));
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]); } catch (e) { /* 無視 */ }
  step(0.08, L('着物と刀を読み込み中……', 'Loading costumes and swords...'));
  try {
    await loadAssets();
    player.dress(); allies.forEach((a) => a.ch.dress());
  } catch (e) { console.warn('model load failed', e); }
  try {
    await loadMocap(['slash_great', 'slash_sweep', 'slash_spin', 'slash_inward', 'hit_impact', 'hit_guard', 'death_walk', 'death_back', 'terrified', 'idle', 'slash_down']);
  } catch (e) { console.warn('mocap load failed', e); }
  step(0.18, L('屋敷と人物を準備中……', 'Preparing the mansion...'));
  await new Promise((r) => setTimeout(r, 30));
  // 全種類の人物を一度描いて、シェーダーを先にコンパイルしておく
  const warm = ['oishi', 'ronin', 'retainer', 'retainer2', 'boss1', 'boss2', 'boss3', 'kira'].map((t, i) => {
    const c = new Character(t, { weapon: i === 3 ? 'spear' : undefined });
    c.setPosition(camera.position.x + Math.sin(i) * 2, camera.position.z + 3);
    c.update(0.016);
    scene.add(c.root);
    return c;
  });
  woundFx(new THREE.Vector3(0, -50, 0), { x: 1, y: 0 }, 0.2);
  try { renderer.compile(scene, camera); composer.render(); } catch (e) { /* 無視 */ }
  warm.forEach((c) => c.removeFrom(scene));
  step(0.25, L('音を準備中……', 'Preparing sound...'));
  await Sfx.preload((p) => step(0.25 + p * 0.75));
  step(1);
  await new Promise((r) => setTimeout(r, 150));
  $('loading').classList.remove('show');
  $('title').classList.add('show');
  syncBanner();
}
boot();

// web-only:start
// デバッグ・テスト用（アプリには入れない）
function sim(sec, step = 1 / 30) {
  for (let t = 0; t < sec; t += step) { update(step); scene.updateMatrixWorld(); camera.updateMatrixWorld(); }
}
// なぞる操作を再現する（テスト用）：(x0,y0)→(x1,y1) を ms ミリ秒で
function testSwipe(x0, y0, x1, y1, ms = 90) {
  const now = performance.now(), steps = 8;
  onDown(x0, y0); swipe.pts[0].t = now;
  for (let i = 1; i <= steps; i++) {
    const pt = { x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps, t: now + ms * i / steps };
    swipe.pts.push(pt);
    processSegment(swipe.pts[swipe.pts.length - 2], pt);
  }
  onUp();
}
window.__ako = { DIFF, swipe: testSwipe, screenOf: (v) => screenOf(v), renderer, fx: () => ({ strokes: strokes.length, stamps: stamps.length }), sim, G, STOPS, enemies: () => enemies, player, startGame, retryStop, camera, kira: () => kira, RAIL_TOTAL };
// web-only:end
