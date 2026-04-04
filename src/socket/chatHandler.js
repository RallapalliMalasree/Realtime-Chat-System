const { saveMessage, getMessageHistory } = require('../services/messageService');

// Tracks online users per room: { roomName: Set(username, username...) }
const roomUsers = {};

function registerChatHandlers(io, socket) {
  const { username } = socket.handshake.auth;

  // ── JOIN ROOM ──────────────────────────────────────────────────────────────
  // Triggered when a user opens or switches to a chat room
  socket.on('join_room', async (room) => {
    // Leave any previously joined rooms (user can only be in one room at a time)
    const previousRooms = [...socket.rooms].filter((r) => r !== socket.id);
    previousRooms.forEach((prevRoom) => {
      socket.leave(prevRoom);
      if (roomUsers[prevRoom]) {
        roomUsers[prevRoom].delete(username);
        // Notify old room that user left
        io.to(prevRoom).emit('user_left', {
          username,
          onlineUsers: [...(roomUsers[prevRoom] || [])]
        });
      }
    });

    // Join the new room
    socket.join(room);

    // Track user in room
    if (!roomUsers[room]) roomUsers[room] = new Set();
    roomUsers[room].add(username);

    // Send last 50 messages to the joining user so they see chat history
    const history = await getMessageHistory(room, 50);
    socket.emit('message_history', history);

    // Notify everyone in the room that a new user joined
    io.to(room).emit('user_joined', {
      username,
      onlineUsers: [...roomUsers[room]]
    });

    console.log(`${username} joined room: ${room}`);
  });

  // ── SEND MESSAGE ───────────────────────────────────────────────────────────
  // Triggered when a user sends a chat message
  socket.on('send_message', async ({ room, content }) => {
    if (!room || !content?.trim()) return;

    try {
      // 1. Save to PostgreSQL for persistence (async, reliable delivery)
      const saved = await saveMessage(room, username, content.trim());

      // 2. Broadcast to ALL users in the room across ALL server instances
      // io.to(room) uses Redis Pub/Sub under the hood to reach users on other servers
      io.to(room).emit('new_message', {
        username,
        content: content.trim(),
        createdAt: saved.created_at,
        room
      });
    } catch (err) {
      // Notify sender if message failed to deliver
      socket.emit('message_error', { error: 'Message failed to send. Please try again.' });
    }
  });

  // ── TYPING INDICATOR ───────────────────────────────────────────────────────
  // Lightweight event — NOT saved to DB, just broadcast to room
  socket.on('typing', ({ room, isTyping }) => {
    // Broadcast to everyone in the room EXCEPT the sender
    socket.to(room).emit('user_typing', { username, isTyping });
  });

  // ── DISCONNECT ─────────────────────────────────────────────────────────────
  // Triggered automatically when user closes tab or loses connection
  socket.on('disconnect', () => {
    // Remove user from all rooms they were in
    Object.keys(roomUsers).forEach((room) => {
      if (roomUsers[room]?.has(username)) {
        roomUsers[room].delete(username);
        io.to(room).emit('user_left', {
          username,
          onlineUsers: [...roomUsers[room]]
        });
      }
    });
    console.log(`${username} disconnected`);
  });
}

module.exports = { registerChatHandlers };
