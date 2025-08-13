import { v4 as uuidv4 } from 'uuid';
import BaseLokiModel from './BaseLokiModel.js';

/**
 * Game Model
 * Handles game creation and management in the database using LokiJS
 */
class Game extends BaseLokiModel {
    constructor(gameData = {}) {
        super('games', gameData);
        this.game_id = gameData.game_id || uuidv4();
        this.game_code = gameData.game_code;
        this.status = gameData.status || 'waiting';
        this.host_id = gameData.host_id;
        this.created_at = gameData.created_at;
        this.started_at = gameData.started_at;
        this.completed_at = gameData.completed_at;
        this.winning_team_id = gameData.winning_team_id;
        this.target_score = gameData.target_score || 52;
        this.is_demo_mode = gameData.is_demo_mode || false;
        
        // These will be populated separately
        this.teams = [];
        this.players = [];
    }

    /**
     * Create a new game from a room
     * @param {Object} roomData - Room data containing players and teams
     * @returns {Promise<Game>} Created game instance
     */
    static async createFromRoom(roomData) {
        try {
            const { roomId, hostId, players, teams } = roomData;

            if (!roomId || !hostId || !players || !teams) {
                throw new Error('Missing required room data for game creation');
            }

            if (!teams.team1 || !teams.team2) {
                throw new Error('Both teams must be defined');
            }

            if (teams.team1.length === 0 || teams.team2.length === 0) {
                throw new Error('Both teams must have at least one player');
            }

            // Generate unique game code
            const gameCode = await Game.generateUniqueGameCode();

            // Create game instance
            const gameModel = new Game();
            const gameData = {
                game_id: uuidv4(),
                game_code: gameCode,
                status: 'in_progress',
                host_id: hostId,
                started_at: new Date().toISOString(),
                target_score: 52,
                is_demo_mode: false
            };

            // Create game document
            const createdGame = await gameModel.create(gameData);

            // Create teams
            const teamsModel = new (await import('./Team.js')).default();
            const team1Id = uuidv4();
            const team1Player1 = teams.team1[0];
            const team1Player2 = teams.team1[1] || null;

            await teamsModel.create({
                team_id: team1Id,
                game_id: createdGame.game_id,
                team_number: 1,
                current_score: 0,
                player1_id: team1Player1.id,
                player2_id: team1Player2?.id || null
            });

            const team2Id = uuidv4();
            const team2Player1 = teams.team2[0];
            const team2Player2 = teams.team2[1] || null;

            await teamsModel.create({
                team_id: team2Id,
                game_id: createdGame.game_id,
                team_number: 2,
                current_score: 0,
                player1_id: team2Player1.id,
                player2_id: team2Player2?.id || null
            });

            // Create game_players entries for all players
            const gamePlayersModel = new (await import('./GamePlayer.js')).default();
            const gamePlayerPromises = [];

            for (const player of [...teams.team1, ...teams.team2]) {
                const teamId = teams.team1.some(p => p.id === player.id) ? team1Id : team2Id;
                const seatPosition = teams.team1.some(p => p.id === player.id) 
                    ? teams.team1.findIndex(p => p.id === player.id) + 1
                    : teams.team2.findIndex(p => p.id === player.id) + 3;

                gamePlayerPromises.push(gamePlayersModel.create({
                    game_player_id: uuidv4(),
                    game_id: createdGame.game_id,
                    user_id: player.id,
                    team_id: teamId,
                    seat_position: seatPosition,
                    joined_at: new Date().toISOString(),
                    is_ready: false,
                    is_host: player.id === hostId,
                    tricks_won_current_round: 0
                }));
            }

            await Promise.all(gamePlayerPromises);

            console.log(`[Game] Created game ${gameCode} (${createdGame.game_id}) from room ${roomId}`);

            // Load complete game data
            return await Game.findById(createdGame.game_id);
        } catch (error) {
            console.error('[Game] Error creating game from room:', error);
            throw error;
        }
    }

    /**
     * Generate a unique game code
     * @returns {Promise<string>} Unique game code
     */
    static async generateUniqueGameCode() {
        const maxAttempts = 10;
        let attempts = 0;

        while (attempts < maxAttempts) {
            // Generate 6-character alphanumeric code
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            // Check if code already exists
            const gameModel = new Game();
            const existing = await gameModel.findOne({ game_code: code });

            if (!existing) {
                return code;
            }

            attempts++;
        }

        throw new Error('Failed to generate unique game code after maximum attempts');
    }

    /**
     * Find game by ID
     * @param {string} gameId - Game ID
     * @returns {Promise<Game|null>} Game instance or null if not found
     */
    static async findById(gameId) {
        try {
            const gameModel = new Game();
            const gameData = await gameModel.findById(gameId);

            if (!gameData) {
                return null;
            }

            const game = new Game(gameData);
            await game.loadTeams();
            await game.loadPlayers();
            return game;
        } catch (error) {
            console.error('[Game] FindById error:', error);
            throw error;
        }
    }

    /**
     * Find game by code
     * @param {string} gameCode - Game code
     * @returns {Promise<Game|null>} Game instance or null if not found
     */
    static async findByCode(gameCode) {
        try {
            const gameModel = new Game();
            const gameData = await gameModel.findOne({ game_code: gameCode });

            if (!gameData) {
                return null;
            }

            const game = new Game(gameData);
            await game.loadTeams();
            await game.loadPlayers();
            return game;
        } catch (error) {
            console.error('[Game] FindByCode error:', error);
            throw error;
        }
    }

    /**
     * Load teams for this game
     */
    async loadTeams() {
        try {
            // Get teams for this game
            const teamsModel = new (await import('./Team.js')).default();
            const teams = await teamsModel.find({ game_id: this.game_id });

            // Get user information for team players
            const userModel = new (await import('./User.js')).default();
            
            this.teams = [];
            for (const team of teams) {
                const teamData = {
                    team_id: team.team_id,
                    team_number: team.team_number,
                    current_score: team.current_score,
                    players: []
                };

                // Load player1 info
                if (team.player1_id) {
                    const player1 = await userModel.findById(team.player1_id);
                    if (player1) {
                        teamData.players.push({
                            id: player1.user_id,
                            username: player1.username
                        });
                    }
                }

                // Load player2 info
                if (team.player2_id) {
                    const player2 = await userModel.findById(team.player2_id);
                    if (player2) {
                        teamData.players.push({
                            id: player2.user_id,
                            username: player2.username
                        });
                    }
                }

                this.teams.push(teamData);
            }

            // Sort teams by team number
            this.teams.sort((a, b) => a.team_number - b.team_number);
        } catch (error) {
            console.error('[Game] LoadTeams error:', error);
            throw error;
        }
    }

    /**
     * Load players for this game
     */
    async loadPlayers() {
        try {
            // Get game players for this game
            const gamePlayersModel = new (await import('./GamePlayer.js')).default();
            const gamePlayers = await gamePlayersModel.find({ game_id: this.game_id });

            // Get user and team information
            const userModel = new (await import('./User.js')).default();
            const teamsModel = new (await import('./Team.js')).default();
            
            this.players = [];
            for (const gamePlayer of gamePlayers) {
                const user = await userModel.findById(gamePlayer.user_id);
                let teamNumber = null;
                
                if (gamePlayer.team_id) {
                    const team = await teamsModel.findById(gamePlayer.team_id);
                    if (team) {
                        teamNumber = team.team_number;
                    }
                }

                if (user) {
                    this.players.push({
                        user_id: gamePlayer.user_id,
                        username: user.username,
                        team_id: gamePlayer.team_id,
                        team_number: teamNumber,
                        seat_position: gamePlayer.seat_position,
                        joined_at: gamePlayer.joined_at
                    });
                }
            }

            // Sort players by seat position
            this.players.sort((a, b) => a.seat_position - b.seat_position);
        } catch (error) {
            console.error('[Game] LoadPlayers error:', error);
            throw error;
        }
    }

    /**
     * Update game status
     * @param {string} status - New status
     * @returns {Promise<Game>} Updated game instance
     */
    async updateStatus(status) {
        try {
            const validStatuses = ['waiting', 'in_progress', 'completed', 'cancelled'];
            if (!validStatuses.includes(status)) {
                throw new Error(`Invalid status: ${status}`);
            }

            const updateData = { status };

            // Add timestamp fields based on status
            if (status === 'in_progress' && this.status !== 'in_progress') {
                updateData.started_at = new Date().toISOString();
            } else if (status === 'completed' && this.status !== 'completed') {
                updateData.completed_at = new Date().toISOString();
            }

            const updatedGame = await this.updateById(this.game_id, updateData);

            if (updatedGame) {
                this.status = status;
                if (updateData.started_at) {
                    this.started_at = updateData.started_at;
                }
                if (updateData.completed_at) {
                    this.completed_at = updateData.completed_at;
                }
                console.log(`[Game] Updated game ${this.game_code} status to ${status}`);
            }

            return this;
        } catch (error) {
            console.error('[Game] UpdateStatus error:', error);
            throw error;
        }
    }

    // Reactive query methods
    static subscribeToGame(subscriptionId, gameId, callback) {
        try {
            const gameModel = new Game();
            return gameModel.subscribeById(subscriptionId, gameId, callback);
        } catch (error) {
            console.error('[Game] SubscribeToGame error:', error.message);
            throw error;
        }
    }

    static subscribeToGames(subscriptionId, query, callback) {
        try {
            const gameModel = new Game();
            return gameModel.subscribe(subscriptionId, query, callback);
        } catch (error) {
            console.error('[Game] SubscribeToGames error:', error.message);
            throw error;
        }
    }

    static subscribeToActiveGames(subscriptionId, callback) {
        try {
            const gameModel = new Game();
            return gameModel.subscribe(subscriptionId, { 
                status: { $in: ['waiting', 'in_progress'] }
            }, callback);
        } catch (error) {
            console.error('[Game] SubscribeToActiveGames error:', error.message);
            throw error;
        }
    }

    static subscribeToGamesByHost(subscriptionId, hostId, callback) {
        try {
            const gameModel = new Game();
            return gameModel.subscribe(subscriptionId, { host_id: hostId }, callback);
        } catch (error) {
            console.error('[Game] SubscribeToGamesByHost error:', error.message);
            throw error;
        }
    }

    static unsubscribe(subscriptionId) {
        try {
            const gameModel = new Game();
            return gameModel.unsubscribe(subscriptionId);
        } catch (error) {
            console.error('[Game] Unsubscribe error:', error.message);
            return false;
        }
    }

    // Instance method to subscribe to this game's changes
    subscribeToChanges(subscriptionId, callback) {
        try {
            return this.subscribeById(subscriptionId, this.game_id, callback);
        } catch (error) {
            console.error('[Game] SubscribeToChanges error:', error.message);
            throw error;
        }
    }

    /**
     * Convert to API response format
     */
    toApiResponse() {
        return {
            id: this.game_id,
            code: this.game_code,
            status: this.status,
            hostId: this.host_id,
            createdAt: this.created_at,
            startedAt: this.started_at,
            completedAt: this.completed_at,
            winningTeamId: this.winning_team_id,
            targetScore: this.target_score,
            isDemoMode: this.is_demo_mode,
            teams: this.teams,
            players: this.players
        };
    }
}

export default Game;
