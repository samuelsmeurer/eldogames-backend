require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Middleware
app.use(cors());
app.use(express.json());

// Static files (serve frontend)
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

// ========== API ROUTES ==========

// --- Users ---

// Check username availability
app.get('/api/users/check/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const result = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    res.json({ available: result.rows.length === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create user
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
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Get user
app.get('/api/users/:username', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [req.params.username.toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Scores ---

// Submit score
app.post('/api/scores', async (req, res) => {
  try {
    const { username, game_type, score, coins } = req.body;
    if (!username || !game_type || score == null) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Get user_id
    const userResult = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    const user_id = userResult.rows.length > 0 ? userResult.rows[0].id : null;

    const result = await pool.query(
      `INSERT INTO scores (user_id, username, game_type, score, coins)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user_id, username.toLowerCase(), game_type, score, coins || 0]
    );

    // Increment total_games_played
    if (user_id) {
      await pool.query(
        'UPDATE users SET total_games_played = total_games_played + 1 WHERE id = $1',
        [user_id]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get best score
app.get('/api/scores/best', async (req, res) => {
  try {
    const { username, game_type } = req.query;
    if (!username || !game_type) {
      return res.status(400).json({ error: 'Missing username or game_type' });
    }
    const result = await pool.query(
      'SELECT score FROM scores WHERE username = $1 AND game_type = $2 ORDER BY score DESC LIMIT 1',
      [username.toLowerCase(), game_type]
    );
    res.json({ score: result.rows.length > 0 ? result.rows[0].score : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Leaderboard ---

// Daily leaderboard
app.get('/api/leaderboard/daily', async (req, res) => {
  try {
    const { game_type, limit } = req.query;
    const lim = parseInt(limit) || 10;

    let query, params;
    if (game_type && game_type !== 'all') {
      query = `
        SELECT DISTINCT ON (username) username, score, game_type, coins
        FROM scores
        WHERE date = CURRENT_DATE AND game_type = $1
        ORDER BY username, score DESC
      `;
      params = [game_type];
    } else {
      query = `
        SELECT DISTINCT ON (username) username, score, game_type, coins
        FROM scores
        WHERE date = CURRENT_DATE
        ORDER BY username, score DESC
      `;
      params = [];
    }

    // Wrap to sort by score and limit
    const result = await pool.query(
      `SELECT * FROM (${query}) sub ORDER BY score DESC LIMIT $${params.length + 1}`,
      [...params, lim]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global leaderboard
app.get('/api/leaderboard/global', async (req, res) => {
  try {
    const { game_type, limit } = req.query;
    const lim = parseInt(limit) || 50;

    let query, params;
    if (game_type && game_type !== 'all') {
      query = `
        SELECT DISTINCT ON (username) username, score, game_type, coins
        FROM scores
        WHERE game_type = $1
        ORDER BY username, score DESC
      `;
      params = [game_type];
    } else {
      query = `
        SELECT DISTINCT ON (username) username, score, game_type, coins
        FROM scores
        ORDER BY username, score DESC
      `;
      params = [];
    }

    const result = await pool.query(
      `SELECT * FROM (${query}) sub ORDER BY score DESC LIMIT $${params.length + 1}`,
      [...params, lim]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User position in daily leaderboard
app.get('/api/leaderboard/daily/position/:username', async (req, res) => {
  try {
    const { game_type } = req.query;
    const username = req.params.username.toLowerCase();

    let query, params;
    if (game_type && game_type !== 'all') {
      query = `
        SELECT DISTINCT ON (username) username, score, game_type
        FROM scores
        WHERE date = CURRENT_DATE AND game_type = $1
        ORDER BY username, score DESC
      `;
      params = [game_type];
    } else {
      query = `
        SELECT DISTINCT ON (username) username, score, game_type
        FROM scores
        WHERE date = CURRENT_DATE
        ORDER BY username, score DESC
      `;
      params = [];
    }

    const result = await pool.query(
      `SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) as rank FROM (${query}) sub`,
      params
    );

    const userRow = result.rows.find(r => r.username === username);
    if (!userRow) {
      return res.json({ rank: null, score: 0, username });
    }
    res.json({ rank: parseInt(userRow.rank), score: userRow.score, game_type: userRow.game_type, username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Boosters ---

// Get available boosters
app.get('/api/boosters', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM boosters WHERE active = true'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user boosters
app.get('/api/boosters/user/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ub.*, b.task_type, b.title, b.description, b.reward_type, b.reward_value
       FROM user_boosters ub
       JOIN boosters b ON b.id = ub.booster_id
       WHERE ub.user_id = $1`,
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check booster progress
app.get('/api/boosters/progress/:username', async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const result = await pool.query(
      'SELECT game_type, score FROM scores WHERE username = $1',
      [username]
    );

    const scores = result.rows;
    const totalGames = scores.length;
    const bestBlockBlast = Math.max(0, ...scores.filter(s => s.game_type === 'block_blast').map(s => s.score), 0);
    const bestRunner = Math.max(0, ...scores.filter(s => s.game_type === 'crypto_runner').map(s => s.score), 0);

    res.json({
      play_3_games: { current: totalGames, target: 3, done: totalGames >= 3 },
      score_5000_blockblast: { current: bestBlockBlast, target: 5000, done: bestBlockBlast >= 5000 },
      score_10000_runner: { current: bestRunner, target: 10000, done: bestRunner >= 10000 },
      first_game: { current: totalGames > 0 ? 1 : 0, target: 1, done: totalGames > 0 },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Complete booster
app.post('/api/boosters/complete', async (req, res) => {
  try {
    const { user_id, booster_id } = req.body;
    if (!user_id || !booster_id) {
      return res.status(400).json({ error: 'Missing user_id or booster_id' });
    }
    const result = await pool.query(
      `INSERT INTO user_boosters (user_id, booster_id, completed, completed_at)
       VALUES ($1, $2, true, NOW())
       ON CONFLICT (user_id, booster_id) DO UPDATE SET completed = true, completed_at = NOW()
       RETURNING *`,
      [user_id, booster_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Admin: Reset DB ---
app.post('/api/admin/reset', async (req, res) => {
  try {
    await pool.query('DELETE FROM scores');
    await pool.query('DELETE FROM user_boosters');
    await pool.query('UPDATE users SET total_games_played = 0');
    res.json({ ok: true, message: 'Database reset: scores, boosters cleared, game counts reset.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SPA FALLBACK ==========
// Serve index.html for non-API routes that don't match a file
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== START ==========
migrate().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] El Dorado Games running on port ${PORT}`);
  });
});
