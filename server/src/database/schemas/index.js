/**
 * RxDB Schema Definitions
 * Defines all collection schemas for the Contract Crown application
 */

import { 
  validateEmail, 
  validateUsername, 
  validateUUID, 
  validateDateTime,
  validateGameCode,
  validateInviteCode,
  validateCardsPlayed,
  validateRoomSettings,
  validateGameState,
  validateUserAgent,
  validateIPAddress
} from './validators.js';

// Users Collection Schema
export const usersSchema = {
  version: 0,
  primaryKey: 'user_id',
  type: 'object',
  properties: {
    user_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    username: {
      type: 'string',
      minLength: 3,
      maxLength: 50,
      pattern: '^[a-zA-Z0-9_]{3,50}$'
    },
    email: {
      type: 'string',
      maxLength: 100,
      format: 'email'
    },
    password_hash: {
      type: 'string',
      minLength: 1,
      maxLength: 255
    },
    created_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    },
    last_login: {
      type: ['string', 'null'],
      format: 'date-time',
      maxLength: 30
    },
    total_games_played: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    total_games_won: {
      type: 'number',
      minimum: 0,
      default: 0
    },
    is_active: {
      type: 'boolean',
      default: true
    },
    is_bot: {
      type: 'boolean',
      default: false
    }
  },
  required: ['user_id', 'username', 'email', 'password_hash'],
  indexes: ['username', 'email', 'created_at'],
  additionalProperties: false
};

// Games Collection Schema
export const gamesSchema = {
  version: 0,
  primaryKey: 'game_id',
  type: 'object',
  properties: {
    game_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    game_code: {
      type: 'string',
      minLength: 6,
      maxLength: 10,
      pattern: '^[A-Z0-9]{6,10}$'
    },
    status: {
      type: 'string',
      enum: ['waiting', 'in_progress', 'completed', 'cancelled'],
      default: 'waiting',
      maxLength: 15
    },
    host_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    created_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    },
    started_at: {
      type: ['string', 'null'],
      format: 'date-time',
      maxLength: 30
    },
    completed_at: {
      type: ['string', 'null'],
      format: 'date-time',
      maxLength: 30
    },
    winning_team_id: {
      type: ['string', 'null'],
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    target_score: {
      type: 'number',
      minimum: 1,
      maximum: 1000,
      default: 52
    },
    is_demo_mode: {
      type: 'boolean',
      default: false
    }
  },
  required: ['game_id', 'game_code', 'host_id'],
  indexes: ['game_code', 'status', 'created_at', 'host_id'],
  additionalProperties: false
};

// Teams Collection Schema
export const teamsSchema = {
  version: 0,
  primaryKey: 'team_id',
  type: 'object',
  properties: {
    team_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    game_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    team_number: {
      type: 'number',
      enum: [1, 2],
      multipleOf: 1,
      minimum: 1,
      maximum: 2
    },
    current_score: {
      type: 'number',
      minimum: 0,
      maximum: 10000,
      default: 0
    },
    player1_id: {
      type: ['string', 'null'],
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    player2_id: {
      type: ['string', 'null'],
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    }
  },
  required: ['team_id', 'game_id', 'team_number'],
  indexes: ['game_id', ['game_id', 'team_number']],
  additionalProperties: false
};

// Game Players Collection Schema
export const gamePlayersSchema = {
  version: 0,
  primaryKey: 'game_player_id',
  type: 'object',
  properties: {
    game_player_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    game_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    user_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    team_id: {
      type: ['string', 'null'],
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    seat_position: {
      type: 'number',
      minimum: 1,
      maximum: 4,
      multipleOf: 1
    },
    is_ready: {
      type: 'boolean',
      default: false
    },
    is_host: {
      type: 'boolean',
      default: false
    },
    current_hand: {
      type: ['object', 'null']
    },
    tricks_won_current_round: {
      type: 'number',
      minimum: 0,
      maximum: 8,
      default: 0
    },
    joined_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    }
  },
  required: ['game_player_id', 'game_id', 'user_id', 'seat_position'],
  indexes: ['game_id', 'user_id', ['game_id', 'user_id'], ['game_id', 'seat_position']],
  additionalProperties: false
};

// Game Rounds Collection Schema
export const gameRoundsSchema = {
  version: 0,
  primaryKey: 'round_id',
  type: 'object',
  properties: {
    round_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    game_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    round_number: {
      type: 'number',
      minimum: 1,
      maximum: 100,
      multipleOf: 1
    },
    dealer_user_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    first_player_user_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    trump_suit: {
      type: ['string', 'null'],
      enum: ['Hearts', 'Diamonds', 'Clubs', 'Spades', null]
    },
    declaring_team_id: {
      type: ['string', 'null'],
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    declaring_team_tricks_won: {
      type: 'number',
      minimum: 0,
      maximum: 8,
      default: 0
    },
    challenging_team_tricks_won: {
      type: 'number',
      minimum: 0,
      maximum: 8,
      default: 0
    },
    round_completed_at: {
      type: ['string', 'null'],
      format: 'date-time',
      maxLength: 30
    },
    created_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    }
  },
  required: ['round_id', 'game_id', 'round_number', 'dealer_user_id', 'first_player_user_id'],
  indexes: ['game_id', 'round_number', ['game_id', 'round_number']],
  additionalProperties: false
};

// Game Tricks Collection Schema
export const gameTricksSchema = {
  version: 0,
  primaryKey: 'trick_id',
  type: 'object',
  properties: {
    trick_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    round_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    trick_number: {
      type: 'number',
      minimum: 1,
      maximum: 8,
      multipleOf: 1
    },
    leading_player_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    winning_player_id: {
      type: ['string', 'null'],
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    cards_played: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          suit: {
            type: 'string',
            enum: ['Hearts', 'Diamonds', 'Clubs', 'Spades']
          },
          rank: {
            type: 'string',
            enum: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
          }
        },
        required: ['suit', 'rank'],
        additionalProperties: false
      }
    },
    completed_at: {
      type: ['string', 'null'],
      format: 'date-time',
      maxLength: 30
    },
    created_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    }
  },
  required: ['trick_id', 'round_id', 'trick_number', 'leading_player_id', 'cards_played'],
  indexes: ['round_id', ['round_id', 'trick_number']],
  additionalProperties: false
};

// Rooms Collection Schema
export const roomsSchema = {
  version: 0,
  primaryKey: 'room_id',
  type: 'object',
  properties: {
    room_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 50
    },
    max_players: {
      type: 'number',
      minimum: 2,
      maximum: 6,
      default: 4
    },
    owner_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    status: {
      type: 'string',
      enum: ['waiting', 'playing', 'finished'],
      default: 'waiting',
      maxLength: 10
    },
    is_private: {
      type: 'boolean',
      default: false
    },
    invite_code: {
      type: ['string', 'null'],
      minLength: 5,
      maxLength: 5,
      pattern: '^[0-9ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$'
    },
    game_state: {
      type: ['object', 'null'],
      properties: {
        currentRound: { type: ['number', 'null'] },
        currentTrick: { type: ['number', 'null'] },
        phase: { type: ['string', 'null'] },
        trumpSuit: { 
          type: ['string', 'null'],
          enum: ['Hearts', 'Diamonds', 'Clubs', 'Spades', null]
        },
        scores: { type: ['object', 'null'] },
        playerHands: { type: ['object', 'null'] }
      },
      additionalProperties: false
    },
    settings: {
      type: ['object', 'null'],
      properties: {
        timeLimit: {
          type: 'number',
          minimum: 10,
          maximum: 300
        },
        allowSpectators: {
          type: 'boolean'
        },
        autoStart: {
          type: 'boolean'
        }
      },
      additionalProperties: false
    },
    version: {
      type: 'number',
      minimum: 1,
      default: 1
    },
    created_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    },
    updated_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    },
    started_at: {
      type: ['string', 'null'],
      format: 'date-time',
      maxLength: 30
    },
    finished_at: {
      type: ['string', 'null'],
      format: 'date-time',
      maxLength: 30
    }
  },
  required: ['room_id', 'name', 'owner_id'],
  indexes: ['status', 'owner_id', 'created_at', 'version', 'invite_code'],
  additionalProperties: false
};

// Room Players Collection Schema (junction table)
export const roomPlayersSchema = {
  version: 0,
  primaryKey: 'id', // Composite key alternative
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 73, // room_id + user_id with separator
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    room_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    user_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    is_ready: {
      type: 'boolean',
      default: false
    },
    team_assignment: {
      type: ['number', 'null'],
      enum: [1, 2, null]
    },
    joined_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    }
  },
  required: ['id', 'room_id', 'user_id'],
  indexes: ['room_id', 'user_id', ['room_id', 'user_id']],
  additionalProperties: false
};

// User Sessions Collection Schema
export const userSessionsSchema = {
  version: 0,
  primaryKey: 'session_id',
  type: 'object',
  properties: {
    session_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    user_id: {
      type: 'string',
      maxLength: 36,
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    token_hash: {
      type: 'string',
      minLength: 1,
      maxLength: 255
    },
    expires_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    },
    created_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    },
    last_used_at: {
      type: 'string',
      format: 'date-time',
      maxLength: 30
    },
    user_agent: {
      type: ['string', 'null'],
      maxLength: 1000
    },
    ip_address: {
      type: ['string', 'null'],
      maxLength: 45
    }
  },
  required: ['session_id', 'user_id', 'token_hash', 'expires_at'],
  indexes: ['user_id', 'expires_at', 'token_hash'],
  additionalProperties: false
};

// Export all schemas as a collection
export const allSchemas = {
  users: usersSchema,
  games: gamesSchema,
  teams: teamsSchema,
  gamePlayers: gamePlayersSchema,
  gameRounds: gameRoundsSchema,
  gameTricks: gameTricksSchema,
  rooms: roomsSchema,
  roomPlayers: roomPlayersSchema,
  userSessions: userSessionsSchema
};

export default allSchemas;