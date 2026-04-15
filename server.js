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
let carriedPrize = null;

function randomPrize() {
  return {
    x: Math.floor(Math.random() * gridSize),
    y: gridSize - 1
  };
}

function resetGame() {
  claw = { x: 2, y: 0 };
  prizes = [randomPrize()];
  clawBusy = false;
  carriedPrize = null;
}

function sendState(socketOrIo = io) {
  socketOrIo.emit('position', claw);
  socketOrIo.emit('prizes', prizes);
  socketOrIo.emit('busy', clawBusy);
  socketOrIo.emit('carriedPrize', carriedPrize);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

resetGame();

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  sendState(socket);
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

  socket.on('drop', async () => {
    while (claw.y > 0) {
      claw.y--;
      io.emit('position', claw);

      if (carriedPrize) {
        carriedPrize.y = claw.y;
        io.emit('carriedPrize', carriedPrize);

        // 👇 NEW: slip logic
        if (!slippingPrize && claw.y === 2) {
          const slipChance = 0.5; // 50% chance
          const slipped = Math.random() < slipChance;

          if (slipped) {
            slippingPrize = true;

            // drop prize back into machine
            prizes.push({ x: claw.x, y: claw.y + 1 });
            io.emit('prizes', prizes);

            carriedPrize = null;
            io.emit('carriedPrize', carriedPrize);

            io.emit('result', '😮 Prize slipped out!');
          }
        }
      }

      await wait(300);
    }  
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