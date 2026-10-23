const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('index.html が見つかりません。');
  }
});

/* =====================================================================
   データ定義
   ===================================================================== */
const FREE_CHARS = ['futsuo', 'debugon', 'chibikoro', 'ninja', 'wizard'];
const FREE_EMOTES = ['thumbsup', 'thumbsdown', 'heart', 'anger'];
const START_SEG = 300;

const CHARACTERS = {
  // ---------- 初期キャラ (無料) ----------
  futsuo: {
    name: 'フツオ', role: 'ファイター', hp: 100, atk: 12, speed: 7.0, jumpPower: 17, width: 50, height: 90,
    type: 'futsuo', special: 'powerup', ability: 'パワーアップ覚醒(5秒)', cd: 12, price: 0,
    look: { skin: '#f5cba7', hair: '#2c3e50', hairStyle: 'spiky', top: '#2980b9', top2: '#1a5276', pants: '#1c2833', accent: '#f1c40f', build: 0.62, extra: 'headband' }
  },
  debugon: {
    name: 'デブゴン', role: 'ヘビー', hp: 140, atk: 16, speed: 5.0, jumpPower: 14.5, width: 75, height: 95,
    type: 'debugon', special: 'armor', ability: '不屈のアーマー(着地衝撃波)', cd: 12, price: 0,
    look: { skin: '#f5cba7', hair: '#5d4037', hairStyle: 'bald', top: '#d35400', top2: '#7e5109', pants: '#2c3e50', accent: '#f1c40f', build: 0.95, extra: 'beard' }
  },
  chibikoro: {
    name: 'チビコロ', role: 'ダイバー', hp: 110, atk: 13, speed: 6.0, jumpPower: 14, width: 65, height: 60,
    type: 'chibikoro', special: 'bomb', ability: '大爆発ボム', cd: 12, price: 0,
    look: { skin: '#f5cba7', hair: '#3b2f2f', hairStyle: 'helmet', top: '#c0392b', top2: '#641e16', pants: '#111111', accent: '#e74c3c', build: 0.8, extra: 'diver' }
  },
  ninja: {
    name: 'ニンジャ', role: 'シノビ', hp: 85, atk: 11, speed: 7.0, jumpPower: 17, width: 40, height: 90,
    type: 'ninja', special: 'shuriken3', ability: '手裏剣3連投', cd: 36, price: 0,
    ranged: { type: 'ninja', speed: 16, w: 26, h: 22 },
    look: { skin: '#f5cba7', hair: '#111111', hairStyle: 'hood', top: '#1f2937', top2: '#030712', pants: '#111827', accent: '#e74c3c', build: 0.58, extra: 'scarf' }
  },
  wizard: {
    name: 'ウィザード', role: 'メイジ', hp: 85, atk: 13, speed: 7.0, jumpPower: 18, width: 45, height: 95,
    type: 'wizard', special: 'magic3', ability: '魔法弾3連投(確率硬直)', cd: 36, price: 0,
    ranged: { type: 'wizard', speed: 12, w: 26, h: 22 },
    look: { skin: '#f5cba7', hair: '#e5e7eb', hairStyle: 'hat', top: '#312e81', top2: '#1e1b4b', pants: '#111111', accent: '#fbbf24', build: 0.64, robe: true, extra: 'staff' }
  },
  // ---------- 追加キャラ (SEG購入) ----------
  samurai: {
    name: 'ムサシ', role: 'サムライ', hp: 115, atk: 15, speed: 6.5, jumpPower: 16, width: 48, height: 92,
    type: 'samurai', special: 'iai', ability: '居合・瞬閃斬り(高速突進斬)', cd: 12, reachMul: 1.45, price: 2000,
    look: { skin: '#f1c9a5', hair: '#111827', hairStyle: 'topknot', top: '#b91c1c', top2: '#450a0a', pants: '#1f2937', accent: '#fbbf24', build: 0.64, extra: 'katana' }
  },
  dragon: {
    name: 'リュウガ', role: 'ドラゴンナイト', hp: 150, atk: 15, speed: 5.5, jumpPower: 15, width: 70, height: 98,
    type: 'dragon', special: 'flame', ability: 'ドラゴンブレス(貫通火炎)', cd: 14, reachMul: 1.1, price: 2500,
    look: { skin: '#e7c9a9', hair: '#064e3b', hairStyle: 'dhelm', top: '#047857', top2: '#064e3b', pants: '#1f2937', accent: '#fbbf24', build: 0.86, extra: 'dragon' }
  },
  robo: {
    name: 'ガンマ', role: 'サイバーロボ', hp: 110, atk: 12, speed: 6.5, jumpPower: 16, width: 55, height: 92,
    type: 'robo', special: 'laser', ability: 'メガレーザー(超長射程ビーム)', cd: 14, price: 3000,
    ranged: { type: 'laser', speed: 20, w: 36, h: 10 },
    look: { skin: '#94a3b8', hair: '#64748b', hairStyle: 'visor', top: '#64748b', top2: '#334155', pants: '#1e293b', accent: '#22d3ee', build: 0.78, extra: 'robot' }
  },
  vampy: {
    name: 'カーミラ', role: 'ヴァンパイア', hp: 100, atk: 13, speed: 7.5, jumpPower: 18, width: 42, height: 92,
    type: 'vampy', special: 'drain', ability: 'ブラッドドレイン(吸血爆発)', cd: 12, vamp: 0.25, price: 3500,
    look: { skin: '#e5e7eb', hair: '#f3f4f6', hairStyle: 'long', top: '#7f1d1d', top2: '#1f0a12', pants: '#111827', accent: '#dc2626', build: 0.56, extra: 'cape' }
  },
  thunder: {
    name: 'ライジン', role: 'サンダーロード', hp: 150, atk: 25, speed: 7.0, jumpPower: 19, width: 55, height: 95,
    type: 'thunder', special: 'lightning', ability: '天雷召喚(敵の頭上に落雷)', cd: 12, price: 4500,
    look: { skin: '#fcd9b6', hair: '#fde047', hairStyle: 'spiky', top: '#eab308', top2: '#a16207', pants: '#1e3a8a', accent: '#38bdf8', build: 0.72, extra: 'drums' }
  }
};

// ストーリーモード用の敵 (プレイヤーは選べない)
const ENEMIES = {
  slime:    { name: 'スライム', hp: 45, atk: 7, speed: 3.2, jumpPower: 13, width: 60, height: 50, type: 'enemy', minion: true, cd: 22,
              ai: { move: 0.6, atk: 0.022, jump: 0.012, block: 0 }, look: { kind: 'slime', c1: '#4ade80', c2: '#15803d' } },
  goblin:   { name: 'ゴブリン', hp: 60, atk: 9, speed: 4.6, jumpPower: 15, width: 48, height: 72, type: 'enemy', minion: true, cd: 18,
              ai: { move: 0.7, atk: 0.03, jump: 0.012, block: 0.003 }, look: { skin: '#86b95a', hair: '#3f6212', hairStyle: 'none', top: '#92400e', top2: '#451a03', pants: '#78350f', accent: '#fbbf24', build: 0.6, extra: 'goblin' } },
  skeleton: { name: 'ガイコツ兵', hp: 72, atk: 10, speed: 4.4, jumpPower: 15, width: 44, height: 90, type: 'enemy', minion: true, cd: 50,
              ranged: { type: 'bone', speed: 11, w: 26, h: 26 }, ai: { move: 0.7, atk: 0.026, jump: 0.01, block: 0.005 },
              look: { skin: '#e5e7eb', hair: '#e5e7eb', hairStyle: 'skull', top: '#d1d5db', top2: '#9ca3af', pants: '#d1d5db', accent: '#fca5a5', build: 0.42, extra: 'skeleton' } },
  stargh:   { name: 'スターゴースト', hp: 66, atk: 10, speed: 4.8, jumpPower: 17, width: 52, height: 74, type: 'enemy', minion: true, cd: 48,
              ranged: { type: 'wisp', speed: 10, w: 26, h: 26 }, ai: { move: 0.7, atk: 0.026, jump: 0.02, block: 0.004 },
              look: { kind: 'ghost', c1: '#c7d2fe', c2: '#6366f1' } },
  wolf:     { name: 'ダイアウルフ', hp: 78, atk: 11, speed: 6.4, jumpPower: 16, width: 78, height: 56, type: 'enemy', minion: true, cd: 16,
              ai: { move: 0.85, atk: 0.04, jump: 0.014, block: 0.005 }, look: { kind: 'wolf', c1: '#78716c', c2: '#292524' } },
  drone:    { name: '魔導機兵', hp: 92, atk: 11, speed: 4.2, jumpPower: 15, width: 56, height: 86, type: 'enemy', minion: true, cd: 40,
              ranged: { type: 'laser', speed: 15, w: 30, h: 10 }, ai: { move: 0.7, atk: 0.03, jump: 0.01, block: 0.008 },
              look: { skin: '#9ca3af', hair: '#6b7280', hairStyle: 'visor', top: '#6b7280', top2: '#374151', pants: '#4b5563', accent: '#f87171', build: 0.75, extra: 'robot' } },
  // 中ボス
  galdo:    { name: '鬼将軍ガルド', hp: 330, atk: 16, speed: 4.6, jumpPower: 14, width: 96, height: 125, type: 'enemy', boss: true, superArmor: true, reachMul: 1.5, cd: 24,
              moves: ['shockwave', 'charge'], ai: { move: 0.75, atk: 0.05, jump: 0.01, block: 0.01 },
              look: { skin: '#dc2626', hair: '#111111', hairStyle: 'oni', top: '#7f1d1d', top2: '#450a0a', pants: '#a16207', accent: '#fbbf24', build: 0.92, extra: 'oni' } },
  yukime:   { name: '氷結の魔女ユキメ', hp: 290, atk: 13, speed: 5.4, jumpPower: 17, width: 58, height: 106, type: 'enemy', boss: true, superArmor: true, cd: 36,
              ranged: { type: 'ice', speed: 12, w: 30, h: 26 }, moves: ['volley', 'shockwave'], volleyType: 'ice', ai: { move: 0.8, atk: 0.045, jump: 0.02, block: 0.012 },
              look: { skin: '#e0f2fe', hair: '#f0f9ff', hairStyle: 'long', top: '#38bdf8', top2: '#0369a1', pants: '#0c4a6e', accent: '#e0f2fe', build: 0.62, robe: true, extra: 'witch' } },
  raigo:    { name: '雷帝ライゴウ', hp: 370, atk: 15, speed: 6.0, jumpPower: 16, width: 84, height: 118, type: 'enemy', boss: true, superArmor: true, reachMul: 1.3, cd: 22,
              moves: ['bolts', 'charge', 'volley'], volleyType: 'spark', ai: { move: 0.85, atk: 0.05, jump: 0.015, block: 0.01 },
              look: { skin: '#bfdbfe', hair: '#facc15', hairStyle: 'spiky', top: '#1d4ed8', top2: '#1e3a8a', pants: '#fde047', accent: '#fde047', build: 0.88, extra: 'drums' } },
  gigalos:  { name: '鋼将ギガロス', hp: 470, atk: 18, speed: 3.8, jumpPower: 13, width: 112, height: 132, type: 'enemy', boss: true, superArmor: true, reachMul: 1.5, cd: 28,
              moves: ['shockwave', 'charge', 'volley'], volleyType: 'cannon', ai: { move: 0.8, atk: 0.05, jump: 0.006, block: 0.01 },
              look: { skin: '#94a3b8', hair: '#475569', hairStyle: 'none', top: '#475569', top2: '#1e293b', pants: '#334155', accent: '#f97316', build: 1.0, extra: 'golem' } },
  // 魔王
  zenon:    { name: '魔王ゼノン', hp: 600, atk: 19, speed: 5.2, jumpPower: 16, width: 100, height: 138, type: 'enemy', boss: true, finalBoss: true, superArmor: true, reachMul: 1.6, cd: 20,
              moves: ['shockwave', 'charge', 'volley', 'bolts'], volleyType: 'dark', ai: { move: 0.9, atk: 0.055, jump: 0.012, block: 0.012 },
              look: { skin: '#7c3aed', hair: '#111111', hairStyle: 'oni', top: '#1e1b4b', top2: '#020617', pants: '#111827', accent: '#ef4444', build: 0.82, extra: 'demon' } }
};

const STAGES = {
  1: { name: '平原 (PLAIN)', gimmick: 'ギミックなし', platforms: [{ x: 220, y: 410, width: 200, height: 18 }, { x: 780, y: 410, width: 200, height: 18 }, { x: 500, y: 280, width: 200, height: 18 }] },
  2: { name: '浮島 (ISLANDS)', gimmick: '中央の島が左右に動く', platforms: [{ x: 180, y: 400, width: 220, height: 20 }, { x: 800, y: 400, width: 220, height: 20 }, { x: 490, y: 270, width: 220, height: 20, move: { range: 170, speed: 0.02 } }] },
  3: { name: '地獄 (DOOM)', gimmick: '溶岩の間欠泉が噴き出す', hazard: { kind: 'geyser', interval: 240, damage: 22 },
       platforms: [{ x: 350, y: 390, width: 500, height: 22, type: 'obsidian' }, { x: 110, y: 290, width: 150, height: 18, type: 'obsidian' }, { x: 940, y: 290, width: 150, height: 18, type: 'obsidian' }] },
  4: { name: '神殿 (TEMPLE)', gimmick: '聖なる力でアイテムが出やすい', itemRate: 0.005, platforms: [{ x: 220, y: 410, width: 200, height: 18, type: 'gold' }, { x: 780, y: 410, width: 200, height: 18, type: 'gold' }, { x: 500, y: 280, width: 200, height: 18, type: 'gold' }] },
  5: { name: '宇宙 (SPACE)', gimmick: '低重力でふわふわ', gravity: 0.5, platforms: [{ x: 150, y: 420, width: 250, height: 16, type: 'neon' }, { x: 800, y: 420, width: 250, height: 16, type: 'neon' }, { x: 460, y: 290, width: 280, height: 16, type: 'neon' }] },
  6: { name: '氷原 (ICE FIELD)', gimmick: '床がツルツル滑る', ice: true, platforms: [{ x: 200, y: 410, width: 220, height: 18, type: 'ice' }, { x: 780, y: 410, width: 220, height: 18, type: 'ice' }, { x: 490, y: 290, width: 220, height: 18, type: 'ice' }] },
  7: { name: '密林 (JUNGLE)', gimmick: '突風が左右に吹き抜ける', wind: 1.1, platforms: [{ x: 170, y: 420, width: 230, height: 18, type: 'wood' }, { x: 800, y: 420, width: 230, height: 18, type: 'wood' }, { x: 480, y: 300, width: 240, height: 18, type: 'wood' }] },
  8: { name: '雷雲 (STORM)', gimmick: '落雷に注意 / 動く足場', hazard: { kind: 'bolt', interval: 200, damage: 24 },
       platforms: [{ x: 150, y: 410, width: 200, height: 18, type: 'cloud', move: { range: 90, speed: 0.025 } }, { x: 850, y: 410, width: 200, height: 18, type: 'cloud', move: { range: 90, speed: 0.025, phase: 3.14 } }, { x: 480, y: 285, width: 240, height: 18, type: 'cloud' }] },
  9: { name: '機械工場 (FACTORY)', gimmick: 'ベルトコンベアが流れる', conveyor: 2.2, platforms: [{ x: 200, y: 410, width: 220, height: 18, type: 'metal' }, { x: 780, y: 410, width: 220, height: 18, type: 'metal' }, { x: 490, y: 285, width: 220, height: 18, type: 'metal' }] },
  10: { name: '魔王城 (DEMON CASTLE)', gimmick: '落雷＋間欠泉＋動く足場', hazard: { kinds: ['bolt', 'geyser', 'dark'], interval: 210, damage: 24 },
        platforms: [{ x: 190, y: 410, width: 200, height: 18, type: 'obsidian' }, { x: 810, y: 410, width: 200, height: 18, type: 'obsidian' }, { x: 500, y: 280, width: 200, height: 18, type: 'obsidian', move: { range: 140, speed: 0.018 } }] }
};

const SKINS = {
  default: { name: 'ノーマル', price: 0 },
  blaze:   { name: 'ブレイズ', price: 300, hue: 6 },
  frost:   { name: 'フロスト', price: 500, hue: 196 },
  royal:   { name: 'ロイヤル', price: 800, hue: 274 },
  gold:    { name: 'ゴールド', price: 1200, hue: 46, sat: 1.15, light: 0.06 }
};

const EMOTES = {
  thumbsup:   { name: 'いいね', emoji: '👍', price: 0, anim: 'pop' },
  thumbsdown: { name: 'ブー', emoji: '👎', price: 0, anim: 'pop' },
  heart:      { name: 'ハート', emoji: '❤️', price: 0, anim: 'bounce' },
  anger:      { name: '怒り', emoji: '💢', price: 0, anim: 'shake' },
  gg:         { name: 'GG', emoji: '🤝', price: 100, anim: 'pop' },
  lol:        { name: '大笑い', emoji: '😂', price: 120, anim: 'bounce' },
  rage:       { name: '激怒', emoji: '😡', price: 120, anim: 'shake' },
  fire:       { name: '炎', emoji: '🔥', price: 150, anim: 'burst' },
  cool:       { name: 'クール', emoji: '😎', price: 150, anim: 'bounce' },
  skull:      { name: 'ドクロ', emoji: '💀', price: 200, anim: 'shake' },
  party:      { name: 'パーティー', emoji: '🎉', price: 250, anim: 'confetti' },
  sparkle:    { name: 'キラキラ', emoji: '✨', price: 250, anim: 'sparkle' },
  crown:      { name: '王冠', emoji: '👑', price: 300, anim: 'spin' },
  rainbow:    { name: '虹', emoji: '🌈', price: 350, anim: 'rise' },
  money:      { name: '札束の雨', emoji: '💰', price: 400, anim: 'rain' },
  flex:       { name: 'マッチョポーズ', emoji: '💪', price: 450, anim: 'pop', motion: 'flex' },
  dance:      { name: 'ダンス', emoji: '🕺', price: 500, anim: 'bounce', motion: 'dance' },
  flip:       { name: 'バク宙', emoji: '🌀', price: 600, anim: 'spin', motion: 'flip' }
};

const STORY = [
  { stage: 1, title: '旅立ちの平原', enemies: ['slime'], reward: 80,
    intro: ['魔王ゼノンに「セノビック」の力を奪われ、世界は闇に包まれた。', '勇者よ、まずは平原にはびこる魔物を退治するのだ！'] },
  { stage: 2, title: '浮島のゴブリン砦', enemies: ['goblin', 'goblin'], reward: 110,
    intro: ['空に浮かぶ島々にゴブリンの群れが巣くっている。', '足場が動くぞ、落ち着いて戦え！'] },
  { stage: 3, title: '灼熱の地獄谷', enemies: ['galdo'], reward: 300,
    intro: ['溶岩の谷を守る中ボス「鬼将軍ガルド」が立ちはだかる！', '間欠泉にも注意しろ。突進と衝撃波に気をつけるのだ！'] },
  { stage: 4, title: '黄金の神殿', enemies: ['skeleton', 'skeleton'], reward: 160,
    intro: ['古の神殿には骨だけになった兵が彷徨っている。', '遠くから骨を投げてくるぞ！'] },
  { stage: 5, title: '星屑の宇宙回廊', enemies: ['stargh', 'stargh'], reward: 180,
    intro: ['重力の薄い宇宙回廊。ふわふわ漂うゴーストが現れた。', '低重力でのジャンプに慣れておけ！'] },
  { stage: 6, title: '凍てつく氷原', enemies: ['yukime'], reward: 380,
    intro: ['氷の大地に君臨する中ボス「氷結の魔女ユキメ」。', '床は滑る。氷の弾幕をかいくぐれ！'] },
  { stage: 7, title: '迷いの密林', enemies: ['wolf', 'wolf', 'wolf'], reward: 220,
    intro: ['密林の奥でダイアウルフの群れに囲まれた！', '突風に煽られながらも、3体まとめて倒せ！'] },
  { stage: 8, title: '雷鳴轟く空域', enemies: ['raigo'], reward: 450,
    intro: ['暗雲渦巻く空に、中ボス「雷帝ライゴウ」が待ち構える。', '落雷の予兆を見逃すな！'] },
  { stage: 9, title: '魔導機械工場', enemies: ['gigalos', 'drone'], reward: 550,
    intro: ['魔王軍の心臓部、魔導機械工場。「鋼将ギガロス」が立ちはだかる！', 'ベルトコンベアに流されるな、突破せよ！'] },
  { stage: 10, title: '魔王城 ― 最終決戦', enemies: ['zenon'], reward: 1500, final: true,
    intro: ['ついに辿り着いた魔王城。玉座に座る魔王ゼノンが立ち上がる。', '「よくぞここまで来た…。だが、セノビックの力は渡さぬ！」', '世界の運命をかけた最終決戦だ！']}
];

const CATALOG = { characters: CHARACTERS, enemies: ENEMIES, stages: STAGES, skins: SKINS, emotes: EMOTES, story: STORY, freeChars: FREE_CHARS };

/* =====================================================================
   プロフィール (SEG・所持品) の保存
   ===================================================================== */
const PROFILE_PATH = path.join(process.env.DATA_DIR || __dirname, 'profiles.json');
let profiles = {};
try {
  if (fs.existsSync(PROFILE_PATH)) profiles = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8')) || {};
} catch (e) { console.error('profiles load error', e.message); profiles = {}; }

let saveTimer = null;
function saveProfiles() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.writeFileSync(PROFILE_PATH, JSON.stringify(profiles)); } catch (e) { /* 書き込み不可環境では無視 */ }
  }, 800);
}

function newProfile() {
  return {
    seg: START_SEG,
    ownedChars: FREE_CHARS.slice(),
    ownedSkins: {},
    equippedSkin: {},
    ownedEmotes: FREE_EMOTES.slice(),
    emoteSlots: FREE_EMOTES.slice(),
    storyProgress: 0,
    storyCleared: false,
    wins: 0
  };
}

const tokenBySocket = {};
function profileOf(socketId) { const t = tokenBySocket[socketId]; return t ? profiles[t] : null; }
function addSeg(pr, amount) { if (pr && amount > 0) { pr.seg += amount; saveProfiles(); } }

/* =====================================================================
   ルーム・ユーティリティ
   ===================================================================== */
let rooms = {};

function generateRoomCode() {
  let code;
  do { code = Math.floor(1000 + Math.random() * 9000).toString(); } while (rooms[code]);
  return code;
}

function createRoom(code) {
  return {
    code, mode: 'online', players: {}, items: [], projectiles: [], hazards: [], platforms: [], platPrev: null,
    tick: 0, spawnedItemCount: 0, gameState: 'LOBBY', isCpuMode: false, selectedStage: 1,
    countdownTimer: null, countdownVal: 0, stageWidth: 1200, storyIndex: 0, wind: 0, conveyor: 0
  };
}

function getRoomBySocket(socket) {
  for (let code in rooms) { if (rooms[code].players[socket.id]) return rooms[code]; }
  return null;
}

const CH = (p) => CHARACTERS[p.characterKey] || ENEMIES[p.characterKey] || CHARACTERS.futsuo;
const scaleOf = (p) => (p.senobicTimer > 0 ? 2 : 1);
const teamOf = (p) => p.team || p.id;
const isFoe = (a, b) => a && b && a.id !== b.id && teamOf(a) !== teamOf(b);

function createPlayerData(socketId, playerNum, name) {
  return {
    id: socketId, playerNum, name, characterKey: 'futsuo', skinId: 'default', ready: false, isCpu: false,
    team: null, isEnemy: false, isBoss: false,
    x: 250, y: 400, vx: 0, vy: 0, inputVx: 0, facing: 'right', hp: 100, maxHp: 100, lives: 3,
    isGrounded: false, wasGrounded: false, standingOn: null,
    attacking: false, attackCooldown: 0, attackType: null, attackBox: null, stunFrames: 0, invincibleFrames: 0,
    jumpCount: 0, isKilled: false, killTimer: 0,
    buffAtkTimer: 0, buffSpeedTimer: 0, senobicTimer: 0,
    specialGauge: 0, specialActiveTimer: 0, specialReady: false, debugonSpecialArmed: false, specialShots: 0,
    barrierTimer: 0, barrierCooldown: 0, downPressed: false, hasBarrel: false,
    rage: false, pending: null, chargeT: 0, moveTimer: 120, lastStamp: 0
  };
}

function respawnPlayer(p, stageWidth) {
  const char = CH(p);
  p.hp = p.maxHp;
  p.x = p.playerNum === 1 ? 250 : stageWidth - 250 - char.width;
  p.y = 100; p.vx = 0; p.vy = 0;
  p.isKilled = false; p.killTimer = 0; p.invincibleFrames = 120; p.hasBarrel = false;
}

function computePlatforms(room, st) {
  const big = room.stageWidth === 1600;
  const sx = big ? 1.33 : 1, sw = big ? 1.2 : 1;
  const prev = room.platPrev;
  const rects = st.platforms.map((pl, i) => {
    let x = pl.x * sx;
    if (pl.move) x += Math.sin(room.tick * pl.move.speed + (pl.move.phase || 0)) * pl.move.range * sx;
    const dx = prev && prev[i] !== undefined ? x - prev[i] : 0;
    return { x, y: pl.y, width: pl.width * sw, height: pl.height, type: pl.type, moving: !!pl.move, dx };
  });
  room.platPrev = rects.map(r => r.x);
  room.platforms = rects;
}

function spawnRandomItem(room) {
  if (room.items.length >= 2) return;
  if (room.spawnedItemCount >= 6) return;
  const rand = Math.random();
  let type = 'heal';
  if (rand < 0.05) type = 'senobic';
  else if (rand < 0.35) type = 'barrel';
  else if (rand < 0.65) type = 'heal';
  else type = 'atk';
  const stageWidth = room.stageWidth || 1200;
  room.items.push({
    id: Date.now() + Math.random(), type,
    x: 150 + Math.random() * (stageWidth - 300), y: -40, vy: 2.5,
    width: type === 'barrel' ? 36 : 45, height: type === 'barrel' ? 40 : 45, isGrounded: false
  });
  room.spawnedItemCount++;
}

/* ---------- ダメージ処理の共通化 ---------- */
// 戻り値: false(無効) / 'blocked' / 'hit'
function damagePlayer(room, attacker, def, dmg, dir, opt = {}) {
  if (!def || def.isKilled || def.invincibleFrames > 0) return false;
  const defChar = CH(def);
  const cx = def.x + defChar.width * scaleOf(def) / 2;
  const cy = def.y + defChar.height * scaleOf(def) * 0.4;
  if (def.barrierTimer > 0) {
    io.to(room.code).emit('hit', { x: cx, y: cy, dmg: 0, blocked: true });
    return 'blocked';
  }
  def.hp -= dmg;
  const attChar = attacker ? CH(attacker) : null;
  if (attacker && !attacker.isKilled) {
    if (!opt.noGauge && attacker.specialGauge < 100) {
      attacker.specialGauge = Math.min(100, attacker.specialGauge + 10);
      if (attacker.specialGauge >= 100) attacker.specialReady = true;
    }
    if (attChar && attChar.vamp) attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.round(dmg * attChar.vamp));
    if (opt.heal) attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.round(dmg * opt.heal));
  }
  const armored = !opt.ignoreArmor && ((defChar.type === 'debugon' && def.attacking) || def.senobicTimer > 0 || defChar.superArmor);
  let ko = false;
  if (def.hp <= 0) {
    ko = true;
    def.hp = 0; def.lives--; def.isKilled = true; def.killTimer = 0;
    def.vx = dir * (opt.koVx || 24); def.vy = -20;
    spawnRandomItem(room);
    io.to(room.code).emit('koEffect', { victimId: def.id, x: def.x, y: def.y, boss: !!def.isBoss });
  } else if (!armored) {
    if (opt.stun !== undefined) def.stunFrames = opt.stun;
    else if (attChar && attChar.type === 'wizard' && Math.random() < 1 / 3) def.stunFrames = 30;
    else def.stunFrames = 10;
    def.vy = opt.knockVy !== undefined ? opt.knockVy : -5;
    def.vx = dir * (opt.knockVx !== undefined ? opt.knockVx : 12);
  }
  def.invincibleFrames = opt.inv !== undefined ? opt.inv : 24;
  io.to(room.code).emit('hit', { x: cx, y: cy, dmg, ko, dir });
  return 'hit';
}

/* ---------- 通常攻撃 ---------- */
function doBasicAttack(room, p, attackType) {
  const char = CH(p);
  if (p.attacking || p.attackCooldown > 0) return false;
  const isPunch = attackType === 'punch';
  p.attacking = true;
  p.attackType = attackType;
  p.attackCooldown = isPunch ? (char.cd || 12) : 60;

  let atkMult = p.buffAtkTimer > 0 ? 1.5 : 1.0;
  if (p.senobicTimer > 0) atkMult = 1.8;
  if (p.specialActiveTimer > 0 && char.type === 'futsuo') atkMult *= 1.5;
  if (p.rage) atkMult *= 1.3;
  let dmg = Math.round((isPunch ? char.atk : Math.round(char.atk * 1.25)) * atkMult);
  const isRight = p.facing === 'right';
  const giant = p.senobicTimer > 0;

  if (char.ranged) {
    const r = char.ranged;
    room.projectiles.push({
      id: Date.now() + Math.random(), ownerId: p.id, type: r.type,
      x: isRight ? p.x + char.width * (giant ? 2 : 1) : p.x - 30,
      y: p.y + char.height * (giant ? 2 : 1) * 0.4,
      vx: isRight ? r.speed : -r.speed, width: r.w, height: r.h, damage: dmg
    });
  } else {
    const mul = char.reachMul || 1;
    let reach = (isPunch ? 55 : 85) * mul;
    if (p.specialActiveTimer > 0 && char.type === 'futsuo') reach *= 2;
    const attackHeight = (isPunch ? char.height * 0.4 : char.height * 0.3) * (giant ? 2.2 : 1);
    const attackYOffset = giant ? (char.height * 2 - attackHeight - 10) : (isPunch ? char.height * 0.2 : char.height * 0.4);
    if (char.type === 'chibikoro' && !p.isGrounded) {
      p.vy = 22; dmg = Math.round(18 * atkMult); reach = 100;
    }
    p.attackBox = {
      x: isRight ? p.x + char.width * (giant ? 2 : 1) : p.x - reach * (giant ? 1.5 : 1),
      y: p.y + attackYOffset, width: reach * (giant ? 1.5 : 1), height: attackHeight, damage: dmg, type: attackType
    };
    setTimeout(() => { p.attackBox = null; }, 140);
  }
  setTimeout(() => { p.attacking = false; }, 200);
  return true;
}

/* ---------- 必殺技 ---------- */
function trySpecial(room, p) {
  const ch = CH(p);
  const sp = ch.special;
  if (!sp) return;
  const right = p.facing === 'right';
  const emit = (type) => io.to(room.code).emit('specialTriggered', { playerId: p.id, type });
  const push = (o) => room.projectiles.push(Object.assign({ id: Date.now() + Math.random(), ownerId: p.id }, o));

  if (sp === 'shuriken3' || sp === 'magic3') {
    let first = false;
    if (!(p.specialShots > 0)) {
      if (!p.specialReady) return;
      p.specialShots = 3; first = true;
    }
    p.specialShots--;
    if (sp === 'shuriken3') {
      const size = Math.round(ch.width * 1.5);
      push({ type: 'ninja_giant_yellow', x: right ? p.x + ch.width : p.x - size, y: p.y + ch.height * 0.25,
        vx: right ? 18 : -18, width: size, height: size, damage: Math.round(ch.atk * 1.5) });
    } else {
      push({ type: 'wizard_mega_giant', x: right ? p.x + ch.width : p.x - 90, y: p.y + ch.height * 0.15,
        vx: right ? 14 : -14, width: 85, height: 85, damage: Math.round(ch.atk * 2.0), pierce: true });
    }
    emit(first ? sp + '_ready' : sp + '_shot');
    if (p.specialShots <= 0) { p.specialReady = false; p.specialGauge = 0; }
    return;
  }

  if (!p.specialReady) return;
  p.specialReady = false;
  p.specialGauge = 0;
  const clearBox = (ms) => setTimeout(() => { if (p.attackBox) p.attackBox = null; }, ms);

  switch (sp) {
    case 'powerup':
      p.specialActiveTimer = 300; emit('powerup'); break;
    case 'armor':
      p.debugonSpecialArmed = true; emit('debugon_ready'); break;
    case 'bomb':
      p.attackBox = { x: p.x - 140, y: p.y - 90, width: ch.width + 280, height: ch.height + 180, damage: 55, type: 'special_bomb' };
      clearBox(300); emit('bomb'); break;
    case 'flame':
      push({ type: 'dragon_flame', x: right ? p.x + ch.width : p.x - 130, y: p.y + ch.height * 0.15,
        vx: right ? 10 : -10, width: 130, height: 70, damage: Math.round(ch.atk * 2.2), pierce: true, life: 55 });
      emit('flame'); break;
    case 'laser':
      p.attackBox = { x: right ? p.x + ch.width : p.x - 720, y: p.y + ch.height * 0.22, width: 720, height: 46, damage: 50, type: 'special_laser' };
      clearBox(280); emit('laser'); break;
    case 'drain':
      p.attackBox = { x: p.x - 120, y: p.y - 30, width: ch.width + 240, height: ch.height + 60, damage: 32, type: 'special_drain' };
      clearBox(300); emit('drain'); break;
    case 'iai': {
      const startX = p.x;
      const W = room.stageWidth || 1200;
      let nx = startX + (right ? 260 : -260);
      nx = Math.max(0, Math.min(W - ch.width, nx));
      p.x = nx;
      p.invincibleFrames = Math.max(p.invincibleFrames, 14);
      p.attackBox = { x: Math.min(startX, nx) - 10, y: p.y - 10, width: Math.abs(nx - startX) + ch.width + 20, height: ch.height + 20,
        damage: Math.round(ch.atk * 3.2), type: 'special_iai' };
      clearBox(250); emit('iai');
      io.to(room.code).emit('dashTrail', { x1: startX, x2: nx, y: p.y + ch.height / 2 });
      break;
    }
    case 'lightning': {
      const foes = Object.values(room.players).filter(o => isFoe(p, o) && !o.isKilled).slice(0, 3);
      const dmg = Math.round(ch.atk * 2.4);
      if (foes.length === 0) {
        room.hazards.push({ id: Math.random(), kind: 'bolt', x: p.x + (right ? 220 : -220), w: 90, t: 0, warn: 22, active: 14, damage: dmg, ownerId: p.id, hit: {} });
      } else {
        foes.forEach(f => room.hazards.push({ id: Math.random(), kind: 'bolt', x: f.x + CH(f).width * scaleOf(f) / 2, w: 90, t: 0, warn: 26, active: 14, damage: dmg, ownerId: p.id, hit: {} }));
      }
      emit('lightning'); break;
    }
  }
}

/* ---------- ボスの特殊行動 ---------- */
function execBossMove(room, cpu, name, target) {
  const ch = CH(cpu);
  const right = cpu.facing === 'right';
  io.to(room.code).emit('bossMove', { playerId: cpu.id, type: name });
  if (name === 'shockwave') {
    cpu.attackBox = { x: cpu.x - 120, y: cpu.y + ch.height * 0.35, width: ch.width + 240, height: ch.height * 0.65,
      damage: Math.round(ch.atk * 1.5 * (cpu.rage ? 1.3 : 1)), type: 'special_shockwave' };
    setTimeout(() => { if (cpu.attackBox && cpu.attackBox.type === 'special_shockwave') cpu.attackBox = null; }, 260);
  } else if (name === 'charge') {
    cpu.chargeT = 28;
  } else if (name === 'volley') {
    const vyList = cpu.rage ? [-4, -2, 0, 2, 4] : [-3, 0, 3];
    vyList.forEach((vy, i) => {
      room.projectiles.push({
        id: Date.now() + Math.random() + i, ownerId: cpu.id, type: ch.volleyType || 'fire',
        x: right ? cpu.x + ch.width : cpu.x - 30, y: cpu.y + ch.height * 0.35,
        vx: right ? 9 : -9, vy, width: 30, height: 30, damage: Math.round(ch.atk * 0.9)
      });
    });
  } else if (name === 'bolts' && target) {
    const tx = target.x + CH(target).width / 2;
    const kind = ch.finalBoss ? 'dark' : 'bolt';
    [0, -150, 150].forEach(off => {
      const x = Math.max(60, Math.min(room.stageWidth - 60, tx + off));
      room.hazards.push({ id: Math.random(), kind, x, w: 90, t: 0, warn: 46, active: 16, damage: Math.round(ch.atk * 1.3), ownerId: cpu.id, hit: {} });
    });
  }
}

/* ---------- CPU / 敵AI ---------- */
const DEFAULT_AI = { move: 0.55, atk: 0.038, jump: 0.008, block: 0.01 };

function updateAI(room, cpu, playersArr, st) {
  if (cpu.isKilled) return;
  const ch = CH(cpu);
  const ice = !!st.ice;
  const drive = (v) => { cpu.inputVx = v; if (!ice) cpu.vx = v; };

  if (cpu.chargeT > 0) {
    cpu.chargeT--;
    const dir = cpu.facing === 'right' ? 1 : -1;
    cpu.vx = dir * 13;
    cpu.attackBox = { x: dir > 0 ? cpu.x + ch.width : cpu.x - 70, y: cpu.y + ch.height * 0.15, width: 70, height: ch.height * 0.8,
      damage: Math.round(ch.atk * 1.3 * (cpu.rage ? 1.3 : 1)), type: 'special_charge' };
    if (cpu.chargeT <= 0) { cpu.attackBox = null; cpu.vx = 0; }
    return;
  }
  if (cpu.stunFrames > 0 || cpu.barrierTimer > 0) return;

  const foes = playersArr.filter(o => isFoe(cpu, o) && !o.isKilled);
  if (!foes.length) { drive(0); return; }
  let target = foes[0], best = Infinity;
  foes.forEach(f => { const d = Math.abs((f.x + CH(f).width / 2) - (cpu.x + ch.width / 2)); if (d < best) { best = d; target = f; } });
  const tc = CH(target);
  const dx = (target.x + tc.width / 2) - (cpu.x + ch.width / 2);
  const dist = Math.abs(dx);
  const ai = ch.ai || DEFAULT_AI;

  if (ch.boss && !cpu.rage && cpu.hp < cpu.maxHp * 0.5) {
    cpu.rage = true;
    io.to(room.code).emit('bossRage', { playerId: cpu.id });
  }

  if (cpu.pending) {
    drive(0);
    cpu.facing = dx > 0 ? 'right' : 'left';
    cpu.pending.t--;
    if (cpu.pending.t <= 0) {
      execBossMove(room, cpu, cpu.pending.name, target);
      cpu.pending = null;
      cpu.moveTimer = cpu.rage ? 80 + Math.random() * 70 : 140 + Math.random() * 100;
    }
    return;
  }

  cpu.facing = dx > 0 ? 'right' : 'left';
  const sm = (cpu.buffSpeedTimer > 0 ? 1.4 : 1) * (cpu.rage ? 1.25 : 1);
  const sp = ch.speed * ai.move * sm;
  const reach = 55 * (ch.reachMul || 1);
  const keep = ch.ranged ? 240 : (ch.width / 2 + tc.width / 2 + reach * 0.6);
  const dir = dx > 0 ? 1 : -1;
  if (ch.ranged && dist < 130) drive(-dir * sp);
  else if (dist > keep) drive(dir * sp);
  else drive(0);

  if (cpu.isGrounded) {
    const targetAbove = (target.y + tc.height * scaleOf(target)) < cpu.y - 20;
    if (Math.random() < ai.jump || (targetAbove && Math.random() < 0.04)) {
      cpu.vy = -ch.jumpPower; cpu.isGrounded = false; cpu.standingOn = null;
    }
  }

  if (cpu.hasBarrel) {
    cpu.hasBarrel = false;
    const right = cpu.facing === 'right';
    room.projectiles.push({
      id: Date.now() + Math.random(), ownerId: cpu.id, type: 'thrown_barrel',
      x: right ? cpu.x + ch.width : cpu.x - 36, y: cpu.y + 10, vx: right ? 12 : -12, vy: -6, width: 36, height: 40
    });
    return;
  }

  if (ch.special && ((cpu.specialShots > 0 && Math.random() < 0.2) || (cpu.specialReady && dist < 420 && Math.random() < 0.05))) {
    trySpecial(room, cpu);
  }

  if (ai.block && cpu.barrierCooldown <= 0 && Math.random() < ai.block) {
    cpu.barrierTimer = 60; cpu.barrierCooldown = 180;
  }

  if (ch.moves && ch.moves.length) {
    cpu.moveTimer--;
    if (cpu.moveTimer <= 0 && dist < 750) {
      const name = ch.moves[Math.floor(Math.random() * ch.moves.length)];
      const tele = { shockwave: 32, charge: 26, volley: 22, bolts: 14 }[name] || 20;
      cpu.pending = { name, t: tele, max: tele };
      return;
    }
  }

  const attackRange = ch.ranged ? 420 : (ch.width / 2 + tc.width / 2 + reach + 15);
  if (dist <= attackRange && !cpu.attacking && cpu.attackCooldown <= 0 && Math.random() < ai.atk) {
    doBasicAttack(room, cpu, Math.random() < 0.7 ? 'punch' : 'kick');
  }
}

/* =====================================================================
   試合の開始・終了
   ===================================================================== */
function startMatch(room) {
  const playerCount = Object.keys(room.players).length;
  room.stageWidth = playerCount >= 3 ? 1600 : 1200;
  room.gameState = 'PLAYING';
  room.items = []; room.projectiles = []; room.hazards = [];
  room.spawnedItemCount = 0; room.tick = 0; room.platPrev = null;

  const spawnPositions = [
    { x: 200, facing: 'right' },
    { x: room.stageWidth - 250, facing: 'left' },
    { x: 450, facing: 'right' },
    { x: room.stageWidth - 450, facing: 'left' }
  ];

  Object.values(room.players).forEach((pl, idx) => {
    const char = CH(pl);
    const spawn = spawnPositions[idx % 4];
    pl.hp = char.hp; pl.maxHp = char.hp;
    pl.lives = pl.isEnemy ? 1 : 3;
    pl.x = spawn.x; pl.y = 520 - char.height;
    pl.vx = 0; pl.vy = 0; pl.inputVx = 0; pl.facing = spawn.facing;
    pl.jumpCount = 0; pl.isKilled = false; pl.killTimer = 0; pl.standingOn = null;
    pl.buffAtkTimer = 0; pl.buffSpeedTimer = 0; pl.senobicTimer = 0;
    pl.attackCooldown = 0; pl.attacking = false; pl.attackBox = null; pl.stunFrames = 0; pl.invincibleFrames = 0;
    pl.specialGauge = 0; pl.specialActiveTimer = 0; pl.specialReady = false;
    pl.debugonSpecialArmed = false; pl.specialShots = 0;
    pl.barrierTimer = 0; pl.barrierCooldown = 0; pl.downPressed = false; pl.hasBarrel = false;
    pl.rage = false; pl.pending = null; pl.chargeT = 0; pl.moveTimer = 120 + Math.random() * 60;
  });

  io.to(room.code).emit('gameStart', {
    players: room.players, selectedStage: room.selectedStage, isCpuMode: room.isCpuMode,
    mode: room.mode, stageWidth: room.stageWidth, storyIndex: room.storyIndex
  });
}

function startStoryBattle(room) {
  const b = STORY[room.storyIndex];
  room.selectedStage = b.stage;
  Object.keys(room.players).forEach(id => { if (room.players[id].isCpu) delete room.players[id]; });
  const hero = Object.values(room.players)[0];
  hero.team = 'hero';
  b.enemies.forEach((key, i) => {
    const id = 'cpu_' + i;
    const e = createPlayerData(id, i + 2, ENEMIES[key].name);
    e.characterKey = key; e.isCpu = true; e.ready = true; e.team = 'evil'; e.isEnemy = true;
    e.isBoss = !!ENEMIES[key].boss;
    e.facing = 'left';
    room.players[id] = e;
  });
  room.gameState = 'STORY_INTRO';
  io.to(room.code).emit('storyIntro', {
    index: room.storyIndex, total: STORY.length, battle: b, players: room.players, selectedStage: b.stage
  });
}

function endMatch(room, winner) {
  if (room.gameState !== 'PLAYING') return;
  room.gameState = 'FINISHED';
  const humans = Object.values(room.players).filter(p => !p.isCpu);

  if (room.mode === 'story') {
    const hero = humans[0];
    const win = !!(winner && hero && teamOf(winner) === teamOf(hero));
    const b = STORY[room.storyIndex];
    const pr = hero ? profileOf(hero.id) : null;
    let reward = 0, firstClear = false;
    if (pr) {
      if (win) {
        firstClear = room.storyIndex >= pr.storyProgress;
        reward = Math.round(b.reward * (firstClear ? 1.5 : 1));
        if (firstClear) pr.storyProgress = Math.max(pr.storyProgress, room.storyIndex + 1);
        if (b.final) pr.storyCleared = true;
        pr.wins++;
      } else {
        reward = Math.round(b.reward * 0.2);
      }
      addSeg(pr, reward);
      saveProfiles();
      const s = io.sockets.sockets.get(hero.id);
      if (s) s.emit('profileUpdate', { profile: pr });
    }
    io.to(room.code).emit('storyResult', {
      win, index: room.storyIndex, total: STORY.length, reward, firstClear, final: !!b.final,
      seg: pr ? pr.seg : 0, progress: pr ? pr.storyProgress : 0
    });
    return;
  }

  const rewards = {};
  humans.forEach(h => {
    const pr = profileOf(h.id);
    if (!pr) return;
    const won = winner && teamOf(h) === teamOf(winner);
    let amount;
    if (room.mode === 'cpu') amount = won ? 100 : 30;
    else amount = humans.length >= 2 ? (won ? 150 : 50) : 0;
    if (won) pr.wins++;
    if (amount > 0) { addSeg(pr, amount); rewards[h.id] = amount; }
    const s = io.sockets.sockets.get(h.id);
    if (s) s.emit('profileUpdate', { profile: pr });
  });
  io.to(room.code).emit('gameOver', {
    winnerName: winner ? winner.name : '-', winnerNum: winner ? winner.playerNum : 0,
    isCpuMode: room.isCpuMode, mode: room.mode, rewards
  });
}

/* =====================================================================
   Socket.io
   ===================================================================== */
function sendProfile(socket, msg, ok = true) {
  const pr = profileOf(socket.id);
  if (pr) socket.emit('profileUpdate', { profile: pr, msg, ok });
}

function refreshPlayerSkin(socket) {
  const room = getRoomBySocket(socket);
  const pr = profileOf(socket.id);
  if (room && pr && room.players[socket.id]) {
    const p = room.players[socket.id];
    p.skinId = pr.equippedSkin[p.characterKey] || 'default';
    io.to(room.code).emit('characterUpdated', { players: room.players });
  }
}

io.on('connection', (socket) => {
  socket.on('auth', (data) => {
    let token = data && typeof data.token === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(data.token) ? data.token : null;
    if (!token) token = crypto.randomBytes(16).toString('hex');
    if (!profiles[token]) { profiles[token] = newProfile(); saveProfiles(); }
    tokenBySocket[socket.id] = token;
    socket.emit('authOk', { token, profile: profiles[token], catalog: CATALOG });
  });

  /* ----- ショップ ----- */
  socket.on('buyCharacter', (d) => {
    const pr = profileOf(socket.id); if (!pr || !d) return;
    const c = CHARACTERS[d.key];
    if (!c) return;
    if (pr.ownedChars.includes(d.key)) return sendProfile(socket, 'すでに所持しています', false);
    if (pr.seg < c.price) return sendProfile(socket, 'SEGが足りません', false);
    pr.seg -= c.price; pr.ownedChars.push(d.key); saveProfiles();
    sendProfile(socket, `${c.name} を解放しました！`);
  });

  socket.on('buySkin', (d) => {
    const pr = profileOf(socket.id); if (!pr || !d) return;
    const sk = SKINS[d.skinId];
    if (!sk || !CHARACTERS[d.charKey] || d.skinId === 'default') return;
    if (!pr.ownedChars.includes(d.charKey)) return sendProfile(socket, '先にキャラクターを解放してください', false);
    pr.ownedSkins[d.charKey] = pr.ownedSkins[d.charKey] || [];
    if (pr.ownedSkins[d.charKey].includes(d.skinId)) return sendProfile(socket, 'すでに所持しています', false);
    if (pr.seg < sk.price) return sendProfile(socket, 'SEGが足りません', false);
    pr.seg -= sk.price; pr.ownedSkins[d.charKey].push(d.skinId);
    pr.equippedSkin[d.charKey] = d.skinId; saveProfiles();
    refreshPlayerSkin(socket);
    sendProfile(socket, `スキン「${sk.name}」を購入して装着しました！`);
  });

  socket.on('equipSkin', (d) => {
    const pr = profileOf(socket.id); if (!pr || !d) return;
    if (!CHARACTERS[d.charKey] || !SKINS[d.skinId] || !pr.ownedChars.includes(d.charKey)) return;
    const owned = d.skinId === 'default' || (pr.ownedSkins[d.charKey] || []).includes(d.skinId);
    if (!owned) return;
    pr.equippedSkin[d.charKey] = d.skinId; saveProfiles();
    refreshPlayerSkin(socket);
    sendProfile(socket, 'スキンを装着しました');
  });

  socket.on('buyEmote', (d) => {
    const pr = profileOf(socket.id); if (!pr || !d) return;
    const em = EMOTES[d.emoteId]; if (!em) return;
    if (pr.ownedEmotes.includes(d.emoteId)) return sendProfile(socket, 'すでに所持しています', false);
    if (pr.seg < em.price) return sendProfile(socket, 'SEGが足りません', false);
    pr.seg -= em.price; pr.ownedEmotes.push(d.emoteId);
    const empty = pr.emoteSlots.findIndex(s => !s);
    if (empty >= 0) pr.emoteSlots[empty] = d.emoteId;
    saveProfiles();
    sendProfile(socket, `エモート「${em.name}」を購入しました！`);
  });

  socket.on('equipEmote', (d) => {
    const pr = profileOf(socket.id); if (!pr || !d) return;
    const slot = d.slot | 0;
    if (slot < 0 || slot > 3 || !pr.ownedEmotes.includes(d.emoteId)) return;
    const prev = pr.emoteSlots.indexOf(d.emoteId);
    if (prev >= 0 && prev !== slot) pr.emoteSlots[prev] = pr.emoteSlots[slot];
    pr.emoteSlots[slot] = d.emoteId; saveProfiles();
    sendProfile(socket, `スロット${slot + 1}に装備しました`);
  });

  /* ----- ルーム ----- */
  socket.on('createRoom', (data) => {
    const code = generateRoomCode();
    rooms[code] = createRoom(code);
    const room = rooms[code];
    room.players[socket.id] = createPlayerData(socket.id, 1, (data && data.playerName) || 'Player 1');
    socket.join(code);
    socket.emit('roomCreated', { code, playerNum: 1 });
    io.to(code).emit('gameState', { state: room.gameState, players: room.players, isCpuMode: false, code, selectedStage: room.selectedStage });
  });

  socket.on('joinRoom', (data) => {
    const code = data && data.code;
    const room = rooms[code];
    if (!room) { socket.emit('joinError', '部屋が見つかりません。'); return; }
    if (Object.keys(room.players).length >= 4 || room.isCpuMode || room.gameState === 'PLAYING') {
      socket.emit('joinError', '部屋が満員か、対戦中です (最大4人)。'); return;
    }
    const used = Object.values(room.players).map(p => p.playerNum);
    let num = 1; while (used.includes(num)) num++;
    room.players[socket.id] = createPlayerData(socket.id, num, (data && data.playerName) || `Player ${num}`);
    socket.join(code);
    socket.emit('roomJoined', { code, playerNum: num });
    io.to(code).emit('gameState', { state: room.gameState, players: room.players, isCpuMode: false, code, selectedStage: room.selectedStage });
  });

  socket.on('startCpuMode', (data) => {
    const pr = profileOf(socket.id);
    const code = generateRoomCode();
    rooms[code] = createRoom(code);
    const room = rooms[code];
    room.isCpuMode = true; room.mode = 'cpu';
    const stageId = STAGES[data && data.stageId] ? data.stageId : 1;
    room.selectedStage = stageId;

    const me = createPlayerData(socket.id, 1, (data && data.playerName) || 'Player 1');
    let key = data && data.characterKey;
    if (!CHARACTERS[key] || (pr && !pr.ownedChars.includes(key))) key = 'futsuo';
    me.characterKey = key;
    me.skinId = (pr && pr.equippedSkin[key]) || 'default';
    me.ready = true;
    room.players[socket.id] = me;

    const cpuKeys = Object.keys(CHARACTERS);
    const cpu = createPlayerData('cpu_player', 2, 'CPU');
    cpu.characterKey = cpuKeys[Math.floor(Math.random() * cpuKeys.length)];
    cpu.isCpu = true; cpu.ready = true; cpu.x = 850; cpu.facing = 'left';
    room.players['cpu_player'] = cpu;

    socket.join(code);
    socket.emit('roomCreated', { code, playerNum: 1 });
    startMatch(room);
  });

  /* ----- ストーリーモード ----- */
  socket.on('startStory', (data) => {
    const pr = profileOf(socket.id);
    if (!pr) return;
    const code = generateRoomCode();
    rooms[code] = createRoom(code);
    const room = rooms[code];
    room.isCpuMode = true; room.mode = 'story';
    let idx = (data && data.index) | 0;
    idx = Math.max(0, Math.min(idx, Math.min(pr.storyProgress, STORY.length - 1)));
    room.storyIndex = idx;

    const me = createPlayerData(socket.id, 1, (data && data.playerName) || 'Player 1');
    let key = data && data.characterKey;
    if (!CHARACTERS[key] || !pr.ownedChars.includes(key)) key = 'futsuo';
    me.characterKey = key;
    me.skinId = pr.equippedSkin[key] || 'default';
    me.ready = true; me.team = 'hero';
    room.players[socket.id] = me;

    socket.join(code);
    socket.emit('roomCreated', { code, playerNum: 1 });
    startStoryBattle(room);
  });

  socket.on('storyStart', () => {
    const room = getRoomBySocket(socket);
    if (room && room.mode === 'story' && room.gameState === 'STORY_INTRO') startMatch(room);
  });

  socket.on('storyNext', () => {
    const room = getRoomBySocket(socket);
    if (!room || room.mode !== 'story' || room.gameState !== 'FINISHED') return;
    if (room.storyIndex < STORY.length - 1) {
      room.storyIndex++;
      startStoryBattle(room);
    }
  });

  socket.on('storyRetry', () => {
    const room = getRoomBySocket(socket);
    if (!room || room.mode !== 'story' || room.gameState !== 'FINISHED') return;
    startStoryBattle(room);
  });

  socket.on('selectStage', (data) => {
    const room = getRoomBySocket(socket);
    if (room && room.players[socket.id] && room.players[socket.id].playerNum === 1 && STAGES[data.stageId] && room.mode === 'online') {
      room.selectedStage = data.stageId;
      io.to(room.code).emit('stageUpdated', { selectedStage: room.selectedStage });
    }
  });

  socket.on('updateName', (data) => {
    const room = getRoomBySocket(socket);
    if (room && room.players[socket.id]) {
      const nm = String((data && data.name) || '').slice(0, 10);
      room.players[socket.id].name = nm || `Player ${room.players[socket.id].playerNum}`;
      io.to(room.code).emit('characterUpdated', { players: room.players });
    }
  });

  socket.on('selectCharacter', (data) => {
    const room = getRoomBySocket(socket);
    const pr = profileOf(socket.id);
    if (room && room.players[socket.id] && CHARACTERS[data.characterKey] && pr && pr.ownedChars.includes(data.characterKey)) {
      const p = room.players[socket.id];
      p.characterKey = data.characterKey;
      p.skinId = pr.equippedSkin[data.characterKey] || 'default';
      io.to(room.code).emit('characterUpdated', { players: room.players });
    }
  });

  socket.on('sendStamp', (data) => {
    const room = getRoomBySocket(socket);
    const pr = profileOf(socket.id);
    if (!room || !room.players[socket.id] || !pr || !data) return;
    const id = data.emoteId;
    if (!EMOTES[id] || !pr.ownedEmotes.includes(id)) return;
    const p = room.players[socket.id];
    const now = Date.now();
    if (now - p.lastStamp < 300) return;
    p.lastStamp = now;
    io.to(room.code).emit('stampTriggered', { socketId: socket.id, emoteId: id });
  });

  socket.on('toggleReady', () => {
    const room = getRoomBySocket(socket);
    if (room && room.mode === 'online') {
      const p = room.players[socket.id];
      if (p) {
        p.ready = !p.ready;
        io.to(room.code).emit('characterUpdated', { players: room.players });
        const playerList = Object.values(room.players);
        const allReady = playerList.length >= 2 && playerList.every(player => player.ready);
        if (allReady) {
          if (room.countdownTimer) clearInterval(room.countdownTimer);
          room.countdownVal = 3;
          io.to(room.code).emit('countdownUpdate', { count: room.countdownVal });
          room.countdownTimer = setInterval(() => {
            room.countdownVal--;
            if (room.countdownVal > 0) {
              io.to(room.code).emit('countdownUpdate', { count: room.countdownVal });
            } else {
              clearInterval(room.countdownTimer);
              room.countdownTimer = null;
              startMatch(room);
            }
          }, 1000);
        } else if (room.countdownTimer) {
          clearInterval(room.countdownTimer);
          room.countdownTimer = null;
          io.to(room.code).emit('countdownCancel');
        }
      }
    }
  });

  socket.on('triggerSpecial', () => {
    const room = getRoomBySocket(socket);
    if (!room || room.gameState !== 'PLAYING') return;
    const p = room.players[socket.id];
    if (!p || p.isKilled || p.barrierTimer > 0 || p.hasBarrel) return;
    trySpecial(room, p);
  });

  socket.on('triggerBarrier', () => {
    const room = getRoomBySocket(socket);
    if (!room || room.gameState !== 'PLAYING') return;
    const p = room.players[socket.id];
    if (!p || p.isKilled || p.barrierCooldown > 0 || p.barrierTimer > 0) return;
    p.barrierTimer = 60; p.barrierCooldown = 180;
    io.to(room.code).emit('barrierTriggered', { playerId: p.id });
  });

  socket.on('playerInput', (input) => {
    const room = getRoomBySocket(socket);
    if (!room || room.gameState !== 'PLAYING' || !input) return;
    const p = room.players[socket.id];
    if (!p || p.stunFrames > 0 || p.isKilled || p.barrierTimer > 0 || p.chargeT > 0) return;

    const char = CH(p);
    const st = STAGES[room.selectedStage] || STAGES[1];
    const speedMult = p.buffSpeedTimer > 0 ? 1.4 : 1.0;

    let v = 0;
    if (input.left) { v = -char.speed * speedMult; p.facing = 'left'; }
    else if (input.right) { v = char.speed * speedMult; p.facing = 'right'; }
    p.inputVx = v;
    if (!st.ice) p.vx = v;
    p.downPressed = !!input.down;

    if (input.jump && !input.jumpPrev) {
      if (p.isGrounded) {
        p.vy = -char.jumpPower; p.isGrounded = false; p.standingOn = null; p.jumpCount = 1;
      } else if (char.type === 'ninja' && p.jumpCount < 2) {
        p.vy = -char.jumpPower * 0.9; p.jumpCount = 2;
      }
    }

    if (input.attack) {
      if (p.hasBarrel) {
        p.hasBarrel = false;
        const isRight = p.facing === 'right';
        room.projectiles.push({
          id: Date.now() + Math.random(), ownerId: p.id, type: 'thrown_barrel',
          x: isRight ? p.x + char.width : p.x - 36, y: p.y + 10, vx: isRight ? 12 : -12, vy: -6, width: 36, height: 40
        });
        io.to(room.code).emit('barrelThrown', { playerId: p.id });
        return;
      }
      doBasicAttack(room, p, input.attackType === 'kick' ? 'kick' : 'punch');
    }
  });

  socket.on('requestRematch', () => {
    const room = getRoomBySocket(socket);
    if (room && room.gameState === 'FINISHED' && room.mode !== 'story') {
      if (room.mode === 'cpu') {
        startMatch(room);
      } else {
        room.gameState = 'LOBBY';
        room.items = []; room.projectiles = []; room.hazards = []; room.spawnedItemCount = 0;
        Object.values(room.players).forEach(p => { p.ready = false; });
        io.to(room.code).emit('gameState', { state: 'LOBBY', players: room.players, isCpuMode: false, code: room.code, selectedStage: room.selectedStage });
      }
    }
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket);
    delete tokenBySocket[socket.id];
    if (room) {
      if (room.countdownTimer) clearInterval(room.countdownTimer);
      delete room.players[socket.id];
      const humans = Object.values(room.players).filter(p => !p.isCpu);
      if (humans.length === 0) {
        delete rooms[room.code];
      } else {
        room.gameState = 'LOBBY';
        if (room.isCpuMode) {
          Object.keys(room.players).forEach(id => { if (room.players[id].isCpu) delete room.players[id]; });
          room.isCpuMode = false; room.mode = 'online';
        }
        Object.values(room.players).forEach(p => { p.ready = false; });
        io.to(room.code).emit('playerLeft');
      }
    }
  });
});

/* =====================================================================
   メインループ (60fps)
   ===================================================================== */
const GROUND_Y = 520;

function updateHazards(room, st, playersArr) {
  if (st.hazard && room.tick > 60 && room.tick % st.hazard.interval === 0) {
    const alive = playersArr.filter(p => !p.isKilled);
    if (alive.length) {
      const tgt = alive[Math.floor(Math.random() * alive.length)];
      const cx = Math.random() < 0.6 ? tgt.x + CH(tgt).width / 2 : 100 + Math.random() * (room.stageWidth - 200);
      const kinds = st.hazard.kinds || [st.hazard.kind];
      room.hazards.push({ id: Math.random(), kind: kinds[Math.floor(Math.random() * kinds.length)], x: cx, w: 90, t: 0, warn: 70, active: 18, damage: st.hazard.damage || 20, ownerId: null, hit: {} });
    }
  }
  for (let i = room.hazards.length - 1; i >= 0; i--) {
    const h = room.hazards[i];
    h.t++;
    if (h.t >= h.warn && h.t < h.warn + h.active) {
      const owner = h.ownerId ? room.players[h.ownerId] : null;
      playersArr.forEach(p => {
        if (p.isKilled || h.hit[p.id]) return;
        if (h.ownerId && (!owner || !isFoe(owner, p))) return;
        const ch = CH(p), sc = scaleOf(p), cw = ch.width * sc, chh = ch.height * sc;
        if (p.x + cw > h.x - h.w / 2 && p.x < h.x + h.w / 2) {
          if (h.kind === 'geyser' && p.y + chh < GROUND_Y - 340) return;
          h.hit[p.id] = true;
          damagePlayer(room, owner, p, h.damage, (p.x + cw / 2 > h.x) ? 1 : -1, { stun: 18, knockVy: -12, knockVx: 6 });
        }
      });
    }
    if (h.t >= h.warn + h.active) room.hazards.splice(i, 1);
  }
}

function updateProjectiles(room, playersArr, W) {
  const code = room.code;
  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const proj = room.projectiles[i];
    const owner = room.players[proj.ownerId] || null;

    if (proj.type === 'thrown_barrel') {
      proj.x += proj.vx; proj.vy += 0.5; proj.y += proj.vy;
      const hitGround = proj.y + proj.height >= GROUND_Y;
      let hitTarget = false;
      for (const target of playersArr) {
        if (!target || target.id === proj.ownerId || target.isKilled) continue;
        if (owner && !isFoe(owner, target)) continue;
        const tChar = CH(target), sc = scaleOf(target);
        if (proj.x < target.x + tChar.width * sc && proj.x + proj.width > target.x &&
            proj.y < target.y + tChar.height * sc && proj.y + proj.height > target.y) { hitTarget = true; break; }
      }
      if (hitGround || hitTarget) {
        const ownerChar = owner ? CH(owner) : CHARACTERS.futsuo;
        const radius = Math.max(70, (ownerChar.width * (owner && owner.senobicTimer > 0 ? 2 : 1)) * 1.5);
        const expX = proj.x + proj.width / 2, expY = proj.y + proj.height / 2;
        io.to(code).emit('barrelExploded', { x: expX, y: expY, radius });
        playersArr.forEach(p => {
          if (!p || p.isKilled || p.invincibleFrames > 0) return;
          if (owner && p.id !== owner.id && teamOf(p) === teamOf(owner)) return;
          const pc = CH(p), ps = scaleOf(p);
          const pcX = p.x + pc.width * ps / 2, pcY = p.y + pc.height * ps / 2;
          if (Math.hypot(pcX - expX, pcY - expY) <= radius) {
            damagePlayer(room, owner, p, 40, pcX > expX ? 1 : -1, { stun: 20, knockVy: -10, knockVx: 16, koVx: 26, inv: 30, ignoreArmor: true, noGauge: true });
          }
        });
        room.projectiles.splice(i, 1);
      }
      continue;
    }

    proj.x += proj.vx;
    if (proj.vy) proj.y += proj.vy;
    if (proj.life !== undefined) { proj.life--; if (proj.life <= 0) { room.projectiles.splice(i, 1); continue; } }
    if (proj.x < -150 || proj.x > W + 150 || proj.y > 700 || proj.y < -200) { room.projectiles.splice(i, 1); continue; }

    for (const target of playersArr) {
      if (!target || target.id === proj.ownerId || target.isKilled || target.invincibleFrames > 0) continue;
      if (owner && !isFoe(owner, target)) continue;
      const tc = CH(target), ds = scaleOf(target);
      if (proj.x < target.x + tc.width * ds && proj.x + (proj.width || 40) > target.x &&
          proj.y < target.y + tc.height * ds && proj.y + (proj.height || 95) > target.y) {
        const res = damagePlayer(room, owner, target, proj.damage, proj.vx > 0 ? 1 : -1, {});
        if (res && !proj.pierce) { room.projectiles.splice(i, 1); break; }
      }
    }
  }
}

function updateItems(room, playersArr) {
  const code = room.code;
  for (let i = room.items.length - 1; i >= 0; i--) {
    const item = room.items[i];
    if (!item.isGrounded) {
      item.y += item.vy;
      if (item.y + item.height >= GROUND_Y) { item.y = GROUND_Y - item.height; item.isGrounded = true; }
    }
    for (const p of playersArr) {
      if (!p || p.isKilled) continue;
      const char = CH(p), sc = scaleOf(p);
      if (p.x < item.x + item.width && p.x + char.width * sc > item.x && p.y < item.y + item.height && p.y + char.height * sc > item.y) {
        if (item.type === 'barrel') p.hasBarrel = true;
        else if (item.type === 'senobic') { p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3)); p.senobicTimer = 480; }
        else if (item.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + 30);
        else if (item.type === 'atk') p.buffAtkTimer = 360;
        io.to(code).emit('itemCollected', { playerId: p.id, type: item.type });
        room.items.splice(i, 1);
        break;
      }
    }
  }
}

function updatePlayers(room, playersArr, st, GRAV, W) {
  const code = room.code;
  playersArr.forEach(p => {
    if (!p) return;
    if (p.attackCooldown > 0) p.attackCooldown--;
    if (p.buffAtkTimer > 0) p.buffAtkTimer--;
    if (p.buffSpeedTimer > 0) p.buffSpeedTimer--;
    if (p.senobicTimer > 0) p.senobicTimer--;
    if (p.specialActiveTimer > 0) p.specialActiveTimer--;
    if (p.barrierTimer > 0) { p.barrierTimer--; if (p.barrierTimer === 0) p.stunFrames = 18; }
    if (p.barrierCooldown > 0) p.barrierCooldown--;

    if (p.isKilled) {
      p.x += p.vx; p.y += p.vy; p.killTimer++;
      if (p.killTimer > 90) {
        if (p.lives > 0) {
          respawnPlayer(p, W);
        } else {
          const alive = playersArr.filter(pl => pl.lives > 0);
          const teams = new Set(alive.map(teamOf));
          if (teams.size <= 1) endMatch(room, alive[0] || p);
        }
      }
      return;
    }

    const char = CH(p);
    const scale = scaleOf(p);
    const curW = char.width * scale, curH = char.height * scale;

    if (p.stunFrames > 0) { p.stunFrames--; p.vx = 0; }
    if (p.invincibleFrames > 0) p.invincibleFrames--;
    if (p.barrierTimer > 0) p.vx = 0;

    if (p.standingOn !== null && room.platforms[p.standingOn]) p.x += room.platforms[p.standingOn].dx || 0;

    if (st.ice && p.stunFrames <= 0 && p.barrierTimer <= 0 && !(p.chargeT > 0)) {
      p.vx += ((p.inputVx || 0) - p.vx) * (p.isGrounded ? 0.06 : 0.015);
    }

    const prevY = p.y;
    p.vy += GRAV;
    if (p.vy > 26) p.vy = 26;
    p.x += p.vx + (!p.isGrounded && room.wind ? room.wind : 0);
    p.y += p.vy;

    p.wasGrounded = p.isGrounded;
    p.isGrounded = false;
    p.standingOn = null;

    if (p.y + curH >= GROUND_Y) {
      p.y = GROUND_Y - curH; p.vy = 0; p.isGrounded = true; p.jumpCount = 0;
      if (room.conveyor) p.x += room.conveyor;
    }

    if (p.vy >= 0 && !p.downPressed) {
      room.platforms.forEach((plat, i) => {
        if (p.x + curW > plat.x && p.x < plat.x + plat.width && prevY + curH <= plat.y + 1 && p.y + curH >= plat.y) {
          p.y = plat.y - curH; p.vy = 0; p.isGrounded = true; p.jumpCount = 0; p.standingOn = i;
        }
      });
    }

    if (!p.wasGrounded && p.isGrounded && p.debugonSpecialArmed) {
      p.debugonSpecialArmed = false;
      p.attackBox = { x: p.x - 140, y: p.y - 20, width: curW + 280, height: curH + 40, damage: Math.round(char.atk * 2.5), type: 'special_shockwave' };
      setTimeout(() => { if (p.attackBox) p.attackBox = null; }, 300);
      io.to(code).emit('specialTriggered', { playerId: p.id, type: 'debugon_fire' });
    }

    if (p.x < 0) p.x = 0;
    if (p.x + curW > W) p.x = W - curW;
  });
}

function updateAttackBoxes(room, playersArr) {
  playersArr.forEach(att => {
    if (!att || att.isKilled || !att.attackBox) return;
    const ab = att.attackBox;
    playersArr.forEach(def => {
      if (!isFoe(att, def) || def.isKilled || def.invincibleFrames > 0) return;
      const dc = CH(def), ds = scaleOf(def);
      if (ab.x < def.x + dc.width * ds && ab.x + ab.width > def.x && ab.y < def.y + dc.height * ds && ab.y + ab.height > def.y) {
        const opts = {};
        if (ab.type === 'special_drain') opts.heal = 0.8;
        damagePlayer(room, att, def, ab.damage, att.facing === 'right' ? 1 : -1, opts);
      }
    });
  });
}

function tickRoom(room) {
  const st = STAGES[room.selectedStage] || STAGES[1];
  const playersArr = Object.values(room.players);
  if (playersArr.length < 2) return;
  const W = room.stageWidth || 1200;
  const GRAV = st.gravity || 0.8;

  room.tick++;
  if (Math.random() < (st.itemRate || 0.002)) spawnRandomItem(room);
  computePlatforms(room, st);
  room.conveyor = st.conveyor ? st.conveyor * (Math.sin(room.tick / 360) >= 0 ? 1 : -1) : 0;
  room.wind = st.wind ? st.wind * Math.sin(room.tick / 200) : 0;

  updateHazards(room, st, playersArr);
  playersArr.forEach(p => { if (p.isCpu) updateAI(room, p, playersArr, st); });
  updateProjectiles(room, playersArr, W);
  updateItems(room, playersArr);
  updatePlayers(room, playersArr, st, GRAV, W);
  updateAttackBoxes(room, playersArr);

  io.to(room.code).emit('updateState', {
    players: room.players, items: room.items, projectiles: room.projectiles,
    platforms: room.platforms,
    hazards: room.hazards.map(h => ({ id: h.id, kind: h.kind, x: h.x, w: h.w, t: h.t, warn: h.warn, active: h.active })),
    wind: room.wind, conveyor: room.conveyor
  });
}

setInterval(() => {
  for (const code in rooms) {
    const room = rooms[code];
    if (room.gameState !== 'PLAYING') continue;
    try { tickRoom(room); } catch (e) { console.error('tick error', e); }
  }
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
