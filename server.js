const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let clawX = 0;
let clawY = 0;
let prizes = [];
let collected = 0;
let timeLeft = 30;
let timer;
let gameActive = false;
let level = 1;

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

  socket.emit('position', { x: clawX, y: clawY });
  socket.emit('prizes', prizes);
  socket.emit('level', level); 
socket.on('restart', () => {
  level = 1;
  gameActive = false;
  prizes = [];
  clawX = 0;
  clawY = 0;
  collected = 0;
  timeLeft = 30;

  clearInterval(timer);

  socket.emit('level', level);
  socket.emit('position', { x: clawX, y: clawY });
  socket.emit('prizes', prizes);
  socket.emit('result', 'Game reset!');
});

socket.on('start', () => {
  const settings = getLevelSettings(level);

  clawX = 0;
  clawY = 0;
  collected = 0;
  timeLeft = settings.timeLimit;
  gameActive = true;

  prizes = [];

  while (prizes.length < settings.prizeCount) {
    const newPrize = {
      x: Math.floor(Math.random() * 5),
      y: Math.floor(Math.random() * 5)
    };

    const onClawStart = newPrize.x === 0 && newPrize.y === 0;
    const alreadyExists = prizes.some(p => p.x === newPrize.x && p.y === newPrize.y);

    if (!onClawStart && !alreadyExists) {
      prizes.push(newPrize);
    }
  }

  socket.emit('position', { x: clawX, y: clawY });
  socket.emit('prizes', prizes);
  socket.emit('level', level);
  socket.emit('result', '');

  clearInterval(timer);
  timer = setInterval(() => {
    timeLeft--;
    io.emit('timer', timeLeft);

    if (timeLeft <= 0) {
      clearInterval(timer);
      gameActive = false;
      io.emit('result', 'Game Over!');
    }
  }, 1000);
});

  socket.on('move', (direction) => {
    if (!gameActive) return;

    if (direction === 'left' && clawX > 0) clawX--;
    if (direction === 'right' && clawX < 4) clawX++;
    if (direction === 'forward' && clawY > 0) clawY--;
    if (direction === 'back' && clawY < 4) clawY++;

    io.emit('position', { x: clawX, y: clawY });
  });

socket.on('drop', () => {
  if (!gameActive) return;

  const hitIndex = prizes.findIndex(p => p.x === clawX && p.y === clawY);

  if (hitIndex !== -1) {
    const settings = getLevelSettings(level);
    const success = Math.random() < settings.grabChance;

    if (success) {
      prizes.splice(hitIndex, 1);
      collected++;

      clawX = 0;
      clawY = 0;

      io.emit('position', { x: clawX, y: clawY });
      io.emit('prizes', prizes);

      if (prizes.length === 0) {
        gameActive = false;
        clearInterval(timer);

        if (level < 3) {
          level++;
          io.emit('level', level);
          io.emit('result', 'Level complete!');
        } else {
          io.emit('result', 'YOU BEAT THE GAME!');
        }
      } else {
        io.emit('result', 'Prize collected!');
      }
    } else {
      io.emit('result', 'Almost! Try again!');
    }
  } else {
    io.emit('result', 'Missed!');
  }
});
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});