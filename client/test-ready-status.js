/**
 * Comprehensive test script for ready status functionality
 * Run this in the browser console on the lobby page to test ready status changes
 * 
 * Instructions:
 * 1. Open two browser tabs with different players in the same room
 * 2. Run this script in both tabs
 * 3. Use the test functions to verify ready status changes work
 */

console.log('=== Ready Status Diagnostic Test ===');

// Check if we're on the lobby page
if (!window.lobbyManager) {
    console.error('❌ This script must be run on the lobby page');
    console.log('Please navigate to a lobby page and run this script again.');
} else {
    const lobby = window.lobbyManager;
    const stateSynchronizer = lobby.stateSynchronizer;
    
    console.log('✅ Lobby Manager found');
    console.log('\n📊 Current Lobby State:');
    console.log('- Room ID:', lobby.roomId);
    console.log('- Current User:', lobby.currentUser?.username);
    console.log('- User ID:', lobby.currentUser?.user_id || lobby.currentUser?.id);
    console.log('- Is Ready:', lobby.isReady);
    console.log('- Is Host:', lobby.isHost);
    console.log('- Players Count:', lobby.players?.length || 0);
    console.log('- Players:', lobby.players?.map(p => ({
        id: p.userId || p.user_id || p.id,
        name: p.username,
        ready: p.isReady,
        connected: p.isConnected
    })));
    
    console.log('\n🔌 Connection Status:');
    console.log('- WebSocket Connected:', lobby.socketManager.isSocketConnected());
    console.log('- Room Joined:', lobby.isWebSocketRoomJoined);
    console.log('- Socket ID:', lobby.socketManager.socket?.id);
    
    console.log('\n🔄 StateSynchronizer State:');
    console.log('- Local State Players:', stateSynchronizer.localState.players?.map(p => ({
        id: p.userId || p.user_id || p.id,
        name: p.username,
        ready: p.isReady
    })));
    console.log('- Fallback Mode:', stateSynchronizer.fallbackMode);
    console.log('- Pending Operations:', stateSynchronizer.pendingOperations.size);
    
    // Enhanced ready status toggle test
    window.testReadyToggle = async function() {
        console.log('\n🧪 --- Testing Ready Status Toggle ---');
        
        try {
            const currentStatus = lobby.isReady;
            console.log('📍 Current ready status:', currentStatus);
            console.log('🎯 Attempting to toggle to:', !currentStatus);
            
            // Check prerequisites
            console.log('🔍 Pre-flight checks:');
            console.log('  - Button element exists:', !!lobby.elements.readytogglebtn);
            console.log('  - Button disabled:', lobby.elements.readytogglebtn?.disabled);
            console.log('  - WebSocket connected:', lobby.socketManager.isSocketConnected());
            console.log('  - Room joined:', lobby.isWebSocketRoomJoined);
            console.log('  - Room ID:', stateSynchronizer.getCurrentRoomId());
            
            // Call the toggle method
            console.log('🚀 Calling toggleReady()...');
            await lobby.toggleReady();
            
            console.log('✅ Toggle request completed');
            
            // Check status after a delay
            setTimeout(() => {
                console.log('📊 Status after toggle:');
                console.log('  - Lobby isReady:', lobby.isReady);
                console.log('  - Current player in players list:', lobby.players?.find(p => 
                    (p.userId || p.user_id || p.id) === (lobby.currentUser?.user_id || lobby.currentUser?.id)
                )?.isReady);
                console.log('  - All players:', lobby.players?.map(p => ({
                    name: p.username,
                    ready: p.isReady
                })));
            }, 2000);
            
        } catch (error) {
            console.error('❌ Error during ready toggle:', error);
            console.error('Stack trace:', error.stack);
        }
    };
    
    // Test StateSynchronizer directly
    window.testStateSynchronizer = async function() {
        console.log('\n🔬 --- Testing StateSynchronizer Directly ---');
        
        try {
            const currentStatus = lobby.isReady;
            const newStatus = !currentStatus;
            
            console.log('📍 Current status:', currentStatus);
            console.log('🎯 Toggling to:', newStatus);
            console.log('🔍 Room ID from getCurrentRoomId():', stateSynchronizer.getCurrentRoomId());
            console.log('🔍 User from authManager:', stateSynchronizer.authManager.getCurrentUser()?.username);
            console.log('🔍 WebSocket room joined check:', stateSynchronizer.isWebSocketRoomJoined());
            
            const operationId = await stateSynchronizer.toggleReadyStatus(newStatus);
            console.log('✅ Operation ID:', operationId);
            console.log('📊 Pending operations after toggle:', stateSynchronizer.pendingOperations.size);
            
            // Check local state
            setTimeout(() => {
                console.log('📊 StateSynchronizer local state after toggle:');
                console.log('  - Players:', stateSynchronizer.localState.players?.map(p => ({
                    name: p.username,
                    ready: p.isReady
                })));
                console.log('  - Version:', stateSynchronizer.localState.version);
                console.log('  - Last sync:', new Date(stateSynchronizer.localState.lastSyncTimestamp));
            }, 1000);
            
        } catch (error) {
            console.error('❌ Error in StateSynchronizer test:', error);
            console.error('Stack trace:', error.stack);
        }
    };
    
    // Monitor WebSocket events
    window.monitorWebSocketEvents = function() {
        console.log('\n👂 --- Enabling WebSocket Event Monitoring ---');
        
        // Monitor outgoing events
        const originalEmit = lobby.socketManager.emitToServer.bind(lobby.socketManager);
        lobby.socketManager.emitToServer = function(event, data) {
            console.log(`📤 [WebSocket OUT] ${event}:`, data);
            return originalEmit(event, data);
        };
        
        // Monitor specific incoming events
        const eventsToMonitor = [
            'player-ready-changed',
            'roomJoined',
            'playerJoined',
            'playerLeft',
            'connect',
            'disconnect',
            'error'
        ];
        
        eventsToMonitor.forEach(eventName => {
            lobby.socketManager.on(eventName, (data) => {
                console.log(`📥 [WebSocket IN] ${eventName}:`, data);
            });
        });
        
        console.log('✅ WebSocket event monitoring enabled for:', eventsToMonitor.join(', '));
    };
    
    // Test HTTP fallback
    window.testHttpFallback = async function() {
        console.log('\n🌐 --- Testing HTTP Fallback ---');
        
        try {
            const roomId = stateSynchronizer.getCurrentRoomId();
            const newStatus = !lobby.isReady;
            
            console.log('📍 Testing HTTP API directly');
            console.log('🎯 Room ID:', roomId);
            console.log('🎯 New status:', newStatus);
            
            await stateSynchronizer.toggleReadyStatusViaHttp(roomId, newStatus);
            console.log('✅ HTTP fallback completed');
            
        } catch (error) {
            console.error('❌ HTTP fallback error:', error);
        }
    };
    
    // Check button functionality
    window.checkButton = function() {
        console.log('\n🔘 --- Button Status Check ---');
        
        const button = lobby.elements.readytogglebtn;
        if (!button) {
            console.error('❌ Ready button element not found');
            return;
        }
        
        console.log('✅ Button element found');
        console.log('📊 Button properties:');
        console.log('  - Disabled:', button.disabled);
        console.log('  - Text content:', button.textContent);
        console.log('  - Class list:', Array.from(button.classList));
        console.log('  - Event listeners:', getEventListeners ? getEventListeners(button) : 'Use Chrome DevTools to check');
        
        // Test button click directly
        console.log('🖱️ Simulating button click...');
        button.click();
    };
    
    console.log('\n🛠️ Available Test Functions:');
    console.log('- testReadyToggle() - Test the lobby ready toggle (recommended)');
    console.log('- testStateSynchronizer() - Test StateSynchronizer directly');
    console.log('- testHttpFallback() - Test HTTP API fallback');
    console.log('- checkButton() - Check button element and simulate click');
    console.log('- monitorWebSocketEvents() - Monitor WebSocket events');
    
    console.log('\n🚀 Quick Start:');
    console.log('1. Run monitorWebSocketEvents() to enable monitoring');
    console.log('2. Run testReadyToggle() to test the functionality');
    console.log('3. Check the console for detailed logs');
    
    // Auto-enable monitoring
    window.monitorWebSocketEvents();
    
    console.log('\n✅ Ready Status Diagnostic Test loaded successfully!');
    console.log('💡 Tip: Run testReadyToggle() to start testing');
}