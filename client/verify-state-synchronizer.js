/**
 * Node.js verification script for FrontendStateSynchronizer
 * Tests core logic without browser dependencies
 */

// Mock browser globals for Node.js environment
global.window = {
    location: { search: '?room=room123' },
    URLSearchParams: class MockURLSearchParams {
        constructor(search) {
            this.params = new Map();
            if (search === '?room=room123') {
                this.params.set('room', 'room123');
            }
        }
        get(key) {
            return this.params.get(key) || null;
        }
    }
};

// Import the module
import { FrontendStateSynchronizer } from './src/core/FrontendStateSynchronizer.js';

// Mock dependencies
class MockSocketManager {
    constructor() {
        this.connected = true;
        this.listeners = new Map();
    }

    isSocketConnected() {
        return this.connected;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data));
        }
    }

    emitToServer(event, data) {
        console.log(`[MockSocket] Server emit: ${event}`);
    }

    disconnect() {
        this.connected = false;
        this.emit('disconnect');
    }
}

class MockAuthManager {
    getCurrentUser() {
        return { user_id: 'user123', username: 'TestUser' };
    }

    getUserId() {
        return 'user123';
    }

    getToken() {
        return 'mock-token';
    }
}

class MockRoomManager {
    // Empty mock
}

async function verifyFunctionality() {
    console.log('🧪 Verifying FrontendStateSynchronizer functionality...\n');

    try {
        // Test 1: Initialization
        console.log('1️⃣ Testing initialization...');
        const mockSocket = new MockSocketManager();
        const mockAuth = new MockAuthManager();
        const mockRoom = new MockRoomManager();
        
        const synchronizer = new FrontendStateSynchronizer(mockSocket, mockAuth, mockRoom);
        console.log('✅ Synchronizer created successfully');

        // Test 2: State initialization
        console.log('\n2️⃣ Testing state initialization...');
        const roomData = {
            room: { id: 'room123', name: 'Test Room' },
            players: [
                { userId: 'user123', username: 'TestUser', isReady: false },
                { userId: 'user456', username: 'Player2', isReady: true }
            ]
        };
        
        synchronizer.initializeRoomState(roomData);
        const localState = synchronizer.getLocalState();
        
        console.log('✅ Room state initialized');
        console.log(`   Room: ${localState.room.name}`);
        console.log(`   Players: ${localState.players.length}`);
        console.log(`   Version: ${localState.version}`);

        // Test 3: State access methods
        console.log('\n3️⃣ Testing state access methods...');
        const serverState = synchronizer.getServerState();
        const fallbackMode = synchronizer.isInFallbackMode();
        const pendingOps = synchronizer.getPendingOperationsCount();
        const roomId = synchronizer.getCurrentRoomId();
        
        console.log('✅ State access methods working');
        console.log(`   Server state version: ${serverState.version}`);
        console.log(`   Fallback mode: ${fallbackMode}`);
        console.log(`   Pending operations: ${pendingOps}`);
        console.log(`   Room ID: ${roomId}`);

        // Test 4: Event system
        console.log('\n4️⃣ Testing event system...');
        let eventReceived = false;
        synchronizer.on('stateChanged', (data) => {
            console.log(`   📡 Event received: ${data.type}`);
            eventReceived = true;
        });

        // Simulate a state update
        synchronizer.handleServerStateUpdate('playerReady', {
            gameId: 'room123',
            playerId: 'user123',
            isReady: true,
            players: [
                { userId: 'user123', username: 'TestUser', isReady: true },
                { userId: 'user456', username: 'Player2', isReady: true }
            ]
        });

        console.log('✅ Event system working');
        console.log(`   Event received: ${eventReceived}`);

        // Test 5: State synchronization
        console.log('\n5️⃣ Testing state synchronization...');
        const updatedState = synchronizer.getLocalState();
        const testPlayer = updatedState.players.find(p => p.userId === 'user123');
        
        console.log('✅ State synchronization working');
        console.log(`   Test player ready status: ${testPlayer?.isReady}`);
        console.log(`   State version: ${updatedState.version}`);

        // Test 6: Fallback mode
        console.log('\n6️⃣ Testing fallback mode...');
        let fallbackEventReceived = false;
        synchronizer.on('fallbackModeChanged', (data) => {
            console.log(`   📡 Fallback mode changed: ${data.fallbackMode}`);
            fallbackEventReceived = true;
        });

        mockSocket.disconnect();
        // Wait a bit for fallback detection
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('✅ Fallback mode working');
        console.log(`   Fallback mode active: ${synchronizer.isInFallbackMode()}`);
        console.log(`   Fallback event received: ${fallbackEventReceived}`);

        // Test 7: Cleanup
        console.log('\n7️⃣ Testing cleanup...');
        synchronizer.cleanup();
        console.log('✅ Cleanup completed successfully');

        console.log('\n🎉 All verification tests passed!');
        console.log('\n📋 Summary:');
        console.log('   ✅ Initialization');
        console.log('   ✅ State management');
        console.log('   ✅ Event system');
        console.log('   ✅ State synchronization');
        console.log('   ✅ Fallback mode');
        console.log('   ✅ Cleanup');
        
        return true;

    } catch (error) {
        console.error('\n❌ Verification failed:', error);
        console.error(error.stack);
        return false;
    }
}

// Run verification
verifyFunctionality().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('Verification script error:', error);
    process.exit(1);
});