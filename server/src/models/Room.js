import { v4 as uuidv4 } from 'uuid';
import dbConnection from '../../database/connection.js';
import User from './User.js';
import Game from './Game.js';

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
        this.version = roomData.version || 1;

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
            try {
                await dbConnection.query(`
                    INSERT INTO rooms (room_id, name, max_players, owner_id, status, is_private, invite_code, version, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                `, [room.room_id, room.name, room.max_players, room.owner_id, room.status, room.is_private, room.invite_code, room.version]);
            } catch (columnError) {
                // Add version column if it doesn't exist and retry
                console.log('[Room] Adding version column to rooms table');
                await dbConnection.query(`
                    ALTER TABLE rooms ADD COLUMN version INT DEFAULT 1
                `);
                await dbConnection.query(`
                    INSERT INTO rooms (room_id, name, max_players, owner_id, status, is_private, invite_code, version, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                `, [room.room_id, room.name, room.max_players, room.owner_id, room.status, room.is_private, room.invite_code, room.version]);
            }

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
                teamAssignment: row.team_assignment || null,
                isConnected: true // Default to connected for database-loaded players
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
            const player = this.players.find(p => p.id === userId);
            if (!player) {
                throw new Error('User is not in this room');
            }

            // Use transaction for atomic update
            await dbConnection.transaction(async (connection) => {
                // Remove player from room
                await connection.execute(`
                    DELETE FROM room_players WHERE room_id = ? AND user_id = ?
                `, [this.room_id, userId]);

                // If owner left and there are other players, assign new owner
                if (this.owner_id === userId) {
                    const remainingPlayers = this.players.filter(p => p.id !== userId && p.isConnected !== false);
                    if (remainingPlayers.length > 0) {
                        // Prefer connected players for new host
                        const newHostId = remainingPlayers[0].id;
                        await connection.execute(`
                            UPDATE rooms SET owner_id = ?, updated_at = NOW() WHERE room_id = ?
                        `, [newHostId, this.room_id]);
                        this.owner_id = newHostId;
                    }
                }

                // Increment room version to track state change
                await this.incrementVersion();
            });

            // Remove player from in-memory data
            this.players = this.players.filter(p => p.id !== userId);

            console.log(`[Room] User ${userId} left room ${this.room_id} (version ${this.version})`);
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
            await this.updateWithVersionControl({ status });
            console.log(`[Room] Updated room ${this.room_id} status to ${status}`);
        } catch (error) {
            console.error('[Room] UpdateStatus error:', error.message);
            throw error;
        }
    }

    /**
     * Update room with optimistic concurrency control
     * @param {Object} updates - Fields to update
     * @param {number} expectedVersion - Expected current version (optional)
     * @returns {Promise<Room>} Updated room instance
     */
    async updateWithVersionControl(updates, expectedVersion = null) {
        try {
            const currentVersion = expectedVersion || this.version;
            const newVersion = currentVersion + 1;
            
            // Build update query dynamically
            const updateFields = [];
            const updateValues = [];
            
            for (const [field, value] of Object.entries(updates)) {
                if (field !== 'version') {
                    updateFields.push(`${field} = ?`);
                    updateValues.push(value);
                }
            }
            
            if (updateFields.length === 0) {
                throw new Error('No fields to update');
            }
            
            // Add version and timestamp updates
            updateFields.push('version = ?', 'updated_at = NOW()');
            updateValues.push(newVersion, this.room_id, currentVersion);
            
            const query = `
                UPDATE rooms 
                SET ${updateFields.join(', ')} 
                WHERE room_id = ? AND version = ?
            `;
            
            const result = await dbConnection.query(query, updateValues);
            
            if (result.affectedRows === 0) {
                // Version mismatch - room was updated by another process
                const currentRoom = await Room.findById(this.room_id);
                throw new Error(`Optimistic concurrency conflict. Expected version ${currentVersion}, current version is ${currentRoom ? currentRoom.version : 'unknown'}`);
            }
            
            // Update local instance
            Object.assign(this, updates);
            this.version = newVersion;
            this.updated_at = new Date();
            
            return this;
            
        } catch (error) {
            console.error('[Room] UpdateWithVersionControl error:', error.message);
            throw error;
        }
    }

    /**
     * Increment version without other changes (for state synchronization)
     */
    async incrementVersion() {
        try {
            const newVersion = this.version + 1;
            
            const result = await dbConnection.query(`
                UPDATE rooms 
                SET version = ?, updated_at = NOW() 
                WHERE room_id = ? AND version = ?
            `, [newVersion, this.room_id, this.version]);
            
            if (result.affectedRows === 0) {
                throw new Error(`Version increment failed - concurrent update detected`);
            }
            
            this.version = newVersion;
            this.updated_at = new Date();
            
            return this;
            
        } catch (error) {
            console.error('[Room] IncrementVersion error:', error.message);
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
        const gameStartInfo = this.getGameStartEligibility();
        const teams = this.getTeams();

        return {
            id: this.room_id,
            name: this.name,
            maxPlayers: this.max_players,
            players: this.players.map(p => ({
                id: p.id,
                username: p.username,
                isReady: p.isReady,
                teamAssignment: p.teamAssignment,
                isConnected: p.isConnected,
                joinedAt: p.joinedAt
            })),
            owner: this.owner_id,
            status: this.status,
            isPrivate: this.is_private,
            inviteCode: this.invite_code,
            createdAt: this.created_at,
            updatedAt: this.updated_at,
            startedAt: this.started_at,
            gameState: this.game_state,
            settings: this.settings,
            teams,
            gameStartInfo,
            version: this.version,
            connectedPlayersCount: this.getConnectedPlayersCount(),
            readyPlayersCount: this.getReadyPlayersCount()
        };
    }

    async setPlayerReady(userId, isReady) {
        try {
            // Check if user is in room
            const player = this.players.find(p => p.id === userId);
            if (!player) {
                throw new Error('User is not in this room');
            }

            // Check if player is connected
            if (player.isConnected === false) {
                throw new Error('Cannot set ready status for disconnected player');
            }

            // Validate ready status value
            if (typeof isReady !== 'boolean') {
                throw new Error('Ready status must be a boolean value');
            }

            // Use transaction for atomic update with version control
            await dbConnection.transaction(async (connection) => {
                // Try to update ready status, add column if it doesn't exist
                try {
                    const result = await connection.execute(`
                        UPDATE room_players SET is_ready = ? WHERE room_id = ? AND user_id = ?
                    `, [isReady, this.room_id, userId]);

                    if (result.affectedRows === 0) {
                        throw new Error('Player not found in database');
                    }
                } catch (columnError) {
                    // Add column if it doesn't exist and retry
                    console.log('[Room] Adding is_ready column to room_players table');
                    await connection.execute(`
                        ALTER TABLE room_players ADD COLUMN is_ready BOOLEAN DEFAULT FALSE
                    `);
                    await connection.execute(`
                        UPDATE room_players SET is_ready = ? WHERE room_id = ? AND user_id = ?
                    `, [isReady, this.room_id, userId]);
                }

                // Increment room version to track state change
                await this.incrementVersion();
            });

            // Update in-memory player data
            player.isReady = isReady;
            player.lastReadyUpdate = new Date();

            console.log(`[Room] User ${userId} ready status set to ${isReady} in room ${this.room_id} (version ${this.version})`);
            return this;
        } catch (error) {
            console.error('[Room] SetPlayerReady error:', error.message);
            throw error;
        }
    }

    async formTeams() {
        try {
            // Only allow team formation if we have connected players
            const connectedPlayers = this.players.filter(p => p.isConnected !== false);
            
            if (connectedPlayers.length < 2) {
                throw new Error('Team formation requires at least 2 connected players');
            }

            if (connectedPlayers.length > 4) {
                throw new Error('Team formation supports maximum 4 players');
            }

            // For 4 players, create 2 teams of 2
            // For 2-3 players, create teams as evenly as possible
            let team1Players, team2Players;

            if (connectedPlayers.length === 4) {
                // Shuffle players for random team assignment
                const shuffledPlayers = [...connectedPlayers];
                for (let i = shuffledPlayers.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
                }

                // Assign teams: first 2 players to team 1, last 2 to team 2
                team1Players = shuffledPlayers.slice(0, 2);
                team2Players = shuffledPlayers.slice(2, 4);
            } else if (connectedPlayers.length === 3) {
                // For 3 players: 2 vs 1
                const shuffledPlayers = [...connectedPlayers];
                for (let i = shuffledPlayers.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
                }
                team1Players = shuffledPlayers.slice(0, 2);
                team2Players = shuffledPlayers.slice(2, 3);
            } else {
                // For 2 players: 1 vs 1
                team1Players = [connectedPlayers[0]];
                team2Players = [connectedPlayers[1]];
            }

            // Use transaction for atomic update with version control
            await dbConnection.transaction(async (connection) => {
                // Clear existing team assignments first
                await connection.execute(`
                    UPDATE room_players SET team_assignment = NULL WHERE room_id = ?
                `, [this.room_id]);

                // Try to update team assignments, add column if it doesn't exist
                try {
                    // Update team assignments in database
                    for (const player of team1Players) {
                        await connection.execute(`
                            UPDATE room_players SET team_assignment = 1 WHERE room_id = ? AND user_id = ?
                        `, [this.room_id, player.id]);
                    }

                    for (const player of team2Players) {
                        await connection.execute(`
                            UPDATE room_players SET team_assignment = 2 WHERE room_id = ? AND user_id = ?
                        `, [this.room_id, player.id]);
                    }
                } catch (columnError) {
                    // Add column if it doesn't exist and retry
                    console.log('[Room] Adding team_assignment column to room_players table');
                    await connection.execute(`
                        ALTER TABLE room_players ADD COLUMN team_assignment INT NULL CHECK (team_assignment IN (1, 2))
                    `);

                    // Retry team assignments
                    for (const player of team1Players) {
                        await connection.execute(`
                            UPDATE room_players SET team_assignment = 1 WHERE room_id = ? AND user_id = ?
                        `, [this.room_id, player.id]);
                    }

                    for (const player of team2Players) {
                        await connection.execute(`
                            UPDATE room_players SET team_assignment = 2 WHERE room_id = ? AND user_id = ?
                        `, [this.room_id, player.id]);
                    }
                }

                // Increment room version to track state change
                await this.incrementVersion();
            });

            // Update in-memory player data
            this.players.forEach(player => {
                if (team1Players.some(p => p.id === player.id)) {
                    player.teamAssignment = 1;
                } else if (team2Players.some(p => p.id === player.id)) {
                    player.teamAssignment = 2;
                } else {
                    player.teamAssignment = null;
                }
            });

            const result = {
                team1: team1Players.map(p => ({ id: p.id, username: p.username })),
                team2: team2Players.map(p => ({ id: p.id, username: p.username }))
            };

            console.log(`[Room] Teams formed in room ${this.room_id} (version ${this.version}): Team1(${result.team1.length}), Team2(${result.team2.length})`);
            return result;
        } catch (error) {
            console.error('[Room] FormTeams error:', error.message);
            throw error;
        }
    }

    getTeams() {
        const team1 = this.players.filter(p => p.teamAssignment === 1);
        const team2 = this.players.filter(p => p.teamAssignment === 2);

        return {
            team1: team1.map(p => ({ id: p.id, username: p.username, isConnected: p.isConnected })),
            team2: team2.map(p => ({ id: p.id, username: p.username, isConnected: p.isConnected }))
        };
    }

    /**
     * Check if teams are formed
     * @returns {boolean} True if teams are formed
     */
    areTeamsFormed() {
        const playersWithTeams = this.players.filter(p => p.teamAssignment !== null);
        const connectedPlayers = this.players.filter(p => p.isConnected !== false);
        return playersWithTeams.length === connectedPlayers.length && connectedPlayers.length >= 2;
    }

    /**
     * Get team balance information
     * @returns {Object} Team balance details
     */
    getTeamBalance() {
        const teams = this.getTeams();
        const connectedTeam1 = teams.team1.filter(p => p.isConnected !== false);
        const connectedTeam2 = teams.team2.filter(p => p.isConnected !== false);

        return {
            team1Count: connectedTeam1.length,
            team2Count: connectedTeam2.length,
            isBalanced: Math.abs(connectedTeam1.length - connectedTeam2.length) <= 1,
            totalAssigned: connectedTeam1.length + connectedTeam2.length
        };
    }

    canStartGame() {
        // Check if all connected players are ready and we have at least 2 connected players
        const connectedPlayers = this.players.filter(p => p.isConnected !== false);
        const readyConnectedPlayers = connectedPlayers.filter(p => p.isReady);
        return connectedPlayers.length >= 2 && readyConnectedPlayers.length === connectedPlayers.length;
    }

    /**
     * Get detailed game start eligibility information
     * @returns {Object} Game start eligibility details
     */
    getGameStartEligibility() {
        const connectedPlayers = this.players.filter(p => p.isConnected !== false);
        const readyPlayers = connectedPlayers.filter(p => p.isReady);
        const readyCount = readyPlayers.length;
        const allConnectedReady = connectedPlayers.every(p => p.isReady) && connectedPlayers.length >= 2;

        let canStartGame = false;
        let reason = '';

        if (this.status !== 'waiting') {
            reason = 'Room is not in waiting status';
        } else if (connectedPlayers.length < 2) {
            reason = 'Need at least 2 connected players';
        } else if (!allConnectedReady) {
            reason = `${readyCount}/${connectedPlayers.length} players ready`;
        } else if (connectedPlayers.length === 4) {
            // For 4-player games, teams will be formed automatically on start
            canStartGame = true;
            reason = 'Ready to start!';
        } else {
            canStartGame = true;
            reason = 'Ready to start!';
        }

        return {
            canStartGame,
            reason,
            readyCount,
            totalConnected: connectedPlayers.length,
            totalPlayers: this.players.length,
            allReady: allConnectedReady,
            connectedPlayers: connectedPlayers.map(p => ({
                id: p.id,
                username: p.username,
                isReady: p.isReady
            }))
        };
    }

    /**
     * Set player connection status
     * @param {string} userId - User ID
     * @param {boolean} isConnected - Connection status
     * @returns {Promise<Room>} Updated room instance
     */
    async setPlayerConnectionStatus(userId, isConnected) {
        try {
            // Find player in memory
            const player = this.players.find(p => p.id === userId);
            if (!player) {
                throw new Error('Player not found in room');
            }

            // Update connection status
            player.isConnected = isConnected;
            player.lastConnectionUpdate = new Date();

            // Increment version to track state change
            await this.incrementVersion();

            console.log(`[Room] Player ${userId} connection status set to ${isConnected} in room ${this.room_id} (version ${this.version})`);
            return this;
        } catch (error) {
            console.error('[Room] SetPlayerConnectionStatus error:', error.message);
            throw error;
        }
    }

    /**
     * Get connected players count
     * @returns {number} Number of connected players
     */
    getConnectedPlayersCount() {
        return this.players.filter(p => p.isConnected !== false).length;
    }

    /**
     * Get ready players count
     * @returns {number} Number of ready players
     */
    getReadyPlayersCount() {
        const connectedPlayers = this.players.filter(p => p.isConnected !== false);
        return connectedPlayers.filter(p => p.isReady).length;
    }

    /**
     * Check if player is host
     * @param {string} userId - User ID to check
     * @returns {boolean} True if player is host
     */
    isPlayerHost(userId) {
        return String(this.owner_id) === String(userId);
    }

    /**
     * Transfer host privileges to another player
     * @param {string} newHostId - New host user ID
     * @returns {Promise<Room>} Updated room instance
     */
    async transferHost(newHostId) {
        try {
            // Validate new host is in room
            if (!this.players.some(p => p.id === newHostId)) {
                throw new Error('New host must be a player in the room');
            }

            // Update host in database
            await this.updateWithVersionControl({ owner_id: newHostId });

            console.log(`[Room] Host transferred from ${this.owner_id} to ${newHostId} in room ${this.room_id}`);
            return this;
        } catch (error) {
            console.error('[Room] TransferHost error:', error.message);
            throw error;
        }
    }

    /**
     * Reset all player ready statuses
     * @returns {Promise<Room>} Updated room instance
     */
    async resetAllPlayerReadyStatus() {
        try {
            // Use transaction for atomic update
            await dbConnection.transaction(async (connection) => {
                // Reset ready status for all players in database
                await connection.execute(`
                    UPDATE room_players SET is_ready = FALSE WHERE room_id = ?
                `, [this.room_id]);

                // Increment room version to track state change
                await this.incrementVersion();
            });

            // Update in-memory player data
            this.players.forEach(player => {
                player.isReady = false;
            });

            console.log(`[Room] All player ready statuses reset in room ${this.room_id} (version ${this.version})`);
            return this;
        } catch (error) {
            console.error('[Room] ResetAllPlayerReadyStatus error:', error.message);
            throw error;
        }
    }

    /**
     * Clear team assignments for all players
     * @returns {Promise<Room>} Updated room instance
     */
    async clearTeamAssignments() {
        try {
            // Use transaction for atomic update
            await dbConnection.transaction(async (connection) => {
                // Clear team assignments in database
                await connection.execute(`
                    UPDATE room_players SET team_assignment = NULL WHERE room_id = ?
                `, [this.room_id]);

                // Increment room version to track state change
                await this.incrementVersion();
            });

            // Update in-memory player data
            this.players.forEach(player => {
                player.teamAssignment = null;
            });

            console.log(`[Room] Team assignments cleared in room ${this.room_id} (version ${this.version})`);
            return this;
        } catch (error) {
            console.error('[Room] ClearTeamAssignments error:', error.message);
            throw error;
        }
    }

    /**
     * Get room state for waiting room UI
     * @returns {Object} Waiting room state
     */
    getWaitingRoomState() {
        const gameStartInfo = this.getGameStartEligibility();
        const teams = this.getTeams();
        const teamBalance = this.getTeamBalance();

        return {
            roomId: this.room_id,
            name: this.name,
            status: this.status,
            hostId: this.owner_id,
            maxPlayers: this.max_players,
            players: this.players.map(p => ({
                id: p.id,
                username: p.username,
                isReady: p.isReady,
                teamAssignment: p.teamAssignment,
                isConnected: p.isConnected,
                joinedAt: p.joinedAt
            })),
            teams,
            teamBalance,
            gameStartInfo,
            version: this.version,
            createdAt: this.created_at,
            updatedAt: this.updated_at
        };
    }

    /**
     * Validate room state for game start
     * @returns {Object} Validation result
     */
    validateGameStart() {
        const errors = [];
        const warnings = [];

        // Check room status
        if (this.status !== 'waiting') {
            errors.push('Room must be in waiting status to start game');
        }

        // Check player count and connection
        const connectedPlayers = this.players.filter(p => p.isConnected !== false);
        if (connectedPlayers.length < 2) {
            errors.push('Need at least 2 connected players to start game');
        }

        // Check ready status
        const readyPlayers = connectedPlayers.filter(p => p.isReady);
        if (readyPlayers.length !== connectedPlayers.length) {
            errors.push('All connected players must be ready to start game');
        }

        // Check team formation for 4-player games
        if (connectedPlayers.length === 4) {
            const teamsFormed = this.areTeamsFormed();
            if (!teamsFormed) {
                warnings.push('Teams will be formed automatically when game starts');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            connectedPlayers: connectedPlayers.length,
            readyPlayers: readyPlayers.length
        };
    }

    /**
     * Prepare room for game start
     * @returns {Promise<Object>} Game start preparation result
     */
    async prepareForGameStart() {
        try {
            const validation = this.validateGameStart();
            if (!validation.isValid) {
                throw new Error(`Cannot start game: ${validation.errors.join(', ')}`);
            }

            const connectedPlayers = this.players.filter(p => p.isConnected !== false);
            let teams = null;

            // Form teams if needed
            if (connectedPlayers.length >= 2 && !this.areTeamsFormed()) {
                teams = await this.formTeams();
            } else {
                teams = this.getTeams();
            }

            // Update room status to playing
            await this.updateWithVersionControl({ 
                status: 'playing',
                started_at: new Date()
            });

            return {
                success: true,
                teams,
                players: connectedPlayers.map(p => ({
                    id: p.id,
                    username: p.username,
                    teamAssignment: p.teamAssignment
                })),
                gameStartedAt: this.started_at
            };
        } catch (error) {
            console.error('[Room] PrepareForGameStart error:', error.message);
            throw error;
        }
    }

    /**
     * Create a game from this room with team assignments
     * @returns {Promise<Game>} Created game instance
     */
    async createGame() {
        try {
            const validation = this.validateGameStart();
            if (!validation.isValid) {
                throw new Error(`Cannot create game: ${validation.errors.join(', ')}`);
            }

            const connectedPlayers = this.players.filter(p => p.isConnected !== false);
            
            // Form teams if needed
            let teams = null;
            if (!this.areTeamsFormed()) {
                teams = await this.formTeams();
            } else {
                teams = this.getTeams();
            }

            // Prepare game data
            const gameData = {
                roomId: this.room_id,
                hostId: this.owner_id,
                players: connectedPlayers,
                teams: {
                    team1: teams.team1,
                    team2: teams.team2
                }
            };

            // Create game in database
            const game = await Game.createFromRoom(gameData);

            // Update room status to playing
            await this.updateWithVersionControl({ 
                status: 'playing',
                started_at: new Date()
            });

            console.log(`[Room] Created game ${game.game_code} from room ${this.room_id}`);

            return game;
        } catch (error) {
            console.error('[Room] CreateGame error:', error.message);
            throw error;
        }
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