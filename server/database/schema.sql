-- Contract Crown Database Schema
-- MariaDB/MySQL compatible

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS contract_crown 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE contract_crown;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    total_games_played INT DEFAULT 0,
    total_games_won INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_bot BOOLEAN DEFAULT FALSE,
    
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Games table
CREATE TABLE IF NOT EXISTS games (
    game_id VARCHAR(36) PRIMARY KEY,
    game_code VARCHAR(10) UNIQUE NOT NULL,
    status ENUM('waiting', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'waiting',
    host_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    winning_team_id VARCHAR(36) NULL,
    target_score INT NOT NULL DEFAULT 52,
    is_demo_mode BOOLEAN DEFAULT FALSE,
    
    FOREIGN KEY (host_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_game_code (game_code),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    team_id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    team_number INT NOT NULL CHECK (team_number IN (1, 2)),
    current_score INT DEFAULT 0,
    player1_id VARCHAR(36) NULL,
    player2_id VARCHAR(36) NULL,
    
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    FOREIGN KEY (player1_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (player2_id) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE KEY unique_team_per_game (game_id, team_number),
    INDEX idx_game_id (game_id)
) ENGINE=InnoDB;

-- Game Players table
CREATE TABLE IF NOT EXISTS game_players (
    game_player_id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    team_id VARCHAR(36) NULL,
    seat_position INT NOT NULL CHECK (seat_position BETWEEN 1 AND 4),
    is_ready BOOLEAN DEFAULT FALSE,
    is_host BOOLEAN DEFAULT FALSE,
    current_hand JSON NULL,
    tricks_won_current_round INT DEFAULT 0,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE SET NULL,
    UNIQUE KEY unique_player_per_game (game_id, user_id),
    UNIQUE KEY unique_seat_per_game (game_id, seat_position),
    INDEX idx_game_id (game_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- Game Rounds table
CREATE TABLE IF NOT EXISTS game_rounds (
    round_id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    round_number INT NOT NULL,
    dealer_user_id VARCHAR(36) NOT NULL,
    first_player_user_id VARCHAR(36) NOT NULL,
    trump_suit VARCHAR(10) NULL CHECK (trump_suit IN ('Hearts', 'Diamonds', 'Clubs', 'Spades')),
    declaring_team_id VARCHAR(36) NULL,
    declaring_team_tricks_won INT DEFAULT 0,
    challenging_team_tricks_won INT DEFAULT 0,
    round_completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    FOREIGN KEY (dealer_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (first_player_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (declaring_team_id) REFERENCES teams(team_id) ON DELETE SET NULL,
    UNIQUE KEY unique_round_per_game (game_id, round_number),
    INDEX idx_game_id (game_id),
    INDEX idx_round_number (round_number)
) ENGINE=InnoDB;

-- Game Tricks table (for detailed trick tracking)
CREATE TABLE IF NOT EXISTS game_tricks (
    trick_id VARCHAR(36) PRIMARY KEY,
    round_id VARCHAR(36) NOT NULL,
    trick_number INT NOT NULL CHECK (trick_number BETWEEN 1 AND 8),
    leading_player_id VARCHAR(36) NOT NULL,
    winning_player_id VARCHAR(36) NULL,
    cards_played JSON NOT NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (round_id) REFERENCES game_rounds(round_id) ON DELETE CASCADE,
    FOREIGN KEY (leading_player_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (winning_player_id) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE KEY unique_trick_per_round (round_id, trick_number),
    INDEX idx_round_id (round_id)
) ENGINE=InnoDB;

-- Rooms table (for room-based game lobbies)
CREATE TABLE IF NOT EXISTS rooms (
    room_id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    max_players INT NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 2 AND 6),
    owner_id VARCHAR(36) NOT NULL,
    status ENUM('waiting', 'playing', 'finished') NOT NULL DEFAULT 'waiting',
    is_private BOOLEAN DEFAULT FALSE,
    invite_code VARCHAR(5) NULL,
    game_state JSON NULL,
    settings JSON NULL,
    version INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    finished_at TIMESTAMP NULL,
    
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY unique_invite_code (invite_code),
    INDEX idx_status (status),
    INDEX idx_owner_id (owner_id),
    INDEX idx_created_at (created_at),
    INDEX idx_version (version)
) ENGINE=InnoDB;

-- Room Players table (for tracking players in rooms)
CREATE TABLE IF NOT EXISTS room_players (
    room_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    is_ready BOOLEAN DEFAULT FALSE,
    team_assignment INT NULL CHECK (team_assignment IN (1, 2)),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_room_id (room_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- User Sessions table (for JWT token management)
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT NULL,
    ip_address VARCHAR(45) NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_expires_at (expires_at),
    INDEX idx_token_hash (token_hash)
) ENGINE=InnoDB;