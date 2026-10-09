const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
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

// ゲームマスターデータ
const CHARACTERS = {
  futsuo: { name: 'フツオ (普通)', hp: 100, atk: 10, speed: 8, jumpPower: 18, width: 60, height: 100, type: 'futsuo', color: '#3498db' },
  debugon: { name: 'デブゴン (デブ)', hp: 150, atk: 18, speed: 4.5, jumpPower: 14, width: 90, height: 110, type: 'debugon', color: '#e67e22' },
  garinoshin: { name: 'ガリノシン (ガリ)', hp: 70, atk: 8, speed: 12, jumpPower: 23, width: 40, height: 120, type: 'garinoshin', color: '#9b59b6' },
  chibikoro: { name: 'チビコロ (チビデブ)', hp: 120, atk: 12, speed: 6, jumpPower: 15, width: 75, height: 65, type: 'chibikoro', color: '#e74c3c' },
  hime: { name: 'ヒメ (女)', hp: 85, atk: 14, speed: 10, jumpPower: 19, width: 50, height: 95, type: 'hime', color: '#e84393' }
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
    if (Object.keys(rooms[id].players).length < 2 && (rooms[id].gameState === 'LOBBY' || rooms[id].gameState === 'WAITING')) {
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
    selected: false,
    ready: false,
    x: playerNum === 1 ? 250 : 950,
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
    invincibleFrames: 0,
    hitEffect: null
  };

  socket.join(assignedRoomId);
  socket.emit('init', { roomId: assignedRoomId, playerNum: playerNum, characters: CHARACTERS });

  io.to(assignedRoomId).emit('gameState', { state: room.gameState, players: room.players });

  socket.on('selectCharacter', (data) => {
    const p = room.players[socket.id];
    if (p) {
      p.characterKey = data.characterKey;
      p.selected = true;
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
          p.x = p.playerNum === 1 ? 250 : 1200 - 250 - char.width;
          p.y = 500 - char.height;
          p.vx = 0;
          p.vy = 0;
          p.facing = p.playerNum === 1 ? 'right' : 'left';
          p.stunFrames = 0;
          p.invincibleFrames = 0;
          p.hitEffect = null;
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
      const reach = isPunch ? 70 : 100;
      const attackHeight = isPunch ? char.height * 0.5 : char.height * 0.4;
      const attackYOffset = isPunch ? char.height * 0.2 : char.height * 0.4;

      p.attackBox = {
        x: p.facing === 'right' ? p.x + char.width : p.x - reach,
        y: p.y + attackYOffset,
        width: reach,
        height: attackHeight,
        damage: isPunch ? char.atk : Math.round(char.atk * 1.3),
        type: input.attackType
      };

      setTimeout(() => {
        p.attackBox = null;
      }, 150);

      setTimeout(() => {
        p.attacking = false;
      }, 350);
    }
  });

  socket.on('requestRematch', () => {
    if (room.gameState === 'FINISHED') {
      room.gameState = 'LOBBY';
      Object.values(room.players).forEach(p => {
        p.ready = false;
      });
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
  const STAGE_WIDTH = 1200;
  const GROUND_Y = 500;
  const GRAVITY = 0.9;

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

      if (p.hitEffect) {
        p.hitEffect.timer--;
        if (p.hitEffect.timer <= 0) p.hitEffect = null;
      }

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
        const db = {
          x: defender.x,
          y: defender.y,
          width: defenderChar.width,
          height: defenderChar.height
        };

        if (
          ab.x < db.x + db.width &&
          ab.x + ab.width > db.x &&
          ab.y < db.y + db.height &&
          ab.y + ab.height > db.y
        ) {
          defender.hp -= ab.damage;
          defender.stunFrames = 15;
          defender.invincibleFrames = 28;
          defender.vy = -6;
          defender.vx = attacker.facing === 'right' ? 12 : -12;

          defender.hitEffect = {
            x: ab.x + ab.width / 2,
            y: ab.y + ab.height / 2,
            timer: 12
          };

          attacker.attackBox = null;

          if (defender.hp <= 0) {
            defender.hp = 0;
            room.gameState = 'FINISHED';
            io.to(roomId).emit('gameOver', { winnerNum: attacker.playerNum });
          }
        }
      }
    });

    io.to(roomId).emit('updateState', {
      players: room.players
    });
  }
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
