import { v4 as uuidv4 } from 'uuid';
import BaseLokiModel from './BaseLokiModel.js';
import User from './User.js';
import Game from './Game.js';

class Room extends BaseLokiModel {
    constructor(roomData = {}) {
        super('rooms', roomData);
        this.room_id = roomData.room_id || uuidv4();
        this.name = roomData.name;
        this.max_players = roomData.max_players || 4;
        this.owner_id = roomData.owner_id;
        this.status = roomData.status || 'waiting';
        this.is_private = roomData.is_private || false;
        this.invite_code = roomData.invite_code;
        this.room_code = roomData.invite_code; // Use invite_code as room_code
        this.game_state = roomData.game_state || null;
        this.settings = roomData.settings || {
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

    /**
     * Generate a unique 5-digit room code
     * @returns {string} 5-digit room code
     */
    static generateRoomCode() {
        // Generate a 5-digit code using numbers and uppercase letters (excluding confusing characters)
        const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluded I, O for clarity
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Generate a unique room code that doesn't exist in database
     * @returns {Promise<string>} Unique 5-digit room code
     */
    static async generateUniqueRoomCode() {
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            const code = Room.generateRoomCode();
            console.log(`[Room] Generated room code attempt ${attempts + 1}: ${code}`);
            
            // Check if code already exists using LokiJS
            try {
                const roomModel = new Room();
                const existing = await roomModel.findOne({ invite_code: code });
                
                console.log(`[Room] Code ${code} uniqueness check: ${existing ? 'exists' : 'unique'}`);
                
                if (!existing) {
                    console.log(`[Room] Using unique code: ${code}`);
                    return code;
                }
            } catch (error) {
                console.warn('[Room] Error checking room code uniqueness:', error);
                // If database error, return the generated code anyway
                console.log('[Room] Database error, returning generated code');
                return code;
            }
            
            attempts++;
        }
        
        console.error('[Room] Failed to generate unique room code after', maxAttempts, 'attempts');
        throw new Error('Failed to generate unique room code after multiple attempts');
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

            // Generate 5-digit room code for all rooms (not just private ones)
            let roomCode;
            try {
                roomCode = await Room.generateUniqueRoomCode();
            } catch (error) {
                console.warn('[Room] Failed to generate unique room code, using fallback:', error.message);
                // Fallback: generate a code with timestamp to ensure uniqueness
                roomCode = Room.generateRoomCode();
                console.log('[Room] Using fallback room code:', roomCode);
            }

            // Create room data
            const roomModel = new Room();
            const roomDataToCreate = {
                room_id: uuidv4(),
                name: name.trim(),
                max_players: maxPlayers,
                owner_id: ownerId,
                status: 'waiting',
                is_private: !!isPrivate,
                invite_code: roomCode,
                game_state: null,
                settings: {
                    timeLimit: 30,
                    allowSpectators: true,
                    autoStart: false
                },
                version: 1
            };

            console.log('[Room] Creating room with data:', {
                room_id: roomDataToCreate.room_id,
                name: roomDataToCreate.name,
                invite_code: roomDataToCreate.invite_code
            });

            // Insert room into LokiJS
            const createdRoom = await roomModel.create(roomDataToCreate);

            // Add owner as first player
            const roomPlayersModel = new (await import('./RoomPlayer.js')).default();
            await roomPlayersModel.create({
                id: `${createdRoom.room_id}_${ownerId}`,
                room_id: createdRoom.room_id,
                user_id: ownerId,
                is_ready: false,
                team_assignment: null,
                joined_at: new Date().toISOString()
            });

            console.log(`[Room] Created new room: ${createdRoom.name} (${createdRoom.room_id})`);

            // Load and return complete room data
            return await Room.findById(createdRoom.room_id);
        } catch (error) {
            console.error('[Room] Create error:', error.message);
            throw error;
        }
    }

    static async findById(roomId) {
        try {
            const roomModel = new Room();
            const roomData = await roomModel.findById(roomId);

            if (!roomData) {
                return null;
            }

            const room = new Room(roomData);
            await room.loadPlayers();
            return room;
        } catch (error) {
            console.error('[Room] FindById error:', error.message);
            throw error;
        }
    }

    static async findAll(status = null) {
        try {
            const roomModel = new Room();
            let query = {};

            if (status) {
                if (Array.isArray(status)) {
                    query.status = { $in: status };
                } else {
                    query.status = status;
                }
            }

            const roomsData = await roomModel.find(query, { 
                sort: { created_at: -1 } 
            });

            const rooms = [];
            for (const roomData of roomsData) {
                const room = new Room(roomData);
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
            // Find room players for this user
            const roomPlayersModel = new (await import('./RoomPlayer.js')).default();
            const userRoomPlayers = await roomPlayersModel.find({ user_id: userId });

            if (userRoomPlayers.length === 0) {
                return null;
            }

            // Check each room to find active ones
            const roomModel = new Room();
            for (const roomPlayer of userRoomPlayers) {
                const roomData = await roomModel.findById(roomPlayer.room_id);
                if (roomData && ['waiting', 'playing'].includes(roomData.status)) {
                    const room = new Room(roomData);
                    await room.loadPlayers();
                    return room;
                }
            }

            return null;
        } catch (error) {
            console.error('[Room] FindUserActiveRoom error:', error.message);
            throw error;
        }
    }

    static async findByCode(roomCode) {
        try {
            const roomModel = new Room();
            const roomData = await roomModel.findOne({ invite_code: roomCode });

            if (!roomData) {
                return null;
            }

            const room = new Room(roomData);
            await room.loadPlayers();
            return room;
        } catch (error) {
            console.error('[Room] FindByCode error:', error.message);
            throw error;
        }
    }

    async loadPlayers() {
        try {
            // Get room players for this room
            const roomPlayersModel = new (await import('./RoomPlayer.js')).default();
            const roomPlayers = await roomPlayersModel.find({ room_id: this.room_id });

            // Get user information for each player
            const userModel = new User();
            this.players = [];

            for (const roomPlayer of roomPlayers) {
                const user = await userModel.findById(roomPlayer.user_id);
                if (user) {
                    this.players.push({
                        id: roomPlayer.user_id,
                        username: user.username,
                        joinedAt: roomPlayer.joined_at,
                        isReady: roomPlayer.is_ready || false,
                        teamAssignment: roomPlayer.team_assignment || null,
                        isConnected: true // Default to connected for database-loaded players
                    });
                }
            }

            // Sort players by joined time
            this.players.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

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

    async addPlayer(userId, username = null, isBot = false) {
        try {
            // For bots, skip the canJoin check as they're added automatically
            if (!isBot) {
                const canJoin = this.canUserJoin(userId);
                if (!canJoin.canJoin) {
                    throw new Error(canJoin.reason);
                }
            }

            // Add player to room
            const roomPlayersModel = new (await import('./RoomPlayer.js')).default();
            await roomPlayersModel.create({
                id: `${this.room_id}_${userId}`,
                room_id: this.room_id,
                user_id: userId,
                is_ready: isBot, // Bots are ready by default
                team_assignment: null,
                joined_at: new Date().toISOString()
            });

            // Update room version to track state change
            await this.updateById(this.room_id, {
                version: this.version + 1
            });
            this.version += 1;

            // Reload players
            await this.loadPlayers();

            console.log(`[Room] ${isBot ? 'Bot' : 'User'} ${userId} joined room ${this.room_id} (version ${this.version})`);
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

            // Remove player from room
            const roomPlayersModel = new (await import('./RoomPlayer.js')).default();
            await roomPlayersModel.deleteById(`${this.room_id}_${userId}`);

            // If owner left and there are other players, assign new owner
            if (this.owner_id === userId) {
                const remainingPlayers = this.players.filter(p => p.id !== userId && p.isConnected !== false);
                if (remainingPlayers.length > 0) {
                    // Prefer connected players for new host
                    const newHostId = remainingPlayers[0].id;
                    await this.updateById(this.room_id, {
                        owner_id: newHostId,
                        version: this.version + 1
                    });
                    this.owner_id = newHostId;
                    this.version += 1;
                } else {
                    // Increment version even if no new owner
                    await this.updateById(this.room_id, {
                        version: this.version + 1
                    });
                    this.version += 1;
                }
            } else {
                // Increment room version to track state change
                await this.updateById(this.room_id, {
                    version: this.version + 1
                });
                this.version += 1;
            }

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
            const roomPlayersModel = new (await import('./RoomPlayer.js')).default();
            await roomPlayersModel.deleteMany({ room_id: this.room_id });

            // Delete room
            await this.deleteById(this.room_id);

            console.log(`[Room] Deleted room ${this.room_id}`);
        } catch (error) {
            console.error('[Room] Delete error:', error.message);
            throw error;
        }
    }

    async updateStatus(status) {
        try {
            const updatedRoom = await this.updateById(this.room_id, {
                status,
                version: this.version + 1
            });

            if (updatedRoom) {
                this.status = status;
                this.version += 1;
                console.log(`[Room] Updated room ${this.room_id} status to ${status} (version ${this.version})`);
            }
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

    // Reactive query methods
    static subscribeToRoom(subscriptionId, roomId, callback) {
        try {
            const roomModel = new Room();
            return roomModel.subscribeById(subscriptionId, roomId, callback);
        } catch (error) {
            console.error('[Room] SubscribeToRoom error:', error.message);
            throw error;
        }
    }

    static subscribeToRooms(subscriptionId, query, callback) {
        try {
            const roomModel = new Room();
            return roomModel.subscribe(subscriptionId, query, callback);
        } catch (error) {
            console.error('[Room] SubscribeToRooms error:', error.message);
            throw error;
        }
    }

    static subscribeToActiveRooms(subscriptionId, callback) {
        try {
            const roomModel = new Room();
            return roomModel.subscribe(subscriptionId, { 
                status: { $in: ['waiting', 'playing'] }
            }, callback);
        } catch (error) {
            console.error('[Room] SubscribeToActiveRooms error:', error.message);
            throw error;
        }
    }

    static subscribeToRoomsByOwner(subscriptionId, ownerId, callback) {
        try {
            const roomModel = new Room();
            return roomModel.subscribe(subscriptionId, { owner_id: ownerId }, callback);
        } catch (error) {
            console.error('[Room] SubscribeToRoomsByOwner error:', error.message);
            throw error;
        }
    }

    static unsubscribe(subscriptionId) {
        try {
            const roomModel = new Room();
            return roomModel.unsubscribe(subscriptionId);
        } catch (error) {
            console.error('[Room] Unsubscribe error:', error.message);
            return false;
        }
    }

    // Instance method to subscribe to this room's changes
    subscribeToChanges(subscriptionId, callback) {
        try {
            return this.subscribeById(subscriptionId, this.room_id, callback);
        } catch (error) {
            console.error('[Room] SubscribeToChanges error:', error.message);
            throw error;
        }
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
            roomCode: this.invite_code, // Use invite_code as room code
            code: this.invite_code, // Alternative field name
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

            // Update player ready status
            const roomPlayersModel = new (await import('./RoomPlayer.js')).default();
            await roomPlayersModel.updateById(`${this.room_id}_${userId}`, {
                is_ready: isReady
            });

            // Increment room version to track state change
            await this.updateById(this.room_id, {
                version: this.version + 1
            });
            this.version += 1;

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

            // Clear existing team assignments first
            const roomPlayersModel = new (await import('./RoomPlayer.js')).default();
            const allRoomPlayers = await roomPlayersModel.find({ room_id: this.room_id });
            
            // Update team assignments for all players
            const updatePromises = [];
            for (const roomPlayer of allRoomPlayers) {
                let teamAssignment = null;
                
                if (team1Players.some(p => p.id === roomPlayer.user_id)) {
                    teamAssignment = 1;
                } else if (team2Players.some(p => p.id === roomPlayer.user_id)) {
                    teamAssignment = 2;
                }

                updatePromises.push(
                    roomPlayersModel.updateById(roomPlayer.id, {
                        team_assignment: teamAssignment
                    })
                );
            }

            await Promise.all(updatePromises);

            // Increment room version to track state change
            await this.updateById(this.room_id, {
                version: this.version + 1
            });
            this.version += 1;

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
            await this.updateById(this.room_id, {
                version: this.version + 1
            });
            this.version += 1;

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
            await this.updateById(this.room_id, {
                owner_id: newHostId,
                version: this.version + 1
            });
            this.version += 1;

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
            // Reset ready status for all players in database
            const roomPlayersModel = new (await import('./RoomPlayer.js')).default();
            const allRoomPlayers = await roomPlayersModel.find({ room_id: this.room_id });
            
            const updatePromises = allRoomPlayers.map(roomPlayer =>
                roomPlayersModel.updateById(roomPlayer.id, { is_ready: false })
            );
            
            await Promise.all(updatePromises);

            // Increment room version to track state change
            await this.updateById(this.room_id, {
                version: this.version + 1
            });
            this.version += 1;

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
            // Clear team assignments in database
            const roomPlayersModel = new (await import('./RoomPlayer.js')).default();
            const allRoomPlayers = await roomPlayersModel.find({ room_id: this.room_id });
            
            const updatePromises = allRoomPlayers.map(roomPlayer =>
                roomPlayersModel.updateById(roomPlayer.id, { team_assignment: null })
            );
            
            await Promise.all(updatePromises);

            // Increment room version to track state change
            await this.updateById(this.room_id, {
                version: this.version + 1
            });
            this.version += 1;

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
            const now = new Date().toISOString();
            await this.updateById(this.room_id, {
                status: 'playing',
                started_at: now,
                version: this.version + 1
            });
            this.status = 'playing';
            this.started_at = now;
            this.version += 1;

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
            const now = new Date().toISOString();
            await this.updateById(this.room_id, {
                status: 'playing',
                started_at: now,
                version: this.version + 1
            });
            this.status = 'playing';
            this.started_at = now;
            this.version += 1;

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
