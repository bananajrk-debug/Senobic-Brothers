const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ゲームマスターデータ（全5キャラクターのステータス）
const CHARACTERS = {
  futsuo: { name: 'フツオ (普通)', hp: 100, atk: 10, speed: 6, jumpPower: 15, width: 40, height: 80, color: '#3498db' },
  debugon: { name: 'デブゴン (デブ)', hp: 150, atk: 18, speed: 3.5, jumpPower: 12, width: 65, height: 90, color: '#e67e22' },
  garinoshin: { name: 'ガリノシン (ガリ)', hp: 70, atk: 8, speed: 9, jumpPower: 20, width: 25, height: 95, color: '#9b59b6' },
  chibikoro: { name: 'チビコロ (チビデブ)', hp: 120, atk: 12, speed: 4.5, jumpPower: 13, width: 55, height: 50, color: '#e74c3c' },
  hime: { name: 'ヒメ (女)', hp: 85, atk: 14, speed: 7.5, jumpPower: 16, width: 35, height: 75, color: '#e84393' }
};

let rooms = {};

function createRoom(roomId) {
  return {
    id: roomId,
    players: {},
    gameState: 'WAITING', // WAITING, SELECTING, PLAYING, FINISHED
    timer: 99,
    interval: null
  };
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 既存の空きルームを探すか新規作成
  let assignedRoomId = null;
  for (let id in rooms) {
    if (Object.keys(rooms[id].players).length < 2 && rooms[id].gameState === 'WAITING') {
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
    x: playerNum === 1 ? 150 : 610,
    y: 300,
    vx: 0,
    vy: 0,
    facing: playerNum === 1 ? 'right' : 'left',
    hp: 100,
    maxHp: 100,
    isGrounded: false,
    attacking: false,
    attackType: null, // 'punch' or 'kick'
    attackBox: null,
    hitCount: 0,
    stunFrames: 0,
    invincibleFrames: 0
  };

  socket.join(assignedRoomId);
  socket.emit('init', { roomId: assignedRoomId, playerNum: playerNum, characters: CHARACTERS });

  console.log(`Player ${playerNum} joined room ${assignedRoomId}`);

  // 2名揃ったらキャラ選択画面へ遷移
  if (Object.keys(room.players).length === 2) {
    room.gameState = 'SELECTING';
    io.to(assignedRoomId).emit('gameState', { state: 'SELECTING', players: room.players });
  } else {
    socket.emit('gameState', { state: 'WAITING', players: room.players });
  }

  // キャラクター選択
  socket.on('selectCharacter', (data) => {
    if (room.gameState !== 'SELECTING') return;
    const p = room.players[socket.id];
    if (p) {
      p.characterKey = data.characterKey;
      p.selected = data.confirmed;
      io.to(assignedRoomId).emit('characterUpdated', { players: room.players });

      // 全員選択完了なら試合開始
      const allReady = Object.values(room.players).every(player => player.selected);
      if (allReady && Object.keys(room.players).length === 2) {
        room.gameState = 'PLAYING';
        
        // 各プレイヤーのパラメーターをキャラデータで初期化
        Object.values(room.players).forEach(p => {
          const char = CHARACTERS[p.characterKey];
          p.hp = char.hp;
          p.maxHp = char.hp;
          p.x = p.playerNum === 1 ? 150 : 800 - 150 - char.width;
          p.y = 400 - char.height;
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

  // 物理パケット/操作情報の同期
  socket.on('playerInput', (input) => {
    if (room.gameState !== 'PLAYING') return;
    const p = room.players[socket.id];
    if (!p || p.stunFrames > 0) return;

    const char = CHARACTERS[p.characterKey];

    // 左右移動
    if (input.left) {
      p.vx = -char.speed;
      p.facing = 'left';
    } else if (input.right) {
      p.vx = char.speed;
      p.facing = 'right';
    } else {
      p.vx = 0;
    }

    // ジャンプ
    if (input.jump && p.isGrounded) {
      p.vy = -char.jumpPower;
      p.isGrounded = false;
    }

    // 攻撃処理
    if (input.attack && !p.attacking) {
      p.attacking = true;
      p.attackType = input.attackType; // 'punch' or 'kick'
      
      const isPunch = input.attackType === 'punch';
      const reach = isPunch ? 45 : 70;
      const attackHeight = isPunch ? char.height * 0.4 : char.height * 0.3;
      const attackYOffset = isPunch ? char.height * 0.2 : char.height * 0.5;

      p.attackBox = {
        x: p.facing === 'right' ? p.x + char.width : p.x - reach,
        y: p.y + attackYOffset,
        width: reach,
        height: attackHeight,
        damage: isPunch ? char.atk : Math.round(char.atk * 1.3)
      };

      // 判定持続とクールダウン
      setTimeout(() => {
        p.attackBox = null;
      }, 120);

      setTimeout(() => {
        p.attacking = false;
      }, 350);
    }
  });

  // 再戦リクエスト
  socket.on('requestRematch', () => {
    if (room.gameState === 'FINISHED') {
      room.gameState = 'SELECTING';
      Object.values(room.players).forEach(p => {
        p.selected = false;
      });
      io.to(assignedRoomId).emit('gameState', { state: 'SELECTING', players: room.players });
    }
  });

  // 切断処理
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete room.players[socket.id];

    if (Object.keys(room.players).length === 0) {
      delete rooms[assignedRoomId];
    } else {
      room.gameState = 'WAITING';
      const remainingPlayer = Object.values(room.players)[0];
      remainingPlayer.selected = false;
      io.to(assignedRoomId).emit('playerLeft');
    }
  });
});

// サーバーサイドメインループ (60 FPS) - 物理演算・判定同期
setInterval(() => {
  const STAGE_WIDTH = 800;
  const GROUND_Y = 400;
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

      // スタン（ヒットストップ）処理
      if (p.stunFrames > 0) {
        p.stunFrames--;
        p.vx = 0;
      }

      if (p.invincibleFrames > 0) {
        p.invincibleFrames--;
      }

      // 重力適用
      p.vy += GRAVITY;

      // 位置更新
      p.x += p.vx;
      p.y += p.vy;

      // 着地判定
      if (p.y + char.height >= GROUND_Y) {
        p.y = GROUND_Y - char.height;
        p.vy = 0;
        p.isGrounded = true;
      } else {
        p.isGrounded = false;
      }

      // 画面端の壁判定
      if (p.x < 0) p.x = 0;
      if (p.x + char.width > STAGE_WIDTH) p.x = STAGE_WIDTH - char.width;
    });

    // 当たり判定 (Hitbox Collision)
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

        // AABB 矩形交差判定
        if (
          ab.x < db.x + db.width &&
          ab.x + ab.width > db.x &&
          ab.y < db.y + db.height &&
          ab.y + ab.height > db.y
        ) {
          // ヒット成立
          defender.hp -= ab.damage;
          defender.stunFrames = 12; // 硬直時間
          defender.invincibleFrames = 25; // 無敵時間
          defender.vy = -4; // ノックバック浮かせ
          defender.vx = attacker.facing === 'right' ? 8 : -8;

          // 攻撃判定消去（重複ヒット防止）
          attacker.attackBox = null;

          if (defender.hp <= 0) {
            defender.hp = 0;
            room.gameState = 'FINISHED';
            io.to(roomId).emit('gameOver', { winnerNum: attacker.playerNum });
          }
        }
      }
    });

    // クライアントへ最新フレームの全データをブロードキャスト
    io.to(roomId).emit('updateState', {
      players: room.players
    });
  }
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

