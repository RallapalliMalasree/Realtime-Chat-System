const { saveMessage, getMessageHistory } = require('../services/messageService');
const { client: redisClient } = require('../db/redis');

// Redis key pattern: "room:general:users" → stores a Set of usernames
// Using Redis means ALL servers share the same online users list
const roomKey = (room) => `room:${room}:users`;

// Add user to a room's online set in Redis
async function addUserToRoom(room, username) {
  await redisClient.sAdd(roomKey(room), username);
}

// Remove user from a room's online set in Redis
async function removeUserFromRoom(room, username) {
  await redisClient.sRem(roomKey(room), username);
}

// Get all online users in a room from Redis (shared across all servers)
async function getOnlineUsers(room) {
  return await redisClient.sMembers(roomKey(room));
}

function registerChatHandlers(io, socket) {
  const { username } = socket.handshake.auth;

  // ── JOIN ROOM ──────────────────────────────────────────────────────────────
  socket.on('join_room', async (room) => {
    // Leave any previously joined rooms
    const previousRooms = [...socket.rooms].filter((r) => r !== socket.id);
    for (const prevRoom of previousRooms) {
      socket.leave(prevRoom);

      // Remove from Redis online set for the old room
      await removeUserFromRoom(prevRoom, username);
      const prevOnlineUsers = await getOnlineUsers(prevRoom);

      // Notify old room that user left (all servers see updated list from Redis)
      io.to(prevRoom).emit('user_left', { username, onlineUsers: prevOnlineUsers });
    }

    // Join the new Socket.IO room
    socket.join(room);

    // Add user to Redis online set for this room
    await addUserToRoom(room, username);

    // Get online users from Redis — includes users on ALL server instances
    const onlineUsers = await getOnlineUsers(room);

    // Send last 50 messages only to the joining user
    const history = await getMessageHistory(room, 50);
    socket.emit('message_history', history);

    // Notify everyone in the room (all servers) that a new user joined
    io.to(room).emit('user_joined', { username, onlineUsers });

    console.log(`${username} joined room: ${room}`);
  });

  // ── SEND MESSAGE ───────────────────────────────────────────────────────────
  socket.on('send_message', async ({ room, content }) => {
    if (!room || !content?.trim()) return;

    try {
      const saved = await saveMessage(room, username, content.trim());

      // Broadcast to ALL users in room across ALL server instances via Redis adapter
      io.to(room).emit('new_message', {
        username,
        content: content.trim(),
        createdAt: saved.created_at,
        room
      });
    } catch (err) {
      socket.emit('message_error', { error: 'Message failed to send. Please try again.' });
    }
  });

  // ── TYPING INDICATOR ───────────────────────────────────────────────────────
  // Not saved to DB — just a live signal broadcast to the room
  socket.on('typing', ({ room, isTyping }) => {
    socket.to(room).emit('user_typing', { username, isTyping });
  });

  // ── DISCONNECT ─────────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    // Remove user from all rooms they were in (stored in socket.rooms)
    const rooms = [...socket.rooms].filter((r) => r !== socket.id);
    for (const room of rooms) {
      await removeUserFromRoom(room, username);
      const onlineUsers = await getOnlineUsers(room);

      // Notify the room across all servers
      io.to(room).emit('user_left', { username, onlineUsers });
    }
    console.log(`${username} disconnected`);
  });
}

module.exports = { registerChatHandlers };
