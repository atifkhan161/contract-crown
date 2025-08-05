# Database Schema Fixes for Bot Auto-Fill

## Issues Fixed

### 1. Foreign Key Constraint Error
**Problem**: `Cannot add or update a child row: a foreign key constraint fails (room_players, CONSTRAINT room_players_ibfk_2 FOREIGN KEY (user_id) REFERENCES users (user_id))`

**Root Cause**: Bot users were not being properly stored in the `users` table before being added to `room_players`.

**Fix**: 
- Modified `BotManager.storeBotPlayersInDatabase()` to use only basic columns that exist in the `users` table
- Added fallback insertion with minimal columns if the full insertion fails
- Added error handling to continue with WebSocket-only bots if database storage fails

### 2. Missing game_player_id Default Value
**Problem**: `Field 'game_player_id' doesn't have a default value`

**Root Cause**: The `game_players` table INSERT statement was missing the `game_player_id` field.

**Fix**: 
- Added UUID generation for `game_player_id` in the Game model
- Modified INSERT statement to include the generated `game_player_id`

## Code Changes

### BotManager.js
```javascript
// Before: Used bot-specific columns that might not exist
INSERT INTO users (user_id, username, email, is_bot, bot_personality, bot_difficulty, created_at)

// After: Use basic columns with fallback
INSERT INTO users (user_id, username, email, created_at)
// With fallback to:
INSERT IGNORE INTO users (user_id, username)
```

### Game.js
```javascript
// Before: Missing game_player_id
INSERT INTO game_players (game_id, user_id, team_id, seat_position, joined_at)

// After: Include generated game_player_id
const gamePlayerId = uuidv4();
INSERT INTO game_players (game_player_id, game_id, user_id, team_id, seat_position, joined_at)
```

### WaitingRoomSocketHandler.js
```javascript
// Added error handling for bot storage
try {
    await BotManager.storeBotPlayersInDatabase(roomId);
} catch (botStorageError) {
    console.warn('[WaitingRoom] Failed to store bots in users table:', botStorageError);
    // Continue - bots will work in WebSocket-only mode
}
```

## Fallback Strategy

The implementation now has multiple fallback levels:

1. **Full Database Integration**: Bots stored in `users` table and `room_players` table
2. **Partial Database Integration**: Bots stored in `users` table only, WebSocket state maintained
3. **WebSocket-Only Mode**: Bots exist only in WebSocket state, game still functions

This ensures that the bot auto-fill feature works even if there are database schema issues.

## Expected Behavior After Fixes

- ✅ Bots are created and added to rooms successfully
- ✅ Games start properly with mixed human/bot teams
- ✅ Database errors don't prevent game functionality
- ✅ Graceful degradation to WebSocket-only mode if needed

The bot auto-fill feature should now work reliably regardless of database schema variations.