-- Migration v2: Simplify for Block Blast only
-- Run this ONCE to migrate from old schema to new schema

-- Drop old tables
DROP TABLE IF EXISTS user_boosters CASCADE;
DROP TABLE IF EXISTS boosters CASCADE;
DROP TABLE IF EXISTS scores CASCADE;

-- Recreate scores with new structure
CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  username TEXT NOT NULL,
  raw_score INT NOT NULL,
  multiplier NUMERIC DEFAULT 1.0,
  final_score INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_scores_leaderboard ON scores(date, final_score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_username ON scores(username);
CREATE INDEX IF NOT EXISTS idx_scores_user_date ON scores(username, date);

-- Create daily boosts
CREATE TABLE IF NOT EXISTS daily_boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  username TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  shared_link BOOLEAN DEFAULT FALSE,
  question_answered BOOLEAN DEFAULT FALSE,
  question_correct BOOLEAN DEFAULT FALSE,
  UNIQUE(username, date)
);

-- Create daily questions
CREATE TABLE IF NOT EXISTS daily_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer INT NOT NULL,
  date DATE UNIQUE NOT NULL
);

-- Reset game counts
UPDATE users SET total_games_played = 0;
