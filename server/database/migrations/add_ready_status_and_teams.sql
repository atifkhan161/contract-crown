-- Migration: Add ready status and team assignment to room_players table
-- Date: 2025-01-24

USE contract_crown;

-- Add is_ready column if it doesn't exist
ALTER TABLE room_players 
ADD COLUMN IF NOT EXISTS is_ready BOOLEAN DEFAULT FALSE;

-- Add team_assignment column if it doesn't exist  
ALTER TABLE room_players 
ADD COLUMN IF NOT EXISTS team_assignment INT NULL CHECK (team_assignment IN (1, 2));

-- Update existing records to have default ready status
UPDATE room_players SET is_ready = FALSE WHERE is_ready IS NULL;