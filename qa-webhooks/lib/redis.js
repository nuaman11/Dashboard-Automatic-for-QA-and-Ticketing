// Small helper so every API route shares one Redis connection instead of
// opening a new one per request. Uses the REDIS_URL env var that Vercel's
// Redis integration added automatically.

const { createClient } = require('redis');

let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => console.error('[redis] connection error:', err));
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}

module.exports = { getClient };
