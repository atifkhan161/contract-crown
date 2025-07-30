/**
 * Lobby Page - Contract Crown PWA
 * Handles waiting lobby functionality with player management and real-time updates
 * Requirements: 3.1, 3.2, 10.1, 10.2, 11.3, 11.4
 */

import { AuthManager } from '../core/auth.js';
import { SocketManager } from '../core/SocketManager.js';
import { RoomManager } from '../core/RoomManager.js';
import { FrontendStateSynchronizer } from '../core/FrontendStateSynchronizer.js';

class LobbyManager {
    constructor() {
        this.authManager = new AuthManager();
        this.socketManager = new SocketManager(this.authManager);
        this.roomManager = new RoomManager(this.authManager);
        this.stateSynchronizer = new FrontendStateSynchronizer(
            this.socketManager, 
            this.authManager, 
            this.roomManager
        );
        this.roomId = null;
        this.currentUser = null;
        this.room = null;
        this.players = [];
        this.isHost = false;
        this.isReady = false;
        this.connectionStatus = 'connecting';
        this.isWebSocketRoomJoined = false;
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

            console.log('[Lobby] Setting up state synchronizer...');
            this.setupStateSynchronizer();

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
        // Map HTML IDs to JavaScript property names
        const elementMap = {
            'game-code': 'gamecode',
            'copy-code-btn': 'copycodebtn',
            'leave-room-btn': 'leaveroombtn',
            'status-indicator': 'statusindicator',
            'status-text': 'statustext',
            'current-players': 'currentplayers',
            'max-players': 'maxplayers',
            'shuffle-teams-btn': 'shuffleteamsbtn',
            'team-1': 'team1',
            'team-2': 'team2',
            'ready-toggle-btn': 'readytogglebtn',
            'ready-count': 'readycount',
            'total-players': 'totalplayers',
            'host-controls': 'hostcontrols',
            'start-game-btn': 'startgamebtn',
            'start-spinner': 'startspinner',
            'game-messages': 'gamemessages',
            'loading-overlay': 'loadingoverlay',
            'loading-text': 'loadingtext',
            'error-modal': 'errormodal',
            'error-message': 'errormessage',
            'close-error-btn': 'closeerrorbtn',
            'error-ok-btn': 'errorokbtn'
        };

        Object.entries(elementMap).forEach(([id, key]) => {
            const element = document.getElementById(id);
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
        const events = [
            ['copycodebtn', 'click', () => this.copyGameCode()],
            ['leaveroombtn', 'click', () => this.leaveRoom()],
            ['readytogglebtn', 'click', () => {
                console.log('[Lobby] Ready button clicked!');
                this.toggleReady();
            }],
            ['startgamebtn', 'click', () => this.startGame()],
            ['shuffleteamsbtn', 'click', () => this.shuffleTeams()],
            ['closeerrorbtn', 'click', () => this.hideError()],
            ['errorokbtn', 'click', () => this.hideError()]
        ];

        events.forEach(([elementKey, event, handler]) => {
            const element = this.elements[elementKey];
            if (element) {
                element.addEventListener(event, handler);
                console.log(`[Lobby] Event listener added for ${elementKey}`);
            } else {
                console.warn(`[Lobby] Cannot add event listener - element not found: ${elementKey}`);
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.socketManager.isSocketConnected()) {
                this.loadRoomData(); // Refresh room data when page becomes visible
            }
        });

        window.addEventListener('beforeunload', (e) => {
            // Clean up resources
            this.cleanup();

            // Don't call async leaveRoom on beforeunload as it can cause issues
            // Just send a synchronous request if needed
            if (this.roomId) {
                navigator.sendBeacon(`/api/rooms/${this.roomId}/leave`, JSON.stringify({}));
            }
        });
    }

    async initializeWebSocket() {
        try {
            // Debug current user info
            console.log('[Lobby] Initializing WebSocket with user:', this.currentUser);
            console.log('[Lobby] Auth token:', this.authManager.getToken()?.substring(0, 20) + '...');

            await this.socketManager.connect();
            this.setupSocketListeners();
            console.log('[Lobby] WebSocket initialization complete');
        } catch (error) {
            console.error('[Lobby] WebSocket initialization failed:', error);
            this.updateConnectionStatus('disconnected');
            this.addMessage('Failed to connect to real-time updates. Using HTTP API only.', 'warning');
        }
    }

    setupSocketListeners() {
        // Connection events
        this.socketManager.on('connect', () => {
            console.log('[Lobby] WebSocket connected');
            this.updateConnectionStatus('connected');
            this.isWebSocketRoomJoined = false; // Reset flag on new connection

            // Start heartbeat to maintain connection
            this.startHeartbeat();

            // Add a small delay before joining room to ensure connection is stable
            setTimeout(() => {
                this.joinRoom();
            }, 100);
        });

        // Handle connection confirmation
        this.socketManager.on('connectionConfirmed', (data) => {
            console.log('[Lobby] Connection confirmed:', data);
            this.updateConnectionStatus('connected');
        });

        this.socketManager.on('disconnect', () => {
            console.log('[Lobby] WebSocket disconnected');
            this.updateConnectionStatus('disconnected');
            this.isWebSocketRoomJoined = false; // Reset room joined flag
            this.stopHeartbeat(); // Stop heartbeat on disconnect
            this.addMessage('Connection lost. Attempting to reconnect...', 'warning');
        });

        this.socketManager.on('reconnect', () => {
            console.log('[Lobby] WebSocket reconnected');
            this.updateConnectionStatus('connected');
            this.isWebSocketRoomJoined = false; // Reset room joined flag
            this.startHeartbeat(); // Restart heartbeat on reconnect
            this.addMessage('Reconnected successfully!', 'success');
            // Add a small delay before rejoining room
            setTimeout(() => {
                this.joinRoom();
            }, 100);
        });

        // Real-time lobby events
        this.socketManager.on('playerJoined', (data) => this.handlePlayerJoined(data));
        this.socketManager.on('playerLeft', (data) => this.handlePlayerLeft(data));
        this.socketManager.on('playerDisconnected', (data) => this.handlePlayerDisconnected(data));
        this.socketManager.on('playerReconnected', (data) => this.handlePlayerReconnected(data));
        this.socketManager.on('playerRemoved', (data) => this.handlePlayerRemoved(data));
        this.socketManager.on('playerReadyStatusChanged', (data) => this.handlePlayerReadyStatusChanged(data));
        this.socketManager.on('teamsFormed', (data) => this.handleTeamsFormed(data));

        // Room join confirmation
        this.socketManager.on('roomJoined', (data) => this.handleRoomJoined(data));

        // Game events
        this.socketManager.on('gameStarting', (data) => this.handleGameStarting(data));

        // Room events
        this.socketManager.on('roomUpdated', (data) => this.handleRoomUpdated(data));
        this.socketManager.on('roomError', (data) => this.handleRoomError(data));

        // Error handling
        this.socketManager.on('error', (data) => {
            console.error('[Lobby] WebSocket error:', data);

            // Handle specific error types
            if (data.message && data.message.includes('User information is required')) {
                console.log('[Lobby] User information error - refreshing page');
                this.addMessage('Session expired. Refreshing page...', 'warning');
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else if (data.message && data.message.includes('Player not in game room')) {
                console.log('[Lobby] Attempting to rejoin room due to error');
                this.isWebSocketRoomJoined = false;
                setTimeout(() => {
                    this.joinRoom();
                }, 1000);
            } else if (data.message && data.message.includes('Teams must be formed')) {
                console.log('[Lobby] Teams must be formed error - attempting to form teams automatically');
                this.addMessage('Teams need to be formed first. Forming teams automatically...', 'info');

                // Hide loading state from start game button
                if (this.elements.startspinner) this.elements.startspinner.classList.add('hidden');
                if (this.elements.startgamebtn) this.elements.startgamebtn.disabled = false;

                // Automatically form teams and then start game
                setTimeout(() => {
                    if (this.socketManager.isSocketConnected()) {
                        console.log('[Lobby] Auto-forming teams due to error - gameId:', this.roomId);
                        console.log('[Lobby] Current user:', this.currentUser);
                        console.log('[Lobby] Room owner:', this.room?.owner);
                        console.log('[Lobby] Is host:', this.isHost);

                        this.socketManager.emitToServer('form-teams', {
                            gameId: this.roomId
                        });
                        // Start game after teams are formed
                        setTimeout(() => {
                            this.startGameAfterTeamsFormed();
                        }, 2000);
                    }
                }, 500);
            } else {
                console.error('[Lobby] WebSocket error details:', data);
                this.addMessage(`WebSocket error: ${data.message || 'Unknown error'}`, 'error');

                // Hide loading state on any other error
                if (this.elements.startspinner) this.elements.startspinner.classList.add('hidden');
                if (this.elements.startgamebtn) this.elements.startgamebtn.disabled = false;
            }
        });
    }

    setupStateSynchronizer() {
        // Initialize state synchronizer with current room data
        if (this.room) {
            this.stateSynchronizer.initializeRoomState({
                room: this.room,
                players: this.players
            });
        }

        // Listen for state changes from the synchronizer
        this.stateSynchronizer.on('stateChanged', (data) => {
            console.log('[Lobby] State synchronizer state changed:', data.type);
            this.handleStateSynchronizerUpdate(data);
        });

        // Listen for fallback mode changes
        this.stateSynchronizer.on('fallbackModeChanged', (data) => {
            console.log('[Lobby] Fallback mode changed:', data.fallbackMode);
            this.handleFallbackModeChange(data.fallbackMode);
        });

        // Listen for operation confirmations
        this.stateSynchronizer.on('operationConfirmed', (data) => {
            console.log('[Lobby] Operation confirmed:', data.operation);
            this.addMessage('Action completed successfully!', 'success');
        });

        // Listen for operation rollbacks
        this.stateSynchronizer.on('operationRolledBack', (data) => {
            console.log('[Lobby] Operation rolled back:', data.operation);
            this.addMessage('Action failed and was reverted. Please try again.', 'warning');
        });

        // Listen for conflict resolutions
        this.stateSynchronizer.on('conflictsResolved', (data) => {
            console.log('[Lobby] Conflicts resolved:', data.conflicts);
            this.addMessage('State synchronized with server.', 'info');
        });
    }

    handleStateSynchronizerUpdate(data) {
        // Update local state from synchronizer
        const syncState = data.state;
        
        if (syncState.room) {
            this.room = syncState.room;
        }
        
        if (syncState.players) {
            this.players = syncState.players;
        }

        // Update UI based on the change type
        switch (data.type) {
            case 'toggleReady':
            case 'playerReady':
                this.updatePlayersDisplay();
                this.updateReadyStatus();
                break;
            case 'playerJoined':
            case 'playerLeft':
                this.updatePlayersDisplay();
                this.updateTeamsDisplay();
                this.updateControlsDisplay();
                break;
            case 'teamsFormed':
                this.updateTeamsDisplay();
                break;
            case 'serverSync':
            case 'rollback':
                this.updateRoomDisplay();
                this.updatePlayersDisplay();
                this.updateTeamsDisplay();
                this.updateControlsDisplay();
                this.updateReadyStatus();
                break;
        }
    }

    handleFallbackModeChange(fallbackMode) {
        if (fallbackMode) {
            this.addMessage('Using backup connection mode due to network issues.', 'warning');
            this.updateConnectionStatus('fallback');
        } else {
            this.addMessage('Real-time connection restored!', 'success');
            this.updateConnectionStatus('connected');
        }
    }

    joinRoom() {
        if (this.socketManager.isSocketConnected()) {
            console.log('[Lobby] Joining room via WebSocket:', this.roomId);
            console.log('[Lobby] Current user:', this.currentUser);

            // Join the game room's socket channel with user info
            // Normalize user ID field access for consistency
            const userId = String(this.currentUser.user_id || this.currentUser.id || '');
            this.socketManager.emitToServer('join-game-room', {
                gameId: this.roomId,
                userId: userId,
                username: this.currentUser.username
            });
            this.addMessage('Joining room...', 'info');

            // Set a timeout to retry if we don't get confirmation
            if (this.joinRoomTimeout) {
                clearTimeout(this.joinRoomTimeout);
            }
            this.joinRoomTimeout = setTimeout(() => {
                if (!this.isWebSocketRoomJoined) {
                    console.log('[Lobby] Room join timeout, retrying...');
                    this.addMessage('Retrying room connection...', 'warning');
                    const userId = String(this.currentUser.user_id || this.currentUser.id || '');
                    this.socketManager.emitToServer('join-game-room', {
                        gameId: this.roomId,
                        userId: userId,
                        username: this.currentUser.username
                    });
                }
            }, 5000); // Increased timeout to 5 seconds
        } else {
            console.log('[Lobby] Cannot join room - WebSocket not connected');
            this.addMessage('WebSocket not connected, using HTTP API only', 'warning');
            this.updateConnectionStatus('disconnected');
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

            // Check if current user is the host using string comparison
            // Normalize user ID field access for consistency
            const currentUserId = String(this.currentUser.user_id || this.currentUser.id || '');
            this.isHost = String(this.room.owner || '') === currentUserId;

            console.log(`[Lobby] Loaded room data via HTTP API - ${this.players.length} players:`, this.players.map(p => ({ id: p.user_id || p.id, name: p.username, connected: p.isConnected })));

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
        if (data.gameId === this.roomId) {
            this.players = data.players || [];
            this.updatePlayersDisplay();
            this.updateTeamsDisplay();
            this.addMessage(`${data.player.username} joined the room (${data.playerCount}/4)`, 'info');
        }
    }

    handlePlayerLeft(data) {
        if (data.gameId === this.roomId) {
            this.players = data.players || [];
            // Normalize user ID comparison for host check
            const currentUserId = String(this.currentUser.user_id || this.currentUser.id || '');
            this.isHost = String(data.newHostId || '') === currentUserId;
            this.updatePlayersDisplay();
            this.updateControlsDisplay();
            this.updateTeamsDisplay();
            this.addMessage(`${data.playerName || 'A player'} left the room (${data.playerCount}/4)`, 'warning');
        }
    }

    handlePlayerDisconnected(data) {
        if (data.gameId === this.roomId) {
            this.players = data.players || [];
            this.updatePlayersDisplay();
            this.addMessage(`${data.playerName} disconnected (${data.connectedCount}/${data.playerCount} connected)`, 'warning');
        }
    }

    handlePlayerReconnected(data) {
        if (data.gameId === this.roomId) {
            console.log(`[Lobby] Player ${data.playerName} reconnected`);
            this.players = data.players || [];
            this.updatePlayersDisplay();
            this.updateReadyStatus(); // Update ready status since connection status changed
            this.addMessage(`${data.playerName} reconnected`, 'success');
        }
    }

    handlePlayerRemoved(data) {
        if (data.gameId === this.roomId) {
            this.players = data.players || [];
            // Normalize user ID comparison for host check
            const currentUserId = String(this.currentUser.user_id || this.currentUser.id || '');
            this.isHost = String(data.newHostId || '') === currentUserId;
            this.updatePlayersDisplay();
            this.updateControlsDisplay();
            this.updateTeamsDisplay();
            this.addMessage(`${data.playerName} was removed due to ${data.reason} (${data.playerCount}/4)`, 'warning');
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
        if (data.gameId === this.roomId) {
            this.showLoading('Starting game...');
            this.addMessage(`Game started by ${data.startedBy}! Redirecting to game page...`, 'success');
            setTimeout(() => window.location.href = `game.html?room=${this.roomId}`, 2000);
        }
    }

    handleRoomError(data) {
        this.showError(data.message || 'An error occurred in the room');
    }

    handlePlayerReadyStatusChanged(data) {
        if (data.gameId === this.roomId) {
            // Clear any pending fallback timeout since we got a WebSocket response
            if (this.readyFallbackTimeout) {
                clearTimeout(this.readyFallbackTimeout);
                this.readyFallbackTimeout = null;
            }

            this.players = data.players || [];
            this.updatePlayersDisplay();
            this.updateReadyStatus();

            const status = data.isReady ? 'ready' : 'not ready';
            const readyInfo = data.canStartGame ? ' - Game can start!' : ` (${data.readyCount}/${data.totalPlayers} ready)`;
            this.addMessage(`${data.playerName} is now ${status}${readyInfo}`, 'info');
        }
    }

    handleTeamsFormed(data) {
        if (data.gameId === this.roomId) {
            this.players = data.players || [];
            this.updatePlayersDisplay();
            this.updateTeamsDisplay();
            this.addMessage(`Teams formed by ${data.formedBy}!`, 'success');
        }
    }

    handleRoomJoined(data) {
        if (data.gameId === this.roomId) {
            console.log('[Lobby] Successfully joined WebSocket room:', data);
            console.log('[Lobby] Current user ID:', String(this.currentUser?.user_id || this.currentUser?.id || ''));
            console.log('[Lobby] Players in room:', data.players?.map(p => ({ id: p.userId, name: p.username })));
            this.isWebSocketRoomJoined = true;

            // Clear the join timeout
            if (this.joinRoomTimeout) {
                clearTimeout(this.joinRoomTimeout);
                this.joinRoomTimeout = null;
            }

            this.addMessage('Connected to real-time updates!', 'success');

            // Update players from WebSocket data if available
            if (data.players) {
                console.log(`[Lobby] Updating players from WebSocket room-joined event - ${data.players.length} players:`, data.players.map(p => ({ id: p.userId, name: p.username, connected: p.isConnected })));
                this.players = data.players;
                this.updatePlayersDisplay();
                this.updateTeamsDisplay();
                this.updateReadyStatus(); // Also update ready status since player data changed
            }
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
        const statusTexts = { 
            connected: 'Connected', 
            connecting: 'Connecting...', 
            disconnected: 'Disconnected',
            fallback: 'Backup Mode'
        };

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

    // Helper method to check if a player is the current user
    isCurrentUserPlayer(player) {
        // Normalize user ID comparison for consistency
        const currentUserId = String(this.currentUser.user_id || this.currentUser.id || '');
        const playerUserId = String(player.userId || player.user_id || player.id || '');
        return playerUserId === currentUserId;
    }

    // Helper method to find the current player in the players array
    findCurrentPlayer() {
        return this.players.find(p => this.isCurrentUserPlayer(p));
    }

    updatePlayerSlot(slot, player) {
        if (!slot) return;

        const isCurrentUser = this.isCurrentUserPlayer(player);
        // Normalize user ID comparison for host check
        const playerUserId = String(player.userId || player.user_id || player.id || '');
        const roomOwnerId = String(this.room?.owner || '');
        const isHost = this.room && playerUserId === roomOwnerId;
        const isReady = player.isReady || false;
        const isConnected = player.isConnected !== false; // Default to true if not specified

        slot.className = `player-slot occupied${isReady ? ' ready' : ''}${isCurrentUser ? ' current-user' : ''}${!isConnected ? ' disconnected' : ''}`;

        const nameElement = slot.querySelector('.player-name');
        const statusElement = slot.querySelector('.player-status .status-text');
        const statusIndicator = slot.querySelector('.player-status .status-indicator');
        const hostBadge = slot.querySelector('.host-badge');
        const readyBadge = slot.querySelector('.ready-badge');

        if (nameElement) {
            nameElement.textContent = player.username + (!isConnected ? ' (Disconnected)' : '');
        }

        if (statusElement) {
            if (!isConnected) {
                statusElement.textContent = 'Disconnected';
            } else {
                statusElement.textContent = isReady ? 'Ready' : 'Not Ready';
            }
        }

        if (statusIndicator) {
            let statusClass = 'disconnected';
            if (isConnected) {
                statusClass = isReady ? 'connected' : 'connecting';
            }
            statusIndicator.className = `status-indicator ${statusClass}`;
        }

        if (hostBadge) hostBadge.classList.toggle('hidden', !isHost);
        if (readyBadge) readyBadge.classList.toggle('hidden', !isReady || !isConnected);
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
        const connectedPlayers = this.players.filter(p => p.isConnected !== false);
        const readyCount = connectedPlayers.filter(p => p.isReady).length;
        const totalPlayers = this.players.length;
        const connectedCount = connectedPlayers.length;
        const maxPlayers = this.room ? this.room.maxPlayers : 4;

        if (this.elements.readycount) this.elements.readycount.textContent = readyCount;
        if (this.elements.totalplayers) this.elements.totalplayers.textContent = maxPlayers;

        // Normalize user ID access for consistency
        const currentUserId = String(this.currentUser.user_id || this.currentUser.id || '');
        const currentPlayer = this.findCurrentPlayer();

        // Debug if current player is not found
        if (!currentPlayer) {
            console.log(`[Lobby] Looking for current user ID: "${currentUserId}"`);
            console.log(`[Lobby] Current user object:`, this.currentUser);
            console.log(`[Lobby] Players data:`, this.players.map(p => ({
                userId: p.userId,
                user_id: p.user_id,
                id: p.id,
                username: p.username
            })));
        }

        if (currentPlayer && this.elements.readytogglebtn) {
            this.isReady = currentPlayer.isReady || false;
            const isConnected = currentPlayer.isConnected !== false;

            const btnText = this.elements.readytogglebtn.querySelector('.btn-text');
            if (btnText) {
                btnText.textContent = this.isReady ? 'Not Ready' : 'Ready Up';
            }

            this.elements.readytogglebtn.classList.toggle('btn-secondary', this.isReady);
            this.elements.readytogglebtn.classList.toggle('btn-primary', !this.isReady);
            this.elements.readytogglebtn.disabled = !isConnected;

            console.log(`[Lobby] Ready button updated - isReady: ${this.isReady}, disabled: ${!isConnected}, text: ${btnText?.textContent}`);
        } else if (!this.elements.readytogglebtn) {
            console.warn('[Lobby] Ready toggle button element not found!');
        } else if (!currentPlayer) {
            console.warn('[Lobby] Current player not found in players list');
            console.warn('[Lobby] Available player IDs:', this.players.map(p => p.userId || p.user_id || p.id));
            console.warn('[Lobby] Looking for ID:', currentUserId);
        }

        if (this.isHost && this.elements.startgamebtn) {
            // Can start if we have at least 2 connected players and all connected players are ready
            const canStart = connectedCount >= 2 && readyCount === connectedCount;
            this.elements.startgamebtn.disabled = !canStart;
        }
    }

    async updateReadyStatusViaAPI(newReadyStatus) {
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

        const data = await response.json();
        this.addMessage(`Ready status updated via HTTP API`, 'info');

        // Update local state since we won't get WebSocket events
        if (data.room && data.room.players) {
            this.players = data.room.players;
            this.updatePlayersDisplay();
        }
    }

    async toggleReady() {
        try {
            console.log('[Lobby] Toggle ready clicked, current status:', this.isReady);
            const newReadyStatus = !this.isReady;

            // Disable button while processing
            if (this.elements.readytogglebtn) {
                this.elements.readytogglebtn.disabled = true;
                console.log('[Lobby] Button disabled, sending ready status:', newReadyStatus);
            }

            // Use state synchronizer for optimistic updates with fallback
            console.log('[Lobby] Using state synchronizer for ready status update');
            const operationId = await this.stateSynchronizer.toggleReadyStatus(newReadyStatus);
            
            console.log(`[Lobby] Ready status operation initiated with ID: ${operationId}`);
            this.addMessage(`Setting ready status to ${newReadyStatus ? 'ready' : 'not ready'}...`, 'info');

        } catch (error) {
            console.error('Error toggling ready status:', error);
            this.showError('Failed to update ready status. Please try again.');
        } finally {
            // Re-enable button after a short delay to prevent double-clicks
            setTimeout(() => {
                if (this.elements.readytogglebtn) {
                    this.elements.readytogglebtn.disabled = false;
                    console.log('[Lobby] Button re-enabled');
                }
            }, 1000);
        }
    }

    async shuffleTeams() {
        if (!this.isHost) return;

        try {
            // Disable button while processing
            if (this.elements.shuffleteamsbtn) {
                this.elements.shuffleteamsbtn.disabled = true;
            }

            // Send team formation request via WebSocket for real-time updates
            if (this.socketManager.isSocketConnected()) {
                this.socketManager.emitToServer('form-teams', {
                    gameId: this.roomId
                });
            } else {
                // Fallback to HTTP API if WebSocket is not connected
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
        console.log('[Lobby] Start game called - isHost:', this.isHost);
        console.log('[Lobby] Current user:', this.currentUser);
        console.log('[Lobby] Room owner:', this.room?.owner);

        if (!this.isHost) {
            console.log('[Lobby] Not host, cannot start game');
            return;
        }

        try {
            const connectedPlayers = this.players.filter(p => p.isConnected !== false);
            const readyCount = connectedPlayers.filter(p => p.isReady).length;
            const connectedCount = connectedPlayers.length;

            console.log(`[Lobby] Start game check - Total players: ${this.players.length}, Connected: ${connectedCount}, Ready: ${readyCount}`);
            console.log('[Lobby] Players state:', this.players.map(p => ({
                username: p.username,
                isConnected: p.isConnected,
                isReady: p.isReady
            })));

            if (connectedCount < 2) {
                this.showError('At least 2 connected players are required to start the game.');
                return;
            }

            if (readyCount !== connectedCount) {
                this.showError('All connected players must be ready to start the game.');
                return;
            }

            // Check if teams need to be formed for 4-player games
            if (this.players.length === 4) {
                const team1Players = this.players.filter(p => p.teamAssignment === 1);
                const team2Players = this.players.filter(p => p.teamAssignment === 2);

                if (team1Players.length === 0 || team2Players.length === 0) {
                    console.log('[Lobby] Teams not formed for 4-player game, forming teams automatically...');
                    this.addMessage('Forming teams automatically...', 'info');

                    // No need to reload room data, just form teams directly

                    // Form teams first
                    if (this.socketManager.isSocketConnected()) {
                        console.log('[Lobby] Sending form-teams request for gameId:', this.roomId);
                        console.log('[Lobby] Current user:', this.currentUser);
                        console.log('[Lobby] Room owner:', this.room?.owner);
                        console.log('[Lobby] Is host:', this.isHost);

                        this.socketManager.emitToServer('form-teams', {
                            gameId: this.roomId
                        });
                    } else {
                        // Fallback to HTTP API
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
                    }

                    // Wait a moment for teams to be formed, then start the game
                    setTimeout(() => {
                        this.startGameAfterTeamsFormed();
                    }, 2000);
                    return;
                }
            }

            // Show loading state
            if (this.elements.startspinner) this.elements.startspinner.classList.remove('hidden');
            if (this.elements.startgamebtn) this.elements.startgamebtn.disabled = true;

            console.log('[Lobby] Sending start game request via WebSocket');
            console.log('[Lobby] Room ID:', this.roomId);
            console.log('[Lobby] Socket connected:', this.socketManager.isSocketConnected());

            // Send game start request via WebSocket for real-time coordination
            if (this.socketManager.isSocketConnected()) {
                this.socketManager.emitToServer('start-game', {
                    gameId: this.roomId
                });
            } else {
                // Fallback to HTTP API if WebSocket is not connected
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

    async startGameAfterTeamsFormed() {
        try {
            // Show loading state
            if (this.elements.startspinner) this.elements.startspinner.classList.remove('hidden');
            if (this.elements.startgamebtn) this.elements.startgamebtn.disabled = true;

            console.log('[Lobby] Starting game after teams formed');

            // Refresh room data to ensure we have the latest state
            await this.loadRoomData();

            // Verify all players are still connected and ready
            const connectedPlayers = this.players.filter(p => p.isConnected !== false);
            const readyCount = connectedPlayers.filter(p => p.isReady).length;

            console.log(`[Lobby] Pre-start verification - Connected: ${connectedPlayers.length}, Ready: ${readyCount}`);

            if (connectedPlayers.length < 2) {
                throw new Error('Not enough connected players to start the game');
            }

            if (readyCount !== connectedPlayers.length) {
                throw new Error('All connected players must be ready to start the game');
            }

            // Send game start request via WebSocket for real-time coordination
            if (this.socketManager.isSocketConnected()) {
                this.socketManager.emitToServer('start-game', {
                    gameId: this.roomId
                });
            } else {
                // Fallback to HTTP API if WebSocket is not connected
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
            }

        } catch (error) {
            console.error('Error starting game after teams formed:', error);
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
            // Send leave room request via WebSocket for real-time updates
            if (this.socketManager.isSocketConnected()) {
                this.socketManager.emitToServer('leave-game-room', {
                    gameId: this.roomId
                });
            }

            // Also call HTTP API as backup
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

    startHeartbeat() {
        // Clear any existing heartbeat
        this.stopHeartbeat();

        // Send ping every 30 seconds to maintain connection
        this.heartbeatInterval = setInterval(() => {
            if (this.socketManager.isSocketConnected()) {
                this.socketManager.emitToServer('ping', {
                    timestamp: new Date().toISOString(),
                    roomId: this.roomId,
                    userId: this.currentUser?.id
                });
            }
        }, 30000);

        console.log('[Lobby] Heartbeat started');
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('[Lobby] Heartbeat stopped');
        }
    }

    cleanup() {
        console.log('[Lobby] Cleaning up resources...');

        // Stop heartbeat
        this.stopHeartbeat();

        // Clear timeouts
        if (this.joinRoomTimeout) {
            clearTimeout(this.joinRoomTimeout);
            this.joinRoomTimeout = null;
        }

        if (this.readyFallbackTimeout) {
            clearTimeout(this.readyFallbackTimeout);
            this.readyFallbackTimeout = null;
        }

        // Cleanup state synchronizer
        if (this.stateSynchronizer) {
            this.stateSynchronizer.cleanup();
        }

        // Disconnect socket if connected
        if (this.socketManager) {
            this.socketManager.disconnect();
        }
    }
}

// Initialize lobby when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LobbyManager();
});