const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN
    });
    const data = await redis.get('radar_latest');
    if (!data) {
      return res.status(404).json({ error: 'Nessun dato disponibile.' });
    }
    return res.status(200).json(data);
  } catch (err) {
    const history = await redis.lrange('radar_history', 0, 13);
    return res.status(200).json({ ...data, _history: history });
  }
};
