import { v4 as uuidv4 } from 'uuid';
import dbConnection from '../database/connection.js';
import User from './User.js';

class Room {
    constructor(roomData = {}) {
        this.room_id = roomData.room_id || uuidv4();
        this.name = roomData.name;
        this.max_players = roomData.max_players || 4;
        this.owner_id = roomData.owner_id;
        this.status = roomData.status || 'waiting';
        this.is_private = roomData.is_private || false;
        this.invite_code = roomData.invite_code;
        this.game_state = roomData.game_state ? JSON.parse(roomData.game_state) : null;
        this.settings = roomData.settings ? JSON.parse(roomData.settings) : {
            timeLimit: 30,
            allowSpectators: true,
            autoStart: false
        };
        this.created_at = roomData.created_at;
        this.updated_at = roomData.updated_at;
        this.started_at = roomData.started_at;
        this.finished_at = roomData.finished_at;
        
        // These will be populated separately
        this.players = [];
        this.owner = null;
    }

    // Static methods for database operations
    static async create(roomData) {
        try {
            const { name, maxPlayers, isPrivate, ownerId } = roomData;
            
            // Validate required fields
            if (!name || !name.trim()) {
                throw new Error('Room name is required');
            }

            if (!ownerId) {
                throw new Error('Owner ID is required');
            }

            if (maxPlayers < 2 || maxPlayers > 6) {
                throw new Error('Max players must be between 2 and 6');
            }

            // Generate invite code for private rooms
            const inviteCode = isPrivate ? Math.random().toString(36).substring(2, 8).toUpperCase() : null;

            // Create room instance
            const room = new Room({
                name: name.trim(),
                max_players: maxPlayers,
                owner_id: ownerId,
                is_private: !!isPrivate,
                invite_code: inviteCode
            });

            // Insert room into database
            await dbConnection.query(`
                INSERT INTO rooms (room_id, name, max_players, owner_id, status, is_private, invite_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [room.room_id, room.name, room.max_players, room.owner_id, room.status, room.is_private, room.invite_code]);

            // Add owner as first player
            await dbConnection.query(`
                INSERT INTO room_players (room_id, user_id, joined_at)
                VALUES (?, ?, NOW())
            `, [room.room_id, ownerId]);

            console.log(`[Room] Created new room: ${room.name} (${room.room_id})`);
            
            // Load and return complete room data
            return await Room.findById(room.room_id);
        } catch (error) {
            console.error('[Room] Create error:', error.message);
            throw error;
        }
    }

    static async findById(roomId) {
        try {
            const rows = await dbConnection.query(`
                SELECT * FROM rooms WHERE room_id = ?
            `, [roomId]);

            if (rows.length === 0) {
                return null;
            }

            const room = new Room(rows[0]);
            await room.loadPlayers();
            return room;
        } catch (error) {
            console.error('[Room] FindById error:', error.message);
            throw error;
        }
    }

    static async findAll(status = null) {
        try {
            let query = 'SELECT * FROM rooms';
            let params = [];

            if (status) {
                if (Array.isArray(status)) {
                    query += ` WHERE status IN (${status.map(() => '?').join(',')})`;
                    params = status;
                } else {
                    query += ' WHERE status = ?';
                    params = [status];
                }
            }

            query += ' ORDER BY created_at DESC';

            const rows = await dbConnection.query(query, params);
            const rooms = [];

            for (const row of rows) {
                const room = new Room(row);
                await room.loadPlayers();
                rooms.push(room);
            }

            return rooms;
        } catch (error) {
            console.error('[Room] FindAll error:', error.message);
            throw error;
        }
    }

    static async findUserActiveRoom(userId) {
        try {
            const rows = await dbConnection.query(`
                SELECT r.* FROM rooms r
                JOIN room_players rp ON r.room_id = rp.room_id
                WHERE rp.user_id = ? AND r.status IN ('waiting', 'playing')
                LIMIT 1
            `, [userId]);

            if (rows.length === 0) {
                return null;
            }

            const room = new Room(rows[0]);
            await room.loadPlayers();
            return room;
        } catch (error) {
            console.error('[Room] FindUserActiveRoom error:', error.message);
            throw error;
        }
    }

    async loadPlayers() {
        try {
            // Try to load with new columns first, fallback to old structure if columns don't exist
            let rows;
            try {
                rows = await dbConnection.query(`
                    SELECT u.user_id, u.username, rp.joined_at, rp.is_ready, rp.team_assignment
                    FROM room_players rp
                    JOIN users u ON rp.user_id = u.user_id
                    WHERE rp.room_id = ?
                    ORDER BY rp.joined_at ASC
                `, [this.room_id]);
            } catch (columnError) {
                // Fallback to old structure if new columns don't exist
                console.log('[Room] New columns not found, using fallback query');
                rows = await dbConnection.query(`
                    SELECT u.user_id, u.username, rp.joined_at
                    FROM room_players rp
                    JOIN users u ON rp.user_id = u.user_id
                    WHERE rp.room_id = ?
                    ORDER BY rp.joined_at ASC
                `, [this.room_id]);
            }

            this.players = rows.map(row => ({
                id: row.user_id,
                username: row.username,
                joinedAt: row.joined_at,
                isReady: !!row.is_ready || false, // Default to false if column doesn't exist
                teamAssignment: row.team_assignment || null
            }));

            // Load owner details
            if (this.owner_id) {
                const owner = await User.findById(this.owner_id);
                if (owner) {
                    this.owner = {
                        id: owner.user_id,
                        username: owner.username
                    };
                }
            }
        } catch (error) {
            console.error('[Room] LoadPlayers error:', error.message);
            throw error;
        }
    }

    async addPlayer(userId) {
        try {
            // Check if user can join
            const canJoin = this.canUserJoin(userId);
            if (!canJoin.canJoin) {
                throw new Error(canJoin.reason);
            }

            // Add player to room
            await dbConnection.query(`
                INSERT INTO room_players (room_id, user_id, joined_at)
                VALUES (?, ?, NOW())
            `, [this.room_id, userId]);

            // Reload players
            await this.loadPlayers();

            console.log(`[Room] User ${userId} joined room ${this.room_id}`);
            return this;
        } catch (error) {
            console.error('[Room] AddPlayer error:', error.message);
            throw error;
        }
    }

    async removePlayer(userId) {
        try {
            // Check if user is in room
            if (!this.players.some(p => p.id === userId)) {
                throw new Error('User is not in this room');
            }

            // Remove player from room
            await dbConnection.query(`
                DELETE FROM room_players WHERE room_id = ? AND user_id = ?
            `, [this.room_id, userId]);

            // If owner left and there are other players, assign new owner
            if (this.owner_id === userId) {
                const remainingPlayers = this.players.filter(p => p.id !== userId);
                if (remainingPlayers.length > 0) {
                    this.owner_id = remainingPlayers[0].id;
                    await dbConnection.query(`
                        UPDATE rooms SET owner_id = ?, updated_at = NOW() WHERE room_id = ?
                    `, [this.owner_id, this.room_id]);
                }
            }

            // Reload players
            await this.loadPlayers();

            console.log(`[Room] User ${userId} left room ${this.room_id}`);
            return this;
        } catch (error) {
            console.error('[Room] RemovePlayer error:', error.message);
            throw error;
        }
    }

    async delete() {
        try {
            // Delete room players first
            await dbConnection.query(`
                DELETE FROM room_players WHERE room_id = ?
            `, [this.room_id]);

            // Delete room
            await dbConnection.query(`
                DELETE FROM rooms WHERE room_id = ?
            `, [this.room_id]);

            console.log(`[Room] Deleted room ${this.room_id}`);
        } catch (error) {
            console.error('[Room] Delete error:', error.message);
            throw error;
        }
    }

    async updateStatus(status) {
        try {
            await dbConnection.query(`
                UPDATE rooms SET status = ?, updated_at = NOW() WHERE room_id = ?
            `, [status, this.room_id]);

            this.status = status;
            console.log(`[Room] Updated room ${this.room_id} status to ${status}`);
        } catch (error) {
            console.error('[Room] UpdateStatus error:', error.message);
            throw error;
        }
    }

    canUserJoin(userId) {
        // Check if room is waiting for players
        if (this.status !== 'waiting') {
            return { canJoin: false, reason: 'Room is not accepting new players' };
        }
        
        // Check if user is already in room - this is now allowed for rejoining
        if (this.players.some(p => p.id === userId)) {
            return { canJoin: true, reason: 'User can rejoin this room' };
        }
        
        // Check if room is full
        if (this.players.length >= this.max_players) {
            return { canJoin: false, reason: 'Room is full' };
        }
        
        return { canJoin: true };
    }

    // Convert to API response format
    toApiResponse() {
        return {
            id: this.room_id,
            name: this.name,
            maxPlayers: this.max_players,
            players: this.players,
            owner: this.owner_id,
            status: this.status,
            isPrivate: this.is_private,
            inviteCode: this.invite_code,
            createdAt: this.created_at,
            gameState: this.game_state,
            settings: this.settings
        };
    }

    async setPlayerReady(userId, isReady) {
        try {
            // Check if user is in room
            if (!this.players.some(p => p.id === userId)) {
                throw new Error('User is not in this room');
            }

            // Try to update ready status, add column if it doesn't exist
            try {
                await dbConnection.query(`
                    UPDATE room_players SET is_ready = ? WHERE room_id = ? AND user_id = ?
                `, [isReady, this.room_id, userId]);
            } catch (columnError) {
                // Add column if it doesn't exist and retry
                console.log('[Room] Adding is_ready column to room_players table');
                await dbConnection.query(`
                    ALTER TABLE room_players ADD COLUMN is_ready BOOLEAN DEFAULT FALSE
                `);
                await dbConnection.query(`
                    UPDATE room_players SET is_ready = ? WHERE room_id = ? AND user_id = ?
                `, [isReady, this.room_id, userId]);
            }

            // Reload players to get updated status
            await this.loadPlayers();

            console.log(`[Room] User ${userId} ready status set to ${isReady} in room ${this.room_id}`);
            return this;
        } catch (error) {
            console.error('[Room] SetPlayerReady error:', error.message);
            throw error;
        }
    }

    async formTeams() {
        try {
            // Only allow team formation if we have 4 players
            if (this.players.length !== 4) {
                throw new Error('Team formation requires exactly 4 players');
            }

            // Shuffle players for random team assignment
            const shuffledPlayers = [...this.players];
            for (let i = shuffledPlayers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
            }

            // Assign teams: first 2 players to team 1, last 2 to team 2
            const team1Players = shuffledPlayers.slice(0, 2);
            const team2Players = shuffledPlayers.slice(2, 4);

            // Try to update team assignments, add column if it doesn't exist
            try {
                // Update team assignments in database
                for (const player of team1Players) {
                    await dbConnection.query(`
                        UPDATE room_players SET team_assignment = 1 WHERE room_id = ? AND user_id = ?
                    `, [this.room_id, player.id]);
                }

                for (const player of team2Players) {
                    await dbConnection.query(`
                        UPDATE room_players SET team_assignment = 2 WHERE room_id = ? AND user_id = ?
                    `, [this.room_id, player.id]);
                }
            } catch (columnError) {
                // Add column if it doesn't exist and retry
                console.log('[Room] Adding team_assignment column to room_players table');
                await dbConnection.query(`
                    ALTER TABLE room_players ADD COLUMN team_assignment INT NULL CHECK (team_assignment IN (1, 2))
                `);
                
                // Retry team assignments
                for (const player of team1Players) {
                    await dbConnection.query(`
                        UPDATE room_players SET team_assignment = 1 WHERE room_id = ? AND user_id = ?
                    `, [this.room_id, player.id]);
                }

                for (const player of team2Players) {
                    await dbConnection.query(`
                        UPDATE room_players SET team_assignment = 2 WHERE room_id = ? AND user_id = ?
                    `, [this.room_id, player.id]);
                }
            }

            // Reload players to get updated team assignments
            await this.loadPlayers();

            console.log(`[Room] Teams formed in room ${this.room_id}`);
            return {
                team1: team1Players.map(p => ({ id: p.id, username: p.username })),
                team2: team2Players.map(p => ({ id: p.id, username: p.username }))
            };
        } catch (error) {
            console.error('[Room] FormTeams error:', error.message);
            throw error;
        }
    }

    getTeams() {
        const team1 = this.players.filter(p => p.teamAssignment === 1);
        const team2 = this.players.filter(p => p.teamAssignment === 2);
        
        return {
            team1: team1.map(p => ({ id: p.id, username: p.username })),
            team2: team2.map(p => ({ id: p.id, username: p.username }))
        };
    }

    canStartGame() {
        // Check if all players are ready and we have at least 2 players
        const readyPlayers = this.players.filter(p => p.isReady);
        return this.players.length >= 2 && readyPlayers.length === this.players.length;
    }

    // Validation methods
    static validateName(name) {
        return name && name.trim().length > 0 && name.trim().length <= 50;
    }

    static validateMaxPlayers(maxPlayers) {
        return maxPlayers >= 2 && maxPlayers <= 6;
    }
}

export default Room;