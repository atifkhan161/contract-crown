import { v4 as uuidv4 } from 'uuid';
import dbConnection from '../../database/connection.js';

/**
 * Game Model
 * Handles game creation and management in the database
 */
class Game {
    constructor(gameData = {}) {
        this.game_id = gameData.game_id || uuidv4();
        this.game_code = gameData.game_code;
        this.status = gameData.status || 'waiting';
        this.host_id = gameData.host_id;
        this.created_at = gameData.created_at;
        this.started_at = gameData.started_at;
        this.completed_at = gameData.completed_at;
        this.winning_team_id = gameData.winning_team_id;
        this.target_score = gameData.target_score || 52;
        
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
            const game = new Game({
                game_code: gameCode,
                status: 'in_progress',
                host_id: hostId
            });

            // Use transaction to ensure atomicity
            await dbConnection.transaction(async (connection) => {
                // Insert game record
                await connection.execute(`
                    INSERT INTO games (game_id, game_code, status, host_id, started_at, target_score, created_at)
                    VALUES (?, ?, ?, ?, NOW(), ?, NOW())
                `, [game.game_id, game.game_code, game.status, game.host_id, game.target_score]);

                // Create team 1
                const team1Id = uuidv4();
                const team1Player1 = teams.team1[0];
                const team1Player2 = teams.team1[1] || null;

                await connection.execute(`
                    INSERT INTO teams (team_id, game_id, team_number, current_score, player1_id, player2_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [team1Id, game.game_id, 1, 0, team1Player1.id, team1Player2?.id]);

                // Create team 2
                const team2Id = uuidv4();
                const team2Player1 = teams.team2[0];
                const team2Player2 = teams.team2[1] || null;

                await connection.execute(`
                    INSERT INTO teams (team_id, game_id, team_number, current_score, player1_id, player2_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [team2Id, game.game_id, 2, 0, team2Player1.id, team2Player2?.id]);

                // Create game_players entries for all players
                for (const player of [...teams.team1, ...teams.team2]) {
                    const teamId = teams.team1.some(p => p.id === player.id) ? team1Id : team2Id;
                    const seatPosition = teams.team1.some(p => p.id === player.id) 
                        ? teams.team1.findIndex(p => p.id === player.id) + 1
                        : teams.team2.findIndex(p => p.id === player.id) + 3;

                    await connection.execute(`
                        INSERT INTO game_players (game_id, user_id, team_id, seat_position, joined_at)
                        VALUES (?, ?, ?, ?, NOW())
                    `, [game.game_id, player.id, teamId, seatPosition]);
                }
            });

            console.log(`[Game] Created game ${game.game_code} (${game.game_id}) from room ${roomId}`);

            // Load complete game data
            return await Game.findById(game.game_id);
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
            const existing = await dbConnection.query(`
                SELECT game_id FROM games WHERE game_code = ?
            `, [code]);

            if (existing.length === 0) {
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
            const rows = await dbConnection.query(`
                SELECT * FROM games WHERE game_id = ?
            `, [gameId]);

            if (rows.length === 0) {
                return null;
            }

            const game = new Game(rows[0]);
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
            const rows = await dbConnection.query(`
                SELECT * FROM games WHERE game_code = ?
            `, [gameCode]);

            if (rows.length === 0) {
                return null;
            }

            const game = new Game(rows[0]);
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
            const rows = await dbConnection.query(`
                SELECT t.*, u1.username as player1_username, u2.username as player2_username
                FROM teams t
                LEFT JOIN users u1 ON t.player1_id = u1.user_id
                LEFT JOIN users u2 ON t.player2_id = u2.user_id
                WHERE t.game_id = ?
                ORDER BY t.team_number
            `, [this.game_id]);

            this.teams = rows.map(row => ({
                team_id: row.team_id,
                team_number: row.team_number,
                current_score: row.current_score,
                players: [
                    row.player1_id ? {
                        id: row.player1_id,
                        username: row.player1_username
                    } : null,
                    row.player2_id ? {
                        id: row.player2_id,
                        username: row.player2_username
                    } : null
                ].filter(Boolean)
            }));
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
            const rows = await dbConnection.query(`
                SELECT gp.*, u.username, t.team_number
                FROM game_players gp
                JOIN users u ON gp.user_id = u.user_id
                LEFT JOIN teams t ON gp.team_id = t.team_id
                WHERE gp.game_id = ?
                ORDER BY gp.seat_position
            `, [this.game_id]);

            this.players = rows.map(row => ({
                user_id: row.user_id,
                username: row.username,
                team_id: row.team_id,
                team_number: row.team_number,
                seat_position: row.seat_position,
                joined_at: row.joined_at
            }));
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

            const updateFields = ['status = ?'];
            const updateValues = [status];

            // Add timestamp fields based on status
            if (status === 'in_progress' && this.status !== 'in_progress') {
                updateFields.push('started_at = NOW()');
            } else if (status === 'completed' && this.status !== 'completed') {
                updateFields.push('completed_at = NOW()');
            }

            updateValues.push(this.game_id);

            await dbConnection.query(`
                UPDATE games SET ${updateFields.join(', ')} WHERE game_id = ?
            `, updateValues);

            this.status = status;
            console.log(`[Game] Updated game ${this.game_code} status to ${status}`);

            return this;
        } catch (error) {
            console.error('[Game] UpdateStatus error:', error);
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
            teams: this.teams,
            players: this.players
        };
    }
}

export default Game;