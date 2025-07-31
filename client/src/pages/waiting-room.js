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
            this.isHost = this.roomData.owner === (this.currentUser.user_id || this.currentUser.id);
            console.log('[WaitingRoom] Is host:', this.isHost);

            // Show host controls if user is host
            if (this.isHost) {
                this.uiManager.showHostControls(true, false);
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
            this.updateConnectionStatus(data.status);
        });

        this.socketManager.on('reconnecting', (data) => {
            this.updateConnectionStatus('reconnecting');
            this.uiManager.addMessage(`Reconnecting... (attempt ${data.attempt}/${data.maxAttempts})`, 'system');
        });

        this.socketManager.on('reconnected', () => {
            this.uiManager.addMessage('Reconnected successfully!', 'success');
        });

        this.socketManager.on('reconnect-failed', () => {
            this.showError('Failed to reconnect. Please refresh the page.');
        });

        this.socketManager.on('connection-lost', () => {
            this.uiManager.addMessage('Connection lost. Attempting to reconnect...', 'error');
        });

        // Room events
        this.socketManager.on('room-joined', (data) => {
            console.log('[WaitingRoom] Successfully joined room via socket:', data);
            if (data.room) {
                this.roomData = data.room;
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
            }
        });

        // Player events
        this.socketManager.on('player-joined', (data) => {
            this.handlePlayerJoin(data.player || data);
        });

        this.socketManager.on('player-left', (data) => {
            this.handlePlayerLeave(data.playerId || data.userId);
        });

        this.socketManager.on('player-ready-changed', (data) => {
            this.handleReadyStatusChange(data.playerId || data.userId, data.isReady);
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

        // Error events
        this.socketManager.on('waiting-room-error', (error) => {
            console.error('[WaitingRoom] Waiting room error:', error);
            this.showError(error.message || 'An error occurred in the waiting room');
        });

        this.socketManager.on('ready-toggle-error', (error) => {
            console.error('[WaitingRoom] Ready toggle error:', error);
            this.showError(error.message || 'Failed to update ready status');
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

    updateConnectionStatus(status) {
        this.uiManager.updateConnectionStatus(status);
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

        // Update ready count
        const readyCount = this.players.filter(player => player.isReady).length;
        this.uiManager.updateReadyStatus(readyCount, this.players.length);

        // Check if current user is in the players list and update ready button
        const currentUserId = this.currentUser.user_id || this.currentUser.id;
        const currentPlayer = this.players.find(player =>
            player.id === currentUserId || player.user_id === currentUserId
        );

        if (currentPlayer) {
            this.isReady = currentPlayer.isReady || false;
            this.updateReadyButton();
        }

        // Update start game button state for host
        if (this.isHost) {
            const canStartGame = this.players.length === 4 && readyCount === 4;
            this.uiManager.showHostControls(true, canStartGame);
        }
    }

    updateReadyButton() {
        this.uiManager.updateReadyButton(this.isReady, true);
    }

    // Event Handlers
    async handleLeaveRoom() {
        if (confirm('Are you sure you want to leave the room?')) {
            try {
                this.showLoading(true, 'Leaving room...');

                // Leave room via socket if connected
                if (this.socketManager && this.socketManager.isReady()) {
                    this.socketManager.leaveRoom();
                }

                // Clean up and redirect
                await this.cleanup();
                window.location.href = 'dashboard.html';

            } catch (error) {
                console.error('[WaitingRoom] Error leaving room:', error);
                this.showError('Failed to leave room. Please try again.');
                this.showLoading(false);
            }
        }
    }

    async handleCopyRoomCode() {
        // Delegate to UI manager which handles the copy functionality
        await this.uiManager.copyRoomCode();
    }

    async handleReadyToggle() {
        try {
            const newReadyStatus = !this.isReady;
            
            // Use socket manager if available
            if (this.socketManager && this.socketManager.isReady()) {
                this.socketManager.toggleReady(newReadyStatus);
                console.log('[WaitingRoom] Ready status toggle sent via socket:', newReadyStatus);
            } else {
                // Fallback to local state update if socket not available
                console.warn('[WaitingRoom] Socket not available, updating local state only');
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
            }

        } catch (error) {
            console.error('[WaitingRoom] Error toggling ready status:', error);
            this.showError('Failed to update ready status. Please try again.');
        }
    }

    async handleStartGame() {
        if (!this.isHost) {
            this.showError('Only the host can start the game.');
            return;
        }

        const readyCount = this.players.filter(player => player.isReady).length;
        if (this.players.length !== 4 || readyCount !== 4) {
            this.showError('All 4 players must be ready before starting the game.');
            return;
        }

        try {
            this.setStartGameLoading(true);

            // Use socket manager if available
            if (this.socketManager && this.socketManager.isReady()) {
                this.socketManager.startGame();
                console.log('[WaitingRoom] Game start request sent via socket');
            } else {
                // Fallback to direct redirect if socket not available
                console.warn('[WaitingRoom] Socket not available, redirecting directly');
                this.showMessage('Starting game...');
                setTimeout(() => {
                    window.location.href = `game.html?room=${this.roomId}`;
                }, 1000);
            }

        } catch (error) {
            console.error('[WaitingRoom] Error starting game:', error);
            this.showError('Failed to start game. Please try again.');
            this.setStartGameLoading(false);
        }
    }
    // Player join/leave event handling
    handlePlayerJoin(playerData) {
        console.log('[WaitingRoom] Player joined:', playerData);

        // Add player to the list if not already present
        const existingPlayerIndex = this.players.findIndex(player =>
            player.id === playerData.id || player.user_id === playerData.id
        );

        if (existingPlayerIndex === -1) {
            this.players.push({
                id: playerData.id,
                user_id: playerData.user_id || playerData.id,
                username: playerData.username || playerData.name,
                isReady: playerData.isReady || false,
                isConnected: playerData.isConnected !== false
            });
        } else {
            // Update existing player data
            this.players[existingPlayerIndex] = {
                ...this.players[existingPlayerIndex],
                ...playerData,
                isConnected: playerData.isConnected !== false
            };
        }

        this.updatePlayersDisplay();
        this.uiManager.addMessage(`${playerData.username || playerData.name} joined the room`, 'system');
    }

    handlePlayerLeave(playerId) {
        console.log('[WaitingRoom] Player left:', playerId);

        const playerIndex = this.players.findIndex(player =>
            player.id === playerId || player.user_id === playerId
        );

        if (playerIndex !== -1) {
            const playerName = this.players[playerIndex].username || this.players[playerIndex].name;
            this.players.splice(playerIndex, 1);
            this.updatePlayersDisplay();
            this.uiManager.addMessage(`${playerName} left the room`, 'system');
        }
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
        this.uiManager.addMessage('Game is starting! Redirecting...', 'success');

        // Use redirect URL from server if provided, otherwise construct it
        const redirectUrl = data?.redirectUrl || `game.html?room=${this.roomId}`;
        
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 1500);
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

    // Cleanup methods for proper resource management
    async cleanup() {
        console.log('[WaitingRoom] Cleaning up resources...');

        try {
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
    new WaitingRoomManager();
});