/**
 * GameLogicManager - Handles game logic, validation, and state calculations
 */
export class GameLogicManager {
    constructor(waitingRoomManager) {
        this.manager = waitingRoomManager;
    }

    /**
     * Calculate if game can start with current setup
     */
    calculateGameStartEligibility() {
        const humanPlayers = this.manager.players.filter(player => !player.isBot);
        const readyPlayers = this.manager.players.filter(player => player.isReady);
        const totalPlayers = this.manager.players.length;

        const hasMinimumHumans = humanPlayers.length >= 2;
        const allPlayersReady = totalPlayers >= 2 && readyPlayers.length === totalPlayers;
        const roomIsWaiting = !this.manager.roomData || this.manager.roomData.status === 'waiting';

        return hasMinimumHumans && allPlayersReady && roomIsWaiting;
    }

    /**
     * Validate ready status change
     */
    validateReadyStatusChange(currentPlayer) {
        if (!currentPlayer) {
            return { valid: false, error: 'You are not in this room.' };
        }

        if (currentPlayer.isConnected === false) {
            return { valid: false, error: 'Cannot change ready status while disconnected.' };
        }

        if (this.manager.roomData && this.manager.roomData.status !== 'waiting') {
            return { valid: false, error: 'Cannot change ready status - room is not waiting for players.' };
        }

        return { valid: true };
    }

    /**
     * Validate game start conditions
     */
    validateGameStart() {
        if (!this.manager.isHost) {
            return { valid: false, error: 'Only the host can start the game.' };
        }

        if (this.manager.roomData && this.manager.roomData.status !== 'waiting') {
            return { valid: false, error: 'Cannot start game - room is not in waiting status.' };
        }

        const connectedPlayers = this.manager.players.filter(player => player.isConnected !== false);
        const readyPlayers = connectedPlayers.filter(player => player.isReady);

        if (connectedPlayers.length < 2) {
            return { valid: false, error: 'Need at least 2 connected players to start the game.' };
        }

        if (readyPlayers.length !== connectedPlayers.length) {
            return { 
                valid: false, 
                error: `All connected players must be ready. Currently ${readyPlayers.length}/${connectedPlayers.length} players are ready.` 
            };
        }

        if (connectedPlayers.length === 4 && readyPlayers.length !== 4) {
            return { valid: false, error: 'All 4 players must be ready before starting the game.' };
        }

        return { valid: true };
    }

    /**
     * Update team assignments based on current players or provided teams
     */
    updateTeamAssignments(providedTeams = null) {
        if (providedTeams) {
            // Use provided teams (e.g., from shuffle)
            this.manager.teams = providedTeams;
        } else {
            // Auto-assign teams based on current players
            this.manager.teams = this.manager.uiManager.teamManager.autoAssignTeams(this.manager.players);
        }
        this.manager.uiManager.updateTeamDisplay(this.manager.teams);
    }

    /**
     * Handle team assignment for a player
     */
    handleTeamAssignment(playerId, team, slotId) {
        console.log('[GameLogicManager] Team assignment:', { playerId, team, slotId });

        const player = this.manager.players.find(p => (p.id === playerId || p.user_id === playerId));
        if (!player) {
            console.warn('[GameLogicManager] Player not found for team assignment:', playerId);
            return;
        }

        // Update locally first for immediate feedback
        player.teamAssignment = team;
        this.updateTeamAssignments();

        // Send to server for real-time sync
        if (this.manager.socketManager && this.manager.socketManager.isReady()) {
            this.manager.socketManager.assignPlayerToTeam(playerId, team);
        }

        this.manager.uiManager.showToast(`${player.username} assigned to Team ${team}`, 'success', { compact: true });
    }

    /**
     * Handle bot management
     */
    handleAddBots() {
        const currentBots = this.manager.players.filter(player => player.isBot);
        const emptySlots = 4 - this.manager.players.length;

        if (currentBots.length > 0) {
            this.removeBots();
        } else {
            this.addBots(emptySlots);
        }
    }

    addBots(count) {
        if (count <= 0) return;

        console.log('[GameLogicManager] Adding', count, 'bots');
        this.manager.uiManager.showToast(`Adding ${count} bot${count > 1 ? 's' : ''}...`, 'system', { compact: true });

        if (this.manager.isHost) {
            this.addBotsLocally(count);

            if (this.manager.socketManager && this.manager.socketManager.isReady()) {
                const botData = this.createBotData(count);
                const eventData = {
                    roomId: this.manager.roomId,
                    type: 'bots-added',
                    bots: botData,
                    players: this.manager.players,
                    message: `Host added ${count} bot${count > 1 ? 's' : ''}`
                };
                
                this.manager.socketManager.emit('room-update', eventData);
            }
        } else {
            this.manager.uiManager.showToast('Only the host can add bots', 'warning', { compact: true });
        }
    }

    removeBots() {
        const botCount = this.manager.players.filter(player => player.isBot).length;

        if (botCount === 0) {
            this.manager.uiManager.showToast('No bots to remove', 'info', { compact: true });
            return;
        }

        console.log('[GameLogicManager] Removing', botCount, 'bots');
        this.manager.uiManager.showToast(`Removing ${botCount} bot${botCount > 1 ? 's' : ''}...`, 'system', { compact: true });

        if (this.manager.isHost) {
            this.removeBotsLocally();

            if (this.manager.socketManager && this.manager.socketManager.isReady()) {
                this.manager.socketManager.emit('room-update', {
                    roomId: this.manager.roomId,
                    type: 'bots-removed',
                    players: this.manager.players,
                    message: `Host removed ${botCount} bot${botCount > 1 ? 's' : ''}`
                });
            }
        } else {
            this.manager.uiManager.showToast('Only the host can remove bots', 'warning', { compact: true });
        }
    }

    addBotsLocally(count) {
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
            this.manager.players.push(bot);
        }

        this.manager.updatePlayersDisplay();
        this.manager.uiManager.showToast(`Added ${count} bot${count > 1 ? 's' : ''} locally`, 'success', { compact: true });
    }

    removeBotsLocally() {
        const botCount = this.manager.players.filter(player => player.isBot).length;
        this.manager.players = this.manager.players.filter(player => !player.isBot);
        this.manager.updatePlayersDisplay();
        this.manager.uiManager.showToast(`Removed ${botCount} bot${botCount > 1 ? 's' : ''} locally`, 'success', { compact: true });
    }

    createBotData(count) {
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
        
        return botData;
    }
}