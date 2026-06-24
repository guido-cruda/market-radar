const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  try {
    const redis = Redis.fromEnv();
    const data = await redis.get('radar_latest');
    if (!data) {
      return res.status(404).json({ error: 'Nessun dato disponibile. Il primo aggiornamento avverra alle prossime 8:00.' });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
