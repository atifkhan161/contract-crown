import express from 'express';
import Room from '../models/Room.js';
import Game from '../models/Game.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Waiting Room HTTP API Endpoints
 * Provides HTTP fallback for WebSocket waiting room functionality
 */

// Get waiting room data
router.get('/:roomId', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.user_id;

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
router.post('/:roomId/join', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.user_id;
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
router.post('/:roomId/leave', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.user_id;

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        const wasHost = String(room.owner_id) === String(userId);
        
        // Remove player from room
        await room.removePlayer(userId);

        // Update WebSocket room if available
        let hostTransferred = false;
        let newHostId = null;
        
        if (req.io && req.io.socketManager && req.io.socketManager.gameRooms.has(roomId)) {
            const wsRoom = req.io.socketManager.gameRooms.get(roomId);
            wsRoom.players.delete(userId);

            // Remove from teams
            wsRoom.teams.team1 = wsRoom.teams.team1.filter(id => id !== userId);
            wsRoom.teams.team2 = wsRoom.teams.team2.filter(id => id !== userId);

            // Enhanced host transfer logic
            if (String(wsRoom.hostId) === String(userId) && wsRoom.players.size > 0) {
                // Prioritize connected players for host transfer
                const connectedPlayers = Array.from(wsRoom.players.values()).filter(p => p.isConnected);
                const readyPlayers = connectedPlayers.filter(p => p.isReady);
                
                // Prefer ready players, then connected players, then any player
                let newHost = null;
                if (readyPlayers.length > 0) {
                    newHost = readyPlayers[0];
                } else if (connectedPlayers.length > 0) {
                    newHost = connectedPlayers[0];
                } else {
                    newHost = Array.from(wsRoom.players.values())[0];
                }
                
                if (newHost) {
                    newHostId = String(newHost.userId);
                    wsRoom.hostId = newHostId;
                    hostTransferred = true;
                }
            }

            // Broadcast leave via WebSocket with enhanced data
            req.io.to(roomId).emit('waiting-room-player-left-http', {
                roomId,
                playerId: userId,
                playerName: req.user.username,
                players: Array.from(wsRoom.players.values()),
                newHostId,
                playerCount: wsRoom.players.size,
                wasHost,
                hostTransferred,
                source: 'http_fallback',
                timestamp: new Date().toISOString()
            });

            // Send host transfer notification if applicable
            if (hostTransferred && newHostId) {
                const newHost = wsRoom.players.get(newHostId);
                if (newHost) {
                    req.io.to(roomId).emit('waiting-room-host-transferred-http', {
                        roomId,
                        previousHostId: userId,
                        previousHostName: req.user.username,
                        newHostId,
                        newHostName: newHost.username,
                        reason: 'previous_host_left',
                        source: 'http_fallback',
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Clean up empty rooms
            if (wsRoom.players.size === 0) {
                req.io.socketManager.gameRooms.delete(roomId);
                console.log(`[WaitingRoom API] Cleaned up empty WebSocket room: ${roomId}`);
            }
        }

        res.json({
            success: true,
            message: 'Left waiting room successfully',
            wasHost,
            hostTransferred,
            newHostId,
            remainingPlayers: room.players.length
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
router.post('/:roomId/ready', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const { isReady } = req.body;
        const userId = req.user.user_id;
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
router.post('/:roomId/start', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.user_id;
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

        // Create game with team formation and database entries
        let game = null;
        let teams = null;
        
        try {
            // Create game (this will form teams and create database entries)
            game = await room.createGame();
            teams = {
                team1: game.teams.find(t => t.team_number === 1)?.players || [],
                team2: game.teams.find(t => t.team_number === 2)?.players || []
            };
            
            console.log(`[WaitingRoom API] Game ${game.game_code} created successfully from room ${roomId}`);
        } catch (gameError) {
            console.error('[WaitingRoom API] Game creation failed, falling back to room-only start:', gameError);
            
            // Fallback: just form teams and update room status
            const connectedPlayers = room.players.filter(p => p.isConnected !== false);
            if (connectedPlayers.length >= 2 && !room.areTeamsFormed()) {
                teams = await room.formTeams();
            } else {
                teams = room.getTeams();
            }
            
            // Update room status
            await room.updateStatus('playing');
        }

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
            const gameInfo = game ? {
                gameId: game.game_id,
                gameCode: game.game_code,
                status: game.status,
                targetScore: game.target_score
            } : null;

            const redirectUrl = game ? `/game.html?gameId=${game.game_id}` : `/game.html?room=${roomId}`;

            req.io.to(roomId).emit('waiting-room-game-starting-http', {
                roomId,
                startedBy: userId,
                startedByName: username,
                players: Array.from(wsRoom.players.values()),
                teams,
                game: gameInfo,
                redirectUrl,
                source: 'http_fallback',
                timestamp: new Date().toISOString()
            });

            // Send navigation commands after a delay
            setTimeout(() => {
                req.io.to(roomId).emit('navigate-to-game', {
                    roomId,
                    redirectUrl,
                    source: 'http_fallback',
                    timestamp: new Date().toISOString()
                });
            }, 1500);
        }

        // Prepare response
        const redirectUrl = game ? `/game.html?gameId=${game.game_id}` : `/game.html?room=${roomId}`;
        
        res.json({
            success: true,
            message: 'Game is starting!',
            room: room.toApiResponse(),
            game: game ? game.toApiResponse() : null,
            teams,
            redirectUrl
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
