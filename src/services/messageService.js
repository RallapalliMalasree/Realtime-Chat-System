const pool = require('../db/postgres');

// Save a message to PostgreSQL permanently
async function saveMessage(room, username, content) {
  try {
    const result = await pool.query(
      'INSERT INTO messages (room, username, content) VALUES ($1, $2, $3) RETURNING *',
      [room, username, content]
    );
    return result.rows[0];
  } catch (err) {
    console.error('saveMessage error:', err.message);
    throw err;
  }
}

// Fetch last N messages for a room (sent to user when they first join)
async function getMessageHistory(room, limit = 50) {
  try {
    const result = await pool.query(
      `SELECT username, content, created_at
       FROM messages
       WHERE room = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [room, limit]
    );
    // Reverse so oldest messages appear first in chat
    return result.rows.reverse();
  } catch (err) {
    console.error('getMessageHistory error:', err.message);
    return [];
  }
}

module.exports = { saveMessage, getMessageHistory };
