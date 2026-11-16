// 人物モデル（プリミティブを組み合わせた手続き生成の人体＋ポーズ計算）
import * as THREE from 'three';
import * as TX from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

// ---------- 共有ジオメトリ ----------
const G = {};
function geos() {
  if (G.ready) return G;
  G.leg = new THREE.CylinderGeometry(0.1, 0.2, 0.86, 14, 1).translate(0, -0.43, 0);
  G.foot = new THREE.BoxGeometry(0.1, 0.06, 0.25).translate(0, -0.9, 0.04);
  G.chest = new THREE.CylinderGeometry(0.205, 0.2, 0.82, 18, 1).translate(0, 0.2, 0);
  G.obi = new THREE.CylinderGeometry(0.2, 0.2, 0.09, 18).translate(0, 0.02, 0);
  G.sleeve = new THREE.CylinderGeometry(0.065, 0.13, 0.54, 12, 1, true).translate(0, -0.27, 0);
  G.forearm = new THREE.CylinderGeometry(0.035, 0.04, 0.2, 8).translate(0, -0.5, 0);
  G.hand = new THREE.SphereGeometry(0.047, 10, 8).translate(0, -0.61, 0);
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
const ARM_LEN = 0.6;

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
    this.legL = new THREE.Group(); this.legL.position.set(0.1, 0, 0); this.hips.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(-0.1, 0, 0); this.hips.add(this.legR);
    for (const leg of [this.legL, this.legR]) { mesh(G.leg, hak, leg); mesh(G.foot, dark, leg); }

    // 胴
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    const chest = mesh(G.chest, coat, this.torso); chest.scale.z = 0.74;
    const obi = mesh(G.obi, mat('obi' + type, () => std({ color: type === 'kira' ? '#8a7a5a' : type.startsWith('ronin') || type === 'oishi' ? '#e9e5da' : '#2d2a35', roughness: 0.8 })), this.torso);
    obi.scale.z = 0.76;
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

    // 腕（袖＋手）
    this.armL = new THREE.Group(); this.armL.position.copy(SH_L); this.torso.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.copy(SH_R); this.torso.add(this.armR);
    for (const arm of [this.armL, this.armR]) {
      mesh(G.sleeve, sleeveMat, arm);
      mesh(G.forearm, skin, arm);
      mesh(G.hand, skin, arm);
    }

    // 武器
    this.weaponType = opts.weapon || (type === 'kira' ? 'none' : 'katana');
    this.weapon = new THREE.Group(); this.torso.add(this.weapon);
    this.bladeMat = bladeMat();
    if (this.weaponType === 'katana') {
      mesh(G.tsuka, mat('tsuka', () => std({ map: TX.tsukaTex(), roughness: 0.8 })), this.weapon);
      mesh(G.tsuba, mat('tsuba', () => std({ color: '#3a3226', metalness: 0.7, roughness: 0.5 })), this.weapon).position.y = 0.135;
      this.blade = mesh(G.blade, this.bladeMat, this.weapon);
      this.reach = 0.88;
    } else if (this.weaponType === 'spear') {
      mesh(G.shaft, mat('shaft', () => std({ color: '#3b2717', roughness: 0.7 })), this.weapon);
      this.blade = mesh(G.spearTip, this.bladeMat, this.weapon);
      this.reach = 1.9;
    } else {
      this.weapon.visible = false;
    }
    if (type !== 'kira') {
      const saya = mesh(G.saya, mat('saya', () => std({ color: '#0d0c0c', roughness: 0.35, metalness: 0.2 })), this.torso);
      saya.position.set(0.21, 0.08, 0.1); saya.rotation.set(1.85, 0, 0.25);
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
    this.height = 1.75 * s;

    // アニメーション状態
    this.walk = 0; this.phase = Math.random() * 6;
    this.mode = 'ready'; this.modeT = 0; this.modeDur = 0;
    this.slashL = V(1, 0, 0);
    this.guardAngle = 0;
    this.hitT = 0; this.flash = 0; this.deadT = 0; this.deadDir = 1;
    this.lunge = 0;
    this._grip = V(); this._dir = V();
    this.facingYaw = 0;
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

  // slash: L = 胴体ローカルの斬撃方向ベクトル（x:左+,y:上+）
  startSlash(lx, ly, dur = 0.26) {
    this.slashL.set(lx, ly, 0).normalize();
    this.mode = 'slash'; this.modeT = 0; this.modeDur = dur;
  }
  setMode(m, dur = 0) { if (this.mode !== m) { this.mode = m; this.modeT = 0; } this.modeDur = dur; }

  hit() { this.hitT = 0.3; this.flash = 0.25; }
  die(dir = 1) { this.mode = 'dead'; this.modeT = 0; this.deadDir = dir; }

  update(dt) {
    this.modeT += dt;
    this.phase += dt * (4 + this.walk * 7);
    this.hitT = Math.max(0, this.hitT - dt);
    this.flash = Math.max(0, this.flash - dt);

    const w = this.walk;
    const sw = Math.sin(this.phase) * 0.55 * w;
    this.legL.rotation.set(sw, 0, 0); this.legR.rotation.set(-sw, 0, 0);
    this.hips.position.y = 0.95 - Math.abs(Math.cos(this.phase)) * 0.03 * w;
    this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0);
    this.torso.rotation.set(0.06 * w, 0, 0);
    this.head.rotation.set(0, 0, 0);

    const grip = this._grip, dir = this._dir;
    let handOff = 0.13, hideWeapon = false, cower = false;
    const C = tmpV2.set(0, 0.42, 0);

    switch (this.mode) {
      case 'sheathed': {
        grip.set(-0.2, -0.05, 0.12); dir.set(-0.1, -0.2, 1).normalize(); hideWeapon = this.type !== 'kira';
        break;
      }
      case 'ready': default: {
        // 中段の構え（呼吸で少し揺れる）
        const b = Math.sin(this.phase * 0.5) * 0.015;
        grip.set(-0.02, 0.27 + b, 0.33); dir.set(0, 0.8, 1).normalize();
        if (this.weaponType === 'spear') { grip.set(-0.08, 0.2, 0.2); dir.set(0, 0.12, 1).normalize(); }
        break;
      }
      case 'guard': {
        // 受けの構え：刀身を guardAngle の向きに（敵ローカル：+X=画面右）
        const a = this.guardAngle;
        const lx = Math.cos(a), ly = Math.sin(a);
        dir.set(lx, ly, 0.22).normalize();
        grip.set(C.x - lx * 0.3, C.y + 0.02 - ly * 0.3, 0.42);
        this.torso.rotation.x = 0.1;
        break;
      }
      case 'windup': {
        // 振りかぶり（上段）。刀が赤く光る
        const k = Math.min(1, this.modeT / 0.25);
        grip.set(-0.02, 0.27 + 0.68 * k, 0.33 - 0.25 * k);
        dir.set(0, 0.8 - 0.1 * k, 1 - 1.75 * k).normalize();
        if (this.weaponType === 'spear') { grip.set(-0.08, 0.25, 0.2 - 0.25 * k); dir.set(0, 0.1, 1).normalize(); }
        this.torso.rotation.x = -0.12 * k;
        break;
      }
      case 'slash': {
        const t = Math.min(1, this.modeT / this.modeDur);
        // 溜め→振り抜き→残心
        let s;
        if (t < 0.15) s = -1;
        else if (t < 0.6) { const u = (t - 0.15) / 0.45; s = -1 + 2 * (1 - Math.pow(1 - u, 3)); }
        else s = 1;
        const L = this.slashL;
        const reach = 0.95;
        const tip = tmpV.set(L.x * reach * s, 0.45 + L.y * reach * s, 0.5 + 0.48 * (1 - s * s));
        const base = V(0, 0.5, -0.12);
        dir.copy(tip).sub(base).normalize();
        grip.copy(tip).addScaledVector(dir, -0.88);
        if (this.weaponType === 'spear') { grip.set(-0.05, 0.25, 0.2 + 0.5 * Math.sin(Math.min(1, t * 2) * Math.PI)); dir.set(0, 0.05, 1).normalize(); }
        this.torso.rotation.y = L.x * s * 0.55;
        this.torso.rotation.x = 0.12 - L.y * s * 0.22;
        // 踏み込み
        const st = Math.sin(Math.min(1, t * 1.6) * Math.PI);
        this.legL.rotation.x = -0.55 * st; this.legR.rotation.x = 0.45 * st;
        this.hips.position.y -= 0.06 * st;
        if (t >= 1) { this.mode = 'ready'; this.modeT = 0; }
        break;
      }
      case 'cower': {
        cower = true;
        const k = Math.min(1, this.modeT / 0.6);
        this.hips.position.y = 0.95 - 0.5 * k;
        this.legL.rotation.x = -1.5 * k; this.legR.rotation.x = -1.5 * k;
        this.torso.rotation.x = 0.35 * k + Math.sin(this.phase * 3) * 0.02;
        this.head.rotation.x = 0.3 * k;
        grip.set(0, 0.75, 0.25); dir.set(0, 1, 0.3).normalize();
        hideWeapon = true;
        break;
      }
      case 'dead': {
        const k = Math.min(1, this.modeT / 0.7);
        const e = 1 - Math.pow(1 - k, 2);
        this.body.rotation.x = -this.deadDir * 1.45 * e;
        this.body.position.y = 0.12 * e;
        this.legL.rotation.x = 0.3 * e; this.legR.rotation.x = -0.2 * e;
        grip.set(-0.35, 0.1, 0.2); dir.set(-0.6, -0.2, 0.8).normalize();
        break;
      }
    }

    // 被弾時ののけぞり
    if (this.hitT > 0 && this.mode !== 'dead') {
      const k = this.hitT / 0.3;
      this.torso.rotation.x -= 0.4 * k;
      this.body.position.z = -0.15 * k;
    }

    // 武器の配置
    if (this.weaponType !== 'none') {
      this.weapon.visible = !hideWeapon;
      this.weapon.position.copy(grip);
      tmpQ.setFromUnitVectors(UP, dir);
      this.weapon.quaternion.copy(tmpQ);
    }

    // 腕を握り位置へ向ける
    const handR = tmpV.copy(grip);
    if (cower) {
      this.aimArm(this.armR, V(-0.1, 0.78, 0.28));
      this.aimArm(this.armL, V(0.1, 0.8, 0.28));
    } else if (this.weaponType === 'none' || hideWeapon) {
      this.aimArm(this.armR, V(-0.26, -0.05, 0.08));
      this.aimArm(this.armL, V(0.26, -0.05, 0.08));
    } else {
      this.aimArm(this.armR, handR);
      const handL = V().copy(grip).addScaledVector(dir, -handOff);
      this.aimArm(this.armL, handL);
    }
    if (this.lantern) {
      this.lantern.position.set(0.32, 0.05, 0.25);
    }

  }

  aimArm(arm, target) {
    const d = V().copy(target).sub(arm.position);
    const len = d.length();
    d.normalize();
    arm.quaternion.setFromUnitVectors(DOWN, d);
    arm.scale.y = THREE.MathUtils.clamp(len / ARM_LEN, 0.55, 1.15);
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
