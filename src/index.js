require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const path = require('path');

const { pubClient, subClient } = require('./db/redis');
const { registerChatHandlers } = require('./socket/chatHandler');

const app = express();
const server = http.createServer(app); // Socket.IO needs raw HTTP server (not just Express)

// ── SOCKET.IO SETUP ──────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*' },           // Allow all origins (restrict in production)
  transports: ['websocket', 'polling']
});

// Connect Redis adapter — this is what makes messages work across multiple servers
// Without this, a message sent to Server1 would never reach users on Server2/Server3
Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log('Redis adapter connected — messages will sync across all server instances');
});

// ── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json());

// Serve the chat UI from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// ── REST ENDPOINTS ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', pid: process.pid });
});

// ── SOCKET.IO CONNECTION ─────────────────────────────────────────────────────
io.use((socket, next) => {
  // Middleware: require username before allowing connection
  const username = socket.handshake.auth.username;
  if (!username || !username.trim()) {
    return next(new Error('Username is required'));
  }
  next();
});

io.on('connection', (socket) => {
  const { username } = socket.handshake.auth;
  console.log(`${username} connected (socket: ${socket.id})`);

  // Register all chat event handlers for this socket
  registerChatHandlers(io, socket);
});

// ── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT} (PID: ${process.pid})`);
});
