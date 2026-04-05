const redis = require('redis');

const REDIS_URL = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

// Retry strategy: keep retrying every 2 seconds if connection fails on startup
const retryConfig = {
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      console.log(`Redis reconnect attempt #${retries}...`);
      return 2000; // retry every 2 seconds
    }
  }
};

// Primary client — for general use (caching, storing data)
const client = redis.createClient(retryConfig);

// Two separate clients required for Socket.IO Redis Adapter (pub/sub)
// A client in subscribe mode cannot issue other commands
const pubClient = redis.createClient(retryConfig);
const subClient = pubClient.duplicate();

client.on('error', (err) => console.error('Redis error:', err.message));
client.on('connect', () => console.log('Redis connected.'));

client.connect().catch(console.error);

module.exports = { client, pubClient, subClient };
