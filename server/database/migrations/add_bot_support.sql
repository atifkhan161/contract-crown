-- Add bot support to users table
-- This migration adds columns to support bot players

USE contract_crown;

-- Add bot-specific columns to users table
ALTER TABLE users 
ADD COLUMN is_bot BOOLEAN DEFAULT FALSE AFTER is_active,
ADD COLUMN bot_personality ENUM('aggressive', 'conservative', 'balanced') NULL AFTER is_bot,
ADD COLUMN bot_difficulty ENUM('easy', 'medium', 'hard') NULL AFTER bot_personality,
ADD COLUMN bot_aggressiveness DECIMAL(3,2) NULL AFTER bot_difficulty,
ADD COLUMN bot_risk_tolerance DECIMAL(3,2) NULL AFTER bot_aggressiveness;

-- Add index for bot queries
ALTER TABLE users ADD INDEX idx_is_bot (is_bot);

-- Allow NULL password for bot users
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;

-- Allow NULL email for bot users (but keep unique constraint for non-null values)
ALTER TABLE users MODIFY COLUMN email VARCHAR(100) NULL;
ALTER TABLE users DROP INDEX email;
ALTER TABLE users ADD UNIQUE INDEX idx_email_unique (email);

-- Add demo mode support to games table
ALTER TABLE games 
ADD COLUMN is_demo_mode BOOLEAN DEFAULT FALSE AFTER target_score,
ADD INDEX idx_demo_mode (is_demo_mode);

-- Update game_players table to track bot-specific data
ALTER TABLE game_players 
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER joined_at;