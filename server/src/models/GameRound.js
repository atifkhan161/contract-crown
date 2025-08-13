import { v4 as uuidv4 } from 'uuid';
import BaseRxDBModel from './BaseRxDBModel.js';

/**
 * GameRound Model
 * Handles game round creation and management in the database using RxDB
 */
class GameRound extends BaseRxDBModel {
    constructor(roundData = {}) {
        super('gameRounds', roundData);
        this.round_id = roundData.round_id || uuidv4();
        this.game_id = roundData.game_id;
        this.round_number = roundData.round_number;
        this.dealer_user_id = roundData.dealer_user_id;
        this.first_player_user_id = roundData.first_player_user_id;
        this.trump_suit = roundData.trump_suit;
        this.declaring_team_id = roundData.declaring_team_id;
        this.declaring_team_tricks_won = roundData.declaring_team_tricks_won || 0;
        this.challenging_team_tricks_won = roundData.challenging_team_tricks_won || 0;
        this.round_completed_at = roundData.round_completed_at;
        this.created_at = roundData.created_at;
    }

    /**
     * Find round by ID
     * @param {string} roundId - Round ID
     * @returns {Promise<GameRound|null>} GameRound instance or null if not found
     */
    static async findById(roundId) {
        try {
            const roundModel = new GameRound();
            const roundData = await roundModel.findOne({ 
                selector: { round_id: roundId }
            });

            if (!roundData) {
                return null;
            }

            return new GameRound(roundData);
        } catch (error) {
            console.error('[GameRound] FindById error:', error.message);
            throw error;
        }
    }

    /**
     * Find current round for a game
     * @param {string} gameId - Game ID
     * @returns {Promise<GameRound|null>} Current round or null if not found
     */
    static async findCurrentRound(gameId) {
        try {
            const roundModel = new GameRound();
            const rounds = await roundModel.find({ 
                selector: {
                    game_id: gameId,
                    round_completed_at: null
                }
            });

            if (rounds.length === 0) {
                return null;
            }

            // Return the most recent round
            const currentRound = rounds.sort((a, b) => b.round_number - a.round_number)[0];
            return new GameRound(currentRound);
        } catch (error) {
            console.error('[GameRound] FindCurrentRound error:', error);
            throw error;
        }
    }

    /**
     * Find all rounds for a game
     * @param {string} gameId - Game ID
     * @returns {Promise<GameRound[]>} Array of GameRound instances
     */
    static async findByGameId(gameId) {
        try {
            const roundModel = new GameRound();
            const rounds = await roundModel.find({ game_id: gameId });

            return rounds.map(roundData => new GameRound(roundData))
                        .sort((a, b) => a.round_number - b.round_number);
        } catch (error) {
            console.error('[GameRound] FindByGameId error:', error);
            throw error;
        }
    }

    /**
     * Update trump declaration
     * @param {string} trumpSuit - Trump suit
     * @param {string} declaringTeamId - Declaring team ID
     * @returns {Promise<GameRound>} Updated round instance
     */
    async updateTrumpDeclaration(trumpSuit, declaringTeamId) {
        try {
            const updateData = {
                trump_suit: trumpSuit,
                declaring_team_id: declaringTeamId
            };

            const updatedRound = await this.updateById(this.round_id, updateData);

            if (updatedRound) {
                this.trump_suit = trumpSuit;
                this.declaring_team_id = declaringTeamId;
                console.log(`[GameRound] Updated trump declaration for round ${this.round_number}: ${trumpSuit}`);
            }

            return this;
        } catch (error) {
            console.error('[GameRound] UpdateTrumpDeclaration error:', error);
            throw error;
        }
    }

    /**
     * Complete the round with final scores
     * @param {number} declaringTeamTricks - Tricks won by declaring team
     * @param {number} challengingTeamTricks - Tricks won by challenging team
     * @returns {Promise<GameRound>} Updated round instance
     */
    async completeRound(declaringTeamTricks, challengingTeamTricks) {
        try {
            const updateData = {
                declaring_team_tricks_won: declaringTeamTricks,
                challenging_team_tricks_won: challengingTeamTricks,
                round_completed_at: new Date().toISOString()
            };

            const updatedRound = await this.updateById(this.round_id, updateData);

            if (updatedRound) {
                this.declaring_team_tricks_won = declaringTeamTricks;
                this.challenging_team_tricks_won = challengingTeamTricks;
                this.round_completed_at = updateData.round_completed_at;
                console.log(`[GameRound] Completed round ${this.round_number} - Declaring: ${declaringTeamTricks}, Challenging: ${challengingTeamTricks}`);
            }

            return this;
        } catch (error) {
            console.error('[GameRound] CompleteRound error:', error);
            throw error;
        }
    }

    /**
     * Check if round is completed
     * @returns {boolean} True if round is completed
     */
    isCompleted() {
        return this.round_completed_at !== null;
    }

    /**
     * Get round duration in milliseconds
     * @returns {number|null} Duration in milliseconds or null if not completed
     */
    getDuration() {
        if (!this.round_completed_at || !this.created_at) {
            return null;
        }

        const startTime = new Date(this.created_at).getTime();
        const endTime = new Date(this.round_completed_at).getTime();
        return endTime - startTime;
    }

    // Reactive query methods
    static subscribeToRound(subscriptionId, roundId, callback) {
        try {
            const roundModel = new GameRound();
            return roundModel.subscribeById(subscriptionId, roundId, callback);
        } catch (error) {
            console.error('[GameRound] SubscribeToRound error:', error.message);
            throw error;
        }
    }

    static subscribeToGameRounds(subscriptionId, gameId, callback) {
        try {
            const roundModel = new GameRound();
            return roundModel.subscribe(subscriptionId, { game_id: gameId }, callback);
        } catch (error) {
            console.error('[GameRound] SubscribeToGameRounds error:', error.message);
            throw error;
        }
    }

    static subscribeToCurrentRound(subscriptionId, gameId, callback) {
        try {
            const roundModel = new GameRound();
            return roundModel.subscribe(subscriptionId, { 
                game_id: gameId,
                round_completed_at: null
            }, callback);
        } catch (error) {
            console.error('[GameRound] SubscribeToCurrentRound error:', error.message);
            throw error;
        }
    }

    static unsubscribe(subscriptionId) {
        try {
            const roundModel = new GameRound();
            return roundModel.unsubscribe(subscriptionId);
        } catch (error) {
            console.error('[GameRound] Unsubscribe error:', error.message);
            return false;
        }
    }

    // Instance method to subscribe to this round's changes
    subscribeToChanges(subscriptionId, callback) {
        try {
            return this.subscribeById(subscriptionId, this.round_id, callback);
        } catch (error) {
            console.error('[GameRound] SubscribeToChanges error:', error.message);
            throw error;
        }
    }

    /**
     * Convert to API response format
     */
    toApiResponse() {
        return {
            id: this.round_id,
            gameId: this.game_id,
            roundNumber: this.round_number,
            dealerUserId: this.dealer_user_id,
            firstPlayerUserId: this.first_player_user_id,
            trumpSuit: this.trump_suit,
            declaringTeamId: this.declaring_team_id,
            declaringTeamTricksWon: this.declaring_team_tricks_won,
            challengingTeamTricksWon: this.challenging_team_tricks_won,
            isCompleted: this.isCompleted(),
            duration: this.getDuration(),
            createdAt: this.created_at,
            completedAt: this.round_completed_at
        };
    }
}

export default GameRound;