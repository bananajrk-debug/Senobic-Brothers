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

// キャラクターデータ (比率と性能の標準化)
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
    gameState: 'LOBBY'
  };
}

io.on('connection', (socket) => {
  let assignedRoomId = null;
  for (let id in rooms) {
    if (Object.keys(rooms[id].players).length < 2 && rooms[id].gameState === 'LOBBY') {
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
    x: playerNum === 1 ? 200 : 900,
    y: 400,
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
  io.to(assignedRoomId).emit('gameState', { state: room.gameState, players: room.players });

  socket.on('selectCharacter', (data) => {
    const p = room.players[socket.id];
    if (p) {
      p.characterKey = data.characterKey;
      io.to(assignedRoomId).emit('characterUpdated', { players: room.players });
    }
  });

  socket.on('toggleReady', () => {
    const p = room.players[socket.id];
    if (p) {
      p.ready = !p.ready;
      io.to(assignedRoomId).emit('characterUpdated', { players: room.players });

      const playerList = Object.values(room.players);
      const allReady = playerList.length === 2 && playerList.every(player => player.ready);

      if (allReady) {
        room.gameState = 'PLAYING';
        playerList.forEach(p => {
          const char = CHARACTERS[p.characterKey];
          p.hp = char.hp;
          p.maxHp = char.hp;
          p.x = p.playerNum === 1 ? 200 : 1000 - 200 - char.width;
          p.y = 450 - char.height;
          p.vx = 0;
          p.vy = 0;
          p.facing = p.playerNum === 1 ? 'right' : 'left';
          p.stunFrames = 0;
          p.invincibleFrames = 0;
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
      Object.values(room.players).forEach(p => { p.ready = false; });
      io.to(assignedRoomId).emit('gameState', { state: 'LOBBY', players: room.players });
    }
  });

  socket.on('disconnect', () => {
    delete room.players[socket.id];
    if (Object.keys(room.players).length === 0) {
      delete rooms[assignedRoomId];
    } else {
      room.gameState = 'LOBBY';
      const remainingPlayer = Object.values(room.players)[0];
      if (remainingPlayer) remainingPlayer.ready = false;
      io.to(assignedRoomId).emit('playerLeft');
    }
  });
});

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
    const playersArr = [p1, p2];

    playersArr.forEach(p => {
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
      const defender = playersArr.find(p => p.id !== attacker.id);
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
