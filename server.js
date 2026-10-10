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
  futsuo: { name: 'フツオ (普通)', hp: 100, atk: 10, speed: 7, jumpPower: 17, width: 50, height: 90, type: 'futsuo' },
  debugon: { name: 'デブゴン (デブ)', hp: 150, atk: 18, speed: 4, jumpPower: 13, width: 75, height: 95, type: 'debugon' },
  garinoshin: { name: 'ガリノシン (ガリ)', hp: 70, atk: 8, speed: 11, jumpPower: 22, width: 35, height: 105, type: 'garinoshin' },
  chibikoro: { name: 'チビコロ (チビデブ)', hp: 120, atk: 12, speed: 5.5, jumpPower: 14, width: 65, height: 60, type: 'chibikoro' },
  hime: { name: 'ヒメ (女)', hp: 85, atk: 14, speed: 9, jumpPower: 18, width: 45, height: 85, type: 'hime' }
};

let rooms = {};

function createRoom(roomId) {
  return {
    id: roomId,
    players: {},
    gameState: 'LOBBY',
    isCpuMode: false
  };
}

io.on('connection', (socket) => {
  let assignedRoomId = null;
  for (let id in rooms) {
    if (!rooms[id].isCpuMode && Object.keys(rooms[id].players).length < 2 && rooms[id].gameState === 'LOBBY') {
      assignedRoomId = id;
      break;
    }
  }

  if (!assignedRoomId) {
    assignedRoomId = 'room_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    rooms[assignedRoomId] = createRoom(assignedRoomId);
  }

  const room = rooms[assignedRoomId];
  const playerNum = Object.keys(room.players).length === 0 ? 1 : 2;

  room.players[socket.id] = {
    id: socket.id,
    playerNum: playerNum,
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
    invincibleFrames: 0
  };

  socket.join(assignedRoomId);
  socket.emit('init', { roomId: assignedRoomId, playerNum: playerNum, characters: CHARACTERS });
  io.to(assignedRoomId).emit('gameState', { state: room.gameState, players: room.players, isCpuMode: room.isCpuMode });

  // CPU対戦モードの切り替え
  socket.on('startCpuMode', () => {
    room.isCpuMode = true;
    
    // CPUプレイヤーをPlayer 2として登録
    const cpuKeys = Object.keys(CHARACTERS);
    const randomCpuChar = cpuKeys[Math.floor(Math.random() * cpuKeys.length)];

    room.players['cpu_player'] = {
      id: 'cpu_player',
      playerNum: 2,
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
      invincibleFrames: 0
    };

    const p = room.players[socket.id];
    if (p) p.ready = true;

    room.gameState = 'PLAYING';

    Object.values(room.players).forEach(pl => {
      const char = CHARACTERS[pl.characterKey];
      pl.hp = char.hp;
      pl.maxHp = char.hp;
      pl.x = pl.playerNum === 1 ? 200 : 1000 - 200 - char.width;
      pl.y = 450 - char.height;
      pl.vx = 0;
      pl.vy = 0;
      pl.facing = pl.playerNum === 1 ? 'right' : 'left';
      pl.stunFrames = 0;
      pl.invincibleFrames = 0;
    });

    io.to(assignedRoomId).emit('gameStart', { players: room.players });
  });

  socket.on('selectCharacter', (data) => {
    const p = room.players[socket.id];
    if (p) {
      p.characterKey = data.characterKey;
      io.to(assignedRoomId).emit('characterUpdated', { players: room.players });
    }
  });

  socket.on('toggleReady', () => {
    const p = room.players[socket.id];
    if (p && !room.isCpuMode) {
      p.ready = !p.ready;
      io.to(assignedRoomId).emit('characterUpdated', { players: room.players });

      const playerList = Object.values(room.players);
      const allReady = playerList.length === 2 && playerList.every(player => player.ready);

      if (allReady) {
        room.gameState = 'PLAYING';
        playerList.forEach(pl => {
          const char = CHARACTERS[pl.characterKey];
          pl.hp = char.hp;
          pl.maxHp = char.hp;
          pl.x = pl.playerNum === 1 ? 200 : 1000 - 200 - char.width;
          pl.y = 450 - char.height;
          pl.vx = 0;
          pl.vy = 0;
          pl.facing = pl.playerNum === 1 ? 'right' : 'left';
          pl.stunFrames = 0;
          pl.invincibleFrames = 0;
        });

        io.to(assignedRoomId).emit('gameStart', { players: room.players });
      }
    }
  });

  socket.on('playerInput', (input) => {
    if (room.gameState !== 'PLAYING') return;
    const p = room.players[socket.id];
    if (!p || p.stunFrames > 0) return;

    const char = CHARACTERS[p.characterKey];

    if (input.left) {
      p.vx = -char.speed;
      p.facing = 'left';
    } else if (input.right) {
      p.vx = char.speed;
      p.facing = 'right';
    } else {
      p.vx = 0;
    }

    if (input.jump && p.isGrounded) {
      p.vy = -char.jumpPower;
      p.isGrounded = false;
    }

    if (input.attack && !p.attacking) {
      p.attacking = true;
      p.attackType = input.attackType;
      
      const isPunch = input.attackType === 'punch';
      const reach = isPunch ? 50 : 80;
      const attackHeight = isPunch ? char.height * 0.4 : char.height * 0.3;
      const attackYOffset = isPunch ? char.height * 0.2 : char.height * 0.4;

      p.attackBox = {
        x: p.facing === 'right' ? p.x + char.width : p.x - reach,
        y: p.y + attackYOffset,
        width: reach,
        height: attackHeight,
        damage: isPunch ? char.atk : Math.round(char.atk * 1.3),
        type: input.attackType
      };

      setTimeout(() => { p.attackBox = null; }, 120);
      setTimeout(() => { p.attacking = false; }, 300);
    }
  });

  socket.on('requestRematch', () => {
    if (room.gameState === 'FINISHED') {
      room.gameState = 'LOBBY';
      if (room.isCpuMode) {
        delete room.players['cpu_player'];
        room.isCpuMode = false;
      }
      Object.values(room.players).forEach(p => { p.ready = false; });
      io.to(assignedRoomId).emit('gameState', { state: 'LOBBY', players: room.players, isCpuMode: false });
    }
  });

  socket.on('disconnect', () => {
    delete room.players[socket.id];
    if (Object.keys(room.players).filter(id => id !== 'cpu_player').length === 0) {
      delete rooms[assignedRoomId];
    } else {
      room.gameState = 'LOBBY';
      if (room.isCpuMode) {
        delete room.players['cpu_player'];
        room.isCpuMode = false;
      }
      const remainingPlayer = Object.values(room.players)[0];
      if (remainingPlayer) remainingPlayer.ready = false;
      io.to(assignedRoomId).emit('playerLeft');
    }
  });
});

// CPU AIの簡単な思考ルーチン
function updateCpuAI(cpu, target) {
  if (!cpu || !target || cpu.stunFrames > 0) return;

  const cpuChar = CHARACTERS[cpu.characterKey];
  const distance = (target.x + CHARACTERS[target.characterKey].width / 2) - (cpu.x + cpuChar.width / 2);

  // 向きの設定
  cpu.facing = distance > 0 ? 'right' : 'left';

  // 接近行動
  if (Math.abs(distance) > 60) {
    cpu.vx = distance > 0 ? cpuChar.speed * 0.8 : -cpuChar.speed * 0.8;
  } else {
    cpu.vx = 0;
  }

  // 1/60の確率でジャンプ
  if (Math.random() < 0.02 && cpu.isGrounded) {
    cpu.vy = -cpuChar.jumpPower;
    cpu.isGrounded = false;
  }

  // 近接時の攻撃判断
  if (Math.abs(distance) <= 80 && !cpu.attacking && Math.random() < 0.08) {
    cpu.attacking = true;
    const isPunch = Math.random() < 0.6;
    cpu.attackType = isPunch ? 'punch' : 'kick';

    const reach = isPunch ? 50 : 80;
    const attackHeight = isPunch ? cpuChar.height * 0.4 : cpuChar.height * 0.3;
    const attackYOffset = isPunch ? cpuChar.height * 0.2 : cpuChar.height * 0.4;

    cpu.attackBox = {
      x: cpu.facing === 'right' ? cpu.x + cpuChar.width : cpu.x - reach,
      y: cpu.y + attackYOffset,
      width: reach,
      height: attackHeight,
      damage: isPunch ? cpuChar.atk : Math.round(cpuChar.atk * 1.3),
      type: cpu.attackType
    };

    setTimeout(() => { cpu.attackBox = null; }, 120);
    setTimeout(() => { cpu.attacking = false; }, 350);
  }
}

setInterval(() => {
  const STAGE_WIDTH = 1000;
  const GROUND_Y = 450;
  const GRAVITY = 0.8;

  for (let roomId in rooms) {
    const room = rooms[roomId];
    if (room.gameState !== 'PLAYING') continue;

    const playerIds = Object.keys(room.players);
    if (playerIds.length < 2) continue;

    const p1 = room.players[playerIds[0]];
    const p2 = room.players[playerIds[1]];

    if (room.isCpuMode && p2 && p2.isCpu && p1) {
      updateCpuAI(p2, p1);
    }

    const playersArr = [p1, p2];

    playersArr.forEach(p => {
      if (!p) return;
      const char = CHARACTERS[p.characterKey];

      if (p.stunFrames > 0) {
        p.stunFrames--;
        p.vx = 0;
      }

      if (p.invincibleFrames > 0) {
        p.invincibleFrames--;
      }

      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;

      if (p.y + char.height >= GROUND_Y) {
        p.y = GROUND_Y - char.height;
        p.vy = 0;
        p.isGrounded = true;
      } else {
        p.isGrounded = false;
      }

      if (p.x < 0) p.x = 0;
      if (p.x + char.width > STAGE_WIDTH) p.x = STAGE_WIDTH - char.width;
    });

    playersArr.forEach((attacker) => {
      if (!attacker) return;
      const defender = playersArr.find(p => p && p.id !== attacker.id);
      if (!defender) return;

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
          defender.stunFrames = 12;
          defender.invincibleFrames = 24;
          defender.vy = -5;
          defender.vx = attacker.facing === 'right' ? 10 : -10;

          attacker.attackBox = null;

          if (defender.hp <= 0) {
            defender.hp = 0;
            room.gameState = 'FINISHED';
            io.to(roomId).emit('gameOver', { winnerNum: attacker.playerNum });
          }
        }
      }
    });

    io.to(roomId).emit('updateState', { players: room.players });
  }
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
