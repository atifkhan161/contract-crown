# Frontend State Synchronizer

The Frontend State Synchronizer is a comprehensive client-side state management solution that ensures consistency between the database, WebSocket manager, and frontend clients. It provides optimistic updates with rollback capability, HTTP API fallback mechanisms, and state caching for improved user experience during network issues.

## Features

### 1. Client-side State Synchronization
- Maintains local state synchronized with server state
- Automatic conflict detection and resolution
- Server state validation and reconciliation

### 2. Optimistic Updates with Rollback
- Immediate UI updates for better user experience
- Automatic rollback if server operations fail
- Operation tracking and confirmation system

### 3. HTTP API Fallback Mechanisms
- Automatic detection of WebSocket failures
- Seamless transition to HTTP polling
- Transparent fallback for critical operations

### 4. State Caching System
- Client-side state caching for offline scenarios
- Automatic cache expiration and cleanup
- State restoration on reconnection

## Usage

### Basic Setup

```javascript
import { FrontendStateSynchronizer } from '../core/FrontendStateSynchronizer.js';
import { SocketManager } from '../core/SocketManager.js';
import { AuthManager } from '../core/auth.js';
import { RoomManager } from '../core/RoomManager.js';

// Initialize dependencies
const authManager = new AuthManager();
const socketManager = new SocketManager(authManager);
const roomManager = new RoomManager(authManager);

// Create state synchronizer
const stateSynchronizer = new FrontendStateSynchronizer(
    socketManager, 
    authManager, 
    roomManager
);
```

### Initialize Room State

```javascript
// Initialize with room data
const roomData = {
    room: { id: 'room123', name: 'Game Room' },
    players: [
        { userId: 'user1', username: 'Player1', isReady: false },
        { userId: 'user2', username: 'Player2', isReady: true }
    ]
};

stateSynchronizer.initializeRoomState(roomData);
```

### Event Listeners

```javascript
// Listen for state changes
stateSynchronizer.on('stateChanged', (data) => {
    console.log('State changed:', data.type);
    updateUI(data.state);
});

// Listen for fallback mode changes
stateSynchronizer.on('fallbackModeChanged', (data) => {
    if (data.fallbackMode) {
        showFallbackNotification();
    } else {
        hideFallbackNotification();
    }
});

// Listen for operation confirmations
stateSynchronizer.on('operationConfirmed', (data) => {
    showSuccessMessage('Action completed successfully!');
});

// Listen for operation rollbacks
stateSynchronizer.on('operationRolledBack', (data) => {
    showWarningMessage('Action failed and was reverted.');
});
```

### Optimistic Updates

```javascript
// Toggle ready status with optimistic update
async function toggleReady() {
    try {
        const newReadyStatus = !currentReadyStatus;
        const operationId = await stateSynchronizer.toggleReadyStatus(newReadyStatus);
        console.log('Ready status operation initiated:', operationId);
    } catch (error) {
        console.error('Ready toggle failed:', error);
        showErrorMessage('Failed to update ready status.');
    }
}
```

### State Access

```javascript
// Get current local state
const localState = stateSynchronizer.getLocalState();
console.log('Current players:', localState.players);

// Get server state
const serverState = stateSynchronizer.getServerState();
console.log('Server state version:', serverState.version);

// Check fallback mode
if (stateSynchronizer.isInFallbackMode()) {
    console.log('Currently in fallback mode');
}

// Get pending operations count
const pendingCount = stateSynchronizer.getPendingOperationsCount();
console.log('Pending operations:', pendingCount);
```

### Cleanup

```javascript
// Clean up resources when component unmounts
stateSynchronizer.cleanup();
```

## API Reference

### Constructor

```javascript
new FrontendStateSynchronizer(socketManager, authManager, roomManager)
```

**Parameters:**
- `socketManager`: SocketManager instance for WebSocket communication
- `authManager`: AuthManager instance for authentication
- `roomManager`: RoomManager instance for HTTP API fallback

### Methods

#### `initializeRoomState(roomData)`
Initialize the synchronizer with room data.

**Parameters:**
- `roomData`: Object containing room and player information

#### `toggleReadyStatus(isReady)`
Toggle player ready status with optimistic update.

**Parameters:**
- `isReady`: Boolean indicating the new ready status

**Returns:** Promise resolving to operation ID

#### `getLocalState()`
Get the current local state.

**Returns:** Cloned local state object

#### `getServerState()`
Get the current server state.

**Returns:** Cloned server state object

#### `isInFallbackMode()`
Check if currently in fallback mode.

**Returns:** Boolean indicating fallback mode status

#### `getPendingOperationsCount()`
Get the number of pending operations.

**Returns:** Number of pending operations

#### `on(event, callback)`
Add event listener.

**Parameters:**
- `event`: Event name
- `callback`: Event handler function

#### `off(event, callback)`
Remove event listener.

**Parameters:**
- `event`: Event name
- `callback`: Event handler function to remove

#### `cleanup()`
Clean up resources and stop all timers.

### Events

#### `stateChanged`
Emitted when local state changes.

**Data:**
- `type`: Type of change (e.g., 'toggleReady', 'playerJoined')
- `state`: Current local state
- `isOptimistic`: Boolean indicating if this is an optimistic update
- `previousState`: Previous state before change

#### `fallbackModeChanged`
Emitted when fallback mode status changes.

**Data:**
- `fallbackMode`: Boolean indicating new fallback mode status

#### `operationConfirmed`
Emitted when an optimistic operation is confirmed by the server.

**Data:**
- `operationId`: ID of the confirmed operation
- `operation`: Operation type
- `data`: Server response data

#### `operationRolledBack`
Emitted when an optimistic operation is rolled back.

**Data:**
- `operationId`: ID of the rolled back operation
- `operation`: Operation type

#### `conflictsResolved`
Emitted when state conflicts are resolved.

**Data:**
- `conflicts`: Array of resolved conflicts

## Configuration

### Sync Settings

```javascript
// Default configuration (can be modified after initialization)
stateSynchronizer.syncInterval = 30000; // 30 seconds
stateSynchronizer.maxRetries = 3;
stateSynchronizer.retryDelay = 1000; // 1 second
stateSynchronizer.fallbackPollInterval = 5000; // 5 seconds
stateSynchronizer.cacheExpiry = 5 * 60 * 1000; // 5 minutes
```

## Error Handling

The synchronizer handles various error scenarios:

1. **WebSocket Disconnection**: Automatically enters fallback mode
2. **Operation Timeout**: Rolls back optimistic updates after 10 seconds
3. **State Conflicts**: Resolves using server as source of truth
4. **HTTP API Failures**: Retries with exponential backoff

## Best Practices

1. **Initialize Early**: Set up the synchronizer before user interactions
2. **Handle Events**: Always listen for state change events to update UI
3. **Error Feedback**: Provide user feedback for operation failures
4. **Cleanup**: Always call cleanup() when component unmounts
5. **Fallback UI**: Provide appropriate UI states for fallback mode

## Testing

Use the included test file to verify functionality:

```javascript
import { runTests } from './FrontendStateSynchronizer.test.js';
await runTests();
```

Or use the interactive test page:
```
client/test-state-synchronizer.html
```

## Requirements Fulfilled

This implementation addresses the following requirements:

- **Requirement 1.3**: Real-time ready status synchronization with fallback mechanisms
- **Requirement 2.3**: WebSocket-database state consistency with automatic reconciliation  
- **Requirement 6.3**: Websocket event reliability with HTTP API fallback and retry mechanisms