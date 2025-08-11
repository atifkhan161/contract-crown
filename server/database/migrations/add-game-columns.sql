-- Migration: Add missing columns for game functionality
-- Run this if you have an existing database

USE contract_crown;

-- Add is_demo_mode column to games table if it doesn't exist
ALTER TABLE games
ADD COLUMN IF NOT EXISTS is_demo_mode BOOLEAN DEFAULT FALSE;

-- Add is_bot column to users table if it doesn't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE;

-- Add created_at column to room_players table if it doesn't exist (some queries expect this)
ALTER TABLE room_players
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Verify the columns were added
DESCRIBE games;

DESCRIBE users;

DESCRIBE room_players;

SELECT 'Migration completed successfully' as status;