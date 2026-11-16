// モーションキャプチャ（Mixamo）の関節位置データを、ゲームの人物の骨格へ移し替える
// assets/mocap/*.json は FBX から関節のワールド座標（cm, 30fps）だけを書き出したもの
import * as THREE from 'three';

export const CLIPS = {};
const K = 0.0099; // cm → 人物の座標（Mixamoの脚の長さ 88.9cm ≒ 人物の 0.88）

const NAMES = ['Hips', 'Spine', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandMiddle1',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle1', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const MIRROR = NAMES.map((n) => NAMES.indexOf(n.startsWith('Left') ? n.replace('Left', 'Right') : n.startsWith('Right') ? n.replace('Right', 'Left') : n));

// 斬撃の「当たる瞬間」（右手が体の中心を横切るフレーム）
const CONTACT = { slash_great: 13, slash_sweep: 18, slash_spin: 26 };

export async function loadMocap(names, base = 'assets/mocap/') {
  await Promise.all(names.map(async (name) => {
    const res = await fetch(base + name + '.json');
    if (!res.ok) throw new Error('mocap ' + name);
    const d = await res.json();
    const idx = d.joints.map((j) => NAMES.indexOf(j));
    const F = d.frames, J = NAMES.length;
    const pos = new Float32Array(F * J * 3);
    const h0 = d.data[0];
    const hj = d.joints.indexOf('Hips') * 3;
    for (let f = 0; f < F; f++) {
      const row = d.data[f];
      for (let j = 0; j < d.joints.length; j++) {
        const o = (f * J + idx[j]) * 3;
        pos[o] = (row[j * 3] - h0[hj]) * K;
        pos[o + 1] = row[j * 3 + 1] * K;
        pos[o + 2] = (row[j * 3 + 2] - h0[hj + 2]) * K;
      }
    }
    CLIPS[name] = { name, fps: d.fps, frames: F, duration: (F - 1) / d.fps, pos, contact: (CONTACT[name] ?? 0) / d.fps };
  }));
}

// 時刻 t の姿勢（人物の座標系、+X=左, +Z=前）。mirror で左右反転、travel で前進量の倍率
export function sample(clip, t, mirror, travel, out) {
  const J = NAMES.length;
  const ft = THREE.MathUtils.clamp(t * clip.fps, 0, clip.frames - 1);
  const f0 = Math.floor(ft), f1 = Math.min(clip.frames - 1, f0 + 1), a = ft - f0;
  const P = clip.pos;
  for (let j = 0; j < J; j++) {
    const src = mirror ? MIRROR[j] : j;
    const o0 = (f0 * J + src) * 3, o1 = (f1 * J + src) * 3;
    let x = P[o0] + (P[o1] - P[o0]) * a;
    const y = P[o0 + 1] + (P[o1 + 1] - P[o0 + 1]) * a;
    let z = P[o0 + 2] + (P[o1 + 2] - P[o0 + 2]) * a;
    if (mirror) x = -x;
    (out[NAMES[j]] ||= new THREE.Vector3()).set(x, y, z);
  }
  if (travel !== 1) {
    // 前進・横移動を縮める（その場で演じる）
    const hx = out.Hips.x * (1 - travel), hz = out.Hips.z * (1 - travel);
    for (const n of NAMES) { out[n].x -= hx; out[n].z -= hz; }
  }
  return out;
}

// 胴・頭の向き（基底）を作る
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
export function basisQuat(up, left, out) {
  _y.copy(up).normalize();
  _x.copy(left).normalize();
  _z.crossVectors(_x, _y).normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
