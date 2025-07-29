/**
 * Websocket Reliability Layer Demonstration
 * Shows how the reliability layer provides event delivery confirmation,
 * retry mechanisms, and HTTP API fallback for critical websocket events.
 */

import WebsocketReliabilityLayer from '../src/services/WebsocketReliabilityLayer.js';
import ReliableSocketManager from '../websocket/reliableSocketManager.js';

// Mock Socket.IO for demonstration
class MockSocketIO {
    constructor() {
        this.rooms = new Map();
        this.sockets = { sockets: new Map() };
        this.failureMode = false;
        this.emissionLog = [];
    }

    to(roomId) {
        return {
            emit: (eventType, data) => {
                this.emissionLog.push({
                    type: 'room',
                    target: roomId,
                    eventType,
                    data,
                    timestamp: new Date().toISOString(),
                    success: !this.failureMode
                });

                if (this.failureMode) {
                    throw new Error('Simulated network failure');
                }

                console.log(`[MockIO] Emitted ${eventType} to room ${roomId}`);
            }
        };
    }

    emit(eventType, data) {
        this.emissionLog.push({
            type: 'broadcast',
            eventType,
            data,
            timestamp: new Date().toISOString(),
            success: !this.failureMode
        });

        if (this.failureMode) {
            throw new Error('Simulated network failure');
        }

        console.log(`[MockIO] Broadcasted ${eventType}`);
    }

    setFailureMode(enabled) {
        this.failureMode = enabled;
        console.log(`[MockIO] Failure mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    getEmissionLog() {
        return this.emissionLog;
    }

    clearLog() {
        this.emissionLog = [];
    }
}

// Mock Socket Manager
class MockSocketManager {
    constructor(io) {
        this.io = io;
        this.gameRooms = new Map();
        this.userSockets = new Map();
        this.socketUsers = new Map();
    }

    setupDemoRoom() {
        const roomId = 'demo-room';
        const room = {
            gameId: roomId,
            players: new Map([
                ['player-1', {
                    userId: 'player-1',
                    username: 'Alice',
                    socketId: 'socket-1',
                    isReady: false,
                    teamAssignment: null,
                    joinedAt: new Date().toISOString(),
                    isConnected: true
                }],
                ['player-2', {
                    userId: 'player-2',
                    username: 'Bob',
                    socketId: 'socket-2',
                    isReady: false,
                    teamAssignment: null,
                    joinedAt: new Date().toISOString(),
                    isConnected: true
                }]
            ]),
            teams: { team1: [], team2: [] },
            createdAt: new Date().toISOString(),
            status: 'waiting',
            hostId: 'player-1'
        };

        this.gameRooms.set(roomId, room);
        console.log(`[MockSocketManager] Set up demo room with 2 players`);
        return room;
    }
}

// Mock HTTP API for fallback testing
class MockHTTPAPI {
    constructor() {
        this.requests = [];
        this.shouldFail = false;
    }

    async post(url, data, config) {
        this.requests.push({
            method: 'POST',
            url,
            data,
            config,
            timestamp: new Date().toISOString()
        });

        console.log(`[MockHTTP] POST ${url}`, data);

        if (this.shouldFail) {
            throw new Error('HTTP API failure');
        }

        return { data: { success: true, message: 'HTTP fallback successful' } };
    }

    async get(url, config) {
        this.requests.push({
            method: 'GET',
            url,
            config,
            timestamp: new Date().toISOString()
        });

        console.log(`[MockHTTP] GET ${url}`);

        if (this.shouldFail) {
            throw new Error('HTTP API failure');
        }

        return { data: { success: true, room: { id: 'demo-room', players: [] } } };
    }

    setFailureMode(enabled) {
        this.shouldFail = enabled;
        console.log(`[MockHTTP] Failure mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    getRequests() {
        return this.requests;
    }

    clearRequests() {
        this.requests = [];
    }
}

// Demonstration class
class WebsocketReliabilityDemo {
    constructor() {
        this.mockIO = new MockSocketIO();
        this.mockSocketManager = new MockSocketManager(this.mockIO);
        this.mockHTTP = new MockHTTPAPI();
        
        // Set up demo room
        this.demoRoom = this.mockSocketManager.setupDemoRoom();
        
        // Initialize reliability layer
        this.reliabilityLayer = new WebsocketReliabilityLayer(this.mockIO, this.mockSocketManager);
        
        // Mock axios for HTTP fallback
        this.mockAxios();
        
        console.log('='.repeat(60));
        console.log('WEBSOCKET RELIABILITY LAYER DEMONSTRATION');
        console.log('='.repeat(60));
    }

    mockAxios() {
        // Mock axios for the reliability layer
        const originalAxios = require('axios');
        if (originalAxios.post) {
            originalAxios.post = this.mockHTTP.post.bind(this.mockHTTP);
            originalAxios.get = this.mockHTTP.get.bind(this.mockHTTP);
        }
    }

    async demonstrateSuccessfulDelivery() {
        console.log('\n1. DEMONSTRATING SUCCESSFUL EVENT DELIVERY');
        console.log('-'.repeat(50));

        const success = await this.reliabilityLayer.emitWithRetry(
            'demo-room',
            'player-ready-changed',
            {
                gameId: 'demo-room',
                playerId: 'player-1',
                playerName: 'Alice',
                isReady: true,
                timestamp: new Date().toISOString()
            }
        );

        console.log(`Event delivery result: ${success ? 'SUCCESS' : 'FAILED'}`);
        
        const stats = this.reliabilityLayer.getDeliveryStats();
        console.log('Delivery stats:', stats.eventStats);
    }

    async demonstrateRetryMechanism() {
        console.log('\n2. DEMONSTRATING RETRY MECHANISM');
        console.log('-'.repeat(50));

        // Enable failure mode
        this.mockIO.setFailureMode(true);

        const success = await this.reliabilityLayer.emitWithRetry(
            'demo-room',
            'teams-formed',
            {
                gameId: 'demo-room',
                teams: { team1: ['player-1'], team2: ['player-2'] },
                formedBy: 'Alice',
                timestamp: new Date().toISOString()
            },
            { maxRetries: 2 }
        );

        console.log(`Event delivery result after retries: ${success ? 'SUCCESS' : 'FAILED'}`);
        
        // Disable failure mode
        this.mockIO.setFailureMode(false);
        
        const stats = this.reliabilityLayer.getDeliveryStats();
        console.log('Delivery stats after retries:', stats.eventStats);
    }

    async demonstrateHttpFallback() {
        console.log('\n3. DEMONSTRATING HTTP API FALLBACK');
        console.log('-'.repeat(50));

        // Enable websocket failure mode
        this.mockIO.setFailureMode(true);

        const success = await this.reliabilityLayer.emitWithRetry(
            'demo-room',
            'game-starting',
            {
                gameId: 'demo-room',
                startedBy: 'Alice',
                startedById: 'player-1',
                players: [
                    { userId: 'player-1', username: 'Alice', teamAssignment: 1 },
                    { userId: 'player-2', username: 'Bob', teamAssignment: 2 }
                ],
                timestamp: new Date().toISOString()
            },
            { maxRetries: 1 }
        );

        console.log(`Event delivery result: ${success ? 'SUCCESS' : 'FAILED'}`);
        console.log('HTTP fallback requests:', this.mockHTTP.getRequests().length);
        
        // Wait for fallback to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const httpRequests = this.mockHTTP.getRequests();
        if (httpRequests.length > 0) {
            console.log('HTTP fallback was attempted:', httpRequests[0].url);
        }

        // Disable failure mode
        this.mockIO.setFailureMode(false);
    }

    async demonstrateEventConfirmation() {
        console.log('\n4. DEMONSTRATING EVENT CONFIRMATION');
        console.log('-'.repeat(50));

        // Start an event emission
        const eventPromise = this.reliabilityLayer.emitWithRetry(
            'demo-room',
            'player-joined',
            {
                gameId: 'demo-room',
                player: { userId: 'player-3', username: 'Charlie' },
                timestamp: new Date().toISOString()
            }
        );

        // Simulate client confirmation after a delay
        setTimeout(() => {
            const emissionLog = this.mockIO.getEmissionLog();
            const lastEvent = emissionLog[emissionLog.length - 1];
            if (lastEvent && lastEvent.data._eventId) {
                console.log(`Simulating client confirmation for event: ${lastEvent.data._eventId}`);
                this.reliabilityLayer.confirmEventDelivery(lastEvent.data._eventId);
            }
        }, 100);

        const success = await eventPromise;
        console.log(`Event delivery with confirmation: ${success ? 'SUCCESS' : 'FAILED'}`);
    }

    async demonstrateStatisticsAndMonitoring() {
        console.log('\n5. DEMONSTRATING STATISTICS AND MONITORING');
        console.log('-'.repeat(50));

        // Generate some events for statistics
        await this.reliabilityLayer.emitWithRetry('demo-room', 'test-event-1', { test: 1 });
        await this.reliabilityLayer.emitWithRetry('demo-room', 'test-event-2', { test: 2 });
        await this.reliabilityLayer.emitWithRetry('demo-room', 'test-event-1', { test: 3 });

        const stats = this.reliabilityLayer.getDeliveryStats();
        console.log('Event delivery statistics:');
        console.log(JSON.stringify(stats, null, 2));

        console.log('\nCritical events list:');
        console.log(Array.from(this.reliabilityLayer.criticalEvents));

        // Demonstrate adding/removing critical events
        this.reliabilityLayer.addCriticalEvent('custom-critical-event');
        console.log('Added custom critical event');
        
        this.reliabilityLayer.removeCriticalEvent('custom-critical-event');
        console.log('Removed custom critical event');
    }

    async demonstrateReliableSocketManager() {
        console.log('\n6. DEMONSTRATING RELIABLE SOCKET MANAGER INTEGRATION');
        console.log('-'.repeat(50));

        const reliableSocketManager = new ReliableSocketManager(this.mockSocketManager);

        // Demonstrate reliable event emission
        const success = await reliableSocketManager.emitReliable(
            'demo-room',
            'state-synchronized',
            {
                gameId: 'demo-room',
                trigger: 'demo',
                players: Array.from(this.demoRoom.players.values()),
                timestamp: new Date().toISOString()
            }
        );

        console.log(`Reliable socket manager emission: ${success ? 'SUCCESS' : 'FAILED'}`);

        // Demonstrate connection management
        await reliableSocketManager.handleConnectionFailure('demo-room', 'player-1');
        console.log('Simulated connection failure for player-1');

        await reliableSocketManager.handleConnectionRecovery('demo-room', 'player-1');
        console.log('Simulated connection recovery for player-1');

        // Get reliability statistics
        const reliabilityStats = reliableSocketManager.getReliabilityStats();
        console.log('Reliability statistics:', Object.keys(reliabilityStats));

        reliableSocketManager.shutdown();
    }

    async demonstrateErrorHandling() {
        console.log('\n7. DEMONSTRATING ERROR HANDLING');
        console.log('-'.repeat(50));

        // Test with malformed data
        const success1 = await this.reliabilityLayer.emitWithRetry(
            'demo-room',
            'test-event',
            null
        );
        console.log(`Event with null data: ${success1 ? 'SUCCESS' : 'FAILED'}`);

        // Test with empty target
        const success2 = await this.reliabilityLayer.emitWithRetry(
            '',
            'test-event',
            { message: 'test' }
        );
        console.log(`Event with empty target: ${success2 ? 'SUCCESS' : 'FAILED'}`);

        // Test with non-existent socket
        const success3 = await this.reliabilityLayer.emitWithRetry(
            'socket:nonexistent',
            'test-event',
            { message: 'test' }
        );
        console.log(`Event to non-existent socket: ${success3 ? 'SUCCESS' : 'FAILED'}`);
    }

    async runFullDemo() {
        try {
            await this.demonstrateSuccessfulDelivery();
            await this.demonstrateRetryMechanism();
            await this.demonstrateHttpFallback();
            await this.demonstrateEventConfirmation();
            await this.demonstrateStatisticsAndMonitoring();
            await this.demonstrateReliableSocketManager();
            await this.demonstrateErrorHandling();

            console.log('\n' + '='.repeat(60));
            console.log('DEMONSTRATION COMPLETED SUCCESSFULLY');
            console.log('='.repeat(60));

            // Final statistics
            const finalStats = this.reliabilityLayer.getDeliveryStats();
            console.log('\nFinal delivery statistics:');
            for (const [eventType, stats] of Object.entries(finalStats.eventStats)) {
                const successRate = stats.attempted > 0 ? 
                    ((stats.delivered / stats.attempted) * 100).toFixed(2) : '0.00';
                console.log(`  ${eventType}: ${stats.delivered}/${stats.attempted} (${successRate}%) success`);
            }

        } catch (error) {
            console.error('Demo error:', error);
        } finally {
            this.reliabilityLayer.shutdown();
        }
    }
}

// Run the demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
    const demo = new WebsocketReliabilityDemo();
    demo.runFullDemo().catch(console.error);
}

export default WebsocketReliabilityDemo;