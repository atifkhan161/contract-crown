import BaseLokiModel from './BaseLokiModel.js';

/**
 * GamePlayer Model
 * Handles game player relationships using LokiJS
 */
class GamePlayer extends BaseLokiModel {
    constructor(gamePlayerData = {}) {
        super('gamePlayers', gamePlayerData);
        this.game_player_id = gamePlayerData.game_player_id;
        this.game_id = gamePlayerData.game_id;
        this.user_id = gamePlayerData.user_id;
        this.team_id = gamePlayerData.team_id;
        this.seat_position = gamePlayerData.seat_position;
        this.is_ready = gamePlayerData.is_ready || false;
        this.is_host = gamePlayerData.is_host || false;
        this.current_hand = gamePlayerData.current_hand;
        this.tricks_won_current_round = gamePlayerData.tricks_won_current_round || 0;
        this.joined_at = gamePlayerData.joined_at;
    }

    /**
     * Find game players by game ID
     * @param {string} gameId - Game ID
     * @returns {Promise<Array>} Array of game players
     */
    static async findByGameId(gameId) {
        try {
            const gamePlayerModel = new GamePlayer();
            const gamePlayers = await gamePlayerModel.find({ game_id: gameId });
            return gamePlayers.map(playerData => new GamePlayer(playerData));
        } catch (error) {
            console.error('[GamePlayer] FindByGameId error:', error.message);
            throw error;
        }
    }

    /**
     * Find game player by game and user ID
     * @param {string} gameId - Game ID
     * @param {string} userId - User ID
     * @returns {Promise<GamePlayer|null>} Game player or null if not found
     */
    static async findByGameAndUser(gameId, userId) {
        try {
            const gamePlayerModel = new GamePlayer();
            const playerData = await gamePlayerModel.findOne({ 
                game_id: gameId, 
                user_id: userId 
            });

            if (!playerData) {
                return null;
            }

            return new GamePlayer(playerData);
        } catch (error) {
            console.error('[GamePlayer] FindByGameAndUser error:', error.message);
            throw error;
        }
    }

    /**
     * Update player ready status
     * @param {boolean} isReady - Ready status
     * @returns {Promise<GamePlayer>} Updated game player instance
     */
    async updateReadyStatus(isReady) {
        try {
            const updatedPlayer = await this.updateById(this.game_player_id, {
                is_ready: isReady
            });

            if (updatedPlayer) {
                this.is_ready = isReady;
                console.log(`[GamePlayer] Updated player ${this.user_id} ready status to ${isReady}`);
            }

            return this;
        } catch (error) {
            console.error('[GamePlayer] UpdateReadyStatus error:', error.message);
            throw error;
        }
    }
}

export default GamePlayer;
