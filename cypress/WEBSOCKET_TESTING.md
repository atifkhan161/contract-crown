# WebSocket Communication Testing

This document describes the comprehensive WebSocket testing suite for the Contract Crown PWA.

## Test Coverage

The WebSocket communication tests (`cypress/e2e/websocket-communication.cy.js`) cover:

### 1. WebSocket Connection Establishment
- ✅ Connection establishment on login
- ✅ Real-time connection status updates
- ✅ Connection status widget functionality

### 2. Game State Synchronization
- ✅ Multi-client game state synchronization
- ✅ Real-time ready status broadcasting
- ✅ Player join/leave events

### 3. Real-time Game Events
- ✅ Trump declaration event broadcasting
- ✅ Card play event synchronization
- ✅ Trick completion and scoring updates

### 4. Connection Loss and Recovery
- ✅ Graceful connection loss handling
- ✅ Automatic reconnection functionality
- ✅ Game state sync after reconnection

### 5. Error Handling
- ✅ WebSocket authentication errors
- ✅ Invalid game event handling
- ✅ Game error message display

## Running the Tests

### Prerequisites
1. Start the backend server:
   ```bash
   cd server
   npm start
   ```

2. Start the frontend development server:
   ```bash
   cd client
   npm run dev
   ```

### Running WebSocket Tests
```bash
# Run all WebSocket tests
npx cypress run --spec "cypress/e2e/websocket-communication.cy.js"

# Run tests in interactive mode
npx cypress open
```

### Test Validation
```bash
# Run the test validation suite
npx cypress run --spec "cypress/e2e/websocket-test-runner.cy.js"
```

## Custom Commands

The following custom Cypress commands are available for WebSocket testing:

### Authentication Commands
- `cy.createTestUser(userData)` - Creates a test user
- `cy.authenticateUser(credentials)` - Authenticates a user
- `cy.setAuthenticatedState(userData)` - Sets authenticated state

### WebSocket Commands
- `cy.waitForWebSocketConnection()` - Waits for WebSocket connection
- `cy.simulateWebSocketEvent(event, data)` - Simulates WebSocket events
- `cy.verifyConnectionStatus(status)` - Verifies connection status

### Game Testing Commands
- `cy.createTestGame(gameData)` - Creates a test game
- `cy.cleanupTestData()` - Cleans up test data
- `cy.openNewWindow(url)` - Opens new browser window for multi-client testing

## Custom Tasks

The following Cypress tasks are available:

- `cy.task('createTestUser', userData)` - Creates test user in database
- `cy.task('createTestGame', gameData)` - Creates test game
- `cy.task('cleanupTestData')` - Cleans up test data
- `cy.task('resetDatabase')` - Resets test database
- `cy.task('seedTestData', data)` - Seeds test data

## Test Requirements Covered

The WebSocket tests validate the following requirements:

- **Requirement 9.1**: WebSocket event broadcasting ✅
- **Requirement 9.2**: Player disconnection handling ✅
- **Requirement 9.3**: Automatic reconnection ✅
- **Requirement 9.4**: Game state synchronization ✅
- **Requirement 9.5**: Error message display ✅
- **Requirement 11.1-11.5**: Connection status widget ✅

## Multi-Client Testing

The tests include multi-client scenarios using:
- Multiple browser windows
- Simulated WebSocket events
- Real-time state synchronization validation

## Error Scenarios Tested

- Network connection loss
- Invalid authentication
- Malformed game events
- Server disconnection
- Game state corruption
- Invalid player moves

## Performance Testing

The tests include performance validations for:
- Connection establishment time
- Event propagation latency
- State synchronization speed
- Reconnection time

## Debugging

To debug WebSocket tests:

1. Enable Cypress debug mode:
   ```bash
   DEBUG=cypress:* npx cypress run
   ```

2. Use browser developer tools in interactive mode
3. Check server logs for WebSocket events
4. Monitor network tab for WebSocket traffic

## Notes

- Tests require both frontend and backend servers running
- Some tests use mock implementations for isolated testing
- Multi-window tests may require specific browser configurations
- Connection timing may vary based on system performance