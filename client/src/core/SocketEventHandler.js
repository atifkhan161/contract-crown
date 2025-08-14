/**
 * SocketEventHandler - Handles all WebSocket event listeners and responses
 */
export class SocketEventHandler {
    constructor(waitingRoomManager) {
        this.manager = waitingRoomManager;
    }

    setupEventListeners(socketManager) {
        // Connection status events
        socketManager.on('connection-status-changed', (data) => {
            this.manager.updateConnectionStatus(data.status, data);
        });

        socketManager.on('reconnecting', (data) => {
            this.manager.updateConnectionStatus('reconnecting', data);
            this.manager.uiManager.showConnectionToast('reconnecting');
        });

        socketManager.on('reconnected', (data) => {
            this.manager.uiManager.showConnectionToast('connected');
            this.manager.uiManager.hideConnectionWarning();
        });

        socketManager.on('reconnect-failed', (data) => {
            this.manager.handleReconnectFailed(data);
        });

        socketManager.on('connection-lost', () => {
            this.manager.uiManager.showConnectionToast('disconnected');
            this.manager.uiManager.showConnectionWarning('warning', 'Connection lost - trying to reconnect...');
        });

        socketManager.on('connection-warning', (data) => {
            this.manager.handleConnectionWarning(data);
        });

        // HTTP polling fallback events
        socketManager.on('http-polling-started', (data) => {
            this.manager.uiManager.showToast('Using backup connection mode', 'system', { compact: true });
            this.manager.uiManager.showConnectionWarning('info', 'Using backup mode - some features may be limited');
        });

        socketManager.on('http-polling-stopped', () => {
            this.manager.uiManager.showToast('Real-time connection restored', 'success', { compact: true });
            this.manager.uiManager.hideConnectionWarning();
        });

        // Room events
        socketManager.on('room-joined', (data) => {
            this.handleRoomJoined(data);
        });

        socketManager.on('room-updated', (data) => {
            this.handleRoomUpdated(data);
        });

        socketManager.on('room-status-changed', (data) => {
            this.handleRoomStatusChanged(data);
        });

        // Player events
        socketManager.on('player-joined', (data) => {
            this.manager.handlePlayerJoin(data.player || data);
            this.manager.markSuccessfulUpdate();
        });

        socketManager.on('player-left', (data) => {
            this.manager.handlePlayerLeave(data);
            this.manager.markSuccessfulUpdate();
        });

        socketManager.on('host-transferred', (data) => {
            this.manager.handleHostTransfer(data);
            this.manager.markSuccessfulUpdate();
        });

        socketManager.on('player-ready-changed', (data) => {
            this.manager.handleReadyStatusChange(data.playerId || data.userId, data.isReady);
            this.manager.markSuccessfulUpdate();
        });

        // Game events
        socketManager.on('game-starting', (data) => {
            this.manager.handleGameStart(data);
        });

        socketManager.on('navigate-to-game', (data) => {
            this.manager.handleNavigateToGame(data);
        });

        // Error events
        socketManager.on('waiting-room-error', (error) => {
            console.error('[SocketEventHandler] Waiting room error:', error);
            this.manager.showError(error.message || 'An error occurred in the waiting room');
        });

        socketManager.on('auth_error', (error) => {
            console.error('[SocketEventHandler] Authentication error:', error);
            this.manager.errorHandler?.handleAuthError(error);
        });
    }

    handleRoomJoined(data) {
        console.log('[SocketEventHandler] Successfully joined room via socket:', data);

        if (data.players) {
            const mappedPlayers = data.players.map(player => ({
                id: player.userId,
                user_id: player.userId,
                username: player.username,
                isReady: player.isReady,
                teamAssignment: player.teamAssignment,
                isConnected: player.isConnected !== false
            }));

            if (!this.manager.roomData) {
                this.manager.roomData = {};
            }
            this.manager.roomData.players = mappedPlayers;
            this.manager.roomData.status = data.roomStatus || 'waiting';
            this.manager.roomData.owner = data.hostId;

            this.manager.updateRoomDisplay();
        }
    }

    handleRoomUpdated(data) {
        console.log('[SocketEventHandler] Room updated:', data);

        if (data.type === 'bots-added' || data.type === 'bots-removed') {
            if (data.players) {
                this.manager.players = data.players;
                this.manager.updatePlayersDisplay();
            }

            if (data.message) {
                this.manager.uiManager.showToast(data.message, 'info', { compact: true });
            }

            this.manager.markSuccessfulUpdate();
        } else if (data.room) {
            this.manager.roomData = data.room;
            this.manager.updateRoomDisplay();
            this.manager.markSuccessfulUpdate();
        }
    }

    handleRoomStatusChanged(data) {
        console.log('[SocketEventHandler] Room status changed:', data);
        if (data.status) {
            if (this.manager.roomData) {
                this.manager.roomData.status = data.status;
            }
            this.manager.updateRoomDisplay();
            this.manager.markSuccessfulUpdate();

            if (data.message) {
                this.manager.uiManager.showToast(data.message, 'success', { compact: true });
            }
        }
    }
}