/**
 * Test suite for WaitingRoomSocketManager connection stability
 * Tests the improved connection handling and disconnection fixes
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock Socket.IO
const mockSocket = {
    id: 'test-socket-id',
    connected: true,
    io: {
        reconnection: true,
        reconnectionAttempts: 5
    },
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn()
};

const mockIo = jest.fn(() => mockSocket);

// Mock global io function
global.io = mockIo;

// Mock AuthManager
const mockAuthManager = {
    getToken: jest.fn(() => 'mock-token'),
    getCurrentUser: jest.fn(() => ({
        user_id: 'test-user-id',
        username: 'testuser'
    }))
};

// Import after mocking
import { WaitingRoomSocketManager } from '../src/core/WaitingRoomSocketManager.js';

describe('WaitingRoomSocketManager Connection Stability', () => {
    let socketManager;
    const roomId = 'test-room-id';

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        mockSocket.connected = true;
        
        // Create socket manager instance
        socketManager = new WaitingRoomSocketManager(mockAuthManager, roomId);
    });

    afterEach(() => {
        if (socketManager) {
            socketManager.disconnect();
        }
    });

    describe('Connection Configuration', () => {
        it('should configure socket with automatic reconnection enabled', async () => {
            await socketManager.connect();

            expect(mockIo).toHaveBeenCalledWith({
                auth: {
                    token: 'mock-token'
                },
                transports: ['websocket', 'polling'],
                timeout: 20000,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                forceNew: false
            });
        });

        it('should set up automatic reconnection event handlers', async () => {
            await socketManager.connect();

            // Verify that reconnection event handlers are set up
            const onCalls = mockSocket.on.mock.calls;
            const eventNames = onCalls.map(call => call[0]);

            expect(eventNames).toContain('reconnect');
            expect(eventNames).toContain('reconnect_attempt');
            expect(eventNames).toContain('reconnect_error');
            expect(eventNames).toContain('reconnect_failed');
        });
    });

    describe('Disconnect Handling', () => {
        it('should handle client namespace disconnect gracefully', async () => {
            await socketManager.connect();

            // Find the disconnect handler
            const disconnectHandler = mockSocket.on.mock.calls
                .find(call => call[0] === 'disconnect')[1];

            // Simulate client namespace disconnect
            disconnectHandler('client namespace disconnect');

            expect(socketManager.isConnected).toBe(false);
            expect(socketManager.isJoined).toBe(false);
            expect(socketManager.connectionStatus).toBe('disconnected');
        });

        it('should attempt reconnection for server disconnect', async () => {
            await socketManager.connect();
            const handleReconnectionSpy = jest.spyOn(socketManager, 'handleReconnection');

            // Find the disconnect handler
            const disconnectHandler = mockSocket.on.mock.calls
                .find(call => call[0] === 'disconnect')[1];

            // Simulate server disconnect
            disconnectHandler('io server disconnect');

            expect(handleReconnectionSpy).toHaveBeenCalled();
        });

        it('should attempt reconnection for ping timeout', async () => {
            await socketManager.connect();
            const handleReconnectionSpy = jest.spyOn(socketManager, 'handleReconnection');

            // Find the disconnect handler
            const disconnectHandler = mockSocket.on.mock.calls
                .find(call => call[0] === 'disconnect')[1];

            // Simulate ping timeout
            disconnectHandler('ping timeout');

            expect(handleReconnectionSpy).toHaveBeenCalled();
        });
    });

    describe('Automatic Reconnection', () => {
        it('should handle successful automatic reconnection', async () => {
            await socketManager.connect();
            const joinRoomSpy = jest.spyOn(socketManager, 'joinRoom').mockResolvedValue();

            // Find the reconnect handler
            const reconnectHandler = mockSocket.on.mock.calls
                .find(call => call[0] === 'reconnect')[1];

            // Simulate successful reconnection
            reconnectHandler(3);

            expect(socketManager.isConnected).toBe(true);
            expect(socketManager.reconnectAttempts).toBe(0);
            expect(socketManager.connectionStatus).toBe('connected');
            expect(joinRoomSpy).toHaveBeenCalled();
        });

        it('should handle reconnection attempts', async () => {
            await socketManager.connect();

            // Find the reconnect_attempt handler
            const reconnectAttemptHandler = mockSocket.on.mock.calls
                .find(call => call[0] === 'reconnect_attempt')[1];

            // Simulate reconnection attempt
            reconnectAttemptHandler(2);

            expect(socketManager.connectionStatus).toBe('reconnecting');
        });

        it('should handle reconnection failure', async () => {
            await socketManager.connect();

            // Find the reconnect_failed handler
            const reconnectFailedHandler = mockSocket.on.mock.calls
                .find(call => call[0] === 'reconnect_failed')[1];

            // Simulate reconnection failure
            reconnectFailedHandler();

            expect(socketManager.connectionStatus).toBe('disconnected');
        });
    });

    describe('Heartbeat Management', () => {
        it('should not start custom heartbeat when automatic reconnection is enabled', async () => {
            await socketManager.connect();
            
            // Since reconnection is enabled, custom heartbeat should not start
            expect(socketManager.heartbeatInterval).toBeNull();
        });

        it('should start custom heartbeat when automatic reconnection is disabled', async () => {
            // Mock socket with reconnection disabled
            mockSocket.io.reconnection = false;
            
            await socketManager.connect();
            socketManager.startHeartbeat();
            
            // Custom heartbeat should start when automatic reconnection is disabled
            expect(socketManager.heartbeatInterval).not.toBeNull();
        });
    });

    describe('Graceful Disconnect', () => {
        it('should disconnect gracefully with cleanup', async () => {
            await socketManager.connect();
            
            socketManager.disconnect();

            expect(mockSocket.removeAllListeners).toHaveBeenCalled();
            expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
            expect(socketManager.isConnected).toBe(false);
            expect(socketManager.isJoined).toBe(false);
            expect(socketManager.connectionStatus).toBe('disconnected');
        });

        it('should leave room before disconnecting', async () => {
            await socketManager.connect();
            socketManager.isJoined = true;
            
            const leaveRoomSpy = jest.spyOn(socketManager, 'leaveRoom');
            
            socketManager.disconnect();

            expect(leaveRoomSpy).toHaveBeenCalled();
        });
    });

    describe('Connection Status Management', () => {
        it('should emit connection status changes', async () => {
            const statusChangeSpy = jest.fn();
            socketManager.on('connection-status-changed', statusChangeSpy);

            await socketManager.connect();

            // Should emit status change to connecting and then connected
            expect(statusChangeSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'connecting'
                })
            );
        });

        it('should provide accurate connection status', async () => {
            expect(socketManager.getConnectionStatus()).toEqual({
                status: 'disconnected',
                isConnected: false,
                isJoined: false,
                reconnectAttempts: 0,
                maxReconnectAttempts: 5,
                lastPongReceived: null
            });

            await socketManager.connect();

            expect(socketManager.getConnectionStatus().status).toBe('connected');
            expect(socketManager.getConnectionStatus().isConnected).toBe(true);
        });
    });

    describe('Reconnection Throttling', () => {
        it('should add delay between reconnection attempts', async () => {
            const delaySpy = jest.spyOn(global, 'setTimeout');
            
            await socketManager.connect();
            await socketManager.attemptReconnection();

            // Should add 1 second delay before reconnection
            expect(delaySpy).toHaveBeenCalledWith(expect.any(Function), 1000);
        });
    });
});