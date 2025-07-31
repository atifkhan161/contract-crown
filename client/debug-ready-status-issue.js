/**
 * Debug script to identify ready status issues
 * Run this in both player browser consoles to diagnose the problem
 */

console.log('🔍 Ready Status Issue Debugger');

if (!window.lobbyManager) {
    console.error('❌ Run this on the lobby page');
} else {
    const lobby = window.lobbyManager;
    
    // Create a comprehensive state checker
    window.checkLobbyState = function() {
        console.log('\n📊 === LOBBY STATE CHECK ===');
        
        // Basic info
        console.log('🏠 Room Info:');
        console.log('  Room ID:', lobby.roomId);
        console.log('  Room Object:', lobby.room);
        console.log('  Is Host:', lobby.isHost);
        
        // User info
        console.log('\n👤 Current User:');
        console.log('  Username:', lobby.currentUser?.username);
        console.log('  User ID:', lobby.currentUser?.user_id || lobby.currentUser?.id);
        console.log('  Is Ready:', lobby.isReady);
        
        // Players info
        console.log('\n👥 Players in Room:');
        console.log('  Count:', lobby.players?.length || 0);
        if (lobby.players && lobby.players.length > 0) {
            lobby.players.forEach((player, index) => {
                const isCurrentUser = lobby.isCurrentUserPlayer(player);
                console.log(`  ${index + 1}. ${player.username} (${player.userId || player.user_id || player.id})`);
                console.log(`     Ready: ${player.isReady}, Connected: ${player.isConnected}, Current User: ${isCurrentUser}`);
            });
        } else {
            console.log('  ⚠️ No players found in room!');
        }
        
        // Current player check
        const currentPlayer = lobby.findCurrentPlayer();
        console.log('\n🎯 Current Player Lookup:');
        console.log('  Found:', !!currentPlayer);
        if (currentPlayer) {
            console.log('  Name:', currentPlayer.username);
            console.log('  Ready:', currentPlayer.isReady);
            console.log('  Connected:', currentPlayer.isConnected);
        } else {
            console.log('  ❌ Current player not found in players list!');
        }
        
        // Connection status
        console.log('\n🔌 Connection Status:');
        console.log('  WebSocket Connected:', lobby.socketManager.isSocketConnected());
        console.log('  Socket ID:', lobby.socketManager.socket?.id);
        console.log('  Room Joined:', lobby.isWebSocketRoomJoined);
        console.log('  Connection Status:', lobby.connectionStatus);
        
        // Button status
        console.log('\n🔘 Ready Button Status:');
        const button = lobby.elements.readytogglebtn;
        if (button) {
            console.log('  Exists:', true);
            console.log('  Disabled:', button.disabled);
            console.log('  Text:', button.textContent);
            console.log('  Classes:', Array.from(button.classList));
        } else {
            console.log('  ❌ Button element not found!');
        }
        
        // StateSynchronizer status
        console.log('\n🔄 StateSynchronizer Status:');
        const sync = lobby.stateSynchronizer;
        console.log('  Local State Players:', sync.localState.players?.length || 0);
        console.log('  Fallback Mode:', sync.fallbackMode);
        console.log('  Pending Operations:', sync.pendingOperations.size);
        console.log('  Last Sync:', sync.localState.lastSyncTimestamp ? new Date(sync.localState.lastSyncTimestamp) : 'Never');
        
        return {
            roomId: lobby.roomId,
            currentUser: lobby.currentUser?.username,
            playersCount: lobby.players?.length || 0,
            currentPlayerFound: !!currentPlayer,
            webSocketConnected: lobby.socketManager.isSocketConnected(),
            roomJoined: lobby.isWebSocketRoomJoined,
            buttonExists: !!button,
            buttonDisabled: button?.disabled
        };
    };
    
    // Test ready status change step by step
    window.testReadyStatusStepByStep = async function() {
        console.log('\n🧪 === STEP-BY-STEP READY STATUS TEST ===');
        
        // Step 1: Check initial state
        console.log('📋 Step 1: Initial State Check');
        const initialState = window.checkLobbyState();
        
        if (!initialState.currentPlayerFound) {
            console.error('❌ Cannot proceed - current player not found in room');
            return;
        }
        
        if (!initialState.webSocketConnected) {
            console.error('❌ Cannot proceed - WebSocket not connected');
            return;
        }
        
        if (!initialState.roomJoined) {
            console.error('❌ Cannot proceed - not joined to WebSocket room');
            return;
        }
        
        // Step 2: Try to toggle ready status
        console.log('\n🎯 Step 2: Attempting Ready Status Toggle');
        const currentStatus = lobby.isReady;
        console.log('Current ready status:', currentStatus);
        console.log('Will toggle to:', !currentStatus);
        
        try {
            // Monitor WebSocket events during the toggle
            let webSocketEventReceived = false;
            const eventHandler = (data) => {
                console.log('📥 Received player-ready-changed event:', data);
                webSocketEventReceived = true;
            };
            
            lobby.socketManager.on('player-ready-changed', eventHandler);
            
            // Perform the toggle
            console.log('🚀 Calling toggleReady()...');
            await lobby.toggleReady();
            
            // Wait a bit and check results
            setTimeout(() => {
                console.log('\n📊 Step 3: Results After Toggle');
                console.log('WebSocket event received:', webSocketEventReceived);
                console.log('New ready status:', lobby.isReady);
                console.log('Status changed:', lobby.isReady !== currentStatus);
                
                const newState = window.checkLobbyState();
                console.log('Current player still found:', newState.currentPlayerFound);
                
                // Clean up event listener
                lobby.socketManager.off('player-ready-changed', eventHandler);
                
                if (lobby.isReady === currentStatus) {
                    console.error('❌ Ready status did not change!');
                } else {
                    console.log('✅ Ready status changed successfully!');
                }
            }, 3000);
            
        } catch (error) {
            console.error('❌ Error during toggle:', error);
        }
    };
    
    // Monitor for state changes
    window.startStateMonitoring = function() {
        console.log('\n👂 Starting continuous state monitoring...');
        
        let lastState = JSON.stringify(window.checkLobbyState());
        
        const monitor = setInterval(() => {
            const currentState = JSON.stringify(window.checkLobbyState());
            if (currentState !== lastState) {
                console.log('🔄 State changed detected!');
                window.checkLobbyState();
                lastState = currentState;
            }
        }, 2000);
        
        window.stopStateMonitoring = () => {
            clearInterval(monitor);
            console.log('⏹️ State monitoring stopped');
        };
        
        console.log('✅ State monitoring started (run stopStateMonitoring() to stop)');
    };
    
    console.log('\n🛠️ Available Debug Functions:');
    console.log('- checkLobbyState() - Check current lobby state');
    console.log('- testReadyStatusStepByStep() - Test ready status change with detailed logging');
    console.log('- startStateMonitoring() - Monitor for state changes');
    
    console.log('\n🚀 Quick Start: Run checkLobbyState() to see current state');
    
    // Auto-run initial state check
    setTimeout(() => {
        console.log('\n🔍 Initial state check:');
        window.checkLobbyState();
    }, 1000);
}