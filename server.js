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

// キャラクターマスターデータ
const CHARACTERS = {
  futsuo: { name: 'フツオ (普通)', hp: 100, atk: 10, speed: 7, jumpPower: 17, width: 50, height: 90, type: 'futsuo', ability: 'バランス万能（低硬直）' },
  debugon: { name: 'デブゴン (デブ)', hp: 150, atk: 18, speed: 4, jumpPower: 13, width: 75, height: 95, type: 'debugon', ability: 'スーパーアーマー（攻撃中不屈）' },
  garinoshin: { name: 'ガリノシン (ガリ)', hp: 70, atk: 8, speed: 11, jumpPower: 21, width: 35, height: 105, type: 'garinoshin', ability: '2段ジャンプ' },
  chibikoro: { name: 'チビコロ (チビデブ)', hp: 120, atk: 12, speed: 5.5, jumpPower: 14, width: 65, height: 60, type: 'chibikoro', ability: '空中急降下アタック' },
  hime: { name: 'ヒメ (女)', hp: 85, atk: 14, speed: 9, jumpPower: 18, width: 45, height: 85, type: 'hime', ability: '無敵回避バックステップ' }
};

// ステージ定義
const STAGES = {
  1: { name: '平原 (PLAIN)', platforms: [] },
  2: { name: '浮島 (ISLANDS)', platforms: [
      { x: 150, y: 320, width: 200, height: 15 },
      { x: 650, y: 320, width: 200, height: 15 },
      { x: 400, y: 220, width: 200, height: 15 }
    ]
  },
  3: { name: 'スリル (DOOM)', platforms: [
      { x: 300, y: 330, width: 400, height: 15 }
    ]
  }
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
    gameState: 'LOBBY',
    isCpuMode: false,
    selectedStage: 1,
    countdownTimer: null,
    countdownVal: 0
  };
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
      socket.emit('joinError', '部屋が見つかりません。番号を確認してください。');
      return;
    }

    if (Object.keys(room.players).length >= 2 || room.isCpuMode) {
      socket.emit('joinError', '部屋が満員です。');
      return;
    }

    room.players[socket.id] = createPlayerData(socket.id, 2, data.playerName || 'Player 2');

    socket.join(code);
    socket.emit('roomJoined', { code: code, playerNum: 2, characters: CHARACTERS, stages: STAGES });
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

    room.players['cpu_player'] = {
      id: 'cpu_player',
      playerNum: 2,
      name: 'CPU',
      characterKey: randomCpuChar,
      ready: true,
      isCpu: true,
      x: 700,
      y: 350,
      vx: 0,
      vy: 0,
      facing: 'left',
      hp: CHARACTERS[randomCpuChar].hp,
      maxHp: CHARACTERS[randomCpuChar].hp,
      isGrounded: false,
      attacking: false,
      attackType: null,
      attackBox: null,
      stunFrames: 0,
      invincibleFrames: 0,
      jumpCount: 0,
      stamp: null,
      isKilled: false,
      killTimer: 0,
      buffAtkTimer: 0,
      buffSpeedTimer: 0
    };

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

      setTimeout(() => {
        if (p.stamp === data.stamp) p.stamp = null;
      }, 2000);
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
        const allReady = playerList.length === 2 && playerList.every(player => player.ready);

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

  socket.on('playerInput', (input) => {
    const room = getRoomBySocket(socket);
    if (!room || room.gameState !== 'PLAYING') return;

    const p = room.players[socket.id];
    if (!p || p.stunFrames > 0 || p.isKilled) return;

    const char = CHARACTERS[p.characterKey];
    let speedMult = p.buffSpeedTimer > 0 ? 1.5 : 1.0;

    if (input.left) {
      p.vx = -char.speed * speedMult;
      p.facing = 'left';
    } else if (input.right) {
      p.vx = char.speed * speedMult;
      p.facing = 'right';
    } else {
      p.vx = 0;
    }

    if (input.jump && !input.jumpPrev) {
      if (p.isGrounded) {
        p.vy = -char.jumpPower;
        p.isGrounded = false;
        p.jumpCount = 1;
      } else if (char.type === 'garinoshin' && p.jumpCount < 2) {
        p.vy = -char.jumpPower * 0.9;
        p.jumpCount = 2;
      }
    }

    if (input.attack && !p.attacking) {
      p.attacking = true;
      p.attackType = input.attackType;

      const isPunch = input.attackType === 'punch';
      let reach = isPunch ? 50 : 80;
      let attackHeight = isPunch ? char.height * 0.4 : char.height * 0.3;
      let attackYOffset = isPunch ? char.height * 0.2 : char.height * 0.4;
      let atkMult = p.buffAtkTimer > 0 ? 1.8 : 1.0;
      let dmg = Math.round((isPunch ? char.atk : Math.round(char.atk * 1.3)) * atkMult);

      if (char.type === 'chibikoro' && !p.isGrounded) {
        p.vy = 20;
        dmg = Math.round(20 * atkMult);
        reach = 90;
      } else if (char.type === 'hime') {
        p.vx = p.facing === 'right' ? -12 : 12;
        p.invincibleFrames = 12;
      }

      p.attackBox = {
        x: p.facing === 'right' ? p.x + char.width : p.x - reach,
        y: p.y + attackYOffset,
        width: reach,
        height: attackHeight,
        damage: dmg,
        type: input.attackType
      };

      setTimeout(() => { p.attackBox = null; }, 140);
      setTimeout(() => { p.attacking = false; }, 320);
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
  Object.values(room.players).forEach(pl => {
    const char = CHARACTERS[pl.characterKey];
    pl.hp = char.hp;
    pl.maxHp = char.hp;
    pl.x = pl.playerNum === 1 ? 200 : 1000 - 200 - char.width;
    pl.y = 450 - char.height;
    pl.vx = 0;
    pl.vy = 0;
    pl.facing = pl.playerNum === 1 ? 'right' : 'left';
    pl.jumpCount = 0;
    pl.stamp = null;
    pl.isKilled = false;
    pl.killTimer = 0;
    pl.buffAtkTimer = 0;
    pl.buffSpeedTimer = 0;
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
    x: playerNum === 1 ? 200 : 700,
    y: 350,
    vx: 0,
    vy: 0,
    facing: playerNum === 1 ? 'right' : 'left',
    hp: 100,
    maxHp: 100,
    isGrounded: false,
    attacking: false,
    attackType: null,
    attackBox: null,
    stunFrames: 0,
    invincibleFrames: 0,
    jumpCount: 0,
    stamp: null,
    isKilled: false,
    killTimer: 0,
    buffAtkTimer: 0,
    buffSpeedTimer: 0
  };
}

function getRoomBySocket(socket) {
  for (let code in rooms) {
    if (rooms[code].players[socket.id]) return rooms[code];
  }
  return null;
}

function updateCpuAI(cpu, target) {
  if (!cpu || !target || cpu.stunFrames > 0 || cpu.isKilled) return;

  const cpuChar = CHARACTERS[cpu.characterKey];
  const distance = (target.x + CHARACTERS[target.characterKey].width / 2) - (cpu.x + cpuChar.width / 2);

  cpu.facing = distance > 0 ? 'right' : 'left';

  let speedMult = cpu.buffSpeedTimer > 0 ? 1.5 : 1.0;

  if (Math.abs(distance) > 70) {
    cpu.vx = distance > 0 ? cpuChar.speed * 0.5 * speedMult : -cpuChar.speed * 0.5 * speedMult;
  } else {
    cpu.vx = 0;
  }

  if (Math.random() < 0.008 && cpu.isGrounded) {
    cpu.vy = -cpuChar.jumpPower;
    cpu.isGrounded = false;
  }

  if (Math.abs(distance) <= 75 && !cpu.attacking && Math.random() < 0.035) {
    cpu.attacking = true;
    const isPunch = Math.random() < 0.7;
    cpu.attackType = isPunch ? 'punch' : 'kick';

    const reach = isPunch ? 50 : 80;
    const attackHeight = isPunch ? cpuChar.height * 0.4 : cpuChar.height * 0.3;
    const attackYOffset = isPunch ? cpuChar.height * 0.2 : cpuChar.height * 0.4;

    let atkMult = cpu.buffAtkTimer > 0 ? 1.8 : 1.0;

    cpu.attackBox = {
      x: cpu.facing === 'right' ? cpu.x + cpuChar.width : cpu.x - reach,
      y: cpu.y + attackYOffset,
      width: reach,
      height: attackHeight,
      damage: Math.round((isPunch ? cpuChar.atk : Math.round(cpuChar.atk * 1.3)) * atkMult),
      type: cpu.attackType
    };

    setTimeout(() => { cpu.attackBox = null; }, 120);
    setTimeout(() => { cpu.attacking = false; }, 500);
  }
}

function spawnRandomItem(room) {
  if (room.items.length >= 1) return;
  const types = ['heal', 'atk', 'speed'];
  const type = types[Math.floor(Math.random() * types.length)];
  room.items.push({
    id: Date.now() + Math.random(),
    type: type,
    x: 100 + Math.random() * 800,
    y: -30,
    vy: 2.5,
    width: 30,
    height: 30,
    isGrounded: false
  });
}

// メイン物理ループ
setInterval(() => {
  const STAGE_WIDTH = 1000;
  const GROUND_Y = 450;
  const GRAVITY = 0.8;

  for (let code in rooms) {
    const room = rooms[code];
    if (room.gameState !== 'PLAYING') continue;

    const playerIds = Object.keys(room.players);
    if (playerIds.length < 2) continue;

    const p1 = room.players[playerIds[0]];
    const p2 = room.players[playerIds[1]];

    if (Math.random() < 0.0014) {
      spawnRandomItem(room);
    }

    if (room.isCpuMode && p2 && p2.isCpu && p1) {
      updateCpuAI(p2, p1);
    }

    const playersArr = [p1, p2];
    const currentPlatforms = STAGES[room.selectedStage].platforms;

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
        if (
          p.x < item.x + item.width &&
          p.x + char.width > item.x &&
          p.y < item.y + item.height &&
          p.y + char.height > item.y
        ) {
          if (item.type === 'heal') {
            p.hp = Math.min(p.maxHp, p.hp + 30);
          } else if (item.type === 'atk') {
            p.buffAtkTimer = 360;
          } else if (item.type === 'speed') {
            p.buffSpeedTimer = 360;
          }

          io.to(code).emit('itemCollected', { playerId: p.id, type: item.type });
          room.items.splice(i, 1);
        }
      });
    }

    playersArr.forEach(p => {
      if (!p) return;

      if (p.buffAtkTimer > 0) p.buffAtkTimer--;
      if (p.buffSpeedTimer > 0) p.buffSpeedTimer--;

      // スマブラ風・長めの吹き飛び演出処理
      if (p.isKilled) {
        p.x += p.vx;
        p.y += p.vy;
        p.killTimer++;

        // 一定時間経過、または十分に画面外へ飛んだらゲーム終了
        if (p.killTimer > 90 || p.x < -400 || p.x > STAGE_WIDTH + 400 || p.y < -500 || p.y > GROUND_Y + 500) {
          const winner = playersArr.find(pl => pl && pl.id !== p.id);
          room.gameState = 'FINISHED';
          io.to(code).emit('gameOver', { winnerName: winner.name, winnerNum: winner.playerNum, isCpuMode: room.isCpuMode });
        }
        return;
      }

      const char = CHARACTERS[p.characterKey];

      if (p.stunFrames > 0) {
        p.stunFrames--;
        p.vx = 0;
      }

      if (p.invincibleFrames > 0) {
        p.invincibleFrames--;
      }

      const prevY = p.y;
      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;

      p.isGrounded = false;

      if (p.y + char.height >= GROUND_Y) {
        p.y = GROUND_Y - char.height;
        p.vy = 0;
        p.isGrounded = true;
        p.jumpCount = 0;
      }

      if (p.vy >= 0) {
        currentPlatforms.forEach(plat => {
          if (
            p.x + char.width > plat.x &&
            p.x < plat.x + plat.width &&
            prevY + char.height <= plat.y &&
            p.y + char.height >= plat.y
          ) {
            p.y = plat.y - char.height;
            p.vy = 0;
            p.isGrounded = true;
            p.jumpCount = 0;
          }
        });
      }

      if (p.x < 0) p.x = 0;
      if (p.x + char.width > STAGE_WIDTH) p.x = STAGE_WIDTH - char.width;
    });

    playersArr.forEach((attacker) => {
      if (!attacker || attacker.isKilled) return;
      const defender = playersArr.find(p => p && p.id !== attacker.id);
      if (!defender || defender.isKilled) return;

      const defenderChar = CHARACTERS[defender.characterKey];

      if (attacker.attackBox && defender.invincibleFrames === 0) {
        const ab = attacker.attackBox;
        const db = { x: defender.x, y: defender.y, width: defenderChar.width, height: defenderChar.height };

        if (
          ab.x < db.x + db.width &&
          ab.x + ab.width > db.x &&
          ab.y < db.y + db.height &&
          ab.y + ab.height > db.y
        ) {
          defender.hp -= ab.damage;

          const isDebugonArmored = defenderChar.type === 'debugon' && defender.attacking;

          if (defender.hp <= 0) {
            defender.hp = 0;
            defender.isKilled = true;
            defender.killTimer = 0;
            // 豪快に画面外へぶっ飛ぶ初速
            defender.vx = attacker.facing === 'right' ? 22 : -22;
            defender.vy = -16;
            io.to(code).emit('koEffect', { victimId: defender.id, x: defender.x, y: defender.y });
          } else if (!isDebugonArmored) {
            defender.stunFrames = defenderChar.type === 'futsuo' ? 8 : 12;
            defender.vy = -5;
            defender.vx = attacker.facing === 'right' ? 10 : -10;
          }

          defender.invincibleFrames = 24;
          attacker.attackBox = null;
        }
      }
    });

    io.to(code).emit('updateState', { players: room.players, items: room.items });
  }
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
