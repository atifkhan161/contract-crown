-- Migration: Add demo mode support to games table
-- Date: 2025-02-08
-- Description: Adds is_demo_mode column to games table to support demo games with bots

-- Add is_demo_mode column to games table
ALTER TABLE games 
ADD COLUMN is_demo_mode BOOLEAN NOT NULL DEFAULT FALSE;

-- Add index for demo mode queries
CREATE INDEX idx_games_demo_mode ON games(is_demo_mode);

-- Add is_bot column to users table if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bot_personality ENUM('aggressive', 'conservative', 'balanced') NULL,
ADD COLUMN IF NOT EXISTS bot_difficulty ENUM('easy', 'medium', 'hard') NULL;

-- Add index for bot queries
CREATE INDEX IF NOT EXISTS idx_users_is_bot ON users(is_bot);