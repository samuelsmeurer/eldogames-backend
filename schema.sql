-- El Dorado Games - Database Schema
-- Run this in Railway PostgreSQL console or via psql

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  total_games_played INT DEFAULT 0
);

-- Scores
CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  username TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('block_blast', 'crypto_runner')),
  score INT NOT NULL,
  coins INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_scores_leaderboard ON scores(game_type, date, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_username ON scores(username, game_type);

-- Boosters
CREATE TABLE IF NOT EXISTS boosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  reward_value NUMERIC NOT NULL,
  active BOOLEAN DEFAULT TRUE
);

-- User booster tracking
CREATE TABLE IF NOT EXISTS user_boosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  booster_id UUID REFERENCES boosters(id),
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, booster_id)
);

-- Seed boosters (only insert if empty)
INSERT INTO boosters (task_type, title, description, reward_type, reward_value)
SELECT * FROM (VALUES
  ('play_3_games', 'Jugador Activo', 'Juega 3 partidas de cualquier juego', 'multiplier', 1.5),
  ('score_5000_blockblast', 'Maestro de Bloques', 'Alcanza 5.000 pts en Block Blast', 'bonus_points', 500),
  ('score_10000_runner', 'Corredor Veloz', 'Alcanza 10.000m en Crypto Runner', 'bonus_points', 1000),
  ('first_game', 'Primera Partida', 'Juega tu primera partida', 'bonus_points', 100)
) AS v(task_type, title, description, reward_type, reward_value)
WHERE NOT EXISTS (SELECT 1 FROM boosters LIMIT 1);
