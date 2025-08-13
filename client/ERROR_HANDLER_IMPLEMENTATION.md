# Error Handler Implementation

## Overview

This implementation adds centralized error handling for websocket connection errors and session expiration across all client-side pages (dashboard, waiting room, and game). When critical errors occur, the system will automatically force logout and redirect to the login page.

## Files Modified/Created

### New Files
- `client/src/core/ErrorHandler.js` - Centralized error handler
- `client/test-error-handler.html` - Test page for error handler functionality
- `client/ERROR_HANDLER_IMPLEMENTATION.md` - This documentation

### Modified Files
- `client/src/core/auth.js` - Integrated with ErrorHandler
- `client/src/core/SocketManager.js` - Added error handling for websocket errors
- `client/src/core/WaitingRoomSocketManager.js` - Added error handling
- `client/src/core/WebSocketGameManager.js` - Added error handling
- `client/src/core/GameManager.js` - Added error handling
- `client/src/core/RoomManager.js` - Added HTTP auth error handling
- `client/src/pages/dashboard.js` - Integrated with ErrorHandler
- `client/src/pages/waiting-room.js` - Integrated with ErrorHandler
- `client/src/pages/game.js` - Integrated with ErrorHandler

## Key Features

### 1. Critical Error Detection
The ErrorHandler automatically detects critical errors including:
- `TransportError: websocket error`
- `Connection error: TransportError: websocket error`
- `Session expired or invalid`
- `Connection error: Error: Session expired or invalid`
- `Authentication failed`
- `auth_error`
- `Authentication expired`
- `Token expired`
- `Invalid token`
- `Unauthorized`

### 2. Automatic Logout and Redirect
When a critical error is detected:
1. Shows a user-friendly notification
2. Clears all authentication data from localStorage and sessionStorage
3. Calls AuthManager.logout() to notify the server
4. Redirects to `/login.html` after 2 seconds

### 3. Prevention of Multiple Simultaneous Handling
The error handler prevents multiple simultaneous error handling to avoid race conditions and duplicate redirects.

### 4. User-Friendly Notifications
Shows contextual messages based on error type:
- WebSocket errors: "Connection lost. Redirecting to login..."
- Authentication errors: "Authentication failed. Redirecting to login..."
- Session errors: "Session expired. Redirecting to login..."

## Integration Points

### WebSocket Managers
All WebSocket managers now integrate with the ErrorHandler:
- `SocketManager` - Handles general websocket errors
- `WaitingRoomSocketManager` - Handles waiting room specific errors
- `WebSocketGameManager` - Handles game-specific websocket errors

### HTTP Requests
- `AuthManager.authenticatedFetch()` - Handles HTTP auth errors
- `RoomManager` - All API calls check for auth errors

### Page Controllers
All page controllers integrate with ErrorHandler:
- Dashboard - Handles auth errors and websocket failures
- Waiting Room - Handles connection and auth errors
- Game - Handles game-specific errors

## Usage Examples

### Basic Usage
```javascript
import { getErrorHandler } from './ErrorHandler.js';

const errorHandler = getErrorHandler(authManager);

// Handle websocket error
errorHandler.handleWebSocketError('TransportError: websocket error', socket);

// Handle authentication error
errorHandler.handleAuthError('Session expired or invalid');

// Handle HTTP auth error
errorHandler.handleHttpAuthError(response, '/api/rooms');
```

### Custom Error Patterns
```javascript
// Add custom critical error pattern
errorHandler.addCriticalErrorPattern('Custom critical error');

// Remove error pattern
errorHandler.removeCriticalErrorPattern('Custom critical error');
```

## Testing

Use the test page at `client/test-error-handler.html` to verify functionality:
1. Open the test page in a browser
2. Click various test buttons to simulate different error conditions
3. Observe the error handling behavior in the log

## Error Flow

```
Critical Error Detected
        ↓
Check if already handling error
        ↓
Show user notification
        ↓
Clear session data
        ↓
Call AuthManager.logout()
        ↓
Redirect to login page
```

## Configuration

The ErrorHandler can be configured by:
- Adding/removing critical error patterns
- Customizing notification messages
- Adjusting redirect delay (currently 2 seconds)

## Global Error Handling

The ErrorHandler also sets up global listeners for:
- Unhandled promise rejections
- Global JavaScript errors

These will trigger the error handler if they contain critical error patterns.

## Browser Compatibility

The implementation uses modern JavaScript features but maintains compatibility with:
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Security Considerations

- All session data is cleared on critical errors
- Server logout is attempted before redirect
- Prevents session fixation attacks
- Handles network failures gracefully

## Performance Impact

- Minimal performance impact
- Error checking uses efficient string matching
- Singleton pattern prevents multiple instances
- Event listeners are properly cleaned up