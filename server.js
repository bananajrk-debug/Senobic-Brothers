const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

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

const CHARACTERS = {
  futsuo:     { name: 'フツオ (ファイター)',   hp: 100, atk: 12, speed: 7.0, jumpPower: 17, width: 50, height: 90,  type: 'futsuo',     ability: 'パワーアップ覚醒(5秒)',   cd: 12 },
  debugon:    { name: 'デブゴン (ヘビー)',     hp: 140, atk: 16, speed: 5.0, jumpPower: 14.5, width: 75, height: 95,  type: 'debugon',    ability: '不屈のアーマー(着地衝撃波)', cd: 120 },
  chibikoro:  { name: 'チビコロ (ダイバー)',   hp: 110, atk: 13, speed: 6.0, jumpPower: 14, width: 65, height: 60,  type: 'chibikoro',  ability: '大爆発ボム', cd: 12 },
  ninja:      { name: 'ニンジャ (シノビ)',     hp: 85,  atk: 11, speed: 7.0, jumpPower: 17, width: 40, height: 90,  type: 'ninja',      ability: '手裏剣3連投', cd: 36 },
  wizard:     { name: 'ウィザード (メイジ)',   hp: 85,  atk: 13, speed: 7.0, jumpPower: 18, width: 45, height: 95,  type: 'wizard',     ability: '魔法弾3連投(確率硬直)', cd: 36 }
};

const STAGES = {
  1: { name: '平原 (PLAIN)', platforms: [{ x: 220, y: 410, width: 200, height: 18 }, { x: 780, y: 410, width: 200, height: 18 }, { x: 500, y: 280, width: 200, height: 18 }] },
  2: { name: '浮島 (ISLANDS)', platforms: [{ x: 180, y: 400, width: 220, height: 20 }, { x: 800, y: 400, width: 220, height: 20 }, { x: 490, y: 270, width: 220, height: 20 }] },
  3: { name: 'スリル (DOOM)', platforms: [{ x: 350, y: 390, width: 500, height: 22 }] },
  4: { name: '神殿 (TEMPLE)', platforms: [{ x: 220, y: 410, width: 200, height: 18, type: 'gold' }, { x: 780, y: 410, width: 200, height: 18, type: 'gold' }, { x: 500, y: 280, width: 200, height: 18, type: 'gold' }] },
  5: { name: '宇宙 (SPACE)', platforms: [{ x: 150, y: 420, width: 250, height: 16, type: 'neon' }, { x: 800, y: 420, width: 250, height: 16, type: 'neon' }, { x: 460, y: 290, width: 280, height: 16, type: 'neon' }] }
};

let rooms = {};

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[code]);
  return code;
}

function createRoom(code) {
  return {
    code: code,
    players: {},
    items: [],
    projectiles: [],
    spawnedItemCount: 0,
    gameState: 'LOBBY',
    isCpuMode: false,
    selectedStage: 1,
    countdownTimer: null,
    countdownVal: 0
  };
}

function getRoomBySocket(socket) {
  for (let code in rooms) {
    if (rooms[code].players[socket.id]) return rooms[code];
  }
  return null;
}

io.on('connection', (socket) => {
  socket.on('createRoom', (data) => {
    const code = generateRoomCode();
    rooms[code] = createRoom(code);
    const room = rooms[code];
    room.players[socket.id] = createPlayerData(socket.id, 1, data.playerName || 'Player 1');

    socket.join(code);
    socket.emit('roomCreated', { code: code, playerNum: 1, characters: CHARACTERS, stages: STAGES });
    io.to(code).emit('gameState', { state: room.gameState, players: room.players, isCpuMode: false, code: code, selectedStage: room.selectedStage });
  });

  socket.on('joinRoom', (data) => {
    const code = data.code;
    const room = rooms[code];

    if (!room) {
      socket.emit('joinError', '部屋が見つかりません。');
      return;
    }

    if (Object.keys(room.players).length >= 4 || room.isCpuMode) {
      socket.emit('joinError', '部屋が満員です (最大4人)。');
      return;
    }

    const assignedNum = Object.keys(room.players).length + 1;
    room.players[socket.id] = createPlayerData(socket.id, assignedNum, data.playerName || `Player ${assignedNum}`);

    socket.join(code);
    socket.emit('roomJoined', { code: code, playerNum: assignedNum, characters: CHARACTERS, stages: STAGES });
    io.to(code).emit('gameState', { state: room.gameState, players: room.players, isCpuMode: false, code: code, selectedStage: room.selectedStage });
  });

  socket.on('startCpuMode', (data) => {
    const code = generateRoomCode();
    rooms[code] = createRoom(code);
    const room = rooms[code];
    room.isCpuMode = true;
    room.selectedStage = data.stageId || 1;

    room.players[socket.id] = createPlayerData(socket.id, 1, data.playerName || 'Player 1');
    room.players[socket.id].characterKey = data.characterKey || 'futsuo';

    const cpuKeys = Object.keys(CHARACTERS);
    const randomCpuChar = cpuKeys[Math.floor(Math.random() * cpuKeys.length)];

    room.players['cpu_player'] = createPlayerData('cpu_player', 2, 'CPU');
    room.players['cpu_player'].characterKey = randomCpuChar;
    room.players['cpu_player'].isCpu = true;
    room.players['cpu_player'].ready = true;
    room.players['cpu_player'].x = 850;
    room.players['cpu_player'].facing = 'left';

    room.players[socket.id].ready = true;
    socket.join(code);
    socket.emit('roomCreated', { code: code, playerNum: 1, characters: CHARACTERS, stages: STAGES });
    startMatch(room);
  });

  socket.on('selectStage', (data) => {
    const room = getRoomBySocket(socket);
    if (room && room.players[socket.id] && room.players[socket.id].playerNum === 1) {
      room.selectedStage = data.stageId;
      io.to(room.code).emit('stageUpdated', { selectedStage: room.selectedStage });
    }
  });

  socket.on('updateName', (data) => {
    const room = getRoomBySocket(socket);
    if (room && room.players[socket.id]) {
      room.players[socket.id].name = data.name || `Player ${room.players[socket.id].playerNum}`;
      io.to(room.code).emit('characterUpdated', { players: room.players });
    }
  });

  socket.on('selectCharacter', (data) => {
    const room = getRoomBySocket(socket);
    if (room && room.players[socket.id]) {
      room.players[socket.id].characterKey = data.characterKey;
      io.to(room.code).emit('characterUpdated', { players: room.players });
    }
  });

  socket.on('sendStamp', (data) => {
    const room = getRoomBySocket(socket);
    if (room && room.players[socket.id]) {
      const p = room.players[socket.id];
      p.stamp = data.stamp;
      io.to(room.code).emit('stampTriggered', { socketId: socket.id, stamp: data.stamp });
      setTimeout(() => { if (p.stamp === data.stamp) p.stamp = null; }, 2000);
    }
  });

  socket.on('toggleReady', () => {
    const room = getRoomBySocket(socket);
    if (room && !room.isCpuMode) {
      const p = room.players[socket.id];
      if (p) {
        p.ready = !p.ready;
        io.to(room.code).emit('characterUpdated', { players: room.players });

        const playerList = Object.values(room.players);
        const activePlayers = playerList.slice(0, 2);
        const allReady = activePlayers.length === 2 && activePlayers.every(player => player.ready);

        if (allReady) {
          room.countdownVal = 3;
          io.to(room.code).emit('countdownUpdate', { count: room.countdownVal });

          room.countdownTimer = setInterval(() => {
            room.countdownVal--;
            if (room.countdownVal > 0) {
              io.to(room.code).emit('countdownUpdate', { count: room.countdownVal });
            } else {
              clearInterval(room.countdownTimer);
              startMatch(room);
            }
          }, 1000);
        } else {
          if (room.countdownTimer) {
            clearInterval(room.countdownTimer);
            room.countdownTimer = null;
            io.to(room.code).emit('countdownCancel');
          }
        }
      }
    }
  });

  socket.on('triggerSpecial', () => {
    const room = getRoomBySocket(socket);
    if (!room || room.gameState !== 'PLAYING') return;
    const p = room.players[socket.id];
    // 樽持ってる間は必殺技不可
    if (!p || p.isKilled || p.barrierTimer > 0 || p.hasBarrel) return;
    const char = CHARACTERS[p.characterKey];

    if (char.type === 'ninja') {
      if (p.ninjaSpecialShurikenCount > 0) {
        p.ninjaSpecialShurikenCount--;
        const isRight = p.facing === 'right';
        const shurikenSize = Math.round(char.width * 1.5);
        room.projectiles.push({
          id: Date.now() + Math.random(), ownerId: p.id, type: 'ninja_giant_yellow',
          x: isRight ? p.x + char.width : p.x - shurikenSize, y: p.y + char.height * 0.25,
          vx: isRight ? 18 : -18, width: shurikenSize, height: shurikenSize, damage: Math.round(char.atk * 1.5)
        });
        io.to(room.code).emit('specialTriggered', { playerId: p.id, type: 'ninja_throw' });
        if (p.ninjaSpecialShurikenCount <= 0) {
          p.specialReady = false;
          p.specialGauge = 0;
        }
      } else if (p.specialReady) {
        p.ninjaSpecialShurikenCount = 3;
        p.ninjaSpecialShurikenCount--;
        const isRight = p.facing === 'right';
        const shurikenSize = Math.round(char.width * 1.5);
        room.projectiles.push({
          id: Date.now() + Math.random(), ownerId: p.id, type: 'ninja_giant_yellow',
          x: isRight ? p.x + char.width : p.x - shurikenSize, y: p.y + char.height * 0.25,
          vx: isRight ? 18 : -18, width: shurikenSize, height: shurikenSize, damage: Math.round(char.atk * 1.5)
        });
        io.to(room.code).emit('specialTriggered', { playerId: p.id, type: 'ninja_ready' });
      }
      return;
    }

    if (char.type === 'wizard') {
      if (p.wizardSpecialMagicCount > 0) {
        p.wizardSpecialMagicCount--;
        const isRight = p.facing === 'right';
        room.projectiles.push({
          id: Date.now() + Math.random(), ownerId: p.id, type: 'wizard_mega_giant',
          x: isRight ? p.x + char.width : p.x - 90, y: p.y + char.height * 0.15,
          vx: isRight ? 14 : -14, width: 85, height: 85, damage: Math.round(char.atk * 2.0), pierce: true
        });
        io.to(room.code).emit('specialTriggered', { playerId: p.id, type: 'wizard_mega' });
        if (p.wizardSpecialMagicCount <= 0) {
          p.specialReady = false;
          p.specialGauge = 0;
        }
      } else if (p.specialReady) {
        p.wizardSpecialMagicCount = 3;
        p.wizardSpecialMagicCount--;
        const isRight = p.facing === 'right';
        room.projectiles.push({
          id: Date.now() + Math.random(), ownerId: p.id, type: 'wizard_mega_giant',
          x: isRight ? p.x + char.width : p.x - 90, y: p.y + char.height * 0.15,
          vx: isRight ? 14 : -14, width: 85, height: 85, damage: Math.round(char.atk * 2.0), pierce: true
        });
        io.to(room.code).emit('specialTriggered', { playerId: p.id, type: 'wizard_mega' });
      }
      return;
    }

    if (!p.specialReady) return;
    p.specialReady = false;
    p.specialGauge = 0;

    if (char.type === 'futsuo') {
      p.specialActiveTimer = 300; // 5秒
      io.to(room.code).emit('specialTriggered', { playerId: p.id, type: 'futsuo' });
    } else if (char.type === 'debugon') {
      p.debugonSpecialArmed = true;
      io.to(room.code).emit('specialTriggered', { playerId: p.id, type: 'debugon_ready' });
    } else if (char.type === 'chibikoro') {
      p.attackBox = { x: p.x - 140, y: p.y - 90, width: char.width + 280, height: char.height + 180, damage: 55, type: 'special_bomb' };
      setTimeout(() => { if (p.attackBox) p.attackBox = null; }, 300);
      io.to(room.code).emit('specialTriggered', { playerId: p.id, type: 'chibikoro_mega' });
    }
  });

  socket.on('triggerBarrier', () => {
    const room = getRoomBySocket(socket);
    if (!room || room.gameState !== 'PLAYING') return;
    const p = room.players[socket.id];
    if (!p || p.isKilled || p.barrierCooldown > 0 || p.barrierTimer > 0) return;

    p.barrierTimer = 60;
    p.barrierCooldown = 180;
    io.to(room.code).emit('barrierTriggered', { playerId: p.id });
  });

  socket.on('playerInput', (input) => {
    const room = getRoomBySocket(socket);
    if (!room || room.gameState !== 'PLAYING') return;

    const p = room.players[socket.id];
    if (!p || p.stunFrames > 0 || p.isKilled || p.barrierTimer > 0) return;

    const char = CHARACTERS[p.characterKey];
    let speedMult = p.buffSpeedTimer > 0 ? 1.4 : 1.0;

    if (input.left) {
      p.vx = -char.speed * speedMult;
      p.facing = 'left';
    } else if (input.right) {
      p.vx = char.speed * speedMult;
      p.facing = 'right';
    } else {
      p.vx = 0;
    }

    p.downPressed = input.down;

    if (input.jump && !input.jumpPrev) {
      if (p.isGrounded) {
        p.vy = -char.jumpPower;
        p.isGrounded = false;
        p.jumpCount = 1;
      } else if (char.type === 'ninja' && p.jumpCount < 2) {
        p.vy = -char.jumpPower * 0.9;
        p.jumpCount = 2;
      }
    }

    if (input.attack) {
      // 爆弾樽を持っている場合、投げる処理
      if (p.hasBarrel) {
        p.hasBarrel = false;
        const isRight = p.facing === 'right';
        room.projectiles.push({
          id: Date.now() + Math.random(),
          ownerId: p.id,
          type: 'thrown_barrel',
          x: isRight ? p.x + char.width : p.x - 36,
          y: p.y + 10,
          vx: isRight ? 12 : -12,
          vy: -6,
          width: 36,
          height: 40
        });
        io.to(room.code).emit('barrelThrown', { playerId: p.id });
        return;
      }

      // 通常攻撃処理
      if (!p.attacking && p.attackCooldown <= 0) {
        const isPunch = input.attackType === 'punch';
        
        p.attacking = true;
        p.attackType = input.attackType;
        
        // キックのクールダウンを1秒 (60フレーム) に設定
        if (isPunch) {
          p.attackCooldown = char.cd || 12;
        } else {
          p.attackCooldown = 60; // 1秒間冷却
        }

        let atkMult = p.buffAtkTimer > 0 ? 1.5 : 1.0;
        if (p.senobicTimer > 0) atkMult = 1.8;
        if (p.specialActiveTimer > 0 && char.type === 'futsuo') atkMult *= 1.5;

        let dmg = Math.round((isPunch ? char.atk : Math.round(char.atk * 1.25)) * atkMult);

        if (char.type === 'ninja' || char.type === 'wizard') {
          const isRight = p.facing === 'right';
          const startX = isRight ? p.x + (char.width * (p.senobicTimer > 0 ? 2 : 1)) : p.x - 30;
          const startY = p.y + (char.height * (p.senobicTimer > 0 ? 2 : 1)) * 0.4;
          const projSpeed = char.type === 'ninja' ? 16 : 12;

          room.projectiles.push({
            id: Date.now() + Math.random(),
            ownerId: p.id,
            type: char.type,
            x: startX,
            y: startY,
            vx: isRight ? projSpeed : -projSpeed,
            width: 26,
            height: 22,
            damage: dmg
          });
        } else {
          let reach = isPunch ? 55 : 85;
          if (p.specialActiveTimer > 0 && char.type === 'futsuo') reach *= 2;

          const isGiant = p.senobicTimer > 0;
          let attackHeight = (isPunch ? char.height * 0.4 : char.height * 0.3) * (isGiant ? 2.2 : 1);
          let attackYOffset = isGiant ? (char.height * 2 - attackHeight - 10) : (isPunch ? char.height * 0.2 : char.height * 0.4);

          if (char.type === 'chibikoro' && !p.isGrounded) {
            p.vy = 22;
            dmg = Math.round(18 * atkMult);
            reach = 100;
          }

          p.attackBox = {
            x: p.facing === 'right' ? p.x + (char.width * (isGiant ? 2 : 1)) : p.x - (reach * (isGiant ? 1.5 : 1)),
            y: p.y + attackYOffset,
            width: reach * (isGiant ? 1.5 : 1),
            height: attackHeight,
            damage: dmg,
            type: input.attackType
          };

          setTimeout(() => { p.attackBox = null; }, 140);
        }

        setTimeout(() => { p.attacking = false; }, 200);
      }
    }
  });

  socket.on('requestRematch', () => {
    const room = getRoomBySocket(socket);
    if (room && room.gameState === 'FINISHED') {
      if (room.isCpuMode) {
        startMatch(room);
      } else {
        room.gameState = 'LOBBY';
        room.items = [];
        room.projectiles = [];
        room.spawnedItemCount = 0;
        Object.values(room.players).forEach(p => { p.ready = false; });
        io.to(room.code).emit('gameState', { state: 'LOBBY', players: room.players, isCpuMode: false, code: room.code, selectedStage: room.selectedStage });
      }
    }
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket);
    if (room) {
      if (room.countdownTimer) clearInterval(room.countdownTimer);
      delete room.players[socket.id];
      if (Object.keys(room.players).filter(id => id !== 'cpu_player').length === 0) {
        delete rooms[room.code];
      } else {
        room.gameState = 'LOBBY';
        if (room.isCpuMode) {
          delete room.players['cpu_player'];
          room.isCpuMode = false;
        }
        const remainingPlayer = Object.values(room.players)[0];
        if (remainingPlayer) remainingPlayer.ready = false;
        io.to(room.code).emit('playerLeft');
      }
    }
  });
});

function startMatch(room) {
  room.gameState = 'PLAYING';
  room.items = [];
  room.projectiles = [];
  room.spawnedItemCount = 0;

  Object.values(room.players).forEach(pl => {
    const char = CHARACTERS[pl.characterKey];
    pl.hp = char.hp;
    pl.maxHp = char.hp;
    pl.lives = 3;
    pl.x = pl.playerNum === 1 ? 250 : 1200 - 250 - char.width;
    pl.y = 520 - char.height;
    pl.vx = 0;
    pl.vy = 0;
    pl.facing = pl.playerNum === 1 ? 'right' : 'left';
    pl.jumpCount = 0;
    pl.stamp = null;
    pl.isKilled = false;
    pl.killTimer = 0;
    pl.buffAtkTimer = 0;
    pl.buffSpeedTimer = 0;
    pl.senobicTimer = 0;
    pl.attackCooldown = 0;
    pl.specialGauge = 0;
    pl.specialActiveTimer = 0;
    pl.specialReady = false;
    pl.debugonSpecialArmed = false;
    pl.ninjaSpecialShurikenCount = 0;
    pl.wizardSpecialMagicCount = 0;
    pl.barrierTimer = 0;
    pl.barrierCooldown = 0;
    pl.downPressed = false;
    pl.hasBarrel = false;
  });
  io.to(room.code).emit('gameStart', { players: room.players, selectedStage: room.selectedStage, isCpuMode: room.isCpuMode });
}

function createPlayerData(socketId, playerNum, name) {
  return {
    id: socketId,
    playerNum: playerNum,
    name: name,
    characterKey: 'futsuo',
    ready: false,
    isCpu: false,
    x: playerNum === 1 ? 250 : 850,
    y: 400,
    vx: 0,
    vy: 0,
    facing: playerNum === 1 ? 'right' : 'left',
    hp: 100,
    maxHp: 100,
    lives: 3,
    isGrounded: false,
    wasGrounded: false,
    attacking: false,
    attackCooldown: 0,
    attackType: null,
    attackBox: null,
    stunFrames: 0,
    invincibleFrames: 0,
    jumpCount: 0,
    stamp: null,
    isKilled: false,
    killTimer: 0,
    buffAtkTimer: 0,
    buffSpeedTimer: 0,
    senobicTimer: 0,
    specialGauge: 0,
    specialActiveTimer: 0,
    specialReady: false,
    debugonSpecialArmed: false,
    ninjaSpecialShurikenCount: 0,
    wizardSpecialMagicCount: 0,
    barrierTimer: 0,
    barrierCooldown: 0,
    downPressed: false,
    hasBarrel: false
  };
}

function respawnPlayer(p) {
  const char = CHARACTERS[p.characterKey];
  p.hp = p.maxHp;
  p.x = p.playerNum === 1 ? 250 : 1200 - 250 - char.width;
  p.y = 100;
  p.vx = 0;
  p.vy = 0;
  p.isKilled = false;
  p.killTimer = 0;
  p.invincibleFrames = 120;
  p.hasBarrel = false;
}

function updateCpuAI(cpu, target) {
  if (!cpu || !target || cpu.stunFrames > 0 || cpu.isKilled || cpu.barrierTimer > 0) return;

  const cpuChar = CHARACTERS[cpu.characterKey];
  const distance = (target.x + CHARACTERS[target.characterKey].width / 2) - (cpu.x + cpuChar.width / 2);

  cpu.facing = distance > 0 ? 'right' : 'left';
  let speedMult = cpu.buffSpeedTimer > 0 ? 1.4 : 1.0;

  if (Math.abs(distance) > 75) {
    cpu.vx = distance > 0 ? cpuChar.speed * 0.55 * speedMult : -cpuChar.speed * 0.55 * speedMult;
  } else {
    cpu.vx = 0;
  }

  if (Math.random() < 0.008 && cpu.isGrounded) {
    cpu.vy = -cpuChar.jumpPower;
    cpu.isGrounded = false;
  }

  if (cpu.hasBarrel) {
    // 樽を持ってたら投げる
    let roomRef = null;
    for (let c in rooms) { if (rooms[c].players[cpu.id]) { roomRef = rooms[c]; break; } }
    cpu.hasBarrel = false;
    const isRight = cpu.facing === 'right';
    roomRef?.projectiles.push({
      id: Date.now() + Math.random(), ownerId: cpu.id, type: 'thrown_barrel',
      x: isRight ? cpu.x + cpuChar.width : cpu.x - 36, y: cpu.y + 10,
      vx: isRight ? 12 : -12, vy: -6, width: 36, height: 40
    });
    return;
  }

  if (cpu.specialReady) {
    cpu.specialReady = false;
    cpu.specialGauge = 0;
    if (cpuChar.type === 'futsuo') cpu.specialActiveTimer = 300;
    else if (cpuChar.type === 'debugon') cpu.debugonSpecialArmed = true;
    else if (cpuChar.type === 'wizard') cpu.wizardSpecialMagicCount = 3;
  }

  if (cpu.barrierCooldown <= 0 && Math.random() < 0.01) {
    cpu.barrierTimer = 60;
    cpu.barrierCooldown = 180;
  }

  if (Math.abs(distance) <= 300 && !cpu.attacking && cpu.attackCooldown <= 0 && Math.random() < 0.038) {
    cpu.attacking = true;
    const isPunch = Math.random() < 0.7;
    cpu.attackType = isPunch ? 'punch' : 'kick';
    cpu.attackCooldown = isPunch ? (cpuChar.cd || 12) : 60;

    let atkMult = cpu.buffAtkTimer > 0 ? 1.5 : (cpu.senobicTimer > 0 ? 1.8 : 1.0);
    let dmg = Math.round((isPunch ? cpuChar.atk : Math.round(cpuChar.atk * 1.25)) * atkMult);

    if (cpuChar.type === 'ninja' || cpuChar.type === 'wizard') {
      const isRight = cpu.facing === 'right';
      const projSpeed = cpuChar.type === 'ninja' ? 16 : 12;

      let roomRef = null;
      for (let c in rooms) { if (rooms[c].players[cpu.id]) { roomRef = rooms[c]; break; } }

      roomRef?.projectiles.push({
        id: Date.now() + Math.random(), ownerId: cpu.id, type: cpuChar.type,
        x: isRight ? cpu.x + cpuChar.width : cpu.x - 30, y: cpu.y + cpuChar.height * 0.35,
        vx: isRight ? projSpeed : -projSpeed, width: 26, height: 22, damage: dmg
      });
    } else {
      let reach = isPunch ? 55 : 85;
      const attackHeight = isPunch ? cpuChar.height * 0.4 : cpuChar.height * 0.3;
      const attackYOffset = isPunch ? cpuChar.height * 0.2 : cpuChar.height * 0.4;

      cpu.attackBox = {
        x: cpu.facing === 'right' ? cpu.x + cpuChar.width : cpu.x - reach,
        y: cpu.y + attackYOffset, width: reach, height: attackHeight, damage: dmg, type: cpu.attackType
      };

      setTimeout(() => { cpu.attackBox = null; }, 120);
    }

    setTimeout(() => { cpu.attacking = false; }, 200);
  }
}

// スピードブーツ（speed）を廃止し、爆弾樽（barrel）を追加
function spawnRandomItem(room) {
  if (room.items.length >= 1) return;
  if (room.spawnedItemCount >= 4) return;

  const rand = Math.random();
  let type = 'heal';
  if (rand < 0.05) type = 'senobic';       // 5%
  else if (rand < 0.35) type = 'barrel';    // 爆弾樽 30%
  else if (rand < 0.65) type = 'heal';      // 回復 30%
  else type = 'atk';                       // 攻撃UP 35%

  room.items.push({
    id: Date.now() + Math.random(),
    type: type,
    x: 150 + Math.random() * 900,
    y: -40,
    vy: 2.5,
    width: type === 'barrel' ? 36 : 45,
    height: type === 'barrel' ? 40 : 45,
    isGrounded: false
  });
  room.spawnedItemCount++;
}

setInterval(() => {
  const STAGE_WIDTH = 1200;
  const GROUND_Y = 520;
  const GRAVITY = 0.8;

  for (let code in rooms) {
    const room = rooms[code];
    if (room.gameState !== 'PLAYING') continue;

    const playerIds = Object.keys(room.players);
    if (playerIds.length < 2) continue;

    const p1 = room.players[playerIds[0]];
    const p2 = room.players[playerIds[1]];
    const playersArr = [p1, p2];

    if (Math.random() < 0.0015) spawnRandomItem(room);

    if (room.isCpuMode && p2 && p2.isCpu && p1) {
      updateCpuAI(p2, p1);
    }

    // 飛び道具・投擲物処理
    for (let i = room.projectiles.length - 1; i >= 0; i--) {
      const proj = room.projectiles[i];

      // 投擲樽の放物線移動
      if (proj.type === 'thrown_barrel') {
        proj.x += proj.vx;
        proj.vy += 0.5;
        proj.y += proj.vy;

        // 地面着地で爆発
        let hitGround = proj.y + proj.height >= GROUND_Y;
        let hitTarget = false;

        const target = playersArr.find(p => p && p.id !== proj.ownerId && !p.isKilled);
        if (target) {
          const tChar = CHARACTERS[target.characterKey];
          const scale = target.senobicTimer > 0 ? 2 : 1;
          if (
            proj.x < target.x + tChar.width * scale &&
            proj.x + proj.width > target.x &&
            proj.y < target.y + tChar.height * scale &&
            proj.y + proj.height > target.y
          ) {
            hitTarget = true;
          }
        }

        if (hitGround || hitTarget) {
          const owner = playersArr.find(p => p && p.id === proj.ownerId);
          const ownerChar = owner ? CHARACTERS[owner.characterKey] : CHARACTERS['futsuo'];
          const explosionRadius = (ownerChar.width * (owner && owner.senobicTimer > 0 ? 2 : 1)) * 1.5; // 直径＝幅の3倍

          const expX = proj.x + proj.width / 2;
          const expY = proj.y + proj.height / 2;

          io.to(code).emit('barrelExploded', { x: expX, y: expY, radius: explosionRadius });

          // 範囲ダメージ処理
          playersArr.forEach(p => {
            if (!p || p.isKilled || p.invincibleFrames > 0) return;
            const pChar = CHARACTERS[p.characterKey];
            const pScale = p.senobicTimer > 0 ? 2 : 1;
            const pcX = p.x + (pChar.width * pScale) / 2;
            const pcY = p.y + (pChar.height * pScale) / 2;
            const dist = Math.hypot(pcX - expX, pcY - expY);

            if (dist <= explosionRadius) {
              if (p.barrierTimer > 0) return;

              p.hp -= 40;
              if (p.hp <= 0) {
                p.hp = 0;
                p.lives--;
                p.isKilled = true;
                p.killTimer = 0;
                p.vx = pcX > expX ? 26 : -26;
                p.vy = -20;
                spawnRandomItem(room);
                io.to(code).emit('koEffect', { victimId: p.id, x: p.x, y: p.y });
              } else {
                p.stunFrames = 20;
                p.vy = -10;
                p.vx = pcX > expX ? 16 : -16;
              }
              p.invincibleFrames = 30;
            }
          });

          room.projectiles.splice(i, 1);
          continue;
        }
      } else {
        // 通常の弾処理
        proj.x += proj.vx;
        if (proj.x < -100 || proj.x > STAGE_WIDTH + 100) {
          room.projectiles.splice(i, 1);
          continue;
        }

        const target = playersArr.find(p => p && p.id !== proj.ownerId && !p.isKilled);
        const attacker = playersArr.find(p => p && p.id === proj.ownerId);

        if (target && target.invincibleFrames === 0) {
          const targetChar = CHARACTERS[target.characterKey];
          const defScale = target.senobicTimer > 0 ? 2 : 1;
          const db = { x: target.x, y: target.y, width: targetChar.width * defScale, height: targetChar.height * defScale };

          if (
            proj.x < db.x + db.width &&
            proj.x + (proj.width || 40) > db.x &&
            proj.y < db.y + db.height &&
            proj.y + (proj.height || 95) > db.y
          ) {
            if (target.barrierTimer > 0) {
              if (!proj.pierce) room.projectiles.splice(i, 1);
              continue;
            }

            target.hp -= proj.damage;
            if (attacker && !attacker.isKilled && attacker.specialGauge < 100) {
              attacker.specialGauge = Math.min(100, attacker.specialGauge + 10);
              if (attacker.specialGauge >= 100) attacker.specialReady = true;
            }

            const isArmored = (targetChar.type === 'debugon' && target.attacking) || target.senobicTimer > 0;
            const attackerChar = attacker ? CHARACTERS[attacker.characterKey] : null;

            if (target.hp <= 0) {
              target.hp = 0;
              target.lives--;
              target.isKilled = true;
              target.killTimer = 0;
              target.vx = proj.vx > 0 ? 24 : -24;
              target.vy = -20;
              spawnRandomItem(room);
              io.to(code).emit('koEffect', { victimId: target.id, x: target.x, y: target.y });
            } else if (!isArmored) {
              if (attackerChar && attackerChar.type === 'wizard' && Math.random() < 1 / 3) {
                target.stunFrames = 30;
              } else {
                target.stunFrames = 10;
              }
              target.vy = -5;
              target.vx = proj.vx > 0 ? 12 : -12;
            }

            target.invincibleFrames = 24;
            if (!proj.pierce) room.projectiles.splice(i, 1);
          }
        }
      }
    }

    for (let i = room.items.length - 1; i >= 0; i--) {
      const item = room.items[i];
      if (!item.isGrounded) {
        item.y += item.vy;
        if (item.y + item.height >= GROUND_Y) {
          item.y = GROUND_Y - item.height;
          item.isGrounded = true;
        }
      }

      playersArr.forEach(p => {
        if (!p || p.isKilled) return;
        const char = CHARACTERS[p.characterKey];
        const scale = p.senobicTimer > 0 ? 2 : 1;
        const curW = char.width * scale;
        const curH = char.height * scale;

        if (
          p.x < item.x + item.width &&
          p.x + curW > item.x &&
          p.y < item.y + item.height &&
          p.y + curH > item.y
        ) {
          if (item.type === 'barrel') {
            p.hasBarrel = true;
          } else if (item.type === 'senobic') {
            p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3));
            p.senobicTimer = 480;
          } else if (item.type === 'heal') {
            p.hp = Math.min(p.maxHp, p.hp + 30);
          } else if (item.type === 'atk') {
            p.buffAtkTimer = 360;
          }

          io.to(code).emit('itemCollected', { playerId: p.id, type: item.type });
          room.items.splice(i, 1);
        }
      });
    }

    const currentPlatforms = STAGES[room.selectedStage].platforms;

    playersArr.forEach(p => {
      if (!p) return;

      if (p.attackCooldown > 0) p.attackCooldown--;
      if (p.buffAtkTimer > 0) p.buffAtkTimer--;
      if (p.buffSpeedTimer > 0) p.buffSpeedTimer--;
      if (p.senobicTimer > 0) p.senobicTimer--;
      if (p.specialActiveTimer > 0) p.specialActiveTimer--;
      
      if (p.barrierTimer > 0) {
        p.barrierTimer--;
        if (p.barrierTimer === 0) {
          p.stunFrames = 18;
        }
      }
      if (p.barrierCooldown > 0) p.barrierCooldown--;

      if (p.isKilled) {
        p.x += p.vx;
        p.y += p.vy;
        p.killTimer++;

        if (p.killTimer > 90) {
          if (p.lives > 0) {
            respawnPlayer(p);
          } else {
            const winner = playersArr.find(pl => pl && pl.id !== p.id);
            room.gameState = 'FINISHED';
            io.to(code).emit('gameOver', { winnerName: winner.name, winnerNum: winner.playerNum, isCpuMode: room.isCpuMode });
          }
        }
        return;
      }

      const char = CHARACTERS[p.characterKey];
      const scale = p.senobicTimer > 0 ? 2 : 1;
      const curW = char.width * scale;
      const curH = char.height * scale;

      if (p.stunFrames > 0) {
        p.stunFrames--;
        p.vx = 0;
      }

      if (p.invincibleFrames > 0) {
        p.invincibleFrames--;
      }

      if (p.barrierTimer > 0) {
        p.vx = 0;
      }

      const prevY = p.y;
      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;

      p.wasGrounded = p.isGrounded;
      p.isGrounded = false;

      if (p.y + curH >= GROUND_Y) {
        p.y = GROUND_Y - curH;
        p.vy = 0;
        p.isGrounded = true;
        p.jumpCount = 0;
      }

      if (p.vy >= 0 && !p.downPressed) {
        currentPlatforms.forEach(plat => {
          if (
            p.x + curW > plat.x &&
            p.x < plat.x + plat.width &&
            prevY + curH <= plat.y &&
            p.y + curH >= plat.y
          ) {
            p.y = plat.y - curH;
            p.vy = 0;
            p.isGrounded = true;
            p.jumpCount = 0;
          }
        });
      }

      if (!p.wasGrounded && p.isGrounded && p.debugonSpecialArmed) {
        p.debugonSpecialArmed = false;
        p.attackBox = {
          x: p.x - 140,
          y: p.y - 20,
          width: curW + 280,
          height: curH + 40,
          damage: Math.round(char.atk * 2.5),
          type: 'special_shockwave'
        };
        setTimeout(() => { if (p.attackBox) p.attackBox = null; }, 300);
        io.to(code).emit('specialTriggered', { playerId: p.id, type: 'debugon_fire' });
      }

      if (p.x < 0) p.x = 0;
      if (p.x + curW > STAGE_WIDTH) {
        p.x = STAGE_WIDTH - curW;
      }
    });

    playersArr.forEach((attacker) => {
      if (!attacker || attacker.isKilled) return;
      const defender = playersArr.find(p => p && p.id !== attacker.id);
      if (!defender || defender.isKilled) return;

      const defenderChar = CHARACTERS[defender.characterKey];
      const attackerChar = CHARACTERS[attacker.characterKey];
      const defScale = defender.senobicTimer > 0 ? 2 : 1;

      if (attacker.attackBox && defender.invincibleFrames === 0) {
        const ab = attacker.attackBox;
        const db = { x: defender.x, y: defender.y, width: defenderChar.width * defScale, height: defenderChar.height * defScale };

        if (
          ab.x < db.x + db.width &&
          ab.x + ab.width > db.x &&
          ab.y < db.y + db.height &&
          ab.y + ab.height > db.y
        ) {
          if (defender.barrierTimer > 0) {
            attacker.attackBox = null;
            return;
          }

          defender.hp -= ab.damage;
          if (attacker.specialGauge < 100) {
            attacker.specialGauge = Math.min(100, attacker.specialGauge + 10);
            if (attacker.specialGauge >= 100) attacker.specialReady = true;
          }

          const isArmored = (defenderChar.type === 'debugon' && defender.attacking) || defender.senobicTimer > 0;

          if (defender.hp <= 0) {
            defender.hp = 0;
            defender.lives--;
            defender.isKilled = true;
            defender.killTimer = 0;
            defender.vx = attacker.facing === 'right' ? 24 : -24;
            defender.vy = -20;
            spawnRandomItem(room);
            io.to(code).emit('koEffect', { victimId: defender.id, x: defender.x, y: defender.y });
          } else if (!isArmored) {
            if (attackerChar.type === 'wizard' && Math.random() < 1 / 3) {
              defender.stunFrames = 30;
            } else {
              defender.stunFrames = 10;
            }
            defender.vy = -5;
            defender.vx = attacker.facing === 'right' ? 12 : -12;
          }

          defender.invincibleFrames = 24;
          attacker.attackBox = null;
        }
      }
    });

    io.to(code).emit('updateState', { players: room.players, items: room.items, projectiles: room.projectiles });
  }
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
