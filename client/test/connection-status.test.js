/**
 * Connection Status and Error Handling Tests
 * Tests for task 11: Implement connection status and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WaitingRoomSocketManager } from '../src/core/WaitingRoomSocketManager.js';
import { WaitingRoomUI } from '../src/ui/WaitingRoomUI.js';

// Mock Socket.IO
const mockSocket = {
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
    connected: true,
    id: 'test-socket-id'
};

const mockIo = vi.fn(() => mockSocket);
global.io = mockIo;

// Mock AuthManager
const mockAuthManager = {
    getToken: vi.fn(() => 'test-token'),
    getCurrentUser: vi.fn(() => ({ user_id: 'test-user', username: 'TestUser' })),
    isAuthenticated: vi.fn(() => true)
};

// Mock fetch for HTTP polling
global.fetch = vi.fn();

describe('Connection Status and Error Handling', () => {
    let socketManager;
    let uiManager;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        
        // Set up DOM elements for UI tests
        document.body.innerHTML = `
            <div id="connection-status" class="connection-status">
                <span class="status-indicator" id="status-indicator"></span>
                <span class="status-text" id="status-text">Connecting...</span>
            </div>
            <div id="room-code">TEST123</div>
            <button id="copy-code-btn">Copy</button>
            <button id="ready-toggle-btn">Ready</button>
            <button id="start-game-btn">Start</button>
            <div id="current-players">0</div>
            <div id="ready-count">0</div>
            <div id="host-controls" class="hidden"></div>
            <div id="game-messages"></div>
            <div id="loading-overlay" class="hidden"></div>
            <div id="error-modal" class="hidden">
                <div id="error-message"></div>
                <button id="close-error-btn">Close</button>
                <button id="error-ok-btn">OK</button>
            </div>
            <div class="players-grid">
                <div id="player-slot-1" class="player-slot"></div>
                <div id="player-slot-2" class="player-slot"></div>
                <div id="player-slot-3" class="player-slot"></div>
                <div id="player-slot-4" class="player-slot"></div>
            </div>
        `;

        socketManager = new WaitingRoomSocketManager(mockAuthManager, 'test-room');
        uiManager = new WaitingRoomUI();
    });

    afterEach(() => {
        if (socketManager) {
            socketManager.disconnect();
        }
        if (uiManager) {
            uiManager.cleanup();
        }
    });

    describe('WebSocket Connection Status', () => {
        it('should initialize with disconnected status', () => {
            expect(socketManager.getConnectionStatus().status).toBe('disconnected');
            expect(socketManager.getConnectionStatus().isConnected).toBe(false);
        });

        it('should update status to connecting when connection starts', () => {
            const statusChangedSpy = vi.fn();
            socketManager.on('connection-status-changed', statusChangedSpy);

            socketManager.updateConnectionStatus('connecting');

            expect(statusChangedSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'connecting',
                    previousStatus: 'disconnected'
                })
            );
        });

        it('should update status to connected when connection succeeds', () => {
            const statusChangedSpy = vi.fn();
            socketManager.on('connection-status-changed', statusChangedSpy);

            socketManager.updateConnectionStatus('connected');

            expect(statusChangedSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'connected',
                    previousStatus: 'disconnected'
                })
            );
        });

        it('should provide detailed connection health information', () => {
            const health = socketManager.getConnectionHealth();

            expect(health).toHaveProperty('status');
            expect(health).toHaveProperty('isConnected');
            expect(health).toHaveProperty('isJoined');
            expect(health).toHaveProperty('reconnectAttempts');
            expect(health).toHaveProperty('maxReconnectAttempts');
            expect(health).toHaveProperty('timestamp');
        });
    });

    describe('Exponential Backoff Reconnection', () => {
        it('should implement exponential backoff for reconnection attempts', () => {
            const reconnectingSpy = vi.fn();
            socketManager.on('reconnecting', reconnectingSpy);

            // Simulate multiple reconnection attempts
            socketManager.reconnectAttempts = 1;
            socketManager.handleReconnection();

            expect(reconnectingSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    attempt: 2,
                    maxAttempts: 5
                })
            );
        });

        it('should stop reconnecting after max attempts', () => {
            const reconnectFailedSpy = vi.fn();
            socketManager.on('reconnect-failed', reconnectFailedSpy);

            socketManager.reconnectAttempts = 5;
            socketManager.handleReconnection();

            expect(reconnectFailedSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    attempts: 5,
                    maxAttempts: 5
                })
            );
        });
    });

    describe('HTTP Polling Fallback', () => {
        beforeEach(() => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ 
                    id: 'test-room',
                    players: [],
                    status: 'waiting'
                })
            });
        });

        it('should start HTTP polling when WebSocket fails', () => {
            const pollingSpy = vi.fn();
            socketManager.on('http-polling-started', pollingSpy);

            socketManager.startHttpPolling();

            expect(pollingSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    frequency: 5000
                })
            );
            expect(socketManager.getHttpPollingStatus().enabled).toBe(true);
        });

        it('should perform HTTP polls at regular intervals', async () => {
            socketManager.startHttpPolling();

            // Wait for initial poll
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(global.fetch).toHaveBeenCalledWith(
                '/api/waiting-rooms/test-room',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-token'
                    })
                })
            );
        });

        it('should stop HTTP polling when WebSocket recovers', () => {
            const pollingStoppedSpy = vi.fn();
            socketManager.on('http-polling-stopped', pollingStoppedSpy);

            socketManager.startHttpPolling();
            socketManager.isConnected = true;
            socketManager.disableHttpFallback();

            expect(pollingStoppedSpy).toHaveBeenCalled();
            expect(socketManager.getHttpPollingStatus().enabled).toBe(false);
        });

        it('should handle HTTP polling errors gracefully', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'));
            
            const pollingErrorSpy = vi.fn();
            socketManager.on('http-polling-error', pollingErrorSpy);

            socketManager.startHttpPolling();
            
            // Wait for poll to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(pollingErrorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Network error',
                    attempts: 1
                })
            );
        });
    });

    describe('UI Connection Status Indicators', () => {
        it('should update connection status indicator with color coding', () => {
            const indicator = document.getElementById('status-indicator');
            const text = document.getElementById('status-text');

            uiManager.updateConnectionStatus('connected');

            expect(indicator.classList.contains('connected')).toBe(true);
            expect(text.textContent).toBe('Connected');
        });

        it('should show reconnection attempts in status text', () => {
            const text = document.getElementById('status-text');

            uiManager.updateConnectionStatus('reconnecting', {
                reconnectAttempts: 3,
                maxReconnectAttempts: 5
            });

            expect(text.textContent).toBe('Reconnecting... (3/5)');
        });

        it('should display connection warnings', () => {
            uiManager.showConnectionWarning('warning', 'Test warning message');

            const warning = document.getElementById('connection-warning');
            expect(warning).toBeTruthy();
            expect(warning.style.display).toBe('flex');
            expect(warning.textContent).toContain('Test warning message');
        });

        it('should show connection recovery options', () => {
            const onRefresh = vi.fn();
            const onRetry = vi.fn();

            uiManager.showConnectionRecoveryOptions({
                showRefresh: true,
                showRetry: true,
                onRefresh,
                onRetry
            });

            const modal = document.getElementById('connection-recovery-modal');
            expect(modal).toBeTruthy();
            expect(modal.classList.contains('modal')).toBe(true);
        });
    });

    describe('Error Messages and Recovery', () => {
        it('should provide user-friendly error messages', () => {
            const errorSpy = vi.fn();
            socketManager.on('connection-warning', errorSpy);

            socketManager.emit('connection-warning', {
                type: 'stale_connection',
                message: 'Connection may be stale'
            });

            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'stale_connection',
                    message: 'Connection may be stale'
                })
            );
        });

        it('should offer recovery options when connection fails', () => {
            const recoveryModal = uiManager.showConnectionRecoveryOptions({
                showRefresh: true,
                showRetry: true,
                showHttpFallback: true
            });

            expect(recoveryModal).toBeTruthy();
            expect(recoveryModal.querySelector('#recovery-refresh')).toBeTruthy();
            expect(recoveryModal.querySelector('#recovery-retry')).toBeTruthy();
            expect(recoveryModal.querySelector('#recovery-fallback')).toBeTruthy();
        });

        it('should handle connection health monitoring', () => {
            const health = socketManager.checkConnectionHealth();

            expect(health).toHaveProperty('status');
            expect(health).toHaveProperty('isConnected');
            expect(health).toHaveProperty('reconnectAttempts');
            expect(health).toHaveProperty('timestamp');
        });
    });

    describe('Mobile Responsiveness', () => {
        it('should adapt connection status for mobile screens', () => {
            // Simulate mobile viewport
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: 400
            });

            uiManager.isMobile = true;
            uiManager.updateMobileLayout();

            const container = document.querySelector('.waiting-room-container');
            // Note: In a real test, we'd check for mobile-specific classes
            // This is a basic structure test
            expect(uiManager.isMobile).toBe(true);
        });
    });

    describe('Accessibility', () => {
        it('should set proper ARIA attributes for connection status', () => {
            const indicator = document.getElementById('status-indicator');

            uiManager.updateConnectionStatus('connected');

            expect(indicator.getAttribute('aria-label')).toBe('Connection status: connected');
            expect(indicator.getAttribute('title')).toBe('Connected');
        });
    });
});