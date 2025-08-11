import express from 'express';
import Room from '../models/Room.js';
import auth from '../middlewares/auth.js';

const router = express.Router();

// Get all available rooms
router.get('/', auth, async (req, res) => {
    try {
        const rooms = await Room.findAll(['waiting', 'playing']);

        res.json({
            success: true,
            rooms: rooms.map(room => room.toApiResponse())
        });
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch rooms'
        });
    }
});

// Create a new room
router.post('/', auth, async (req, res) => {
    try {
        const { name, maxPlayers, isPrivate } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!Room.validateName(name)) {
            return res.status(400).json({
                success: false,
                message: 'Room name is required and must be 50 characters or less'
            });
        }

        if (!Room.validateMaxPlayers(maxPlayers)) {
            return res.status(400).json({
                success: false,
                message: 'Max players must be between 2 and 6'
            });
        }

        // Check if user already has an active room
        const existingRoom = await Room.findUserActiveRoom(userId);
        if (existingRoom) {
            return res.status(400).json({
                success: false,
                message: 'You already have an active room'
            });
        }

        // Create new room
        const room = await Room.create({
            name,
            maxPlayers,
            isPrivate,
            ownerId: userId
        });

        // Emit room created event to all clients
        console.log('[Rooms API] Emitting roomCreated event:', room.toApiResponse());
        req.io.emit('roomCreated', room.toApiResponse());
        
        // Also emit updated rooms list
        const allRooms = await Room.findAll(['waiting', 'playing']);
        console.log('[Rooms API] Emitting roomsUpdated event with', allRooms.length, 'rooms');
        req.io.emit('roomsUpdated', allRooms.map(r => r.toApiResponse()));

        res.status(201).json({
            success: true,
            message: 'Room created successfully',
            room: room.toApiResponse()
        });
    } catch (error) {
        console.error('Error creating room:', error);
        
        // Provide more specific error messages
        let errorMessage = 'Failed to create room';
        let statusCode = 500;
        
        if (error.message.includes('unique room code')) {
            errorMessage = 'Unable to generate a unique room code. Please try again.';
            statusCode = 503; // Service Temporarily Unavailable
        } else if (error.message.includes('room_code') || error.message.includes('column')) {
            errorMessage = 'Database schema issue. Please contact support.';
            statusCode = 503;
        } else if (error.message.includes('Room name')) {
            errorMessage = error.message;
            statusCode = 400;
        } else if (error.message.includes('Max players')) {
            errorMessage = error.message;
            statusCode = 400;
        } else if (error.message.includes('Owner ID')) {
            errorMessage = 'Authentication error. Please log in again.';
            statusCode = 401;
        }
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Join a room by code
router.post('/join-by-code', auth, async (req, res) => {
    try {
        const { roomCode } = req.body;
        const userId = req.user.id;

        if (!roomCode || roomCode.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Room code is required'
            });
        }

        const code = roomCode.trim().toUpperCase();
        const room = await Room.findByCode(code);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found. Please check the code and try again.'
            });
        }

        // Check if user is already in another room
        const existingRoom = await Room.findUserActiveRoom(userId);
        if (existingRoom && existingRoom.room_id !== room.room_id) {
            return res.status(400).json({
                success: false,
                message: 'You are already in another room'
            });
        }

        // Check if user is already in this room - if so, just return success
        const isAlreadyInRoom = room.players.some(p => p.id === userId);
        
        if (isAlreadyInRoom) {
            // User is already in this room, just redirect them back
            return res.json({
                success: true,
                message: 'Rejoined room successfully',
                roomId: room.room_id,
                room: room.toApiResponse(),
                rejoined: true
            });
        }

        // Add user to room (this will validate if user can join)
        await room.addPlayer(userId);

        // Emit player joined event
        req.io.to(`room_${room.room_id}`).emit('playerJoined', {
            roomId: room.room_id,
            player: {
                id: userId,
                username: req.user.username
            },
            players: room.players
        });

        // Emit rooms updated event to all clients
        const allRooms = await Room.findAll(['waiting', 'playing']);
        req.io.emit('roomsUpdated', allRooms.map(r => r.toApiResponse()));

        res.json({
            success: true,
            message: 'Joined room successfully',
            roomId: room.room_id,
            room: room.toApiResponse()
        });
    } catch (error) {
        console.error('Error joining room by code:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to join room'
        });
    }
});

// Join a room
router.post('/:roomId/join', auth, async (req, res) => {
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

        // Check if user is already in another room
        const existingRoom = await Room.findUserActiveRoom(userId);
        if (existingRoom && existingRoom.room_id !== roomId) {
            return res.status(400).json({
                success: false,
                message: 'You are already in another room'
            });
        }

        // Check if user is already in this room - if so, just return success
        const isAlreadyInRoom = room.players.some(p => p.id === userId);
        
        if (isAlreadyInRoom) {
            // User is already in this room, just redirect them back
            return res.json({
                success: true,
                message: 'Rejoined room successfully',
                roomId: room.room_id,
                room: room.toApiResponse(),
                rejoined: true
            });
        }

        // Add user to room (this will validate if user can join)
        await room.addPlayer(userId);

        // Emit player joined event
        req.io.to(`room_${roomId}`).emit('playerJoined', {
            roomId: room.room_id,
            player: {
                id: userId,
                username: req.user.username
            },
            players: room.players
        });

        // Emit rooms updated event to all clients
        const allRooms = await Room.findAll(['waiting', 'playing']);
        req.io.emit('roomsUpdated', allRooms.map(r => r.toApiResponse()));

        res.json({
            success: true,
            message: 'Joined room successfully',
            roomId: room.room_id,
            room: room.toApiResponse()
        });
    } catch (error) {
        console.error('Error joining room:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to join room'
        });
    }
});

// Leave a room
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

        // Remove user from room (this handles owner reassignment)
        await room.removePlayer(userId);

        // If no players left, delete the room
        if (room.players.length === 0) {
            await room.delete();
            
            // Emit room deleted event
            req.io.emit('roomDeleted', { roomId });
        } else {
            // Emit player left event
            req.io.to(`room_${roomId}`).emit('playerLeft', {
                roomId: room.room_id,
                playerId: userId,
                players: room.players,
                newOwner: room.owner_id
            });
        }

        // Emit rooms updated event to all clients
        const allRooms = await Room.findAll(['waiting', 'playing']);
        req.io.emit('roomsUpdated', allRooms.map(r => r.toApiResponse()));

        res.json({
            success: true,
            message: 'Left room successfully'
        });
    } catch (error) {
        console.error('Error leaving room:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to leave room'
        });
    }
});

// Delete a room (owner only)
router.delete('/:roomId', auth, async (req, res) => {
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

        // Check if user is the room owner
        if (room.owner_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only room owner can delete the room'
            });
        }

        // Delete the room
        await room.delete();

        // Emit room deleted event
        req.io.emit('roomDeleted', { roomId });

        // Emit rooms updated event to all clients
        const allRooms = await Room.findAll(['waiting', 'playing']);
        req.io.emit('roomsUpdated', allRooms.map(r => r.toApiResponse()));

        res.json({
            success: true,
            message: 'Room deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting room:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete room'
        });
    }
});

// Get room details
router.get('/:roomId', auth, async (req, res) => {
    try {
        const { roomId } = req.params;

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        res.json({
            success: true,
            room: room.toApiResponse()
        });
    } catch (error) {
        console.error('Error fetching room details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch room details'
        });
    }
});

// Set player ready status
router.post('/:roomId/ready', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const { isReady } = req.body;
        const userId = req.user.id;

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

        // Update ready status
        await room.setPlayerReady(userId, !!isReady);

        // Also update WebSocket room data if it exists
        let wsUpdateSuccess = false;
        if (req.socketManager) {
            const wsRoom = req.socketManager.gameRooms.get(roomId);
            if (wsRoom && wsRoom.players.has(userId)) {
                const wsPlayer = wsRoom.players.get(userId);
                wsPlayer.isReady = !!isReady;
                wsPlayer.lastReadyUpdate = new Date().toISOString();
                wsUpdateSuccess = true;
                console.log(`[HTTP API] Updated WebSocket room data for ${wsPlayer.username}: ready=${!!isReady}`);
                
                // Calculate enhanced game start validation
                const players = Array.from(wsRoom.players.values());
                const connectedPlayers = players.filter(p => p.isConnected);
                const readyCount = connectedPlayers.filter(p => p.isReady).length;
                const allConnectedReady = connectedPlayers.every(p => p.isReady) && connectedPlayers.length >= 2;
                
                let canStartGame = false;
                let gameStartReason = '';
                
                if (connectedPlayers.length < 2) {
                    gameStartReason = 'Need at least 2 connected players';
                } else if (!allConnectedReady) {
                    gameStartReason = `${readyCount}/${connectedPlayers.length} players ready`;
                } else if (connectedPlayers.length === 4) {
                    const hasTeamAssignments = connectedPlayers.every(p => p.teamAssignment !== null);
                    if (!hasTeamAssignments) {
                        gameStartReason = 'Teams must be formed for 4-player games';
                    } else {
                        canStartGame = true;
                        gameStartReason = 'Ready to start!';
                    }
                } else {
                    canStartGame = true;
                    gameStartReason = 'Ready to start!';
                }

                // Emit enhanced ready status update to all players in room
                try {
                    req.io.to(roomId).emit('player-ready-changed', {
                        gameId: roomId,
                        playerId: userId,
                        playerName: wsPlayer.username,
                        isReady: !!isReady,
                        players: players.map(p => ({
                            userId: p.userId,
                            username: p.username,
                            isReady: p.isReady,
                            teamAssignment: p.teamAssignment,
                            isConnected: p.isConnected
                        })),
                        readyCount,
                        totalPlayers: wsRoom.players.size,
                        connectedPlayers: connectedPlayers.length,
                        allReady: allConnectedReady,
                        canStartGame,
                        gameStartReason,
                        source: 'http_api',
                        dbSynced: true,
                        timestamp: new Date().toISOString()
                    });
                } catch (emitError) {
                    console.error(`[HTTP API] Failed to emit ready status change:`, emitError);
                    wsUpdateSuccess = false;
                }
            }
        }

        // Fallback to legacy emit if websocket room not found
        if (!wsUpdateSuccess) {
            req.io.to(`room_${roomId}`).emit('playerReadyStatusChanged', {
                roomId: room.room_id,
                playerId: userId,
                isReady: !!isReady,
                players: room.players,
                canStartGame: room.canStartGame(),
                source: 'http_api_legacy',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: `Ready status updated to ${!!isReady}`,
            room: room.toApiResponse(),
            wsUpdateSuccess,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error updating ready status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update ready status'
        });
    }
});

// Form teams (host only)
router.post('/:roomId/form-teams', auth, async (req, res) => {
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

        // Check if user is the room owner
        if (room.owner_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the room host can form teams'
            });
        }

        // Form teams
        const teams = await room.formTeams();

        // Sync with websocket state if websocket room exists
        const wsRoom = req.io.sockets.adapter.rooms.get(`room_${roomId}`);
        if (wsRoom && req.io.socketManager && req.io.socketManager.gameRooms) {
            const gameRoom = req.io.socketManager.gameRooms.get(roomId);
            if (gameRoom) {
                // Update websocket room teams structure
                gameRoom.teams.team1 = teams.team1.map(p => p.id);
                gameRoom.teams.team2 = teams.team2.map(p => p.id);
                
                // Update player team assignments in websocket state
                for (const player of room.players) {
                    const wsPlayer = gameRoom.players.get(player.id);
                    if (wsPlayer) {
                        wsPlayer.teamAssignment = player.teamAssignment;
                    }
                }
                
                console.log(`[HTTP API] Synced team formation with websocket state for room ${roomId}`);
            }
        }

        // Emit team formation update to all players in room with both event names
        const teamFormationData = {
            roomId: room.room_id,
            gameId: roomId,
            teams: teams,
            players: room.players,
            formedBy: req.user.username || 'Host',
            timestamp: new Date().toISOString()
        };
        
        req.io.to(`room_${roomId}`).emit('teamsFormed', teamFormationData);
        req.io.to(`room_${roomId}`).emit('teams-formed', teamFormationData);

        res.json({
            success: true,
            message: 'Teams formed successfully',
            teams: teams,
            room: room.toApiResponse()
        });
    } catch (error) {
        console.error('Error forming teams:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to form teams'
        });
    }
});

// Start game (host only)
router.post('/:roomId/start', auth, async (req, res) => {
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

        // Check if user is the room owner
        if (room.owner_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the room host can start the game'
            });
        }

        // Check if game can be started
        if (!room.canStartGame()) {
            return res.status(400).json({
                success: false,
                message: 'All connected players must be ready to start the game'
            });
        }

        // Update room status to playing
        await room.updateStatus('playing');

        // Emit game starting event to all players in room
        req.io.to(`room_${roomId}`).emit('gameStarting', {
            roomId: room.room_id,
            message: 'Game is starting!',
            teams: room.getTeams()
        });

        res.json({
            success: true,
            message: 'Game started successfully',
            room: room.toApiResponse()
        });
    } catch (error) {
        console.error('Error starting game:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to start game'
        });
    }
});

// Reset room to waiting status (for returning to waiting room after game)
router.post('/:roomId/reset-to-waiting', async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Find room
        const room = await Room.findById(roomId);
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user is the room owner
        if (room.owner_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the room owner can reset the room to waiting status'
            });
        }

        // Reset room status to waiting and clear ready states
        await room.updateStatus('waiting');
        await room.resetAllPlayerReadyStatus();

        // Emit room status update to all players
        req.io.to(`room_${roomId}`).emit('roomStatusChanged', {
            roomId: room.room_id,
            status: 'waiting',
            message: 'Room has been reset to waiting status'
        });

        res.json({
            success: true,
            message: 'Room reset to waiting status successfully',
            room: room.toApiResponse()
        });
    } catch (error) {
        console.error('Error resetting room to waiting:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to reset room to waiting status'
        });
    }
});

export default router;