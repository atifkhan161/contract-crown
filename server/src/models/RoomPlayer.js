import BaseRxDBModel from './BaseRxDBModel.js';

/**
 * RoomPlayer Model
 * Handles room player relationships using RxDB
 */
class RoomPlayer extends BaseRxDBModel {
    constructor(roomPlayerData = {}) {
        super('roomPlayers', roomPlayerData);
        this.id = roomPlayerData.id; // Composite key: room_id_user_id
        this.room_id = roomPlayerData.room_id;
        this.user_id = roomPlayerData.user_id;
        this.is_ready = roomPlayerData.is_ready || false;
        this.team_assignment = roomPlayerData.team_assignment || null;
        this.joined_at = roomPlayerData.joined_at;
    }

    /**
     * Find room players by room ID
     * @param {string} roomId - Room ID
     * @returns {Promise<Array>} Array of room players
     */
    static async findByRoomId(roomId) {
        try {
            const roomPlayerModel = new RoomPlayer();
            const roomPlayers = await roomPlayerModel.find({ room_id: roomId });
            return roomPlayers.map(playerData => new RoomPlayer(playerData));
        } catch (error) {
            console.error('[RoomPlayer] FindByRoomId error:', error.message);
            throw error;
        }
    }

    /**
     * Find room players by user ID
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Array of room players
     */
    static async findByUserId(userId) {
        try {
            const roomPlayerModel = new RoomPlayer();
            const roomPlayers = await roomPlayerModel.find({ user_id: userId });
            return roomPlayers.map(playerData => new RoomPlayer(playerData));
        } catch (error) {
            console.error('[RoomPlayer] FindByUserId error:', error.message);
            throw error;
        }
    }

    /**
     * Find room player by room and user ID
     * @param {string} roomId - Room ID
     * @param {string} userId - User ID
     * @returns {Promise<RoomPlayer|null>} Room player or null if not found
     */
    static async findByRoomAndUser(roomId, userId) {
        try {
            const roomPlayerModel = new RoomPlayer();
            const playerData = await roomPlayerModel.findById(`${roomId}_${userId}`);

            if (!playerData) {
                return null;
            }

            return new RoomPlayer(playerData);
        } catch (error) {
            console.error('[RoomPlayer] FindByRoomAndUser error:', error.message);
            throw error;
        }
    }

    /**
     * Update player ready status
     * @param {boolean} isReady - Ready status
     * @returns {Promise<RoomPlayer>} Updated room player instance
     */
    async updateReadyStatus(isReady) {
        try {
            const updatedPlayer = await this.updateById(this.id, {
                is_ready: isReady
            });

            if (updatedPlayer) {
                this.is_ready = isReady;
                console.log(`[RoomPlayer] Updated player ${this.user_id} ready status to ${isReady}`);
            }

            return this;
        } catch (error) {
            console.error('[RoomPlayer] UpdateReadyStatus error:', error.message);
            throw error;
        }
    }

    /**
     * Update team assignment
     * @param {number|null} teamAssignment - Team assignment (1, 2, or null)
     * @returns {Promise<RoomPlayer>} Updated room player instance
     */
    async updateTeamAssignment(teamAssignment) {
        try {
            const updatedPlayer = await this.updateById(this.id, {
                team_assignment: teamAssignment
            });

            if (updatedPlayer) {
                this.team_assignment = teamAssignment;
                console.log(`[RoomPlayer] Updated player ${this.user_id} team assignment to ${teamAssignment}`);
            }

            return this;
        } catch (error) {
            console.error('[RoomPlayer] UpdateTeamAssignment error:', error.message);
            throw error;
        }
    }
}

export default RoomPlayer;