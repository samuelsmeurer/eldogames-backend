require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Middleware
app.use(cors());
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  index: 'index.html',
}));

// ========== AUTO-MIGRATE ==========
async function migrate() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('[DB] Schema applied successfully');
  } catch (err) {
    console.error('[DB] Migration error:', err.message);
  }
}

// ========== DAILY QUESTIONS POOL ==========
const QUESTIONS_POOL = [
  { q: 'Cual es la stablecoin mas utilizada del mundo?', options: ['USDT', 'USDC', 'DAI', 'BUSD'], answer: 0 },
  { q: 'Si estoy comprando USDT de una orden en El Dorado, yo soy un:', options: ['Maker', 'Taker', 'Trader', 'Holder'], answer: 1 },
  { q: 'Que significa "HODL" en cripto?', options: ['Vender rapido', 'Mantener a largo plazo', 'Comprar mas', 'Hacer trading'], answer: 1 },
  { q: 'En que ano se creo Bitcoin?', options: ['2007', '2009', '2011', '2013'], answer: 1 },
  { q: 'Que blockchain usa El Dorado para transferencias?', options: ['Bitcoin', 'Ethereum', 'Tron', 'Varias redes'], answer: 3 },
  { q: 'Que es una wallet en cripto?', options: ['Un exchange', 'Una billetera digital', 'Un token', 'Un banco'], answer: 1 },
  { q: 'Cual es el simbolo de Ethereum?', options: ['BTC', 'ETH', 'XRP', 'SOL'], answer: 1 },
  { q: 'Que significa P2P?', options: ['Pay to Play', 'Peer to Peer', 'Point to Point', 'Price to Price'], answer: 1 },
  { q: 'Que es KYC?', options: ['Una criptomoneda', 'Verificacion de identidad', 'Un tipo de wallet', 'Un exchange'], answer: 1 },
  { q: 'Cuantos Bitcoin existiran como maximo?', options: ['10 millones', '21 millones', '100 millones', 'Infinitos'], answer: 1 },
  { q: 'Que es un NFT?', options: ['Una moneda', 'Un token no fungible', 'Un exchange', 'Una blockchain'], answer: 1 },
  { q: 'Que red es conocida por sus bajas comisiones?', options: ['Bitcoin', 'Ethereum', 'Tron', 'Ninguna'], answer: 2 },
  { q: 'Que es DeFi?', options: ['Finanzas descentralizadas', 'Un token', 'Un banco digital', 'Una app'], answer: 0 },
  { q: 'Que significa "gas" en Ethereum?', options: ['Combustible', 'Comision de transaccion', 'Un token', 'Velocidad'], answer: 1 },
];

// Ensure today's question exists in DB
async function ensureDailyQuestion() {
  const today = new Date().toISOString().split('T')[0];
  const existing = await pool.query('SELECT id FROM daily_questions WHERE date = $1', [today]);
  if (existing.rows.length === 0) {
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const q = QUESTIONS_POOL[dayOfYear % QUESTIONS_POOL.length];
    await pool.query(
      'INSERT INTO daily_questions (question, options, correct_answer, date) VALUES ($1, $2, $3, $4) ON CONFLICT (date) DO NOTHING',
      [q.q, JSON.stringify(q.options), q.answer, today]
    );
  }
}

// ========== AUTH (WebView entry point) ==========

app.get('/auth', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { user_id, username } = payload;
    if (!username) {
      return res.status(400).json({ error: 'Invalid token payload' });
    }
    const result = await pool.query(
      `INSERT INTO users (id, username)
       VALUES (COALESCE($1, gen_random_uuid()), $2)
       ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
       RETURNING *`,
      [user_id || null, username.toLowerCase()]
    );
    const user = result.rows[0];
    res.redirect(`/?user=${encodeURIComponent(user.username)}&uid=${user.id}`);
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
    res.status(500).json({ error: err.message });
  }
});

// Dev-only: generate test token
if (process.env.NODE_ENV !== 'production') {
  app.get('/auth/test-token', (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const token = jwt.sign({ username, user_id: null }, JWT_SECRET, { expiresIn: '5m' });
    res.json({ token, url: `/auth?token=${token}` });
  });
}

// ========== API ROUTES ==========

// --- Users ---

app.get('/api/users/check/:username', async (req, res) => {
  try {
    const result = await pool.query('SELECT id FROM users WHERE username = $1', [req.params.username.toLowerCase()]);
    res.json({ available: result.rows.length === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Invalid username' });
    }
    const result = await pool.query(
      'INSERT INTO users (username) VALUES ($1) RETURNING *',
      [username.toLowerCase()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:username', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [req.params.username.toLowerCase()]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Game Count (for seeded RNG) ---

app.get('/api/games/count/:username', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM scores WHERE username = $1 AND date = CURRENT_DATE',
      [req.params.username.toLowerCase()]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Scores ---

app.post('/api/scores', async (req, res) => {
  try {
    const { username, raw_score, multiplier, final_score } = req.body;
    if (!username || raw_score == null || final_score == null) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    const user_id = userResult.rows.length > 0 ? userResult.rows[0].id : null;

    const result = await pool.query(
      `INSERT INTO scores (user_id, username, raw_score, multiplier, final_score)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user_id, username.toLowerCase(), raw_score, multiplier || 1.0, final_score]
    );

    if (user_id) {
      await pool.query('UPDATE users SET total_games_played = total_games_played + 1 WHERE id = $1', [user_id]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scores/best/:username', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT final_score FROM scores WHERE username = $1 ORDER BY final_score DESC LIMIT 1',
      [req.params.username.toLowerCase()]
    );
    res.json({ score: result.rows.length > 0 ? result.rows[0].final_score : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Leaderboard ---

app.get('/api/leaderboard/daily', async (req, res) => {
  try {
    const lim = parseInt(req.query.limit) || 10;
    const result = await pool.query(
      `SELECT DISTINCT ON (username) username, final_score, multiplier
       FROM scores
       WHERE date = CURRENT_DATE
       ORDER BY username, final_score DESC`
    );
    // Sort by final_score and limit
    const sorted = result.rows.sort((a, b) => b.final_score - a.final_score).slice(0, lim);
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leaderboard/daily/position/:username', async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const result = await pool.query(
      `SELECT DISTINCT ON (username) username, final_score
       FROM scores
       WHERE date = CURRENT_DATE
       ORDER BY username, final_score DESC`
    );
    const sorted = result.rows.sort((a, b) => b.final_score - a.final_score);
    const idx = sorted.findIndex(r => r.username === username);
    if (idx === -1) return res.json({ rank: null, score: 0, username });
    res.json({ rank: idx + 1, score: sorted[idx].final_score, username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Daily Boosts ---

// Get today's boost status for user
app.get('/api/daily-boosts/:username', async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const result = await pool.query(
      'SELECT * FROM daily_boosts WHERE username = $1 AND date = CURRENT_DATE',
      [username]
    );
    if (result.rows.length === 0) {
      return res.json({ shared_link: false, question_answered: false, question_correct: false });
    }
    const row = result.rows[0];
    res.json({
      shared_link: row.shared_link,
      question_answered: row.question_answered,
      question_correct: row.question_correct,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark share link as completed
app.post('/api/daily-boosts/share', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Missing username' });

    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    const user_id = userResult.rows.length > 0 ? userResult.rows[0].id : null;

    const result = await pool.query(
      `INSERT INTO daily_boosts (user_id, username, shared_link)
       VALUES ($1, $2, true)
       ON CONFLICT (username, date) DO UPDATE SET shared_link = true
       RETURNING *`,
      [user_id, username.toLowerCase()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Answer daily question
app.post('/api/daily-boosts/question', async (req, res) => {
  try {
    const { username, answer } = req.body;
    if (!username || answer == null) return res.status(400).json({ error: 'Missing fields' });

    // Check if already answered today
    const existing = await pool.query(
      'SELECT question_answered FROM daily_boosts WHERE username = $1 AND date = CURRENT_DATE',
      [username.toLowerCase()]
    );
    if (existing.rows.length > 0 && existing.rows[0].question_answered) {
      return res.status(409).json({ error: 'Already answered today' });
    }

    // Get today's question
    await ensureDailyQuestion();
    const qResult = await pool.query('SELECT * FROM daily_questions WHERE date = CURRENT_DATE');
    if (qResult.rows.length === 0) return res.status(404).json({ error: 'No question today' });

    const question = qResult.rows[0];
    const correct = answer === question.correct_answer;

    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    const user_id = userResult.rows.length > 0 ? userResult.rows[0].id : null;

    await pool.query(
      `INSERT INTO daily_boosts (user_id, username, question_answered, question_correct)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (username, date) DO UPDATE SET question_answered = true, question_correct = $3
       RETURNING *`,
      [user_id, username.toLowerCase(), correct]
    );

    res.json({ correct, correct_answer: question.correct_answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get today's question (without the answer)
app.get('/api/daily-question', async (req, res) => {
  try {
    await ensureDailyQuestion();
    const result = await pool.query('SELECT question, options, date FROM daily_questions WHERE date = CURRENT_DATE');
    if (result.rows.length === 0) return res.status(404).json({ error: 'No question today' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Multiplier calculation ---
app.get('/api/multiplier/:username', async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const result = await pool.query(
      'SELECT shared_link, question_correct FROM daily_boosts WHERE username = $1 AND date = CURRENT_DATE',
      [username]
    );
    let multiplier = 1.0;
    if (result.rows.length > 0) {
      if (result.rows[0].shared_link) multiplier *= 1.1;
      if (result.rows[0].question_correct) multiplier *= 1.1;
    }
    res.json({ multiplier: parseFloat(multiplier.toFixed(4)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Admin: Reset DB ---
app.post('/api/admin/reset', async (req, res) => {
  try {
    await pool.query('DELETE FROM daily_boosts');
    await pool.query('DELETE FROM scores');
    await pool.query('UPDATE users SET total_games_played = 0');
    res.json({ ok: true, message: 'Database reset.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SPA FALLBACK ==========
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== START ==========
migrate().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] El Dorado Games running on port ${PORT}`);
  });
});
