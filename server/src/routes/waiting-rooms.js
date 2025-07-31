import express from 'express';
import Room from '../models/Room.js';
import auth from '../middlewares/auth.js';

const router = express.Router();

/**
 * Waiting Room HTTP API Endpoints
 * Provides HTTP fallback for WebSocket waiting room functionality
 */

// Get waiting room data
router.get('/:roomId', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user is in the room
        const isPlayerInRoom = room.players.some(p => p.id === userId);
        if (!isPlayerInRoom) {
            return res.status(403).json({
                success: false,
                message: 'You are not in this room'
            });
        }

        // Get WebSocket room data if available for real-time status
        let wsRoomData = null;
        if (req.io && req.io.socketManager && req.io.socketManager.gameRooms.has(roomId)) {
            const wsRoom = req.io.socketManager.gameRooms.get(roomId);
            wsRoomData = {
                players: Array.from(wsRoom.players.values()).map(p => ({
                    userId: p.userId,
                    username: p.username,
                    isReady: p.isReady,
                    teamAssignment: p.teamAssignment,
                    isConnected: p.isConnected
                })),
                teams: wsRoom.teams,
                status: wsRoom.status,
                hostId: wsRoom.hostId
            };
        }

        // Calculate game start eligibility
        const connectedPlayers = wsRoomData ? 
            wsRoomData.players.filter(p => p.isConnected) : 
            room.players;
        const readyPlayers = connectedPlayers.filter(p => p.isReady);
        const canStartGame = connectedPlayers.length >= 2 && 
            readyPlayers.length === connectedPlayers.length;

        res.json({
            success: true,
            room: {
                id: room.room_id,
                name: room.name,
                maxPlayers: room.max_players,
                status: room.status,
                hostId: room.owner_id,
                players: wsRoomData ? wsRoomData.players : room.players.map(p => ({
                    userId: p.id,
                    username: p.username,
                    isReady: p.isReady || false,
                    teamAssignment: p.teamAssignment || null,
                    isConnected: true // Assume connected for HTTP requests
                })),
                teams: wsRoomData ? wsRoomData.teams : room.getTeams(),
                canStartGame,
                readyCount: readyPlayers.length,
                connectedCount: connectedPlayers.length,
                createdAt: room.created_at
            },
            websocketAvailable: !!wsRoomData
        });
    } catch (error) {
        console.error('[WaitingRoom API] Error fetching room data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch room data'
        });
    }
});

// Join waiting room (HTTP fallback)
router.post('/:roomId/join', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        const username = req.user.username;

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user can join
        const canJoin = room.canUserJoin(userId);
        if (!canJoin.canJoin && !room.players.some(p => p.id === userId)) {
            return res.status(400).json({
                success: false,
                message: canJoin.reason
            });
        }

        // Add player if not already in room
        if (!room.players.some(p => p.id === userId)) {
            await room.addPlayer(userId);
        }

        // Update WebSocket room if available
        if (req.io && req.io.socketManager && req.io.socketManager.gameRooms.has(roomId)) {
            const wsRoom = req.io.socketManager.gameRooms.get(roomId);
            if (!wsRoom.players.has(userId)) {
                wsRoom.players.set(userId, {
                    userId,
                    username,
                    socketId: null,
                    isReady: false,
                    teamAssignment: null,
                    joinedAt: new Date().toISOString(),
                    isConnected: false // Will be updated when WebSocket connects
                });
            }

            // Broadcast join via WebSocket
            req.io.to(roomId).emit('waiting-room-player-joined-http', {
                roomId,
                player: {
                    userId,
                    username,
                    isReady: false,
                    teamAssignment: null,
                    isConnected: false
                },
                players: Array.from(wsRoom.players.values()),
                playerCount: wsRoom.players.size,
                source: 'http_fallback',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: 'Joined waiting room successfully',
            room: room.toApiResponse(),
            redirectUrl: `/waiting-room.html?roomId=${roomId}`
        });
    } catch (error) {
        console.error('[WaitingRoom API] Error joining room:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to join room'
        });
    }
});

// Leave waiting room (HTTP fallback)
router.post('/:roomId/leave', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Remove player from room
        await room.removePlayer(userId);

        // Update WebSocket room if available
        if (req.io && req.io.socketManager && req.io.socketManager.gameRooms.has(roomId)) {
            const wsRoom = req.io.socketManager.gameRooms.get(roomId);
            wsRoom.players.delete(userId);

            // Remove from teams
            wsRoom.teams.team1 = wsRoom.teams.team1.filter(id => id !== userId);
            wsRoom.teams.team2 = wsRoom.teams.team2.filter(id => id !== userId);

            // Transfer host if needed
            let newHostId = wsRoom.hostId;
            if (String(wsRoom.hostId) === String(userId) && wsRoom.players.size > 0) {
                newHostId = String(Array.from(wsRoom.players.keys())[0]);
                wsRoom.hostId = newHostId;
            }

            // Broadcast leave via WebSocket
            req.io.to(roomId).emit('waiting-room-player-left-http', {
                roomId,
                playerId: userId,
                playerName: req.user.username,
                players: Array.from(wsRoom.players.values()),
                newHostId,
                playerCount: wsRoom.players.size,
                source: 'http_fallback',
                timestamp: new Date().toISOString()
            });

            // Clean up empty rooms
            if (wsRoom.players.size === 0) {
                req.io.socketManager.gameRooms.delete(roomId);
            }
        }

        res.json({
            success: true,
            message: 'Left waiting room successfully'
        });
    } catch (error) {
        console.error('[WaitingRoom API] Error leaving room:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to leave room'
        });
    }
});

// Toggle ready status (HTTP fallback)
router.post('/:roomId/ready', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const { isReady } = req.body;
        const userId = req.user.id;
        const username = req.user.username;

        if (typeof isReady !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Ready status must be a boolean'
            });
        }

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user is in room
        if (!room.players.some(p => p.id === userId)) {
            return res.status(403).json({
                success: false,
                message: 'You are not in this room'
            });
        }

        // Update ready status in database
        await room.setPlayerReady(userId, isReady);

        // Update WebSocket room if available
        let wsUpdateSuccess = false;
        if (req.io && req.io.socketManager && req.io.socketManager.gameRooms.has(roomId)) {
            const wsRoom = req.io.socketManager.gameRooms.get(roomId);
            if (wsRoom.players.has(userId)) {
                const wsPlayer = wsRoom.players.get(userId);
                wsPlayer.isReady = isReady;
                wsPlayer.lastReadyUpdate = new Date().toISOString();
                wsUpdateSuccess = true;

                // Calculate game start eligibility
                const players = Array.from(wsRoom.players.values());
                const connectedPlayers = players.filter(p => p.isConnected);
                const readyPlayers = connectedPlayers.filter(p => p.isReady);
                const canStartGame = connectedPlayers.length >= 2 && 
                    readyPlayers.length === connectedPlayers.length;

                // Broadcast ready status change via WebSocket
                req.io.to(roomId).emit('waiting-room-ready-changed-http', {
                    roomId,
                    playerId: userId,
                    playerName: username,
                    isReady,
                    players: players.map(p => ({
                        userId: p.userId,
                        username: p.username,
                        isReady: p.isReady,
                        teamAssignment: p.teamAssignment,
                        isConnected: p.isConnected
                    })),
                    readyCount: readyPlayers.length,
                    totalPlayers: wsRoom.players.size,
                    connectedPlayers: connectedPlayers.length,
                    canStartGame,
                    source: 'http_fallback',
                    timestamp: new Date().toISOString()
                });
            }
        }

        res.json({
            success: true,
            message: `Ready status updated to ${isReady}`,
            room: room.toApiResponse(),
            wsUpdateSuccess
        });
    } catch (error) {
        console.error('[WaitingRoom API] Error updating ready status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update ready status'
        });
    }
});

// Start game (HTTP fallback)
router.post('/:roomId/start', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        const username = req.user.username;

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user is the host
        if (String(room.owner_id) !== String(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Only the host can start the game'
            });
        }

        // Check if game can be started
        if (!room.canStartGame()) {
            return res.status(400).json({
                success: false,
                message: 'All connected players must be ready to start the game'
            });
        }

        // Form teams if we have 4 players
        let teams = null;
        if (room.players.length === 4) {
            const hasTeamAssignments = room.players.every(p => p.teamAssignment !== null);
            if (!hasTeamAssignments) {
                teams = await room.formTeams();
            } else {
                teams = room.getTeams();
            }
        }

        // Update room status
        await room.updateStatus('playing');

        // Update WebSocket room if available
        if (req.io && req.io.socketManager && req.io.socketManager.gameRooms.has(roomId)) {
            const wsRoom = req.io.socketManager.gameRooms.get(roomId);
            wsRoom.status = 'starting';

            // Update team assignments in WebSocket state if teams were formed
            if (teams) {
                wsRoom.teams.team1 = teams.team1.map(p => p.id);
                wsRoom.teams.team2 = teams.team2.map(p => p.id);

                for (const player of teams.team1) {
                    if (wsRoom.players.has(player.id)) {
                        wsRoom.players.get(player.id).teamAssignment = 1;
                    }
                }
                for (const player of teams.team2) {
                    if (wsRoom.players.has(player.id)) {
                        wsRoom.players.get(player.id).teamAssignment = 2;
                    }
                }
            }

            // Broadcast game start via WebSocket
            req.io.to(roomId).emit('waiting-room-game-starting-http', {
                roomId,
                startedBy: userId,
                startedByName: username,
                players: Array.from(wsRoom.players.values()),
                teams,
                redirectUrl: `/game.html?roomId=${roomId}`,
                source: 'http_fallback',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: 'Game is starting!',
            room: room.toApiResponse(),
            teams,
            redirectUrl: `/game.html?roomId=${roomId}`
        });
    } catch (error) {
        console.error('[WaitingRoom API] Error starting game:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to start game'
        });
    }
});

export default router;