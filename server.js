const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
  let currentRoomCode = null;

  socket.on('createRoom', (data) => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoomCode = code;
    socket.join(code);

    rooms[code] = {
      code: code,
      state: 'LOBBY',
      selectedStage: 1,
      players: {}
    };

    rooms[code].players[socket.id] = {
      id: socket.id,
      socketId: socket.id,
      playerNum: 1,
      name: data.playerName || 'Player 1',
      characterKey: 'futsuo',
      role: 'battle',
      ready: false,
      hp: 100,
      maxHp: 100,
      x: 200,
      y: 300,
      vx: 0,
      vy: 0,
      facing: 'right',
      isKilled: false,
      killTimer: 0,
      lives: 3,
      score: 0,
      invincibleFrames: 0,
      barrierTimer: 0,
      barrierCooldown: 0,
      hasBarrel: false,
      specialGauge: 0,
      specialActiveTimer: 0
    };

    socket.emit('roomCreated', { code: code, playerNum: 1 });
    io.to(code).emit('gameState', rooms[code]);
  });

  socket.on('joinRoom', (data) => {
    const room = rooms[data.code];
    if (!room) {
      socket.emit('joinError', '部屋が見つかりません。');
      return;
    }
    if (Object.keys(room.players).length >= 4) {
      socket.emit('joinError', '部屋が満員です。');
      return;
    }

    currentRoomCode = data.code;
    socket.join(data.code);

    const playerNum = Object.keys(room.players).length + 1;
    room.players[socket.id] = {
      id: socket.id,
      socketId: socket.id,
      playerNum: playerNum,
      name: data.playerName || `Player ${playerNum}`,
      characterKey: 'futsuo',
      role: 'battle',
      ready: false,
      hp: 100,
      maxHp: 100,
      x: 200 + (playerNum - 1) * 150,
      y: 300,
      vx: 0,
      vy: 0,
      facing: 'right',
      isKilled: false,
      killTimer: 0,
      lives: 3,
      score: 0,
      invincibleFrames: 0,
      barrierTimer: 0,
      barrierCooldown: 0,
      hasBarrel: false,
      specialGauge: 0,
      specialActiveTimer: 0
    };

    socket.emit('roomJoined', { code: data.code, playerNum: playerNum });
    io.to(data.code).emit('gameState', room);
  });

  socket.on('setRole', (data) => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    const player = room.players[socket.id];
    if (player) {
      player.role = data.role;
      io.to(currentRoomCode).emit('gameState', room);
    }
  });

  socket.on('updateName', (data) => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.players[socket.id]) {
      room.players[socket.id].name = data.name || 'Player';
      io.to(currentRoomCode).emit('gameState', room);
    }
  });

  socket.on('selectCharacter', (data) => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.players[socket.id]) {
      room.players[socket.id].characterKey = data.characterKey;
      io.to(currentRoomCode).emit('characterUpdated', room);
    }
  });

  socket.on('selectStage', (data) => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    room.selectedStage = data.stageId;
    io.to(currentRoomCode).emit('stageUpdated', { selectedStage: room.selectedStage });
  });

  socket.on('toggleReady', () => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    const p = room.players[socket.id];
    if (p) {
      p.ready = !p.ready;
      io.to(currentRoomCode).emit('gameState', room);

      // 【修正】接続中の全プレイヤーが存在し、かつ全員の ready が true の場合にゲーム開始
      const playersList = Object.values(room.players);
      if (playersList.length > 0 && playersList.every(pl => pl.ready)) {
        startGame(currentRoomCode);
      }
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomCode && rooms[currentRoomCode]) {
      delete rooms[currentRoomCode].players[socket.id];
      if (Object.keys(rooms[currentRoomCode].players).length === 0) {
        delete rooms[currentRoomCode];
      } else {
        io.to(currentRoomCode).emit('playerLeft');
      }
    }
  });
});

function startGame(code) {
  const room = rooms[code];
  if (!room) return;
  room.state = 'PLAYING';

  let battleIdx = 0;
  Object.values(room.players).forEach((p) => {
    if (p.role === 'spectator') return;
    p.hp = 100;
    p.maxHp = 100;
    p.lives = 3;
    p.x = 250 + battleIdx * 250;
    p.y = 200;
    p.vx = 0;
    p.vy = 0;
    p.isKilled = false;
    battleIdx++;
  });

  io.to(code).emit('gameStart', { players: room.players, selectedStage: room.selectedStage });
}

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
