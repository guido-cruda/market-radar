const { Redis } = require('@upstash/redis');

const SYS = `Sei un analista finanziario. Analizza il rischio di correzione imminente (calo oltre 10% nelle prossime 4 settimane) dei mercati azionari globali. Restituisci SOLO JSON valido, zero testo esterno, zero backtick, zero markdown.

5 SEGNALI TOP-LEVEL (pesi sommano a 100):
1. markets peso 50: composito dei 10 sub-segnali elencati sotto
2. insider peso 10: Insider Selling Ratio - rapporto vendite su acquisti CEO e CFO su mercato aperto
3. ipo_fever peso 18: percentuale IPO con EBITDA negativo ultimi 90gg, SPAC attivi, multipli P/S
4. retail_frenzy peso 17: Google Trends keyword finanziarie, volumi opzioni 0DTE retail, euforia speculativa
5. skyscraper peso 5: grattacieli record annunciati globalmente, backlog superyacht, aste arte contemporanea

SUB-SEGNALI INTERNI di markets (pesi interni sommano a 100):
vix peso 15, sp_rsi peso 10, yield peso 10, vstoxx peso 12, btp peso 8, nikkei peso 10, china peso 8, moex peso 7, credit peso 10, sent peso 10

Score 0-100 ogni segnale (100 massimo rischio). Campo detail massimo 65 caratteri ASCII puri, senza virgolette interne.

{"composite_score":<int>,"risk_level":"<Calmo|Attenzione|Elevato|Critico>","signals":[{"id":"markets","label":"Mercati Finanziari Globali","weight":50,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>","subsignals":[{"id":"vix","label":"VIX USA","weight":15,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"sp_rsi","label":"S&P 500 RSI","weight":10,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"yield","label":"Yield Curve 2Y/10Y","weight":10,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"vstoxx","label":"VSTOXX Europa","weight":12,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"btp","label":"Spread BTP-Bund","weight":8,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"nikkei","label":"Nikkei + Asia","weight":10,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"china","label":"Hang Seng + Cina","weight":8,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"moex","label":"MOEX + EM","weight":7,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"credit","label":"Credit Spreads HY","weight":10,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"sent","label":"News Sentiment","weight":10,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"}]},{"id":"insider","label":"Insider Selling Ratio","weight":10,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"ipo_fever","label":"IPO Fever Index","weight":18,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"retail_frenzy","label":"Retail Frenzy Index","weight":17,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"},{"id":"skyscraper","label":"Skyscraper & Excess","weight":5,"score":<int>,"trend":"<up|down|stable>","detail":"<65chars>"}],"summary":"<max 200 caratteri in italiano senza virgolette>","timestamp":"<ISO8601>"}

composite_score = (markets*50 + insider*10 + ipo_fever*18 + retail_frenzy*17 + skyscraper*5) / 100
markets.score = somma(subsignal.score * subsignal.weight) / 100`;

module.exports = async function handler(req, res) {
  const isCron = req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = req.query.secret === process.env.UPDATE_SECRET;
  if (!isCron && !isManual) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: SYS,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: 'Analizza i mercati globali adesso e restituisci il JSON.' }]
      })
    });
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic ${response.status}: ${errBody}`);
    }
    const data = await response.json();
    const txt = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const s = txt.indexOf('{'), e = txt.lastIndexOf('}') + 1;
    if (s < 0 || e <= s) throw new Error('Nessun JSON nella risposta');
    let raw = txt.slice(s, e)
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
      .replace(/\uFF0C/g, ',')
      .replace(/,(\s*[}\]])/g, '$1');
    const result = JSON.parse(raw);
    result._updated = new Date().toISOString();
    const redis = Redis.fromEnv();
    await redis.set('radar_latest', result);
    return res.status(200).json({ ok: true, score: result.composite_score });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
