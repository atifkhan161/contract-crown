/**
 * Waiting Room Manager
 * Handles waiting room initialization, state management, and player coordination
 */

import { AuthManager } from '../core/auth.js';
import { WaitingRoomSocketManager } from '../core/WaitingRoomSocketManager.js';
import { WaitingRoomUI } from '../ui/WaitingRoomUI.js';

class WaitingRoomManager {
    constructor() {
        this.authManager = new AuthManager();
        this.socketManager = null;
        this.uiManager = new WaitingRoomUI();

        this.elements = {};
        this.currentUser = null;
        this.roomId = null;
        this.roomData = null;
        this.isHost = false;
        this.isReady = false;
        this.players = [];

        // Connection monitoring
        this.connectionHealthTimer = null;
        this.connectionHealthInterval = 30000; // 30 seconds
        this.lastSuccessfulUpdate = Date.now();

        this.initializeElements();
        this.setupEventListeners();
        this.initialize();
    }

    initializeElements() {
        // Header elements
        this.elements.leaveRoomBtn = document.getElementById('leave-room-btn');
        this.elements.roomCode = document.getElementById('room-code');
        this.elements.copyCodeBtn = document.getElementById('copy-code-btn');

        // Connection status
        this.elements.connectionStatus = document.getElementById('connection-status');
        this.elements.statusIndicator = document.getElementById('status-indicator');
        this.elements.statusText = document.getElementById('status-text');

        // Player elements
        this.elements.currentPlayers = document.getElementById('current-players');
        this.elements.playerSlots = {
            1: document.getElementById('player-slot-1'),
            2: document.getElementById('player-slot-2'),
            3: document.getElementById('player-slot-3'),
            4: document.getElementById('player-slot-4')
        };

        // Ready controls
        this.elements.readyToggleBtn = document.getElementById('ready-toggle-btn');
        this.elements.readyCount = document.getElementById('ready-count');

        // Host controls
        this.elements.hostControls = document.getElementById('host-controls');
        this.elements.startGameBtn = document.getElementById('start-game-btn');
        this.elements.startSpinner = document.getElementById('start-spinner');

        // Messages and modals
        this.elements.gameMessages = document.getElementById('game-messages');
        this.elements.loadingOverlay = document.getElementById('loading-overlay');
        this.elements.errorModal = document.getElementById('error-modal');
        this.elements.errorMessage = document.getElementById('error-message');
        this.elements.closeErrorBtn = document.getElementById('close-error-btn');
        this.elements.errorOkBtn = document.getElementById('error-ok-btn');
    }
    setupEventListeners() {
        // Leave room button
        this.elements.leaveRoomBtn.addEventListener('click', () => this.handleLeaveRoom());

        // Copy room code button
        this.elements.copyCodeBtn.addEventListener('click', () => this.handleCopyRoomCode());

        // Ready toggle button
        this.elements.readyToggleBtn.addEventListener('click', () => this.handleReadyToggle());

        // Start game button (host only)
        this.elements.startGameBtn.addEventListener('click', () => this.handleStartGame());

        // Error modal close buttons
        this.elements.closeErrorBtn.addEventListener('click', () => this.hideErrorModal());
        this.elements.errorOkBtn.addEventListener('click', () => this.hideErrorModal());

        // Modal overlay click to close
        this.elements.errorModal.addEventListener('click', (e) => {
            if (e.target === this.elements.errorModal) {
                this.hideErrorModal();
            }
        });

        // Handle page unload for cleanup
        window.addEventListener('beforeunload', () => this.cleanup());

        // Handle visibility change for connection management
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.handlePageHidden();
            } else {
                this.handlePageVisible();
            }
        });
    }

    async initialize() {
        try {
            console.log('[WaitingRoom] Initializing waiting room...');

            // Check authentication
            const isAuthenticated = this.authManager.isAuthenticated();
            const user = this.authManager.getCurrentUser();

            if (!isAuthenticated || !user) {
                console.log('[WaitingRoom] User not authenticated, redirecting to login');
                window.location.href = 'login.html';
                return;
            }

            this.currentUser = user;
            console.log('[WaitingRoom] Current user:', this.currentUser.username);

            // Parse room ID from URL parameters
            this.roomId = this.parseRoomIdFromURL();
            if (!this.roomId) {
                this.showError('Invalid room ID. Redirecting to dashboard...');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 2000);
                return;
            }

            console.log('[WaitingRoom] Room ID:', this.roomId);

            // Load room data
            await this.loadRoomData();

            // Initialize socket manager for real-time communication
            await this.initializeSocketManager();

            // Start connection health monitoring
            this.startConnectionHealthMonitoring();

        } catch (error) {
            console.error('[WaitingRoom] Initialization error:', error);
            this.showError('Failed to initialize waiting room. Please try again.');
        }
    }
    parseRoomIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');

        if (!roomId) {
            console.error('[WaitingRoom] No room ID found in URL parameters');
            return null;
        }

        // Basic validation for room ID format (UUID-like)
        const roomIdPattern = /^[a-zA-Z0-9-_]{8,}$/;
        if (!roomIdPattern.test(roomId)) {
            console.error('[WaitingRoom] Invalid room ID format:', roomId);
            return null;
        }

        return roomId;
    }

    async loadRoomData() {
        try {
            this.showLoading(true, 'Loading room data...');

            const token = this.authManager.getToken();
            const response = await fetch(`/api/rooms/${this.roomId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Room not found. It may have been deleted.');
                } else if (response.status === 403) {
                    throw new Error('You do not have permission to access this room.');
                } else {
                    throw new Error(`Failed to load room data: ${response.statusText}`);
                }
            }

            this.roomData = await response.json();
            console.log('[WaitingRoom] Room data loaded:', this.roomData);

            // Update UI with room data
            this.updateRoomDisplay();

            // Check if current user is the host
            const currentUserId = this.currentUser.user_id || this.currentUser.id;
            const roomOwnerId = this.roomData.owner;

            console.log('[WaitingRoom] Host detection debug:', {
                currentUserId,
                currentUserIdType: typeof currentUserId,
                roomOwnerId,
                roomOwnerIdType: typeof roomOwnerId,
                strictEqual: roomOwnerId === currentUserId,
                looseEqual: roomOwnerId == currentUserId,
                stringComparison: String(roomOwnerId) === String(currentUserId)
            });

            // Use string comparison to ensure no type issues
            this.isHost = String(roomOwnerId) === String(currentUserId);

            console.log('[WaitingRoom] Final host status:', this.isHost);

            // Always show host controls if user IDs match (more robust check)
            if (String(currentUserId) === String(roomOwnerId)) {
                console.log('[WaitingRoom] User is host (IDs match), showing host controls');
                this.isHost = true;
                this.uiManager.showHostControls(true, false);
            } else {
                console.log('[WaitingRoom] User is not host, host controls will remain hidden');
                this.uiManager.showHostControls(false, false);
            }

        } catch (error) {
            console.error('[WaitingRoom] Error loading room data:', error);
            throw error;
        } finally {
            this.showLoading(false);
        }
    }

    async initializeSocketManager() {
        try {
            console.log('[WaitingRoom] Initializing socket manager...');

            // Create socket manager instance
            this.socketManager = new WaitingRoomSocketManager(this.authManager, this.roomId);

            // Set up socket event listeners
            this.setupSocketEventListeners();

            // Connect to WebSocket server
            await this.socketManager.connect();

            console.log('[WaitingRoom] Socket manager initialized successfully');

        } catch (error) {
            console.error('[WaitingRoom] Failed to initialize socket manager:', error);
            this.showError('Failed to connect to real-time updates. Some features may not work properly.');

            // Continue without socket connection - fallback to HTTP polling could be implemented here
        }
    }

    setupSocketEventListeners() {
        if (!this.socketManager) return;

        // Connection status events
        this.socketManager.on('connection-status-changed', (data) => {
            this.updateConnectionStatus(data.status, data);
        });

        this.socketManager.on('reconnecting', (data) => {
            this.updateConnectionStatus('reconnecting', data);
            this.uiManager.addMessage(`Reconnecting... (attempt ${data.attempt}/${data.maxAttempts})`, 'system');
        });

        this.socketManager.on('reconnected', (data) => {
            this.uiManager.addMessage('Reconnected successfully!', 'success');
            this.uiManager.hideConnectionWarning();
        });

        this.socketManager.on('reconnect-failed', (data) => {
            this.handleReconnectFailed(data);
        });

        this.socketManager.on('connection-lost', () => {
            this.uiManager.addMessage('Connection lost. Attempting to reconnect...', 'error');
            this.uiManager.showConnectionWarning('warning', 'Connection lost - trying to reconnect...');
        });

        this.socketManager.on('connection-warning', (data) => {
            this.handleConnectionWarning(data);
        });

        this.socketManager.on('connection-health-check', (data) => {
            console.log('[WaitingRoom] Connection health:', data);
        });

        // HTTP polling fallback events
        this.socketManager.on('http-polling-started', (data) => {
            this.uiManager.addMessage('Using backup connection mode', 'system');
            this.uiManager.showConnectionWarning('info', 'Using backup mode - some features may be limited');
        });

        this.socketManager.on('http-polling-stopped', () => {
            this.uiManager.addMessage('Real-time connection restored', 'success');
            this.uiManager.hideConnectionWarning();
        });

        this.socketManager.on('http-polling-error', (data) => {
            console.warn('[WaitingRoom] HTTP polling error:', data);
            if (data.attempts >= data.maxAttempts - 1) {
                this.uiManager.showConnectionWarning('error', 'Backup connection failing - please refresh');
            }
        });

        this.socketManager.on('http-polling-failed', () => {
            this.handleHttpPollingFailed();
        });

        // Room events
        this.socketManager.on('room-joined', (data) => {
            console.log('[WaitingRoom] Successfully joined room via socket:', data);

            // Update room data with the received data
            if (data.players) {
                // Map server player data format to client format
                const mappedPlayers = data.players.map(player => ({
                    id: player.userId,
                    user_id: player.userId,
                    username: player.username,
                    isReady: player.isReady,
                    teamAssignment: player.teamAssignment,
                    isConnected: player.isConnected !== false
                }));

                // Update room data
                if (!this.roomData) {
                    this.roomData = {};
                }
                this.roomData.players = mappedPlayers;
                this.roomData.status = data.roomStatus || 'waiting';
                this.roomData.owner = data.hostId;

                this.updateRoomDisplay();
            }
        });

        this.socketManager.on('room-join-error', (error) => {
            console.error('[WaitingRoom] Failed to join room via socket:', error);
            this.showError(error.message || 'Failed to join room');
        });

        this.socketManager.on('room-updated', (data) => {
            console.log('[WaitingRoom] Room updated:', data);
            if (data.room) {
                this.roomData = data.room;
                this.updateRoomDisplay();
                this.markSuccessfulUpdate();
            }
        });

        // Player events
        this.socketManager.on('player-joined', (data) => {
            this.handlePlayerJoin(data.player || data);
            this.markSuccessfulUpdate();
        });

        this.socketManager.on('player-left', (data) => {
            this.handlePlayerLeave(data);
            this.markSuccessfulUpdate();
        });

        this.socketManager.on('host-transferred', (data) => {
            this.handleHostTransfer(data);
            this.markSuccessfulUpdate();
        });

        this.socketManager.on('player-ready-changed', (data) => {
            this.handleReadyStatusChange(data.playerId || data.userId, data.isReady);
            this.markSuccessfulUpdate();
        });

        this.socketManager.on('player-disconnected', (data) => {
            console.log('[WaitingRoom] Player disconnected:', data);
            // Update player connection status but don't remove them
            const playerId = data.playerId || data.userId;
            const playerIndex = this.players.findIndex(player =>
                player.id === playerId || player.user_id === playerId
            );

            if (playerIndex !== -1) {
                this.players[playerIndex].isConnected = false;
                this.updatePlayersDisplay();
                const playerName = this.players[playerIndex].username || this.players[playerIndex].name;
                this.uiManager.addMessage(`${playerName} disconnected`, 'system');
            }
        });

        // Game events
        this.socketManager.on('game-starting', (data) => {
            this.handleGameStart(data);
        });

        this.socketManager.on('teams-formed', (data) => {
            console.log('[WaitingRoom] Teams formed:', data);
            this.uiManager.addMessage('Teams have been formed! Starting game...', 'success');
        });

        this.socketManager.on('bots-added', (data) => {
            console.log('[WaitingRoom] Bots added:', data);
            this.handleBotsAdded(data);
        });

        this.socketManager.on('navigate-to-game', (data) => {
            this.handleNavigateToGame(data);
        });

        // Error events
        this.socketManager.on('waiting-room-error', (error) => {
            console.error('[WaitingRoom] Waiting room error:', error);
            this.showError(error.message || 'An error occurred in the waiting room');
        });

        this.socketManager.on('ready-toggle-error', (error) => {
            console.error('[WaitingRoom] Ready toggle error:', error);
            this.showError(error.message || 'Failed to update ready status');

            // Re-enable ready button on error
            this.updateReadyButton(true);
        });

        this.socketManager.on('ready-status-confirmed', (data) => {
            console.log('[WaitingRoom] Ready status confirmed:', data);

            // Re-enable ready button after successful update
            this.updateReadyButton(true);

            // Show success message if database sync failed but WebSocket succeeded
            if (!data.dbSynced) {
                this.uiManager.addMessage('Ready status updated (WebSocket only)', 'system');
            }
        });

        this.socketManager.on('game-start-error', (error) => {
            console.error('[WaitingRoom] Game start error:', error);
            this.showError(error.message || 'Failed to start game');
            this.setStartGameLoading(false);
        });

        this.socketManager.on('auth_error', (error) => {
            console.error('[WaitingRoom] Authentication error:', error);
            this.showError('Authentication failed. Please log in again.');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        });
    }

    updateConnectionStatus(status, details = {}) {
        this.uiManager.updateConnectionStatus(status, details);

        // Perform additional actions based on status
        switch (status) {
            case 'connected':
                this.handleConnectionRestored();
                break;
            case 'disconnected':
                this.handleConnectionLost();
                break;
            case 'reconnecting':
                this.handleReconnecting(details);
                break;
        }
    }

    handleConnectionRestored() {
        // Connection is back - ensure UI is in sync
        if (this.roomData) {
            this.updateRoomDisplay();
        }

        // Clear any connection warnings
        this.uiManager.hideConnectionWarning();
    }

    handleConnectionLost() {
        // Disable interactive elements that require real-time connection
        this.setInteractiveElementsEnabled(false);
    }

    handleReconnecting(details) {
        // Show progress if multiple attempts
        if (details.reconnectAttempts > 2) {
            this.uiManager.showConnectionWarning(
                'warning',
                `Connection unstable - attempt ${details.reconnectAttempts}/${details.maxReconnectAttempts}`,
                { autoHide: false }
            );
        }
    }

    handleReconnectFailed(data) {
        console.error('[WaitingRoom] Reconnection failed after', data.attempts, 'attempts');

        // Show recovery options to user
        this.uiManager.showConnectionRecoveryOptions({
            showRefresh: true,
            showRetry: true,
            showHttpFallback: true,
            onRefresh: () => window.location.reload(),
            onRetry: () => this.retryConnection(),
            onHttpFallback: () => this.enableHttpFallbackMode()
        });
    }

    handleConnectionWarning(data) {
        console.warn('[WaitingRoom] Connection warning:', data);

        switch (data.type) {
            case 'stale_connection':
                this.uiManager.showConnectionWarning(
                    'warning',
                    'Connection may be unstable - monitoring...',
                    { autoHide: true, duration: 10000 }
                );
                break;
            default:
                this.uiManager.showConnectionWarning('warning', data.message);
        }
    }

    handleHttpPollingFailed() {
        console.error('[WaitingRoom] HTTP polling fallback failed');

        this.uiManager.showConnectionRecoveryOptions({
            showRefresh: true,
            showRetry: false,
            showHttpFallback: false,
            onRefresh: () => window.location.reload()
        });
    }

    async retryConnection() {
        try {
            this.uiManager.addMessage('Retrying connection...', 'system');

            if (this.socketManager) {
                await this.socketManager.disconnect();
                await this.initializeSocketManager();
            }
        } catch (error) {
            console.error('[WaitingRoom] Retry connection failed:', error);
            this.showError('Failed to retry connection. Please refresh the page.');
        }
    }

    enableHttpFallbackMode() {
        if (this.socketManager) {
            this.socketManager.enableHttpFallback();
            this.uiManager.addMessage('Enabled backup connection mode', 'system');
        }
    }

    setInteractiveElementsEnabled(enabled) {
        // Disable/enable buttons that require real-time connection
        const readyButton = this.elements.readyToggleBtn;
        const startButton = this.elements.startGameBtn;

        if (readyButton) {
            readyButton.disabled = !enabled;
            if (!enabled) {
                readyButton.title = 'Connection required for ready status';
            } else {
                readyButton.title = '';
            }
        }

        if (startButton && this.isHost) {
            startButton.disabled = !enabled;
            if (!enabled) {
                startButton.title = 'Connection required to start game';
            } else {
                startButton.title = '';
            }
        }
    }

    updateRoomDisplay() {
        if (!this.roomData) return;

        // Update room code display
        this.uiManager.setRoomCode(this.roomData.id || this.roomId);

        // Update players list
        this.players = this.roomData.players || [];
        this.updatePlayersDisplay();
    }
    updatePlayersDisplay() {
        // Prepare players data with host information
        const playersWithHostInfo = this.players.map(player => ({
            ...player,
            isHost: player.id === this.roomData.owner || player.user_id === this.roomData.owner
        }));

        // Update UI with player data
        this.uiManager.updatePlayerSlots(playersWithHostInfo);

        // Calculate ready count based on connected players
        const connectedPlayers = this.players.filter(player => player.isConnected !== false);
        const readyPlayers = connectedPlayers.filter(player => player.isReady);
        const readyCount = readyPlayers.length;

        // Update ready status display with more detailed information
        this.uiManager.updateReadyStatus(readyCount, connectedPlayers.length);

        // Check if current user is in the players list and update ready button
        const currentUserId = this.currentUser.user_id || this.currentUser.id;
        const currentPlayer = this.players.find(player =>
            player.id === currentUserId || player.user_id === currentUserId
        );

        console.log('[WaitingRoom] Ready button check:', {
            currentUserId,
            playersCount: this.players.length,
            currentPlayerFound: !!currentPlayer,
            currentPlayer: currentPlayer,
            roomStatus: this.roomData?.status
        });

        if (currentPlayer) {
            this.isReady = currentPlayer.isReady || false;

            // Enable ready button only if player is connected and room is waiting
            const canToggleReady = currentPlayer.isConnected !== false &&
                (!this.roomData || this.roomData.status === 'waiting');

            console.log('[WaitingRoom] Ready button state:', {
                isConnected: currentPlayer.isConnected,
                roomStatus: this.roomData?.status,
                canToggleReady
            });

            this.updateReadyButton(canToggleReady);
        } else {
            console.warn('[WaitingRoom] Current player not found in players list - ready button will be disabled');
            this.updateReadyButton(false);
        }

        // Update start game button state for host with enhanced logic
        console.log('[WaitingRoom] Host check in updatePlayersDisplay:', {
            isHost: this.isHost,
            currentUserId,
            roomOwner: this.roomData?.owner,
            roomData: this.roomData
        });

        // Multiple ways to check if user should be host
        const shouldBeHost = (
            (this.roomData?.owner && String(this.roomData.owner) === String(currentUserId)) ||
            (this.roomData?.room?.owner && String(this.roomData.room.owner) === String(currentUserId)) ||
            // Check if user is first player (fallback for host detection)
            (this.players.length > 0 && (this.players[0].id === currentUserId || this.players[0].user_id === currentUserId))
        );

        if (shouldBeHost && !this.isHost) {
            console.log('[WaitingRoom] User should be host - setting isHost to true');
            this.isHost = true;
        }

        if (this.isHost) {
            console.log('[WaitingRoom] Showing host controls');
            const canStartGame = this.calculateGameStartEligibility();
            this.uiManager.showHostControls(true, canStartGame.canStart);

            // Update host info text with more detailed status
            this.updateHostInfoText(canStartGame);
        } else {
            console.log('[WaitingRoom] Not host, hiding host controls');
            this.uiManager.showHostControls(false, false);
        }
    }

    /**
     * Calculate if the game can be started based on current room state
     */
    calculateGameStartEligibility() {
        const connectedPlayers = this.players.filter(player => player.isConnected !== false);
        const readyPlayers = connectedPlayers.filter(player => player.isReady);

        let canStart = false;
        let reason = '';

        // Check room status
        if (this.roomData && this.roomData.status !== 'waiting') {
            reason = 'Room is not in waiting status';
        }
        // Check minimum players
        else if (connectedPlayers.length < 2) {
            reason = 'Need at least 2 connected players';
        }
        // Check if all connected players are ready
        else if (readyPlayers.length !== connectedPlayers.length) {
            reason = `${readyPlayers.length}/${connectedPlayers.length} players ready`;
        }
        // All conditions met
        else {
            canStart = true;
            const botsNeeded = 4 - connectedPlayers.length;
            if (botsNeeded > 0) {
                reason = `Ready to start with ${connectedPlayers.length} players + ${botsNeeded} bots!`;
            } else {
                reason = `Ready to start with ${connectedPlayers.length} players!`;
            }
        }

        return {
            canStart,
            reason,
            connectedCount: connectedPlayers.length,
            readyCount: readyPlayers.length,
            totalCount: this.players.length
        };
    }

    /**
     * Update host info text with current game start status
     */
    updateHostInfoText(gameStartInfo) {
        const hostInfoElement = document.querySelector('.host-info .host-text');
        if (hostInfoElement) {
            if (gameStartInfo.canStart) {
                hostInfoElement.textContent = `${gameStartInfo.reason} Click "Start Game" to begin.`;
                hostInfoElement.className = 'host-text ready';
            } else {
                hostInfoElement.textContent = `Waiting: ${gameStartInfo.reason}`;
                hostInfoElement.className = 'host-text waiting';
            }
        }
    }

    updateReadyButton(enabled = true) {
        this.uiManager.updateReadyButton(this.isReady, enabled);
    }

    // Event Handlers
    async handleLeaveRoom() {
        const isHost = this.isHost;
        const playerCount = this.players.filter(p => p.isConnected !== false).length;

        // Enhanced confirmation message for hosts
        let confirmMessage = 'Are you sure you want to leave the room?';
        if (isHost && playerCount > 1) {
            confirmMessage = 'You are the host. If you leave, host privileges will be transferred to another player. Are you sure you want to leave?';
        } else if (isHost && playerCount === 1) {
            confirmMessage = 'You are the only player in the room. Leaving will close the room. Are you sure?';
        }

        if (confirm(confirmMessage)) {
            try {
                this.showLoading(true, 'Leaving room...');

                // Set up leave confirmation handler
                const leaveConfirmationHandler = (data) => {
                    console.log('[WaitingRoom] Leave confirmation received:', data);
                    if (data.success) {
                        this.uiManager.addMessage('Successfully left the room', 'success');
                        setTimeout(async () => {
                            await this.cleanup();
                            window.location.href = 'dashboard.html';
                        }, 1000);
                    } else {
                        this.showError('Failed to leave room properly, but redirecting anyway...');
                        setTimeout(async () => {
                            await this.cleanup();
                            window.location.href = 'dashboard.html';
                        }, 2000);
                    }
                };

                // Set up error handler
                const leaveErrorHandler = (error) => {
                    console.error('[WaitingRoom] Leave error:', error);
                    this.showError('Failed to leave room cleanly, but redirecting anyway...');
                    setTimeout(async () => {
                        await this.cleanup();
                        window.location.href = 'dashboard.html';
                    }, 2000);
                };

                // Leave room via socket if connected
                if (this.socketManager && this.socketManager.isReady()) {
                    // Set up one-time listeners for leave response
                    this.socketManager.socket.once('waiting-room-left', leaveConfirmationHandler);
                    this.socketManager.socket.once('waiting-room-error', leaveErrorHandler);

                    this.socketManager.leaveRoom();

                    // Fallback timeout in case no response
                    setTimeout(() => {
                        this.socketManager.socket.off('waiting-room-left', leaveConfirmationHandler);
                        this.socketManager.socket.off('waiting-room-error', leaveErrorHandler);
                        console.warn('[WaitingRoom] Leave response timeout, redirecting anyway');
                        this.cleanup().then(() => {
                            window.location.href = 'dashboard.html';
                        });
                    }, 5000);
                } else {
                    // Fallback to HTTP API if socket not available
                    console.warn('[WaitingRoom] Socket not available, using HTTP fallback for leave');
                    await this.leaveRoomViaAPI();
                }

            } catch (error) {
                console.error('[WaitingRoom] Error leaving room:', error);
                this.showError('Failed to leave room. Please try again.');
                this.showLoading(false);
            }
        }
    }

    /**
     * Fallback method to leave room via HTTP API
     */
    async leaveRoomViaAPI() {
        try {
            const token = this.authManager.getToken();
            const response = await fetch(`/api/waiting-rooms/${this.roomId}/leave`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to leave room');
            }

            const result = await response.json();
            console.log('[WaitingRoom] Left room via HTTP API:', result);

            this.uiManager.addMessage('Successfully left the room', 'success');

            // Clean up and redirect
            setTimeout(async () => {
                await this.cleanup();
                window.location.href = 'dashboard.html';
            }, 1000);

        } catch (error) {
            console.error('[WaitingRoom] HTTP API leave failed:', error);
            throw error;
        }
    }

    async handleCopyRoomCode() {
        // Delegate to UI manager which handles the copy functionality
        await this.uiManager.copyRoomCode();
    }

    async handleReadyToggle() {
        try {
            // Validate that user can change ready status
            const currentUserId = this.currentUser.user_id || this.currentUser.id;
            const currentPlayer = this.players.find(player =>
                player.id === currentUserId || player.user_id === currentUserId
            );

            // Check if player is in the room
            if (!currentPlayer) {
                this.showError('You are not in this room.');
                return;
            }

            // Check if player is connected (for WebSocket scenarios)
            if (currentPlayer.isConnected === false) {
                this.showError('Cannot change ready status while disconnected.');
                return;
            }

            // Check if room is in waiting status
            if (this.roomData && this.roomData.status !== 'waiting') {
                this.showError('Cannot change ready status - room is not waiting for players.');
                return;
            }

            const newReadyStatus = !this.isReady;

            // Disable ready button temporarily to prevent double-clicks
            this.uiManager.updateReadyButton(this.isReady, false);

            // Use socket manager if available
            if (this.socketManager && this.socketManager.isReady()) {
                this.socketManager.toggleReady(newReadyStatus);
                console.log('[WaitingRoom] Ready status toggle sent via socket:', newReadyStatus);

                // Add user feedback message
                this.uiManager.addMessage(
                    `You are now ${newReadyStatus ? 'ready' : 'not ready'}`,
                    'system'
                );
            } else {
                // Fallback to HTTP API if socket not available
                console.warn('[WaitingRoom] Socket not available, using HTTP fallback');
                await this.toggleReadyStatusViaAPI(newReadyStatus);
            }

        } catch (error) {
            console.error('[WaitingRoom] Error toggling ready status:', error);
            this.showError('Failed to update ready status. Please try again.');

            // Re-enable ready button on error
            this.uiManager.updateReadyButton(this.isReady, true);
        }
    }

    /**
     * Fallback method to toggle ready status via HTTP API
     */
    async toggleReadyStatusViaAPI(newReadyStatus) {
        try {
            const token = this.authManager.getToken();
            const response = await fetch(`/api/waiting-rooms/${this.roomId}/ready`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isReady: newReadyStatus })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update ready status');
            }

            const result = await response.json();

            // Update local state
            this.isReady = newReadyStatus;
            this.updateReadyButton();

            // Update the current user's ready status in the players array
            const currentUserId = this.currentUser.user_id || this.currentUser.id;
            const playerIndex = this.players.findIndex(player =>
                player.id === currentUserId || player.user_id === currentUserId
            );

            if (playerIndex !== -1) {
                this.players[playerIndex].isReady = this.isReady;
                this.updatePlayersDisplay();
            }

            // Add user feedback message
            this.uiManager.addMessage(
                `You are now ${newReadyStatus ? 'ready' : 'not ready'}`,
                'system'
            );

            console.log('[WaitingRoom] Ready status updated via HTTP API:', newReadyStatus);

        } catch (error) {
            console.error('[WaitingRoom] HTTP API ready toggle failed:', error);
            throw error;
        }
    }

    async handleStartGame() {
        try {
            // Validate host privileges
            if (!this.isHost) {
                this.showError('Only the host can start the game.');
                return;
            }

            // Validate room status
            if (this.roomData && this.roomData.status !== 'waiting') {
                this.showError('Cannot start game - room is not in waiting status.');
                return;
            }

            // Get connected players for validation
            const connectedPlayers = this.players.filter(player => player.isConnected !== false);
            const readyPlayers = connectedPlayers.filter(player => player.isReady);

            // Enhanced validation for game start conditions
            if (connectedPlayers.length < 2) {
                this.showError('Need at least 2 connected players to start the game.');
                return;
            }

            if (readyPlayers.length !== connectedPlayers.length) {
                this.showError(`All connected players must be ready. Currently ${readyPlayers.length}/${connectedPlayers.length} players are ready.`);
                return;
            }

            // Additional validation for 4-player games
            if (connectedPlayers.length === 4 && readyPlayers.length !== 4) {
                this.showError('All 4 players must be ready before starting the game.');
                return;
            }

            // Disable start button to prevent double-clicks
            this.setStartGameLoading(true);
            this.uiManager.showHostControls(true, false);

            console.log(`[WaitingRoom] Starting game with ${connectedPlayers.length} connected players, ${readyPlayers.length} ready`);

            // Use socket manager if available
            if (this.socketManager && this.socketManager.isReady()) {
                this.socketManager.startGame();
                console.log('[WaitingRoom] Game start request sent via socket');

                // Add user feedback
                this.uiManager.addMessage('Starting game...', 'system');
            } else {
                // Fallback to HTTP API if socket not available
                console.warn('[WaitingRoom] Socket not available, using HTTP fallback');
                await this.startGameViaAPI();
            }

        } catch (error) {
            console.error('[WaitingRoom] Error starting game:', error);
            this.showError('Failed to start game. Please try again.');
            this.setStartGameLoading(false);

            // Re-enable start button on error if conditions are still met
            const connectedPlayers = this.players.filter(player => player.isConnected !== false);
            const readyPlayers = connectedPlayers.filter(player => player.isReady);
            const canStart = connectedPlayers.length >= 2 && readyPlayers.length === connectedPlayers.length;
            this.uiManager.showHostControls(this.isHost, canStart);
        }
    }

    /**
     * Fallback method to start game via HTTP API
     */
    async startGameViaAPI() {
        try {
            const token = this.authManager.getToken();
            const response = await fetch(`/api/waiting-rooms/${this.roomId}/start`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to start game');
            }

            const result = await response.json();

            // Display teams information if available
            if (result.teams) {
                const team1Names = result.teams.team1.map(p => p.username).join(', ');
                const team2Names = result.teams.team2.map(p => p.username).join(', ');
                this.uiManager.addMessage(`Teams formed! Team 1: ${team1Names} vs Team 2: ${team2Names}`, 'success');
            }

            // Display game information if available
            if (result.game) {
                this.uiManager.addMessage(`Game ${result.game.code} created! Starting...`, 'success');
            } else {
                this.uiManager.addMessage('Game is starting! Redirecting...', 'success');
            }

            // Redirect to game page
            const redirectUrl = result.redirectUrl || `game.html?room=${this.roomId}`;
            setTimeout(() => {
                window.location.href = redirectUrl;
            }, 2000);

            console.log('[WaitingRoom] Game started via HTTP API');

        } catch (error) {
            console.error('[WaitingRoom] HTTP API game start failed:', error);
            throw error;
        }
    }
    // Player join/leave event handling
    handlePlayerJoin(playerData) {
        console.log('[WaitingRoom] Player joined:', playerData);

        // Map server data format to client format
        const mappedPlayerData = {
            id: playerData.userId || playerData.id,
            user_id: playerData.userId || playerData.user_id || playerData.id,
            username: playerData.username || playerData.name,
            isReady: playerData.isReady || false,
            isConnected: playerData.isConnected !== false
        };

        // Add player to the list if not already present
        const existingPlayerIndex = this.players.findIndex(player =>
            player.id === mappedPlayerData.id || player.user_id === mappedPlayerData.id
        );

        if (existingPlayerIndex === -1) {
            this.players.push(mappedPlayerData);
        } else {
            // Update existing player data
            this.players[existingPlayerIndex] = {
                ...this.players[existingPlayerIndex],
                ...mappedPlayerData
            };
        }

        this.updatePlayersDisplay();
        this.uiManager.addMessage(`${mappedPlayerData.username} joined the room`, 'system');
    }

    handlePlayerLeave(data) {
        const playerId = data.playerId || data.userId;
        const playerName = data.playerName || 'Unknown Player';

        console.log('[WaitingRoom] Player left:', { playerId, playerName, data });

        // Update players list from server data if available
        if (data.players && Array.isArray(data.players)) {
            this.players = data.players.map(p => ({
                id: p.userId || p.id,
                user_id: p.userId || p.id,
                username: p.username,
                isReady: p.isReady || false,
                teamAssignment: p.teamAssignment || null,
                isConnected: p.isConnected !== false
            }));
        } else {
            // Fallback: remove player from local list
            const playerIndex = this.players.findIndex(player =>
                player.id === playerId || player.user_id === playerId
            );

            if (playerIndex !== -1) {
                this.players.splice(playerIndex, 1);
            }
        }

        // Handle host transfer
        if (data.hostTransferred && data.newHostId) {
            const currentUserId = this.currentUser.user_id || this.currentUser.id;
            const wasCurrentUserHost = this.isHost;

            // Update room owner
            if (this.roomData) {
                this.roomData.owner = data.newHostId;
            }

            // Update local host status
            this.isHost = String(data.newHostId) === String(currentUserId);

            // Show/hide host controls based on new status
            const gameStartInfo = this.calculateGameStartEligibility();
            this.uiManager.showHostControls(this.isHost, gameStartInfo.canStart);

            // Add appropriate message
            if (data.wasHost) {
                if (this.isHost) {
                    this.uiManager.addMessage(`${playerName} (host) left. You are now the host!`, 'success');
                } else {
                    const newHost = this.players.find(p =>
                        (p.id === data.newHostId || p.user_id === data.newHostId)
                    );
                    const newHostName = newHost ? newHost.username : 'Unknown';
                    this.uiManager.addMessage(`${playerName} (host) left. ${newHostName} is now the host.`, 'system');
                }
            } else {
                this.uiManager.addMessage(`${playerName} left the room`, 'system');
            }
        } else {
            this.uiManager.addMessage(`${playerName} left the room`, 'system');
        }

        // Update display with new player count and ready status
        this.updatePlayersDisplay();

        // Update host info if current user is host
        if (this.isHost) {
            const gameStartInfo = this.calculateGameStartEligibility();
            this.updateHostInfoText(gameStartInfo);
        }
    }

    handleHostTransfer(data) {
        console.log('[WaitingRoom] Host transfer event:', data);

        const currentUserId = this.currentUser.user_id || this.currentUser.id;
        const wasHost = this.isHost;

        // Update room owner
        if (this.roomData) {
            this.roomData.owner = data.newHostId;
        }

        // Update local host status
        this.isHost = String(data.newHostId) === String(currentUserId);

        // Show/hide host controls
        const gameStartInfo = this.calculateGameStartEligibility();
        this.uiManager.showHostControls(this.isHost, gameStartInfo.canStart);

        // Add appropriate message
        if (this.isHost && !wasHost) {
            this.uiManager.addMessage(`You are now the host! You can start the game when all players are ready.`, 'success');
        } else if (!this.isHost && wasHost) {
            this.uiManager.addMessage(`Host privileges transferred to ${data.newHostName}`, 'system');
        } else {
            this.uiManager.addMessage(`${data.newHostName} is now the host`, 'system');
        }

        // Update players display to show new host badge
        this.updatePlayersDisplay();
    }

    handleReadyStatusChange(playerId, isReady) {
        console.log('[WaitingRoom] Player ready status changed:', playerId, isReady);

        const playerIndex = this.players.findIndex(player =>
            player.id === playerId || player.user_id === playerId
        );

        if (playerIndex !== -1) {
            this.players[playerIndex].isReady = isReady;
            const playerName = this.players[playerIndex].username || this.players[playerIndex].name;

            // Update current user's ready state if this is them
            const currentUserId = this.currentUser.user_id || this.currentUser.id;
            if (playerId === currentUserId) {
                this.isReady = isReady;
                this.updateReadyButton();
            }

            this.updatePlayersDisplay();
            this.uiManager.addMessage(`${playerName} is ${isReady ? 'ready' : 'not ready'}`, 'system');
        }
    }

    handleGameStart(data) {
        console.log('[WaitingRoom] Game starting:', data);

        // Display teams information if available
        if (data.teams) {
            const team1Names = data.teams.team1.map(p => p.username).join(', ');
            const team2Names = data.teams.team2.map(p => p.username).join(', ');
            this.uiManager.addMessage(`Teams formed! Team 1: ${team1Names} vs Team 2: ${team2Names}`, 'success');
        }

        // Display game information if available
        if (data.game) {
            this.uiManager.addMessage(`Game ${data.game.gameCode} created! Starting...`, 'success');
        } else {
            this.uiManager.addMessage('Game is starting! Redirecting...', 'success');
        }

        // Use redirect URL from server if provided, otherwise construct it
        const redirectUrl = data?.redirectUrl || `game.html?room=${this.roomId}`;

        // Set loading state
        this.setStartGameLoading(true);

        // Redirect after showing the message
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 2000);
    }

    handleBotsAdded(data) {
        console.log('[WaitingRoom] Bots added to room:', data);

        // Add bots to the players list
        if (data.bots && Array.isArray(data.bots)) {
            if (!this.roomData) {
                this.roomData = { players: [] };
            }
            if (!this.roomData.players) {
                this.roomData.players = [];
            }

            // Add each bot to the players list
            data.bots.forEach(bot => {
                const botPlayer = {
                    id: bot.userId,
                    user_id: bot.userId,
                    username: bot.username,
                    isReady: bot.isReady,
                    isConnected: bot.isConnected,
                    teamAssignment: bot.teamAssignment || null,
                    isBot: true
                };

                // Check if bot already exists (avoid duplicates)
                const existingBotIndex = this.roomData.players.findIndex(p => 
                    p.id === bot.userId || p.user_id === bot.userId
                );

                if (existingBotIndex === -1) {
                    this.roomData.players.push(botPlayer);
                } else {
                    // Update existing bot data
                    this.roomData.players[existingBotIndex] = botPlayer;
                }
            });

            // Update the UI
            this.updateRoomDisplay();

            // Show message about bots joining
            if (data.message) {
                this.uiManager.addMessage(data.message, 'system');
            }
        }
    }

    handleNavigateToGame(data) {
        console.log('[WaitingRoom] Navigation command received:', data);

        // Immediate navigation when server sends explicit command
        const redirectUrl = data?.redirectUrl || `game.html?room=${this.roomId}`;

        this.uiManager.addMessage('Navigating to game...', 'system');

        // Clean up before navigation
        this.cleanup();

        // Navigate immediately
        window.location.href = redirectUrl;
    }
    // Navigation management
    handlePageHidden() {
        console.log('[WaitingRoom] Page hidden - maintaining connection');
        // Socket manager handles connection maintenance automatically
    }

    handlePageVisible() {
        console.log('[WaitingRoom] Page visible - checking connection');
        // Check connection status and attempt reconnection if needed
        if (this.socketManager && !this.socketManager.isReady()) {
            console.log('[WaitingRoom] Connection lost while page was hidden, attempting reconnection');
            this.socketManager.handleReconnection();
        }
    }

    /**
     * Start connection health monitoring
     */
    startConnectionHealthMonitoring() {
        if (this.connectionHealthTimer) {
            clearInterval(this.connectionHealthTimer);
        }

        this.connectionHealthTimer = setInterval(() => {
            this.checkConnectionHealth();
        }, this.connectionHealthInterval);

        console.log('[WaitingRoom] Started connection health monitoring');
    }

    /**
     * Stop connection health monitoring
     */
    stopConnectionHealthMonitoring() {
        if (this.connectionHealthTimer) {
            clearInterval(this.connectionHealthTimer);
            this.connectionHealthTimer = null;
        }
    }

    /**
     * Check connection health and take action if needed
     */
    checkConnectionHealth() {
        if (!this.socketManager) return;

        const health = this.socketManager.checkConnectionHealth();
        const timeSinceLastUpdate = Date.now() - this.lastSuccessfulUpdate;

        console.log('[WaitingRoom] Connection health check:', health);

        // Check for stale connection (no updates for too long)
        if (timeSinceLastUpdate > 120000) { // 2 minutes
            console.warn('[WaitingRoom] No successful updates for', timeSinceLastUpdate, 'ms');

            this.uiManager.showConnectionWarning(
                'warning',
                'Connection may be stale - checking...',
                { autoHide: true, duration: 10000 }
            );

            // Try to refresh connection
            if (health.isConnected) {
                this.socketManager.checkConnectionHealth();
            }
        }

        // Check for excessive reconnection attempts
        if (health.reconnectAttempts >= 3) {
            this.uiManager.showConnectionWarning(
                'error',
                'Connection unstable - consider refreshing',
                { autoHide: false }
            );
        }
    }

    /**
     * Mark successful update received
     */
    markSuccessfulUpdate() {
        this.lastSuccessfulUpdate = Date.now();
    }

    // Cleanup methods for proper resource management
    async cleanup() {
        console.log('[WaitingRoom] Cleaning up resources...');

        try {
            // Stop connection health monitoring
            this.stopConnectionHealthMonitoring();

            // Cleanup socket connections
            if (this.socketManager) {
                this.socketManager.disconnect();
                this.socketManager = null;
            }

            // Cleanup UI manager
            if (this.uiManager) {
                this.uiManager.cleanup();
            }

            // Clear any timers or intervals
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            // Remove event listeners
            this.removeEventListeners();

            console.log('[WaitingRoom] Cleanup completed');

        } catch (error) {
            console.error('[WaitingRoom] Error during cleanup:', error);
        }
    }

    removeEventListeners() {
        // Remove window event listeners to prevent memory leaks
        window.removeEventListener('beforeunload', this.cleanup);
        document.removeEventListener('visibilitychange', this.handlePageHidden);
        document.removeEventListener('visibilitychange', this.handlePageVisible);
    }

    // UI Helper Methods
    showLoading(show, message = 'Loading...') {
        if (show) {
            this.uiManager.showLoading(message);
        } else {
            this.uiManager.hideLoading();
        }
    }

    setStartGameLoading(loading) {
        if (loading) {
            this.uiManager.showStartGameLoading();
        } else {
            this.uiManager.hideStartGameLoading();
        }
    }

    showError(message) {
        this.uiManager.displayError(message);
    }

    hideErrorModal() {
        this.uiManager.hideError();
    }

    showMessage(message) {
        this.uiManager.addMessage(message, 'system');
    }
}

// Initialize waiting room when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const manager = new WaitingRoomManager();

    // Expose for debugging
    window.waitingRoomManager = manager;

    console.log('[WaitingRoom] Manager initialized and exposed globally');
});