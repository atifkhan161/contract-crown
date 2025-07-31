/**
 * Waiting Room Manager
 * Handles waiting room initialization, state management, and player coordination
 */

import { AuthManager } from '../core/auth.js';

class WaitingRoomManager {
    constructor() {
        this.authManager = new AuthManager();
        this.socketManager = null;
        this.uiManager = null;

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

            // Initialize socket manager and UI manager (will be implemented in later tasks)
            // this.initializeSocketManager();
            // this.initializeUIManager();

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
                this.elements.hostControls.classList.remove('hidden');
            }

        } catch (error) {
            console.error('[WaitingRoom] Error loading room data:', error);
            throw error;
        } finally {
            this.showLoading(false);
        }
    }

    updateRoomDisplay() {
        if (!this.roomData) return;

        // Update room code display
        this.elements.roomCode.textContent = this.roomData.id || this.roomId;

        // Update players count
        const playerCount = this.roomData.players ? this.roomData.players.length : 0;
        this.elements.currentPlayers.textContent = playerCount;

        // Update players list
        this.players = this.roomData.players || [];
        this.updatePlayersDisplay();
    }
    updatePlayersDisplay() {
        // Reset all slots to empty state
        Object.values(this.elements.playerSlots).forEach((slot, index) => {
            const playerName = slot.querySelector('.player-name');
            const readyText = slot.querySelector('.ready-text');
            const readyIndicator = slot.querySelector('.ready-indicator');
            const hostBadge = slot.querySelector('.host-badge');

            playerName.textContent = 'Waiting for player...';
            readyText.textContent = 'Not Ready';
            readyIndicator.className = 'ready-indicator';
            hostBadge.classList.add('hidden');
            slot.classList.remove('occupied', 'ready', 'host');
        });

        // Populate slots with current players
        this.players.forEach((player, index) => {
            if (index < 4) {
                const slot = this.elements.playerSlots[index + 1];
                const playerName = slot.querySelector('.player-name');
                const readyText = slot.querySelector('.ready-text');
                const readyIndicator = slot.querySelector('.ready-indicator');
                const hostBadge = slot.querySelector('.host-badge');

                playerName.textContent = player.username || player.name || 'Unknown Player';

                // Update ready status
                const isPlayerReady = player.isReady || false;
                readyText.textContent = isPlayerReady ? 'Ready' : 'Not Ready';
                readyIndicator.className = `ready-indicator ${isPlayerReady ? 'ready' : ''}`;

                // Show host badge if this player is the host
                const isPlayerHost = player.id === this.roomData.owner || player.user_id === this.roomData.owner;
                if (isPlayerHost) {
                    hostBadge.classList.remove('hidden');
                    slot.classList.add('host');
                }

                slot.classList.add('occupied');
                if (isPlayerReady) {
                    slot.classList.add('ready');
                }

                // Check if this is the current user to update ready button
                if (player.id === (this.currentUser.user_id || this.currentUser.id) ||
                    player.user_id === (this.currentUser.user_id || this.currentUser.id)) {
                    this.isReady = isPlayerReady;
                    this.updateReadyButton();
                }
            }
        });

        // Update ready count
        const readyCount = this.players.filter(player => player.isReady).length;
        this.elements.readyCount.textContent = readyCount;

        // Update start game button state for host
        if (this.isHost) {
            const canStartGame = this.players.length === 4 && readyCount === 4;
            this.elements.startGameBtn.disabled = !canStartGame;
        }
    }

    updateReadyButton() {
        const btnText = this.elements.readyToggleBtn.querySelector('.btn-text');
        if (this.isReady) {
            btnText.textContent = 'Not Ready';
            this.elements.readyToggleBtn.classList.add('ready');
        } else {
            btnText.textContent = 'Ready Up';
            this.elements.readyToggleBtn.classList.remove('ready');
        }

        // Enable ready button once room data is loaded
        this.elements.readyToggleBtn.disabled = false;
    }

    // Event Handlers
    async handleLeaveRoom() {
        if (confirm('Are you sure you want to leave the room?')) {
            try {
                this.showLoading(true, 'Leaving room...');

                // TODO: Implement socket-based leave room when WaitingRoomSocketManager is available
                // For now, just redirect to dashboard
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
        try {
            const roomCode = this.roomData?.id || this.roomId;
            await navigator.clipboard.writeText(roomCode);

            // Show temporary feedback
            const originalText = this.elements.copyCodeBtn.innerHTML;
            this.elements.copyCodeBtn.innerHTML = '<span class="copy-icon">✓</span>';
            this.elements.copyCodeBtn.style.color = '#4CAF50';

            setTimeout(() => {
                this.elements.copyCodeBtn.innerHTML = originalText;
                this.elements.copyCodeBtn.style.color = '';
            }, 1500);

        } catch (error) {
            console.error('[WaitingRoom] Error copying room code:', error);
            this.showError('Failed to copy room code to clipboard.');
        }
    }

    async handleReadyToggle() {
        try {
            // TODO: Implement socket-based ready toggle when WaitingRoomSocketManager is available
            // For now, just toggle local state
            this.isReady = !this.isReady;
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

            console.log('[WaitingRoom] Ready status toggled:', this.isReady);

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

            // TODO: Implement socket-based game start when WaitingRoomSocketManager is available
            // For now, just redirect to game page
            console.log('[WaitingRoom] Starting game...');

            setTimeout(() => {
                window.location.href = `game.html?room=${this.roomId}`;
            }, 1000);

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
        this.showMessage(`${playerData.username || playerData.name} joined the room`);
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
            this.showMessage(`${playerName} left the room`);
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
            this.showMessage(`${playerName} is ${isReady ? 'ready' : 'not ready'}`);
        }
    }

    handleGameStart() {
        console.log('[WaitingRoom] Game starting...');
        this.showMessage('Game is starting! Redirecting...');

        setTimeout(() => {
            window.location.href = `game.html?room=${this.roomId}`;
        }, 1500);
    }
    // Navigation management
    handlePageHidden() {
        console.log('[WaitingRoom] Page hidden - maintaining connection');
        // TODO: Implement connection management when socket manager is available
    }

    handlePageVisible() {
        console.log('[WaitingRoom] Page visible - checking connection');
        // TODO: Implement connection check when socket manager is available
    }

    // Cleanup methods for proper resource management
    async cleanup() {
        console.log('[WaitingRoom] Cleaning up resources...');

        try {
            // TODO: Cleanup socket connections when WaitingRoomSocketManager is available
            // this.socketManager?.disconnect();

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
        const loadingText = document.getElementById('loading-text');
        if (loadingText) {
            loadingText.textContent = message;
        }

        if (show) {
            this.elements.loadingOverlay.classList.remove('hidden');
        } else {
            this.elements.loadingOverlay.classList.add('hidden');
        }
    }

    setStartGameLoading(loading) {
        if (loading) {
            this.elements.startGameBtn.disabled = true;
            this.elements.startSpinner.classList.remove('hidden');
            const btnText = this.elements.startGameBtn.querySelector('.btn-text');
            btnText.textContent = 'Starting...';
        } else {
            this.elements.startGameBtn.disabled = false;
            this.elements.startSpinner.classList.add('hidden');
            const btnText = this.elements.startGameBtn.querySelector('.btn-text');
            btnText.textContent = 'Start Game';
        }
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorModal.classList.remove('hidden');
    }

    hideErrorModal() {
        this.elements.errorModal.classList.add('hidden');
    }

    showMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'game-message';
        messageElement.textContent = message;

        this.elements.gameMessages.appendChild(messageElement);

        // Auto-remove message after 5 seconds
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 5000);

        // Scroll to bottom of messages
        this.elements.gameMessages.scrollTop = this.elements.gameMessages.scrollHeight;
    }
}

// Initialize waiting room when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WaitingRoomManager();
});