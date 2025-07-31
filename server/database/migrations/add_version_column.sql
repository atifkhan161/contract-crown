-- Add version column to rooms table for optimistic concurrency control
-- This migration adds the version column needed for state synchronization

USE contract_crown;

-- Add version column to rooms table
ALTER TABLE rooms 
ADD COLUMN version INT NOT NULL DEFAULT 1 
AFTER updated_at;

-- Add index on version for better performance
CREATE INDEX idx_rooms_version ON rooms(version);

-- Update existing rooms to have version 1
UPDATE rooms SET version = 1 WHERE version IS NULL;