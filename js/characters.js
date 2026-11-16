// 人物モデル（プリミティブを組み合わせた手続き生成の人体＋ポーズ計算）
import * as THREE from 'three';
import * as TX from './textures.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { CLIPS, sample, basisQuat, ONE_HANDED } from './mocap.js';

// ================================================================
// 外部の3Dモデル（Sketchfab, CC BY 4.0）
//  - 着物："Japanese Clothes" by Takeru
//  - 刀　："Katana Samurai (game ready asset)" by Pixel Life
// 着物は人物の骨格に追従するスキンメッシュに変換して着せる
// ================================================================
export const ASSETS = { ready: false };
const CLOTH_S = 0.00935;           // 着物：cm → 人物の座標
const ARM_DIR = { x: 0.74, y: -0.67 }; // 着物の袖の向き（Aポーズ）
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 骨の番号
const B = { hips: 0, torso: 1, head: 2, upL: 3, foL: 4, upR: 5, foR: 6, thL: 7, shL: 8, thR: 9, shR: 10 };

// 頂点ごとにどの骨に付いて動くかを決める（自動の重み付け）
function skinWeights(name, geo) {
  const pos = geo.attributes.position, n = pos.count;
  const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const w = {};
    const add = (b, v) => { if (v > 1e-4) w[b] = (w[b] || 0) + v; };
    if (name === 'hakama') {
      const h = smooth(0.86, 1.02, y);                 // 腰
      const left = smooth(-0.07, 0.07, x);             // 左右の脚
      const k = smooth(0.42, 0.62, y);                 // 膝の上下
      add(B.hips, h);
      add(B.thL, (1 - h) * left * k); add(B.shL, (1 - h) * left * (1 - k));
      add(B.thR, (1 - h) * (1 - left) * k); add(B.shR, (1 - h) * (1 - left) * (1 - k));
    } else {
      const ax = Math.abs(x), side = x >= 0;
      const arm = smooth(0.17, 0.31, ax);              // 袖
      const t = (ax - 0.2) * ARM_DIR.x + (y - 1.45) * ARM_DIR.y; // 肩からの腕方向の距離
      const fore = smooth(0.2, 0.36, t);
      // 袖の垂れた部分（袂）は腕から離れるほど胴にも付ける（腕を上げても翼のように広がらない）
      const py = (ax - 0.2) * -ARM_DIR.y + (y - 1.45) * ARM_DIR.x;
      const hang = smooth(-0.05, -0.22, py) * 0.55;
      const armW = arm * (1 - hang);
      const low = smooth(0.95, 0.7, y) * (1 - arm);    // 裾は少し腰について動く
      add(B.torso, (1 - armW) * (1 - low * 0.5));
      add(B.hips, low * 0.5);
      add(side ? B.upL : B.upR, armW * (1 - fore));
      add(side ? B.foL : B.foR, armW * fore);
    }
    const top = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    top.forEach(([b, v], j) => { idx[i * 4 + j] = +b; wts[i * 4 + j] = v / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  geo.setAttribute('restPos', new THREE.BufferAttribute(pos.array.slice(), 3));
}

export async function loadAssets(base = 'assets/models/') {
  const loader = new GLTFLoader();
  const [clothes, katana] = await Promise.all([loader.loadAsync(base + 'clothes/scene.gltf'), loader.loadAsync(base + 'katana/scene.gltf')]);
  clothes.scene.updateMatrixWorld(true);
  const garments = {};
  clothes.scene.traverse((o) => {
    if (!o.isMesh) return;
    const name = /hakama/i.test(o.name) ? 'hakama' : /jinbei/i.test(o.name) ? 'jinbei' : 'haori';
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld).scale(CLOTH_S, CLOTH_S, CLOTH_S);
    skinWeights(name, geo);
    geo.computeBoundingSphere();
    garments[name] = { geo, mat: o.material };
  });
  ASSETS.garments = garments;
  // 刀：柄の中心を原点、切っ先を +Y に
  katana.scene.updateMatrixWorld(true);
  katana.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const p = g.attributes.position;
    const KS = 0.0069;
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
      p.setXYZ(i, Y * KS, (X + 20) * KS, -Z * KS);
    }
    const nrm = g.attributes.normal;
    for (let i = 0; i < nrm.count; i++) { const X = nrm.getX(i), Y = nrm.getY(i), Z = nrm.getZ(i); nrm.setXYZ(i, Y, X, -Z); }
    g.deleteAttribute('tangent');
    g.computeBoundingSphere();
    ASSETS.katana = { geo: g, mat: o.material };
  });
  ASSETS.ready = true;
}

// 着物の色（人物ごと）。map:false は無地
const CLOTH_LOOK = {
  oishi: { haori: { color: 0x2b2b30, dandara: true }, jinbei: { color: 0x2a2a2e }, hakama: { color: 0x55555c } },
  ronin: { haori: { color: 0x2f2f34, dandara: true }, jinbei: { color: 0x2a2a2e }, hakama: { color: 0x5a5a60 } },
  retainer: { jinbei: { color: 0xc9cfd6, map: false }, hakama: { color: 0xb7bec6 } },
  retainer2: { haori: { color: 0xb09a7c }, jinbei: { color: 0x8a8578 }, hakama: { color: 0x6e6e74 } },
  boss1: { haori: { color: 0x6f9a74 }, jinbei: { color: 0x3c4a3e }, hakama: { color: 0x7a6e5e } },
  boss2: { haori: { color: 0x9a78b0 }, jinbei: { color: 0x40334a }, hakama: { color: 0x55555c } },
  boss3: { haori: { color: 0xb08a68 }, jinbei: { color: 0x4a3a2c }, hakama: { color: 0x66625c } },
  kira: { haori: { color: 0xede9df, map: false }, jinbei: { color: 0xe4dfd2, map: false }, hakama: { color: 0xdcd6c6, map: false } },
};
const clothMats = {};
function clothMaterial(type, part) {
  const key = type + part;
  if (clothMats[key]) return clothMats[key];
  const look = (CLOTH_LOOK[type] || CLOTH_LOOK.retainer)[part];
  const src = ASSETS.garments[part].mat;
  const m = new THREE.MeshStandardMaterial({
    map: look.map === false ? null : src.map, normalMap: src.normalMap, color: look.color,
    roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
  });
  if (look.dandara) {
    // 赤穂浪士の火事装束：裾と袖口に白の山形（だんだら）
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 restPos;\nvarying vec3 vRest;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = restPos;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float tri = abs(fract(atan(vRest.x, vRest.z) * 2.2) - 0.5) * 2.0;
            float v = (vRest.y - 0.552) / 0.12;
            float band = (v < 1.0 && v < 0.28 + 0.72 * tri) ? 1.0 : 0.0;
            float ax = abs(vRest.x);
            float t = (ax - 0.2) * 0.74 + (vRest.y - 1.45) * -0.67;
            float py = (ax - 0.2) * 0.67 + (vRest.y - 1.45) * 0.74;
            float tri2 = abs(fract(atan(py, vRest.z) * 1.6) - 0.5) * 2.0;
            float c = (0.43 - t) / 0.08;
            if (ax > 0.3 && c < 1.0 && c < 0.28 + 0.72 * tri2) band = 1.0;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.85, 0.82), band);
          }`);
    };
    m.customProgramCacheKey = () => 'dandara';
  }
  clothMats[key] = m;
  return m;
}


const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

// ---------- 共有ジオメトリ ----------
const G = {};
function geos() {
  if (G.ready) return G;
  // 脚（腿＋膝から下。袴は裾に向けて広がる）
  G.thigh = new THREE.CylinderGeometry(0.115, 0.15, 0.5, 14, 1).translate(0, -0.22, 0);
  G.shin = new THREE.CylinderGeometry(0.15, 0.215, 0.46, 14, 1).translate(0, -0.2, 0);
  G.foot = new THREE.BoxGeometry(0.1, 0.06, 0.25).translate(0, -0.05, 0.05);
  G.chest = new THREE.CylinderGeometry(0.205, 0.2, 0.82, 18, 1).translate(0, 0.2, 0);
  G.obi = new THREE.CylinderGeometry(0.2, 0.2, 0.09, 18).translate(0, 0.02, 0);
  G.upperSleeve = new THREE.CylinderGeometry(0.075, 0.095, 0.32, 12, 1, true).translate(0, -0.15, 0);
  G.lowerSleeve = new THREE.CylinderGeometry(0.09, 0.13, 0.2, 12, 1, true).translate(0, -0.08, 0);
  G.tamoto = new THREE.BoxGeometry(0.03, 0.26, 0.2).translate(0, -0.16, -0.06);
  G.forearm = new THREE.CylinderGeometry(0.034, 0.04, 0.16, 8).translate(0, -0.2, 0);
  G.hand = new THREE.SphereGeometry(0.045, 10, 8).scale(0.9, 1.2, 1).translate(0, -0.29, 0);
  G.neck = new THREE.CylinderGeometry(0.048, 0.056, 0.14, 10).translate(0, 0.6, 0);
  G.head = new THREE.SphereGeometry(0.112, 28, 20);
  G.hoodCap = new THREE.SphereGeometry(0.126, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.hoodBack = new THREE.CylinderGeometry(0.127, 0.16, 0.24, 18, 1, true, Math.PI * 0.42, Math.PI * 1.16);
  G.band = new THREE.TorusGeometry(0.119, 0.014, 6, 24);
  G.hairCap = new THREE.SphereGeometry(0.119, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.47);
  G.pate = new THREE.SphereGeometry(0.1205, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.2);
  G.topknot = new THREE.CylinderGeometry(0.017, 0.02, 0.14, 8).rotateX(Math.PI / 2);
  G.tsuka = new THREE.CylinderGeometry(0.017, 0.017, 0.26, 8);
  G.tsuba = new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16);
  // 反りのある刀身（細長い押し出し形状）
  const sh = new THREE.Shape();
  const L = 0.74, Wd = 0.03;
  sh.moveTo(0, 0);
  sh.quadraticCurveTo(0.01, L * 0.5, 0.032, L);
  sh.lineTo(0.032 - Wd * 0.9, L - 0.035);
  sh.quadraticCurveTo(-Wd * 0.65, L * 0.5, -Wd, 0);
  sh.lineTo(0, 0);
  G.blade = new THREE.ExtrudeGeometry(sh, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 8 })
    .translate(Wd / 2, 0.14, -0.0025);
  G.saya = new THREE.CylinderGeometry(0.02, 0.017, 0.78, 8).translate(0, -0.39, 0);
  G.shaft = new THREE.CylinderGeometry(0.017, 0.017, 2.4, 8).translate(0, 0.55, 0);
  G.spearTip = new THREE.ConeGeometry(0.022, 0.26, 6).translate(0, 1.88, 0);
  G.chochin = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 16, 4).translate(0, 0, 0);
  G.ready = true;
  return G;
}

// ---------- マテリアル ----------
const M = {};
function mat(key, fn) { if (!M[key]) M[key] = fn(); return M[key]; }
const std = (o) => new THREE.MeshStandardMaterial(o);

const OUTFITS = {
  oishi: { coat: () => std({ map: TX.dandaraTex(), roughness: 0.85 }), hakama: () => std({ map: TX.hakamaTex('o', '#232329'), roughness: 0.9 }), face: 'ronin', head: 'hood', band: '#f2efe6' },
  ronin: { coat: () => std({ map: TX.dandaraTex(), roughness: 0.85 }), hakama: () => std({ map: TX.hakamaTex('r', '#26262c'), roughness: 0.9 }), face: 'ronin', head: 'hood', band: '#e9e5da' },
  retainer: { coat: () => std({ map: TX.kimonoTex('#c2c9cf', '#9aa6b1', 'ret'), roughness: 0.9 }), hakama: () => std({ map: TX.hakamaTex('k', '#a6adb4'), roughness: 0.9 }), face: 'enemy', head: 'mage' },
  retainer2: { coat: () => std({ map: TX.kimonoTex('#c9c3b2', '#a89f88', 'ret2'), roughness: 0.9 }), hakama: () => std({ map: TX.hakamaTex('k2', '#4a4a50'), roughness: 0.9 }), face: 'enemy', head: 'mage' },
  boss1: { coat: () => std({ map: TX.kimonoTex('#26372c', '#1c2a20', 'b1'), roughness: 0.8 }), hakama: () => std({ map: TX.hakamaTex('b1', '#3b3328'), roughness: 0.9 }), face: 'enemy', head: 'mage' },
  boss2: { coat: () => std({ map: TX.kimonoTex('#3a2a44', '#2b1f33', 'b2'), roughness: 0.8 }), hakama: () => std({ map: TX.hakamaTex('b2', '#2a2a2e'), roughness: 0.9 }), face: 'enemy', head: 'mage' },
  boss3: { coat: () => std({ map: TX.kimonoTex('#4a3524', '#3a281a', 'b3'), roughness: 0.8 }), hakama: () => std({ map: TX.hakamaTex('b3', '#2f2d2a'), roughness: 0.9 }), face: 'enemy', head: 'mage' },
  kira: { coat: () => std({ map: TX.kimonoTex('#ebe8df', '#dcd6c8', 'kira'), roughness: 0.7 }), hakama: () => std({ map: TX.hakamaTex('kira', '#e2ddd0'), roughness: 0.8 }), face: 'kira', head: 'white' },
};

const skinMat = (k) => mat('skin' + k, () => std({ color: k === 'kira' ? '#d8b7a0' : k === 'enemy' ? '#d3a582' : '#c99574', roughness: 0.75 }));
const faceMat = (k) => mat('face' + k, () => std({ map: TX.faceTex(k), roughness: 0.7 }));

function bladeMat() {
  return std({ color: '#e8eef5', metalness: 1.0, roughness: 0.18, emissive: '#1b2230', emissiveIntensity: 0.6 });
}

let shadowsOn = true;
export function setCharacterShadows(v) { shadowsOn = v; }

function mesh(geo, material, parent, cast = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast && shadowsOn;
  parent.add(m);
  return m;
}

// ポーズ計算に使う定数（胴体ローカル座標：原点＝腰、+Z前、+Y上、+X左）
const SH_L = V(0.2, 0.5, 0), SH_R = V(-0.2, 0.5, 0);
const UPPER = 0.29, LOWER = 0.29;
const THIGH = 0.44, SHIN = 0.44, ANKLE_Y = 0.08;
const POLE_KNEE = V(0, 0, 1);
const POLE_R = V(-0.7, -0.8, -0.35), POLE_L = V(0.7, -0.8, -0.35);
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _g = V(), _h = V(), _i = V(), _j = V(), _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _qe = new THREE.Quaternion();
const newPose = () => ({ grip: V(), dir: V(0, 1, 0), yaw: 0, pitch: 0, roll: 0, drop: 0, rise: 0, stepF: 0, spread: 0, headYaw: 0 });
const _p1 = newPose(), _p2 = newPose();
function clonePose(p) { const o = newPose(); o.grip.copy(p.grip); o.dir.copy(p.dir); for (const k of ['yaw', 'pitch', 'roll', 'drop', 'rise', 'stepF', 'spread', 'headYaw']) o[k] = p[k]; return o; }
function blendPose(a, b, k, out) {
  out.grip.lerpVectors(a.grip, b.grip, k);
  const ad = _a.copy(a.dir), bd = _b.copy(b.dir);
  out.dir.lerpVectors(ad, bd, k);
  if (out.dir.lengthSq() < 1e-4) out.dir.copy(bd);
  out.dir.normalize();
  for (const key of ['yaw', 'pitch', 'roll', 'drop', 'rise', 'stepF', 'spread', 'headYaw']) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}
const easeOut = (x) => 1 - (1 - x) * (1 - x);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class Character {
  constructor(type, opts = {}) {
    geos();
    this.type = type;
    this.name = opts.name || '';
    const outfit = OUTFITS[type] || OUTFITS.retainer;
    const coat = mat('coat' + type, outfit.coat);
    const hak = mat('hak' + type, outfit.hakama);
    const sleeveMat = mat('sleeve' + type, () => { const m = coat.clone(); m.side = THREE.DoubleSide; return m; });
    const dark = mat('dark', () => std({ color: '#141416', roughness: 0.9 }));
    const skin = skinMat(outfit.face);

    this.root = new THREE.Group();
    this.root.userData.character = this;
    this.body = new THREE.Group(); this.root.add(this.body);
    this.hips = new THREE.Group(); this.hips.position.y = 0.95; this.body.add(this.hips);

    // 脚（袴）
    const cloth = [];
    this.cloth = cloth;
    const mkLeg = (x) => {
      const leg = new THREE.Group(); leg.position.set(x, 0, 0); this.hips.add(leg);
      const upper = new THREE.Group(); leg.add(upper);
      cloth.push(mesh(G.thigh, hak, upper));
      const knee = new THREE.Group(); knee.position.y = -THIGH; upper.add(knee);
      cloth.push(mesh(G.shin, hak, knee));
      const foot = new THREE.Group(); foot.position.y = -SHIN; knee.add(foot);
      mesh(G.foot, dark, foot);
      leg.userData = { upper, elbow: knee, foot };
      return leg;
    };
    this.legL = mkLeg(0.1); this.legR = mkLeg(-0.1);
    this.footL = V(0.12, 0.08, -0.1); this.footR = V(-0.12, 0.08, 0.15);

    // 胴
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    const chest = mesh(G.chest, coat, this.torso); chest.scale.z = 0.74; cloth.push(chest);
    const obi = mesh(G.obi, mat('obi' + type, () => std({ color: type === 'kira' ? '#8a7a5a' : type.startsWith('ronin') || type === 'oishi' ? '#e9e5da' : '#2d2a35', roughness: 0.8 })), this.torso);
    obi.scale.z = 0.76; cloth.push(obi);
    mesh(G.neck, skin, this.torso);

    // 頭
    this.head = new THREE.Group(); this.head.position.y = 0.76; this.torso.add(this.head);
    const hm = mesh(G.head, faceMat(outfit.face), this.head); hm.scale.set(0.9, 1.08, 0.98);
    hm.rotation.y = 0; // u=0.25 が +Z 方向
    if (outfit.head === 'hood') {
      const hood = mat('hood', () => std({ color: '#121317', roughness: 0.95, side: THREE.DoubleSide }));
      const cap = mesh(G.hoodCap, hood, this.head); cap.position.y = 0.012; cap.scale.set(0.95, 1.05, 1.0);
      const back = mesh(G.hoodBack, hood, this.head); back.position.y = -0.03;
      const band = mesh(G.band, mat('band' + type, () => std({ color: outfit.band, roughness: 0.8 })), this.head);
      band.rotation.x = Math.PI / 2; band.position.y = 0.045; band.scale.set(0.93, 1.02, 1);
    } else {
      const hairColor = outfit.head === 'white' ? '#d7d4cc' : '#16110e';
      const hair = mat('hair' + hairColor, () => std({ map: TX.hairTex(hairColor), roughness: 0.6 }));
      const cap = mesh(G.hairCap, hair, this.head); cap.position.y = 0.006; cap.rotation.x = -0.18; cap.scale.set(0.93, 1.06, 1.0);
      if (outfit.head === 'mage') { const pate = mesh(G.pate, skin, this.head); pate.rotation.x = 0.35; pate.position.y = 0.004; pate.scale.set(0.93, 1.06, 1.0); }
      const knot = mesh(G.topknot, hair, this.head); knot.position.set(0, 0.125, -0.005);
    }

    // 腕（上腕＋肘から先。2関節IKで肘を曲げる）
    const upperMat = type === 'oishi' || type === 'ronin' ? mat('upperRonin', () => std({ color: '#16171b', roughness: 0.9, side: THREE.DoubleSide })) : sleeveMat;
    const mkArm = (pos) => {
      const arm = new THREE.Group(); arm.position.copy(pos); this.torso.add(arm);
      const upper = new THREE.Group(); arm.add(upper);
      cloth.push(mesh(G.upperSleeve, upperMat, upper));
      const elbow = new THREE.Group(); elbow.position.y = -UPPER; upper.add(elbow);
      cloth.push(mesh(G.lowerSleeve, sleeveMat, elbow), mesh(G.tamoto, upperMat, elbow));
      mesh(G.forearm, skin, elbow);
      mesh(G.hand, skin, elbow);
      arm.userData = { upper, elbow };
      return arm;
    };
    this.armL = mkArm(SH_L);
    this.armR = mkArm(SH_R);

    // 武器
    this.weaponType = opts.weapon || (type === 'kira' ? 'none' : 'katana');
    this.weapon = new THREE.Group(); this.torso.add(this.weapon);
    this.bladeMat = bladeMat();
    if (this.weaponType === 'katana') {
      this.swordParts = [
        mesh(G.tsuka, mat('tsuka', () => std({ map: TX.tsukaTex(), roughness: 0.8 })), this.weapon),
        mesh(G.tsuba, mat('tsuba', () => std({ color: '#3a3226', metalness: 0.7, roughness: 0.5 })), this.weapon),
      ];
      this.swordParts[1].position.y = 0.135;
      this.blade = mesh(G.blade, this.bladeMat, this.weapon);
      this.swordParts.push(this.blade);
      this.reach = 0.88;
    } else if (this.weaponType === 'spear') {
      mesh(G.shaft, mat('shaft', () => std({ color: '#3b2717', roughness: 0.7 })), this.weapon);
      this.blade = mesh(G.spearTip, this.bladeMat, this.weapon);
      this.reach = 1.9;
    } else {
      this.weapon.visible = false;
    }
    if (type !== 'kira') {
      // 鞘は腰（左腰に差して後ろ下がり）
      const saya = mesh(G.saya, mat('saya', () => std({ color: '#0d0c0c', roughness: 0.35, metalness: 0.2 })), this.hips);
      saya.position.set(0.2, 0.06, 0.14); saya.rotation.set(1.2, 0, 0.12);
    }

    if (opts.lantern) {
      // 提灯を左手に
      this.lantern = new THREE.Group();
      const lm = new THREE.Mesh(G.chochin, std({ map: TX.chochinTex(), emissive: '#ffb860', emissiveIntensity: 1.6, emissiveMap: TX.chochinTex(), roughness: 1 }));
      this.lantern.add(lm);
      this.torso.add(this.lantern);
    }

    const s = opts.scale || (type === 'kira' ? 0.88 : 0.93);
    this.root.scale.setScalar(s);
    this.outfitType = type;
    this.height = 1.75 * s;

    // アニメーション状態
    this.walk = 0; this.phase = Math.random() * 6;
    this.mode = 'ready'; this.modeT = 0; this.modeDur = 0;
    this.slashL = V(1, 0, 0);
    this.guardAngle = 0;
    this.hitT = 0; this.flash = 0; this.deadT = 0; this.deadDir = 1;
    this.swinging = false;
    this.facingYaw = 0;
    // 現在の姿勢（胴体ローカル）：grip=柄の中心, dir=刀身の向き
    this.cur = { grip: V(-0.02, 0.25, 0.36), dir: V(0, 0.75, 1).normalize(), yaw: 0, pitch: 0.05, roll: 0, drop: 0.06, rise: 0, stepF: 0.2, spread: 0.06, headYaw: 0 };
    this.from = null;
    this.dress();
  }

  // 着物と刀のモデルに着替える（読み込み後に呼ぶ）
  dress() {
    if (!ASSETS.ready || this.dressed) return;
    this.dressed = true;
    // 刀
    if (this.weaponType === 'katana' && ASSETS.katana) {
      const km = ASSETS.katana.mat.clone();
      km.emissive = new THREE.Color(0x1b2230); km.emissiveIntensity = 0.6;
      km.envMapIntensity = 2.2;
      const k = new THREE.Mesh(ASSETS.katana.geo, km);
      k.castShadow = shadowsOn;
      this.weapon.add(k);
      this.swordParts.forEach((m) => { m.visible = false; });
      this.bladeMat = km;
      this.blade = k;
    }
    // 骨（既存の関節に付ける）
    const mk = (parent) => { const b = new THREE.Bone(); parent.add(b); return b; };
    const L = this.armL.userData, R = this.armR.userData, LL = this.legL.userData, RL = this.legR.userData;
    const bones = [mk(this.hips), mk(this.torso), mk(this.head), mk(L.upper), mk(L.elbow), mk(R.upper), mk(R.elbow), mk(LL.upper), mk(LL.elbow), mk(RL.upper), mk(RL.elbow)];
    // 着物と同じ姿勢（Aポーズ）にしてから結び付ける
    const saved = { p: this.root.position.clone(), r: this.root.rotation.y };
    this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0);
    this.hips.position.set(0, 0.95, 0); this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    for (const [arm, sx] of [[L, 1], [R, -1]]) {
      arm.upper.quaternion.setFromUnitVectors(DOWN, V(sx * ARM_DIR.x, ARM_DIR.y, 0).normalize());
      arm.elbow.quaternion.identity();
    }
    for (const leg of [LL, RL]) { leg.upper.quaternion.identity(); leg.elbow.quaternion.identity(); }
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    const look = CLOTH_LOOK[this.outfitType] || CLOTH_LOOK.retainer;
    this.garments = [];
    for (const part of ['hakama', 'jinbei', 'haori']) {
      if (!look[part]) continue;
      const m = new THREE.SkinnedMesh(ASSETS.garments[part].geo, clothMaterial(this.outfitType, part));
      m.frustumCulled = false;
      m.castShadow = shadowsOn;
      this.root.add(m);
      m.updateMatrixWorld(true);
      m.bind(skeleton, m.matrixWorld);
      this.garments.push(m);
    }
    this.cloth.forEach((m) => { m.visible = false; });
    this.root.position.copy(saved.p); this.root.rotation.y = saved.r;
  }

  setPosition(x, z) { this.root.position.set(x, 0, z); }
  get pos() { return this.root.position; }
  faceTo(x, z, rate = 1, dt = 1) {
    const yaw = Math.atan2(x - this.root.position.x, z - this.root.position.z);
    let d = yaw - this.facingYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facingYaw += d * Math.min(1, rate * dt * 10);
    this.root.rotation.y = this.facingYaw;
  }
  setYaw(y) { this.facingYaw = y; this.root.rotation.y = y; }

  // ---- モーションキャプチャの再生 ----
  // from/to：クリップの使う範囲(秒), dur：再生にかける時間, warp：当たる瞬間を合わせる {u, t}
  playMocap(name, o = {}) {
    const clip = CLIPS[name];
    if (!clip) return false;
    const from = o.from ?? 0, to = Math.min(clip.duration, o.to ?? clip.duration);
    this.mo = { clip, t: 0, from, to, dur: o.dur ?? (to - from), mirror: !!o.mirror, travel: o.travel ?? 0.3,
      loop: !!o.loop, hold: !!o.hold, fadeIn: o.fadeIn ?? 0.07, fadeOut: o.fadeOut ?? 0.16, warp: o.warp || null,
      phase: o.phase || 0, fadeOutAt: 0 };
    return true;
  }
  stopMocap() { this.mo = null; this._moW = 0; }
  mocapClipTime() {
    const m = this.mo;
    let u = m.dur > 0 ? (m.t + m.phase) / m.dur : 1;
    u = m.loop ? u % 1 : Math.min(1, u);
    if (m.warp) {
      const { u: wu, t: wt } = m.warp;
      return u < wu ? m.from + (wt - m.from) * (u / wu) : wt + (m.to - wt) * ((u - wu) / (1 - wu));
    }
    return m.from + (m.to - m.from) * u;
  }
  mocapWeight() {
    const m = this.mo;
    let w = Math.min(1, m.t / Math.max(0.001, m.fadeIn));
    if (!m.loop && !m.hold) w *= Math.min(1, Math.max(0, (m.dur - m.t) / m.fadeOut));
    if (m.fadeOutAt) w *= Math.max(0, (m.fadeOutAt - m.t) / 0.15);
    return w;
  }

  // 斬撃：L = 胴体ローカルの斬る方向（x:左+, y:上+）。dur = 振りかぶり〜戻りまでの全体時間
  // mocap:true なら横薙ぎに本物の動き（モーションキャプチャ）を使う
  startSlash(lx, ly, dur = 0.56, mocap = false) {
    this.slashL.set(lx, ly, 0).normalize();
    this.from = clonePose(this.cur);
    this.mode = 'slash'; this.modeT = 0; this.modeDur = dur;
    if (mocap && this.slashL.y <= -0.6 && CLIPS.slash_down) {
      // 振り下ろし（上段から斬り下ろす）。斜めなら向きに合わせて左右反転
      const c = CLIPS.slash_down;
      const mirror = false;
      this.playMocap('slash_down', { from: Math.max(0, c.contact - 0.45), to: Math.min(c.duration, c.contact + 0.5), dur, mirror,
        warp: { u: 0.27, t: c.contact }, travel: 0.3, fadeIn: 0.05, fadeOut: 0.18 });
    } else if (mocap && Math.abs(this.slashL.y) < 0.6) {
      // 刀が動く向き（+1：人物の右→左）に合うクリップを選ぶ。左右反転も候補にする
      const want = this.slashL.x >= 0 ? 1 : -1;
      const cands = [];
      for (const n of ['slash_great', 'slash_sweep', 'slash_spin', 'slash_inward']) {
        const c = CLIPS[n];
        if (!c) continue;
        if (c.sweepX === want) cands.push([n, false]);
        else if (!ONE_HANDED.has(n)) cands.push([n, true]);   // 両手の斬撃だけ左右反転して使う
      }
      if (cands.length) {
        const [n, mirror] = cands[Math.floor(Math.random() * cands.length)];
        const c = CLIPS[n];
        this.playMocap(n, { from: Math.max(0, c.contact - 0.42), to: Math.min(c.duration, c.contact + 0.5), dur, mirror,
          warp: { u: 0.27, t: c.contact }, travel: 0.25, fadeIn: 0.05, fadeOut: 0.18 });
      }
    } else if (this.mo && !this.mo.loop) this.stopMocap();
  }
  setMode(m, dur = 0) {
    if (this.mode !== m) {
      this.mode = m; this.modeT = 0;
      if (m === 'cower') this.playMocap('terrified', { loop: true, travel: 0, fadeIn: 0.4 });
    }
    this.modeDur = dur;
  }

  // 斬られてよろめく（lx,ly：斬撃が進む向き。+X=この人物の左）
  hit(lx = 0, ly = -1) {
    this.hitT = 0.35; this.flash = 0.25; this.hitL = { x: lx, y: ly };
    // 本物の被弾の動き（斬られた向きに合わせて左右反転）
    this.playMocap('hit_impact', { from: 0.05, to: 0.95, dur: 0.6, mirror: lx < 0, travel: 0.6, fadeIn: 0.04, fadeOut: 0.2 });
  }

  // 斬られ方：kind = 'down'（唐竹・袈裟）/ 'side'（横一文字）/ 'up'（斬り上げ）
  die(kind = 'down', side = 1) {
    const wasCower = this.mode === 'cower';
    if (wasCower) { kind = 'down'; this.modeT = 0.8; } else this.modeT = 0;
    this.mode = 'dead';
    this.deathKind = kind; this.deathSide = side >= 0 ? 1 : -1;
    this.dropWeapon();
    this.stopMocap();
    // 本物の倒れ方：縦に斬られたら前へ崩れ、斬り上げられたら仰向けに倒れる（横は手作りの回転）
    if (!wasCower) {
      if (kind === 'down') this.playMocap('death_walk', { from: 0.95, to: 3.0, mirror: side < 0, travel: 0.35, hold: true, fadeIn: 0.06 });
      else if (kind === 'up') this.playMocap('death_back', { from: 0.25, to: 2.5, mirror: side < 0, travel: 0.45, hold: true, fadeIn: 0.06 });
    }
  }

  // 手から離れた刀が回りながら落ちる
  dropWeapon() {
    if (this.weaponType === 'none' || !this.weapon.visible || !this.root.parent) return;
    this.root.updateMatrixWorld(true);
    const w = this.weapon.clone();
    this.weapon.matrixWorld.decompose(w.position, w.quaternion, w.scale);
    this.root.parent.add(w);
    const side = this.deathSide;
    const fwd = V(Math.sin(this.facingYaw), 0, Math.cos(this.facingYaw));
    const right = V(Math.cos(this.facingYaw), 0, -Math.sin(this.facingYaw));
    const vel = V().addScaledVector(right, side * (0.8 + Math.random())).addScaledVector(fwd, -0.6 - Math.random()).setY(1.6 + Math.random() * 1.2);
    const ang = V((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 14);
    this.dropped = { obj: w, vel, ang, landed: false };
    this.weapon.visible = false;
  }
  updateDropped(dt) {
    const d = this.dropped;
    if (!d || d.landed) return;
    d.vel.y -= 9.8 * dt;
    d.obj.position.addScaledVector(d.vel, dt);
    _q.setFromEuler(new THREE.Euler(d.ang.x * dt, d.ang.y * dt, d.ang.z * dt));
    d.obj.quaternion.multiply(_q);
    if (d.obj.position.y < 0.06 && d.vel.y < 0) {
      if (d.vel.y < -2.5) { // 一度跳ねる
        d.vel.y *= -0.25; d.vel.x *= 0.4; d.vel.z *= 0.4; d.ang.multiplyScalar(0.3);
        d.obj.position.y = 0.06;
        if (this.onClatter) this.onClatter();
        return;
      }
      // 床に寝かせる
      const bd = V(0, 1, 0).applyQuaternion(d.obj.quaternion).setY(0);
      if (bd.lengthSq() < 1e-4) bd.set(1, 0, 0);
      d.obj.quaternion.setFromUnitVectors(UP, bd.normalize());
      d.obj.rotateY(Math.PI / 2);
      d.obj.position.y = 0.035;
      d.landed = true;
    }
  }
  // やり直しで起き上がる
  revive() {
    if (this.dropped) { if (this.dropped.obj.parent) this.dropped.obj.parent.remove(this.dropped.obj); this.dropped = null; }
    this.mode = 'ready'; this.modeT = 0; this.hitT = 0;
    this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0);
    this.weapon.visible = this.weaponType !== 'none';
  }
  removeFrom(scene) {
    scene.remove(this.root);
    if (this.dropped) scene.remove(this.dropped.obj);
  }

  // 斬られて倒れるまでの身体の動き。返り値は両手の目標位置
  deathPose() {
    const t = this.modeT, s = this.deathSide;
    const sm = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
    const body = this.body, torso = this.torso, head = this.head;
    let hands;
    if (this.deathKind === 'up') {
      // 斬り上げ：のけぞって後ろへよろめき、仰向けに倒れる
      const recoil = sm(0, 0.12, t), stag = sm(0.05, 0.5, t), fall = sm(0.35, 0.95, t);
      torso.rotation.set(-0.55 * recoil + 0.2 * fall, 0.2 * s * recoil, 0);
      head.rotation.set(-0.6 * recoil + 0.4 * fall, 0, 0);
      this.footL.set(0.15, ANKLE_Y, -0.15 - 0.3 * stag); this.footR.set(-0.15, ANKLE_Y, 0.2 - 0.1 * stag);
      this._hipY = 0.9 - 0.06 * stag;
      body.position.z = -0.45 * stag;
      body.rotation.x = -1.5 * fall + 0.05 * Math.sin(Math.min(1, (t - 0.95) * 4) * Math.PI) * (t > 0.95 ? 1 : 0);
      body.position.y = 0.1 * fall;
      hands = t < 0.5 ? [V(-0.45, 0.75, 0.0), V(0.45, 0.7, 0.0)] : [V(-0.5, 0.45, -0.1), V(0.5, 0.5, -0.1)];
    } else if (this.deathKind === 'side') {
      // 横一文字：斬られた勢いで身体が回り、よろけて横倒し
      const spin = sm(0, 0.22, t), stag = sm(0.1, 0.7, t), fall = sm(0.55, 1.15, t);
      torso.rotation.set(0.35 * stag, 0.95 * s * spin - 0.3 * s * fall, -0.25 * s * stag);
      head.rotation.set(0.3 * stag, 0.4 * s * spin, 0);
      this.hips.rotation.y = 0.5 * s * spin;
      this.footL.set(0.14 + 0.22 * s * stag, ANKLE_Y, -0.1 + 0.1 * stag); this.footR.set(-0.14 + 0.3 * s * stag, ANKLE_Y, 0.12 - 0.15 * stag);
      this._hipY = 0.88 - 0.12 * stag;
      body.position.x = 0.55 * s * stag;
      body.rotation.z = -1.42 * s * fall;
      body.rotation.x = 0.25 * fall;
      body.position.y = 0.12 * fall;
      hands = [V(-0.05, 0.28, 0.2), V(0.08, 0.3, 0.22)];
      if (fall > 0.6) hands = [V(-0.35, 0.0, 0.25), V(0.35, 0.1, 0.1)];
    } else {
      // 唐竹割り・袈裟斬り：のけぞり → 傷を押さえて膝から崩れ → 前のめりに倒れる
      const recoil = sm(0, 0.12, t) * (1 - sm(0.15, 0.45, t)), kneel = sm(0.2, 0.75, t), fall = sm(0.95, 1.45, t);
      torso.rotation.set(-0.45 * recoil + 0.6 * kneel - 0.35 * fall, 0.2 * s * kneel, 0.12 * s * kneel);
      head.rotation.set(-0.5 * recoil + 0.45 * kneel - 0.3 * fall, 0.2 * s * kneel, 0);
      // 膝をつく（脚の下側は床に隠れる）
      this.footL.set(0.14, ANKLE_Y, -0.12 - 0.42 * kneel); this.footR.set(-0.14, ANKLE_Y, 0.15 - 0.45 * kneel);
      this._hipY = 0.9 - 0.42 * kneel;
      body.rotation.x = 1.38 * fall;
      body.rotation.z = -0.15 * s * fall;
      body.position.y = 0.05 * fall;
      hands = fall < 0.4 ? [V(-0.04, 0.22, 0.24), V(0.06, 0.32, 0.22)] : [V(-0.4, 0.3, 0.35), V(0.35, 0.2, 0.3)];
    }
    return hands;
  }

  // 斬撃の軌道上の姿勢（u: 0=振りかぶり頂点 → 1=振り抜き）
  swingPose(u, out) {
    const L = this.slashL;
    // 手元の軌道：振りかぶり側 → 前へ伸ばす → 振り抜いた側（二次ベジェ）
    const hs = V(0, 0.5, 0.2).addScaledVector(L, -0.42);
    const hm = V(0, 0.42, 0.55);
    const he = V(0, 0.4, 0.36).addScaledVector(L, 0.34);
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    out.grip.set(0, 0, 0).addScaledVector(hs, a).addScaledVector(hm, b).addScaledVector(he, c);
    // 刀身は手首を支点に大きく回る：後ろ（振りかぶり）→ 正面 → 斬り下ろした先
    const th = THREE.MathUtils.lerp(-0.5, Math.PI - 0.38, u);
    out.dir.set(0, 0, 0).addScaledVector(L, -Math.cos(th)).add(V(0, 0, Math.sin(th)));
    if (Math.abs(L.y) < 0.5) out.dir.y += 0.08; // 横薙ぎは刃筋をやや水平に保つ
    out.dir.normalize();
    const k = u * 2 - 1; // -1 → 1
    out.yaw = L.x * 0.55 * k;                 // 腰の捻り
    out.pitch = 0.1 - L.y * 0.22 * k;         // 振り下ろしで前傾
    out.roll = -L.x * L.y * 0.12 * k;
    // 斬り方ごとの全身の使い方
    const horiz = Math.max(0, 1 - Math.abs(L.y) * 1.4);   // 横薙ぎ
    const upw = Math.max(0, L.y);                          // 斬り上げ
    const dnw = Math.max(0, -L.y);                         // 振り下ろし
    const sink = Math.min(1, 0.45 + u * 0.8);
    out.stepF = 0.3 + 0.35 * u + horiz * 0.3 * sink;      // 右足を踏み込む
    out.spread = horiz * 0.38 * sink;                     // 横薙ぎは足を大きく開く
    out.drop = 0.08
      + horiz * 0.26 * sink                                // 横薙ぎ：腰を深く落とす
      + upw * 0.2 * (1 - u)                                // 斬り上げ：低く溜めて…
      + dnw * (0.22 * u * u - 0.08 * (1 - u));             // 振り下ろし：伸びてから、斬った後に沈む
    out.rise = upw * 0.12 * u * u;                         // 斬り上げ：伸び上がる
    out.pitch += horiz * 0.15 * sink + dnw * 0.12 * u - upw * 0.18 * u;
    out.headYaw = -out.yaw * 0.8;             // 視線は相手に残す
    return out;
  }

  targetPose(out) {
    const b = Math.sin(this.phase * 0.5) * 0.012;
    out.yaw = 0; out.pitch = 0.05; out.roll = 0; out.drop = 0.06; out.rise = 0; out.stepF = 0.2; out.spread = 0.06; out.headYaw = 0;
    switch (this.mode) {
      case 'sheathed':
        out.grip.set(-0.2, -0.05, 0.12); out.dir.set(-0.1, -0.2, 1).normalize(); out.stepF = 0; out.drop = 0;
        break;
      case 'guard': {
        // 受けの構え：刀身を guardAngle の向きに（+X=相手から見て画面右）
        const lx = Math.cos(this.guardAngle), ly = Math.sin(this.guardAngle);
        out.dir.set(lx, ly, 0.25).normalize();
        out.grip.set(-lx * 0.28, 0.46 - ly * 0.26, 0.4);
        out.pitch = 0.1;
        break;
      }
      case 'windup':
        // 上段に振りかぶる
        out.grip.set(0, 0.86, 0.16); out.dir.set(0, 0.85, -0.5).normalize();
        out.pitch = -0.1; out.drop = 0.02; out.stepF = 0.3;
        if (this.weaponType === 'spear') { out.grip.set(-0.08, 0.3, 0.02); out.dir.set(0, 0.08, 1).normalize(); out.stepF = 0.35; }
        break;
      case 'cower':
        out.grip.set(0, 0.75, 0.25); out.dir.set(0, 1, 0.3).normalize();
        break;
      case 'dead':
        out.grip.set(-0.35, 0.1, 0.2); out.dir.set(-0.6, -0.2, 0.8).normalize(); out.stepF = 0;
        break;
      case 'ready': default:
        // 中段の構え：剣先は相手の喉元、膝を軽く曲げ右足を前に
        out.grip.set(-0.02, 0.24 + b, 0.36); out.dir.set(0, 0.62, 1).normalize();
        if (this.weaponType === 'spear') { out.grip.set(-0.08, 0.22, 0.22); out.dir.set(0, 0.12, 1).normalize(); }
        if (this.walk > 0.3) { out.stepF = 0; out.drop = 0; }
        break;
    }
    return out;
  }

  update(dt) {
    this.modeT += dt;
    this.phase += dt * (4 + this.walk * 7);
    this.hitT = Math.max(0, this.hitT - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.swinging = false;

    const cur = this.cur;
    if (this.mode === 'slash') {
      // 振りかぶり 16% → 斬り込み 22% → 残心 32% → 構えに戻る 30%
      const t = Math.min(1, this.modeT / this.modeDur);
      const T1 = 0.16, T2 = 0.38, T3 = 0.7;
      if (t < T1) {
        const k = easeOut(t / T1);
        blendPose(this.from || cur, this.swingPose(0, _p1), k, cur);
      } else if (t < T2) {
        this.swinging = true;
        const u = easeInOut((t - T1) / (T2 - T1));
        this.swingPose(u, cur);
      } else if (t < T3) {
        this.swingPose(1, cur);
        cur.drop += 0.01 * Math.sin((t - T2) / (T3 - T2) * Math.PI);
      } else {
        const k = easeInOut((t - T3) / (1 - T3));
        const saved = this.mode; this.mode = 'ready';
        this.targetPose(_p2); this.mode = saved;
        blendPose(this.swingPose(1, _p1), _p2, k, cur);
      }
      if (t >= 1) { this.mode = 'ready'; this.modeT = 0; }
    } else {
      this.targetPose(_p1);
      const k = 1 - Math.exp(-dt * (this.mode === 'windup' ? 9 : this.mode === 'dead' ? 6 : 12));
      blendPose(cur, _p1, k, cur);
    }

    // ---- 下半身：足の置き場所と腰の高さを決める（膝はIKで曲げる） ----
    const w = this.walk;
    const stride = (0.12 + cur.stepF * 0.55) * (1 - w);
    const wide = 0.11 + cur.spread * 0.6 * (1 - w);
    const ws = Math.sin(this.phase), wc = Math.cos(this.phase);
    this.footL.set(wide, ANKLE_Y + Math.max(0, -wc) * 0.13 * w, -stride * 0.8 - ws * 0.32 * w);
    this.footR.set(-wide, ANKLE_Y + Math.max(0, wc) * 0.13 * w, stride + ws * 0.32 * w);
    // 伸び上がるときは踵を上げる
    if (cur.rise > 0) { this.footL.y += cur.rise * 0.5; this.footR.y += cur.rise * 0.7; }
    this._hipY = 0.9 + cur.rise - cur.drop - Math.abs(wc) * 0.035 * w;
    this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0);
    this.hips.rotation.set(0, cur.yaw * 0.4, 0);
    this.hips.position.x = 0; this.hips.position.z = 0;

    // ---- 上半身 ----
    this.torso.rotation.set(cur.pitch + 0.06 * w, cur.yaw * 0.6, cur.roll);
    this.head.rotation.set(-cur.pitch * 0.5, cur.headYaw, -cur.roll * 0.5);

    let hideWeapon = false, cower = false;
    if (this.mode === 'sheathed') hideWeapon = this.type !== 'kira';
    if (this.mode === 'cower') {
      cower = true; hideWeapon = true;
      const k = Math.min(1, this.modeT / 0.6);
      // 正座のようにうずくまる
      this._hipY = 0.9 - 0.48 * k;
      this.footL.set(0.12, ANKLE_Y, -0.45 * k); this.footR.set(-0.12, ANKLE_Y, -0.42 * k);
      this.torso.rotation.x = 0.35 * k + Math.sin(this.phase * 3) * 0.02;
      this.head.rotation.x = 0.3 * k;
    }
    // ---- モーションキャプチャ ----
    this._moW = 0;
    // 構え（Great Sword Idle）：刀を持って立ち止まっている間は本物の構えで呼吸する
    const wantStance = this.mode === 'ready' && this.walk < 0.25 && this.weaponType === 'katana' && CLIPS.idle;
    if (wantStance && !this.mo) this.playMocap('idle', { loop: true, travel: 0, fadeIn: 0.3, phase: Math.random() * 2 });
    if (!wantStance && this.mo && this.mo.clip.name === 'idle' && !this.mo.fadeOutAt) this.mo.fadeOutAt = this.mo.t + 0.15;
    if (this.mo) {
      this.mo.t += dt;
      const m = this.mo;
      if ((!m.loop && !m.hold && m.t >= m.dur) || (m.fadeOutAt && m.t >= m.fadeOutAt)) this.stopMocap();
      else { this._moW = this.mocapWeight(); this.applyMocap(this._moW); }
    }
    let deadHands = null;
    if (this.mode === 'dead') {
      if (!this.mo) deadHands = this.deathPose();
      hideWeapon = true;
      this.updateDropped(dt);
    }
    if (this.hitT > 0 && this.mode !== 'dead' && !this.mo) {
      // 斬られた向きによろめく
      const k = Math.sin(Math.min(1, this.hitT / 0.35) * Math.PI * 0.5);
      const h = this.hitL || { x: 0, y: -1 };
      this.torso.rotation.x -= (0.3 + 0.25 * Math.max(0, h.y)) * k;
      this.torso.rotation.z -= h.x * 0.35 * k;
      this.torso.rotation.y += h.x * 0.3 * k;
      this.head.rotation.x -= 0.3 * k;
      this.body.position.x = h.x * 0.12 * k;
      this.body.position.z = -0.12 * k;
    }

    this.solveLegs();

    // ---- 刀と両手 ----
    const grip = cur.grip, dir = cur.dir;
    if (this.weaponType !== 'none') {
      this.weapon.visible = !hideWeapon;
      this.weapon.position.copy(grip);
      this.weapon.quaternion.setFromUnitVectors(UP, dir);
    }
    const mw = this._moW;
    if (mw > 0 && this._moArm) {
      // モーションキャプチャの手の位置へ（刀も右手に合わせる）
      const A = this._moArm;
      if (this.weaponType !== 'none' && !hideWeapon) {
        const g = _h.copy(grip).lerp(A.grip, mw), d = _i.copy(dir).lerp(A.dir, mw).normalize();
        this.weapon.position.copy(g);
        this.weapon.quaternion.setFromUnitVectors(UP, d);
      }
      const pR = (this.weaponType === 'katana' && !hideWeapon) ? V().copy(grip).addScaledVector(dir, 0.06) : V(-0.25, 0, 0.1);
      const pL = (this.weaponType === 'katana' && !hideWeapon) ? V().copy(grip).addScaledVector(dir, -0.085) : V(0.25, 0, 0.1);
      this.ik(this.armR, pR.lerp(A.R, mw), A.poleR);
      this.ik(this.armL, pL.lerp(A.L, mw), A.poleL);
    } else if (deadHands) {
      this.ik(this.armR, deadHands[0], POLE_R);
      this.ik(this.armL, deadHands[1], POLE_L);
    } else if (cower) {
      this.ik(this.armR, V(-0.08, 0.8, 0.26), POLE_R);
      this.ik(this.armL, V(0.08, 0.82, 0.26), POLE_L);
    } else if (this.weaponType === 'none' || hideWeapon) {
      this.ik(this.armR, V(-0.25, 0.0, 0.1), POLE_R);
      this.ik(this.armL, V(0.25, 0.0, 0.1), POLE_L);
    } else if (this.weaponType === 'spear') {
      this.ik(this.armR, V().copy(grip).addScaledVector(dir, -0.1), POLE_R);
      this.ik(this.armL, V().copy(grip).addScaledVector(dir, 0.35), POLE_L);
    } else {
      // 右手は鍔元、左手は柄頭
      this.ik(this.armR, V().copy(grip).addScaledVector(dir, 0.06), POLE_R);
      this.ik(this.armL, V().copy(grip).addScaledVector(dir, -0.085), POLE_L);
    }
    if (this.lantern) this.lantern.position.set(0.32, 0.05, 0.25);
  }

  // モーションキャプチャの姿勢を、この人物の骨格に移し替える（w：重み）
  applyMocap(w) {
    const S = sample(this.mo.clip, this.mocapClipTime(), this.mo.mirror, this.mo.travel, this._S || (this._S = {}));
    // 脚と腰
    this.footL.lerp(_h.copy(S.LeftFoot).setY(Math.max(ANKLE_Y * 0.6, S.LeftFoot.y)), w);
    this.footR.lerp(_h.copy(S.RightFoot).setY(Math.max(ANKLE_Y * 0.6, S.RightFoot.y)), w);
    this._hipY += (S.Hips.y - this._hipY) * w;
    this.hips.position.x = S.Hips.x * w; this.hips.position.z = S.Hips.z * w;
    const lx = S.LeftUpLeg.x - S.RightUpLeg.x, lz = S.LeftUpLeg.z - S.RightUpLeg.z;
    let yaw = Math.atan2(-lz, lx), cy = this.hips.rotation.y, dy = yaw - cy;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.hips.rotation.y = cy + dy * w;
    // 胴と頭の向き
    const left = _i.subVectors(S.LeftArm, S.RightArm);
    basisQuat(_j.subVectors(S.Spine2, S.Hips), left, _qa);           // 胴（人物の座標）
    _qb.setFromEuler(this.hips.rotation).invert().multiply(_qa);       // 腰から見た胴
    this.torso.quaternion.slerp(_qb, w);
    basisQuat(_j.subVectors(S.HeadTop_End, S.Neck), left, _qc);
    _qd.copy(_qa).invert().multiply(_qc);
    this.head.quaternion.slerp(_qd, w);
    // 腕：肩からの手・肘の向きを胴の座標で（実際の胴の向きで逆変換）
    _qe.setFromEuler(this.hips.rotation).multiply(this.torso.quaternion).invert();
    const A = this._moArm || (this._moArm = { R: V(), L: V(), poleR: V(), poleL: V(), grip: V(), dir: V(0, 1, 0) });
    for (const [side, sh, key, pkey] of [['Right', SH_R, 'R', 'poleR'], ['Left', SH_L, 'L', 'poleL']]) {
      const hand = _j.subVectors(S[side + 'Hand'], S[side + 'Arm']).applyQuaternion(_qe);
      A[key].copy(sh).addScaledVector(hand, 1.03);
      A[pkey].subVectors(S[side + 'ForeArm'], S[side + 'Arm']).applyQuaternion(_qe).addScaledVector(hand, -0.5);
    }
    // 刀：両手で握っていれば右手と左手を結ぶ向き、片手なら前腕の延長に少し上向き
    const d = _h.subVectors(A.R, A.L);
    if (d.length() < 0.26) A.dir.copy(d).normalize();
    else A.dir.copy(S.blade).applyQuaternion(_qe).normalize();   // 片手：右手の向きから
    if (this.mo.clip.name === 'idle') {
      // 大剣の構えを日本刀の中段に：剣先を正面（相手の喉元）へ向け、少し上げる
      A.dir.x *= 0.2; A.dir.y += 0.15; A.dir.z = Math.abs(A.dir.z) + 0.3; A.dir.normalize();
      this.head.quaternion.slerp(_qa.identity(), 0.55);   // うつむきすぎないよう視線を相手へ
    }
    A.grip.copy(A.R).addScaledVector(A.dir, -0.06);
  }

  // 腰の高さを足が届く範囲に収め、両脚を2関節IKで解く
  solveLegs() {
    const reach = THIGH + SHIN - 0.01;
    let hipY = this._hipY;
    for (const [f, x] of [[this.footL, 0.1], [this.footR, -0.1]]) {
      const dx = f.x - x - this.hips.position.x, dz = f.z - this.hips.position.z;
      hipY = Math.min(hipY, f.y + Math.sqrt(Math.max(0.01, reach * reach - dx * dx - dz * dz)));
    }
    this.hips.position.y = hipY;
    const yaw = this.hips.rotation.y;
    for (const [leg, f] of [[this.legL, this.footL], [this.legR, this.footR]]) {
      const t = _g.set(f.x - this.hips.position.x, f.y - hipY, f.z - this.hips.position.z).applyAxisAngle(UP, -yaw);
      this.ik(leg, t, POLE_KNEE, THIGH, SHIN);
      // 足の裏は地面と平行に
      const { upper, elbow, foot } = leg.userData;
      foot.quaternion.copy(upper.quaternion).multiply(elbow.quaternion).invert();
    }
  }

  // 2関節IK（肩→肘→手）。pole は肘を向ける方向
  ik(arm, target, pole, LA = UPPER, LB = LOWER) {
    const { upper, elbow } = arm.userData;
    const S = arm.position;
    const toT = _a.copy(target).sub(S);
    let d = toT.length();
    d = THREE.MathUtils.clamp(d, 0.08, LA + LB - 0.002);
    toT.normalize();
    const cosA = (LA * LA + d * d - LB * LB) / (2 * LA * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const perp = _b.copy(pole).addScaledVector(toT, -pole.dot(toT));
    if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
    perp.normalize();
    const E = _c.copy(toT).multiplyScalar(cosA * LA).addScaledVector(perp, sinA * LA); // 肩からの肘位置
    const T = _d.copy(toT).multiplyScalar(d);
    const upDir = _e.copy(E).normalize();
    const loDir = _f.copy(T).sub(E).normalize();
    upper.quaternion.setFromUnitVectors(DOWN, upDir);
    _q.setFromUnitVectors(DOWN, loDir);
    elbow.quaternion.copy(upper.quaternion).invert().multiply(_q);
  }

  // 刀の切っ先のワールド座標
  tipWorld(out) {
    if (!this.blade) return out.copy(this.root.position);
    const tip = this.weaponType === 'spear' ? 2.0 : 0.88;
    return out.set(0, tip, 0).applyMatrix4(this.weapon.matrixWorld);
  }
  baseWorld(out) {
    return out.set(0, 0.16, 0).applyMatrix4(this.weapon.matrixWorld);
  }
  chestWorld(out) {
    return out.set(0, 0.35, 0).applyMatrix4(this.torso.matrixWorld);
  }
  setGlint(v) {
    this.bladeMat.emissive.setRGB(0.1 + v * 1.4, 0.12 + v * 0.05, 0.18 + v * 0.02);
    this.bladeMat.emissiveIntensity = 0.6 + v * 1.4;
  }
}
