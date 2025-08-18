/**
 * WaitingRoomController - Simple controller that coordinates managers
 */
import { AuthManager } from '../core/auth.js';
import { WaitingRoomSocketManager } from '../core/WaitingRoomSocketManager.js';
import { WaitingRoomOrchestrator } from '../ui/WaitingRoomOrchestrator.js';
import { getErrorHandler } from '../core/ErrorHandler.js';
import { SocketEventHandler } from '../core/SocketEventHandler.js';
import { GameLogicManager } from '../core/GameLogicManager.js';

export class WaitingRoomController {
    constructor() {
        this.authManager = new AuthManager();
        this.uiManager = new WaitingRoomOrchestrator();
        this.errorHandler = getErrorHandler(this.authManager);
        this.socketEventHandler = new SocketEventHandler(this);
        this.gameLogic = new GameLogicManager(this);
        
        this.currentUser = null;
        this.roomId = null;
        this.roomData = null;
        this.isHost = false;
        this.isReady = false;
        this.players = [];
        this.teams = { A: [], B: [] };
        
        this.connectionHealthTimer = null;
        this.lastSuccessfulUpdate = Date.now();
        
        // Setup callbacks after UI manager is initialized
        setTimeout(() => this.setupCallbacks(), 0);
        this.initialize();
    }

    setupCallbacks() {
        console.log('[WaitingRoomController] Setting up callbacks');
        this.uiManager.setReadyToggleCallback((slotNumber) => {
            console.log('[WaitingRoomController] Ready toggle callback called for slot:', slotNumber);
            this.handleReadyToggle(slotNumber);
        });
        this.uiManager.setTeamAssignmentCallback((playerId, team, slotId) => this.gameLogic.handleTeamAssignment(playerId, team, slotId));
        this.uiManager.setShuffleTeamsCallback(() => {
            console.log('[WaitingRoomController] Shuffle teams callback called');
            this.handleShuffleTeams();
        });
        this.uiManager.setAddBotsCallback(() => {
            console.log('[WaitingRoomController] Add bots callback called');
            this.gameLogic.handleAddBots();
        });
        this.uiManager.setStartGameCallback(() => {
            console.log('[WaitingRoomController] Start game callback called');
            this.handleStartGame();
        });
    }

    async initialize() {
        try {
            const isAuthenticated = this.authManager.isAuthenticated();
            const user = this.authManager.getCurrentUser();

            if (!isAuthenticated || !user) {
                this.errorHandler?.handleAuthError('User not authenticated');
                return;
            }

            this.currentUser = user;
            this.roomId = this.parseRoomIdFromURL();
            
            if (!this.roomId) {
                this.showError('Invalid room ID. Redirecting to dashboard...');
                setTimeout(() => window.location.href = 'dashboard.html', 2000);
                return;
            }

            await this.loadRoomData();
            await this.initializeSocketManager();
            this.startConnectionHealthMonitoring();

        } catch (error) {
            console.error('[WaitingRoomController] Initialization error:', error);
            
            if (error.message.includes('Room not found') || error.message.includes('deleted')) {
                this.showError('Room not found. Redirecting to dashboard...');
                setTimeout(() => window.location.href = 'dashboard.html', 2000);
            } else {
                this.showError('Failed to initialize waiting room. Please try again.');
            }
        }
    }

    parseRoomIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        
        if (!roomId || !/^[a-zA-Z0-9-_]{8,}$/.test(roomId)) {
            return null;
        }
        
        return roomId;
    }

    async loadRoomData() {
        try {
            this.uiManager.showLoading('Loading room data...');

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

            const currentUserId = this.currentUser.user_id || this.currentUser.id;
            const isUserInRoom = this.roomData.players && this.roomData.players.some(p =>
                (p.id === currentUserId || p.user_id === currentUserId)
            );

            if (!isUserInRoom) {
                await this.joinRoom();
            }

            this.updateRoomDisplay();
            this.checkHostStatus();

        } catch (error) {
            console.error('[WaitingRoomController] Error loading room data:', error);
            throw error;
        } finally {
            this.uiManager.hideLoading();
        }
    }

    async joinRoom() {
        try {
            const token = this.authManager.getToken();
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
            }
        } catch (joinError) {
            console.warn('[WaitingRoomController] Error joining room:', joinError);
        }
    }

    checkHostStatus() {
        const currentUserId = this.currentUser.user_id || this.currentUser.id;
        const roomOwnerId = this.roomData.owner;
        
        this.isHost = String(roomOwnerId) === String(currentUserId);
        
        if (this.isHost) {
            this.uiManager.showHostControls(true, false, this.roomData?.status || 'waiting');
        } else {
            this.uiManager.showHostControls(false, false, this.roomData?.status || 'waiting');
        }
    }

    async initializeSocketManager() {
        try {
            this.socketManager = new WaitingRoomSocketManager(this.authManager, this.roomId);
            this.socketEventHandler.setupEventListeners(this.socketManager);
            await this.socketManager.connect();
        } catch (error) {
            console.error('[WaitingRoomController] Failed to initialize socket manager:', error);
            this.showError('Failed to connect to real-time updates. Some features may not work properly.');
        }
    }

    updateConnectionStatus(status, details = {}) {
        this.uiManager.updateConnectionStatus(status, details);

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
        if (this.roomData) {
            this.updateRoomDisplay();
        }
        this.uiManager.hideConnectionWarning();
    }

    handleConnectionLost() {
        const readyButtons = document.querySelectorAll('.ready-btn');
        readyButtons.forEach(btn => {
            btn.disabled = true;
            btn.title = 'Connection required for ready status';
        });
    }

    handleReconnecting(details) {
        if (details.reconnectAttempts > 2) {
            this.uiManager.showConnectionWarning(
                'warning',
                `Connection unstable - attempt ${details.reconnectAttempts}/${details.maxReconnectAttempts}`,
                { autoHide: false }
            );
        }
    }

    updateRoomDisplay() {
        if (!this.roomData) return;

        const displayCode = this.roomData.roomCode || this.roomData.code || this.roomData.inviteCode || this.roomData.id || this.roomId;
        this.uiManager.setRoomCode(displayCode);

        this.players = this.roomData.players || [];
        this.updatePlayersDisplay();
    }

    updatePlayersDisplay() {
        const playersWithHostInfo = this.players.map(player => ({
            ...player,
            isHost: player.id === this.roomData.owner || player.user_id === this.roomData.owner
        }));

        const currentUserId = this.currentUser?.user_id || this.currentUser?.id;
        this.uiManager.updatePlayerSlots(playersWithHostInfo, currentUserId);

        const connectedPlayers = this.players.filter(player => player.isConnected !== false);
        const readyPlayers = connectedPlayers.filter(player => player.isReady);
        const humanPlayers = connectedPlayers.filter(player => !player.isBot);

        this.uiManager.updateReadyStatus(readyPlayers.length, connectedPlayers.length, humanPlayers.length);
        this.gameLogic.updateTeamAssignments();

        const botCount = this.players.filter(player => player.isBot).length;
        this.uiManager.updateBotCount(botCount);

        const currentPlayer = this.players.find(player =>
            player.id === currentUserId || player.user_id === currentUserId
        );

        if (currentPlayer) {
            this.isReady = currentPlayer.isReady || false;
        }

        if (this.isHost) {
            const canStartGame = this.gameLogic.calculateGameStartEligibility();
            this.uiManager.showHostControls(true, canStartGame, this.roomData?.status || 'waiting');
        } else {
            this.uiManager.showHostControls(false, false, this.roomData?.status || 'waiting');
        }
    }

    async handleReadyToggle(slotNumber) {
        console.log('[WaitingRoomController] handleReadyToggle called with slot:', slotNumber);
        try {
            const currentUserId = this.currentUser.user_id || this.currentUser.id;
            const currentPlayer = this.players.find(player =>
                player.id === currentUserId || player.user_id === currentUserId
            );

            console.log('[WaitingRoomController] Current player:', currentPlayer);
            console.log('[WaitingRoomController] Current ready status:', this.isReady);

            const validation = this.gameLogic.validateReadyStatusChange(currentPlayer);
            if (!validation.valid) {
                console.warn('[WaitingRoomController] Validation failed:', validation.error);
                this.showError(validation.error);
                return;
            }

            const newReadyStatus = !this.isReady;
            console.log('[WaitingRoomController] New ready status:', newReadyStatus);
            
            const readyBtn = document.querySelector(`[data-slot="${slotNumber}"] .ready-btn`);
            
            if (readyBtn) {
                readyBtn.disabled = true;
                readyBtn.classList.toggle('ready', newReadyStatus);
            }

            if (this.socketManager && this.socketManager.isReady()) {
                console.log('[WaitingRoomController] Using WebSocket to toggle ready status');
                this.socketManager.toggleReady(newReadyStatus);
                setTimeout(() => {
                    if (readyBtn) readyBtn.disabled = false;
                }, 500);
            } else {
                console.log('[WaitingRoomController] Using API to toggle ready status');
                await this.toggleReadyStatusViaAPI(newReadyStatus);
                if (readyBtn) readyBtn.disabled = false;
            }

        } catch (error) {
            console.error('[WaitingRoomController] Error toggling ready status:', error);
            this.showError('Failed to update ready status. Please try again.');
        }
    }

    async handleShuffleTeams() {
        console.log('[WaitingRoomController] handleShuffleTeams called');
        try {
            if (!this.isHost) {
                this.showError('Only the host can shuffle teams.');
                return;
            }

            if (!this.players || this.players.length === 0) {
                this.showError('No players to shuffle.');
                return;
            }

            // Use the team manager to shuffle teams
            const shuffledTeams = this.uiManager.teamManager.shuffleTeams(this.players);
            console.log('[WaitingRoomController] Generated shuffled teams:', shuffledTeams);
            
            // Update the UI immediately for instant feedback
            this.teams = shuffledTeams;
            this.gameLogic.updateTeamAssignments(shuffledTeams);
            
            // Send individual team assignments to server for real-time sync
            await this.syncTeamAssignmentsToServer(shuffledTeams);
            
            this.uiManager.showToast('Teams shuffled randomly!', 'success', { compact: true });
            console.log('[WaitingRoomController] Teams shuffled and synced to server');

        } catch (error) {
            console.error('[WaitingRoomController] Error shuffling teams:', error);
            this.showError('Failed to shuffle teams. Please try again.');
        }
    }



    async syncTeamAssignmentsToServer(shuffledTeams) {
        console.log('[WaitingRoomController] Syncing team assignments to server:', shuffledTeams);
        
        try {
            // Update each player's team assignment on the server
            const allPlayers = [...(shuffledTeams.A || []), ...(shuffledTeams.B || [])];
            console.log('[WaitingRoomController] Players to sync:', allPlayers);
            
            for (const player of allPlayers) {
                const team = shuffledTeams.A.includes(player) ? 'A' : 'B';
                const playerId = player.id || player.user_id;
                
                console.log(`[WaitingRoomController] Syncing player ${player.username} (${playerId}) to team ${team}`);
                
                if (this.socketManager && this.socketManager.isReady()) {
                    // Use WebSocket for real-time updates
                    console.log('[WaitingRoomController] Using WebSocket for team assignment');
                    this.socketManager.assignPlayerToTeam(playerId, team);
                } else {
                    // Fallback to API
                    console.log('[WaitingRoomController] Using API for team assignment');
                    await this.assignPlayerToTeamViaAPI(playerId, team);
                }
                
                // Small delay to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.log('[WaitingRoomController] All team assignments synced successfully');
            
        } catch (error) {
            console.error('[WaitingRoomController] Error syncing team assignments:', error);
            this.uiManager.showToast('Team assignments may not be synced with other players', 'warning', { compact: true });
        }
    }

    async assignPlayerToTeamViaAPI(playerId, team) {
        const token = this.authManager.getToken();
        const response = await fetch(`/api/waiting-rooms/${this.roomId}/assign-team`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                playerId: playerId,
                team: team 
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to assign player to team ${team}`);
        }

        return response.json();
    }

    async handleStartGame() {
        console.log('[WaitingRoomController] handleStartGame called');
        try {
            const validation = this.gameLogic.validateGameStart();
            if (!validation.valid) {
                console.warn('[WaitingRoomController] Game start validation failed:', validation.error);
                this.showError(validation.error);
                return;
            }

            this.uiManager.showStartGameLoading();

            if (this.socketManager && this.socketManager.isReady()) {
                console.log('[WaitingRoomController] Starting game via WebSocket');
                this.socketManager.startGame();
            } else {
                console.log('[WaitingRoomController] Starting game via API');
                await this.startGameViaAPI();
            }

        } catch (error) {
            console.error('[WaitingRoomController] Error starting game:', error);
            this.uiManager.hideStartGameLoading();
            this.showError('Failed to start game. Please try again.');
        }
    }

    async startGameViaAPI() {
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

        const gameData = await response.json();
        this.handleGameStart(gameData);
    }

    async toggleReadyStatusViaAPI(newReadyStatus) {
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

        this.isReady = newReadyStatus;
        const currentUserId = this.currentUser.user_id || this.currentUser.id;
        const playerIndex = this.players.findIndex(player =>
            player.id === currentUserId || player.user_id === currentUserId
        );

        if (playerIndex !== -1) {
            this.players[playerIndex].isReady = this.isReady;
            this.updatePlayersDisplay();
        }

        if (!this.socketManager || !this.socketManager.isReady()) {
            this.uiManager.showPlayerReadyToast(this.currentUser.username, newReadyStatus);
        }
    }

    startConnectionHealthMonitoring() {
        if (this.connectionHealthTimer) {
            clearInterval(this.connectionHealthTimer);
        }

        this.connectionHealthTimer = setInterval(() => {
            this.checkConnectionHealth();
        }, 30000);
    }

    checkConnectionHealth() {
        if (!this.socketManager) return;

        const health = this.socketManager.checkConnectionHealth();
        const timeSinceLastUpdate = Date.now() - this.lastSuccessfulUpdate;

        if (timeSinceLastUpdate > 120000) {
            this.uiManager.showConnectionWarning(
                'warning',
                'Connection may be stale - checking...',
                { autoHide: true, duration: 10000 }
            );

            if (health.isConnected) {
                this.socketManager.checkConnectionHealth();
            }
        }

        if (health.reconnectAttempts >= 3) {
            this.uiManager.showConnectionWarning(
                'error',
                'Connection unstable - consider refreshing',
                { autoHide: false }
            );
        }
    }

    markSuccessfulUpdate() {
        this.lastSuccessfulUpdate = Date.now();
    }

    showError(message) {
        this.uiManager.displayError(message);
    }

    // Event handlers that delegate to other managers
    handlePlayerJoin(playerData) {
        const mappedPlayerData = {
            id: playerData.userId || playerData.id,
            user_id: playerData.userId || playerData.user_id || playerData.id,
            username: playerData.username || playerData.name,
            isReady: playerData.isReady || false,
            isConnected: playerData.isConnected !== false
        };

        const existingPlayerIndex = this.players.findIndex(player =>
            player.id === mappedPlayerData.id || player.user_id === mappedPlayerData.id
        );

        if (existingPlayerIndex === -1) {
            this.players.push(mappedPlayerData);
        } else {
            this.players[existingPlayerIndex] = {
                ...this.players[existingPlayerIndex],
                ...mappedPlayerData
            };
        }

        this.updatePlayersDisplay();
        this.uiManager.showPlayerJoinedToast(mappedPlayerData.username);
    }

    handlePlayerLeave(data) {
        // Implementation delegated to keep controller simple
        console.log('[WaitingRoomController] Player left:', data);
    }

    handleHostTransfer(data) {
        // Implementation delegated to keep controller simple
        console.log('[WaitingRoomController] Host transfer:', data);
    }

    handleReadyStatusChange(playerId, isReady) {
        const playerIndex = this.players.findIndex(player =>
            player.id === playerId || player.user_id === playerId
        );

        if (playerIndex !== -1) {
            this.players[playerIndex].isReady = isReady;
            const playerName = this.players[playerIndex].username || this.players[playerIndex].name;

            const currentUserId = this.currentUser.user_id || this.currentUser.id;
            if (playerId === currentUserId) {
                this.isReady = isReady;
            }

            this.updatePlayersDisplay();
            this.uiManager.showPlayerReadyToast(playerName, isReady);
        }
    }

    handleGameStart(data) {
        console.log('[WaitingRoomController] Game starting:', data);
        
        if (data.teams) {
            const team1Names = data.teams.team1.map(p => p.username).join(', ');
            const team2Names = data.teams.team2.map(p => p.username).join(', ');
            this.uiManager.showToast(`Teams formed! Team 1: ${team1Names} vs Team 2: ${team2Names}`, 'success');
        }

        if (data.game) {
            this.uiManager.showToast(`Game ${data.game.gameCode} created! Starting...`, 'success');
        } else {
            this.uiManager.showGameStartingToast();
        }

        const redirectUrl = data?.redirectUrl || `game.html?room=${this.roomId}`;
        this.uiManager.showStartGameLoading();

        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 2000);
    }

    handleNavigateToGame(data) {
        const redirectUrl = data?.redirectUrl || `game.html?room=${this.roomId}`;
        this.uiManager.showToast('Navigating to game...', 'info', { compact: true });
        this.cleanup();
        window.location.href = redirectUrl;
    }

    async cleanup() {
        if (this.connectionHealthTimer) {
            clearInterval(this.connectionHealthTimer);
        }

        if (this.socketManager) {
            this.socketManager.disconnect();
        }

        if (this.uiManager) {
            this.uiManager.cleanup();
        }
    }
}