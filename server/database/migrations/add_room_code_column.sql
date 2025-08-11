-- Migration to add room_code column to rooms table
-- This script can be run manually or integrated into your migration system
USE contract_crown;
-- Add room_code column if it doesn't exist
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_code VARCHAR(5);

-- Add version column if it doesn't exist  
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;

-- Create unique index on room_code for performance and uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_code_unique ON rooms(room_code);

-- Create regular index on version for optimistic locking
CREATE INDEX IF NOT EXISTS idx_rooms_version ON rooms(version);

-- Update existing rooms to have version = 1 if NULL
UPDATE rooms SET version = 1 WHERE version IS NULL;

-- Optional: Generate room codes for existing rooms that don't have them
-- Uncomment the following lines if you want to add codes to existing rooms

-- UPDATE rooms 
-- SET room_code = UPPER(SUBSTR(REPLACE(REPLACE(REPLACE(room_id, '-', ''), 'a', 'A'), 'e', 'E'), 1, 5))
-- WHERE room_code IS NULL OR room_code = '';