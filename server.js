const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const gridSize = 5;

let claw = { x: 2, y: 0 };
let prizes = [];
let clawBusy = false;

function randomPrize() {
  let prize;
  do {
    prize = {
      x: Math.floor(Math.random() * gridSize),
      y: gridSize - 1
    };
  } while (prize.x === claw.x && prize.y === claw.y);

  return prize;
}

function resetGame() {
  claw = { x: 2, y: 0 };
  prizes = [randomPrize()];
  clawBusy = false;
}

function sendState() {
  io.emit('position', claw);
  io.emit('prizes', prizes);
  io.emit('busy', clawBusy);
}

resetGame();

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.emit('position', claw);
  socket.emit('prizes', prizes);
  socket.emit('busy', clawBusy);
  socket.emit('result', 'Welcome to OpenClaw');

  socket.on('move', (direction) => {
    if (clawBusy) return;

    if (direction === 'left' && claw.x > 0) {
      claw.x--;
    } else if (direction === 'right' && claw.x < gridSize - 1) {
      claw.x++;
    }

    io.emit('position', claw);
  });

  socket.on('drop', () => {
    if (clawBusy) return;

    clawBusy = true;
    io.emit('busy', clawBusy);
    io.emit('result', 'Claw dropping...');

    // Drop to bottom row
    claw.y = gridSize - 1;
    io.emit('position', claw);

    const hitIndex = prizes.findIndex(
      (p) => p.x === claw.x && p.y === claw.y
    );

    setTimeout(() => {
      if (hitIndex !== -1) {
        prizes.splice(hitIndex, 1);
        io.emit('prizes', prizes);
        io.emit('result', 'Prize grabbed!');
      } else {
        io.emit('result', 'Missed!');
      }

      // Return claw to top
      claw.y = 0;
      io.emit('position', claw);

      // Create a new prize if all prizes were collected
      if (prizes.length === 0) {
        prizes = [randomPrize()];
        io.emit('prizes', prizes);
      }

      clawBusy = false;
      io.emit('busy', clawBusy);
    }, 1000);
  });

  socket.on('reset', () => {
    resetGame();
    sendState();
    io.emit('result', 'Game reset');
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});