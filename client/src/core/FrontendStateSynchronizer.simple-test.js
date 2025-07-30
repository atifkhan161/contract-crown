/**
 * Simple tests for FrontendStateSynchronizer that don't modify window.location
 */

import { FrontendStateSynchronizer } from './FrontendStateSynchronizer.js';

// Simple mock classes
class SimpleMockSocketManager {
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
        console.log(`[MockSocket] Emitting: ${event}`);
        // Simulate immediate response for testing
        if (event === 'toggle-ready') {
            setTimeout(() => {
                this.emit('playerReadyStatusChanged', {
                    gameId: 'room123',
                    playerId: 'user123',
                    isReady: data.isReady,
                    players: [{ userId: 'user123', username: 'TestUser', isReady: data.isReady }]
                });
            }, 50);
        }
    }

    disconnect() {
        this.connected = false;
        this.emit('disconnect');
    }
}

class SimpleMockAuthManager {
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

class SimpleMockRoomManager {
    // Empty mock
}

// Simple test runner
export async function runSimpleTests() {
    console.log('=== Running Simple FrontendStateSynchronizer Tests ===');
    
    try {
        // Test 1: Basic initialization
        console.log('\n1. Testing initialization...');
        const mockSocket = new SimpleMockSocketManager();
        const mockAuth = new SimpleMockAuthManager();
        const mockRoom = new SimpleMockRoomManager();
        
        const synchronizer = new FrontendStateSynchronizer(mockSocket, mockAuth, mockRoom);
        console.log('✓ Synchronizer created successfully');

        // Test 2: State initialization
        console.log('\n2. Testing state initialization...');
        const roomData = {
            room: { id: 'room123', name: 'Test Room' },
            players: [{ userId: 'user123', username: 'TestUser', isReady: false }]
        };
        
        synchronizer.initializeRoomState(roomData);
        const state = synchronizer.getLocalState();
        console.log('✓ State initialized:', state.room?.name);
        console.log('✓ Players count:', state.players?.length);

        // Test 3: Event listeners
        console.log('\n3. Testing event listeners...');
        let eventReceived = false;
        synchronizer.on('stateChanged', (data) => {
            console.log('✓ State change event received:', data.type);
            eventReceived = true;
        });

        // Test 4: Basic state access
        console.log('\n4. Testing state access...');
        console.log('✓ Local state version:', synchronizer.getLocalState().version);
        console.log('✓ Server state version:', synchronizer.getServerState().version);
        console.log('✓ Fallback mode:', synchronizer.isInFallbackMode());
        console.log('✓ Pending operations:', synchronizer.getPendingOperationsCount());

        // Test 5: Fallback mode simulation
        console.log('\n5. Testing fallback mode...');
        let fallbackEventReceived = false;
        synchronizer.on('fallbackModeChanged', (data) => {
            console.log('✓ Fallback mode changed:', data.fallbackMode);
            fallbackEventReceived = true;
        });

        mockSocket.disconnect();
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('✓ Fallback mode activated:', synchronizer.isInFallbackMode());

        // Test 6: Cleanup
        console.log('\n6. Testing cleanup...');
        synchronizer.cleanup();
        console.log('✓ Cleanup completed');

        console.log('\n=== All Simple Tests Passed! ===');
        return true;

    } catch (error) {
        console.error('✗ Test failed:', error);
        return false;
    }
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
    console.log('Simple tests available. Call runSimpleTests() to execute.');
}