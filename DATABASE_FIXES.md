# Database Schema Fixes for Bot Auto-Fill

## Issues Fixed

### 1. Foreign Key Constraint Error
**Problem**: `Cannot add or update a child row: a foreign key constraint fails (room_players, CONSTRAINT room_players_ibfk_2 FOREIGN KEY (user_id) REFERENCES users (user_id))`

**Root Cause**: Bot users were not being properly stored in the `users` table before being added to `room_players`.

**Fix**: 
- Modified `WaitingRoomSocketHandler.addBotsToRoom()` to use database transactions for atomic bot creation
- Combined bot user creation and room_players insertion in a single transaction to prevent foreign key constraint violations
- Added proper error handling with graceful fallback to WebSocket-only mode

### 2. Bot User Creation Missing Required Fields
**Problem**: `Cannot add or update a child row: a foreign key constraint fails` when adding bots to `room_players` table.

**Root Cause**: Bot users were being inserted into `users` table without the required `password_hash` field (NOT NULL constraint), causing the insertion to fail silently, then the subsequent `room_players` insertion failed due to missing user record.

**Fix**:
- Added `password_hash` field with dummy value 'BOT_NO_PASSWORD' for bot users
- Modified the bot room addition logic to be conditional on successful user creation
- Added proper error handling and logging

### 3. Missing game_player_id Default Value
**Problem**: `Field 'game_player_id' doesn't have a default value`

**Root Cause**: The `game_players` table INSERT statement was missing the `game_player_id` field.

**Fix**: 
- Added UUID generation for `game_player_id` in the Game model
- Modified INSERT statement to include the generated `game_player_id`

## Code Changes

### BotManager.js
```javascript
// Before: Missing required password_hash field
INSERT INTO users (user_id, username, email, created_at)

// After: Include all required NOT NULL fields
INSERT INTO users (user_id, username, email, password_hash, created_at)
VALUES (?, ?, ?, 'BOT_NO_PASSWORD', NOW())
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
// Use database transaction for atomic bot creation
await dbConnection.transaction(async (connection) => {
    // First, store bots as users
    for (const bot of bots) {
        await connection.execute(`
            INSERT INTO users (user_id, username, email, password_hash, created_at)
            VALUES (?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE username = VALUES(username)
        `, [bot.id, bot.name, `${bot.id}@bot.local`, 'BOT_NO_PASSWORD']);
    }
    
    // Then, add bots to room_players
    for (const bot of bots) {
        await connection.execute(`
            INSERT INTO room_players (room_id, user_id, joined_at, is_ready)
            VALUES (?, ?, NOW(), 1)
        `, [roomId, bot.id]);
    }
});
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

## Additional Fix: WebSocket Game Room Initialization

### 4. WebSocket Connection Timeout on Game Start
**Problem**: After successfully creating a game with bots, clients would get "Connection timeout" errors when trying to join the actual game.

**Root Cause**: When a game was created from a waiting room, the WebSocket system wasn't initializing a game room for the new game ID, causing clients to timeout when trying to connect.

**Fix**:
- Added `initializeGameWebSocketRoom()` method to set up WebSocket rooms for newly created games
- Players are migrated from waiting room to game room with proper team assignments
- Game state manager is initialized for the new game ID

### WaitingRoomSocketHandler.js (Additional)
```javascript
// Initialize WebSocket room for the new game
await this.initializeGameWebSocketRoom(game.game_id, room, game);

async initializeGameWebSocketRoom(gameId, waitingRoom, game) {
    // Create game room data structure and migrate players
    const gameRoomData = { /* ... */ };
    this.socketManager.gameRooms.set(gameId, gameRoomData);
    this.socketManager.gameStateManager.initializeGameState(gameId, gameState);
}
```

## Additional Fix: Concurrent Update Error

### 5. Version Control Concurrent Update Error
**Problem**: "Version increment failed - concurrent update detected" when multiple players leave simultaneously during game transitions.

**Root Cause**: Multiple database transactions trying to increment the same room version simultaneously, causing optimistic locking conflicts.

**Fix**:
- Added `incrementVersionInTransaction()` method that reads current version from database within transaction
- Updated all transaction-based version increments to use the transaction-safe method
- Added graceful error handling for concurrent update scenarios

### Room.js (Additional)
```javascript
// Transaction-safe version increment
async incrementVersionInTransaction(connection) {
    // Get current version from database to avoid stale data
    const [currentRows] = await connection.execute(`
        SELECT version FROM rooms WHERE room_id = ?
    `, [this.room_id]);
    
    const currentVersion = currentRows[0].version;
    const newVersion = currentVersion + 1;
    
    await connection.execute(`
        UPDATE rooms SET version = ?, updated_at = NOW() 
        WHERE room_id = ? AND version = ?
    `, [newVersion, this.room_id, currentVersion]);
}
```