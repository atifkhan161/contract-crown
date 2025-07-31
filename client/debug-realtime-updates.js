/**
 * Debug script to help diagnose real-time update issues
 * Add this to the browser console to monitor WebSocket events
 */

// Enhanced WebSocket event monitoring
if (window.lobbyManager && window.lobbyManager.socketManager) {
    const socketManager = window.lobbyManager.socketManager;
    const stateSynchronizer = window.lobbyManager.stateSynchronizer;
    
    console.log('=== WebSocket Debug Monitor Started ===');
    console.log('Socket connected:', socketManager.isSocketConnected());
    console.log('Room joined:', window.lobbyManager.isWebSocketRoomJoined);
    
    // Monitor all incoming WebSocket events
    const originalOn = socketManager.on.bind(socketManager);
    socketManager.on = function(event, handler) {
        console.log(`[Debug] Setting up listener for event: ${event}`);
        
        // Wrap the handler to log when events are received
        const wrappedHandler = function(data) {
            console.log(`[Debug] Received WebSocket event: ${event}`, data);
            return handler(data);
        };
        
        return originalOn(event, wrappedHandler);
    };
    
    // Monitor StateSynchronizer events
    if (stateSynchronizer) {
        const originalEmit = stateSynchronizer.emit.bind(stateSynchronizer);
        stateSynchronizer.emit = function(event, data) {
            console.log(`[Debug] StateSynchronizer emitting: ${event}`, data);
            return originalEmit(event, data);
        };
        
        // Add debug listener for state changes
        stateSynchronizer.on('stateChanged', (data) => {
            console.log(`[Debug] StateSynchronizer state changed: ${data.type}`, {
                state: data.state,
                isOptimistic: data.isOptimistic,
                previousState: data.previousState
            });
        });
    }
    
    // Monitor lobby UI updates
    const lobby = window.lobbyManager;
    const originalUpdatePlayersDisplay = lobby.updatePlayersDisplay.bind(lobby);
    lobby.updatePlayersDisplay = function() {
        console.log('[Debug] Updating players display. Current players:', lobby.players);
        return originalUpdatePlayersDisplay();
    };
    
    const originalUpdateReadyStatus = lobby.updateReadyStatus.bind(lobby);
    lobby.updateReadyStatus = function() {
        console.log('[Debug] Updating ready status. Current ready state:', lobby.isReady);
        return originalUpdateReadyStatus();
    };
    
    // Test WebSocket connection
    console.log('=== Testing WebSocket Connection ===');
    if (socketManager.socket) {
        console.log('Socket ID:', socketManager.socket.id);
        console.log('Socket connected:', socketManager.socket.connected);
        console.log('Socket rooms:', socketManager.socket.rooms);
        
        // Send a test ping
        socketManager.socket.emit('test', { message: 'Debug ping from Player 1', timestamp: Date.now() });
    }
    
    console.log('=== Debug Monitor Setup Complete ===');
    console.log('Now try having another player change their ready status and watch the console for events.');
    
} else {
    console.error('LobbyManager not found. Make sure you are on the lobby page.');
}

// Helper function to manually trigger state sync
window.debugTriggerSync = function() {
    if (window.lobbyManager && window.lobbyManager.stateSynchronizer) {
        console.log('[Debug] Manually triggering state sync...');
        window.lobbyManager.stateSynchronizer.syncWithServer();
    }
};

// Helper function to check current state
window.debugCheckState = function() {
    if (window.lobbyManager) {
        const lobby = window.lobbyManager;
        console.log('=== Current Lobby State ===');
        console.log('Room ID:', lobby.roomId);
        console.log('Current User:', lobby.currentUser);
        console.log('Players:', lobby.players);
        console.log('Is Host:', lobby.isHost);
        console.log('Is Ready:', lobby.isReady);
        console.log('WebSocket Room Joined:', lobby.isWebSocketRoomJoined);
        console.log('Connection Status:', lobby.connectionStatus);
        
        if (lobby.stateSynchronizer) {
            console.log('StateSynchronizer Local State:', lobby.stateSynchronizer.localState);
            console.log('StateSynchronizer Fallback Mode:', lobby.stateSynchronizer.fallbackMode);
        }
    }
};

console.log('Debug functions available:');
console.log('- debugTriggerSync() - Manually trigger state sync');
console.log('- debugCheckState() - Check current lobby state');