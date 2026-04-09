let players = {};
let playerOrder = [];
let currentTurnIndex = 0;

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.use(express.static(__dirname));

function getLevelSettings(level) {
  if (level === 1) {
    return { prizeCount: 3, timeLimit: 30, grabChance: 0.8 };
  } else if (level === 2) {
    return { prizeCount: 4, timeLimit: 25, grabChance: 0.7 };
  } else {
    return { prizeCount: 5, timeLimit: 20, grabChance: 0.6 };
  }
}

const gameState = {
  clawX: 0,
  clawY: 0,
  prizes: [],
  collected: 0,
  timeLeft: 30,
  timer: null,
  gameActive: false,
  level: 1
};

//const players = {};

function getPlayerNumber() {
  const takenNumbers = Object.values(players).map(player => player.playerNumber);

  if (!takenNumbers.includes(1)) return 1;
  if (!takenNumbers.includes(2)) return 2;

  let num = 3;
  while (takenNumbers.includes(num)) {
    num++;
  }
  return num;
}

function sendGameState() {
  io.emit('position', { x: gameState.clawX, y: gameState.clawY });
  io.emit('prizes', gameState.prizes);
  io.emit('level', gameState.level);
  io.emit('timer', gameState.timeLeft);
}

function sendScores() {
  const scoreData = Object.values(players).map((player) => ({
    playerNumber: player.playerNumber,
    wins: player.wins,
    misses: player.misses
  }));

  console.log('sending scoreboard:', scoreData);
  io.emit('scoreboard', scoreData);
}

function generatePrizes(prizeCount) {
  gameState.prizes = [];

  while (gameState.prizes.length < prizeCount) {
    const newPrize = {
      x: Math.floor(Math.random() * 5),
      y: Math.floor(Math.random() * 5)
    };

    const onClawStart = newPrize.x === 0 && newPrize.y === 0;
    const alreadyExists = gameState.prizes.some(
      (p) => p.x === newPrize.x && p.y === newPrize.y
    );

    if (!onClawStart && !alreadyExists) {
      gameState.prizes.push(newPrize);
    }
  }
}

io.on('connection', (socket) => {
  console.log("Player joined:", socket.id);

  players[socket.id] = {
    socketId: socket.id,
    playerNumber: getPlayerNumber(),
    wins: 0,
    misses: 0
  };
// remove any existing entry with same socket (safety)
  playerOrder = playerOrder.filter(id => id !== socket.id);
    playerOrder.push(socket.id);

  if (playerOrder.length === 1) {
    currentTurnIndex = 0;
  }

  console.log("Initial turn:", playerOrder[currentTurnIndex]);

  socket.emit('playerInfo', {
    playerNumber: players[socket.id].playerNumber
  });

  io.emit('turnUpdate', {
    currentPlayer: playerOrder[currentTurnIndex]
  });

  sendGameState();
  sendScores();

  socket.on('start', () => {
    if (turnTimer) {
      clearTimeout(turnTimer);
    }
  playerOrder = playerOrder.filter(id => players[id]);

  const settings = getLevelSettings(gameState.level);

  gameState.clawX = 0;
  gameState.clawY = 0;
  gameState.collected = 0;
  gameState.timeLeft = settings.timeLimit;
  gameState.gameActive = true;

  generatePrizes(settings.prizeCount);

  clearInterval(gameState.timer);

  if (playerOrder.length > 0) {
    currentTurnIndex = 0;
    io.emit('turnUpdate', {
      currentPlayer: playerOrder[currentTurnIndex]
    });
    console.log("Game started - first turn:", playerOrder[currentTurnIndex]);
  }

  sendGameState();
  io.emit('result', '');

  gameState.timer = setInterval(() => {
    gameState.timeLeft--;
    io.emit('timer', gameState.timeLeft);

    if (gameState.timeLeft <= 0) {
      clearInterval(gameState.timer);
      gameState.gameActive = false;
      io.emit('result', 'Game Over!');
    }
  }, 1000);
});
  socket.on('move', (direction) => {
    console.log("MOVE CHECK:", {
      socketId: socket.id,
      expected: playerOrder[currentTurnIndex],
      gameActive: gameState.gameActive
    });

    if (socket.id !== playerOrder[currentTurnIndex]) return;
    if (!gameState.gameActive) return;

    if (direction === 'left' && gameState.clawX > 0) gameState.clawX--;
    if (direction === 'right' && gameState.clawX < 4) gameState.clawX++;
    if (direction === 'forward' && gameState.clawY > 0) gameState.clawY--;
    if (direction === 'back' && gameState.clawY < 4) gameState.clawY++;

    io.emit('position', { x: gameState.clawX, y: gameState.clawY });
  });

  socket.on('drop', () => {
    if (socket.id !== playerOrder[currentTurnIndex]) return;
    if (!gameState.gameActive) return;

    let player = players[socket.id];
    if (!player) return;

    const hitIndex = gameState.prizes.findIndex(
      (p) => p.x === gameState.clawX && p.y === gameState.clawY
    );

    if (hitIndex !== -1) {
      const settings = getLevelSettings(gameState.level);
      const success = Math.random() < settings.grabChance;

      if (success) {
        gameState.prizes.splice(hitIndex, 1);
        gameState.collected++;

        gameState.clawX = 0;
        gameState.clawY = 0;

        io.emit('position', { x: gameState.clawX, y: gameState.clawY });
        io.emit('prizes', gameState.prizes);

        if (gameState.prizes.length === 0) {
          gameState.gameActive = false;
          clearInterval(gameState.timer);

          player.wins++;
          sendScores();

          if (gameState.level < 3) {
            gameState.level++;
            io.emit('level', gameState.level);
            io.emit('result', `Player ${player.playerNumber} completed the level!`);
          } else {
            io.emit('result', `Player ${player.playerNumber} beat the game!`);
          }
        } else {
          io.emit('result', `Player ${player.playerNumber} collected a prize!`);
        }
      } else {
        player.misses++;
        sendScores();
        io.emit('result', `Player ${player.playerNumber} almost got it!`);
      }
    } else {
      player.misses++;
      sendScores();
      io.emit('result', `Player ${player.playerNumber} missed!`);
    }

    nextTurn();
  });

  socket.on('restart', () => {
    gameState.level = 1;
    gameState.gameActive = false;
    gameState.prizes = [];
    gameState.clawX = 0;
    gameState.clawY = 0;
    gameState.collected = 0;
    gameState.timeLeft = 30;

    clearInterval(gameState.timer);

    Object.values(players).forEach((player) => {
      player.wins = 0;
      player.misses = 0;
    });

    sendGameState();
    sendScores();
    io.emit('result', 'Game reset!');
  });

  socket.on('disconnect', () => {
    console.log("Player disconnected:", socket.id);

    playerOrder = playerOrder.filter(id => id !== socket.id);
    delete players[socket.id];

    console.log("Remaining playerOrder:", playerOrder);

    if (currentTurnIndex >= playerOrder.length) {
      currentTurnIndex = 0;
    }

    io.emit('turnUpdate', {
      currentPlayer: playerOrder[currentTurnIndex]
    });

    sendScores();
  });
});

let turnTimer = null;

function nextTurn() {
  if (playerOrder.length === 0) return;

  // if only one player, keep turn on same player
  if (playerOrder.length === 1) {
    const currentPlayer = playerOrder[0];

    io.emit('turnUpdate', {
      currentPlayer: currentPlayer
    });

    console.log("Single player turn stays on:", currentPlayer);

    if (turnTimer) {
      clearTimeout(turnTimer);
    }

    turnTimer = setTimeout(() => {
      console.log("Single player turn timed out");
      nextTurn();
    }, 20000);

    return;
  }

  currentTurnIndex = (currentTurnIndex + 1) % playerOrder.length;

  const currentPlayer = playerOrder[currentTurnIndex];

  io.emit('turnUpdate', {
    currentPlayer: currentPlayer
  });

  console.log("Current turn:", currentPlayer);

  if (turnTimer) {
    clearTimeout(turnTimer);
  }

  turnTimer = setTimeout(() => {
    console.log("Turn timed out");
    nextTurn();
  }, 20000);
}
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// server.listen(3000, () => {
//   console.log('Server running on http://localhost:3000');
// });