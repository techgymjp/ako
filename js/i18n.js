// 日本語／英語の切り替え
// 画面の文言は日本語を原文とし、英語のときだけ対応表で置き換える

const EN = {
  // 場所
  '表門': 'Front Gate', '前庭': 'Front Courtyard', '取次の間': 'Reception Room', '槍の間': 'Spear Room',
  '広間': 'Great Hall', '通り道の間': 'Passage Room', '左兵衛居間': "Sahyōe's Quarters", '奥の間': 'Inner Chamber',
  '上野介寝所': "Kira's Bedchamber", '中の間': 'Middle Room', '土間': 'Earthen Floor', '炭部屋': 'Charcoal Shed',
  '隠居屋敷': 'Retirement Quarters', '入口': 'Entrance', '茶室': 'Tea Room', '長廊下': 'Long Corridor', '台所': 'Kitchen',
  '台所土間': 'Kitchen Floor', '料理間': 'Cooking Room', '家臣詰所': 'Guard Room', '廊下': 'Corridor', '物置': 'Storeroom',
  '納戸': 'Storage Room', '次の間': 'Anteroom', '玄関': 'Entrance Hall', '用人部屋': "Stewards' Room", '書院': 'Study',
  // 人物
  '大石内蔵助': 'Ōishi Kuranosuke', '吉良上野介': 'Kira Kōzuke-no-suke', '小林平八郎': 'Kobayashi Heihachirō',
  '山吉新八郎': 'Yamayoshi Shinpachirō', '清水一学': 'Shimizu Ichigaku', '吉良家家臣': 'a Kira retainer',
  // 場面
  '吉良家の家臣が長屋から飛び出してきた！': "Kira's retainers burst out of the barracks!",
  '槍を構えた家臣が待ち受ける！': 'Spearmen lie in wait!',
  '吉良左兵衛の居間。家臣が立ち塞がる！': 'The quarters of Kira Sahyōe. Retainers block the way!',
  '吉良家家老・小林平八郎が立ちはだかる！': "Kira's chief retainer, Kobayashi Heihachirō, bars the way!",
  '山吉新八郎、見参！': 'Yamayoshi Shinpachirō appears!',
  '剣の達人・清水一学が斬りかかる！': 'Master swordsman Shimizu Ichigaku attacks!',
  '元禄十五年十二月十四日': 'Genroku 15, 12th month, 14th day',
  '寅の上刻　本所松坂町・吉良邸': "Before dawn — Kira's mansion, Honjo Matsuzaka, Edo",
  'かかれっ！': 'Charge!',
  '大石内蔵助、表門より討ち入る': 'Ōishi Kuranosuke storms the front gate',
  '夜具に手を差し入れる……': 'A hand slips beneath the bedding...',
  'まだ温かい！ 遠くへは逃げておらぬ、探せ！': "Still warm! He can't have gone far — search!",
  '炭俵の陰に人の気配……': 'Someone stirs behind the charcoal bales...',
  '曲者が潜んでおるぞ！': 'Enemies are hiding here!',
  '曲者！': 'Intruders!',
  '吉良家の家臣が斬りかかる！': "Kira's retainers attack!",
  '白綾の小袖の老人……': 'An old man in white silk robes...',
  '眉間の古傷――吉良上野介に相違なし！': 'The old scar on his brow — it is Kira Kōzuke-no-suke!',
  '吉良上野介、覚悟！': 'Kira Kōzuke-no-suke, prepare yourself!',
  '亡き殿の無念、今こそ晴らす――': 'Now our late lord shall be avenged—',
  '吉良をフリックで斬れ！': 'Flick to strike down Kira!',
  '本懐成就': 'Vengeance Fulfilled',
  '元禄十五年十二月十五日　未明': 'Before dawn, Genroku 15, 12th month, 15th day',
  '無念……': 'Defeated...',
  '無念': 'Defeated',
  '敵をなぞるようにフリックして斬れ！\n点線「受」と同じ向きは弾かれる／刀が赤く光ったら先に斬れ':
    "Flick across an enemy's body to cut!\nCuts along the dotted GUARD line are parried / strike first when a blade glows red",
  // 斬撃
  '弾かれた！': 'Parried!', '二人斬り！': 'Double Cut!', '三人斬り！': 'Triple Cut!', '四人斬り！': 'Quad Cut!', '五人斬り！': 'Five-Man Cut!',
  '剛斬！': 'Mighty Cut!', '浅い！': 'Too shallow!',
  '横一文字': 'Horizontal Cut', '斬り上げ': 'Rising Cut', '唐竹割り': 'Downward Cleave', '逆袈裟': 'Rising Diagonal', '袈裟斬り': 'Diagonal Cut',
  '受': 'GUARD', '制圧！': 'Cleared!',
  '返し技！': 'Counter!', '返し技': 'Counter', '返せ！': 'Counter now!', '払え！': 'Sweep it!', '助太刀！': 'Help him!', '助太刀': 'Rescue',
  '連斬': 'Multi-cut', '早業': 'Swift clear', 'やり直し': 'Retry', 'フェイント！': 'Feint!', '構え替え': 'Guard shift',
  '夜が明けた……': 'Dawn has broken...', '吉良を討ち漏らした': 'Kira escaped your blade',
  '東の空が白み始めた': 'The eastern sky grows pale', '夜明けまで、あと一刻もない！': 'Dawn is almost upon us!',
  '<p>夜が明けてしまった。吉良上野介を討ち漏らした……。</p>': '<p>Dawn has broken. Kira Kōzuke-no-suke escaped your blade...</p>',
  '吉田忠左衛門': 'Yoshida Chūzaemon', '堀部安兵衛': 'Horibe Yasubei', '原惣右衛門': 'Hara Sōemon', '間十次郎': 'Hazama Jūjirō', '武林唯七': 'Takebayashi Tadashichi',
  // 結果
  '<p>赤穂浪士四十七士は吉良上野介を討ち取り、主君・浅野内匠頭の無念を晴らした。</p><p>一行は雪の江戸の町を、亡君の眠る<b>泉岳寺</b>へと引き揚げていった。</p>':
    '<p>The forty-seven rōnin of Akō struck down Kira Kōzuke-no-suke and avenged their lord, Asano Takumi-no-kami.</p><p>Through the snowy streets of Edo they marched to <b>Sengaku-ji</b>, where their lord lies at rest.</p>',
  '<p>大石内蔵助は敵の刃に倒れた……。</p><p>刀が赤く光った敵を先に斬れ。構えた刀と同じ向きに斬ると弾かれるぞ。</p>':
    '<p>Ōishi Kuranosuke has fallen to an enemy blade...</p><p>Strike first when an enemy blade glows red. Cuts in the same direction as an enemy\'s guard are parried.</p>',
  '天晴れ　義士の鑑': 'Splendid — a true loyal retainer', '見事なり': 'Well done', '本懐を遂げたり': 'Vengeance achieved',
};

// 画面のHTML（要素id → 英語）
const HTML_EN = {
  titleSub: 'Genroku 15 (1703) — a snowy night in Edo',
  titleH1: '<span>Chūshingura</span>The Revenge of the 47 Rōnin',
  titleLead: 'Become Ōishi Kuranosuke and storm Kira\'s mansion.<br>Your only target: Kira Kōzuke-no-suke.',
  startBtn: 'Attack', howtoBtn: 'How to Play',
  howtoH2: 'How to Play',
  howtoStory: "Avenge your lord. Cut down Kira Kōzuke-no-suke.",
  howtoList: '<div class="step"><i>進</i><div><b>You advance automatically</b><p>Cut down Kira deep inside before dawn (7 minutes).</p></div></div>' +
    '<div class="step"><i>斬</i><div><b>Swipe to cut</b><p>Swipe across an enemy. Ōishi swings in that direction.</p></div></div>' +
    '<div class="step"><i>受</i><div><b>Avoid the dotted line</b><p>Cutting along the dotted GUARD line gets parried.</p></div></div>' +
    '<div class="step"><i>危</i><div><b>Red glow = hurry</b><p>One hit and you are dead. Cut glowing enemies first.</p></div></div>' +
    '<div class="step"><i>返</i><div><b>Gold arrow = counter</b><p>When the arrow turns gold, swipe that way for a counterattack.</p></div></div>' +
    '<div class="step"><i>援</i><div><b>Protect your comrades</b><p>Cut enemies marked “Help him!”. Keep everyone alive for a big bonus.</p></div></div>',
  howtoNote: 'On a computer you can also cut with the arrow keys',
  howtoBack: 'Back', retryHere: 'Retry here', retryBtn: 'From the start', pauseH2: 'Paused', resumeBtn: 'Resume',
};

function detect() {
  try { const s = localStorage.getItem('ako-lang'); if (s === 'ja' || s === 'en') return s; } catch (e) { /* 保存不可 */ }
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'ja') return q;
  return /^ja/i.test(navigator.language || 'ja') ? 'ja' : 'en';
}

export let lang = detect();
export const T = (s) => (lang === 'en' && s in EN ? EN[s] : s);

const original = {};
export function applyStatic() {
  document.documentElement.lang = lang;
  document.title = lang === 'en' ? 'Chūshingura — The Revenge of the 47 Rōnin' : '忠臣蔵 赤穂浪士の討ち入り';
  document.body.classList.toggle('en', lang === 'en');
  for (const id of Object.keys(HTML_EN)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (!(id in original)) original[id] = el.innerHTML;
    el.innerHTML = lang === 'en' ? HTML_EN[id] : original[id];
  }
  const b = document.getElementById('langBtn');
  if (b) b.textContent = lang === 'en' ? '日本語' : 'English';
}
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('ako-lang', l); } catch (e) { /* 保存不可 */ }
  applyStatic();
}
