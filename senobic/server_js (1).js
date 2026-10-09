const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// オンライン部屋と対戦状態の管理
let rooms = {};

io.on('connection', (socket) => {
  console.log(`[接続] ユーザーが接続しました: ${socket.id}`);

  // 空いている部屋を探すか、新しい部屋を作成
  let assignedRoom = null;
  for (let roomId in rooms) {
    if (Object.keys(rooms[roomId].players).length < 2) {
      assignedRoom = roomId;
      break;
    }
  }

  if (!assignedRoom) {
    assignedRoom = 'room_' + Date.now();
    rooms[assignedRoom] = {
      players: {},
      gameState: 'WAITING' // WAITING, SELECTION, FIGHT, GAMEOVER
    };
  }

  const room = rooms[assignedRoom];
  socket.join(assignedRoom);

  // プレイヤー番号の割り当て (1 or 2)
  const existingPlayerNumbers = Object.values(room.players).map(p => p.playerNum);
  const playerNum = existingPlayerNumbers.includes(1) ? 2 : 1;

  room.players[socket.id] = {
    id: socket.id,
    playerNum: playerNum,
    charIndex: 0,
    ready: false
  };

  console.log(`[部屋] ${socket.id} が ${assignedRoom} に Player ${playerNum} として参加`);

  // クライアントへ自身のプレイヤー情報を送信
  socket.emit('initPlayer', {
    socketId: socket.id,
    playerNum: playerNum,
    roomId: assignedRoom
  });

  // 部屋のプレイヤー状態を更新
  io.to(assignedRoom).emit('updateRoomState', {
    playersCount: Object.keys(room.players).length,
    players: room.players
  });

  // キャラクター選択の同期
  socket.on('selectCharacter', (charIndex) => {
    if (room.players[socket.id]) {
      room.players[socket.id].charIndex = charIndex;
      io.to(assignedRoom).emit('characterSelected', {
        playerNum: room.players[socket.id].playerNum,
        charIndex: charIndex
      });
    }
  });

  // 戦闘開始シグナル
  socket.on('gameStart', () => {
    room.gameState = 'FIGHT';
    io.to(assignedRoom).emit('gameStart', room.players);
  });

  // 移動・攻撃アクションのリアルタイム同期
  socket.on('playerAction', (actionData) => {
    socket.to(assignedRoom).emit('opponentAction', actionData);
  });

  // ダメージ同期
  socket.on('takeDamage', (damageData) => {
    io.to(assignedRoom).emit('applyDamage', damageData);
  });

  // 切断処理
  socket.on('disconnect', () => {
    console.log(`[切断] ユーザーが切断しました: ${socket.id}`);
    delete room.players[socket.id];

    if (Object.keys(room.players).length === 0) {
      delete rooms[assignedRoom];
    } else {
      io.to(assignedRoom).emit('playerLeft', { playerNum: playerNum });
    }
  });
});

server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(` セノビックブラザーズ (オンライン版) 起動`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(`=================================`);
});
