const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

function createPlayerState() {
  return {
    clawX: 0,
    clawY: 0,
    prizes: [],
    collected: 0,
    timeLeft: 30,
    timer: null,
    gameActive: false,
    level: 1
  };
}
function getLevelSettings(level) {
  if (level === 1) {
    return { prizeCount: 3, timeLimit: 30, grabChance: 0.8 };
  } else if (level === 2) {
    return { prizeCount: 4, timeLimit: 25, grabChance: 0.7 };
  } else {
    return { prizeCount: 5, timeLimit: 20, grabChance: 0.6 };
  }
}
io.on('connection', (socket) => {
  console.log('A user connected');

  const state = createPlayerState();

  socket.emit('position', { x: state.clawX, y: state.clawY });
  socket.emit('prizes', state.prizes);
  socket.emit('level', state.level);
  socket.emit('timer', state.timeLeft);
});

socket.on('start', () => {
  const settings = getLevelSettings(state.level);

  state.clawX = 0;
  state.clawY = 0;
  state.collected = 0;
  state.timeLeft = settings.timeLimit;
  state.gameActive = true;
  state.prizes = [];

  while (state.prizes.length < settings.prizeCount) {
    const newPrize = {
      x: Math.floor(Math.random() * 5),
      y: Math.floor(Math.random() * 5)
    };

    const onClawStart = newPrize.x === 0 && newPrize.y === 0;
    const alreadyExists = state.prizes.some(
      p => p.x === newPrize.x && p.y === newPrize.y
    );

    if (!onClawStart && !alreadyExists) {
      state.prizes.push(newPrize);
    }
  }

  socket.emit('position', { x: state.clawX, y: state.clawY });
  socket.emit('prizes', state.prizes);
  socket.emit('level', state.level);
  socket.emit('timer', state.timeLeft);
  socket.emit('result', '');

  clearInterval(state.timer);
  state.timer = setInterval(() => {
    state.timeLeft--;
    socket.emit('timer', state.timeLeft);

    if (state.timeLeft <= 0) {
      clearInterval(state.timer);
      state.gameActive = false;
      socket.emit('result', 'Game Over!');
    }
  }, 1000);
});
socket.on('move', (direction) => {
  if (!state.gameActive) return;

  if (direction === 'left' && state.clawX > 0) state.clawX--;
  if (direction === 'right' && state.clawX < 4) state.clawX++;
  if (direction === 'forward' && state.clawY > 0) state.clawY--;
  if (direction === 'back' && state.clawY < 4) state.clawY++;

  socket.emit('position', { x: state.clawX, y: state.clawY });
});

socket.on('drop', () => {
  if (!state.gameActive) return;

  const hitIndex = state.prizes.findIndex(
    p => p.x === state.clawX && p.y === state.clawY
  );

  if (hitIndex !== -1) {
    const settings = getLevelSettings(state.level);
    const success = Math.random() < settings.grabChance;

    if (success) {
      state.prizes.splice(hitIndex, 1);
      state.collected++;

      state.clawX = 0;
      state.clawY = 0;

      socket.emit('position', { x: state.clawX, y: state.clawY });
      socket.emit('prizes', state.prizes);

      if (state.prizes.length === 0) {
        state.gameActive = false;
        clearInterval(state.timer);

        if (state.level < 3) {
          state.level++;
          socket.emit('level', state.level);
          socket.emit('result', 'Level complete!');
        } else {
          socket.emit('result', 'YOU BEAT THE GAME!');
        }
      } else {
        socket.emit('result', 'Prize collected!');
      }
    } else {
      socket.emit('result', 'Almost! Try again!');
    }
  } else {
    socket.emit('result', 'Missed!');
  }
});  

socket.on('restart', () => {
  state.level = 1;
  state.gameActive = false;
  state.prizes = [];
  state.clawX = 0;
  state.clawY = 0;
  state.collected = 0;
  state.timeLeft = 30;

  clearInterval(state.timer);

  socket.emit('level', state.level);
  socket.emit('position', { x: state.clawX, y: state.clawY });
  socket.emit('prizes', state.prizes);
  socket.emit('timer', state.timeLeft);
  socket.emit('result', 'Game reset!');
});

socket.on('disconnect', () => {
  clearInterval(state.timer);
  console.log('User disconnected');
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});