/**
 * Waiting Room Manager
 * Handles waiting room initialization, state management, and player coordination
 */

import { AuthManager } from '../core/auth.js';
import { WaitingRoomSocketManager } from '../core/WaitingRoomSocketManager.js';
import { WaitingRoomUI } from '../ui/WaitingRoomUI.js';
import { getErrorHandler } from '../core/ErrorHandler.js';

class WaitingRoomManager {
    constructor() {
        this.authManager = new AuthManager();
        this.socketManager = null;
        this.uiManager = new WaitingRoomUI();
        this.errorHandler = getErrorHandler(this.authManager);

        this.elements = {};
        this.currentUser = null;
        this.roomId = null;
        this.roomData = null;
        this.isHost = false;
        this.isReady = false;
        this.players = [];
        this.teams = { A: [], B: [] };
        this.bots = [];

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

        // Ready controls (now in host section)
        this.elements.readyCount = document.getElementById('ready-count');

        // Host controls
        this.elements.hostControls = document.getElementById('host-controls');
        this.elements.startGameBtn = document.getElementById('start-game-btn');
        this.elements.startSpinner = document.getElementById('start-spinner');
        this.elements.resetToWaitingBtn = document.getElementById('reset-to-waiting-btn');
        this.elements.resetSpinner = document.getElementById('reset-spinner');

        // Messages and modals
        this.elements.gameMessages = document.getElementById('game-messages');
        this.elements.loadingOverlay = document.getElementById('loading-overlay');
        this.elements.errorModal = document.getElementById('error-modal');
        this.elements.errorMessage = document.getElementById('error-message');
        this.elements.closeErrorBtn = document.getElementById('close-error-btn');
        this.elements.errorOkBtn = document.getElementById('error-ok-btn');
    }
    setupEventListeners() {
        // Leave room button with fallback
        this.elements.leaveRoomBtn.addEventListener('click', () => this.handleLeaveRoom());

        // Double-click fallback - force redirect to dashboard
        this.elements.leaveRoomBtn.addEventListener('dblclick', () => {
            console.log('[WaitingRoom] Force leaving room via double-click');
            this.cleanup().then(() => {
                window.location.href = 'dashboard.html';
            });
        });

        // Copy room code button
        this.elements.copyCodeBtn.addEventListener('click', () => this.handleCopyRoomCode());

        // Set up UI callbacks for new functionality
        this.uiManager.setReadyToggleCallback((slotNumber) => this.handleReadyToggle(slotNumber));
        this.uiManager.setTeamAssignmentCallback((playerId, team, slotId) => this.handleTeamAssignment(playerId, team, slotId));
        this.uiManager.setAddBotsCallback(() => this.handleAddBots());

        // Start game button (host only)
        this.elements.startGameBtn.addEventListener('click', () => this.handleStartGame());

        // Reset to waiting button (host only)
        this.elements.resetToWaitingBtn.addEventListener('click', () => this.handleResetToWaiting());

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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Escape key - force leave room
            if (e.key === 'Escape') {
                console.log('[WaitingRoom] Escape key pressed - leaving room');
                this.handleLeaveRoom();
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
                this.errorHandler?.handleAuthError('User not authenticated');
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

            // If room not found, redirect to dashboard
            if (error.message.includes('Room not found') || error.message.includes('deleted')) {
                this.showError('Room not found. Redirecting to dashboard...');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 2000);
            } else {
                this.showError('Failed to initialize waiting room. Please try again.');
            }
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

            const roomResponse = await response.json();
            this.roomData = roomResponse.room || roomResponse;
            console.log('[WaitingRoom] Room data loaded:', this.roomData);

            // Check if user is in the room, if not try to join
            const currentUserId = this.currentUser.user_id || this.currentUser.id;
            const isUserInRoom = this.roomData.players && this.roomData.players.some(p =>
                (p.id === currentUserId || p.user_id === currentUserId)
            );

            if (!isUserInRoom) {
                console.log('[WaitingRoom] User not in room, attempting to join...');
                try {
                    const joinResponse = await fetch(`/api/rooms/${this.roomId}/join`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (joinResponse.ok) {
                        const joinData = await joinResponse.json();
                        this.roomData = joinData.room || this.roomData;
                        console.log('[WaitingRoom] Successfully joined room on refresh');
                    } else {
                        console.warn('[WaitingRoom] Failed to join room on refresh, continuing with current data');
                    }
                } catch (joinError) {
                    console.warn('[WaitingRoom] Error joining room on refresh:', joinError);
                }
            }

            // Update UI with room data
            this.updateRoomDisplay();

            // Check if current user is the host
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
                this.uiManager.showHostControls(true, false, this.roomData?.status || 'waiting');
            } else {
                console.log('[WaitingRoom] User is not host, host controls will remain hidden');
                this.uiManager.showHostControls(false, false, this.roomData?.status || 'waiting');
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
            this.uiManager.showConnectionToast('reconnecting');
        });

        this.socketManager.on('reconnected', (data) => {
            this.uiManager.showConnectionToast('connected');
            this.uiManager.hideConnectionWarning();
        });

        this.socketManager.on('reconnect-failed', (data) => {
            this.handleReconnectFailed(data);
        });

        this.socketManager.on('connection-lost', () => {
            this.uiManager.showConnectionToast('disconnected');
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
            this.uiManager.showToast('Using backup connection mode', 'system', { compact: true });
            this.uiManager.showConnectionWarning('info', 'Using backup mode - some features may be limited');
        });

        this.socketManager.on('http-polling-stopped', () => {
            this.uiManager.showToast('Real-time connection restored', 'success', { compact: true });
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

            // Handle different types of room updates
            if (data.type === 'bots-added' || data.type === 'bots-removed') {
                console.log(`[WaitingRoom] Handling ${data.type} update`);

                // Update players from the broadcast
                if (data.players) {
                    this.players = data.players;
                    this.updatePlayersDisplay();
                }

                // Show message
                if (data.message) {
                    this.uiManager.showToast(data.message, 'info', { compact: true });
                }

                this.markSuccessfulUpdate();
            } else if (data.room) {
                // Handle regular room updates
                this.roomData = data.room;
                this.updateRoomDisplay();
                this.markSuccessfulUpdate();
            }
        });

        this.socketManager.on('room-status-changed', (data) => {
            console.log('[WaitingRoom] Room status changed:', data);
            if (data.status) {
                // Update room data with new status
                if (this.roomData) {
                    this.roomData.status = data.status;
                }
                // Refresh the UI to show/hide buttons based on new status
                this.updateRoomDisplay();
                this.markSuccessfulUpdate();

                // Show a message to users
                if (data.message) {
                    this.uiManager.showToast(data.message, 'success', { compact: true });
                }
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
                this.uiManager.showToast(`${playerName} disconnected`, 'warning', { icon: '⚠️', compact: true });
            }
        });

        // Game events
        this.socketManager.on('game-starting', (data) => {
            this.handleGameStart(data);
        });

        this.socketManager.on('teams-formed', (data) => {
            console.log('[WaitingRoom] Teams formed:', data);
            this.uiManager.showGameStartingToast();
        });

        this.socketManager.on('bots-added', (data) => {
            console.log('[WaitingRoom] Bots added:', data);
            this.handleBotsAdded(data);
        });

        // Bot broadcasts are now handled through room-updated events

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

            // Ready button error handling is now handled per-slot
        });

        this.socketManager.on('ready-status-confirmed', (data) => {
            console.log('[WaitingRoom] Ready status confirmed:', data);

            // Ready button success handling is now handled per-slot

            // Show success message if database sync failed but WebSocket succeeded
            if (!data.dbSynced) {
                this.uiManager.showToast('Ready status updated (WebSocket only)', 'warning', { compact: true });
            }
        });

        this.socketManager.on('game-start-error', (error) => {
            console.error('[WaitingRoom] Game start error:', error);
            this.showError(error.message || 'Failed to start game');
            this.setStartGameLoading(false);
        });

        this.socketManager.on('auth_error', (error) => {
            console.error('[WaitingRoom] Authentication error:', error);
            this.errorHandler?.handleAuthError(error);
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
            this.uiManager.showToast('Retrying connection...', 'info', { compact: true });

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
            this.uiManager.showToast('Enabled backup connection mode', 'system', { compact: true });
        }
    }

    setInteractiveElementsEnabled(enabled) {
        // Disable/enable buttons that require real-time connection
        const startButton = this.elements.startGameBtn;

        // Disable ready buttons in player slots
        const readyButtons = document.querySelectorAll('.ready-btn');
        readyButtons.forEach(btn => {
            btn.disabled = !enabled;
            if (!enabled) {
                btn.title = 'Connection required for ready status';
            } else {
                btn.title = '';
            }
        });

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

        // Update room code display - use the 5-digit room code if available
        const displayCode = this.roomData.roomCode || this.roomData.code || this.roomData.inviteCode || this.roomData.id || this.roomId;
        this.uiManager.setRoomCode(displayCode);

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
        const currentUserId = this.currentUser?.user_id || this.currentUser?.id;
        this.uiManager.updatePlayerSlots(playersWithHostInfo, currentUserId);

        // Calculate ready count based on connected players
        const connectedPlayers = this.players.filter(player => player.isConnected !== false);
        const readyPlayers = connectedPlayers.filter(player => player.isReady);
        const humanPlayers = connectedPlayers.filter(player => !player.isBot);
        const readyCount = readyPlayers.length;

        // Update ready status display with more detailed information
        this.uiManager.updateReadyStatus(readyCount, connectedPlayers.length, humanPlayers.length);

        // Update team display
        this.updateTeamAssignments();

        // Update bot count
        const botCount = this.players.filter(player => player.isBot).length;
        this.uiManager.updateBotCount(botCount);

        // Check if current user is in the players list and update ready button
        // currentUserId already declared above
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

            console.log('[WaitingRoom] Current player found:', {
                isReady: this.isReady,
                isConnected: currentPlayer.isConnected,
                roomStatus: this.roomData?.status
            });
        } else {
            console.warn('[WaitingRoom] Current player not found in players list');
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
            this.uiManager.showHostControls(true, canStartGame, this.roomData?.status || 'waiting');

            // Host info is now handled in the UI components
        } else {
            console.log('[WaitingRoom] Not host, hiding host controls');
            this.uiManager.showHostControls(false, false, this.roomData?.status || 'waiting');
        }
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
                        this.uiManager.showToast('Successfully left the room', 'success', { compact: true });
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

                // If room not found or already deleted, redirect anyway
                if (error.message.includes('Room not found') || error.message.includes('404')) {
                    console.log('[WaitingRoom] Room not found during leave, redirecting to dashboard');
                    this.uiManager.showToast('Room no longer exists', 'info', { compact: true });
                    setTimeout(async () => {
                        await this.cleanup();
                        window.location.href = 'dashboard.html';
                    }, 1000);
                } else {
                    this.showError('Failed to leave room. Redirecting to dashboard...');
                    setTimeout(async () => {
                        await this.cleanup();
                        window.location.href = 'dashboard.html';
                    }, 2000);
                }
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
                // If room not found (404), it means room was already deleted - this is OK
                if (response.status === 404) {
                    console.log('[WaitingRoom] Room already deleted, proceeding with redirect');
                    this.uiManager.showToast('Room no longer exists', 'info', { compact: true });
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to leave room');
                }
            } else {
                const result = await response.json();
                console.log('[WaitingRoom] Left room via HTTP API:', result);
                this.uiManager.showToast('Successfully left the room', 'success', { compact: true });
            }

            // Clean up and redirect regardless of API response
            setTimeout(async () => {
                await this.cleanup();
                window.location.href = 'dashboard.html';
            }, 1000);

        } catch (error) {
            console.error('[WaitingRoom] HTTP API leave failed:', error);

            // If it's a network error or room not found, still redirect to dashboard
            if (error.message.includes('Room not found') || error.message.includes('404')) {
                console.log('[WaitingRoom] Room not found, redirecting to dashboard anyway');
                this.uiManager.showToast('Room no longer exists', 'info', { compact: true });
                setTimeout(async () => {
                    await this.cleanup();
                    window.location.href = 'dashboard.html';
                }, 1000);
            } else {
                throw error;
            }
        }
    }

    async handleCopyRoomCode() {
        // Delegate to UI manager which handles the copy functionality
        await this.uiManager.copyRoomCode();
    }

    async handleReadyToggle(slotNumber) {
        try {
            console.log('[WaitingRoom] Ready toggle requested for slot:', slotNumber);

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

            // Update the ready button state immediately for better UX
            const readyBtn = document.querySelector(`[data-slot="${slotNumber}"] .ready-btn`);
            if (readyBtn) {
                readyBtn.disabled = true; // Disable during request
                readyBtn.classList.toggle('ready', newReadyStatus);
                const btnText = readyBtn.querySelector('.ready-btn-text');
                if (btnText) {
                    btnText.textContent = newReadyStatus ? 'Ready' : 'Ready';
                }
            }

            // Use socket manager if available
            if (this.socketManager && this.socketManager.isReady()) {
                this.socketManager.toggleReady(newReadyStatus);
                console.log('[WaitingRoom] Ready status toggle sent via socket:', newReadyStatus);

                // Re-enable button after a short delay
                setTimeout(() => {
                    if (readyBtn) readyBtn.disabled = false;
                }, 500);
            } else {
                // Fallback to HTTP API if socket not available
                console.warn('[WaitingRoom] Socket not available, using HTTP fallback');
                await this.toggleReadyStatusViaAPI(newReadyStatus);

                // Re-enable button
                if (readyBtn) readyBtn.disabled = false;
            }

        } catch (error) {
            console.error('[WaitingRoom] Error toggling ready status:', error);
            this.showError('Failed to update ready status. Please try again.');

            // Re-enable button and revert state on error
            const readyBtn = document.querySelector(`[data-slot="${slotNumber}"] .ready-btn`);
            if (readyBtn) {
                readyBtn.disabled = false;
                readyBtn.classList.toggle('ready', this.isReady); // Revert to original state
                const btnText = readyBtn.querySelector('.ready-btn-text');
                if (btnText) {
                    btnText.textContent = this.isReady ? 'Ready' : 'Ready';
                }
            }
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

            // Update the current user's ready status in the players array
            const currentUserId = this.currentUser.user_id || this.currentUser.id;
            const playerIndex = this.players.findIndex(player =>
                player.id === currentUserId || player.user_id === currentUserId
            );

            if (playerIndex !== -1) {
                this.players[playerIndex].isReady = this.isReady;
                this.updatePlayersDisplay();
            }

            // User feedback will be shown when the socket event is received (if connected)
            // For HTTP-only mode, show feedback directly
            if (!this.socketManager || !this.socketManager.isReady()) {
                this.uiManager.showPlayerReadyToast(this.currentUser.username, newReadyStatus);
            }

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
            this.uiManager.showHostControls(true, false, this.roomData?.status || 'waiting');

            console.log(`[WaitingRoom] Starting game with ${connectedPlayers.length} connected players, ${readyPlayers.length} ready`);

            // Use socket manager if available
            if (this.socketManager && this.socketManager.isReady()) {
                this.socketManager.startGame();
                console.log('[WaitingRoom] Game start request sent via socket');

                // Add user feedback
                this.uiManager.showGameStartingToast();
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
            this.uiManager.showHostControls(this.isHost, canStart, this.roomData?.status || 'waiting');
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
                this.uiManager.showToast(`Teams formed! Team 1: ${team1Names} vs Team 2: ${team2Names}`, 'success');
            }

            // Display game information if available
            if (result.game) {
                this.uiManager.showToast(`Game ${result.game.code} created! Starting...`, 'success');
            } else {
                this.uiManager.showGameStartingToast();
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

    /**
     * Handle reset to waiting room button click
     */
    async handleResetToWaiting() {
        try {
            // Validate host privileges
            if (!this.isHost) {
                this.showError('Only the host can reset the room to waiting status.');
                return;
            }

            // Validate room status - only allow reset if room is in 'playing' status
            if (this.roomData && this.roomData.status !== 'playing') {
                this.showError('Room is already in waiting status.');
                return;
            }

            // Show loading state
            this.setResetToWaitingLoading(true);

            console.log('[WaitingRoom] Resetting room to waiting status');

            // Make API call to reset room status
            const token = this.authManager.getToken();
            const response = await fetch(`/api/rooms/${this.roomId}/reset-to-waiting`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to reset room to waiting status');
            }

            const result = await response.json();
            console.log('[WaitingRoom] Room reset to waiting status successfully:', result);

            // Update local room data
            if (result.room) {
                this.roomData = result.room;
                this.updateRoomDisplay();
            }

            // Show success message
            this.uiManager.showToast('Room has been reset to waiting status. Players can now get ready for another game!', 'success');

        } catch (error) {
            console.error('[WaitingRoom] Error resetting room to waiting:', error);
            this.showError('Failed to reset room to waiting status. Please try again.');
        } finally {
            // Hide loading state
            this.setResetToWaitingLoading(false);
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
        this.uiManager.showPlayerJoinedToast(mappedPlayerData.username);
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
            this.uiManager.showHostControls(this.isHost, gameStartInfo, this.roomData?.status || 'waiting');

            // Add appropriate message
            if (data.wasHost) {
                if (this.isHost) {
                    this.uiManager.showToast(`${playerName} (host) left. You are now the host!`, 'success', { icon: '👑' });
                } else {
                    const newHost = this.players.find(p =>
                        (p.id === data.newHostId || p.user_id === data.newHostId)
                    );
                    const newHostName = newHost ? newHost.username : 'Unknown';
                    this.uiManager.showHostTransferToast(newHostName);
                }
            } else {
                this.uiManager.showPlayerLeftToast(playerName);
            }
        } else {
            // Fallback case - only show if we haven't already shown a message above
            if (!data.wasHost) {
                this.uiManager.showPlayerLeftToast(playerName);
            }
        }

        // Update display with new player count and ready status
        this.updatePlayersDisplay();

        // Update host info if current user is host
        if (this.isHost) {
            const gameStartInfo = this.calculateGameStartEligibility();
            // Host info text is now handled in the UI
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
        this.uiManager.showHostControls(this.isHost, gameStartInfo, this.roomData?.status || 'waiting');

        // Add appropriate message
        if (this.isHost && !wasHost) {
            this.uiManager.showToast(`You are now the host! You can start the game when all players are ready.`, 'success', { icon: '👑' });
        } else {
            this.uiManager.showHostTransferToast(data.newHostName);
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
            }

            this.updatePlayersDisplay();
            this.uiManager.showPlayerReadyToast(playerName, isReady);
        }
    }

    handleGameStart(data) {
        console.log('[WaitingRoom] Game starting:', data);

        // Display teams information if available
        if (data.teams) {
            const team1Names = data.teams.team1.map(p => p.username).join(', ');
            const team2Names = data.teams.team2.map(p => p.username).join(', ');
            this.uiManager.showToast(`Teams formed! Team 1: ${team1Names} vs Team 2: ${team2Names}`, 'success');
        }

        // Display game information if available
        if (data.game) {
            this.uiManager.showToast(`Game ${data.game.gameCode} created! Starting...`, 'success');
        } else {
            this.uiManager.showGameStartingToast();
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
                this.uiManager.showToast(data.message, 'info', { compact: true });
            }
        }
    }



    handleNavigateToGame(data) {
        console.log('[WaitingRoom] Navigation command received:', data);

        // Immediate navigation when server sends explicit command
        const redirectUrl = data?.redirectUrl || `game.html?room=${this.roomId}`;

        this.uiManager.showToast('Navigating to game...', 'info', { compact: true });

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

    setResetToWaitingLoading(loading) {
        if (loading) {
            this.elements.resetToWaitingBtn.disabled = true;
            this.elements.resetSpinner.classList.remove('hidden');
        } else {
            this.elements.resetToWaitingBtn.disabled = false;
            this.elements.resetSpinner.classList.add('hidden');
        }
    }

    showError(message) {
        this.uiManager.displayError(message);
    }

    hideErrorModal() {
        this.uiManager.hideError();
    }

    showMessage(message) {
        this.uiManager.showToast(message, 'system', { compact: true });
    }

    // Team Management Methods

    /**
     * Handle team assignment for a player
     * @param {string} playerId - Player ID
     * @param {string} team - Team (A or B)
     * @param {string} slotId - Team slot ID
     */
    handleTeamAssignment(playerId, team, slotId) {
        console.log('[WaitingRoom] Team assignment:', { playerId, team, slotId });

        // Find the player
        const player = this.players.find(p => (p.id === playerId || p.user_id === playerId));
        if (!player) {
            console.warn('[WaitingRoom] Player not found for team assignment:', playerId);
            return;
        }

        // Update player's team assignment
        player.teamAssignment = team;

        // Update local teams data
        this.updateTeamAssignments();

        // Send team assignment to server if socket is available
        if (this.socketManager) {
            this.socketManager.emit('assign-team', {
                playerId: playerId,
                team: team,
                slotId: slotId
            });
        }

        this.uiManager.showToast(`${player.username} assigned to Team ${team}`, 'success', { compact: true });
    }

    /**
     * Handle adding/removing bots
     */
    handleAddBots() {
        const currentBots = this.players.filter(player => player.isBot);
        const humanPlayers = this.players.filter(player => !player.isBot);
        const emptySlots = 4 - this.players.length;

        if (currentBots.length > 0) {
            // Remove bots
            this.removeBots();
        } else {
            // Add bots to fill empty slots
            this.addBots(emptySlots);
        }
    }

    /**
     * Add bots to fill empty slots
     * @param {number} count - Number of bots to add
     */
    addBots(count) {
        if (count <= 0) return;

        console.log('[WaitingRoom] Adding', count, 'bots');

        // Show immediate feedback
        this.uiManager.showToast(`Adding ${count} bot${count > 1 ? 's' : ''}...`, 'system', { compact: true });

        // Only the host should add bots and broadcast
        if (this.isHost) {
            // Add bots locally for immediate feedback
            this.addBotsLocally(count);

            // Broadcast to other clients in the room
            if (this.socketManager && this.socketManager.isReady()) {
                console.log('[WaitingRoom] Socket manager ready, broadcasting bot addition to other clients');
                console.log('[WaitingRoom] Socket manager state:', {
                    isReady: this.socketManager.isReady(),
                    isConnected: this.socketManager.isConnected,
                    isJoined: this.socketManager.isJoined
                });

                // Create bot data to send to other clients (server will create proper bots)
                const botData = [];
                const botNames = ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta'];
                
                for (let i = 0; i < count; i++) {
                    const botId = `bot_${Date.now()}_${i}`;
                    botData.push({
                        userId: botId,
                        username: botNames[i] || `Bot ${i + 1}`,
                        isReady: true,
                        isConnected: true,
                        teamAssignment: null,
                        isBot: true
                    });
                }

                const eventData = {
                    roomId: this.roomId,
                    type: 'bots-added',
                    bots: botData,
                    players: this.players, // Send updated player list
                    message: `Host added ${count} bot${count > 1 ? 's' : ''}`
                };
                
                console.log('[WaitingRoom] Emitting room-update event:', eventData);

                // Send room update to broadcast bot addition
                this.socketManager.emit('room-update', eventData);
                
                console.log('[WaitingRoom] room-update event emitted successfully');
            }
        } else {
            // Non-host users shouldn't be able to add bots
            this.uiManager.showToast('Only the host can add bots', 'warning', { compact: true });
        }
    }

    /**
     * Add bots locally (fallback method)
     * @param {number} count - Number of bots to add
     */
    addBotsLocally(count) {
        console.log('[WaitingRoom] Adding bots locally:', count);

        const botNames = ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta'];
        
        for (let i = 0; i < count; i++) {
            const botId = `bot_${Date.now()}_${i}`;
            const bot = {
                id: botId,
                user_id: botId,
                username: botNames[i] || `Bot ${i + 1}`,
                isBot: true,
                isReady: true,
                isConnected: true,
                teamAssignment: null
            };
            this.players.push(bot);
        }

        this.updatePlayersDisplay();
        this.uiManager.showToast(`Added ${count} bot${count > 1 ? 's' : ''} locally`, 'success', { compact: true });
    }

    /**
     * Remove all bots
     */
    removeBots() {
        const botCount = this.players.filter(player => player.isBot).length;

        if (botCount === 0) {
            this.uiManager.showToast('No bots to remove', 'info', { compact: true });
            return;
        }

        console.log('[WaitingRoom] Removing', botCount, 'bots');

        // Show immediate feedback for bot removal
        this.uiManager.showToast(`Removing ${botCount} bot${botCount > 1 ? 's' : ''}...`, 'system', { compact: true });

        // Only the host should remove bots and broadcast
        if (this.isHost) {
            // Remove bots locally for immediate feedback
            this.removeBotsLocally();

            // Broadcast to other clients in the room
            if (this.socketManager && this.socketManager.isReady()) {
                console.log('[WaitingRoom] Broadcasting bot removal to other clients');

                // Send room update to broadcast bot removal
                this.socketManager.emit('room-update', {
                    roomId: this.roomId,
                    type: 'bots-removed',
                    players: this.players, // Send updated player list
                    message: `Host removed ${botCount} bot${botCount > 1 ? 's' : ''}`
                });
            }
        } else {
            // Non-host users shouldn't be able to remove bots
            this.uiManager.showToast('Only the host can remove bots', 'warning', { compact: true });
        }
    }

    /**
     * Remove bots locally (fallback method)
     */
    removeBotsLocally() {
        const botCount = this.players.filter(player => player.isBot).length;
        console.log('[WaitingRoom] Removing bots locally:', botCount);

        this.players = this.players.filter(player => !player.isBot);
        this.updatePlayersDisplay();
        this.uiManager.showToast(`Removed ${botCount} bot${botCount > 1 ? 's' : ''} locally`, 'success', { compact: true });
    }

    /**
     * Update team assignments based on current players
     */
    updateTeamAssignments() {
        const teams = { A: [], B: [] };

        // Separate humans and bots for better team assignment
        const humanPlayers = this.players.filter(player => !player.isBot);
        const botPlayers = this.players.filter(player => player.isBot);

        // Auto-assign players to teams if not already assigned
        this.players.forEach((player, index) => {
            if (!player.teamAssignment) {
                if (player.isBot) {
                    // Assign bots to fill empty slots, balancing teams
                    player.teamAssignment = teams.A.length <= teams.B.length ? 'A' : 'B';
                } else {
                    // For humans: alternate between teams to ensure they're on different teams
                    const humanIndex = humanPlayers.indexOf(player);
                    player.teamAssignment = humanIndex % 2 === 0 ? 'A' : 'B';
                }
            }

            // Add player to appropriate team if there's space
            if (player.teamAssignment === 'A' && teams.A.length < 2) {
                teams.A.push(player);
            } else if (player.teamAssignment === 'B' && teams.B.length < 2) {
                teams.B.push(player);
            } else if (teams.A.length < 2) {
                // If preferred team is full, try the other team
                player.teamAssignment = 'A';
                teams.A.push(player);
            } else if (teams.B.length < 2) {
                player.teamAssignment = 'B';
                teams.B.push(player);
            }
        });

        this.teams = teams;
        this.uiManager.updateTeamDisplay(teams);
    }

    /**
     * Calculate if game can start with current setup
     */
    calculateGameStartEligibility() {
        const humanPlayers = this.players.filter(player => !player.isBot);
        const readyPlayers = this.players.filter(player => player.isReady);
        const totalPlayers = this.players.length;

        // Need at least 2 human players and all players ready
        const hasMinimumHumans = humanPlayers.length >= 2;
        const allPlayersReady = totalPlayers >= 2 && readyPlayers.length === totalPlayers;
        const roomIsWaiting = !this.roomData || this.roomData.status === 'waiting';

        return hasMinimumHumans && allPlayersReady && roomIsWaiting;
    }
}

// Initialize waiting room when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const manager = new WaitingRoomManager();

    // Expose for debugging
    window.waitingRoomManager = manager;

    console.log('[WaitingRoom] Manager initialized and exposed globally');
});