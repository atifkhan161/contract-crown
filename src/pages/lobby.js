/**
 * Lobby Page - Contract Crown PWA
 * Handles waiting lobby functionality with player management and real-time updates
 * Requirements: 3.1, 3.2, 10.1, 10.2, 11.3, 11.4
 */

import { SocketManager } from '../core/SocketManager.js';

class LobbyManager {
    constructor() {
        this.authManager = new window.AuthManager();
        this.socketManager = new SocketManager(this.authManager);
        this.roomId = null;
        this.currentUser = null;
        this.room = null;
        this.players = [];
        this.isHost = false;
        this.isReady = false;
        this.connectionStatus = 'connecting';
        this.elements = {};
        this.init();
    }

    async init() {
        try {
            console.log('[Lobby] Starting initialization...');

            if (!this.authManager.isAuthenticated()) {
                console.log('[Lobby] User not authenticated, redirecting to login');
                window.location.href = 'login.html';
                return;
            }

            this.currentUser = this.authManager.getCurrentUser();
            console.log('[Lobby] Current user:', this.currentUser?.username);

            const urlParams = new URLSearchParams(window.location.search);
            this.roomId = urlParams.get('room');
            console.log('[Lobby] Room ID:', this.roomId);

            if (!this.roomId) {
                console.log('[Lobby] No room ID provided');
                this.showError('Invalid room. Redirecting to dashboard...');
                setTimeout(() => window.location.href = 'dashboard.html', 2000);
                return;
            }

            console.log('[Lobby] Initializing elements...');
            this.initializeElements();

            console.log('[Lobby] Setting up event listeners...');
            this.setupEventListeners();

            console.log('[Lobby] Initializing WebSocket...');
            await this.initializeWebSocket();
            this.updateConnectionStatus('connecting');

            console.log('[Lobby] Loading room data...');
            // Load room data
            await this.loadRoomData();

            console.log('[Lobby] Updating teams display...');
            // Update teams display initially
            this.updateTeamsDisplay();

            console.log('[Lobby] Initialization complete!');

        } catch (error) {
            console.error('[Lobby] Initialization error:', error);
            this.hideLoading();
            this.showError('Failed to initialize lobby. Please try again.');
        }
    }

    initializeElements() {
        const ids = ['game-code', 'copy-code-btn', 'leave-room-btn', 'status-indicator', 'status-text', 'current-players', 'max-players', 'shuffle-teams-btn', 'team-1', 'team-2', 'ready-toggle-btn', 'ready-count', 'total-players', 'host-controls', 'start-game-btn', 'start-spinner', 'game-messages', 'loading-overlay', 'loading-text', 'error-modal', 'error-message', 'close-error-btn', 'error-ok-btn'];

        ids.forEach(id => {
            const element = document.getElementById(id);
            const key = id.replace(/-/g, '');
            this.elements[key] = element;

            if (!element) {
                console.warn(`[Lobby] Element not found: ${id}`);
            }
        });

        this.elements.playerSlots = [1, 2, 3, 4].map(i => {
            const slot = document.getElementById(`player-slot-${i}`);
            if (!slot) {
                console.warn(`[Lobby] Player slot not found: player-slot-${i}`);
            }
            return slot;
        });

        console.log('[Lobby] Elements initialized:', Object.keys(this.elements));
    }

    setupEventListeners() {
        const events = [['copycodebtn', 'click', () => this.copyGameCode()], ['leaveroombtn', 'click', () => this.leaveRoom()], ['readytogglebtn', 'click', () => this.toggleReady()], ['startgamebtn', 'click', () => this.startGame()], ['shuffleteamsbtn', 'click', () => this.shuffleTeams()], ['closeerrorbtn', 'click', () => this.hideError()], ['errorokbtn', 'click', () => this.hideError()]];
        events.forEach(([element, event, handler]) => this.elements[element]?.addEventListener(event, handler));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.socketManager.isSocketConnected()) {
                this.loadRoomData(); // Refresh room data when page becomes visible
            }
        });
        window.addEventListener('beforeunload', (e) => {
            // Don't call async leaveRoom on beforeunload as it can cause issues
            // Just send a synchronous request if needed
            if (this.roomId) {
                navigator.sendBeacon(`/api/rooms/${this.roomId}/leave`, JSON.stringify({}));
            }
        });
    }

    async initializeWebSocket() {
        await this.socketManager.connect();
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        // Connection events
        this.socketManager.on('connect', () => {
            this.updateConnectionStatus('connected');
            this.joinRoom();
        });

        this.socketManager.on('disconnect', () => {
            this.updateConnectionStatus('disconnected');
            this.addMessage('Connection lost. Attempting to reconnect...', 'warning');
        });

        this.socketManager.on('reconnect', () => {
            this.updateConnectionStatus('connected');
            this.addMessage('Reconnected successfully!', 'success');
            this.joinRoom();
        });

        // Room events
        this.socketManager.on('playerJoined', (data) => this.handlePlayerJoined(data));
        this.socketManager.on('playerLeft', (data) => this.handlePlayerLeft(data));
        this.socketManager.on('roomUpdated', (data) => this.handleRoomUpdated(data));
        this.socketManager.on('gameStarting', (data) => this.handleGameStarting(data));
        this.socketManager.on('roomError', (data) => this.handleRoomError(data));
        
        // Ready status and team events
        this.socketManager.on('playerReadyStatusChanged', (data) => this.handlePlayerReadyStatusChanged(data));
        this.socketManager.on('teamsFormed', (data) => this.handleTeamsFormed(data));
    }

    joinRoom() {
        if (this.socketManager.isSocketConnected()) {
            // Join the room's socket channel
            this.socketManager.emitToServer('joinRoom', { roomId: this.roomId });
        }
    }

    async loadRoomData() {
        try {
            this.showLoading('Loading room data...');

            const response = await fetch(`/api/rooms/${this.roomId}`, {
                headers: {
                    'Authorization': `Bearer ${this.authManager.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load room data');
            }

            const data = await response.json();
            this.room = data.room;
            this.players = this.room.players || [];
            this.isHost = this.room.owner === this.currentUser.id;

            this.updateRoomDisplay();
            this.updatePlayersDisplay();
            this.updateControlsDisplay();
            this.updateReadyStatus();

            this.addMessage(`Welcome to ${this.room.name}! ${this.isHost ? 'You are the host.' : ''}`, 'info');

            if (this.elements.readytogglebtn) {
                this.elements.readytogglebtn.disabled = false;
            }

            // Hide loading overlay
            this.hideLoading();

        } catch (error) {
            console.error('Error loading room data:', error);
            this.hideLoading();
            this.showError('Failed to load room data. Redirecting to dashboard...');
            setTimeout(() => window.location.href = 'dashboard.html', 2000);
        }
    }

    handlePlayerJoined(data) {
        if (data.roomId === this.roomId) {
            this.players = data.players || [];
            this.updatePlayersDisplay();
            this.addMessage(`${data.player.username} joined the room`, 'info');
        }
    }

    handlePlayerLeft(data) {
        if (data.roomId === this.roomId) {
            this.players = data.players || [];
            this.isHost = data.newOwner === this.currentUser.id;
            this.updatePlayersDisplay();
            this.updateControlsDisplay();
            this.addMessage(`${data.username || 'A player'} left the room`, 'warning');
        }
    }

    handleRoomUpdated(data) {
        if (data.roomId === this.roomId) {
            this.room = data.room;
            this.players = this.room.players || [];
            this.updateRoomDisplay();
            this.updatePlayersDisplay();
        }
    }

    handleGameStarting(data) {
        if (data.roomId === this.roomId) {
            this.showLoading('Starting game...');
            this.addMessage('Game is starting! Redirecting to game page...', 'success');
            setTimeout(() => window.location.href = `game.html?room=${this.roomId}`, 2000);
        }
    }

    handleRoomError(data) {
        this.showError(data.message || 'An error occurred in the room');
    }

    handlePlayerReadyStatusChanged(data) {
        if (data.roomId === this.roomId) {
            this.players = data.players || [];
            this.updatePlayersDisplay();
            this.updateReadyStatus();
            
            const player = this.players.find(p => p.id === data.playerId);
            const playerName = player ? player.username : 'A player';
            const status = data.isReady ? 'ready' : 'not ready';
            this.addMessage(`${playerName} is now ${status}`, 'info');
        }
    }

    handleTeamsFormed(data) {
        if (data.roomId === this.roomId) {
            this.players = data.players || [];
            this.updatePlayersDisplay();
            this.updateTeamsDisplay();
            this.addMessage('Teams have been formed!', 'success');
        }
    }

    updateRoomDisplay() {
        if (this.elements.gamecode && this.room) {
            // Show room ID instead of game code for now
            this.elements.gamecode.textContent = this.room.id.substring(0, 8).toUpperCase();
        }

        // Update room title if we have room name
        const titleElement = document.querySelector('.room-title');
        if (titleElement && this.room) {
            titleElement.textContent = this.room.name;
        }
    }

    updateConnectionStatus(status) {
        this.connectionStatus = status;
        const statusTexts = { connected: 'Connected', connecting: 'Connecting...', disconnected: 'Disconnected' };

        if (this.elements.statusindicator && this.elements.statustext) {
            this.elements.statusindicator.className = `status-indicator ${status}`;
            this.elements.statustext.textContent = statusTexts[status] || 'Unknown';
        }
    }

    updatePlayersDisplay() {
        if (this.elements.currentplayers) {
            this.elements.currentplayers.textContent = this.players.length;
        }

        if (this.elements.maxplayers && this.room) {
            this.elements.maxplayers.textContent = this.room.maxPlayers;
        }

        this.elements.playerSlots.forEach((slot, index) => {
            const player = this.players[index];
            if (player) {
                this.updatePlayerSlot(slot, player, index);
            } else {
                this.clearPlayerSlot(slot);
            }
        });

        // Update ready status after updating players
        this.updateReadyStatus();
    }

    updatePlayerSlot(slot, player) {
        if (!slot) return;

        const isCurrentUser = player.id === this.currentUser.id;
        const isHost = this.room && player.id === this.room.owner;
        const isReady = player.isReady || false;

        slot.className = `player-slot occupied${isReady ? ' ready' : ''}${isCurrentUser ? ' current-user' : ''}`;

        const nameElement = slot.querySelector('.player-name');
        const statusElement = slot.querySelector('.player-status .status-text');
        const statusIndicator = slot.querySelector('.player-status .status-indicator');
        const hostBadge = slot.querySelector('.host-badge');
        const readyBadge = slot.querySelector('.ready-badge');

        if (nameElement) nameElement.textContent = player.username;
        if (statusElement) statusElement.textContent = isReady ? 'Ready' : 'Not Ready';
        if (statusIndicator) statusIndicator.className = `status-indicator ${isReady ? 'connected' : 'disconnected'}`;
        if (hostBadge) hostBadge.classList.toggle('hidden', !isHost);
        if (readyBadge) readyBadge.classList.toggle('hidden', !isReady);
    }

    clearPlayerSlot(slot) {
        if (!slot) return;

        slot.className = 'player-slot';
        const nameElement = slot.querySelector('.player-name');
        const statusElement = slot.querySelector('.player-status .status-text');
        const statusIndicator = slot.querySelector('.player-status .status-indicator');

        if (nameElement) nameElement.textContent = 'Waiting for player...';
        if (statusElement) statusElement.textContent = 'Not Ready';
        if (statusIndicator) statusIndicator.className = 'status-indicator';

        slot.querySelectorAll('.host-badge, .ready-badge').forEach(badge => badge.classList.add('hidden'));
    }

    updateTeamsDisplay() {
        // Get players assigned to each team
        const team1Players = this.players.filter(p => p.teamAssignment === 1);
        const team2Players = this.players.filter(p => p.teamAssignment === 2);
        
        // If no team assignments yet, show players in order for preview
        const unassignedPlayers = this.players.filter(p => !p.teamAssignment);
        const previewTeam1 = team1Players.length > 0 ? team1Players : unassignedPlayers.slice(0, 2);
        const previewTeam2 = team2Players.length > 0 ? team2Players : unassignedPlayers.slice(2, 4);

        ['team1', 'team2'].forEach((teamKey, teamIndex) => {
            const teamElement = this.elements[teamKey];
            if (!teamElement) return;

            const teamPlayers = teamIndex === 0 ? previewTeam1 : previewTeam2;
            const slots = teamElement.querySelectorAll('.team-player-slot');
            const isAssigned = teamIndex === 0 ? team1Players.length > 0 : team2Players.length > 0;

            slots.forEach((slot, index) => {
                const player = teamPlayers[index];

                if (player) {
                    slot.className = `team-player-slot filled${isAssigned ? ' assigned' : ' preview'}`;
                    slot.innerHTML = `<span class="slot-text">${player.username}</span>`;
                } else {
                    slot.className = 'team-player-slot empty';
                    slot.innerHTML = '<span class="slot-text">Waiting...</span>';
                }
            });
        });

        // Show/hide shuffle button based on whether teams are formed and user is host
        if (this.elements.shuffleteamsbtn) {
            const hasAssignedTeams = team1Players.length > 0 || team2Players.length > 0;
            const canFormTeams = this.players.length === 4;
            this.elements.shuffleteamsbtn.classList.toggle('hidden', !this.isHost || !canFormTeams);
            
            // Update button text based on state
            const buttonText = hasAssignedTeams ? 'Shuffle Teams' : 'Form Teams';
            const buttonIcon = this.elements.shuffleteamsbtn.querySelector('.btn-icon');
            const buttonTextSpan = this.elements.shuffleteamsbtn.querySelector('.btn-text');
            if (buttonTextSpan) {
                buttonTextSpan.textContent = buttonText;
            } else {
                // If no text span, update the whole button text after the icon
                if (buttonIcon) {
                    this.elements.shuffleteamsbtn.innerHTML = `<span class="btn-icon">🔀</span> ${buttonText}`;
                }
            }
        }
    }

    updateControlsDisplay() {
        if (this.elements.hostcontrols) {
            this.elements.hostcontrols.classList.toggle('hidden', !this.isHost);
        }
        if (this.elements.shuffleteamsbtn) {
            this.elements.shuffleteamsbtn.classList.toggle('hidden', !this.isHost);
        }
    }

    updateReadyStatus() {
        const readyCount = this.players.filter(p => p.isReady).length;
        const totalPlayers = this.players.length;
        const maxPlayers = this.room ? this.room.maxPlayers : 4;

        if (this.elements.readycount) this.elements.readycount.textContent = readyCount;
        if (this.elements.totalplayers) this.elements.totalplayers.textContent = maxPlayers;

        const currentPlayer = this.players.find(p => p.id === this.currentUser.id);
        if (currentPlayer && this.elements.readytogglebtn) {
            this.isReady = currentPlayer.isReady || false;
            this.elements.readytogglebtn.querySelector('.btn-text').textContent = this.isReady ? 'Not Ready' : 'Ready Up';
            this.elements.readytogglebtn.classList.toggle('btn-secondary', this.isReady);
            this.elements.readytogglebtn.classList.toggle('btn-primary', !this.isReady);
        }

        if (this.isHost && this.elements.startgamebtn) {
            const canStart = totalPlayers >= 2 && readyCount === totalPlayers; // Allow starting with 2+ players when all are ready
            this.elements.startgamebtn.disabled = !canStart;
        }
    }

    async toggleReady() {
        try {
            const newReadyStatus = !this.isReady;
            
            // Disable button while processing
            if (this.elements.readytogglebtn) {
                this.elements.readytogglebtn.disabled = true;
            }

            const response = await fetch(`/api/rooms/${this.roomId}/ready`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authManager.getToken()}`
                },
                body: JSON.stringify({ isReady: newReadyStatus })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update ready status');
            }

            // The socket event will handle updating the UI
            // No need to update locally here as the server will broadcast the change
            
        } catch (error) {
            console.error('Error toggling ready status:', error);
            this.showError(error.message || 'Failed to update ready status');
        } finally {
            // Re-enable button
            if (this.elements.readytogglebtn) {
                this.elements.readytogglebtn.disabled = false;
            }
        }
    }

    async shuffleTeams() {
        if (!this.isHost) return;

        try {
            // Disable button while processing
            if (this.elements.shuffleteamsbtn) {
                this.elements.shuffleteamsbtn.disabled = true;
            }

            const response = await fetch(`/api/rooms/${this.roomId}/form-teams`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authManager.getToken()}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to form teams');
            }

            // The socket event will handle updating the UI
            
        } catch (error) {
            console.error('Error forming teams:', error);
            this.showError(error.message || 'Failed to form teams');
        } finally {
            // Re-enable button
            if (this.elements.shuffleteamsbtn) {
                this.elements.shuffleteamsbtn.disabled = false;
            }
        }
    }

    async startGame() {
        if (!this.isHost) return;

        try {
            const readyCount = this.players.filter(p => p.isReady).length;
            const totalPlayers = this.players.length;

            if (totalPlayers < 2) {
                this.showError('At least 2 players are required to start the game.');
                return;
            }

            if (readyCount !== totalPlayers) {
                this.showError('All players must be ready to start the game.');
                return;
            }

            // Show loading state
            if (this.elements.startspinner) this.elements.startspinner.classList.remove('hidden');
            if (this.elements.startgamebtn) this.elements.startgamebtn.disabled = true;

            const response = await fetch(`/api/rooms/${this.roomId}/start`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authManager.getToken()}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to start game');
            }

            // The socket event will handle the game starting process
            
        } catch (error) {
            console.error('Error starting game:', error);
            this.showError(error.message || 'Failed to start game');
            
            // Hide loading state on error
            if (this.elements.startspinner) this.elements.startspinner.classList.add('hidden');
            if (this.elements.startgamebtn) this.elements.startgamebtn.disabled = false;
        }
    }

    async copyGameCode() {
        try {
            const codeText = this.elements.gamecode ? this.elements.gamecode.textContent : this.roomId;
            await navigator.clipboard.writeText(codeText);
            this.addMessage('Room code copied to clipboard!', 'success');

            if (this.elements.copycodebtn) {
                const originalText = this.elements.copycodebtn.innerHTML;
                this.elements.copycodebtn.innerHTML = '<span class="copy-icon">✓</span>';
                setTimeout(() => this.elements.copycodebtn.innerHTML = originalText, 1000);
            }
        } catch (error) {
            this.addMessage('Failed to copy room code. Please copy manually.', 'error');
        }
    }

    async leaveRoom() {
        try {
            const response = await fetch(`/api/rooms/${this.roomId}/leave`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authManager.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to leave room');
            }

            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error('Error leaving room:', error);
            // Still redirect even if API call fails
            window.location.href = 'dashboard.html';
        }
    }

    addMessage(text, type = 'info') {
        if (!this.elements.gamemessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = `game-message ${type}`;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageElement.innerHTML = `${text}<span class="message-time">${time}</span>`;

        this.elements.gamemessages.appendChild(messageElement);
        this.elements.gamemessages.scrollTop = this.elements.gamemessages.scrollHeight;

        const messages = this.elements.gamemessages.querySelectorAll('.game-message');
        if (messages.length > 20) messages[0].remove();
    }

    showLoading(text = 'Loading...') {
        if (this.elements.loadingoverlay && this.elements.loadingtext) {
            this.elements.loadingtext.textContent = text;
            this.elements.loadingoverlay.classList.remove('hidden');
        }
    }

    hideLoading() {
        if (this.elements.loadingoverlay) {
            this.elements.loadingoverlay.classList.add('hidden');
        }
    }

    showError(message) {
        console.log('[Lobby] Showing error:', message);
        if (this.elements.errormodal && this.elements.errormessage) {
            this.elements.errormessage.textContent = message;
            this.elements.errormodal.classList.remove('hidden');
        } else {
            // Fallback to alert if modal elements not found
            alert(message);
        }
    }

    hideError() {
        if (this.elements.errormodal) {
            this.elements.errormodal.classList.add('hidden');
        }
    }
}

// Initialize lobby when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LobbyManager();
});