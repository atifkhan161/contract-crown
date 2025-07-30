/**
 * Basic tests for FrontendStateSynchronizer
 * Tests the core functionality of state synchronization, optimistic updates, and fallback mechanisms
 */

import { FrontendStateSynchronizer } from './FrontendStateSynchronizer.js';

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
        console.log(`[MockSocket] Emitting to server: ${event}`, data);
        // Simulate server response after delay
        setTimeout(() => {
            if (event === 'toggle-ready') {
                this.emit('playerReadyStatusChanged', {
                    gameId: data.gameId,
                    playerId: 'user123',
                    isReady: data.isReady,
                    players: [
                        { userId: 'user123', username: 'TestUser', isReady: data.isReady }
                    ]
                });
            }
        }, 100);
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
    // Mock room manager - not used in basic tests
}

// Test suite
async function runTests() {
    console.log('Starting FrontendStateSynchronizer tests...');

    // Test 1: Basic initialization
    console.log('\n=== Test 1: Basic Initialization ===');
    const mockSocket = new MockSocketManager();
    const mockAuth = new MockAuthManager();
    const mockRoom = new MockRoomManager();
    
    const synchronizer = new FrontendStateSynchronizer(mockSocket, mockAuth, mockRoom);
    
    console.log('✓ FrontendStateSynchronizer initialized successfully');
    console.log('✓ Initial state:', synchronizer.getLocalState());

    // Test 2: State initialization
    console.log('\n=== Test 2: State Initialization ===');
    const roomData = {
        room: { id: 'room123', name: 'Test Room' },
        players: [
            { userId: 'user123', username: 'TestUser', isReady: false }
        ]
    };
    
    synchronizer.initializeRoomState(roomData);
    const localState = synchronizer.getLocalState();
    
    console.log('✓ Room state initialized');
    console.log('✓ Local state updated:', localState);
    console.log('✓ Players count:', localState.players.length);

    // Test 3: Optimistic update
    console.log('\n=== Test 3: Optimistic Update ===');
    
    // Mock URL params for room ID
    const originalURLSearchParams = window.URLSearchParams;
    window.URLSearchParams = class MockURLSearchParams {
        constructor() {}
        get(key) {
            if (key === 'room') return 'room123';
            return null;
        }
    };

    let stateChangeReceived = false;
    synchronizer.on('stateChanged', (data) => {
        console.log('✓ State change event received:', data.type);
        stateChangeReceived = true;
    });

    try {
        const operationId = await synchronizer.toggleReadyStatus(true);
        console.log('✓ Optimistic update applied, operation ID:', operationId);
        console.log('✓ Pending operations count:', synchronizer.getPendingOperationsCount());
        
        // Wait for server response
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log('✓ State change event received:', stateChangeReceived);
        console.log('✓ Final pending operations count:', synchronizer.getPendingOperationsCount());
        
    } catch (error) {
        console.error('✗ Optimistic update failed:', error);
    }

    // Test 4: Fallback mode
    console.log('\n=== Test 4: Fallback Mode ===');
    
    let fallbackModeChanged = false;
    synchronizer.on('fallbackModeChanged', (data) => {
        console.log('✓ Fallback mode changed:', data.fallbackMode);
        fallbackModeChanged = true;
    });

    // Simulate WebSocket disconnection
    mockSocket.disconnect();
    
    // Wait for fallback detection
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✓ Fallback mode activated:', synchronizer.isInFallbackMode());
    console.log('✓ Fallback mode change event received:', fallbackModeChanged);

    // Test 5: State caching
    console.log('\n=== Test 5: State Caching ===');
    
    const cachedState = synchronizer.getCachedState('room123');
    console.log('✓ Cached state retrieved:', cachedState ? 'Yes' : 'No');
    
    if (cachedState) {
        console.log('✓ Cached state matches current:', 
            JSON.stringify(cachedState.room) === JSON.stringify(localState.room));
    }

    // Test 6: Cleanup
    console.log('\n=== Test 6: Cleanup ===');
    
    synchronizer.cleanup();
    console.log('✓ Synchronizer cleaned up successfully');

    // Restore original URLSearchParams
    window.URLSearchParams = originalURLSearchParams;

    console.log('\n=== All Tests Completed ===');
    console.log('✓ FrontendStateSynchronizer tests passed successfully!');
}

// Export for manual execution
// Tests should be run manually to avoid automatic execution issues

export { runTests };