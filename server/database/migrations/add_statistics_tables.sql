-- Add statistics columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS total_tricks_won INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_score INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_game_played TIMESTAMP NULL;

-- Create game statistics table
CREATE TABLE IF NOT EXISTS game_statistics (
    stat_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    game_id VARCHAR(36) NOT NULL,
    duration_ms BIGINT,
    player_stats JSON,
    trump_stats JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    INDEX idx_game_statistics_game_id (game_id),
    INDEX idx_game_statistics_created_at (created_at)
);

-- Create user achievements table (for future expansion)
CREATE TABLE IF NOT EXISTS user_achievements (
    achievement_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    achievement_type VARCHAR(50) NOT NULL,
    achievement_data JSON,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_achievements_user_id (user_id),
    INDEX idx_user_achievements_type (achievement_type),
    INDEX idx_user_achievements_earned_at (earned_at)
);

-- Create indexes for better performance on statistics queries
CREATE INDEX IF NOT EXISTS idx_users_games_played ON users(total_games_played);
CREATE INDEX IF NOT EXISTS idx_users_games_won ON users(total_games_won);
CREATE INDEX IF NOT EXISTS idx_users_last_game ON users(last_game_played);

-- Create view for leaderboard
CREATE OR REPLACE VIEW leaderboard_view AS
SELECT 
    user_id,
    username,
    total_games_played,
    total_games_won,
    total_tricks_won,
    total_score,
    CASE 
        WHEN total_games_played > 0 
        THEN ROUND((total_games_won * 100.0 / total_games_played), 1)
        ELSE 0 
    END as win_rate,
    CASE 
        WHEN total_games_played > 0 
        THEN ROUND((total_score * 1.0 / total_games_played), 1)
        ELSE 0 
    END as average_score,
    CASE 
        WHEN total_games_played > 0 
        THEN ROUND((total_tricks_won * 1.0 / total_games_played), 1)
        ELSE 0 
    END as average_tricks_per_game
FROM users
WHERE total_games_played > 0
ORDER BY win_rate DESC, total_games_won DESC, total_score DESC;