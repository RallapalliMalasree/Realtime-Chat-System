const redis = require('redis');

const REDIS_URL = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

// Primary client — for general use (caching, storing data)
const client = redis.createClient({ url: REDIS_URL });

// Two separate clients required for Socket.IO Redis Adapter (pub/sub)
// A client in subscribe mode cannot issue other commands
const pubClient = redis.createClient({ url: REDIS_URL });
const subClient = pubClient.duplicate();

client.on('error', (err) => console.error('Redis error:', err.message));
client.on('connect', () => console.log('Redis connected.'));

client.connect().catch(console.error);

module.exports = { client, pubClient, subClient };
