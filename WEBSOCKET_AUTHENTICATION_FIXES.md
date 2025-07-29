# WebSocket Authentication & Synchronization Bug Fixes

## Issues Identified

### 1. User ID Field Mismatch
**Problem**: The JWT token uses `id` field but WebSocket code expects `userId` field, causing authentication mismatches.

**Root Cause**: 
- JWT token payload uses `id: user.user_id` (from auth.js line 195)
- WebSocket authentication middleware tries both `decoded.userId || decoded.id` but inconsistent usage
- Frontend sends `userId: this.currentUser.user_id || this.currentUser.id` but database uses `user_id`

### 2. Database Field Inconsistencies
**Problem**: Mixed usage of `user_id`, `userId`, and `id` fields across the application.

**Database Schema**:
- Users table: `user_id` (VARCHAR(36) PRIMARY KEY)
- Rooms table: `owner_id` (VARCHAR(36) FOREIGN KEY to users.user_id)
- All foreign keys reference `user_id`

### 3. WebSocket Room Management Issues
**Problem**: Players frequently disconnect due to authentication and room state synchronization issues.

**Issues**:
- User ID comparison failures (string vs number, different field names)
- Room state not properly synchronized between WebSocket and database
- Connection status not properly tracked
- Host transfer logic inconsistent

### 4. Frontend-Backend User ID Mapping
**Problem**: Frontend uses different user ID field names than backend expects.

**Frontend Issues**:
- `this.currentUser.user_id || this.currentUser.id` inconsistent access
- WebSocket events use different user ID field names
- Authentication token parsing inconsistent

## Fixes Implemented

### 1. Standardize User ID Field Usage
- JWT token will use `id` field (already correct)
- WebSocket middleware will normalize to `userId` for socket object
- All comparisons will use string conversion for consistency
- Database queries will use `user_id` (already correct)

### 2. Fix WebSocket Authentication
- Ensure consistent user ID extraction from JWT
- Normalize user ID field names in socket events
- Add proper error handling for authentication failures

### 3. Improve Room State Synchronization
- Fix host ID comparisons using string conversion
- Ensure database and WebSocket state consistency
- Add proper reconnection handling

### 4. Frontend User ID Standardization
- Standardize user ID access patterns
- Ensure consistent field names in WebSocket events
- Add fallback mechanisms for user ID retrieval

## Files Modified

1. `server/websocket/socketManager.js` - WebSocket authentication and room management
2. `client/src/pages/lobby.js` - Frontend user ID handling
3. `client/src/core/auth.js` - Authentication user ID standardization
4. `server/src/middlewares/socketAuth.js` - Socket authentication middleware

## Testing Recommendations

1. Test user authentication with different user ID formats
2. Test room joining/leaving with multiple users
3. Test host transfer functionality
4. Test reconnection scenarios
5. Test team formation and game start